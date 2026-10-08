import type { Cargo, Container, PlacedCargo } from '../types'

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }

type Orientation = { l: number; w: number; r: 0 | 90 }
type Point = { x: number; y: number; z: number }
type PlacedState = { p: PlacedCargo; l: number; w: number; depth: number }
type Candidate = { p: PlacedCargo; score: number; depth: number; supports: PlacedState[] }

const EPS = 0.5
const SUPPORT_RATIO = 0.985

const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Packing cancelled', 'AbortError')
}

const yieldBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })

function dimensions(p: Pick<PlacedCargo, 'length' | 'width' | 'rotation'>) {
  return Math.abs(Math.round(p.rotation / 90)) % 2 === 1
    ? { l: p.width, w: p.length }
    : { l: p.length, w: p.width }
}

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { l: c.length, w: c.width, r: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) <= EPS) return [a]
  return [a, { l: c.width, w: c.length, r: 90 }]
}

function makePlaced(c: Cargo, o: Orientation, x: number, y: number, z: number, seq: number): PlacedCargo {
  return {
    id: 'pack-' + c.id + '-' + seq,
    cargoId: c.id,
    cargoType: c.type,
    x, y, z,
    length: c.length,
    width: c.width,
    height: c.height,
    weight: c.weight,
    color: c.color,
    rotation: o.r,
    placementMode: 'automatic',
    locked: false,
  }
}

function inside(p: PlacedCargo, c: Container) {
  const d = dimensions(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS &&
    p.x + d.l <= c.length + EPS &&
    p.y + d.w <= c.width + EPS &&
    p.z + p.height <= c.height + EPS
}

function overlap3d(a: PlacedCargo, b: PlacedCargo) {
  const A = dimensions(a)
  const B = dimensions(b)
  return a.x < b.x + B.l - EPS && a.x + A.l > b.x + EPS &&
    a.y < b.y + B.w - EPS && a.y + A.w > b.y + EPS &&
    a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}

function overlapArea(x: number, y: number, l: number, w: number, p: PlacedState) {
  const x1 = Math.max(x, p.p.x)
  const x2 = Math.min(x + l, p.p.x + p.l)
  const y1 = Math.max(y, p.p.y)
  const y2 = Math.min(y + w, p.p.y + p.w)
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
}

function unionSupportArea(x: number, y: number, l: number, w: number, supports: PlacedState[]) {
  if (!supports.length) return 0

  const rects = supports
    .map((s) => ({
      x1: Math.max(x, s.p.x),
      x2: Math.min(x + l, s.p.x + s.l),
      y1: Math.max(y, s.p.y),
      y2: Math.min(y + w, s.p.y + s.w),
    }))
    .filter((r) => r.x2 > r.x1 + EPS && r.y2 > r.y1 + EPS)

  if (!rects.length) return 0

  const xs = [...new Set(rects.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b)
  let area = 0

  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i]
    const x2 = xs[i + 1]
    if (x2 - x1 <= EPS) continue

    const intervals = rects
      .filter((r) => r.x1 < x2 - EPS && r.x2 > x1 + EPS)
      .map((r) => [r.y1, r.y2] as [number, number])
      .sort((a, b) => a[0] - b[0])

    let cursor = y
    for (const [y1, y2] of intervals) {
      if (y1 > cursor + EPS) break
      if (y2 > cursor) cursor = y2
      if (cursor >= y + w - EPS) break
    }

    area += (x2 - x1) * Math.max(0, Math.min(y + w, cursor) - y)
  }

  return area
}

