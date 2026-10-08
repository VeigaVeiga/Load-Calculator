import type { Container, PlacedCargo } from '../types'
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

const EPS = 0.5

function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function weightedDistributionScore(items: PlacedCargo[], container: Container) {
  const a = analyzeWeight(items, container)
  const total = Math.max(1, a.total)
  const cx = container.length / 2
  const cy = container.width / 2

  // CG is the primary target. Longitudinal balance is slightly more important
  // than lateral balance for a container, while both remain normalized.
  const cgX = Math.abs(a.cg.x - cx) / Math.max(1, cx)
  const cgY = Math.abs(a.cg.y - cy) / Math.max(1, cy)

  // Divide the floor into four longitudinal/lateral zones. This catches plans
  // whose single CG looks acceptable but leave one corner excessively heavy.
  const target = total / 4
  const q = a.corners
  const quadrant = (
    Math.abs(q.fl - target) +
    Math.abs(q.fr - target) +
    Math.abs(q.rl - target) +
    Math.abs(q.rr - target)
  ) / total

  // Keep the weighted center of gravity low. This is a soft objective only:
  // packing feasibility and item count are never traded for it.
  const cgZ = Math.abs(a.cg.z - container.height * 0.25) / Math.max(1, container.height)

  // Penalize concentration in the first/last 20% of the container.
  let front = 0
  let rear = 0
  for (const p of items) {
    const d = dims(p)
    const center = p.x + d.length / 2
    if (center < container.length * 0.2) front += p.weight
    if (center > container.length * 0.8) rear += p.weight
  }
  const endImbalance = Math.abs(front - rear) / total

  return cgX * 55 + cgY * 35 + quadrant * 12 + cgZ * 4 + endImbalance * 8
}

function objective(items: PlacedCargo[], container: Container) {
  const validation = validatePlan(items, container)
  if (!validation.ok) return 1_000_000 + validation.errors.length * 10_000

  // Preserve the original number of loaded units as an absolute constraint.
  // This optimizer is not allowed to "solve" imbalance by throwing cargo out.
  return weightedDistributionScore(items, container)
}

function floorMovable(items: PlacedCargo[]) {
  return items
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.locked && p.z <= EPS)
}

function candidateTranslate(
  items: PlacedCargo[],
  index: number,
  x: number,
  y: number,
  container: Container,
) {
  const p = items[index]
  if (!p || p.locked || p.z > EPS) return null
  const d = dims(p)
  if (x < -EPS || y < -EPS || x + d.length > container.length + EPS || y + d.width > container.width + EPS) return null
  const next = items.map((q) => ({ ...q }))
  next[index] = {
    ...p,
    x: Math.round(x / 10) * 10,
    y: Math.round(y / 10) * 10,
    placementMode: 'automatic',
  }
  return next
}

function candidateSwap(items: PlacedCargo[], aIndex: number, bIndex: number) {
  const a = items[aIndex]
  const b = items[bIndex]
  if (!a || !b || a.locked || b.locked || a.z > EPS || b.z > EPS) return null

  const ad = dims(a)
  const bd = dims(b)
  const next = items.map((p) => ({ ...p }))
  next[aIndex] = {
    ...a,
    x: b.x,
    y: b.y,
    rotation: a.rotation,
    placementMode: 'automatic',
  }
  next[bIndex] = {
    ...b,
    x: a.x,
    y: a.y,
    rotation: b.rotation,
    placementMode: 'automatic',
  }

  // Different footprints may not fit the other's old slot. Validation below
  // decides feasibility, but this cheap bound check avoids many full audits.
  if (
    next[aIndex].x + ad.length > Number.MAX_SAFE_INTEGER ||
    next[bIndex].x + bd.length > Number.MAX_SAFE_INTEGER
  ) return null
  return next
}

function candidateRotate(items: PlacedCargo[], index: number, container: Container) {
  const p = items[index]
  if (!p || p.locked || p.z > EPS || p.rotatable === false || p.length === p.width) return null
  const rotation = p.rotation % 180 === 0 ? 90 : 0
  const d = dims({ ...p, rotation })
  const x = Math.min(p.x, container.length - d.length)
  const y = Math.min(p.y, container.width - d.width)
  if (x < -EPS || y < -EPS) return null
  const next = items.map((q) => ({ ...q }))
  next[index] = {
    ...p,
    rotation,
    x: Math.max(0, Math.round(x / 10) * 10),
    y: Math.max(0, Math.round(y / 10) * 10),
    placementMode: 'automatic',
  }
  return next
}

function validateCandidate(items: PlacedCargo[], container: Container, expectedCount: number) {
  if (items.length !== expectedCount) return false
  return validatePlan(items, container).ok
}

