import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, supportMetrics, validatePlan } from './geometry'
import { heuristicPack, type HeuristicOptions } from './heuristicSolver'

const EPS = 0.5

export type SolverResult = {
  placed: PlacedCargo[]
  unplaced: Cargo[]
}

function dimsFor(p: PlacedCargo) {
  return p.rotation % 180 === 0
    ? { length: p.length, width: p.width }
    : { length: p.width, width: p.length }
}

function fits(p: PlacedCargo, c: Container) {
  const d = dimsFor(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS &&
    p.x + d.length <= c.length + EPS &&
    p.y + d.width <= c.width + EPS &&
    p.z + p.height <= c.height + EPS
}

function completeUnplaced(cargo: Cargo[], placed: PlacedCargo[]) {
  const counts = new Map<string, number>()
  for (const p of placed) counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1)
  const result: Cargo[] = []
  for (const c of cargo) {
    const missing = Math.max(0, Math.floor(c.quantity) - (counts.get(c.id) ?? 0))
    for (let i = 0; i < missing; i += 1) result.push(c)
  }
  return result
}

function volumeOf(p: PlacedCargo) {
  return dims(p).length * dims(p).width * p.height
}

function planQuality(placed: PlacedCargo[], cargo: Cargo[], container: Container) {
  const audit = validatePlan(placed, container, cargo)
  if (!audit.ok) return -1e30

  const count = placed.length
  const volume = placed.reduce((sum, p) => sum + volumeOf(p), 0)
  const totalVolume = Math.max(1, container.length * container.width * container.height)
  const utilization = volume / totalVolume

  let supportSum = 0
  let partialCount = 0
  let maxHeight = 0
  for (const p of placed) {
    maxHeight = Math.max(maxHeight, p.z + p.height)
    if (p.z > EPS) {
      const s = supportMetrics(p, placed.filter(q => q.id !== p.id))
      supportSum += s.ratio
      if (s.ratio < 0.995) partialCount += 1
    }
  }

  // Count is overwhelmingly primary. Volume and layer continuity break ties,
  // while partial-support use is a small cost. This lets a gap branch win when
  // its tiny first-layer seam creates a materially better second layer.
  const averageSupport = supportSum / Math.max(1, placed.filter(p => p.z > EPS).length)
  const heightPenalty = maxHeight / Math.max(1, container.height)
  return count * 1_000_000_000 +
    utilization * 1_000_000 +
    averageSupport * 50_000 -
    partialCount * 150 -
    heightPenalty * 1_000
}

function chooseBest(
  results: Array<{ result: SolverResult; options: HeuristicOptions }>,
  cargo: Cargo[],
  container: Container,
) {
  let best = results[0]?.result
  let bestScore = best ? planQuality(best.placed, cargo, container) : -Infinity
  for (let i = 1; i < results.length; i += 1) {
    const score = planQuality(results[i].result.placed, cargo, container)
    if (score > bestScore) {
      best = results[i].result
      bestScore = score
    }
  }
  return best ?? { placed: [], unplaced: completeUnplaced(cargo, []) }
}

/**
 * First-stage production solver.
 *
 * The solver now uses a small deterministic beam of packing strategies:
 * 1. pallet-first + tight packing (regression-safe baseline)
 * 2. pallet-first + 10mm first-layer seam candidates
 * 3. footprint-first + 10mm seams
 * 4. volume-first + 20mm seams
 *
 * Every branch is independently audited. The winner is selected globally by
 * packed count first, then volume utilization and layer/support quality.
 *
 * This is intentionally a bounded multi-plan search rather than a single greedy
 * result. It gives the mixed pallet+carton case look-ahead without turning the
 * browser into an exponential exact solver.
 */
export function basePack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
): SolverResult {
  const validLocked = locked.filter(p => fits(p, container))
  const signatures = new Set(
    cargo.map((c) => [c.type, c.length, c.width, c.height, c.weight, c.stackable, c.loadBearing].join('|')),
  )
  const mixedLoad = signatures.size > 1

  // Homogeneous loads are already well served by the deterministic baseline.
  // Only mixed geometry needs the more expensive look-ahead/seam search.
  const strategies: HeuristicOptions[] = mixedLoad
    ? [
        { order: 'pallet-first', gapStep: 0, gapBias: 0 },
        { order: 'pallet-first', gapStep: 10, gapBias: 0, adjacencyWeight: 90 },
        { order: 'footprint', gapStep: 10, gapBias: 0, adjacencyWeight: 120 },
        { order: 'volume', gapStep: 20, gapBias: 0, adjacencyWeight: 80 },
      ]
    : [
        { order: 'pallet-first', gapStep: 0, gapBias: 0 },
      ]

  const results: Array<{ result: SolverResult; options: HeuristicOptions }> = []
  for (let i = 0; i < strategies.length; i += 1) {
    const branchProgress = (p: number) => progress?.(Math.round((i * 100 + p) / strategies.length))
    results.push({
      result: heuristicPack(cargo, container, validLocked, branchProgress, strategies[i]),
      options: strategies[i],
    })
  }

  const chosen = chooseBest(results, cargo, container)
  const audit = validatePlan(chosen.placed, container, cargo)
  if (audit.ok) return { placed: chosen.placed, unplaced: completeUnplaced(cargo, chosen.placed) }

  const bad = new Set(audit.errors.map(e => e.split(':', 1)[0]))
  const placed = chosen.placed.filter(p => p.locked || !bad.has(p.id))
  return { placed, unplaced: completeUnplaced(cargo, placed) }
}

export async function basePackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResult> {
  if (signal?.aborted) throw new Error('Packing cancelled')
  const result = basePack(cargo, container, locked, p => {
    if (!signal?.aborted) progress?.(p)
  })
  if (signal?.aborted) throw new Error('Packing cancelled')
  return result
}
