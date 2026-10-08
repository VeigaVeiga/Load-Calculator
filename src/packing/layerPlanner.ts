import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, supportMetrics } from './geometry'

const EPS = 0.5
const MAX_OVERHANG_RATIO = 0.25
const BEAM_WIDTH = 24
const MAX_LAYER_STEPS = 120
const MAX_CANDIDATES_PER_UNIT = 96

export type LayerUnit = { cargo: Cargo; index: number }

type Rect = { x: number; y: number; w: number; h: number }

type State = {
  placed: PlacedCargo[]
  remaining: LayerUnit[]
  score: number
  placedArea: number
}

function footprint(p: Pick<PlacedCargo, 'length' | 'width' | 'rotation'>) {
  return dims(p)
}

function overlap(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a), B = footprint(b)
  return a.x < b.x + B.length - EPS &&
    a.x + A.length > b.x + EPS &&
    a.y < b.y + B.width - EPS &&
    a.y + A.width > b.y + EPS &&
    a.z < b.z + b.height - EPS &&
    a.z + a.height > b.z + EPS
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

function supportRects(supports: PlacedCargo[]): Rect[] {
  return supports.map((q) => {
    const d = footprint(q)
    return { x: q.x, y: q.y, w: d.length, h: d.width }
  })
}

function canMergeRectangles(a: Rect, b: Rect) {
  const aRight = a.x + a.w
  const bRight = b.x + b.w
  const aBottom = a.y + a.h
  const bBottom = b.y + b.h

  // Only merge surfaces that form one continuous rectangle. Partial overlap
  // is excluded because its bounding box could contain unsupported space.
  const sameRow = Math.abs(a.y - b.y) <= EPS &&
    Math.abs(a.h - b.h) <= EPS &&
    (Math.abs(aRight - b.x) <= EPS || Math.abs(bRight - a.x) <= EPS)

  const sameColumn = Math.abs(a.x - b.x) <= EPS &&
    Math.abs(a.w - b.w) <= EPS &&
    (Math.abs(aBottom - b.y) <= EPS || Math.abs(bBottom - a.y) <= EPS)

  return sameRow || sameColumn
}

function mergeRectangles(rects: Rect[]) {
  const merged = rects.map((r) => ({ ...r }))

  let changed = true
  while (changed) {
    changed = false

    outer:
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (!canMergeRectangles(merged[i], merged[j])) continue

        const a = merged[i]
        const b = merged[j]
        merged[i] = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
          h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
        }
        merged.splice(j, 1)
        changed = true
        break outer
      }
    }
  }

  return merged
}

function splitRect(r: Rect, p: PlacedCargo): Rect[] {
  const d = footprint(p)
  const x1 = Math.max(r.x, p.x)
  const x2 = Math.min(r.x + r.w, p.x + d.length)
  const y1 = Math.max(r.y, p.y)
  const y2 = Math.min(r.y + r.h, p.y + d.width)
  if (x2 <= x1 + EPS || y2 <= y1 + EPS) return [r]

  const out: Rect[] = []
  if (x1 - r.x > EPS) out.push({ x: r.x, y: r.y, w: x1 - r.x, h: r.h })
  if (r.x + r.w - x2 > EPS) out.push({ x: x2, y: r.y, w: r.x + r.w - x2, h: r.h })
  if (y1 - r.y > EPS) out.push({ x: x1, y: r.y, w: x2 - x1, h: y1 - r.y })
  if (r.y + r.h - y2 > EPS) out.push({ x: x1, y: y2, w: x2 - x1, h: r.y + r.h - y2 })
  return out
}

function freeRects(z: number, placed: PlacedCargo[], supports: PlacedCargo[]): Rect[] {
  // Adjacent pallet/support surfaces become one continuous 2D packing
  // surface. Physical support is still validated later by supportMetrics(),
  // so this does not permit unsupported bridging.
  let rects = mergeRectangles(supportRects(supports))
  const same = placed.filter((p) => Math.abs(p.z - z) <= EPS)

  for (const p of same) {
    const next: Rect[] = []
    for (const r of rects) next.push(...splitRect(r, p))
    rects = next
  }

  return rects.filter((r) => r.w > EPS && r.h > EPS)
}

