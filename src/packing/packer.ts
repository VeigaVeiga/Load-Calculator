import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const GRID = 1000
const SNAP = 10
const snap = (n: number) => Math.max(0, Math.round(n / SNAP) * SNAP)
type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type Unit = { cargo: Cargo; index: number }

type BoxIndex = {
  add: (p: PlacedCargo) => void
  query: (p: PlacedCargo) => PlacedCargo[]
}

function createBoxIndex(initial: PlacedCargo[] = []): BoxIndex {
  const buckets = new Map<string, Set<string>>()
  const boxes = new Map<string, PlacedCargo>()
  const key = (x: number, y: number, z: number) => `${Math.floor(x / GRID)},${Math.floor(y / GRID)},${Math.floor(z / GRID)}`

  const add = (p: PlacedCargo) => {
    boxes.set(p.id, p)
    const d = dims(p)
    for (let x = Math.floor(p.x / GRID); x <= Math.floor((p.x + d.length - EPS) / GRID); x++) {
      for (let y = Math.floor(p.y / GRID); y <= Math.floor((p.y + d.width - EPS) / GRID); y++) {
        for (let z = Math.floor(p.z / GRID); z <= Math.floor((p.z + p.height - EPS) / GRID); z++) {
          const k = key(x * GRID, y * GRID, z * GRID)
          let set = buckets.get(k)
          if (!set) { set = new Set(); buckets.set(k, set) }
          set.add(p.id)
        }
      }
    }
  }

  for (const p of initial) add(p)

  const query = (p: PlacedCargo) => {
    const d = dims(p)
    const ids = new Set<string>()
    for (let x = Math.floor(p.x / GRID); x <= Math.floor((p.x + d.length - EPS) / GRID); x++) {
      for (let y = Math.floor(p.y / GRID); y <= Math.floor((p.y + d.width - EPS) / GRID); y++) {
        for (let z = Math.floor(p.z / GRID); z <= Math.floor((p.z + p.height - EPS) / GRID); z++) {
          buckets.get(key(x * GRID, y * GRID, z * GRID))?.forEach(id => ids.add(id))
        }
      }
    }
    return [...ids].map(id => boxes.get(id)!).filter(Boolean)
  }

  return { add, query }
}

function orientations(c: Cargo): Orientation[] {
  const base: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [base]
  return [base, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
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
    x: snap(x),
    y: snap(y),
    z: snap(z),
    // Keep the original dimensions in the data model. geometry.dims() applies
    // the 90-degree footprint rotation consistently everywhere else.
    length: u.cargo.length,
    width: u.cargo.width,
    height: o.height,
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
    xs.add(Math.max(p.x, q.x))
    xs.add(Math.min(p.x + d.length, q.x + qd.length))
    ys.add(Math.max(p.y, q.y))
    ys.add(Math.min(p.y + d.width, q.y + qd.width))
  }

  const xv = [...xs].filter(v => v >= p.x - EPS && v <= p.x + d.length + EPS).sort((a, b) => a - b)
  const yv = [...ys].filter(v => v >= p.y - EPS && v <= p.y + d.width + EPS).sort((a, b) => a - b)
  let covered = 0

  for (let i = 0; i < xv.length - 1; i++) {
    for (let j = 0; j < yv.length - 1; j++) {
      const cx = (xv[i] + xv[i + 1]) / 2
      const cy = (yv[j] + yv[j + 1]) / 2
      if (supports.some(q => {
        const qd = dims(q)
        return cx >= q.x - EPS && cx <= q.x + qd.length + EPS && cy >= q.y - EPS && cy <= q.y + qd.width + EPS
      })) {
        covered += (xv[i + 1] - xv[i]) * (yv[j + 1] - yv[j])
      }
    }
  }
  return Math.min(1, covered / area)
}

function stackLevel(p: PlacedCargo, items: PlacedCargo[], seen = new Set<string>()): number {
  if (p.z <= EPS || seen.has(p.id)) return 1
  seen.add(p.id)
  const pd = dims(p)
  const supports = items.filter(q =>
    Math.abs(q.z + q.height - p.z) <= EPS &&
    footprintArea(p, q) >= pd.length * pd.width * 0.995,
  )
  if (!supports.length) return 1
  return 1 + Math.max(...supports.map(q => stackLevel(q, items, new Set(seen))))
}

function canStack(p: PlacedCargo, cargo: Cargo, items: PlacedCargo[], defs: Map<string, Cargo>) {
  if (p.z <= EPS) return true
  if (!cargo.stackable) return false

  const supports = items.filter(q =>
    Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) > EPS,
  )
  if (!supports.length || supportCoverage(p, supports) < 0.995) return false

  const level = Math.max(...supports.map(q => stackLevel(q, items))) + 1
  const maxLayers = cargo.maxStackLayers <= 1 ? 99 : cargo.maxStackLayers
  if (maxLayers > 0 && level > maxLayers) return false

  // A cargo may be placed ON a non-load-bearing item only when that item
  // explicitly permits carrying the required load. The load-bearing flag
  // describes whether this cargo may support another cargo.
  for (const q of supports) {
    const d = defs.get(q.cargoId)
    if (!d) return false
    if (!d.loadBearing) return false
    if (d.breakablePallet) return false
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
      return (b.cargo.loadBearing ? 1 : 0) - (a.cargo.loadBearing ? 1 : 0) ||
        (b.cargo.stackable ? 1 : 0) - (a.cargo.stackable ? 1 : 0) ||
        bf - af || bv - av || b.cargo.weight - a.cargo.weight
    })
}

