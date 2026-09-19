import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const STEP = 10

type Orientation = { length: number; width: number; rotation: 0 | 90 }
type Unit = { cargo: Cargo; index: number }
type Space = { x: number; y: number; z: number; length: number; width: number; height: number; stackLevel: number; stackLimit: number }

const snap = (n: number) => Math.max(0, Math.round(n / STEP) * STEP)

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, rotation: 90 }]
}

export function expandCargo(cargo: Cargo[]): Unit[] {
  const out: Unit[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i += 1) out.push({ cargo: c, index: i })
  }
  return out
}

function makePlaced(u: Unit, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return {
    id: `${u.cargo.id}-${u.index + 1}`,
    cargoId: u.cargo.id,
    cargoType: u.cargo.type,
    x: snap(x), y: snap(y), z: snap(z),
    length: u.cargo.length, width: u.cargo.width, height: u.cargo.height,
    rotation: o.rotation, weight: u.cargo.weight, color: u.cargo.color,
    placementMode: 'automatic', locked: false,
  }
}

function footprint(p: PlacedCargo) {
  const d = dims(p)
  return { x1: p.x, x2: p.x + d.length, y1: p.y, y2: p.y + d.width }
}

function footprintArea(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a), B = footprint(b)
  return Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1)) * Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1))
}

function collision(p: PlacedCargo, items: PlacedCargo[]) {
  return items.some(q => overlap(p, q))
}

function supportCoverage(p: PlacedCargo, supports: PlacedCargo[]) {
  if (p.z <= EPS) return 1
  const d = dims(p), area = d.length * d.width
  if (!supports.length) return 0
  const xs = new Set<number>([p.x, p.x + d.length]), ys = new Set<number>([p.y, p.y + d.width])
  for (const q of supports) {
    const qd = dims(q)
    xs.add(Math.max(p.x, q.x)); xs.add(Math.min(p.x + d.length, q.x + qd.length))
    ys.add(Math.max(p.y, q.y)); ys.add(Math.min(p.y + d.width, q.y + qd.width))
  }
  const xv = [...xs].sort((a, b) => a - b), yv = [...ys].sort((a, b) => a - b)
  let covered = 0
  for (let i = 0; i < xv.length - 1; i += 1) for (let j = 0; j < yv.length - 1; j += 1) {
    const cx = (xv[i] + xv[i + 1]) / 2, cy = (yv[j] + yv[j + 1]) / 2
    if (supports.some(q => { const qd = dims(q); return cx >= q.x - EPS && cx <= q.x + qd.length + EPS && cy >= q.y - EPS && cy <= q.y + qd.width + EPS })) covered += (xv[i + 1] - xv[i]) * (yv[j + 1] - yv[j])
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

function subtractLocked(space: Space, p: PlacedCargo): Space[] {
  const d = dims(p)
  const px1 = p.x, px2 = p.x + d.length, py1 = p.y, py2 = p.y + d.width, pz1 = p.z, pz2 = p.z + p.height
  const sx2 = space.x + space.length, sy2 = space.y + space.width, sz2 = space.z + space.height
  if (px2 <= space.x + EPS || px1 >= sx2 - EPS || py2 <= space.y + EPS || py1 >= sy2 - EPS || pz2 <= space.z + EPS || pz1 >= sz2 - EPS) return [space]
  let core = { ...space }
  const out: Space[] = []
  if (px1 > core.x + EPS) { out.push({ ...core, length: px1 - core.x }); core = { ...core, x: px1, length: core.x + core.length - px1 } }
  if (px2 < core.x + core.length - EPS) { out.push({ ...core, x: px2, length: core.x + core.length - px2 }); core = { ...core, length: px2 - core.x } }
  if (py1 > core.y + EPS) { out.push({ ...core, width: py1 - core.y }); core = { ...core, y: py1, width: core.y + core.width - py1 } }
  if (py2 < core.y + core.width - EPS) { out.push({ ...core, y: py2, width: core.y + core.width - py2 }); core = { ...core, width: py2 - core.y } }
  if (pz1 > core.z + EPS) { out.push({ ...core, height: pz1 - core.z }); core = { ...core, z: pz1, height: core.z + core.height - pz1 } }
  if (pz2 < core.z + core.height - EPS) out.push({ ...core, z: pz2, height: core.z + core.height - pz2 })
  return out.filter(s => s.length > EPS && s.width > EPS && s.height > EPS)
}

function seedSpaces(container: Container, locked: PlacedCargo[]): Space[] {
  let spaces: Space[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height, stackLevel: 0, stackLimit: Infinity }]
  for (const p of locked) spaces = spaces.flatMap(s => subtractLocked(s, p))
  return spaces
}

function splitSpace(space: Space, p: PlacedCargo, cargo: Cargo): Space[] {
  const d = dims(p), out: Space[] = []
  const right = space.length - d.length
  const front = space.width - d.width
  const above = space.height - p.height
  if (right > EPS) out.push({ x: space.x + d.length, y: space.y, z: space.z, length: right, width: space.width, height: space.height, stackLevel: space.stackLevel, stackLimit: space.stackLimit })
  if (front > EPS) out.push({ x: space.x, y: space.y + d.width, z: space.z, length: d.length, width: front, height: space.height, stackLevel: space.stackLevel, stackLimit: space.stackLimit })
  if (above > EPS && cargo.loadBearing) {
    const limit = Math.min(space.stackLimit, cargo.maxStackLayers > 0 ? cargo.maxStackLayers : Infinity)
    out.push({ x: space.x, y: space.y, z: space.z + p.height, length: d.length, width: d.width, height: above, stackLevel: space.stackLevel + 1, stackLimit: limit })
  }
  return out
}

function pruneSpaces(spaces: Space[]) {
  const clean = spaces.filter(s => s.length > EPS && s.width > EPS && s.height > EPS)
  clean.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || (a.length * a.width * a.height) - (b.length * b.width * b.height))
  const out: Space[] = []
  for (const s of clean) {
    const contained = out.some(q => s.x >= q.x - EPS && s.y >= q.y - EPS && s.z >= q.z - EPS && s.x + s.length <= q.x + q.length + EPS && s.y + s.width <= q.y + q.width + EPS && s.z + s.height <= q.z + q.height + EPS && s.stackLevel >= q.stackLevel)
    if (!contained) out.push(s)
  }
  return out
}

