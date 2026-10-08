import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, supportMetrics, validatePlan } from './geometry'

const EPS = 0.5
const SUPPORT = 0.75

type Unit = { cargo: Cargo; index: number }\n\nexport type HeuristicOptions = {\n  gapStep?: number\n}

function expand(cargo: Cargo[]): Unit[] {
  const result: Unit[] = []
  for (const c of cargo) {
    for (let i = 0; i < Math.max(0, Math.floor(c.quantity)); i += 1) {
      result.push({ cargo: c, index: i })
    }
  }
  return result
}

function footprint(p: { length: number; width: number; rotation: number }) {
  return dims(p)
}

function overlaps(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a), B = footprint(b)
  return a.x < b.x + B.length - EPS && a.x + A.length > b.x + EPS &&
    a.y < b.y + B.width - EPS && a.y + A.width > b.y + EPS &&
    a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}

function fits(p: PlacedCargo, c: Container) {
  const d = footprint(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS &&
    p.x + d.length <= c.length + EPS &&
    p.y + d.width <= c.width + EPS &&
    p.z + p.height <= c.height + EPS
}

function loadBearing(p: PlacedCargo) {
  return p.loadBearing !== false
}

function topLoadLimit(p: PlacedCargo) {
  return p.maxLoadOnTop ?? 0
}

function overlapArea(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a), B = footprint(b)
  return Math.max(0, Math.min(a.x + A.length, b.x + B.length) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + A.width, b.y + B.width) - Math.max(a.y, b.y))
}

function supportInfo(p: PlacedCargo, placed: PlacedCargo[]) {
  if (p.z <= EPS) return { ratio: 1, supporters: [] as PlacedCargo[] }
  const supporters = placed.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && loadBearing(q) && overlapArea(p, q) > EPS)
  const area = supporters.reduce((sum, q) => sum + overlapArea(p, q), 0)
  const base = Math.max(1, footprint(p).length * footprint(p).width)
  return { ratio: Math.min(1, area / base), supporters }
}

function transferredLoad(q: PlacedCargo, p: PlacedCargo, placed: PlacedCargo[]) {
  const direct = placed.filter(x =>
    x.id !== q.id &&
    Math.abs(x.z - (q.z + q.height)) <= EPS &&
    overlapArea(x, q) > EPS
  )
  let total = q.weight
  for (const x of direct) {
    const ratio = overlapArea(x, q) / Math.max(1, footprint(x).length * footprint(x).width)
    total += x.weight * ratio
  }
  total += p.weight
  return total - q.weight
}

function validCandidate(p: PlacedCargo, placed: PlacedCargo[], container: Container, totalWeight: number) {
  if (!fits(p, container)) return false
  if (placed.some(q => overlaps(p, q))) return false
  if (container.maxPayload > 0 && totalWeight + p.weight > container.maxPayload + EPS) return false
  if (p.z <= EPS) return true
  // Non-stackable cargo may support other cargo when loadBearing is enabled,
  // but it may not itself be placed on another cargo.
  if (p.stackable === false) return false

  const support = supportInfo(p, placed)
  if (support.ratio + EPS < SUPPORT) return false

  for (const q of support.supporters) {
    const limit = topLoadLimit(q)
    if (limit > 0 && transferredLoad(q, p, placed) > limit + EPS) return false
    const maxLayers = q.maxStackLayers ?? 0
    if (maxLayers > 0) {
      const depth = stackDepth(q, placed)
      if (depth + 1 > maxLayers) return false
    }
  }
  return true
}

function stackDepth(p: PlacedCargo, placed: PlacedCargo[], seen = new Set<string>()): number {
  if (p.z <= EPS || seen.has(p.id)) return 1
  seen.add(p.id)
  const supports = placed.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && loadBearing(q) && overlapArea(p, q) > EPS)
  if (!supports.length) return 999
  return 1 + Math.max(...supports.map(q => stackDepth(q, placed, new Set(seen))))
}

