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

type Candidate = {
  space: FreeSpace
  orientation: Orientation
  score: number
}

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

  // Four lateral spaces remain at the same support level. They are mutually
  // exclusive rectangles around the placed footprint, so they cannot overlap.
  push(s.x, s.y, s.z, u.x - s.x, s.width, s.height)
  push(ux, s.y, s.z, x2 - ux, s.width, s.height)
  push(u.x, s.y, s.z, u.length, u.y - s.y, s.height)
  push(u.x, uy, s.z, u.length, y2 - uy, s.height)

  // A top space is valid only when the placed cargo can actually support load.
  // It is exactly the cargo footprint, so anything placed there has full-footprint
  // support instead of being allowed to float over a partial side area.
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
  // Remove spaces fully contained by another space with the same support.
  // This keeps candidate search small without deleting genuinely different
  // support levels.
  return unique.filter((s, i, all) => !all.some((q, j) => i !== j && q.supportCargoId === s.supportCargoId && q.x <= s.x + EPS && q.y <= s.y + EPS && q.z <= s.z + EPS && q.x + q.length >= s.x + s.length - EPS && q.y + q.width >= s.y + s.width - EPS && q.z + q.height >= s.z + s.height - EPS))
}

function supportLoadFits(space: FreeSpace, cargo: Cargo, supportLoads: Map<string, number>) {
  if (space.supportKind !== 'cargo' || !space.supportCargoId || !space.supportLoadBearing) return space.supportKind === 'floor'
  const limit = Number.isFinite(space.supportMaxLoadOnTop) ? space.supportMaxLoadOnTop ?? 0 : 0
  if (limit <= 0) return true
  const used = supportLoads.get(space.supportCargoId) ?? 0
  return used + cargo.weight <= limit + EPS
}

function candidateScore(s: FreeSpace, o: Orientation, c: Cargo, container: Container): number {
  const left = Math.max(0, s.length - o.length)
  const front = Math.max(0, s.width - o.width)
  const above = Math.max(0, s.height - o.height)
  const leftoverVolume = Math.max(0, s.length * s.width * s.height - o.length * o.width * o.height)
  const sideWaste = left * s.width + front * s.length
  const centerDx = s.x + o.length / 2 - container.length / 2
  const centerDy = s.y + o.width / 2 - container.width / 2

  // Strongly prefer tight fits. Fragmentation is penalized more than distance
  // from the container centre, because small mixed shipments need reusable
  // rectangular spaces later in the search.
  let score = sideWaste * 0.22 + above * 0.04 + leftoverVolume * 0.00002
  score += Math.hypot(centerDx, centerDy) * 0.015 + s.z * 0.08

  // Prefer using a load-bearing pallet as a support for cartons/crates.
  if (c.type !== 'pallet' && s.supportKind === 'cargo' && s.supportCargoType === 'pallet' && s.supportLoadBearing) score -= 50000

  // A floor placement is slightly preferred over stacking when both are
  // similarly tight; this keeps the load stable and leaves top spaces for
  // cargo that truly needs them.
  if (s.supportKind === 'floor') score -= 500

  return score
}

function candidates(spaces: FreeSpace[], cargo: Cargo, container: Container, supportLoads: Map<string, number>): Candidate[] {
  const out: Candidate[] = []
  for (const s of spaces) {
    if (!supportLoadFits(s, cargo, supportLoads)) continue
    if (s.supportKind === 'cargo' && s.supportCargoTemplateId === cargo.id) {
      const max = Number.isFinite(cargo.maxStackLayers) ? Math.floor(cargo.maxStackLayers) : 0
      if (max > 0 && s.stackDepth >= max) continue
    }
    for (const o of orientations(cargo)) {
      if (!fits(s, o)) continue
      const layers = maxLayers(cargo, o, Math.min(s.height, Math.max(0, container.height - s.z)))
      if (layers <= 0) continue
      if (s.supportKind === 'cargo' && s.supportMaxLoadOnTop && cargo.weight > 0) {
        const used = supportLoads.get(s.supportCargoId ?? '') ?? 0
        if (Math.floor(Math.max(0, s.supportMaxLoadOnTop - used) / cargo.weight) < 1) continue
      }
      out.push({ space: s, orientation: o, score: candidateScore(s, o, cargo, container) })
    }
  }
  return out.sort((a, b) => a.score - b.score)
}

function groups(cargo: Cargo[]): Group[] {
  const m = new Map<string, Group>()
  for (const c of cargo) {
    const q = Math.max(0, Math.floor(c.quantity))
    if (!q || c.length <= 0 || c.width <= 0 || c.height <= 0) continue
    const k = `${c.id}|${c.length}|${c.width}|${c.height}|${c.weight}|${c.stackable}|${c.loadBearing}|${c.rotatable}|${c.maxStackLayers}|${c.maxLoadOnTop}|${c.breakablePallet}`
    const g = m.get(k)
    if (g) g.quantity += q
    else m.set(k, { cargo: c, quantity: q })
  }

  return [...m.values()].sort((a, b) => {
    // Foundation pallets first, then difficult/small batches first. This keeps
    // the large easy carton batches from consuming the awkward spaces needed
    // by one-off mixed cargo.
    const ap = a.cargo.type === 'pallet' && a.cargo.loadBearing ? 1 : 0
    const bp = b.cargo.type === 'pallet' && b.cargo.loadBearing ? 1 : 0
    if (ap !== bp) return bp - ap

    const aFoot = a.cargo.length * a.cargo.width
    const bFoot = b.cargo.length * b.cargo.width
    const aVol = aFoot * a.cargo.height
    const bVol = bFoot * b.cargo.height
    const aDifficulty = (a.quantity <= 3 ? 1000000 : a.quantity <= 8 ? 200000 : 0) + (a.cargo.rotatable ? 0 : 50000) + aFoot * 0.1
    const bDifficulty = (b.quantity <= 3 ? 1000000 : b.quantity <= 8 ? 200000 : 0) + (b.cargo.rotatable ? 0 : 50000) + bFoot * 0.1
    return bDifficulty - aDifficulty || bVol - aVol
  })
}