function candidateSupports(
  c: Cargo,
  o: Orientation,
  x: number,
  y: number,
  z: number,
  placed: PlacedState[],
  cargoById: Map<string, Cargo>,
  loadOnTop: Map<string, number>,
) {
  if (z <= EPS) {
    return { ok: true, supportRatio: 1, depth: 1, supports: [] as PlacedState[] }
  }

  // Non-stackable cargo and pallets are floor-only.
  if (!c.stackable || c.type === 'pallet') {
    return { ok: false, supportRatio: 0, depth: 0, supports: [] as PlacedState[] }
  }

  const supports = placed.filter((s) => {
    const sc = cargoById.get(s.p.cargoId)
    if (!sc?.loadBearing) return false
    if (Math.abs(s.p.z + s.p.height - z) > EPS) return false
    return overlapArea(x, y, o.l, o.w, s) > EPS
  })

  const supportArea = unionSupportArea(x, y, o.l, o.w, supports)
  const supportRatio = supportArea / Math.max(1, o.l * o.w)
  if (supportRatio < SUPPORT_RATIO) {
    return { ok: false, supportRatio, depth: 0, supports }
  }

  let depth = 1
  for (const s of supports) depth = Math.max(depth, s.depth + 1)

  if (c.maxStackLayers > 0 && depth > c.maxStackLayers) {
    return { ok: false, supportRatio, depth, supports }
  }

  for (const s of supports) {
    const sc = cargoById.get(s.p.cargoId)
    if (!sc) continue
    const limit = Number(sc.maxLoadOnTop) || 0
    if (limit <= 0) continue

    const area = overlapArea(x, y, o.l, o.w, s)
    const added = c.weight * (area / Math.max(1, o.l * o.w))
    const used = loadOnTop.get(s.p.id) || 0
    if (used + added > limit + EPS) {
      return { ok: false, supportRatio, depth, supports }
    }
  }

  return { ok: true, supportRatio, depth, supports }
}

function pointKey(p: Point) {
  return Math.round(p.x) + '|' + Math.round(p.y) + '|' + Math.round(p.z)
}

function extremePoints(placed: PlacedState[], container: Container, z: number) {
  const points: Point[] = [{ x: 0, y: 0, z }]
  const seen = new Set<string>([pointKey(points[0])])

  const add = (x: number, y: number) => {
    if (x < -EPS || y < -EPS || x > container.length + EPS || y > container.width + EPS) return
    const p = { x, y, z }
    const key = pointKey(p)
    if (seen.has(key)) return
    seen.add(key)
    points.push(p)
  }

  // Linear extreme-point set: each placed footprint contributes its right,
  // upper, and upper-right corners on the current support plane. This avoids
  // the quadratic X-edge × Y-edge explosion of the previous implementation.
  for (const s of placed) {
    if (Math.abs(s.p.z - z) > EPS && Math.abs(s.p.z + s.p.height - z) > EPS) continue
    add(s.p.x + s.l, s.p.y)
    add(s.p.x, s.p.y + s.w)
    add(s.p.x + s.l, s.p.y + s.w)
  }

  return points
}
function zLevels(placed: PlacedState[], c: Cargo, container: Container) {
  const levels = [0]
  if (!c.stackable || c.type === 'pallet') return levels

  for (const s of placed) {
    const top = s.p.z + s.p.height
    if (top < container.height - EPS) levels.push(top)
  }

  return [...new Set(levels.map((z) => Math.round(z * 10) / 10))].sort((a, b) => a - b)
}

function sideContact(a: PlacedCargo, placed: PlacedState[]) {
  const A = dimensions(a)
  let contact = 0

  for (const q of placed) {
    if (Math.abs(q.p.z - a.z) > EPS) continue

    const xTouch =
      Math.abs(a.x + A.l - q.p.x) <= EPS ||
      Math.abs(q.p.x + q.l - a.x) <= EPS
    const yTouch =
      Math.abs(a.y + A.w - q.p.y) <= EPS ||
      Math.abs(q.p.y + q.w - a.y) <= EPS

    if (xTouch) contact += Math.min(A.w, q.w)
    if (yTouch) contact += Math.min(A.l, q.l)
  }

  return contact
}

