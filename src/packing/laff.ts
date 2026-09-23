import type { Cargo, Container, PlacedCargo } from '../types'

const EPS = .5
type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }
type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type FreeSpace = {
  x: number; y: number; z: number; length: number; width: number; height: number; supported: boolean
  supportKind: 'floor' | 'cargo'
  supportCargoId?: string
  supportCargoTemplateId?: string
  supportCargoType?: Cargo['type']
  supportLoadBearing?: boolean
  supportMaxLoadOnTop?: number
  stackDepth: number
}
type Group = { cargo: Cargo; quantity: number }

const abort = (s?: AbortSignal) => { if (s?.aborted) throw new DOMException('Packing cancelled', 'AbortError') }
const yieldBrowser = () => new Promise<void>(r => typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame(() => r()) : setTimeout(r, 0))

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}

function maxLayers(c: Cargo, o: Orientation, h: number) {
  if (h + EPS < o.height) return 0
  let n = Math.floor((h + EPS) / o.height)
  if (!c.stackable || !c.loadBearing) n = Math.min(n, 1)
  const m = Number.isFinite(c.maxStackLayers) ? Math.floor(c.maxStackLayers) : 0
  if (m > 0) n = Math.min(n, m)
  const top = Number.isFinite(c.maxLoadOnTop) ? c.maxLoadOnTop : 0
  if (c.stackable && c.loadBearing && top > 0 && c.weight > 0) n = Math.min(n, Math.floor(top / c.weight) + 1)
  return Math.max(1, n)
}

function fits(s: FreeSpace, o: Orientation) {
  return s.supported && o.length <= s.length + EPS && o.width <= s.width + EPS && o.height <= s.height + EPS
}

function split(s: FreeSpace, u: { x: number; y: number; length: number; width: number; height: number }, supportTop: boolean, cargo: Cargo, placedId: string) {
  const a: FreeSpace[] = []
  const x2 = s.x + s.length, y2 = s.y + s.width, ux = u.x + u.length, uy = u.y + u.width
  const push = (x: number, y: number, z: number, l: number, w: number, h: number, overrides: Partial<FreeSpace> = {}) => {
    if (l <= EPS || w <= EPS || h <= EPS) return
    a.push({
      x, y, z, length: l, width: w, height: h,
      supported: overrides.supported ?? s.supported,
      supportKind: overrides.supportKind ?? s.supportKind,
      supportCargoId: overrides.supportCargoId ?? s.supportCargoId,
      supportCargoTemplateId: overrides.supportCargoTemplateId ?? s.supportCargoTemplateId,
      supportCargoType: overrides.supportCargoType ?? s.supportCargoType,
      supportLoadBearing: overrides.supportLoadBearing ?? s.supportLoadBearing,
      supportMaxLoadOnTop: overrides.supportMaxLoadOnTop ?? s.supportMaxLoadOnTop,
      stackDepth: overrides.stackDepth ?? s.stackDepth,
    })
  }
  push(s.x, s.y, s.z, u.x - s.x, s.width, s.height)
  push(ux, s.y, s.z, x2 - ux, s.width, s.height)
  push(u.x, s.y, s.z, u.length, u.y - s.y, s.height)
  push(u.x, uy, s.z, u.length, y2 - uy, s.height)

  // A new upper space is created only when the whole footprint is filled and
  // the cargo explicitly allows stacking AND can carry the next load. This
  // prevents floating cartons above non-load-bearing cargo.
  if (supportTop && cargo.stackable && cargo.loadBearing) {
    push(u.x, u.y, s.z + u.height, u.length, u.width, s.height - u.height, {
      supported: true,
      supportKind: 'cargo',
      supportCargoId: placedId,
      supportCargoTemplateId: cargo.id,
      supportCargoType: cargo.type,
      supportLoadBearing: cargo.loadBearing,
      supportMaxLoadOnTop: Number.isFinite(cargo.maxLoadOnTop) ? cargo.maxLoadOnTop : 0,
      stackDepth: s.stackDepth + 1,
    })
  }
  return a
}

function prune(a: FreeSpace[]) {
  const v = a.filter(s => s.length > EPS && s.width > EPS && s.height > EPS && s.supported)
  const unique: FreeSpace[] = []
  for (const s of v) {
    if (!unique.some(q => Math.abs(q.x - s.x) <= EPS && Math.abs(q.y - s.y) <= EPS && Math.abs(q.z - s.z) <= EPS && Math.abs(q.length - s.length) <= EPS && Math.abs(q.width - s.width) <= EPS && Math.abs(q.height - s.height) <= EPS && q.supportCargoId === s.supportCargoId)) unique.push(s)
  }
  return unique.filter((s, i, all) => !all.some((q, j) => i !== j && q.supportCargoId === s.supportCargoId && q.x <= s.x + EPS && q.y <= s.y + EPS && q.z <= s.z + EPS && q.x + q.length >= s.x + s.length - EPS && q.y + q.width >= s.y + s.width - EPS && q.z + q.height >= s.z + s.height - EPS))
}

