import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const SNAP = 10
const snap = (n: number) => Math.max(0, Math.round(n / SNAP) * SNAP)

type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type Unit = { cargo: Cargo; index: number }

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}

export function expandCargo(cargo: Cargo[]): Unit[] {
  const out: Unit[] = []
  for (const c of cargo) {
    const q = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < q; i++) out.push({ cargo: c, index: i })
  }
  return out
}

function makePlaced(u: Unit, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return {
    id: `${u.cargo.id}-${u.index + 1}`,
    cargoId: u.cargo.id,
    cargoType: u.cargo.type,
    x: snap(x), y: snap(y), z: snap(z),
    length: u.cargo.length, width: u.cargo.width, height: o.height,
    rotation: o.rotation,
    weight: u.cargo.weight,
    color: u.cargo.color,
    placementMode: 'automatic',
    locked: false,
  }
}

function footprintArea(a: PlacedCargo, b: PlacedCargo) {
  const A = dims(a), B = dims(b)
  return Math.max(0, Math.min(a.x + A.length, b.x + B.length) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + A.width, b.y + B.width) - Math.max(a.y, b.y))
}

function supportCoverage(p: PlacedCargo, supports: PlacedCargo[]) {
  if (p.z <= EPS) return 1
  const d = dims(p)
  const area = d.length * d.width
  if (!supports.length || area <= EPS) return 0

  const xs = new Set<number>([p.x, p.x + d.length])
  const ys = new Set<number>([p.y, p.y + d.width])
  for (const q of supports) {
    const qd = dims(q)
    xs.add(Math.max(p.x, q.x)); xs.add(Math.min(p.x + d.length, q.x + qd.length))
    ys.add(Math.max(p.y, q.y)); ys.add(Math.min(p.y + d.width, q.y + qd.width))
  }
  const xv = [...xs].filter(v => v >= p.x - EPS && v <= p.x + d.length + EPS).sort((a, b) => a - b)
  const yv = [...ys].filter(v => v >= p.y - EPS && v <= p.y + d.width + EPS).sort((a, b) => a - b)
  let covered = 0
  for (let i = 0; i < xv.length - 1; i++) for (let j = 0; j < yv.length - 1; j++) {
    const cx = (xv[i] + xv[i + 1]) / 2, cy = (yv[j] + yv[j + 1]) / 2
    if (supports.some(q => { const qd = dims(q); return cx >= q.x - EPS && cx <= q.x + qd.length + EPS && cy >= q.y - EPS && cy <= q.y + qd.width + EPS })) {
      covered += (xv[i + 1] - xv[i]) * (yv[j + 1] - yv[j])
    }
  }
  return Math.min(1, covered / area)
}

function stackLevel(p: PlacedCargo, items: PlacedCargo[], seen = new Set<string>()): number {
  if (p.z <= EPS || seen.has(p.id)) return 1
  seen.add(p.id)
  const pd = dims(p)
  const supports = items.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) >= pd.length * pd.width * 0.995)
  if (!supports.length) return 1
  return 1 + Math.max(...supports.map(q => stackLevel(q, items, new Set(seen))))
}

function canStack(p: PlacedCargo, cargo: Cargo, items: PlacedCargo[], defs: Map<string, Cargo>) {
  if (p.z <= EPS) return true
  if (!cargo.stackable) return false
  const supports = items.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) > EPS)
  if (!supports.length || supportCoverage(p, supports) < 0.995) return false
  const level = Math.max(...supports.map(q => stackLevel(q, items))) + 1
  const maxLayers = cargo.maxStackLayers <= 1 ? 99 : cargo.maxStackLayers
  if (maxLayers > 0 && level > maxLayers) return false
  for (const q of supports) {
    const d = defs.get(q.cargoId)
    if (!d || !d.loadBearing || d.breakablePallet) return false
    if (d.maxLoadOnTop > 0 && cargo.weight > d.maxLoadOnTop + EPS) return false
  }
  return true
}

function validLocked(locked: PlacedCargo[], c: Container, quantities: Map<string, number>) {
  const out: PlacedCargo[] = []
  for (const p of locked) {
    if ((quantities.get(p.cargoId) || 0) <= 0) continue
    if (!inBounds(p, c)) continue
    if (out.some(q => overlap(p, q))) continue
    out.push(p)
  }
  return out
}

function orderUnits(cargo: Cargo[]) {
  return expandCargo(cargo)
    .filter(u => u.cargo.length > 0 && u.cargo.width > 0 && u.cargo.height > 0)
    .sort((a, b) => {
      const av = a.cargo.length * a.cargo.width * a.cargo.height
      const bv = b.cargo.length * b.cargo.width * b.cargo.height
      const af = a.cargo.length * a.cargo.width
      const bf = b.cargo.length * b.cargo.width
      return ((b.cargo.loadBearing ? 1 : 0) - (a.cargo.loadBearing ? 1 : 0)) ||
        ((b.cargo.stackable ? 1 : 0) - (a.cargo.stackable ? 1 : 0)) ||
        (bf - af) || (bv - av) || (b.cargo.weight - a.cargo.weight)
    })
}

