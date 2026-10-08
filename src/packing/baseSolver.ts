import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'
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



function planVolume(placed: PlacedCargo[]) {
  return placed.reduce((sum, p) => {
    const d = dimsFor(p)
    return sum + d.length * d.width * p.height
  }, 0)
}

function planQuality(result: SolverResult, container: Container) {
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
  return placed.length * 1_000_000_000 +
    volume * 10 +
    totalWeight * 0.01 -
    centerPenalty * 100_000 -
    levelPenalty * 0.1 -
    Math.abs(cgZ - container.height * 0.25) * 0.001
}

function chooseBest(results: Array<{ result: SolverResult; options: HeuristicOptions }>, container: Container) {
  let best = results[0]?.result
  let bestScore = best ? planQuality(best, container) : -Infinity

  for (let i = 1; i < results.length; i += 1) {
    const candidate = results[i].result
    const candidateScore = planQuality(candidate, container)
    if (candidateScore > bestScore) {
      best = candidate
      bestScore = candidateScore
    }
  }

  return best ?? { placed: [], unplaced: [] }
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
  const signatures = new Set(cargo.map(c => [
    c.length, c.width, c.height,
    c.stackable, c.loadBearing, c.rotatable,
    c.maxStackLayers, c.maxLoadOnTop,
  ].join('|')))
  const mixed = signatures.size > 1
  const strategies: HeuristicOptions[] = mixed ? [{ gapStep: 0 }, { gapStep: 10 }, { gapStep: 20 }] : [{ gapStep: 0 }]
  const results: Array<{ result: SolverResult; options: HeuristicOptions }> = []

  for (let i = 0; i < strategies.length; i += 1) {
    const branchProgress = (p: number) => progress?.(Math.round((i * 100 + p) / strategies.length))
    const result = heuristicPack(cargo, container, validLocked, branchProgress, strategies[i])
    results.push({ result, options: strategies[i] })
  }

  const result = chooseBest(results, container)

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
