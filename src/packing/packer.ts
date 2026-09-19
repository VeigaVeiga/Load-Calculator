import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const STEP = 10

type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type Unit = { cargo: Cargo; index: number }

const snap = (n: number) => Math.max(0, Math.round(n / STEP) * STEP)

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}

export function expandCargo(cargo: Cargo[]): Unit[] {
  const out: Unit[] = []
  for (const c of cargo) {
    const quantity = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < quantity; i++) out.push({ cargo: c, index: i })
  }
  return out
}

function makePlaced(u: Unit, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return {
    id: `${u.cargo.id}-${u.index + 1}`,
    cargoId: u.cargo.id,
    cargoType: u.cargo.type,
    x: snap(x),
    y: snap(y),
    z: snap(z),
    length: o.length,
    width: o.width,
    height: o.height,
    rotation: o.rotation,
    weight: u.cargo.weight,
    color: u.cargo.color,
    placementMode: 'automatic',
    locked: false,
  }
}

function footprint(p: PlacedCargo) {
  const d = dims(p)
  return { x1: p.x, x2: p.x + d.length, y1: p.y, y2: p.y + d.width }
}

function footprintArea(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a)
  const B = footprint(b)
  return Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1)) *
    Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1))
}

function supportCoverage(p: PlacedCargo, supports: PlacedCargo[]) {
  if (p.z <= EPS) return 1
  const d = dims(p)
  const area = d.length * d.width
  if (!supports.length) return 0

  const xs = new Set<number>([p.x, p.x + d.length])
  const ys = new Set<number>([p.y, p.y + d.width])
  for (const q of supports) {
    const qd = dims(q)
    xs.add(Math.max(p.x, q.x))
    xs.add(Math.min(p.x + d.length, q.x + qd.length))
    ys.add(Math.max(p.y, q.y))
    ys.add(Math.min(p.y + d.width, q.y + qd.width))
  }

  const xv = [...xs].sort((a, b) => a - b)
  const yv = [...ys].sort((a, b) => a - b)
  let covered = 0
  for (let i = 0; i < xv.length - 1; i++) {
    for (let j = 0; j < yv.length - 1; j++) {
      const cx = (xv[i] + xv[i + 1]) / 2
      const cy = (yv[j] + yv[j + 1]) / 2
      if (supports.some(q => {
        const qd = dims(q)
        return cx >= q.x - EPS && cx <= q.x + qd.length + EPS &&
          cy >= q.y - EPS && cy <= q.y + qd.width + EPS
      })) covered += (xv[i + 1] - xv[i]) * (yv[j + 1] - yv[j])
    }
  }
  return Math.min(1, covered / area)
}

function canStack(p: PlacedCargo, cargo: Cargo, items: PlacedCargo[], defs: Map<string, Cargo>) {
  if (p.z <= EPS) return true
  if (!cargo.stackable) return false

  const supports = items.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) > EPS)
  if (!supports.length || supportCoverage(p, supports) < 0.995) return false

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
    if ((quantities.get(p.cargoId) || 0) <= 0 || !inBounds(p, c)) continue
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
      return (b.cargo.loadBearing ? 1 : 0) - (a.cargo.loadBearing ? 1 : 0) ||
        (b.cargo.stackable ? 1 : 0) - (a.cargo.stackable ? 1 : 0) ||
        bf - af || bv - av || b.cargo.weight - a.cargo.weight
    })
}

function extremePoints(items: PlacedCargo[]) {
  const pts = new Set<string>()
  const add = (x: number, y: number, z: number) => pts.add(`${snap(x)},${snap(y)},${snap(z)}`)
  add(0, 0, 0)
  for (const q of items) {
    const d = dims(q)
    add(q.x + d.length, q.y, q.z)
    add(q.x, q.y + d.width, q.z)
    add(q.x, q.y, q.z + q.height)
    add(q.x + d.length, q.y + d.width, q.z)
    add(q.x + d.length, q.y, q.z + q.height)
    add(q.x, q.y + d.width, q.z + q.height)
  }
  return [...pts].map(s => s.split(',').map(Number) as [number, number, number])
}

function contactScore(p: PlacedCargo, items: PlacedCargo[], c: Container) {
  const d = dims(p)
  let s = 0
  if (p.x <= EPS) s += d.width * d.height
  if (p.y <= EPS) s += d.length * d.height
  if (p.x + d.length >= c.length - EPS) s += d.width * d.height
  if (p.y + d.width >= c.width - EPS) s += d.length * d.height
  if (p.z <= EPS) s += d.length * d.width * 2

  for (const q of items) {
    const qd = dims(q)
    if (Math.abs(q.x + qd.length - p.x) <= EPS || Math.abs(p.x + d.length - q.x) <= EPS) {
      s += Math.max(0, Math.min(p.y + d.width, q.y + qd.width) - Math.max(p.y, q.y)) * Math.min(p.height, q.height)
    }
    if (Math.abs(q.y + qd.width - p.y) <= EPS || Math.abs(p.y + d.width - q.y) <= EPS) {
      s += Math.max(0, Math.min(p.x + d.length, q.x + qd.length) - Math.max(p.x, q.x)) * Math.min(p.height, q.height)
    }
    if (Math.abs(q.z + q.height - p.z) <= EPS) s += footprintArea(p, q) * 4
  }
  return s
}

function choosePlacement(u: Unit, items: PlacedCargo[], c: Container, defs: Map<string, Cargo>, totalWeight: number) {
  let best: { p: PlacedCargo; score: number } | undefined
  const pts = extremePoints(items).sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0])

  for (const o of orientations(u.cargo)) {
    for (const [x, y, z] of pts) {
      if (z > EPS && !u.cargo.stackable) continue
      if (x + o.length > c.length + EPS || y + o.width > c.width + EPS || z + o.height > c.height + EPS) continue
      if (totalWeight + u.cargo.weight > c.maxPayload + EPS) continue

      const p = makePlaced(u, o, x, y, z)
      if (!inBounds(p, c) || items.some(q => overlap(p, q))) continue
      if (!canStack(p, u.cargo, items, defs)) continue

      const contact = contactScore(p, items, c)
      const remainingVolume = Math.max(0, c.length - (x + o.length)) * Math.max(0, c.width - (y + o.width))
      const score = contact * 100 - z * 10 - y * 0.02 - x * 0.01 - remainingVolume * 0.00001
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

  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)

  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight)
    if (p) {
      items.push(p)
      totalWeight += p.weight
    }
    onStep?.(i + 1, units.length)
  }
  return items
}

export function autoPack(cargo: Cargo[], c: Container, locked: PlacedCargo[] = []) {
  return packCore(cargo, c, locked)
}

export async function autoPackAsync(cargo: Cargo[], c: Container, locked: PlacedCargo[] = [], onProgress?: (percent: number) => void) {
  const total = expandCargo(cargo).length
  if (!total) {
    onProgress?.(100)
    return validLocked(locked, c, new Map(cargo.map(x => [x.id, Math.floor(x.quantity)])))
  }

  const defs = new Map(cargo.map(x => [x.id, x]))
  const quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const lockedCount = new Map<string, number>()
  for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)

  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)

  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight)
    if (p) {
      items.push(p)
      totalWeight += p.weight
    }
    if (i % 8 === 0) await new Promise<void>(r => setTimeout(r, 0))
    onProgress?.(Math.round(((i + 1) / units.length) * 100))
  }
  onProgress?.(100)
  return items
}