function generateAnchors(
  items: PlacedCargo[],
  index: number,
  container: Container,
) {
  const p = items[index]
  const d = dims(p)
  const xs = new Set<number>([
    0,
    Math.max(0, container.length - d.length),
    Math.max(0, Math.round((container.length - d.length) / 2 / 10) * 10),
    p.x,
  ])
  const ys = new Set<number>([
    0,
    Math.max(0, container.width - d.width),
    Math.max(0, Math.round((container.width - d.width) / 2 / 10) * 10),
    p.y,
  ])

  for (const q of items) {
    if (q.id === p.id || q.z > EPS) continue
    const qd = dims(q)
    xs.add(Math.round(q.x / 10) * 10)
    xs.add(Math.round((q.x + qd.length - d.length) / 10) * 10)
    xs.add(Math.round((q.x + qd.length) / 10) * 10)
    ys.add(Math.round(q.y / 10) * 10)
    ys.add(Math.round((q.y + qd.width - d.width) / 10) * 10)
    ys.add(Math.round((q.y + qd.width) / 10) * 10)
  }

  return [...xs].filter((x) => x >= 0 && x + d.length <= container.length + EPS)
    .flatMap((x) => [...ys].filter((y) => y >= 0 && y + d.width <= container.width + EPS).map((y) => [x, y] as [number, number]))
}

export async function optimizeLoad(
  initial: PlacedCargo[],
  container: Container,
  options: OptimizeOptions = {},
): Promise<OptimizationResult> {
  if (initial.length < 2) {
    const score = objective(initial, container)
    return { placed: initial.map((p) => ({ ...p })), iterations: 0, improved: false, scoreBefore: score, scoreAfter: score }
  }

  const maxIterations = Math.max(100, options.maxIterations ?? 700)
  const rng = seededRandom(
    Math.round(container.length * 31 + container.width * 17 + initial.length * 13),
  )
  const expectedCount = initial.length
  const before = objective(initial, container)

  let current = initial.map((p) => ({ ...p }))
  let currentScore = before
  let best = current.map((p) => ({ ...p }))
  let bestScore = before

  const movable = floorMovable(current)
  if (movable.length === 0) {
    return { placed: best, iterations: 0, improved: false, scoreBefore: before, scoreAfter: before }
  }

  // Start with deterministic physically meaningful anchors. This gives the
  // optimizer a useful basin before stochastic exploration begins.
  for (const { i } of movable) {
    const anchors = generateAnchors(current, i, container)
    let localBest = current
    let localScore = currentScore
    for (const [x, y] of anchors) {
      const candidate = candidateTranslate(current, i, x, y, container)
      if (!candidate || !validateCandidate(candidate, container, expectedCount)) continue
      const score = objective(candidate, container)
      if (score + 1e-9 < localScore) {
        localBest = candidate
        localScore = score
      }
    }
    if (localScore < currentScore) {
      current = localBest
      currentScore = localScore
      if (localScore < bestScore) {
        best = localBest.map((p) => ({ ...p }))
        bestScore = localScore
      }
    }
  }

  let temperature = Math.max(0.25, currentScore * 0.18)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (options.signal?.aborted) throw new Error('Load optimization cancelled')

    const active = floorMovable(current)
    if (!active.length) break

    const selected = active[Math.floor(rng() * active.length)]
    const kind = rng()
    let candidate: PlacedCargo[] | null = null

    if (kind < 0.52) {
      const anchors = generateAnchors(current, selected.i, container)
      if (anchors.length) {
        const anchor = anchors[Math.floor(rng() * anchors.length)]
        candidate = candidateTranslate(current, selected.i, anchor[0], anchor[1], container)
      }
    } else if (kind < 0.78 && active.length > 1) {
      const other = active[Math.floor(rng() * active.length)]
      if (other.i !== selected.i) candidate = candidateSwap(current, selected.i, other.i)
    } else if (kind < 0.92) {
      const step = (1 + Math.floor(rng() * 10)) * 100
      const dx = (rng() < 0.5 ? -step : step)
      const dy = (rng() < 0.5 ? -step : step)
      const p = current[selected.i]
      candidate = candidateTranslate(
        current,
        selected.i,
        Math.max(0, Math.min(container.length - dims(p).length, p.x + dx)),
        Math.max(0, Math.min(container.width - dims(p).width, p.y + dy)),
        container,
      )
    } else {
      candidate = candidateRotate(current, selected.i, container)
    }

    if (!candidate || !validateCandidate(candidate, container, expectedCount)) {
      if ((iteration & 15) === 0) options.progress?.(Math.round((iteration / maxIterations) * 100))
      continue
    }

    const score = objective(candidate, container)
    const delta = score - currentScore
    const accept = delta <= 0 || rng() < Math.exp(-delta / Math.max(0.02, temperature))

    if (accept) {
      current = candidate
      currentScore = score
    }

    if (score + 1e-9 < bestScore) {
      best = candidate.map((p) => ({ ...p }))
      bestScore = score
    }

    temperature = Math.max(0.02, temperature * 0.993)

    if ((iteration & 15) === 0) {
      options.progress?.(Math.round((iteration / maxIterations) * 100))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const final = bestScore + 1e-9 < before ? best : initial.map((p) => ({ ...p }))
  return {
    placed: final,
    iterations: maxIterations,
    improved: bestScore + 1e-9 < before,
    scoreBefore: before,
    scoreAfter: objective(final, container),
  }
}
