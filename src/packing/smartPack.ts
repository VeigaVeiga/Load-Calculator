import type { Cargo, Container, PlacedCargo } from '../types'

type Ori = { l: number; w: number; h: number; r: 0 | 90 }
type Point = { x: number; y: number; z: number }
type Candidate = { p: PlacedCargo; score: number }

const EPS = 0.5

function dims(p: PlacedCargo) {
  return p.rotation === 90 ? { l: p.width, w: p.length } : { l: p.length, w: p.width }
}

function oris(c: Cargo): Ori[] {
  const a: Ori = { l: c.length, w: c.width, h: c.height, r: 0 }
  if (c.rotatable && Math.abs(c.length - c.width) > EPS) {
    return [a, { l: c.width, w: c.length, h: c.height, r: 90 }]
  }
  return [a]
}

function make(c: Cargo, o: Ori, x: number, y: number, z: number, seq: number): PlacedCargo {
  return {
    id: `${c.id}-${seq}`,
    cargoId: c.id,
    cargoType: c.type,
    x,
    y,
    z,
    length: c.length,
    width: c.width,
    height: c.height,
    rotation: o.r,
    weight: c.weight,
    color: c.color,
    placementMode: 'automatic',
    locked: false,
  }
}

function inside(p: PlacedCargo, c: Container) {
  const d = dims(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS &&
    p.x + d.l <= c.length + EPS && p.y + d.w <= c.width + EPS && p.z + p.height <= c.height + EPS
}

function overlap3d(a: PlacedCargo, b: PlacedCargo) {
  const A = dims(a)
  const B = dims(b)
  return a.x < b.x + B.l - EPS && a.x + A.l > b.x + EPS &&
    a.y < b.y + B.w - EPS && a.y + A.w > b.y + EPS &&
    a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}

function overlapArea(a: { x: number; y: number; l: number; w: number }, b: PlacedCargo) {
  const d = dims(b)
  const x = Math.max(0, Math.min(a.x + a.l, b.x + d.l) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.w, b.y + d.w) - Math.max(a.y, b.y))
  return x * y
}

function coversRectangle(x: number, y: number, l: number, w: number, supports: PlacedCargo[]) {
  if (supports.length === 0) return false
  const xs = new Set<number>([x, x + l])
  for (const p of supports) {
    const d = dims(p)
    const x1 = Math.max(x, p.x)
    const x2 = Math.min(x + l, p.x + d.l)
    if (x2 > x1 + EPS) {
      xs.add(x1)
      xs.add(x2)
    }
  }
  const sortedX = [...xs].sort((a, b) => a - b)
  for (let i = 0; i < sortedX.length - 1; i++) {
    const xa = sortedX[i]
    const xb = sortedX[i + 1]
    if (xb - xa <= EPS) continue
    const xm = (xa + xb) / 2
    const intervals: Array<[number, number]> = []
    for (const p of supports) {
      const d = dims(p)
      if (xm > p.x + EPS && xm < p.x + d.l - EPS) {
        const ya = Math.max(y, p.y)
        const yb = Math.min(y + w, p.y + d.w)
        if (yb > ya + EPS) intervals.push([ya, yb])
      }
    }
    intervals.sort((a, b) => a[0] - b[0])
    let cursor = y
    for (const [ya, yb] of intervals) {
      if (ya > cursor + EPS) return false
      if (yb > cursor) cursor = yb
      if (cursor >= y + w - EPS) break
    }
    if (cursor < y + w - EPS) return false
  }
  return true
}