function scoreCandidate(
  p: PlacedCargo,
  supportRatio: number,
  placed: PlacedState[],
  container: Container,
  totalWeight: number,
  totalXWeight: number,
  totalYWeight: number,
) {
  const d = dimensions(p)
  const cx = p.x + d.l / 2
  const cy = p.y + d.w / 2
  const nextWeight = totalWeight + p.weight
  const nextCx = (totalXWeight + p.weight * cx) / Math.max(1, nextWeight)
  const nextCy = (totalYWeight + p.weight * cy) / Math.max(1, nextWeight)
  const centerPenalty = Math.hypot(
    nextCx - container.length / 2,
    nextCy - container.width / 2,
  )

  const wallContact =
    (p.x <= EPS ? d.w : 0) +
    (p.y <= EPS ? d.l : 0) +
    (p.x + d.l >= container.length - EPS ? d.w : 0) +
    (p.y + d.w >= container.width - EPS ? d.l : 0)

  const contact = sideContact(p, placed)

  return (
    (1 - supportRatio) * 120000 +
    p.z * 0.12 +
    centerPenalty * 0.02 -
    wallContact * 0.04 -
    contact * 0.015
  )
}

function buildUnits(cargo: Cargo[], mode: number) {
  const units: Array<{ cargo: Cargo; ordinal: number }> = []

  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i += 1) {
      units.push({ cargo: c, ordinal: i })
    }
  }

  const value = (u: { cargo: Cargo; ordinal: number }) => {
    const c = u.cargo
    const volume = c.length * c.width * c.height
    const footprint = c.length * c.width

    if (mode === 0) return volume * 10 + c.weight * 2
    if (mode === 1) return footprint * 10 + c.height * 1000
    if (mode === 2) return c.height * 100000 + footprint
    if (mode === 3) return c.weight * 10000 + volume
    return (c.stackable ? 0 : 1e12) + volume
  }

  return units.sort((a, b) => value(b) - value(a))
}

function prepareLocked(locked: PlacedCargo[], container: Container) {
  return locked
    .filter((p) => inside(p, container))
    .map((p) => {
      const d = dimensions(p)
      return { p: { ...p }, l: d.l, w: d.w, depth: 1 }
    })
}

async function runAttempt(
  units: Array<{ cargo: Cargo; ordinal: number }>,
  cargoById: Map<string, Cargo>,
  container: Container,
  locked: PlacedCargo[],
  progress?: Progress,
  options: Options = {},
) {
  const result = locked.filter((p) => inside(p, container)).map((p) => ({ ...p }))
  const placed = prepareLocked(result, container)
  const loadOnTop = new Map<string, number>()

  let totalWeight = result.reduce((sum, p) => sum + p.weight, 0)
  let totalXWeight = result.reduce((sum, p) => sum + p.weight * (p.x + dimensions(p).l / 2), 0)
  let totalYWeight = result.reduce((sum, p) => sum + p.weight * (p.y + dimensions(p).w / 2), 0)
  let placedAuto = 0
  let sequence = 0

  for (let i = 0; i < units.length; i += 1) {
    abort(options.signal)
    const c = units[i]

    if (container.maxPayload > 0 && totalWeight + c.weight > container.maxPayload + EPS) continue

    let best: Candidate | undefined
    const levels = zLevels(placed, c, container)

    for (const z of levels) {
      abort(options.signal)

      const points = extremePoints(placed, container, z)

      for (const point of points) {
        for (const o of orientations(c)) {
          const x = point.x
          const y = point.y

          if (
            x < -EPS ||
            y < -EPS ||
            x + o.l > container.length + EPS ||
            y + o.w > container.width + EPS ||
            z + c.height > container.height + EPS
          ) continue

          const p = makePlaced(c, o, x, y, z, sequence + 1)
          if (!inside(p, container)) continue
          if (placed.some((q) => overlap3d(p, q.p))) continue

          const support = candidateSupports(
            c,
            o,
            x,
            y,
            z,
            placed,
            cargoById,
            loadOnTop,
          )
          if (!support.ok) continue

          const score = scoreCandidate(
            p,
            support.supportRatio,
            placed,
            container,
            totalWeight,
            totalXWeight,
            totalYWeight,
          )

          if (!best || score < best.score) {
            best = { p, score, depth: support.depth, supports: support.supports }
          }
        }
      }

      // Floor positions are preferred; stacking is only used when necessary.
      if (best && z <= EPS) break
    }

    if (!best) continue

    sequence += 1
    best.p.id = 'pack-' + best.p.cargoId + '-' + sequence
    result.push(best.p)

    placed.push({
      p: best.p,
      l: dimensions(best.p).l,
      w: dimensions(best.p).w,
      depth: best.depth,
    })

    for (const s of best.supports) {
      const area = overlapArea(
        best.p.x,
        best.p.y,
        dimensions(best.p).l,
        dimensions(best.p).w,
        s,
      )
      if (area > EPS) {
        const ratio = area / Math.max(
          1,
          dimensions(best.p).l * dimensions(best.p).w,
        )
        loadOnTop.set(
          s.p.id,
          (loadOnTop.get(s.p.id) || 0) + best.p.weight * ratio,
        )
      }
    }

    totalWeight += best.p.weight
    const bd = dimensions(best.p)
    totalXWeight += best.p.weight * (best.p.x + bd.l / 2)
    totalYWeight += best.p.weight * (best.p.y + bd.w / 2)
    placedAuto += 1

    progress?.(Math.round(((i + 1) / Math.max(1, units.length)) * 100))
    if ((i & 7) === 7) await yieldBrowser()
  }

  return { result, placedAuto }
}

