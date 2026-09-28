import type { Cargo, Container, PlacedCargo } from '../types'

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }
type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type Space = {
  x: number; y: number; z: number
  length: number; width: number; height: number
  supportKind: 'floor' | 'cargo'
  supportCargoId?: string
  supportCargoTemplateId?: string
  supportLoadBearing?: boolean
  supportMaxLoadOnTop?: number
  stackDepth: number
}
type Candidate = { space: Space; orientation: Orientation; x: number; y: number; z: number; score: number; nextSpaces: Space[] }

const EPS = 0.5
const abort = (s?: AbortSignal) => { if (s?.aborted) throw new DOMException('Packing cancelled', 'AbortError') }
const yieldBrowser = () => new Promise<void>(r => typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame(() => r()) : setTimeout(r, 0))

function dims(p: PlacedCargo) {
  return p.rotation === 90 ? { l: p.width, w: p.length } : { l: p.length, w: p.width }
}
function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}
function box(c: Cargo, id: string, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return { id, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: o.height, weight: c.weight, color: c.color, rotation: o.rotation, placementMode: 'automatic', locked: false }
}
function overlap(a: PlacedCargo, b: PlacedCargo) {
  const ad = dims(a), bd = dims(b)
  return a.x < b.x + bd.l - EPS && a.x + ad.l > b.x + EPS && a.y < b.y + bd.w - EPS && a.y + ad.w > b.y + EPS && a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}