function supportLoadFits(space: FreeSpace, cargo: Cargo, supportLoads: Map<string, number>) {
  if (space.supportKind !== 'cargo' || !space.supportCargoId || !space.supportLoadBearing) return space.supportKind === 'floor'
  const limit = Number.isFinite(space.supportMaxLoadOnTop) ? space.supportMaxLoadOnTop ?? 0 : 0
  if (limit <= 0) return true
  const used = supportLoads.get(space.supportCargoId) ?? 0
  return used + cargo.weight <= limit + EPS
}

function score(s: FreeSpace, o: Orientation, c: Cargo, container: Container) {
  const dx = s.x + o.length / 2 - container.length / 2, dy = s.y + o.width / 2 - container.width / 2
  const waste = (s.length - o.length * Math.floor((s.length + EPS) / o.length)) * s.width + (s.width - o.width * Math.floor((s.width + EPS) / o.width)) * s.length
  const hw = Math.max(0, s.height - o.height * Math.floor((s.height + EPS) / o.height))
  // Lower z is preferred; load-bearing pallets are deliberately preferred as
  // supports for cartons/crates to keep the load distributed and stable.
  const palletBonus = c.type !== 'pallet' && s.supportKind === 'cargo' && s.supportCargoType === 'pallet' && s.supportLoadBearing ? -1000000 : 0
  return palletBonus + Math.hypot(dx, dy) * .35 + waste * .08 + hw * .03 + s.z * .05
}

function choose(spaces: FreeSpace[], cargo: Cargo, c: Container, supportLoads: Map<string, number>) {
  let best: { space: FreeSpace; orientation: Orientation; score: number } | undefined
  for (const s of spaces) {
    if (!supportLoadFits(s, cargo, supportLoads)) continue
    if (s.supportKind === 'cargo' && s.supportCargoTemplateId === cargo.id) {
      const max = Number.isFinite(cargo.maxStackLayers) ? Math.floor(cargo.maxStackLayers) : 0
      if (max > 0 && s.stackDepth >= max) continue
    }
    for (const o of orientations(cargo)) if (fits(s, o)) {
      const sc = score(s, o, cargo, c)
      if (!best || sc < best.score) best = { space: s, orientation: o, score: sc }
    }
  }
  return best
}

function groups(cargo: Cargo[]): Group[] {
  const m = new Map<string, Group>()
  for (const c of cargo) {
    const q = Math.max(0, Math.floor(c.quantity))
    if (!q || c.length <= 0 || c.width <= 0 || c.height <= 0) continue
    const k = `${c.id}|${c.length}|${c.width}|${c.height}|${c.weight}|${c.stackable}|${c.loadBearing}|${c.rotatable}|${c.maxStackLayers}|${c.maxLoadOnTop}|${c.breakablePallet}`
    const g = m.get(k); if (g) g.quantity += q; else m.set(k, { cargo: c, quantity: q })
  }
  return [...m.values()].sort((a, b) => {
    const ap = a.cargo.type === 'pallet' && a.cargo.loadBearing ? 1 : 0
    const bp = b.cargo.type === 'pallet' && b.cargo.loadBearing ? 1 : 0
    if (ap !== bp) return bp - ap
    return b.cargo.length * b.cargo.width - a.cargo.length * a.cargo.width || b.cargo.length * b.cargo.width * b.cargo.height - a.cargo.length * a.cargo.width * a.cargo.height
  })
}

function placed(c: Cargo, i: number, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return { id: `${c.id}-${i + 1}`, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: o.height, weight: c.weight, color: c.color, rotation: o.rotation, placementMode: 'automatic', locked: false }
}

function center(items: PlacedCargo[], c: Container) {
  if (!items.length) return items
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of items) { const l = p.rotation === 90 ? p.width : p.length, w = p.rotation === 90 ? p.length : p.width; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + l); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + w) }
  const sx = (c.length - (maxX - minX)) / 2 - minX, sy = (c.width - (maxY - minY)) / 2 - minY
  return Number.isFinite(sx) && Number.isFinite(sy) ? items.map(p => ({ ...p, x: p.x + sx, y: p.y + sy })) : items
}

