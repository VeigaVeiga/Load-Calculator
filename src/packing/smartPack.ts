import type { Cargo, Container, PlacedCargo } from '../types'

type Space = { x: number; y: number; z: number; l: number; w: number; h: number; support?: string; supportLoad: number; supportLimit: number; depth: number }
type Ori = { l: number; w: number; h: number; r: 0 | 90 }

const EPS = 0.5
const dims = (p: PlacedCargo) => p.rotation === 90 ? { l: p.width, w: p.length } : { l: p.length, w: p.width }
const oris = (c: Cargo): Ori[] => {
  const a: Ori = { l: c.length, w: c.width, h: c.height, r: 0 }
  return c.rotatable && Math.abs(c.length - c.width) > EPS ? [a, { l: c.width, w: c.length, h: c.height, r: 90 }] : [a]
}
const fits = (s: Space, o: Ori) => o.l <= s.l + EPS && o.w <= s.w + EPS && o.h <= s.h + EPS
const overlap = (a: PlacedCargo, b: PlacedCargo) => {
  const A = dims(a), B = dims(b)
  return a.x < B.l + b.x - EPS && a.x + A.l > b.x + EPS && a.y < B.w + b.y - EPS && a.y + A.w > b.y + EPS && a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}
const inside = (p: PlacedCargo, c: Container) => {
  const d = dims(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS && p.x + d.l <= c.length + EPS && p.y + d.w <= c.width + EPS && p.z + p.height <= c.height + EPS
}
function make(c: Cargo, o: Ori, x: number, y: number, z: number, id: string): PlacedCargo {
  return { id, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: c.height, rotation: o.r, weight: c.weight, color: c.color, placementMode: 'automatic', locked: false }
}
function split(s: Space, o: Ori, x: number, y: number, z: number, id: string, c: Cargo): Space[] {
  const out: Space[] = []
  const add = (a: Space) => { if (a.l > EPS && a.w > EPS && a.h > EPS) out.push(a) }
  add({ ...s, l: x - s.x })
  add({ ...s, x: x + o.l, l: s.x + s.l - (x + o.l) })
  add({ ...s, y, w: y - s.y })
  add({ ...s, y: y + o.w, w: s.y + s.w - (y + o.w) })
  if (c.stackable && c.loadBearing) {
    add({ x, y, z: z + o.h, l: o.l, w: o.w, h: s.h - o.h, support: id, supportLoad: 0, supportLimit: Number.isFinite(c.maxLoadOnTop) ? c.maxLoadOnTop : 0, depth: s.depth + 1 })
  }
  return out
}
function prune(spaces: Space[]) {
  const out: Space[] = []
  for (const s of spaces) {
    if (s.l <= EPS || s.w <= EPS || s.h <= EPS) continue
    if (out.some(q => Math.abs(q.x - s.x) <= EPS && Math.abs(q.y - s.y) <= EPS && Math.abs(q.z - s.z) <= EPS && Math.abs(q.l - s.l) <= EPS && Math.abs(q.w - s.w) <= EPS && Math.abs(q.h - s.h) <= EPS && q.support === s.support)) continue
    out.push(s)
  }
  return out
}
function expand(cargo: Cargo[]) {
  const units: Cargo[] = []
  for (const c of cargo) {
    for (let i = 0, n = Math.max(0, Math.floor(c.quantity)); i < n; i++) {
      if (c.length > 0 && c.width > 0 && c.height > 0) units.push(c)
    }
  }
  return units.sort((a, b) => {
    const difficulty = (c: Cargo) => (c.quantity <= 3 ? 1000000 : 0) + (c.rotatable ? 0 : 100000) + (c.stackable ? 0 : 50000) + c.length * c.width
    return difficulty(b) - difficulty(a)
  })
}
function futureScore(spaces: Space[], future: Cargo[]) {
  let n = 0
  for (const c of future.slice(0, 6)) if (spaces.some(s => oris(c).some(o => fits(s, o)))) n++
  return n
}

export async function smartPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = [], progress?: (n: number) => void, options: { signal?: AbortSignal } = {}) {
  const units = expand(cargo)
  if (!units.length) { progress?.(100); return locked.slice() }

  const safe = locked.filter(p => inside(p, container))
  let result = safe.slice()
  let spaces: Space[] = [{ x: 0, y: 0, z: 0, l: container.length, w: container.width, h: container.height, supportLoad: 0, supportLimit: 0, depth: 0 }]
  let totalWeight = safe.reduce((n, p) => n + p.weight, 0)
  let seq = 0

  // Locked cargo is an actual obstacle. Remove it from the initial free-space map.
  for (const p of [...safe].sort((a, b) => a.z - b.z)) {
    const d = dims(p)
    const i = spaces.findIndex(s => p.x >= s.x - EPS && p.y >= s.y - EPS && p.z >= s.z - EPS && p.x + d.l <= s.x + s.l + EPS && p.y + d.w <= s.y + s.w + EPS && p.z + p.height <= s.z + s.h + EPS)
    if (i < 0) continue
    const s = spaces[i]
    const obstacle: Ori = { l: d.l, w: d.w, h: p.height, r: p.rotation }
    const dummy = { ...({} as Cargo), stackable: false, loadBearing: false } as Cargo
    spaces = prune([...spaces.slice(0, i), ...spaces.slice(i + 1), ...split(s, obstacle, p.x, p.y, p.z, p.id, dummy)])
  }

  for (let i = 0; i < units.length; i++) {
    if (options.signal?.aborted) throw new Error('Packing cancelled')
    const c = units[i]
    if (container.maxPayload > 0 && totalWeight + c.weight > container.maxPayload + EPS) continue
    const future = units.slice(i + 1)
    let best: { p: PlacedCargo; spaces: Space[]; score: number } | undefined

    for (const s of spaces) {
      if (s.support && s.supportLimit > 0 && s.supportLoad + c.weight > s.supportLimit + EPS) continue
      if (s.support && s.depth >= Math.max(1, Math.floor(c.maxStackLayers || 999999))) continue
      for (const o of oris(c)) {
        if (!fits(s, o)) continue
        const anchors: Array<[number, number]> = [[s.x, s.y], [s.x + s.l - o.l, s.y], [s.x, s.y + s.w - o.w], [s.x + s.l - o.l, s.y + s.w - o.w]]
        for (const [x, y] of anchors) {
          const p = make(c, o, x, y, s.z, `${c.id}-${seq + 1}`)
          if (!inside(p, container) || result.some(q => overlap(p, q))) continue
          const ns = prune([...spaces.filter(q => q !== s), ...split(s, o, x, y, s.z, p.id, c)])
          const center = Math.hypot(x + o.l / 2 - container.length / 2, y + o.w / 2 - container.width / 2)
          const futureFit = futureScore(ns, future)
          const leftover = Math.max(0, s.l - o.l) * Math.max(0, s.w - o.w)
          const score = leftover * 0.02 + center * 0.5 - futureFit * 10000 - (s.support ? 500 : 0) - (s.x < 1 ? 20 : 0) - (s.y < 1 ? 20 : 0)
          if (!best || score < best.score) best = { p, spaces: ns, score }
        }
      }
    }

    if (best) {
      result.push(best.p)
      spaces = best.spaces
      totalWeight += c.weight
      seq++
    }
    progress?.(Math.round((i + 1) / units.length * 100))
    if ((i & 15) === 15) await new Promise<void>(resolve => setTimeout(resolve, 0))
  }

  return result
}