function near(a: Rect, b: Rect, maxGap: number) {
  const horizontalGap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0)
  const verticalGap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0)
  const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  return (horizontalGap <= maxGap + EPS && yOverlap > EPS) ||
    (verticalGap <= maxGap + EPS && xOverlap > EPS)
}

function bridgeRects(supports: PlacedCargo[], cargoLength: number, cargoWidth: number): Rect[] {
  const rects = supportRects(supports)
  if (rects.length < 2) return []

  const maxGap = Math.max(cargoLength, cargoWidth) * MAX_OVERHANG_RATIO
  const groups: Rect[][] = []
  const used = new Set<number>()

  for (let start = 0; start < rects.length; start += 1) {
    if (used.has(start)) continue
    const indexes = [start]
    used.add(start)

    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      const current = rects[indexes[cursor]]
      for (let j = 0; j < rects.length; j += 1) {
        if (!used.has(j) && near(current, rects[j], maxGap)) {
          used.add(j)
          indexes.push(j)
        }
      }
    }

    if (indexes.length >= 2) groups.push(indexes.map((i) => rects[i]))
  }

  const result: Rect[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    const candidates = [
      group,
      ...group.flatMap((r, i) =>
        group.filter((q, j) => j > i && near(r, q, maxGap)).map((q) => [r, q]),
      ),
    ]

    for (const items of candidates) {
      const x = Math.min(...items.map((r) => r.x))
      const y = Math.min(...items.map((r) => r.y))
      const x2 = Math.max(...items.map((r) => r.x + r.w))
      const y2 = Math.max(...items.map((r) => r.y + r.h))
      const r = { x, y, w: x2 - x, h: y2 - y }
      const key = [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)].join('|')
      if (r.w > EPS && r.h > EPS && !seen.has(key)) {
        seen.add(key)
        result.push(r)
      }
    }
  }

  return result
}

function candidatePositions(r: Rect, length: number, width: number): Array<[number, number]> {
  const maxX = r.x + r.w - length
  const maxY = r.y + r.h - width
  if (maxX < r.x - EPS || maxY < r.y - EPS) return []

  // Extreme-point generation: every left/right edge and top/bottom edge of
  // an existing box becomes a candidate. This is much denser than only using
  // rectangle corners and is essential for mixed carton sizes.
  const xs = new Set<number>([
    r.x,
    maxX,
    r.x + (r.w - length) / 2,
  ])
  const ys = new Set<number>([
    r.y,
    maxY,
    r.y + (r.h - width) / 2,
  ])



  const out: Array<[number, number]> = []
  for (const x of xs) {
    for (const y of ys) {
      if (x >= r.x - EPS && y >= r.y - EPS &&
          x <= maxX + EPS && y <= maxY + EPS) {
        out.push([Math.round(x), Math.round(y)])
      }
    }
  }

  // Keep candidates deterministic and prefer the lower/left frontier. The
  // beam search will retain alternatives with better support/adjacency.
  out.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  return out
}

function sameLevelAdjacency(p: PlacedCargo, sameLevel: PlacedCargo[]) {
  const d = footprint(p)
  let shared = 0

  for (const q of sameLevel) {
    const qd = footprint(q)
    const y = Math.max(0, Math.min(p.y + d.width, q.y + qd.width) - Math.max(p.y, q.y))
    const x = Math.max(0, Math.min(p.x + d.length, q.x + qd.length) - Math.max(p.x, q.x))
    if (Math.abs(p.x + d.length - q.x) <= EPS || Math.abs(q.x + qd.length - p.x) <= EPS) shared += y
    if (Math.abs(p.y + d.width - q.y) <= EPS || Math.abs(q.y + qd.width - p.y) <= EPS) shared += x
  }

  return shared
}

function canSupport(lower: PlacedCargo, upper: PlacedCargo) {
  return lower.cargoId === upper.cargoId
    ? lower.stackable !== false
    : lower.loadBearing !== false
}

function fragmentation(z: number, placed: PlacedCargo[], supports: PlacedCargo[]) {
  const rects = freeRects(z, placed, supports)
  if (!rects.length) return 0

  const usable = rects.reduce((sum, r) => sum + r.w * r.h, 0)
  const largest = Math.max(...rects.map((r) => r.w * r.h))
  return Math.max(0, rects.length - 1) * 900 + Math.max(0, usable - largest) * 0.02
}

