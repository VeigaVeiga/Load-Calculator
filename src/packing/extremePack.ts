import type { Cargo, Container, PlacedCargo } from '../types'

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }

type InternalPlaced = {
  p: PlacedCargo
  actualLength: number
  actualWidth: number
  stackDepth: number
}

type CandidatePoint = { x: number; y: number; z: number }

const EPS = 0.5

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

function orientations(c: Cargo) {
  const base = { length: c.length, width: c.width, rotation: 0 as 0 | 90 }
  if (!c.rotatable || Math.abs(c.length - c.width) <= EPS) return [base]
  return [base, { length: c.width, width: c.length, rotation: 90 as 0 | 90 }]
}

function overlap2d(
  ax: number, ay: number, al: number, aw: number,
  bx: number, by: number, bl: number, bw: number,
) {
  const x = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx))
  const y = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by))
  return x * y
}

function overlap3d(a: InternalPlaced, x: number, y: number, z: number, l: number, w: number, h: number) {
  return (
    x < a.p.x + a.actualLength - EPS &&
    x + l > a.p.x + EPS &&
    y < a.p.y + a.actualWidth - EPS &&
    y + w > a.p.y + EPS &&
    z < a.p.z + a.p.height - EPS &&
    z + h > a.p.z + EPS
  )
}

function fitsContainer(x: number, y: number, z: number, l: number, w: number, h: number, c: Container) {
  return x >= -EPS && y >= -EPS && z >= -EPS &&
    x + l <= c.length + EPS && y + w <= c.width + EPS && z + h <= c.height + EPS
}

function supportFor(
  cargo: Cargo,
  x: number,
  y: number,
  z: number,
  l: number,
  w: number,
  placed: InternalPlaced[],
  cargoById: Map<string, Cargo>,
  supportLoads: Map<string, number>,
) {
  if (z <= EPS) return { ok: true, depth: 0, palletSupport: false }
  if (!cargo.stackable || cargo.type === 'pallet') return { ok: false, depth: 0, palletSupport: false }

  const baseArea = l * w
  let supportedArea = 0
  let maxDepth = 1
  let palletSupport = false
  const supports: InternalPlaced[] = []

  for (const q of placed) {
    if (Math.abs(q.p.z + q.p.height - z) > EPS) continue
    const supportCargo = cargoById.get(q.p.cargoId)
    if (!supportCargo?.loadBearing) continue
    const area = overlap2d(x, y, l, w, q.p.x, q.p.y, q.actualLength, q.actualWidth)
    if (area <= EPS) continue
    supportedArea += area
    // A pallet is the first support layer. Only stacking on the same cargo
    // type increases the cargo's stack depth.
    const depth = q.p.cargoId === cargo.id ? q.stackDepth + 1 : 1
    maxDepth = Math.max(maxDepth, depth)
    palletSupport ||= q.p.cargoType === 'pallet'
    supports.push(q)
  }

  if (supportedArea < baseArea * 0.98) return { ok: false, depth: maxDepth, palletSupport }

  const configured = Number.isFinite(cargo.maxStackLayers) ? Math.floor(cargo.maxStackLayers) : 0
  if (configured > 0 && maxDepth > configured) return { ok: false, depth: maxDepth, palletSupport }

  for (const q of supports) {
    const supportCargo = cargoById.get(q.p.cargoId)
    const limit = Number.isFinite(supportCargo?.maxLoadOnTop) ? supportCargo?.maxLoadOnTop ?? 0 : 0
    if (limit > 0 && (supportLoads.get(q.p.id) ?? 0) + cargo.weight > limit + EPS) {
      return { ok: false, depth: maxDepth, palletSupport }
    }
  }

  return { ok: true, depth: maxDepth, palletSupport }
}

function candidateScore(
  point: CandidatePoint,
  orientation: { length: number; width: number },
  container: Container,
  support: { palletSupport: boolean },
) {
  const cx = point.x + orientation.length / 2
  const cy = point.y + orientation.width / 2
  const center = Math.hypot(cx - container.length / 2, cy - container.width / 2)
  const edge = point.x + point.y
  // Keep floor packing bottom-first, but deliberately give a pallet-top
  // position absolute priority when it can support the cargo. This is the
  // requested "pallet below, cartons/crates above" rule.
  let score = point.z * 100000 + edge * 0.02 + center * 0.15
  if (support.palletSupport) score -= 1000000000
  return score
}

function makePlaced(c: Cargo, index: number, o: { rotation: 0 | 90 }, x: number, y: number, z: number): PlacedCargo {
  return {
    id: `${c.id}-${index + 1}`,
    cargoId: c.id,
    cargoType: c.type,
    x, y, z,
    // Keep the user's original dimensions here. Rotation is applied exactly
    // once by geometry/rendering.
    length: c.length,
    width: c.width,
    height: c.height,
    weight: c.weight,
    color: c.color,
    rotation: o.rotation,
    placementMode: 'automatic',
    locked: false,
  }
}

