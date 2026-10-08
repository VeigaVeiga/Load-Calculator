import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'
import { heuristicPack } from './heuristicSolver'

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

/**
 * First-stage production solver.
 *
 * This is deliberately a deterministic layered/extreme-point style heuristic:
 * large footprint cargo is placed first, then candidate support planes are
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
  const result = heuristicPack(cargo, container, validLocked, progress)

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