function unitUrgency(u: LayerUnit) {
  const c = u.cargo
  const area = c.length * c.width
  const volume = area * c.height
  const rotationPenalty = c.rotatable === false ? 5000 : 0
  const bearingPenalty = c.loadBearing === false ? 2000 : 0
  return area * 2 + volume * 0.001 + c.weight * 0.15 + rotationPenalty + bearingPenalty
}

function stackLayerCount(cargoId: string, placed: PlacedCargo[]) {
  return new Set(
    placed
      .filter((p) => p.cargoId === cargoId)
      .map((p) => Math.round(p.z * 10) / 10),
  ).size
}

function canUseUnit(u: LayerUnit, placed: PlacedCargo[]) {
  const maxLayers = u.cargo.maxStackLayers ?? 0
  return maxLayers <= 0 || stackLayerCount(u.cargo.id, placed) < maxLayers
}

function transferredLoad(q: PlacedCargo, p: PlacedCargo, placed: PlacedCargo[]) {
  const d = footprint(q)
  const direct = placed.filter((x) =>
    x.id !== q.id &&
    Math.abs(x.z - (q.z + q.height)) <= EPS &&
    Math.max(0, Math.min(x.x + footprint(x).length, q.x + d.length) - Math.max(x.x, q.x)) > EPS &&
    Math.max(0, Math.min(x.y + footprint(x).width, q.y + d.width) - Math.max(x.y, q.y)) > EPS,
  )

  let load = p.weight
  for (const x of direct) {
    const xd = footprint(x)
    const area = Math.max(0, Math.min(x.x + xd.length, q.x + d.length) - Math.max(x.x, q.x)) *
      Math.max(0, Math.min(x.y + xd.width, q.y + d.width) - Math.max(x.y, q.y))
    load += x.weight * Math.min(1, area / Math.max(1, xd.length * xd.width))
  }
  return load
}

function validCandidate(
  p: PlacedCargo,
  state: State,
  container: Container,
  totalWeight: number,
) {
  const d = footprint(p)
  if (p.x < -EPS || p.y < -EPS || p.z < -EPS ||
      p.x + d.length > container.length + EPS ||
      p.y + d.width > container.width + EPS ||
      p.z + p.height > container.height + EPS) return false

  if (state.placed.some((q) => overlap(p, q))) return false
  if (container.maxPayload > 0 && totalWeight + p.weight > container.maxPayload + EPS) return false
  if (p.z <= EPS) return true

  const support = supportMetrics(p, state.placed)
  if (!support.stable) return false

  for (const q of support.supporters) {
    const limit = q.maxLoadOnTop ?? 0
    if (q.cargoId !== p.cargoId && limit > 0 && transferredLoad(q, p, state.placed) > limit + EPS) return false
  }

  return true
}

function candidatePlacements(
  u: LayerUnit,
  z: number,
  state: State,
  supports: PlacedCargo[],
  container: Container,
  totalWeight: number,
): PlacedCargo[] {
  const rotations: Array<0 | 90> = u.cargo.rotatable === false || u.cargo.length === u.cargo.width
    ? [0]
    : [0, 90]

  const rects = [
    ...freeRects(z, state.placed, supports),
    ...bridgeRects(supports, u.cargo.length, u.cargo.width),
  ]

  const candidates: PlacedCargo[] = []
  const seen = new Set<string>()
  const sameLevel = state.placed.filter((p) => Math.abs(p.z - z) <= EPS)

  const candidateScore = (p: PlacedCargo) => {
    const d = footprint(p)
    const support = supportMetrics(p, state.placed)
    const adjacent = sameLevelAdjacency(p, sameLevel)
    const center = Math.abs((p.x + d.length / 2) - container.length / 2) +
      Math.abs((p.y + d.width / 2) - container.width / 2)
    return support.ratio * 100000 +
      adjacent * 300 +
      d.length * d.width * 0.05 -
      center * 0.05
  }

  // Candidate budget is distributed per support region. A global top-N list
  // is dangerous for mixed pallet loading because the first pallet can consume
  // the entire budget and starve later pallets.
  for (const rotation of rotations) {
    const d = rotation === 0
      ? { length: u.cargo.length, width: u.cargo.width }
      : { length: u.cargo.width, width: u.cargo.length }

    for (const r of rects) {
      const local: PlacedCargo[] = []
      for (const [x, y] of candidatePositions(r, d.length, d.width)) {
        const p = makePlaced(u.cargo, u.index, x, y, z, rotation)
        const key = [Math.round(x), Math.round(y), rotation].join('|')
        if (seen.has(key) || !validCandidate(p, state, container, totalWeight)) continue
        seen.add(key)
        local.push(p)
      }
      local.sort((a, b) => candidateScore(b) - candidateScore(a))
      candidates.push(...local.slice(0, 18))
    }
  }

  // Add a small global frontier as well, allowing a carton to bridge or finish
  // an otherwise fragmented area when that genuinely scores better.
  candidates.sort((a, b) => candidateScore(b) - candidateScore(a))
  return candidates.slice(0, MAX_CANDIDATES_PER_UNIT)
}

