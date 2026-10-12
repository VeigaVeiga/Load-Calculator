import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'
import { heuristicPack, type HeuristicOptions } from './heuristicSolver'
import { openSourcePackCandidate } from './openSourceSolver'

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



function planVolume(placed: PlacedCargo[]) {
  return placed.reduce((sum, p) => {
    const d = dimsFor(p)
    return sum + d.length * d.width * p.height
  }, 0)
}

function foundationCoverage(result: SolverResult, cargo: Cargo[]) {
  const maxArea = Math.max(1, ...cargo.map((c) => c.length * c.width))
  const uniqueCargo = new Set(cargo.map((c) => c.id)).size
  if (uniqueCargo <= 1) return 0

  const foundationIds = new Set(
    cargo
      .filter((c) => {
        const areaRatio = (c.length * c.width) / maxArea
        // Weight alone does not make a cargo unit foundation material:
        // a heavy but stackable carton must remain eligible for upper layers.
        return c.stackable === false || areaRatio >= 0.6
      })
      .map((c) => c.id),
  )
  if (!foundationIds.size) return 0

  const expected = cargo
    .filter((c) => foundationIds.has(c.id))
    .reduce((sum, c) => sum + Math.max(0, Math.floor(c.quantity)), 0)
  const actual = result.placed.filter((p) => foundationIds.has(p.cargoId)).length
  return actual / Math.max(1, expected)
}

function planQuality(result: SolverResult, container: Container, cargo: Cargo[]) {
  const placed = result.placed
  if (!placed.length) return -Infinity

  const volume = planVolume(placed)
  const totalWeight = placed.reduce((sum, p) => sum + p.weight, 0)
  const weighted = placed.reduce((acc, p) => {
    const d = dimsFor(p)
    const weight = Math.max(0, p.weight)
    return {
      x: acc.x + (p.x + d.length / 2) * weight,
      y: acc.y + (p.y + d.width / 2) * weight,
      z: acc.z + (p.z + p.height / 2) * weight,
    }
  }, { x: 0, y: 0, z: 0 })

  const cgX = totalWeight > 0 ? weighted.x / totalWeight : container.length / 2
  const cgY = totalWeight > 0 ? weighted.y / totalWeight : container.width / 2
  const cgZ = totalWeight > 0 ? weighted.z / totalWeight : container.height / 2

  const centerPenalty =
    Math.abs(cgX - container.length / 2) / Math.max(1, container.length) +
    Math.abs(cgY - container.width / 2) / Math.max(1, container.width)

  const levelPenalty = placed.reduce((sum, p) => {
    const d = dimsFor(p)
    const centerX = p.x + d.length / 2
    const centerY = p.y + d.width / 2
    return sum +
      Math.abs(centerX - container.length / 2) * p.weight +
      Math.abs(centerY - container.width / 2) * p.weight
  }, 0) / Math.max(1, totalWeight)

  // Count remains the first objective. These terms only break ties or close
  // candidates, so the solver never sacrifices a loaded unit merely to polish
  // geometry. Weight balance is deliberately a secondary objective; a future
  // explicit "optimize load" action can search this space more aggressively.
  const foundation = foundationCoverage(result, cargo)

  // Foundation completion is a hard strategic priority: an upper-layer
  // solution must not sacrifice physically important lower cargo merely to
  // gain more small cartons. This is derived from cargo attributes, not type.
  // Lexicographic intent encoded with separated scales: loaded-unit count
  // is always the primary objective, then cargo volume, then foundation
  // completion and only then balance. A perfect foundation ratio must never
  // beat a plan that safely loads more units.
  return placed.length * 1_000_000_000_000 +
    volume * 10 +
    foundation * 1_000_000_000 +
    totalWeight * 0.01 -
    centerPenalty * 100_000 -
    levelPenalty * 0.1 -
    Math.abs(cgZ - container.height * 0.25) * 0.001
}