function supportInfo(
  c: Cargo,
  o: Ori,
  x: number,
  y: number,
  z: number,
  placed: PlacedCargo[],
  cargoById: Map<string, Cargo>,
) {
  if (z <= EPS) return { ok: true, depth: 0, supportArea: o.l * o.w }

  const supports = placed.filter(p => {
    const pc = cargoById.get(p.cargoId)
    if (!pc || !pc.stackable || !pc.loadBearing) return false
    return Math.abs(p.z + p.height - z) <= EPS && overlapArea({ x, y, l: o.l, w: o.w }, p) > EPS
  })
  if (!coversRectangle(x, y, o.l, o.w, supports)) return { ok: false, depth: 0, supportArea: 0 }

  const area = o.l * o.w
  let weightedDepth = 0
  let totalSupportedArea = 0
  for (const p of supports) {
    const pc = cargoById.get(p.cargoId)
    if (!pc) continue
    const a = overlapArea({ x, y, l: o.l, w: o.w }, p)
    totalSupportedArea += a
    const existingLoad = placed.reduce((sum, q) => {
      if (q.id === p.id || Math.abs(q.z - (p.z + p.height)) > EPS) return sum
      const qArea = overlapArea({ x: q.x, y: q.y, l: dims(q).l, w: dims(q).w }, p)
      return sum + (qArea > EPS ? q.weight * Math.min(1, qArea / Math.max(EPS, dims(q).l * dims(q).w)) : 0)
    }, 0)
    if (pc.maxLoadOnTop > 0 && existingLoad + c.weight * (a / area) > pc.maxLoadOnTop + EPS) {
      return { ok: false, depth: 0, supportArea: totalSupportedArea }
    }
    weightedDepth = Math.max(weightedDepth, 1)
  }
  const layerLimit = c.maxStackLayers || 0
  if (layerLimit > 0 && weightedDepth + 1 > layerLimit) return { ok: false, depth: weightedDepth + 1, supportArea: totalSupportedArea }
  return { ok: true, depth: weightedDepth + 1, supportArea: totalSupportedArea }
}

function points(placed: PlacedCargo[], container: Container): Point[] {
  const out: Point[] = [{ x: 0, y: 0, z: 0 }]
  const add = (x: number, y: number, z: number) => {
    if (x >= -EPS && y >= -EPS && z >= -EPS && x <= container.length + EPS && y <= container.width + EPS && z <= container.height + EPS) {
      out.push({ x, y, z })
    }
  }
  for (const p of placed) {
    const d = dims(p)
    const top = p.z + p.height
    // Bottom-layer extreme points.
    if (p.z <= EPS) {
      add(p.x + d.l, p.y, 0)
      add(p.x, p.y + d.w, 0)
      add(p.x + d.l, p.y + d.w, 0)
    }
    // Top-layer extreme points. These are only candidates; supportInfo below
    // decides whether the complete footprint is physically supported.
    add(p.x, p.y, top)
    add(p.x + d.l, p.y, top)
    add(p.x, p.y + d.w, top)
    add(p.x + d.l, p.y + d.w, top)
  }
  return out
}

function candidateAnchors(p: Point, o: Ori, container: Container): Point[] {
  const xs = [p.x, p.x - o.l]
  const ys = [p.y, p.y - o.w]
  const out: Point[] = []
  for (const x of xs) for (const y of ys) out.push({ x, y, z: p.z })
  // Always allow the four container walls at every reachable support level.
  out.push(
    { x: 0, y: 0, z: p.z },
    { x: container.length - o.l, y: 0, z: p.z },
    { x: 0, y: container.width - o.w, z: p.z },
    { x: container.length - o.l, y: container.width - o.w, z: p.z },
  )
  return out
}