function inside(p: PlacedCargo, c: Container) {
  const d = dims(p)
  return p.x >= -EPS && p.y >= -EPS && p.z >= -EPS && p.x + d.l <= c.length + EPS && p.y + d.w <= c.width + EPS && p.z + p.height <= c.height + EPS
}
function valid(p: PlacedCargo, result: PlacedCargo[], locked: PlacedCargo[], c: Container) {
  if (!inside(p, c)) return false
  return !result.some(q => overlap(p, q)) && !locked.some(q => overlap(p, q))
}
function supportLoadFits(s: Space, weight: number, loads: Map<string, number>) {
  if (s.supportKind === 'floor') return true
  if (!s.supportCargoId || !s.supportLoadBearing) return false
  const limit = Number.isFinite(s.supportMaxLoadOnTop) ? (s.supportMaxLoadOnTop ?? 0) : 0
  if (limit <= 0) return true
  return (loads.get(s.supportCargoId) ?? 0) + weight <= limit + EPS
}
function split(s: Space, u: { x: number; y: number; length: number; width: number; height: number }, c: Cargo, id: string): Space[] {
  const out: Space[] = []
  const sx2 = s.x + s.length, sy2 = s.y + s.width, ux2 = u.x + u.length, uy2 = u.y + u.width
  const push = (x: number, y: number, z: number, length: number, width: number, height: number, extra: Partial<Space> = {}) => {
    if (length <= EPS || width <= EPS || height <= EPS) return
    out.push({ x, y, z, length, width, height, supportKind: s.supportKind, supportCargoId: s.supportCargoId, supportCargoTemplateId: s.supportCargoTemplateId, supportLoadBearing: s.supportLoadBearing, supportMaxLoadOnTop: s.supportMaxLoadOnTop, stackDepth: s.stackDepth, ...extra })
  }
  push(s.x, s.y, s.z, u.x - s.x, s.width, s.height)
  push(ux2, s.y, s.z, sx2 - ux2, s.width, s.height)
  push(u.x, s.y, s.z, u.length, u.y - s.y, s.height)
  push(u.x, uy2, s.z, u.length, sy2 - uy2, s.height)
  if (c.stackable && c.loadBearing) {
    push(u.x, u.y, s.z + u.height, u.length, u.width, s.height - u.height, {
      supportKind: 'cargo', supportCargoId: id, supportCargoTemplateId: c.id, supportLoadBearing: c.loadBearing,
      supportMaxLoadOnTop: Number.isFinite(c.maxLoadOnTop) ? c.maxLoadOnTop : 0, stackDepth: s.stackDepth + 1,
    })
  }
  return out
}
function prune(spaces: Space[]) {
  const unique: Space[] = []
  for (const s of spaces) {
    if (s.length <= EPS || s.width <= EPS || s.height <= EPS) continue
    if (unique.some(q => Math.abs(q.x-s.x)<=EPS && Math.abs(q.y-s.y)<=EPS && Math.abs(q.z-s.z)<=EPS && Math.abs(q.length-s.length)<=EPS && Math.abs(q.width-s.width)<=EPS && Math.abs(q.height-s.height)<=EPS && q.supportCargoId===s.supportCargoId)) continue
    unique.push(s)
  }
  return unique.filter((s,i,all) => !all.some((q,j) => i!==j && q.supportCargoId===s.supportCargoId && q.x<=s.x+EPS && q.y<=s.y+EPS && q.z<=s.z+EPS && q.x+q.length>=s.x+s.length-EPS && q.y+q.width>=s.y+s.width-EPS && q.z+q.height>=s.z+s.height-EPS))
}
function groups(cargo: Cargo[]) {
  const units: Cargo[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i=0;i<n;i++) if (c.length>0 && c.width>0 && c.height>0) units.push(c)
  }
  return units.sort((a,b) => {
    const foundation = (c: Cargo) => c.type==='pallet' && c.loadBearing ? 1 : 0
    if (foundation(a)!==foundation(b)) return foundation(b)-foundation(a)
    const difficulty = (c: Cargo) => (c.quantity<=3?1000000:c.quantity<=8?250000:0) + (!c.rotatable?70000:0) + (!c.stackable?50000:0) + c.height*0.2 + c.length*c.width*0.05
    return difficulty(b)-difficulty(a) || b.weight-a.weight
  })
}
function fitSpace(s: Space, o: Orientation) {
  return o.length <= s.length + EPS && o.width <= s.width + EPS && o.height <= s.height + EPS
}
function futureFitCount(spaces: Space[], future: Cargo[]) {
  let score = 0
  for (const c of future.slice(0, 5)) {
    const ok = spaces.some(s => orientations(c).some(o => fitSpace(s,o)))
    if (ok) score++
  }
  return score
}
function scoreCandidate(s: Space, o: Orientation, x: number, y: number, c: Container, future: Cargo[], nextSpaces: Space[], weightBefore: number, moments: {x:number;y:number}, cargoWeight:number) {
  const rx = s.length-o.length, ry=s.width-o.width, rz=s.height-o.height
  const leftover = Math.max(0, rx*ry*Math.max(o.height,1)) + Math.max(0,rx)*Math.max(0,rz)*Math.max(o.width,1) + Math.max(0,ry)*Math.max(0,rz)*Math.max(o.length,1)
  const sliver = [rx,ry,rz].filter(v => v>EPS && v<Math.min(o.length,o.width,o.height)*0.28).length
  const floor = s.supportKind==='floor' ? 1 : 0
  const wall = (Math.abs(x)<EPS?1:0) + (Math.abs(y)<EPS?1:0) + (Math.abs((x+o.length)-c.length)<EPS?1:0) + (Math.abs((y+o.width)-c.width)<EPS?1:0)
  const future = futureFitCount(nextSpaces, future)
  const total = weightBefore + cargoWeight
  const cx = total>0 ? (moments.x + (x+o.length/2)*cargoWeight)/total : c.length/2
  const cy = total>0 ? (moments.y + (y+o.width/2)*cargoWeight)/total : c.width/2
  const cgPenalty = Math.hypot(cx-c.length/2, cy-c.width/2)
  return leftover*0.00003 + sliver*1800 + Math.max(0, rz)*0.04 - floor*220 - wall*90 - future*18000 + cgPenalty*0.8 - (s.supportKind==='cargo'?500:0)
}