function orderUnits(cargo: Cargo[]) {
  return expandCargo(cargo).filter(u => u.cargo.length > 0 && u.cargo.width > 0 && u.cargo.height > 0).sort((a, b) => {
    const av = a.cargo.length * a.cargo.width * a.cargo.height, bv = b.cargo.length * b.cargo.width * b.cargo.height
    const af = a.cargo.length * a.cargo.width, bf = b.cargo.length * b.cargo.width
    return (b.cargo.loadBearing ? 1 : 0) - (a.cargo.loadBearing ? 1 : 0) || bf - af || bv - av || b.cargo.weight - a.cargo.weight
  })
}

function choosePlacement(u: Unit, spaces: Space[], items: PlacedCargo[], c: Container, defs: Map<string, Cargo>, totalWeight: number) {
  let best: { spaceIndex: number; orientation: Orientation; score: number } | undefined
  for (let si = 0; si < spaces.length; si += 1) {
    const s = spaces[si]
    if (s.z > EPS && !u.cargo.stackable) continue
    if (s.z > EPS && s.stackLevel >= s.stackLimit) continue
    for (const o of orientations(u.cargo)) {
      if (o.length > s.length + EPS || o.width > s.width + EPS || u.cargo.height > s.height + EPS) continue
      if (totalWeight + u.cargo.weight > c.maxPayload + EPS) continue
      const p = makePlaced(u, o, s.x, s.y, s.z)
      if (collision(p, items) || !canStack(p, u.cargo, items, defs)) continue
      const waste = s.length * s.width * s.height - o.length * o.width * u.cargo.height
      const sideContact = (Math.abs(o.length - s.length) < EPS ? 1 : 0) + (Math.abs(o.width - s.width) < EPS ? 1 : 0)
      const score = s.z * 1e9 + waste - sideContact * 1e6 - o.length * o.width * 0.1
      if (!best || score < best.score) best = { spaceIndex: si, orientation: o, score }
    }
  }
  return best
}

function packCore(cargo: Cargo[], c: Container, locked: PlacedCargo[], onStep?: (i: number, total: number) => void) {
  const defs = new Map(cargo.map(x => [x.id, x])), quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities)
  const lockedCount = new Map<string, number>(); for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)
  let spaces = seedSpaces(c, items)
  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  let totalWeight = items.reduce((s, p) => s + p.weight, 0)
  for (let i = 0; i < units.length; i += 1) {
    const u = units[i], choice = choosePlacement(u, spaces, items, c, defs, totalWeight)
    if (choice) {
      const s = spaces[choice.spaceIndex], p = makePlaced(u, choice.orientation, s.x, s.y, s.z)
      items.push(p); totalWeight += p.weight
      spaces.splice(choice.spaceIndex, 1, ...splitSpace(s, p, u.cargo)); spaces = pruneSpaces(spaces)
    }
    onStep?.(i + 1, units.length)
  }
  return items
}

export function autoPack(cargo: Cargo[], c: Container, locked: PlacedCargo[] = []) { return packCore(cargo, c, locked) }

export async function autoPackAsync(cargo: Cargo[], c: Container, locked: PlacedCargo[] = [], onProgress?: (percent: number) => void) {
  const total = expandCargo(cargo).length
  if (!total) { onProgress?.(100); return validLocked(locked, c, new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))) }
  const defs = new Map(cargo.map(x => [x.id, x])), quantities = new Map(cargo.map(x => [x.id, Math.floor(x.quantity)]))
  const items = validLocked(locked, c, quantities), lockedCount = new Map<string, number>(); for (const p of items) lockedCount.set(p.cargoId, (lockedCount.get(p.cargoId) || 0) + 1)
  let spaces = seedSpaces(c, items), totalWeight = items.reduce((s, p) => s + p.weight, 0)
  const units = orderUnits(cargo).filter(u => u.index >= (lockedCount.get(u.cargo.id) || 0))
  for (let i = 0; i < units.length; i += 1) {
    const choice = choosePlacement(units[i], spaces, items, c, defs, totalWeight)
    if (choice) { const s = spaces[choice.spaceIndex], p = makePlaced(units[i], choice.orientation, s.x, s.y, s.z); items.push(p); totalWeight += p.weight; spaces.splice(choice.spaceIndex, 1, ...splitSpace(s, p, units[i].cargo)); spaces = pruneSpaces(spaces) }
    if (i % 6 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0))
    onProgress?.(Math.round(((i + 1) / units.length) * 100))
  }
  onProgress?.(100)
  return items
}