function stateScore(state: State, z: number, supports: PlacedCargo[], container: Container, totalWeight: number) {
  const level = state.placed.filter((p) => Math.abs(p.z - z) <= EPS)
  const area = level.reduce((sum, p) => {
    const d = footprint(p)
    return sum + d.length * d.width
  }, 0)
  const adjacency = level.reduce((sum, p) => sum + sameLevelAdjacency(p, level), 0)
  const sameCargoAdjacency = level.reduce((sum, p) => {
    const d = footprint(p)
    return sum + level
      .filter((q) => q.id !== p.id && q.cargoId === p.cargoId)
      .reduce((inner, q) => {
        const qd = footprint(q)
        const yOverlap = Math.max(0, Math.min(p.y + d.width, q.y + qd.width) - Math.max(p.y, q.y))
        const xOverlap = Math.max(0, Math.min(p.x + d.length, q.x + qd.length) - Math.max(p.x, q.x))
        if (Math.abs(p.x + d.length - q.x) <= EPS || Math.abs(q.x + qd.length - p.x) <= EPS) return inner + yOverlap
        if (Math.abs(p.y + d.width - q.y) <= EPS || Math.abs(q.y + qd.width - p.y) <= EPS) return inner + xOverlap
        return inner
      }, 0)
  }, 0)
  const supportQuality = level.reduce((sum, p) => sum + supportMetrics(p, state.placed).ratio, 0)
  const fragmentationPenalty = fragmentation(z, state.placed, supports)

  const centers = level.map((p) => {
    const d = footprint(p)
    return {
      x: p.x + d.length / 2,
      y: p.y + d.width / 2,
      weight: p.weight,
    }
  })
  const totalLevelWeight = centers.reduce((s, p) => s + p.weight, 0)
  const cx = totalLevelWeight
    ? centers.reduce((s, p) => s + p.x * p.weight, 0) / totalLevelWeight
    : container.length / 2
  const cy = totalLevelWeight
    ? centers.reduce((s, p) => s + p.y * p.weight, 0) / totalLevelWeight
    : container.width / 2
  const centerPenalty = Math.abs(cx - container.length / 2) + Math.abs(cy - container.width / 2)

  return state.placedArea * 1.5 +
    state.placed.length * 10000000 +
    area * 0.4 +
    adjacency * 140 +
    sameCargoAdjacency * 220 +
    supportQuality * 900 +
    totalWeight * 0.001 -
    fragmentationPenalty * 1.2 -
    centerPenalty * 0.8
}