function candidatePoints(items: PlacedCargo[], c: Container) {
  const xs = new Set<number>([0])
  const ys = new Set<number>([0])
  const zs = new Set<number>([0])
  for (const q of items) {
    const d = dims(q)
    xs.add(snap(q.x)); xs.add(snap(q.x + d.length))
    ys.add(snap(q.y)); ys.add(snap(q.y + d.width))
    zs.add(snap(q.z)); zs.add(snap(q.z + q.height))
  }
  const points: Array<[number, number, number]> = []
  for (const z of [...zs].sort((a, b) => a - b)) {
    for (const y of [...ys].sort((a, b) => a - b)) {
      for (const x of [...xs].sort((a, b) => a - b)) {
        if (x <= c.length + EPS && y <= c.width + EPS && z <= c.height + EPS) points.push([x, y, z])
      }
    }
  }
  return points
}

function contactScore(p: PlacedCargo, items: PlacedCargo[], c: Container) {
  const d = dims(p)
  let score = 0
  if (p.x <= EPS) score += d.width * 120
  if (p.y <= EPS) score += d.length * 120
  if (p.x + d.length >= c.length - EPS) score += d.width * 100
  if (p.y + d.width >= c.width - EPS) score += d.length * 100
  for (const q of items) {
    const qd = dims(q)
    if (Math.abs(q.x + qd.length - p.x) <= EPS || Math.abs(p.x + d.length - q.x) <= EPS) {
      score += Math.max(0, Math.min(p.y + d.width, q.y + qd.width) - Math.max(p.y, q.y)) * 220
    }
    if (Math.abs(q.y + qd.width - p.y) <= EPS || Math.abs(p.y + d.width - q.y) <= EPS) {
      score += Math.max(0, Math.min(p.x + d.length, q.x + qd.length) - Math.max(p.x, q.x)) * 220
    }
    if (Math.abs(q.z + q.height - p.z) <= EPS) score += footprintArea(p, q) * 420
  }
  return score
}

function choosePlacement(u: Unit, items: PlacedCargo[], c: Container, defs: Map<string, Cargo>, totalWeight: number) {
  let best: { p: PlacedCargo; score: number } | undefined
  const points = candidatePoints(items, c)
  for (const o of orientations(u.cargo)) {
    for (const [x, y, z] of points) {
      if (x + o.length > c.length + EPS || y + o.width > c.width + EPS || z + o.height > c.height + EPS) continue
      if (totalWeight + u.cargo.weight > c.maxPayload + EPS) continue
      const p = makePlaced(u, o, x, y, z)
      if (!inBounds(p, c) || items.some(q => overlap(p, q))) continue
      if (!canStack(p, u.cargo, items, defs)) continue
      const stacking = p.z > EPS
      const supports = stacking
        ? items.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) > EPS)
        : []
      const support = stacking ? supportCoverage(p, supports) : 1
      if (stacking && support < 0.995) continue

      const contact = contactScore(p, items, c)
      // The old solver gave every floor position a huge fixed bonus. That made
      // it systematically fill the floor first, even when an upper supported
      // position was the only way to close the remaining side gap. Compactness
      // now dominates: supported stacking is rewarded, while floor contact is
      // only a small tie-breaker.
      const compactness =
        contact +
        support * 900_000 +
        (stacking ? 1_200_000 : 180_000) -
        p.x * 90 -
        p.y * 90 -
        p.z * 12
      const edgePenalty =
        Math.max(0, c.length - (p.x + o.length)) * 0.4 +
        Math.max(0, c.width - (p.y + o.width)) * 0.4
      const score = compactness - edgePenalty
      if (!best || score > best.score) best = { p, score }
    }
  }
  return best?.p
}

function packCore(cargo: Cargo[], c: Container, locked: PlacedCargo[], onStep?: (i: number, total: number) => void) {
  const defs = new Map(cargo.map(x => [x.id, x]))
  const quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const lockedCount = new Map<string, number>()
  for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)
  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight)
    if (p) { items.push(p); totalWeight += p.weight }
    onStep?.(i + 1, units.length)
  }
  return items
}

export function autoPack(cargo: Cargo[], c: Container, locked: PlacedCargo[] = []) {
  return packCore(cargo, c, locked)
}

export async function autoPackAsync(cargo: Cargo[], c: Container, locked: PlacedCargo[] = [], onStep?: (percent: number) => void) {
  const defs = new Map(cargo.map(x => [x.id, x]))
  const quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const lockedCount = new Map<string, number>()
  for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)
  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)
  const batch = 8
  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight)
    if (p) { items.push(p); totalWeight += p.weight }
    if (i % batch === 0 || i === units.length - 1) {
      onStep?.(units.length ? ((i + 1) / units.length) * 100 : 100)
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  }
  return items
}