function dedupePoints(pointsIn: Point[]) {
  const seen = new Set<string>()
  const out: Point[] = []
  for (const p of pointsIn) {
    const k = `${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

function buildUnits(cargo: Cargo[], mode: number) {
  const units: Cargo[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i++) {
      if (c.length > 0 && c.width > 0 && c.height > 0) units.push(c)
    }
  }
  const score = (c: Cargo) => {
    const area = c.length * c.width
    const volume = area * c.height
    const difficulty = (c.rotatable ? 0 : 300000) + (c.stackable && c.loadBearing ? 0 : 150000) + (c.quantity <= 3 ? 100000 : 0)
    if (mode === 1) return volume + difficulty
    if (mode === 2) return area + c.height * 1000 + difficulty
    if (mode === 3) return c.height * 100000 + area + difficulty
    return difficulty + area
  }
  return units.sort((a, b) => score(b) - score(a))
}

function placementScore(p: PlacedCargo, supportArea: number, container: Container, neighbors: PlacedCargo[]) {
  const d = dims(p)
  const footprint = d.l * d.w
  const supportRatio = footprint > 0 ? supportArea / footprint : 0
  let sideContact = 0
  for (const q of neighbors) {
    const qd = dims(q)
    if (Math.abs(q.z - p.z) > EPS || Math.abs(q.z + q.height - p.z) <= EPS) continue
    const xTouch = Math.abs(p.x + d.l - q.x) <= EPS || Math.abs(q.x + qd.l - p.x) <= EPS
    const yTouch = Math.abs(p.y + d.w - q.y) <= EPS || Math.abs(q.y + qd.w - p.y) <= EPS
    if (xTouch) sideContact += Math.min(d.w, qd.w)
    if (yTouch) sideContact += Math.min(d.l, qd.l)
  }
  const wallTouch = (p.x <= EPS ? d.w : 0) + (p.y <= EPS ? d.l : 0) + (p.x + d.l >= container.length - EPS ? d.w : 0) + (p.y + d.w >= container.width - EPS ? d.l : 0)
  // Lower z is overwhelmingly preferred. At the same level, full support,
  // side contact and wall contact produce compact, non-floating cargo walls.
  return p.z * 1000000 + (1 - supportRatio) * 100000 + -sideContact * 20 + -wallTouch * 5 + p.y * 0.01 + p.x * 0.001
}

async function runAttempt(
  units: Cargo[],
  container: Container,
  locked: PlacedCargo[],
  progress?: (n: number) => void,
  options: { signal?: AbortSignal } = {},
) {
  const cargoById = new Map<string, Cargo>()
  for (const c of units) cargoById.set(c.id, c)
  const safeLocked = locked.filter(p => inside(p, container))
  const result = safeLocked.slice()
  let totalWeight = result.reduce((n, p) => n + p.weight, 0)
  let seq = 0
  let placedAuto = 0

  for (let i = 0; i < units.length; i++) {
    if (options.signal?.aborted) throw new Error('Packing cancelled')
    const c = units[i]
    if (container.maxPayload > 0 && totalWeight + c.weight > container.maxPayload + EPS) continue

    const basePoints = dedupePoints(points(result, container))
    let best: Candidate | undefined
    for (const o of oris(c)) {
      const anchors: Point[] = []
      for (const bp of basePoints) anchors.push(...candidateAnchors(bp, o, container))
      for (const a of dedupePoints(anchors)) {
        if (a.x < -EPS || a.y < -EPS || a.z < -EPS) continue
        if (a.x + o.l > container.length + EPS || a.y + o.w > container.width + EPS || a.z + o.h > container.height + EPS) continue
        const p = make(c, o, a.x, a.y, a.z, ++seq)
        if (!inside(p, container)) continue
        if (result.some(q => overlap3d(p, q))) continue
        const support = supportInfo(c, o, p.x, p.y, p.z, result, cargoById)
        if (!support.ok) continue
        const score = placementScore(p, support.supportArea, container, result)
        if (!best || score < best.score) best = { p, score }
      }
    }

    if (best) {
      result.push(best.p)
      totalWeight += c.weight
      placedAuto++
    }
    progress?.(Math.round(((i + 1) / Math.max(1, units.length)) * 100))
    if ((i & 15) === 15) await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return { result, placedAuto }
}

export async function smartPack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (n: number) => void,
  options: { signal?: AbortSignal } = {},
) {
  const lockedCount = locked.length
  let best: { result: PlacedCargo[]; placedAuto: number } | undefined

  // Completion comes first. Run several deterministic packing orders and keep
  // the attempt that physically places the greatest number of cargo units.
  // Only after the count is tied do we prefer the more compact result.
  for (let mode = 1; mode <= 4; mode++) {
    const units = buildUnits(cargo, mode)
    const attempt = await runAttempt(units, container, locked, p => {
      progress?.(Math.round(((mode - 1) * 100 + p) / 4))
    }, options)
    if (!best || attempt.placedAuto > best.placedAuto) {
      best = attempt
    }
    if (best.placedAuto >= units.length) break
  }

  progress?.(100)
  return best?.result ?? locked.slice(0, lockedCount)
}
