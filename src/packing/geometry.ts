import type { Cargo, Container, PlacedCargo, ValidationResult } from '../types'

const EPS = 0.5
const SUPPORT_THRESHOLD = 0.75

export function dims(p: Pick<PlacedCargo, 'length' | 'width' | 'rotation'>) {
  return Math.abs(Math.round(p.rotation / 90)) % 2 === 0
    ? { length: p.length, width: p.width }
    : { length: p.width, width: p.length }
}

export function bounds(p: PlacedCargo) {
  const d = dims(p)
  return {
    x1: p.x,
    x2: p.x + d.length,
    y1: p.y,
    y2: p.y + d.width,
    z1: p.z,
    z2: p.z + p.height,
  }
}

export function overlap(a: PlacedCargo, b: PlacedCargo) {
  const A = bounds(a)
  const B = bounds(b)
  return (
    A.x1 < B.x2 - EPS &&
    A.x2 > B.x1 + EPS &&
    A.y1 < B.y2 - EPS &&
    A.y2 > B.y1 + EPS &&
    A.z1 < B.z2 - EPS &&
    A.z2 > B.z1 + EPS
  )
}

export function footprintOverlap(a: PlacedCargo, b: PlacedCargo) {
  const A = bounds(a)
  const B = bounds(b)
  return A.x1 < B.x2 - EPS && A.x2 > B.x1 + EPS && A.y1 < B.y2 - EPS && A.y2 > B.y1 + EPS
}

export function inBounds(p: PlacedCargo, c: Container) {
  const d = dims(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS &&
    p.x + d.length <= c.length + EPS &&
    p.y + d.width <= c.width + EPS &&
    p.z + p.height <= c.height + EPS
}

type Rect = { x1: number; x2: number; y1: number; y2: number }

function intersection(a: PlacedCargo, b: PlacedCargo): Rect | null {
  const A = bounds(a)
  const B = bounds(b)
  const x1 = Math.max(A.x1, B.x1)
  const x2 = Math.min(A.x2, B.x2)
  const y1 = Math.max(A.y1, B.y1)
  const y2 = Math.min(A.y2, B.y2)
  return x2 > x1 + EPS && y2 > y1 + EPS ? { x1, x2, y1, y2 } : null
}

function unionArea(rects: Rect[]) {
  if (!rects.length) return 0
  const xs = [...new Set(rects.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i]
    const x2 = xs[i + 1]
    if (x2 <= x1 + EPS) continue
    const intervals = rects
      .filter((r) => r.x1 < x2 - EPS && r.x2 > x1 + EPS)
      .map((r) => [r.y1, r.y2] as [number, number])
      .sort((a, b) => a[0] - b[0])
    let cursor = -Infinity
    let covered = 0
    for (const [y1, y2] of intervals) {
      if (y2 <= cursor + EPS) continue
      if (y1 > cursor + EPS) covered += y2 - y1
      else covered += Math.max(0, y2 - cursor)
      cursor = Math.max(cursor, y2)
    }
    area += (x2 - x1) * covered
  }
  return area
}

export function supportRatio(p: PlacedCargo, others: PlacedCargo[]) {
  if (p.z <= EPS) return 1
  const d = dims(p)
  const baseArea = d.length * d.width
  if (baseArea <= 0) return 0
  const rects = others
    .filter((q) => q.id !== p.id && Math.abs(q.z + q.height - p.z) <= EPS)
    .map((q) => intersection(p, q))
    .filter((r): r is Rect => !!r)
  return Math.min(1, unionArea(rects) / baseArea)
}

function cargoFor(p: PlacedCargo, cargoById?: Map<string, Cargo>) {
  return cargoById?.get(p.cargoId)
}

function isStackable(p: PlacedCargo, cargoById?: Map<string, Cargo>) {
  const c = cargoFor(p, cargoById)
  return c?.stackable ?? p.stackable ?? true
}

function isLoadBearing(p: PlacedCargo, cargoById?: Map<string, Cargo>) {
  const c = cargoFor(p, cargoById)
  return c?.loadBearing ?? p.loadBearing ?? true
}

function maxTopLoad(p: PlacedCargo, cargoById?: Map<string, Cargo>) {
  const c = cargoFor(p, cargoById)
  return c?.maxLoadOnTop ?? p.maxLoadOnTop ?? 0
}

function maxLayers(p: PlacedCargo, cargoById?: Map<string, Cargo>) {
  const c = cargoFor(p, cargoById)
  return c?.maxStackLayers ?? p.maxStackLayers ?? 0
}

function supporters(p: PlacedCargo, others: PlacedCargo[], cargoById?: Map<string, Cargo>) {
  return others.filter((q) =>
    Math.abs(q.z + q.height - p.z) <= EPS &&
    isStackable(q, cargoById) &&
    isLoadBearing(q, cargoById) &&
    footprintOverlap(p, q)
  )
}

function stackDepth(p: PlacedCargo, others: PlacedCargo[], cargoById?: Map<string, Cargo>, seen = new Set<string>()): number {
  if (p.z <= EPS) return 1
  if (seen.has(p.id)) return 999
  seen.add(p.id)
  const ss = supporters(p, others, cargoById)
  if (!ss.length) return 999
  return 1 + Math.max(...ss.map((q) => stackDepth(q, others, cargoById, new Set(seen))))
}

function transferredLoad(p: PlacedCargo, all: PlacedCargo[], cargoById?: Map<string, Cargo>, seen = new Set<string>()): number {
  if (seen.has(p.id)) return p.weight
  const nextSeen = new Set(seen)
  nextSeen.add(p.id)
  const above = all.filter((q) =>
    q.id !== p.id &&
    Math.abs(q.z - (p.z + p.height)) <= EPS &&
    footprintOverlap(q, p)
  )
  return p.weight + above.reduce((sum, q) => {
    const area = overlapFootprintArea(q, p)
    const ratio = area / Math.max(EPS, dims(q).length * dims(q).width)
    return sum + transferredLoad(q, all, cargoById, nextSeen) * Math.min(1, ratio)
  }, 0)
}

function overlapFootprintArea(a: PlacedCargo, b: PlacedCargo) {
  const A = bounds(a)
  const B = bounds(b)
  return Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1)) *
    Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1))
}