function totalCargoVolume(cargo: Cargo[]) {
  return cargo.reduce(
    (sum, c) =>
      sum + Math.max(0, Math.floor(c.quantity)) * c.length * c.width * c.height,
    0,
  )
}

function resultVolume(result: PlacedCargo[]) {
  return result.reduce((sum, p) => sum + p.length * p.width * p.height, 0)
}

function centerCompletedLoad(result: PlacedCargo[], container: Container) {
  if (!result.length) return result

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const p of result) {
    const d = dimensions(p)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + d.l)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + d.w)
  }

  const dx = Math.round(((container.length - (maxX - minX)) / 2 - minX) / 10) * 10
  const dy = Math.round(((container.width - (maxY - minY)) / 2 - minY) / 10) * 10

  if (
    minX + dx < -EPS ||
    maxX + dx > container.length + EPS ||
    minY + dy < -EPS ||
    maxY + dy > container.width + EPS
  ) return result

  return result.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
}

function quality(result: PlacedCargo[], targetVolume: number, container: Container) {
  const volume = resultVolume(result)
  const weight = result.reduce((sum, p) => sum + p.weight, 0)
  const centerX = weight > 0
    ? result.reduce((sum, p) => sum + p.weight * (p.x + dimensions(p).l / 2), 0) / weight
    : container.length / 2
  const centerY = weight > 0
    ? result.reduce((sum, p) => sum + p.weight * (p.y + dimensions(p).w / 2), 0) / weight
    : container.width / 2
  const centerPenalty = Math.hypot(
    centerX - container.length / 2,
    centerY - container.width / 2,
  )

  return (
    result.length * 1e15 +
    (volume / Math.max(1, targetVolume)) * 1e9 -
    centerPenalty * 1000
  )
}

export async function smartPack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: Progress,
  options: Options = {},
) {
  const validCargo = cargo.filter(
    (c) =>
      c.quantity > 0 &&
      c.length > 0 &&
      c.width > 0 &&
      c.height > 0 &&
      c.weight >= 0,
  )

  const targetVolume = totalCargoVolume(validCargo)
  const cargoById = new Map(validCargo.map((c) => [c.id, c]))
  const modes = [0, 1, 2, 3, 4]
  let best: { result: PlacedCargo[]; placedAuto: number; score: number } | undefined

  for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
    abort(options.signal)

    const units = buildUnits(validCargo, modes[modeIndex])
    const attempt = await runAttempt(
      units,
      cargoById,
      container,
      locked,
      (p) => progress?.(Math.round((modeIndex * 100 + p) / modes.length)),
      options,
    )

    const score = quality(attempt.result, targetVolume, container)
    if (!best || score > best.score) {
      best = { ...attempt, score }
    }

    if (attempt.placedAuto === units.length) break
  }

  progress?.(100)

  if (!best) return locked.slice()

  const totalUnits = validCargo.reduce(
    (n, c) => n + Math.floor(c.quantity),
    0,
  )

  if (locked.length === 0 && best.placedAuto === totalUnits) {
    return centerCompletedLoad(best.result, container)
  }

  return best.result
}