function makePlaced(c: Cargo, index: number, x: number, y: number, z: number, rotation: 0 | 90): PlacedCargo {
  return {
    id: c.id + '#' + (index + 1),
    cargoId: c.id,
    cargoType: c.type,
    x, y, z,
    length: c.length,
    width: c.width,
    height: c.height,
    rotation,
    weight: c.weight,
    color: c.color,
    placementMode: 'automatic',
    locked: false,
    stackable: c.stackable,
    loadBearing: c.loadBearing,
    maxStackLayers: c.maxStackLayers,
    maxLoadOnTop: c.maxLoadOnTop,
    rotatable: c.rotatable,
  }
}

function candidatePoints(placed: PlacedCargo[], container: Container, cargoLength: number, cargoWidth: number, gapStep = 0, allowFloorGap = false) {
  const points: Array<[number, number, number]> = []
  const seen = new Set<string>()
  const add = (x: number, y: number, z: number) => {
    if (x < -EPS || y < -EPS || z < -EPS ||
      x + cargoLength > container.length + EPS ||
      y + cargoWidth > container.width + EPS ||
      z > container.height + EPS) return
    const px = Math.round(x), py = Math.round(y), pz = Math.round(z)
    const key = px + '|' + py + '|' + pz
    if (!seen.has(key)) {
      seen.add(key)
      points.push([px, py, pz])
    }
  }

  // Build candidates per support plane. Coordinates are derived from the
  // actual size of the cargo being placed, so residual strips on pallet tops
  // become explicit candidates instead of being hidden between EP corners.
  const levels = new Set<number>([0])
  for (const q of placed) {
    const top = q.z + q.height
    if (top <= container.height + EPS) levels.add(Math.round(top))
  }

  for (const z of levels) {
    const samePlane = placed.filter(q => Math.abs(q.z - z) <= EPS)
    const supports = placed.filter(q =>
      Math.abs(q.z + q.height - z) <= EPS && loadBearing(q)
    )
    if (z > EPS && supports.length === 0) continue

    const xs = new Set<number>([0, Math.max(0, container.length - cargoLength)])
    const ys = new Set<number>([0, Math.max(0, container.width - cargoWidth)])

    for (const q of samePlane) {
      const d = footprint(q)
      xs.add(Math.round(q.x))
      xs.add(Math.round(q.x + d.length))
      xs.add(Math.round(q.x + d.length - cargoLength))
      ys.add(Math.round(q.y))
      ys.add(Math.round(q.y + d.width))
      ys.add(Math.round(q.y + d.width - cargoWidth))
      if (allowFloorGap && z <= EPS && gapStep > 0) {
        xs.add(Math.round(q.x + d.length + gapStep))
        xs.add(Math.round(q.x - cargoLength - gapStep))
        ys.add(Math.round(q.y + d.width + gapStep))
        ys.add(Math.round(q.y - cargoWidth - gapStep))
      }
    }

    for (const q of supports) {
      const d = footprint(q)
      xs.add(Math.round(q.x))
      xs.add(Math.round(q.x + d.length - cargoLength))
      ys.add(Math.round(q.y))
      ys.add(Math.round(q.y + d.width - cargoWidth))
    }

    for (const x of xs) {
      for (const y of ys) {
        add(x, y, z)
        if (points.length >= 3500) return points
      }
    }
  }

  return points
}
function adjacencyScore(p: PlacedCargo, placed: PlacedCargo[]) {
  const A = footprint(p)
  let score = 0
  for (const q of placed) {
    if (Math.abs(q.z - p.z) > EPS) continue
    const B = footprint(q)
    const yOverlap = Math.max(0, Math.min(p.y + A.width, q.y + B.width) - Math.max(p.y, q.y))
    const xOverlap = Math.max(0, Math.min(p.x + A.length, q.x + B.length) - Math.max(p.x, q.x))
    if (Math.abs(p.x + A.length - q.x) <= EPS || Math.abs(q.x + B.length - p.x) <= EPS) score += yOverlap
    if (Math.abs(p.y + A.width - q.y) <= EPS || Math.abs(q.y + B.width - p.y) <= EPS) score += xOverlap
  }
  return score
}