function validateStacking(p: PlacedCargo, others: PlacedCargo[], cargoById?: Map<string, Cargo>) {
  const errors: string[] = []
  if (p.z <= EPS) return errors

  const ss = supporters(p, others, cargoById)
  if (!ss.length) {
    errors.push('货物处于悬空位置，请检查支撑')
    return errors
  }

  const ratio = supportRatio(p, others)
  if (ratio + EPS < SUPPORT_THRESHOLD) errors.push('支撑面积不足')

  for (const q of ss) {
    const limit = maxTopLoad(q, cargoById)
    if (limit > 0 && transferredLoad(q, others.concat(p), cargoById) - q.weight > limit + EPS) {
      errors.push('超过下方货物允许的顶部承重')
    }
    const layers = maxLayers(q, cargoById)
    if (layers > 0 && stackDepth(p, others.concat(q), cargoById) > layers) {
      errors.push('超过货物允许的最大堆叠层数')
    }
  }
  return errors
}

export function validatePlacement(
  p: PlacedCargo,
  c: Container,
  others: PlacedCargo[],
  cargoById?: Map<string, Cargo>,
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!inBounds(p, c)) errors.push('超出集装箱内部尺寸')
  if (others.some((q) => q.id !== p.id && overlap(p, q))) errors.push('与其他货物发生碰撞')

  const stackingErrors = validateStacking(p, others.filter((q) => q.id !== p.id), cargoById)
  errors.push(...stackingErrors)

  if (c.maxPayload > 0) {
    const total = others.filter((q) => q.id !== p.id).reduce((sum, q) => sum + q.weight, 0) + p.weight
    if (total > c.maxPayload + EPS) errors.push('超过集装箱最大载重')
  }

  if (p.z > EPS && supportRatio(p, others) < 0.95 && supportRatio(p, others) >= SUPPORT_THRESHOLD) {
    warnings.push('支撑面积低于 95%')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function validatePlan(items: PlacedCargo[], c: Container, cargo: Cargo[] = []) {
  const errors: string[] = []
  const cargoById = new Map(cargo.map((x) => [x.id, x]))

  const total = items.reduce((sum, p) => sum + p.weight, 0)
  if (c.maxPayload > 0 && total > c.maxPayload + EPS) errors.push('超过集装箱最大载重')

  for (let i = 0; i < items.length; i += 1) {
    const p = items[i]
    const result = validatePlacement(p, c, items.filter((_, j) => j !== i), cargoById)
    errors.push(...result.errors.map((x) => p.id + ': ' + x))
  }

  return { ok: errors.length === 0, errors }
}
