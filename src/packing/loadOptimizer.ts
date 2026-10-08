import type { Cargo, Container, PlacedCargo } from '../types'
import { analyzeWeight } from '../analysis/weight'
import { dims, validatePlan } from './geometry'

export type OptimizationResult = {
  placed: PlacedCargo[]
  iterations: number
  improved: boolean
  scoreBefore: number
  scoreAfter: number
}

type OptimizeOptions = {
  signal?: AbortSignal
  progress?: (percent: number) => void
  maxIterations?: number
}

function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function imbalanceScore(items: PlacedCargo[], container: Container) {
  const a = analyzeWeight(items, container)
  const x = Math.abs(a.cg.x - container.length / 2) / Math.max(1, container.length / 2)
  const y = Math.abs(a.cg.y - container.width / 2) / Math.max(1, container.width / 2)
  const q = a.corners
  const total = Math.max(1, a.total)
  const target = total / 4
  const quadrant = (Math.abs(q.fl - target) + Math.abs(q.fr - target) + Math.abs(q.rl - target) + Math.abs(q.rr - target)) / total
  return x * 55 + y * 35 + quadrant * 10
}

function objective(items: PlacedCargo[], container: Container) {
  const validation = validatePlan(items, container)
  if (!validation.ok) return 1000000 + validation.errors.length * 1000
  return imbalanceScore(items, container)
}

function centerTranslate(items: PlacedCargo[], container: Container) {
  if (!items.length || items.some((p) => p.locked)) return items

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of items) {
    const d = dims(p)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + d.length)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + d.width)
  }

  const dx = Math.round(((container.length - (maxX - minX)) / 2 - minX) / 10) * 10
  const dy = Math.round(((container.width - (maxY - minY)) / 2 - minY) / 10) * 10

  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return items
  return items.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
}

function swapCandidate(items: PlacedCargo[], aIndex: number, bIndex: number) {
  const a = items[aIndex]
  const b = items[bIndex]
  if (!a || !b || a.locked || b.locked) return null

  const next = items.map((p) => ({ ...p }))
  next[aIndex] = { ...a, x: b.x, y: b.y, placementMode: 'automatic' }
  next[bIndex] = { ...b, x: a.x, y: a.y, placementMode: 'automatic' }
  return next
}

function shiftCandidate(items: PlacedCargo[], index: number, dx: number, dy: number, container: Container) {
  const p = items[index]
  if (!p || p.locked || p.z > 0.5) return null
  const next = items.map((q) => ({ ...q }))
  const d = dims(p)
  next[index] = {
    ...p,
    x: Math.max(0, Math.min(container.length - d.length, p.x + dx)),
    y: Math.max(0, Math.min(container.width - d.width, p.y + dy)),
    placementMode: 'automatic',
  }
  return next
}

function rotationCandidate(items: PlacedCargo[], index: number, container: Container) {
  const p = items[index]
  if (!p || p.locked || p.rotatable === false || p.z > 0.5 || p.length === p.width) return null
  const next = items.map((q) => ({ ...q }))
  const rotation = p.rotation % 180 === 0 ? 90 : 0
  const d = dims({ ...p, rotation })
  next[index] = {
    ...p,
    rotation,
    x: Math.max(0, Math.min(container.length - d.length, p.x)),
    y: Math.max(0, Math.min(container.width - d.width, p.y)),
    placementMode: 'automatic',
  }
  return next
}

function validCandidate(items: PlacedCargo[], container: Container) {
  const plan = validatePlan(items, container)
  return plan.ok
}

export async function optimizeLoad(
  initial: PlacedCargo[],
  container: Container,
  options: OptimizeOptions = {},
): Promise<OptimizationResult> {
  const maxIterations = Math.max(100, options.maxIterations ?? 700)
  const rng = seededRandom(Math.round(container.length * 31 + container.width * 17 + initial.length * 13))

  let current = centerTranslate(initial, container)
  if (!validCandidate(current, container)) current = initial.map((p) => ({ ...p }))

  let currentScore = objective(current, container)
  let best = current.map((p) => ({ ...p }))
  let bestScore = currentScore
  let temperature = Math.max(0.5, currentScore * 0.35)

  const movable = current.map((p, i) => ({ p, i })).filter(({ p }) => !p.locked && p.z <= 0.5)
  if (movable.length < 2) {
    return { placed: current, iterations: 0, improved: bestScore < objective(initial, container), scoreBefore: objective(initial, container), scoreAfter: bestScore }
  }

  const before = objective(initial, container)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (options.signal?.aborted) throw new Error('Load optimization cancelled')

    const kind = rng()
    let candidate: PlacedCargo[] | null = null

    if (kind < 0.48) {
      const a = movable[Math.floor(rng() * movable.length)].i
      let b = movable[Math.floor(rng() * movable.length)].i
      if (a === b) b = movable[(movable.findIndex((x) => x.i === a) + 1) % movable.length]?.i ?? a
      candidate = swapCandidate(current, a, b)
    } else if (kind < 0.9) {
      const a = movable[Math.floor(rng() * movable.length)].i
      const step = 100 + Math.round(rng() * 900 / 10) * 10
      const dx = (rng() < 0.5 ? -1 : 1) * step
      const dy = (rng() < 0.5 ? -1 : 1) * step
      candidate = shiftCandidate(current, a, dx, dy, container)
    } else {
      const a = movable[Math.floor(rng() * movable.length)].i
      candidate = rotationCandidate(current, a, container)
    }

    if (!candidate || !validCandidate(candidate, container)) {
      if ((iteration & 15) === 0) options.progress?.(Math.round((iteration / maxIterations) * 100))
      continue
    }

    const score = objective(candidate, container)
    const delta = score - currentScore
    const accept = delta <= 0 || rng() < Math.exp(-delta / Math.max(0.05, temperature))

    if (accept) {
      current = candidate
      currentScore = score
    }
    if (score < bestScore) {
      best = candidate.map((p) => ({ ...p }))
      bestScore = score
    }

    temperature *= 0.992
    if (temperature < 0.05) temperature = 0.05

    if ((iteration & 15) === 0) {
      options.progress?.(Math.round((iteration / maxIterations) * 100))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  // Never return a result worse than the original plan.
  const final = bestScore < before ? best : initial.map((p) => ({ ...p }))
  return {
    placed: final,
    iterations: maxIterations,
    improved: bestScore < before,
    scoreBefore: before,
    scoreAfter: objective(final, container),
  }
}