function internalFromPlaced(p: PlacedCargo, depth: number): InternalPlaced {
  const rotated = Math.abs(Math.round(p.rotation / 90)) % 2 === 1
  return {
    p,
    actualLength: rotated ? p.width : p.length,
    actualWidth: rotated ? p.length : p.width,
    stackDepth: depth,
  }
}

function sortCargo(cargo: Cargo[]) {
  const groups = cargo
    .map(c => ({ cargo: c, quantity: Math.max(0, Math.floor(c.quantity)) }))
    .filter(g => g.quantity > 0 && g.cargo.length > 0 && g.cargo.width > 0 && g.cargo.height > 0)

  return groups.sort((a, b) => {
    const ap = a.cargo.type === 'pallet' && a.cargo.loadBearing ? 1 : 0
    const bp = b.cargo.type === 'pallet' && b.cargo.loadBearing ? 1 : 0
    if (ap !== bp) return bp - ap
    const av = a.cargo.length * a.cargo.width * a.cargo.height
    const bv = b.cargo.length * b.cargo.width * b.cargo.height
    return bv - av
  })
}

function pointsFor(placed: InternalPlaced[]): CandidatePoint[] {
  const points: CandidatePoint[] = [{ x: 0, y: 0, z: 0 }]
  for (const q of placed) {
    const x2 = q.p.x + q.actualLength
    const y2 = q.p.y + q.actualWidth
    const z2 = q.p.z + q.p.height
    points.push(
      { x: x2, y: q.p.y, z: q.p.z },
      { x: q.p.x, y: y2, z: q.p.z },
      { x: x2, y: y2, z: q.p.z },
      { x: q.p.x, y: q.p.y, z: z2 },
      { x: x2, y: q.p.y, z: z2 },
      { x: q.p.x, y: y2, z: z2 },
    )
  }

  const seen = new Set<string>()
  return points.filter(p => {
    const key = `${Math.round(p.x * 10)}|${Math.round(p.y * 10)}|${Math.round(p.z * 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function autoPackExtreme(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: Progress,
  options: Options = {},
) {
  const groups = sortCargo(cargo)
  const total = groups.reduce((n, g) => n + g.quantity, 0)
  if (!total) { progress?.(100); return locked.slice() }

  const cargoById = new Map(cargo.map(c => [c.id, c]))
  const result = locked.slice()
  const placed: InternalPlaced[] = locked.map(p => internalFromPlaced(p, 1))
  const supportLoads = new Map<string, number>()
  let done = 0
  let sequence = 0
  let totalWeight = locked.reduce((sum, p) => sum + p.weight, 0)

  for (const group of groups) {
    abort(options.signal)
    const c = group.cargo
    let remaining = group.quantity

    while (remaining > 0) {
      abort(options.signal)
      if (container.maxPayload > 0 && totalWeight + c.weight > container.maxPayload + EPS) break

      const points = pointsFor(placed)
      let best: {
        point: CandidatePoint
        orientation: { length: number; width: number; rotation: 0 | 90 }
        score: number
        depth: number
        palletSupport: boolean
      } | undefined

      for (const point of points) {
        for (const o of orientations(c)) {
          if (!fitsContainer(point.x, point.y, point.z, o.length, o.width, c.height, container)) continue
          if (placed.some(q => overlap3d(q, point.x, point.y, point.z, o.length, o.width, c.height))) continue

          const support = supportFor(c, point.x, point.y, point.z, o.length, o.width, placed, cargoById, supportLoads)
          if (!support.ok) continue

          const score = candidateScore(point, o, container, support)
          if (!best || score < best.score) {
            best = { point, orientation: o, score, depth: support.depth, palletSupport: support.palletSupport }
          }
        }
      }

      if (!best) break

      const p = makePlaced(c, sequence++, best.orientation, best.point.x, best.point.y, best.point.z)
      const q = internalFromPlaced(p, best.depth)
      result.push(p)
      placed.push(q)
      totalWeight += c.weight

      if (best.point.z > EPS) {
        for (const support of placed) {
          if (support.p.id === p.id) continue
          if (Math.abs(support.p.z + support.p.height - p.z) > EPS) continue
          const area = overlap2d(
            p.x, p.y, q.actualLength, q.actualWidth,
            support.p.x, support.p.y, support.actualLength, support.actualWidth,
          )
          if (area > EPS) {
            supportLoads.set(support.p.id, (supportLoads.get(support.p.id) ?? 0) + c.weight)
          }
        }
      }

      remaining--
      done++
      progress?.(Math.min(99, Math.round((done / total) * 100)))
      if ((done & 7) === 0) await yieldBrowser()
    }

    await yieldBrowser()
  }

  progress?.(100)
  return result
}
