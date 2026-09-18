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
  longitudinalOffset: number
  transverseOffset: number
  dominantOffset: number
  dominantDirection: 'front'|'rear'|'left'|'right'|'balanced'
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

  const front = items.reduce((sum,p)=>sum + (p.x + dims(p).length/2 < c.length/2 ? p.weight : 0),0)
  const rear = total-front
  const left = items.reduce((sum,p)=>sum + (p.y + dims(p).width/2 < c.width/2 ? p.weight : 0),0)
  const right = total-left
  const corners = { fl: 0, fr: 0, rl: 0, rr: 0 }
  for (const p of items) {
    const d=dims(p); const x=p.x+d.length/2; const y=p.y+d.width/2
    if(x<c.length/2 && y<c.width/2) corners.fl+=p.weight
    else if(x<c.length/2) corners.fr+=p.weight
    else if(y<c.width/2) corners.rl+=p.weight
    else corners.rr+=p.weight
  }
  // Continuous moment-based imbalance: zero when CG is on the container centreline,
  // independent of which side a box centre happens to fall on.
  const longitudinalOffset = total ? Math.abs(cg.x-c.length/2) * 2 * total / c.length : 0
  const transverseOffset = total ? Math.abs(cg.y-c.width/2) * 2 * total / c.width : 0
  const dominantOffset = Math.max(longitudinalOffset, transverseOffset)
  const dominantDirection = dominantOffset < 0.5 ? 'balanced' : longitudinalOffset >= transverseOffset ? (cg.x < c.length/2 ? 'front' : 'rear') : (cg.y < c.width/2 ? 'left' : 'right')

  return {
    total,
    cg,
    front,
    rear,
    left,
    right,
    corners,
    longitudinalOffset,
    transverseOffset,
    dominantOffset,
    dominantDirection,
  }
}
