import type { Cargo, Container, PlacedCargo } from '../types'

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }

type InternalPlaced = { p: PlacedCargo; actualLength: number; actualWidth: number; stackDepth: number }
type CandidatePoint = { x: number; y: number; z: number }
type SupportInfo = { ok: boolean; depth: number; palletSupport: boolean; loadScore: number }

const EPS = 0.5
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Packing cancelled', 'AbortError') }
const yieldBrowser = () => new Promise<void>(resolve => {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) window.requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

function orientations(c: Cargo) {
  const base = { length: c.length, width: c.width, rotation: 0 as 0 | 90 }
  if (!c.rotatable || Math.abs(c.length - c.width) <= EPS) return [base]
  return [base, { length: c.width, width: c.length, rotation: 90 as 0 | 90 }]
}

function overlap2d(ax:number, ay:number, al:number, aw:number, bx:number, by:number, bl:number, bw:number) {
  const x = Math.max(0, Math.min(ax + al, bx + bl) - Math.max(ax, bx))
  const y = Math.max(0, Math.min(ay + aw, by + bw) - Math.max(ay, by))
  return x * y
}

function overlap3d(a:InternalPlaced, x:number, y:number, z:number, l:number, w:number, h:number) {
  return x < a.p.x + a.actualLength - EPS && x + l > a.p.x + EPS &&
    y < a.p.y + a.actualWidth - EPS && y + w > a.p.y + EPS &&
    z < a.p.z + a.p.height - EPS && z + h > a.p.z + EPS
}

function fitsContainer(x:number,y:number,z:number,l:number,w:number,h:number,c:Container) {
  return x >= -EPS && y >= -EPS && z >= -EPS &&
    x + l <= c.length + EPS && y + w <= c.width + EPS && z + h <= c.height + EPS
}

function supportFor(cargo:Cargo,x:number,y:number,z:number,l:number,w:number,placed:InternalPlaced[],cargoById:Map<string,Cargo>,supportLoads:Map<string,number>):SupportInfo {
  if (z <= EPS) return { ok:true, depth:0, palletSupport:false, loadScore:0 }
  if (!cargo.stackable || cargo.type === 'pallet') return { ok:false, depth:0, palletSupport:false, loadScore:Infinity }

  const baseArea = l * w
  let supportedArea = 0
  let maxDepth = 1
  let palletSupport = false
  let loadScore = 0
  const supports:InternalPlaced[] = []

  for (const q of placed) {
    if (Math.abs(q.p.z + q.p.height - z) > EPS) continue
    const sc = cargoById.get(q.p.cargoId)
    if (!sc?.loadBearing) continue
    const area = overlap2d(x,y,l,w,q.p.x,q.p.y,q.actualLength,q.actualWidth)
    if (area <= EPS) continue
    supportedArea += area
    const depth = q.p.cargoId === cargo.id ? q.stackDepth + 1 : 1
    maxDepth = Math.max(maxDepth, depth)
    palletSupport ||= q.p.cargoType === 'pallet'
    supports.push(q)
  }

  if (supportedArea < baseArea * 0.98) return { ok:false, depth:maxDepth, palletSupport, loadScore:Infinity }
  const configured = Number.isFinite(cargo.maxStackLayers) ? Math.floor(cargo.maxStackLayers) : 0
  if (configured > 0 && maxDepth > configured) return { ok:false, depth:maxDepth, palletSupport, loadScore:Infinity }

  let pressure = 0
  for (const q of supports) {
    const sc = cargoById.get(q.p.cargoId)
    const limit = Number.isFinite(sc?.maxLoadOnTop) ? sc?.maxLoadOnTop ?? 0 : 0
    const used = supportLoads.get(q.p.id) ?? 0
    if (limit > 0 && used + cargo.weight > limit + EPS) return { ok:false, depth:maxDepth, palletSupport, loadScore:Infinity }
    pressure += limit > 0 ? (used + cargo.weight) / limit : used / Math.max(1, q.p.weight)
  }
  loadScore = pressure / Math.max(1, supports.length)
  return { ok:true, depth:maxDepth, palletSupport, loadScore }
}

function makePlaced(c:Cargo,index:number,o:{rotation:0|90},x:number,y:number,z:number):PlacedCargo {
  return { id:`${c.id}-${index+1}`, cargoId:c.id, cargoType:c.type, x,y,z, length:c.length,width:c.width,height:c.height,weight:c.weight,color:c.color,rotation:o.rotation,placementMode:'automatic',locked:false }
}

function internalFromPlaced(p:PlacedCargo,depth:number):InternalPlaced {
  const rotated = Math.abs(Math.round(p.rotation / 90)) % 2 === 1
  return { p, actualLength:rotated ? p.width : p.length, actualWidth:rotated ? p.length : p.width, stackDepth:depth }
}

function sortCargo(cargo:Cargo[]) {
  return cargo.map(c=>({cargo:c,quantity:Math.max(0,Math.floor(c.quantity))}))
    .filter(g=>g.quantity>0 && g.cargo.length>0 && g.cargo.width>0 && g.cargo.height>0)
    .sort((a,b)=>{
      const ap=a.cargo.type==='pallet'&&a.cargo.loadBearing?1:0
      const bp=b.cargo.type==='pallet'&&b.cargo.loadBearing?1:0
      if(ap!==bp) return bp-ap
      const av=a.cargo.length*a.cargo.width*a.cargo.height
      const bv=b.cargo.length*b.cargo.width*b.cargo.height
      return bv-av
    })
}

// Generate a denser set of extreme points. The old solver only used the corners
// of each item, which misses valid combinations such as x from one pallet and y
// from another. Here we combine right/top edges on the same support plane.
function pointsFor(placed:InternalPlaced[], z:number):CandidatePoint[] {
  const xs=[0], ys=[0]
  for(const q of placed) {
    const base=Math.abs(q.p.z-z)<=EPS
    const top=Math.abs(q.p.z+q.p.height-z)<=EPS
    if(base || top) {
      xs.push(q.p.x+q.actualLength)
      ys.push(q.p.y+q.actualWidth)
    }
  }
  const points:CandidatePoint[]=[]
  const seen=new Set<string>()
  for(const x of xs) for(const y of ys) {
    const key=`${Math.round(x*10)}|${Math.round(y*10)}|${Math.round(z*10)}`
    if(seen.has(key)) continue
    seen.add(key); points.push({x,y,z})
  }
  return points
}

function zLevelsFor(c:Cargo,placed:InternalPlaced[]) {
  const levels=[0]
  if(c.stackable) for(const q of placed) {
    if(q.p.cargoType==='pallet' || q.p.z+q.p.height>0) {
      const supportCargo=q.p.cargoType
      if(supportCargo!=='pallet' || q.p.height>0) levels.push(q.p.z+q.p.height)
    }
  }
  return [...new Set(levels.map(z=>Math.round(z*10)/10))].sort((a,b)=>a-b)
}

function scoreCandidate(point:CandidatePoint,o:{length:number;width:number},container:Container,support:SupportInfo,placed:InternalPlaced[]) {
  let contact=0
  for(const q of placed) {
    if(Math.abs(q.p.z+q.p.height-point.z)>EPS && Math.abs(q.p.z-point.z)>EPS) continue
    contact += overlap2d(point.x,point.y,o.length,o.width,q.p.x,q.p.y,q.actualLength,q.actualWidth)
  }
  const cx=point.x+o.length/2, cy=point.y+o.width/2
  const center=Math.hypot(cx-container.length/2,cy-container.width/2)
  // Pallet-top support is preferred, but distribute load between supports instead
  // of piling every carton onto the first pallet.
  const palletBonus=support.palletSupport ? -1e9 : 0
  return palletBonus + support.loadScore*5000 + point.z*50 - contact*0.002 + center*0.01 + point.x*0.00001 + point.y*0.00001
}

function hasOverlap(p:PlacedCargo, placed:InternalPlaced[]) {
  const d=internalFromPlaced(p,1)
  return placed.some(q=>overlap3d(q,d.p.x,d.p.y,d.p.z,d.actualLength,d.actualWidth,d.p.height))
}

export async function autoPackExtreme(cargo:Cargo[],container:Container,locked:PlacedCargo[]=[],progress?:Progress,options:Options={}) {
  const groups=sortCargo(cargo)
  const total=groups.reduce((n,g)=>n+g.quantity,0)
  if(!total){progress?.(100);return locked.slice()}

  const cargoById=new Map(cargo.map(c=>[c.id,c]))
  const result=locked.slice()
  const placed:InternalPlaced[]=locked.map(p=>internalFromPlaced(p,1))
  const supportLoads=new Map<string,number>()
  let done=0, sequence=0
  let totalWeight=locked.reduce((s,p)=>s+p.weight,0)

  for(const group of groups) {
    abort(options.signal)
    const c=group.cargo
    let remaining=group.quantity
    while(remaining>0) {
      abort(options.signal)
      if(container.maxPayload>0 && totalWeight+c.weight>container.maxPayload+EPS) break

      let best:{point:CandidatePoint;orientation:{length:number;width:number;rotation:0|90};score:number;depth:number;support:SupportInfo}|undefined
      const levels=zLevelsFor(c,placed)
      for(const z of levels) {
        // Non-stackable cargo is floor-only. Pallets are also kept on the floor
        // while a valid floor position exists; stacking pallets is a fallback.
        if((!c.stackable || c.type==='pallet') && z>EPS) continue
        const points=pointsFor(placed,z)
        for(const point of points) for(const o of orientations(c)) {
          if(!fitsContainer(point.x,point.y,point.z,o.length,o.width,c.height,container)) continue
          if(placed.some(q=>overlap3d(q,point.x,point.y,point.z,o.length,o.width,c.height))) continue
          const support=supportFor(c,point.x,point.y,point.z,o.length,o.width,placed,cargoById,supportLoads)
          if(!support.ok) continue
          const score=scoreCandidate(point,o,container,support,placed)
          if(!best || score<best.score) best={point,orientation:o,score,depth:support.depth,support}
        }
        // For pallets/non-stackable cargo the lowest valid plane is enough.
        if(best && (!c.stackable || c.type==='pallet')) break
      }
      if(!best) break

      const p=makePlaced(c,sequence++,best.orientation,best.point.x,best.point.y,best.point.z)
      if(hasOverlap(p,placed)) break
      const q=internalFromPlaced(p,best.depth)
      result.push(p); placed.push(q); totalWeight+=c.weight

      if(p.z>EPS) for(const support of placed) {
        if(support.p.id===p.id || Math.abs(support.p.z+support.p.height-p.z)>EPS) continue
        const area=overlap2d(p.x,p.y,q.actualLength,q.actualWidth,support.p.x,support.p.y,support.actualLength,support.actualWidth)
        if(area>EPS) supportLoads.set(support.p.id,(supportLoads.get(support.p.id)??0)+c.weight)
      }

      remaining--; done++
      progress?.(Math.min(99,Math.round(done/total*100)))
      if((done&7)===0) await yieldBrowser()
    }
    await yieldBrowser()
  }
  progress?.(100)
  return result
}