export async function packLaff(cargo: Cargo[], container: Container, progress?: Progress, options: Options = {}) {
  const gs = groups(cargo), total = gs.reduce((n, g) => n + g.quantity, 0)
  if (!total) { progress?.(100); return [] }
  const H = Math.max(0, container.height)
  let done = 0, seq = 0, result: PlacedCargo[] = []
  const supportLoads = new Map<string, number>()
  let spaces: FreeSpace[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: H, supported: true, supportKind: 'floor', stackDepth: 0 }]

  for (const g of gs) {
    abort(options.signal)
    let remaining = g.quantity
    const c = g.cargo
    while (remaining > 0) {
      abort(options.signal)
      const choice = choose(spaces, c, container, supportLoads)
      if (!choice) break
      const s = choice.space, o = choice.orientation
      const cols = Math.floor((s.length + EPS) / o.length), rows = Math.floor((s.width + EPS) / o.width)
      let layers = maxLayers(c, o, Math.min(s.height, Math.max(0, H - s.z)))
      if (s.supportKind === 'cargo' && s.supportMaxLoadOnTop && c.weight > 0) {
        const used = supportLoads.get(s.supportCargoId ?? '') ?? 0
        layers = Math.min(layers, Math.floor(Math.max(0, s.supportMaxLoadOnTop - used) / c.weight))
      }
      if (cols <= 0 || rows <= 0 || layers <= 0) break
      const capacity = cols * rows * layers, take = Math.min(remaining, capacity), per = cols * rows
      const fullLayers = Math.floor(take / per), rem = take % per, usedLayers = fullLayers + (rem ? 1 : 0), usedRows = rem ? Math.ceil(rem / cols) : rows
      const usedL = cols * o.length, usedW = usedRows * o.width, usedH = usedLayers * o.height
      const ux = s.x + Math.max(0, (s.length - usedL) / 2), uy = s.y + Math.max(0, (s.width - usedW) / 2)
      const u = { x: ux, y: uy, length: usedL, width: usedW, height: usedH }
      const fullBlock = rem === 0 || rem % cols === 0
      const batch: PlacedCargo[] = []
      for (let layer = 0; layer < usedLayers && batch.length < take; layer++) {
        const z = s.z + layer * o.height, count = layer < fullLayers ? per : rem, rws = layer < fullLayers ? rows : usedRows
        if (!count) continue
        for (let row = 0; row < rws && batch.length < take; row++) {
          const n = Math.min(cols, count - row * cols)
          for (let col = 0; col < n; col++) {
            const x = ux + col * o.length, y = uy + row * o.width
            if (x >= -EPS && y >= -EPS && x + o.length <= container.length + EPS && y + o.width <= container.width + EPS && z >= -EPS && z + o.height <= H + EPS) batch.push(placed(c, seq + batch.length, o, x, y, z))
          }
        }
      }
      // A free-space bug must never be allowed to create interpenetrating
      // cargo. Validate the generated block before committing it.
      const overlap = (a: PlacedCargo, b: PlacedCargo) => {
        const ad = a.rotation === 90 ? { l: a.width, w: a.length } : { l: a.length, w: a.width }
        const bd = b.rotation === 90 ? { l: b.width, w: b.length } : { l: b.length, w: b.width }
        return a.x < b.x + bd.l - EPS && a.x + ad.l > b.x + EPS && a.y < b.y + bd.w - EPS && a.y + ad.w > b.y + EPS && a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
      }
      const badBatch = batch.some((p, i) => result.some(q => overlap(p, q)) || batch.slice(0, i).some(q => overlap(p, q)))
      const finalBatch = badBatch ? batch.slice(0, 1) : batch
      if (!finalBatch.length) break
      const finalU = badBatch ? { x: finalBatch[0].x, y: finalBatch[0].y, length: o.length, width: o.width, height: o.height } : u
      spaces = prune([...spaces.filter(x => x !== s), ...split(s, finalU, !badBatch && fullBlock, c, `${c.id}-${seq + finalBatch.length}`)])
      for (const p of finalBatch) {
        p.id = `${c.id}-${seq + 1}`
        result.push(p); seq++; done++; progress?.(Math.min(99, Math.round(done / total * 100)))
        if (s.supportKind === 'cargo' && s.supportCargoId) supportLoads.set(s.supportCargoId, (supportLoads.get(s.supportCargoId) ?? 0) + c.weight)
      }
      remaining -= finalBatch.length
      if ((done & 31) === 0) await yieldBrowser()
    }
    await yieldBrowser()
  }
  result = center(result, container)
  progress?.(100)
  return result
}