function score(p: PlacedCargo, placed: PlacedCargo[], container: Container) {
  const support = supportInfo(p, placed).ratio
  const adjacency = adjacencyScore(p, placed)
  const d = footprint(p)
  const rightGap = Math.max(0, container.length - (p.x + d.length))
  const sideGap = Math.max(0, container.width - (p.y + d.width))
  // Support dominates, then edge-to-edge packing, then low levels and front/left
  // anchors. This deliberately produces orderly rows instead of scattered points.
  const layerReward = p.z > EPS ? p.z * 120 : 0
  const stableSupport = p.z > EPS ? supportMetrics(p, placed).ratio : 1
  return stableSupport * 1_000_000 + layerReward + adjacency * 250 - rightGap * 0.02 - sideGap * 0.01 - p.x * 0.001 - p.y * 0.0005
}

export function heuristicPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = [], progress?: (percent: number) => void, options: HeuristicOptions = {}): { placed: PlacedCargo[]; unplaced: Cargo[] } {
  const validLocked = locked.filter(p => fits(p, container))
  const placed = validLocked.map(p => ({ ...p }))
  const units = expand(cargo)
    .filter(u => !placed.some(p => p.cargoId === u.cargo.id && p.id === u.cargo.id + '#' + (u.index + 1)))
    .sort((a, b) => {
      const A = a.cargo.length * a.cargo.width
      const B = b.cargo.length * b.cargo.width
      const va = a.cargo.length * a.cargo.width * a.cargo.height
      const vb = b.cargo.length * b.cargo.width * b.cargo.height
      const palletBias = (a.cargo.type === 'pallet' ? 1 : 0) - (b.cargo.type === 'pallet' ? 1 : 0)
      return palletBias || B - A || vb - va || b.cargo.height - a.cargo.height || a.cargo.id.localeCompare(b.cargo.id)
    })

  let totalWeight = placed.reduce((s, p) => s + p.weight, 0)
  const unplaced: Cargo[] = []
  const total = Math.max(1, units.length)

  for (let i = 0; i < units.length; i += 1) {
    const u = units[i]
    const rotations: Array<0 | 90> = u.cargo.rotatable === false || u.cargo.length === u.cargo.width ? [0] : [0, 90]
    let best: PlacedCargo | null = null
    let bestScore = -Infinity

    for (const rotation of rotations) {
      const d = rotation === 0
        ? { length: u.cargo.length, width: u.cargo.width }
        : { length: u.cargo.width, width: u.cargo.length }
      const points = candidatePoints(placed, container, d.length, d.width, options.gapStep ?? 0, u.cargo.type === 'pallet')
      const candidates: PlacedCargo[] = []
      for (const [x, y, z] of points) {
        const p = makePlaced(u.cargo, u.index, x, y, z, rotation)
        if (validCandidate(p, placed, container, totalWeight)) candidates.push(p)
      }
      const supported = candidates.filter(p => p.z > EPS)
      const selected = supported.length > 0 ? supported.filter(p => p.z === Math.min(...supported.map(q => q.z))) : candidates
      for (const p of selected) {
        const candidateScore = score(p, placed, container)
        if (candidateScore > bestScore) { best = p; bestScore = candidateScore }
      }
    }

    if (best) {
      placed.push(best)
      totalWeight += best.weight
    } else {
      unplaced.push(u.cargo)
    }

    if ((i & 7) === 0) progress?.(Math.round((i / total) * 100))
  }

  // Final audit is intentionally a single pass; the hot loop never calls the
  // expensive application validator.
  const audit = validatePlan(placed, container, cargo)
  if (!audit.ok) {
    const bad = new Set(audit.errors.map(e => e.split(':', 1)[0]))
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      if (!placed[i].locked && bad.has(placed[i].id)) unplaced.push(cargo.find(c => c.id === placed[i].cargoId) ?? cargo[0])
    }
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      if (!placed[i].locked && bad.has(placed[i].id)) placed.splice(i, 1)
    }
  }

  progress?.(100)
  return { placed, unplaced }
}
