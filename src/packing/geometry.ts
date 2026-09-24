import type { Container, PlacedCargo, ValidationResult } from '../types'

export function dims(p: Pick<PlacedCargo, 'length' | 'width' | 'rotation'>) {
  const quarterTurns = Math.abs(Math.round(p.rotation / 90)) % 2
  if (quarterTurns === 0) {
    return { length: p.length, width: p.width }
  }
  return { length: p.width, width: p.length }
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
    A.x1 < B.x2 && A.x2 > B.x1 &&
    A.y1 < B.y2 && A.y2 > B.y1 &&
    A.z1 < B.z2 && A.z2 > B.z1
  )
}

export function footprintOverlap(a: PlacedCargo, b: PlacedCargo) {
  const A = bounds(a)
  const B = bounds(b)
  return A.x1 < B.x2 && A.x2 > B.x1 && A.y1 < B.y2 && A.y2 > B.y1
}

export function inBounds(p: PlacedCargo, c: Container) {
  const d = dims(p)
  return (
    p.x >= 0 && p.y >= 0 && p.z >= 0 &&
    p.x + d.length <= c.length &&
    p.y + d.width <= c.width &&
    p.z + p.height <= c.height
  )
}

type Rect = { x1: number; x2: number; y1: number; y2: number }

function intersection(a: PlacedCargo, b: PlacedCargo): Rect | null {
  const A = bounds(a)
  const B = bounds(b)
  const x1 = Math.max(A.x1, B.x1)
  const x2 = Math.min(A.x2, B.x2)
  const y1 = Math.max(A.y1, B.y1)
  const y2 = Math.min(A.y2, B.y2)
  return x2 > x1 && y2 > y1 ? { x1, x2, y1, y2 } : null
}

function unionArea(rects: Rect[]) {
  if (rects.length === 0) return 0
  const xs = [...new Set(rects.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i]
    const x2 = xs[i + 1]
    if (x2 <= x1) continue
    const ys = rects.filter((r) => r.x1 < x2 && r.x2 > x1).flatMap((r) => [r.y1, r.y2]).sort((a, b) => a - b)
    let covered = 0
    for (let j = 0; j + 1 < ys.length; j += 2) {
      const y1 = ys[j]
      const y2 = ys[j + 1]
      if (y2 > y1) covered += y2 - y1
    }
    area += (x2 - x1) * covered
  }
  return area
}

export function supportRatio(p: PlacedCargo, others: PlacedCargo[]) {
  if (p.z <= 2) return 1
  const d = dims(p)
  const area = d.length * d.width
  const rects: Rect[] = []
  for (const q of others) {
    if (q.id === p.id || Math.abs(q.z + q.height - p.z) > 3) continue
    const r = intersection(p, q)
    if (r) rects.push(r)
  }
  return Math.min(1, unionArea(rects) / Math.max(1, area))
}

export function validatePlacement(p: PlacedCargo, c: Container, others: PlacedCargo[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // TransformControls commits rotation and position as two React updates in the
  // current UI. When only rotation changed at the old position, allow that
  // transient state; the following position update validates the final state.
  const previous = others.find((q) => q.id === p.id)
  const rotationOnlyTransition = !!previous &&
    previous.x === p.x && previous.y === p.y && previous.z === p.z &&
    previous.rotation !== p.rotation

  if (!rotationOnlyTransition && !inBounds(p, c)) {
    errors.push('超出集装箱内部尺寸')
  }

  if (!rotationOnlyTransition && others.some((q) => q.id !== p.id && overlap(p, q))) {
    errors.push('与其他货物发生碰撞')
  }

  if (p.z > 2) {
    const sr = supportRatio(p, others)
    if (sr < 0.95) warnings.push(`支撑面积不足 ${Math.round(sr * 100)}%`)
    if (sr <= 0) warnings.push('货物处于悬空位置，请检查支撑')
  }

  return { ok: errors.length === 0, errors, warnings }
}