export async function smartPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = [], progress?: Progress, options: Options = {}) {
  const units = groups(cargo)
  if (!units.length) { progress?.(100); return locked.slice() }
  const safeLocked = locked.filter(p => inside(p,container))
  let result = safeLocked.slice()
  let spaces: Space[] = [{x:0,y:0,z:0,length:container.length,width:container.width,height:container.height,supportKind:'floor',stackDepth:0}]
  const supportLoads = new Map<string,number>()
  const total = units.length
  let done = 0
  let seq = 0
  let weightBefore = safeLocked.reduce((n,p)=>n+p.weight,0)
  const moments = safeLocked.reduce((m,p)=> { const d=dims(p); m.x+=(p.x+d.l/2)*p.weight; m.y+=(p.y+d.w/2)*p.weight; return m }, {x:0,y:0})

  // Locked cargo is treated as a real obstacle. Subtract it from the initial
  // free-space map in ascending Z order so automatic packing cannot pass through it.
  for (const p of [...safeLocked].sort((a,b)=>a.z-b.z)) {
    const d=dims(p)
    const idx=spaces.findIndex(s => p.x>=s.x-EPS && p.y>=s.y-EPS && p.z>=s.z-EPS && p.x+d.l<=s.x+s.length+EPS && p.y+d.w<=s.y+s.width+EPS && p.z+p.height<=s.z+s.height+EPS)
    if (idx>=0) {
      const s=spaces[idx]
      spaces=prune([...spaces.slice(0,idx),...spaces.slice(idx+1),...split(s,{x:p.x,y:p.y,length:d.l,width:d.w,height:p.height},{...({} as Cargo),id:p.id} as Cargo,p.id)])
    }
  }

  for (let i=0;i<units.length;i++) {
    abort(options.signal)
    const c=units[i]
    if (container.maxPayload>0 && weightBefore+c.weight>container.maxPayload+EPS) break
    const future=units.slice(i+1)
    const candidates: Candidate[]=[]
    for (const s of spaces) {
      if (!supportLoadFits(s,c.weight,supportLoads)) continue
      if (s.supportKind==='cargo' && s.supportCargoTemplateId===c.id && c.maxStackLayers>0 && s.stackDepth>=Math.floor(c.maxStackLayers)) continue
      for (const o of orientations(c)) {
        if (!fitSpace(s,o)) continue
        const anchors=[[s.x,s.y],[s.x+s.length-o.length,s.y],[s.x,s.y+s.width-o.width],[s.x+s.length-o.length,s.y+s.width-o.width]]
        for (const [x,y] of anchors) {
          const id=`${c.id}-${seq+1}`
          const p=box(c,id,o,x,y,s.z)
          if (!valid(p,result,safeLocked,container)) continue
          const next=prune([...spaces.filter(q=>q!==s),...split(s,{x,y,length:o.length,width:o.width,height:o.height},c,id)])
          const score=scoreCandidate(s,o,x,y,container,future,next,weightBefore,moments,c.weight)
          candidates.push({space:s,orientation:o,x,y,z:s.z,score,nextSpaces:next})
        }
      }
    }
    if (!candidates.length) {
      // Leave the unit unpacked rather than forcing an invalid placement.
      done++
      progress?.(Math.min(99,Math.round(done/total*100)))
      continue
    }
    candidates.sort((a,b)=>a.score-b.score)
    const chosen=candidates[0]
    const p=box(c,`${c.id}-${seq+1}`,chosen.orientation,chosen.x,chosen.y,chosen.z)
    if (!valid(p,result,safeLocked,container)) { done++; continue }
    result.push(p)
    seq++
    done++
    weightBefore+=c.weight
    moments.x+=(p.x+(p.rotation===90?p.width:p.length)/2)*c.weight
    moments.y+=(p.y+(p.rotation===90?p.length:p.width)/2)*c.weight
    if (chosen.space.supportKind==='cargo' && chosen.space.supportCargoId) supportLoads.set(chosen.space.supportCargoId,(supportLoads.get(chosen.space.supportCargoId)??0)+c.weight)
    spaces=chosen.nextSpaces
    progress?.(Math.min(99,Math.round(done/total*100)))
    if ((done&15)===0) await yieldBrowser()
  }
  progress?.(100)
  return result
}
