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
  transverseOffsetMm: number
  dominantOffset: number
  dominantDirection: 'front'|'rear'|'left'|'right'|'balanced'
  /** Per-floor-level centres; overall CG can hide opposing layer offsets. */
  layers: Array<{ z: number; total: number; cg: { x: number; y: number }; transverseOffsetMm: number; longitudinalOffset: number }>
  maxLayerTransverseOffsetMm: number
  maxLayerLongitudinalOffset: number
}

export function analyzeWeight(
  items: PlacedCargo[],
  c: Container,
  cargoWeights: Array<{ id: string; weight: number }> = [],
): WeightAnalysis {
  const weightByCargoId = new Map(cargoWeights.map((item) => [item.id, item.weight]))
  // A malformed/legacy placement must not poison the entire sum with NaN,
  // which previously made the CG fall back to the container centre and show 0 offset.
  const weightOf = (p: PlacedCargo) => {
    // Current cargo definitions are authoritative. Older placed snapshots can
    // contain stale zero weights even when the cargo list has a real weight.
    const currentWeight = weightByCargoId.get(p.cargoId)
    if (currentWeight !== undefined && Number.isFinite(currentWeight) && currentWeight >= 0) return currentWeight
    return Number.isFinite(p.weight) && p.weight >= 0 ? p.weight : 0
  }
  const total = items.reduce((sum, p) => sum + weightOf(p), 0)
  const moment = { x: 0, y: 0, z: 0 }

  for (const p of items) {
    const d = dims(p)
    const weight = weightOf(p)
    moment.x += weight * (p.x + d.length / 2)
    moment.y += weight * (p.y + d.width / 2)
    moment.z += weight * (p.z + p.height / 2)
  }

  const cg = {
    x: total ? moment.x / total : c.length / 2,
    y: total ? moment.y / total : c.width / 2,
    z: total ? moment.z / total : 0,
  }

  const front = items.reduce((sum,p)=>sum + (p.x + dims(p).length/2 < c.length/2 ? weightOf(p) : 0),0)
  const rear = total-front
  const left = items.reduce((sum,p)=>sum + (p.y + dims(p).width/2 < c.width/2 ? weightOf(p) : 0),0)
  const right = total-left
  const corners = { fl: 0, fr: 0, rl: 0, rr: 0 }
  for (const p of items) {
    const d=dims(p); const x=p.x+d.length/2; const y=p.y+d.width/2
    if(x<c.length/2 && y<c.width/2) corners.fl+=weightOf(p)
    else if(x<c.length/2) corners.fr+=weightOf(p)
    else if(y<c.length/2) corners.rl+=weightOf(p)
    else corners.rr+=weightOf(p)
  }
  // Continuous moment-based imbalance: zero when CG is on the container centreline,
  // independent of which side a box centre happens to fall on.
  const longitudinalOffset = total ? Math.abs(cg.x-c.length/2) * 2 * total / c.length : 0
  const transverseOffset = total ? Math.abs(cg.y-c.width/2) * 2 * total / c.width : 0
  const dominantOffset = Math.max(longitudinalOffset, transverseOffset)
  const dominantDirection = dominantOffset < 0.5 ? 'balanced' : longitudinalOffset >= transverseOffset ? (cg.x < c.length/2 ? 'front' : 'rear') : (cg.y < c.width/2 ? 'left' : 'right')

  // Analyse each distinct loading level separately. A perfectly centred total
  // CG can otherwise conceal a badly offset upper layer counterbalanced by
  // cargo on the floor.
  const layerGroups: Array<{ z: number; items: PlacedCargo[] }> = []
  for (const p of [...items].sort((a, b) => a.z - b.z)) {
    let layer = layerGroups.find(group => Math.abs(group.z - p.z) <= 0.5)
    if (!layer) {
      layer = { z: p.z, items: [] }
      layerGroups.push(layer)
    }
    layer.items.push(p)
  }
  const layers = layerGroups.map(layer => {
    let layerWeight = 0
    let xMoment = 0
    let yMoment = 0
    for (const p of layer.items) {
      const d = dims(p)
      const weight = weightOf(p)
      layerWeight += weight
      xMoment += weight * (p.x + d.length / 2)
      yMoment += weight * (p.y + d.width / 2)
    }
    const layerCg = {
      x: layerWeight > 0 ? xMoment / layerWeight : c.length / 2,
      y: layerWeight > 0 ? yMoment / layerWeight : c.width / 2,
    }
    return {
      z: layer.z,
      total: layerWeight,
      cg: layerCg,
      transverseOffsetMm: Math.abs(layerCg.y - c.width / 2),
      longitudinalOffset: layerWeight ? Math.abs(layerCg.x - c.length / 2) * 2 * layerWeight / c.length : 0,
    }
  })
  const weightedLayers = layers.filter(layer => layer.total > 0)
  const maxLayerTransverseOffsetMm = weightedLayers.reduce((max, layer) => Math.max(max, layer.transverseOffsetMm), 0)
  const maxLayerLongitudinalOffset = weightedLayers.reduce((max, layer) => Math.max(max, layer.longitudinalOffset), 0)

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
    transverseOffsetMm: Math.abs(cg.y - c.width / 2),
    dominantOffset,
    dominantDirection,
    layers,
    maxLayerTransverseOffsetMm,
    maxLayerLongitudinalOffset,
  }
}
