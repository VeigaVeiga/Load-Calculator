import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'
import { binpackingJsCandidate, openSourcePackCandidate } from './openSourceSolver'

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

function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function score(placed: PlacedCargo[], container: Container): [number, number, number] {
  const volume = placed.reduce((sum, p) => sum + p.length * p.width * p.height, 0)
  const weight = placed.reduce((sum, p) => sum + Math.max(0, p.weight), 0)
  const totalWeight = Math.max(1, weight)
  const cgX = placed.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weight, 0) / totalWeight
  const cgY = placed.reduce((sum, p) => sum + (p.y + p.width / 2) * p.weight, 0) / totalWeight
  const balance = Math.abs(cgX - container.length / 2) + Math.abs(cgY - container.width / 2)
  // Keep the maximum cargo count first, then prioritize the total CG being near the
  // geometric center, and use occupied volume as the final tie-breaker.
  return [placed.length, -balance, volume]
}


function compareScores(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

function annealingQuality(items: PlacedCargo[], container: Container) {
  const [count, negativeBalance, volume] = score(items, container)
  const containerVolume = Math.max(1, container.length * container.width * container.height)
  const normalizedVolume = volume / containerVolume
  const normalizedBalance = Math.max(0, negativeBalance) / Math.max(1, container.length + container.width)
  // Unit count is a hard priority; centering the mass is next; volume is a tie-breaker.
  return count * 1_000_000_000 + normalizedBalance * 1_000_000 + normalizedVolume * 1_000
}

type SequenceUnit = { key: string; volume: number; footprint: number; weight: number }

function mutateOrder(items: SequenceUnit[], random: () => number): SequenceUnit[] {
  const next = [...items]
  if (next.length < 2) return next
  const a = Math.floor(random() * next.length)
  const b = Math.floor(random() * next.length)
  const move = Math.floor(random() * 10)

  if (move < 4) {
    ;[next[a], next[b]] = [next[b], next[a]]
  } else if (move < 7) {
    const [item] = next.splice(a, 1)
    next.splice(b, 0, item)
  } else if (move < 9) {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const reversed = next.slice(lo, hi + 1).reverse()
    next.splice(lo, reversed.length, ...reversed)
  } else {
    const from = Math.floor(random() * Math.max(1, Math.floor(next.length / 2))) + Math.floor(next.length / 2)
    const to = Math.floor(random() * Math.max(1, Math.floor(next.length / 4)))
    const [item] = next.splice(Math.min(next.length - 1, from), 1)
    next.splice(Math.min(to, next.length), 0, item)
  }
  return next
}

/**
 * LoadZa-inspired refinement pass: simulated annealing searches cargo ordering,
 * while the existing open-source TypeScript solvers generate each candidate.
 * This is an adaptation of LoadZa's search strategy, not a line-for-line port
 * of its Python extreme-point solver. Every candidate is independently audited.
 */
function refineBySequenceSearch(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[],
  incumbent: PlacedCargo[],
  progress?: (percent: number) => void,
) {
  const totalUnits = cargo.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0)
  const iterations = totalUnits > 300 ? 4 : totalUnits > 150 ? 6 : totalUnits > 80 ? 8 : totalUnits > 40 ? 10 : 12
  const random = seededRandom(
    Math.round(container.length * 31 + container.width * 17 + totalUnits * 13 + cargo.length * 7),
  )
  // Search physical instances, not just SKU groups. This mirrors LoadZa's
  // item-permutation search while retaining the app's cargo IDs and constraints.
  let order: SequenceUnit[] = cargo.flatMap(item =>
    Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, (_, index) => ({
      key: item.id + '#' + (index + 1),
      volume: item.length * item.width * item.height,
      footprint: item.length * item.width,
      weight: Math.max(0, item.weight),
    })),
  ).sort((a, b) =>
    b.volume - a.volume || b.footprint - a.footprint || b.weight - a.weight || a.key.localeCompare(b.key),
  )
  const seed = openSourcePackCandidate(cargo, container, locked, 'sequence', order.map(item => item.key))
  if (!seed || !validatePlan(seed, container, cargo).ok) {
    return { placed: [...incumbent], quality: annealingQuality(incumbent, container), iterations: 0 }
  }
  let current = seed
  let currentQuality = annealingQuality(current, container)
  let best = [...incumbent]
  let bestScore = score(best, container)
  let bestQuality = annealingQuality(best, container)
  if (compareScores(score(current, container), bestScore) > 0) {
    best = [...current]
    bestScore = score(best, container)
    bestQuality = currentQuality
  }

  let temperature = 0.025
  const cooling = iterations > 0 ? Math.pow(0.001 / temperature, 1 / iterations) : 1
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const candidateOrder = mutateOrder(order, random)
    const candidate = openSourcePackCandidate(cargo, container, locked, 'sequence', candidateOrder.map(item => item.key))
    if (candidate && validatePlan(candidate, container, cargo).ok) {
      const candidateQuality = annealingQuality(candidate, container)
      const delta = candidateQuality - currentQuality
      if (delta >= 0 || random() < Math.exp(delta / Math.max(temperature, 1e-9))) {
        order = candidateOrder
        current = candidate
        currentQuality = candidateQuality
      }
      const candidateScore = score(candidate, container)
      if (compareScores(candidateScore, bestScore) > 0) {
        best = [...candidate]
        bestScore = candidateScore
        bestQuality = candidateQuality
      }
    }
    temperature *= cooling
    progress?.(30 + Math.round(((iteration + 1) / iterations) * 65))
  }
  return { placed: best, quality: bestQuality, iterations }
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
    progress?.(Math.round(((i + 1) / orders.length) * 24))
  }

  // A second, independent open-source pivot-based solver provides a
  // genuinely different candidate for shipments without manually locked items.
  if (locked.length === 0) {
    const candidate = binpackingJsCandidate(cargo, container)
    if (candidate && validatePlan(candidate, container, cargo).ok) {
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
  // Search cargo ordering with a bounded simulated-annealing pass inspired by
  // LoadZa's F5 improvement stage. Keep the best valid plan, never a worse one.
  if (requested > locked.length && cargo.length > 1) {
    const refined = refineBySequenceSearch(cargo, container, locked, best, progress)
    if (compareScores(score(refined.placed, container), bestScore) > 0) {
      best = refined.placed
      bestScore = score(best, container)
    }
  }
  progress?.(98)

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