function beamLayer(
  units: LayerUnit[],
  initial: PlacedCargo[],
  z: number,
  supports: PlacedCargo[],
  container: Container,
  totalWeight: number,
): State {
  let beam: State[] = [{
    placed: [...initial],
    remaining: [...units],
    score: 0,
    placedArea: 0,
  }]

  let best = beam[0]

  for (let step = 0; step < Math.min(MAX_LAYER_STEPS, units.length + 12); step += 1) {
    const next: State[] = []
    let expanded = false

    for (const state of beam) {
      const eligible = state.remaining
        .filter((u) => canUseUnit(u, state.placed))
        .sort((a, b) => unitUrgency(b) - unitUrgency(a))
        .slice(0, 20)

      for (const u of eligible) {
        const candidates = candidatePlacements(u, z, state, supports, container, totalWeight)
        for (const p of candidates) {
          const remaining = state.remaining.filter((x) => x !== u)
          const d = footprint(p)
          const child: State = {
            placed: [...state.placed, p],
            remaining,
            score: 0,
            placedArea: state.placedArea + d.length * d.width,
          }
          child.score = stateScore(child, z, supports, container, totalWeight + p.weight)
          next.push(child)
          expanded = true
        }
      }
    }

    if (!expanded) break

    next.sort((a, b) => {
      if (b.placed.length !== a.placed.length) return b.placed.length - a.placed.length
      return b.score - a.score
    })

    const dedup = new Set<string>()
    beam = []
    for (const state of next) {
      const signature = state.placed
        .filter((p) => Math.abs(p.z - z) <= EPS)
        .map((p) => {
          const d = footprint(p)
          return [p.cargoId, Math.round(p.x), Math.round(p.y), Math.round(d.length), Math.round(d.width)].join(',')
        })
        .sort()
        .join(';')
      if (dedup.has(signature)) continue
      dedup.add(signature)
      beam.push(state)
      if (beam.length >= BEAM_WIDTH) break
    }

    const candidateBest = beam[0]
    if (candidateBest && (
      candidateBest.placed.length > best.placed.length ||
      (candidateBest.placed.length === best.placed.length && candidateBest.score > best.score)
    )) best = candidateBest
  }

  return best
}

function layerFillScore(state: State, z: number, supports: PlacedCargo[]) {
  const level = state.placed.filter((p) => Math.abs(p.z - z) <= EPS)
  if (!level.length) return -Infinity
  const supportArea = supports.reduce((sum, p) => {
    const d = footprint(p)
    return sum + d.length * d.width
  }, 0)
  const occupied = level.reduce((sum, p) => {
    const d = footprint(p)
    return sum + d.length * d.width
  }, 0)
  const count = level.length
  const fragmentationPenalty = fragmentation(z, state.placed, supports)
  return count * 1e7 + occupied * 10 - fragmentationPenalty * 2 + state.score * 0.01 +
    Math.min(1, occupied / Math.max(1, supportArea)) * 1e6
}

export function packSupportedLayers(
  units: LayerUnit[],
  placed: PlacedCargo[],
  container: Container,
  totalWeight: number,
  progress?: (percent: number) => void,
) {
  let remaining = [...units]
  let current = [...placed]
  let weight = totalWeight
  const added: PlacedCargo[] = []
  let guard = 0

  while (remaining.length && guard < units.length * 2) {
    guard += 1

    const levels = [...new Set(
      current
        .filter((p) =>
          p.z + p.height > EPS &&
          p.z + p.height < container.height - EPS &&
          true,
        )
        .map((p) => Math.round((p.z + p.height) * 10) / 10),
    )].sort((a, b) => a - b)

    let chosenState: State | null = null
    let chosenZ = -1

    for (const z of levels) {
      const supports = current.filter((p) =>
        Math.abs(p.z + p.height - z) <= EPS &&
        (p.loadBearing !== false || p.stackable !== false),
      )
      if (!supports.length) continue

      const result = beamLayer(remaining, current, z, supports, container, weight)
      if (result.placed.length <= current.length) continue

      if (!chosenState ||
          layerFillScore(result, z, supports) > layerFillScore(chosenState, chosenZ, current.filter((p) => Math.abs(p.z + p.height - chosenZ) <= EPS))) {
        chosenState = result
        chosenZ = z
      }
    }

    if (!chosenState || chosenZ < 0) break

    const oldIds = new Set(current.map((p) => p.id))
    const newlyAdded = chosenState.placed.filter((p) => !oldIds.has(p.id))
    if (!newlyAdded.length) break

    current = chosenState.placed
    remaining = chosenState.remaining
    for (const p of newlyAdded) {
      added.push(p)
      weight += p.weight
    }

    progress?.(Math.round((added.length / Math.max(1, units.length)) * 100))
  }

  return { remaining, added, totalWeight: weight }
}