function placed(c: Cargo, i: number, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return { id: `${c.id}-${i + 1}`, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: o.height, weight: c.weight, color: c.color, rotation: o.rotation, placementMode: 'automatic', locked: false }
}

function center(items: PlacedCargo[], c: Container) {
  if (!items.length) return items
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of items) {
    const l = p.rotation === 90 ? p.width : p.length
    const w = p.rotation === 90 ? p.length : p.width
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + l)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + w)
  }
  const sx = (c.length - (maxX - minX)) / 2 - minX
  const sy = (c.width - (maxY - minY)) / 2 - minY
  return Number.isFinite(sx) && Number.isFinite(sy) ? items.map(p => ({ ...p, x: p.x + sx, y: p.y + sy })) : items
}

function overlaps(a: PlacedCargo, b: PlacedCargo) {
  const ad = a.rotation === 90 ? { l: a.width, w: a.length } : { l: a.length, w: a.width }
  const bd = b.rotation === 90 ? { l: b.width, w: b.length } : { l: b.length, w: b.width }
  return a.x < b.x + bd.l - EPS && a.x + ad.l > b.x + EPS &&
    a.y < b.y + bd.w - EPS && a.y + ad.w > b.y + EPS &&
    a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}

function validAgainstResult(p: PlacedCargo, result: PlacedCargo[], container: Container) {
  const d = p.rotation === 90 ? { l: p.width, w: p.length } : { l: p.length, w: p.width }
  if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.x + d.l > container.length + EPS || p.y + d.w > container.width + EPS || p.z + p.height > container.height + EPS) return false
  return !result.some(q => overlaps(p, q))
}

export async function packLaff(cargo: Cargo[], container: Container, progress?: Progress, options: Options = {}) {
  const gs = groups(cargo)
  const total = gs.reduce((n, g) => n + g.quantity, 0)
  if (!total) { progress?.(100); return [] }

  const H = Math.max(0, container.height)
  let done = 0
  let seq = 0
  let result: PlacedCargo[] = []
  const supportLoads = new Map<string, number>()
  let spaces: FreeSpace[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: H, supported: true, supportKind: 'floor', stackDepth: 0 }]

  for (const g of gs) {
    abort(options.signal)
    let remaining = g.quantity
    const c = g.cargo

    while (remaining > 0) {
      abort(options.signal)
      const choices = candidates(spaces, c, container, supportLoads)
      if (!choices.length) break

      // For small batches, test several top candidates instead of committing
      // to the first greedy space. This is a bounded look-ahead that greatly
      // improves mixed cargo without the cost of a full 3-D search.
      const limit = remaining <= 3 ? Math.min(6, choices.length) : Math.min(3, choices.length)
      let selected: Candidate | undefined
      for (let ci = 0; ci < limit; ci++) {
        const candidate = choices[ci]
        const o = candidate.orientation
        const s = candidate.space
        const x = s.x
        const y = s.y
        const z = s.z
        const test = placed(c, seq, o, x, y, z)
        if (!validAgainstResult(test, result, container)) continue

        // Prefer candidates that leave at least one reusable rectangular
        // remainder. Tiny slivers are less useful for subsequent mixed cargo.
        const remainders = [
          s.length - o.length,
          s.width - o.width,
          s.height - o.height,
        ].filter(v => v > EPS)
        const usable = remainders.filter(v => v >= Math.min(o.length, o.width) * .35).length
        const adjusted = candidate.score - usable * 35
        if (!selected || adjusted < selected.score) selected = { ...candidate, score: adjusted }
      }
      if (!selected) break

      const s = selected.space
      const o = selected.orientation
      const x = s.x
      const y = s.y
      const z = s.z
      const p = placed(c, seq, o, x, y, z)

      if (!validAgainstResult(p, result, container)) break

      // One physical cargo unit is committed at a time. This removes the old
      // batch.slice(0, 1) fallback and guarantees every committed unit has
      // independently validated coordinates, so free-space errors can never
      // turn into interpenetrating cargo.
      p.id = `${c.id}-${seq + 1}`
      result.push(p)
      seq++
      done++
      remaining--
      progress?.(Math.min(99, Math.round(done / total * 100)))

      const nextSpaces = split(
        s,
        { x, y, length: o.length, width: o.width, height: o.height },
        c.stackable && c.loadBearing,
        c,
        p.id,
      )
      spaces = prune([...spaces.filter(q => q !== s), ...nextSpaces])

      if (s.supportKind === 'cargo' && s.supportCargoId) {
        supportLoads.set(s.supportCargoId, (supportLoads.get(s.supportCargoId) ?? 0) + c.weight)
      }

      if ((done & 31) === 0) await yieldBrowser()
    }
    await yieldBrowser()
  }

  result = center(result, container)
  progress?.(100)
  return result
}