function candidatePoints(items: PlacedCargo[]) {
  const set = new Set<string>()
  const add = (x: number, y: number, z: number) => {
    if (x >= -EPS && y >= -EPS && z >= -EPS) set.add(`${snap(x)},${snap(y)},${snap(z)}`)
  }

  add(0, 0, 0)
  for (const q of items) {
    const d = dims(q)
    const x2 = q.x + d.length
    const y2 = q.y + d.width
    const z2 = q.z + q.height

    // Floor/side contact points.
    add(x2, q.y, q.z)
    add(q.x, y2, q.z)
    add(x2, y2, q.z)

    // Stacking points on the top surface.
    add(q.x, q.y, z2)
    add(x2, q.y, z2)
    add(q.x, y2, z2)
    add(x2, y2, z2)
  }

  return [...set].map(v => v.split(',').map(Number) as [number, number, number])
}

function contactScore(p: PlacedCargo, items: PlacedCargo[], c: Container, index: BoxIndex) {
  const d = dims(p)
  let score = 0

  if (p.z <= EPS) score += 100000
  if (p.x <= EPS) score += d.width * 120
  if (p.y <= EPS) score += d.length * 120
  if (p.x + d.length >= c.length - EPS) score += d.width * 90
  if (p.y + d.width >= c.width - EPS) score += d.length * 90

  for (const q of index.query(p)) {
    const qd = dims(q)
    const xContact = Math.abs(q.x + qd.length - p.x) <= EPS || Math.abs(p.x + d.length - q.x) <= EPS
    const yContact = Math.abs(q.y + qd.width - p.y) <= EPS || Math.abs(p.y + d.width - q.y) <= EPS
    if (xContact) score += Math.max(0, Math.min(p.y + d.width, q.y + qd.width) - Math.max(p.y, q.y)) * 180
    if (yContact) score += Math.max(0, Math.min(p.x + d.length, q.x + qd.length) - Math.max(p.x, q.x)) * 180
    if (Math.abs(q.z + q.height - p.z) <= EPS) score += footprintArea(p, q) * 320
  }
  return score
}

function choosePlacement(
  u: Unit,
  items: PlacedCargo[],
  c: Container,
  defs: Map<string, Cargo>,
  totalWeight: number,
  index: BoxIndex,
) {
  let best: { p: PlacedCargo; score: number } | undefined

  // Do not truncate this list. The previous 260-point cap could permanently
  // hide upper-layer candidates once the floor contained many cartons, which
  // caused the exact symptom: one flat layer followed by a large side gap.
  const points = candidatePoints(items).sort((a, b) =>
    a[2] - b[2] || a[1] - b[1] || a[0] - b[0],
  )

  for (const o of orientations(u.cargo)) {
    for (const [x, y, z] of points) {
      if (z > EPS && !u.cargo.stackable) continue
      if (x + o.length > c.length + EPS || y + o.width > c.width + EPS || z + o.height > c.height + EPS) continue
      if (totalWeight + u.cargo.weight > c.maxPayload + EPS) continue

      const p = makePlaced(u, o, x, y, z)
      if (!inBounds(p, c)) continue

      const near = index.query(p)
      if (near.some(q => overlap(p, q))) continue
      if (!canStack(p, u.cargo, items, defs)) continue

      const stacking = p.z > EPS
      const supports = stacking
        ? near.filter(q => Math.abs(q.z + q.height - p.z) <= EPS && footprintArea(p, q) > EPS)
        : []
      const support = stacking ? supportCoverage(p, supports) : 1
      if (stacking && support < 0.995) continue

      const contact = contactScore(p, items, c, index)
      const d = dims(p)

      // Primary goal: use the lowest available layer, then minimize the
      // horizontal footprint gap, then maximize contact with walls/cargo.
      // This still permits stacking whenever it is the only way to continue
      // filling the container instead of leaving a large side corridor.
      const score =
        (stacking ? 0 : 4_000_000) -
        p.z * 900 -
        p.y * 1.25 -
        p.x * 0.04 +
        contact * 18 +
        support * 700000 +
        d.length * d.width * 0.35

      if (!best || score > best.score) best = { p, score }
    }
  }

  return best?.p
}

function packCore(cargo: Cargo[], c: Container, locked: PlacedCargo[], onStep?: (i: number, total: number) => void) {
  const defs = new Map(cargo.map(x => [x.id, x]))
  const quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const index = createBoxIndex(items)
  const lockedCount = new Map<string, number>()
  for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)

  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)

  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight, index)
    if (p) {
      items.push(p)
      index.add(p)
      totalWeight += p.weight
    }
    onStep?.(i + 1, units.length)
  }
  return items
}

export function autoPack(cargo: Cargo[], c: Container, locked: PlacedCargo[] = []) {
  return packCore(cargo, c, locked)
}

export async function autoPackAsync(
  cargo: Cargo[],
  c: Container,
  locked: PlacedCargo[] = [],
  onProgress?: (percent: number) => void,
) {
  const total = expandCargo(cargo).length
  if (!total) {
    onProgress?.(100)
    return validLocked(locked, c, new Map(cargo.map(x => [x.id, Math.floor(x.quantity)])))
  }

  const defs = new Map(cargo.map(x => [x.id, x]))
  const quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const index = createBoxIndex(items)
  const lockedCount = new Map<string, number>()
  for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)

  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)

  for (let i = 0; i < units.length; i++) {
    const p = choosePlacement(units[i], items, c, defs, totalWeight, index)
    if (p) {
      items.push(p)
      index.add(p)
      totalWeight += p.weight
    }
    if (i % 2 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0))
    onProgress?.(Math.round((i + 1) / units.length * 100))
  }

  onProgress?.(100)
  return items
}