function chooseBest(
  results: Array<{ result: SolverResult; options: HeuristicOptions }>,
  container: Container,
  cargo: Cargo[],
) {
  // Feasibility is a gate, not a penalty. Previously an invalid candidate
  // could win the score comparison and only be stripped after selection,
  // even when another candidate was fully valid and nearly as good.
  let best: SolverResult | undefined
  let bestScore = -Infinity

  for (const entry of results) {
    const candidate = entry.result
    if (!validatePlan(candidate.placed, container, cargo).ok) continue
    const candidateScore = planQuality(candidate, container, cargo)
    if (!best || candidateScore > bestScore) {
      best = candidate
      bestScore = candidateScore
    }
  }

  if (best) return best
  // If every automatic candidate fails validation, preserve the user's locked
  // placements rather than silently discarding their manual work.
  const lockedFallback = results[0]?.result.placed.filter(p => p.locked) ?? []
  return { placed: lockedFallback, unplaced: completeUnplaced(cargo, lockedFallback) }
}

function homogeneousGridCandidate(cargo: Cargo[], container: Container, locked: PlacedCargo[]): SolverResult | null {
  const active = cargo.filter(c => Math.floor(c.quantity) > 0)
  if (active.length !== 1) return null
  const c = active[0]
  if (cargo.some(other => other.id !== c.id && Math.floor(other.quantity) > 0)) return null
  const orientations = c.rotatable === false || c.length === c.width
    ? [{ length: c.length, width: c.width, rotation: 0 }]
    : [
        { length: c.length, width: c.width, rotation: 0 },
        { length: c.width, width: c.length, rotation: 90 },
      ]
  const candidates: PlacedCargo[][] = []
  for (const o of orientations) {
    const cols = Math.floor((container.length + EPS) / o.length)
    const rows = Math.floor((container.width + EPS) / o.width)
    if (cols < 1 || rows < 1 || c.height > container.height + EPS) continue
    const placed = locked.map(p => ({ ...p }))
    const lockedCount = placed.filter(p => p.cargoId === c.id).length
    const count = Math.max(0, Math.floor(c.quantity) - lockedCount)
    let idx = 0
    // Fill a continuous, edge-anchored grid. Evaluate both orientations;
    // never rotate individual units inside a homogeneous row/column pattern.
    for (let row = 0; row < rows && idx < count; row++) {
      for (let col = 0; col < cols && idx < count; col++) {
        while (placed.some(q => q.id === c.id + '#' + (idx + 1))) idx++
        const p: PlacedCargo = {
          id: c.id + '#' + (idx + 1), cargoId: c.id, cargoType: c.type,
          x: col * o.length, y: row * o.width, z: 0,
          length: c.length, width: c.width, height: c.height, rotation: o.rotation,
          weight: c.weight, color: c.color, placementMode: 'automatic', locked: false,
          stackable: c.stackable, loadBearing: c.loadBearing,
          maxStackLayers: c.maxStackLayers, maxLoadOnTop: c.maxLoadOnTop,
          rotatable: c.rotatable,
        }
        if (!fits(p, container)) continue
        if (placed.some(q => {
          const a = dimsFor(p), b = dimsFor(q)
          return p.x < q.x + b.length - EPS && p.x + a.length > q.x + EPS &&
            p.y < q.y + b.width - EPS && p.y + a.width > q.y + EPS &&
            p.z < q.z + q.height - EPS && p.z + p.height > q.z + EPS
        })) continue
        if (container.maxPayload > 0 &&
          placed.reduce((sum, q) => sum + q.weight, 0) + p.weight > container.maxPayload + EPS) continue
        placed.push(p)
        idx++
      }
    }
    const own = placed.filter(p => p.cargoId === c.id)
    const audit = validatePlan(placed, container, cargo)
    if (audit.ok || own.length > 0) candidates.push(placed)
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.filter(p => p.cargoId === c.id).length - a.filter(p => p.cargoId === c.id).length)
  const placed = candidates[0]
  return { placed, unplaced: completeUnplaced(cargo, placed) }
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

/**
 * First-stage production solver.
 *
 * This is deliberately a deterministic layered/extreme-point style heuristic:
 * physical foundation candidates are placed first, then support planes are
 * generated from existing cargo tops and edges. The hot loop uses cheap AABB
 * checks; the full application validator runs only once at the end.
 */
export function basePack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
): SolverResult {
  const validLocked = locked.filter(p => fits(p, container))

  // Strategy branching is based only on physical geometry/constraints. Cargo
  // labels such as pallet/carton/crate must never change solver behaviour.
  // Do not deliberately introduce floor gaps while solving the foundation.
  // Real gaps should emerge only when cargo dimensions/constraints require them.
  // Deterministic multi-start portfolio: each run keeps the same hard
  // constraints but changes the item ordering so mixed shipments are not
  // locked into one greedy sequence. Candidate plans are compared globally.
  const requestedUnits = cargo.reduce((sum, c) => sum + Math.max(0, Math.floor(c.quantity)), 0)
  const orderPortfolio: HeuristicOptions['order'][] = requestedUnits > 160
    ? ['area', 'volume', 'weight']
    : requestedUnits > 80
      ? ['area', 'volume', 'weight', 'longest-side']
      : ['area', 'volume', 'weight', 'height', 'longest-side', 'density']
  const strategies: HeuristicOptions[] = orderPortfolio.map(order => ({ gapStep: 0, order }))
  const results: Array<{ result: SolverResult; options: HeuristicOptions }> = []

  // Fast path before launching the general 3D search: a complete homogeneous
  // floor grid is already the best first-stage answer for this simple case.
  // This prevents the expensive general heuristic from delaying a solution
  // that can be constructed directly from the container dimensions.
  const gridCandidate = homogeneousGridCandidate(cargo, container, validLocked)
  if (gridCandidate) {
    const requested = cargo.reduce((sum, c) => sum + Math.max(0, Math.floor(c.quantity)), 0)
    const placedRequested = gridCandidate.placed.filter(p => cargo.some(c => c.id === p.cargoId)).length
    const gridAudit = validatePlan(gridCandidate.placed, container, cargo)
    if (placedRequested >= requested && gridAudit.ok) {
      progress?.(100)
      return gridCandidate
    }
  }

  for (let i = 0; i < strategies.length; i += 1) {
    const branchProgress = (p: number) => progress?.(Math.round((i * 100 + p) / strategies.length))
    const result = heuristicPack(cargo, container, validLocked, branchProgress, strategies[i])
    results.push({ result, options: strategies[i] })
  }

  if (gridCandidate) {
    // If the fast path cannot fit everything, keep it as another candidate
    // for comparison with the general 3D solvers.
    results.push({ result: gridCandidate, options: { gapStep: 0 } })
  }

  let result = chooseBest(results, container, cargo)

  // Run an independent open-source corner-point solver as a second candidate.
  // It is accepted only when our stricter app-specific validator approves it;
  // then the existing objective chooses the better of the two valid plans.
  // Run a small, bounded portfolio of deterministic item orderings. The
  // corner-point heuristic is order-sensitive; trying volume, floor footprint,
  // and weight order catches different layouts without launching an unbounded
  // search. Keep only the best candidate under the same app-owned objective.
  const candidateOrders: Array<'volume' | 'footprint' | 'weight'> = ['volume', 'footprint', 'weight']
  for (let i = 0; i < candidateOrders.length; i += 1) {
    const openSourceCandidate = openSourcePackCandidate(cargo, container, validLocked, candidateOrders[i])
    if (!openSourceCandidate) continue
    const candidateResult: SolverResult = {
      placed: openSourceCandidate,
      unplaced: completeUnplaced(cargo, openSourceCandidate),
    }
    // Never let an infeasible open-source layout displace a valid plan.
    // Candidate generation is advisory; the application validator owns the
    // final geometry, support, stacking and payload rules.
    if (
      validatePlan(candidateResult.placed, container, cargo).ok &&
      planQuality(candidateResult, container, cargo) > planQuality(result, container, cargo)
    ) {
      result = candidateResult
    }
    progress?.(Math.round(75 + ((i + 1) / candidateOrders.length) * 25))
  }

  // Never expose an invalid automatic result. If the final audit rejects
  // anything, keep the valid locked state and let the unplaced list reflect
  // the rejected units.
  const audit = validatePlan(result.placed, container, cargo)
  if (audit.ok) return { placed: result.placed, unplaced: completeUnplaced(cargo, result.placed) }

  const bad = new Set(audit.errors.map(e => e.split(':', 1)[0]))
  const placed = result.placed.filter(p => p.locked || !bad.has(p.id))
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
  // Kept for callers that still use the synchronous compatibility API.
  // The browser-facing path uses the worker in packer.ts.
  const result = basePack(cargo, container, locked, p => {
    if (!signal?.aborted) progress?.(p)
  })
  if (signal?.aborted) throw new Error('Packing cancelled')
  return result
}
