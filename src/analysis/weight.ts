import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'

export interface WeightAnalysis {
  total: number
  cg: { x: number; y: number; z: number }
  front: number
  rear: number
  left: number
  right: number
  corners: { fl: number; fr: number; rl: number; rr: number }
  balanceScore: number
}

export function analyzeWeight(items: PlacedCargo[], c: Container): WeightAnalysis {
  const total = items.reduce((sum, p) => sum + p.weight, 0)
  const moment = { x: 0, y: 0, z: 0 }

  for (const p of items) {
    const d=dims(p)
    moment.x += p.weight * (p.x + d.length / 2)
    moment.y += p.weight * (p.y + d.width / 2)
    moment.z += p.weight * (p.z + p.height / 2)
  }

  const cg = {
    x: total ? moment.x / total : c.length / 2,
    y: total ? moment.y / total : c.width / 2,
    z: total ? moment.z / total : 0,
  }

  let front = 0
  let rear = 0
  let left = 0
  let right = 0
  const corners = { fl: 0, fr: 0, rl: 0, rr: 0 }

  for (const p of items) {
    const d=dims(p)
    const x = p.x + d.length / 2
    const y = p.y + d.width / 2
    const isFront = x < c.length / 2
    const isLeft = y < c.width / 2

    if (isFront) front += p.weight
    else rear += p.weight

    if (isLeft) left += p.weight
    else right += p.weight

    if (isFront && isLeft) corners.fl += p.weight
    else if (isFront && !isLeft) corners.fr += p.weight
    else if (!isFront && isLeft) corners.rl += p.weight
    else corners.rr += p.weight
  }

  const xImbalance = total ? Math.abs(front - rear) / total : 0
  const yImbalance = total ? Math.abs(left - right) / total : 0
  const balanceScore = Math.max(0, 100 - (xImbalance + yImbalance) * 100)

  return {
    total,
    cg,
    front,
    rear,
    left,
    right,
    corners,
    balanceScore,
  }
}
