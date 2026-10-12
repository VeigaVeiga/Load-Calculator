import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'
import { openSourcePackCandidate } from './openSourceSolver'

export type SolverResult = {
  placed: PlacedCargo[]
  unplaced: Cargo[]
}

function completeUnplaced(cargo: Cargo[], placed: PlacedCargo[]): Cargo[] {
  const counts = new Map<string, number>()
  for (const item of placed) counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1)

  const missing: Cargo[] = []
  for (const item of cargo) {
    const count = Math.max(0, Math.floor(item.quantity)) - (counts.get(item.id) ?? 0)
    for (let i = 0; i < count; i += 1) missing.push(item)
  }
  return missing
}

function score(placed: PlacedCargo[], container: Container) {
  const volume = placed.reduce((sum, p) => sum + p.length * p.width * p.height, 0)
  const weight = placed.reduce((sum, p) => sum + Math.max(0, p.weight), 0)
  const totalWeight = Math.max(1, weight)
  const cgX = placed.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weight, 0) / totalWeight
  const cgY = placed.reduce((sum, p) => sum + (p.y + p.width / 2) * p.weight, 0) / totalWeight
  const balance = Math.abs(cgX - container.length / 2) + Math.abs(cgY - container.width / 2)
  return [placed.length, volume, -balance]
}

/**
 * Automatic packing is delegated to the MIT-licensed binpack3d library
 * (a TypeScript port of py3dbp's corner-point heuristic). We run a small,
 * deterministic portfolio of its supported item orderings, then apply this
 * application's geometry/support validator as the final authority.
 *
 * The former in-house beam/layer/multi-start search is intentionally no
 * longer part of the automatic execution path. Product-specific rules can
 * be layered around this adapter later without rewriting the core packer.
 */
export function basePack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
): SolverResult {
  const requested = cargo.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0)
  const lockedValid = validatePlan(locked, container, cargo)
  if (!lockedValid.ok) {
    // Preserve user-authored placements; do not silently relocate or discard them.
    return { placed: [...locked], unplaced: completeUnplaced(cargo, locked) }
  }

  const orders = ['volume', 'footprint', 'weight'] as const
  let best: PlacedCargo[] = [...locked]
  let bestScore = score(best, container)

  for (let i = 0; i < orders.length; i += 1) {
    const candidate = openSourcePackCandidate(cargo, container, locked, orders[i])
    if (candidate) {
      const audit = validatePlan(candidate, container, cargo)
      if (audit.ok) {
        const candidateScore = score(candidate, container)
        let better = false
        for (let j = 0; j < candidateScore.length; j += 1) {
          if (candidateScore[j] === bestScore[j]) continue
          better = candidateScore[j] > bestScore[j]
          break
        }
        if (better) {
          best = candidate
          bestScore = candidateScore
        }
      }
    }
    progress?.(Math.round(((i + 1) / orders.length) * 95))
  }

  const result = { placed: best, unplaced: completeUnplaced(cargo, best) }
  // Never return a geometrically invalid automatic plan.
  if (!validatePlan(result.placed, container, cargo).ok) {
    return { placed: [...locked], unplaced: completeUnplaced(cargo, locked) }
  }
  progress?.(100)
  // Keep accounting deterministic even for duplicate cargo IDs or malformed quantities.
  if (result.placed.length + result.unplaced.length !== requested) {
    return { placed: result.placed, unplaced: completeUnplaced(cargo, result.placed) }
  }
  return result
}
