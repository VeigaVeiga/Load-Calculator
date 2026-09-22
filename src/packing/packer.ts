import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap, supportRatio } from './geometry'

const EPS = 0.5
const STEP = 10
const SUPPORT = 0.98
const snap = (n:number) => Math.max(0, Math.round(n / STEP) * STEP)
type Ori = { length:number; width:number; height:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }

function orientations(c:Cargo):Ori[]{
  const a:Ori={length:c.length,width:c.width,height:c.height,rotation:0}
  if(!c.rotatable||Math.abs(c.length-c.width)<EPS)return[a]
  return[a,{length:c.width,width:c.length,height:c.height,rotation:90}]
}

export function expandCargo(cargo:Cargo[]):Unit[]{
  const out:Unit[]=[]
  for(const c of cargo){
    const n=Math.max(0,Math.floor(c.quantity))
    for(let i=0;i<n;i++)out.push({cargo:c,index:i})
  }
  return out
}

function makePlaced(u:Unit,o:Ori,x:number,y:number,z:number):PlacedCargo{
  return {id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:snap(x),y:snap(y),z:snap(z),length:u.cargo.length,width:u.cargo.width,height:o.height,weight:u.cargo.weight,color:u.cargo.color,rotation:o.rotation,placementMode:'automatic',locked:false}
}

function units(cargo:Cargo[]){
  const out=expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0)
  out.sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    return (bv-av)||(b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0)||(b.cargo.stackable?1:0)-(a.cargo.stackable?1:0)
  })
  return out
}

function supports(p:PlacedCargo,items:PlacedCargo[]){
  const d=dims(p)
  return items.filter(q=>Math.abs(q.z+q.height-p.z)<=3&&
    Math.max(0,Math.min(p.x+d.length,q.x+dims(q).length)-Math.max(p.x,q.x))>EPS&&
    Math.max(0,Math.min(p.y+d.width,q.y+dims(q).width)-Math.max(p.y,q.y))>EPS)
}

function stackLevel(p:PlacedCargo,items:PlacedCargo[],seen=new Set<string>()):number{
  if(p.z<=EPS||seen.has(p.id))return 1
  seen.add(p.id)
  const s=supports(p,items)
  return s.length?1+Math.max(...s.map(q=>stackLevel(q,items,new Set(seen)))):1
}

function loadAbove(q:PlacedCargo,items:PlacedCargo[]){
  return items.filter(p=>p.id!==q.id&&Math.abs(q.z+q.height-p.z)<=3).reduce((s,p)=>s+p.weight,0)
}

function canStack(p:PlacedCargo,c:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!c.stackable)return false
  const s=supports(p,items)
  if(!s.length||supportRatio(p,items)<SUPPORT)return false
  // Treat a checked stackable flag as at least two layers when the UI value is 0/1.
  const configured=Math.floor(c.maxStackLayers||0)
  const maxLayers=configured>1?configured:2
  if(stackLevel(p,items)>maxLayers)return false
  return s.every(q=>{
    const d=defs.get(q.cargoId)
    if(!d||!d.loadBearing||d.breakablePallet)return false
    return !Number.isFinite(d.maxLoadOnTop)||d.maxLoadOnTop<=0||loadAbove(q,items)+c.weight<=d.maxLoadOnTop+EPS
  })
}

function validLocked(lock:PlacedCargo[],c:Container,qty:Map<string,number>){
  const out:PlacedCargo[]=[]
  for(const p of lock){
    if(!qty.get(p.cargoId)||!inBounds(p,c)||out.some(q=>overlap(p,q)))continue
    out.push(p)
  }
  return out
}

function overlapsAny(p:PlacedCargo,items:PlacedCargo[]){return items.some(q=>overlap(p,q))}

function floorPositions(c:Container,o:Ori){
  const maxX=Math.max(0,c.length-o.length),maxY=Math.max(0,c.width-o.width)
  const xs:number[]=[];const ys:number[]=[]
  for(let x=0;x<=maxX+EPS;x+=STEP)xs.push(Math.min(x,maxX))
  for(let y=0;y<=maxY+EPS;y+=STEP)ys.push(Math.min(y,maxY))
  if(xs[xs.length-1]!==maxX)xs.push(maxX)
  if(ys[ys.length-1]!==maxY)ys.push(maxY)
  // Raster order is deliberate: fill rows/columns instead of making a pyramid.
  const cx=maxX/2,cy=maxY/2
  xs.sort((a,b)=>Math.abs(a-cx)-Math.abs(b-cx)||a-b)
  ys.sort((a,b)=>Math.abs(a-cy)-Math.abs(b-cy)||a-b)
  const out:{x:number;y:number;distance:number}[]=[]
  for(const y of ys)for(const x of xs)out.push({x,y,distance:Math.hypot(x+o.length/2-c.length/2,y+o.width/2-c.width/2)})
  return out
}

function stackPositions(items:PlacedCargo[],c:Container,o:Ori,u:Unit){
  const out:{x:number;y:number;z:number;distance:number}[]=[]
  const seen=new Set<string>()
  // Lowest existing support surface first. This creates complete lower layers before upper layers.
  const sources=items.slice().sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)
  for(const q of sources){
    const qd=dims(q),z=q.z+q.height
    const xs=[q.x,q.x+qd.length-o.length,q.x+(qd.length-o.length)/2]
    const ys=[q.y,q.y+qd.width-o.width,q.y+(qd.width-o.width)/2]
    for(const x of xs)for(const y of ys){
      const xx=Math.max(0,Math.min(c.length-o.length,snap(x)))
      const yy=Math.max(0,Math.min(c.width-o.width,snap(y)))
      const key=`${xx}:${yy}:${z}`
      if(seen.has(key)||xx+o.length>c.length||yy+o.width>c.width)continue
      seen.add(key)
      out.push({x:xx,y:yy,z,distance:Math.hypot(xx+o.length/2-c.length/2,yy+o.width/2-c.width/2)})
    }
  }
  return out.sort((a,b)=>a.z-b.z||a.distance-b.distance||a.y-b.y||a.x-b.x)
}

function choose(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>){
  // Phase 1: completely exhaust usable floor space. No stacking is considered while a floor slot exists.
  for(const o of orientations(u.cargo)){
    for(const pos of floorPositions(c,o)){
      const p=makePlaced(u,o,pos.x,pos.y,0)
      if(inBounds(p,c)&&!overlapsAny(p,items))return p
    }
  }
  // Phase 2: stack only after the floor is exhausted, and always choose the lowest support level first.
  if(!u.cargo.stackable)return undefined
  for(const o of orientations(u.cargo)){
    for(const pos of stackPositions(items,c,o,u)){
      const p=makePlaced(u,o,pos.x,pos.y,pos.z)
      if(!inBounds(p,c)||overlapsAny(p,items)||!canStack(p,u.cargo,items,defs))continue
      return p
    }
  }
  return undefined
}

function buildState(cargo:Cargo[],c:Container,locked:PlacedCargo[]){
  const defs=new Map(cargo.map(x=>[x.id,x])),qty=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,qty),count=new Map<string,number>()
  for(const p of items)count.set(p.cargoId,(count.get(p.cargoId)||0)+1)
  const us=units(cargo).filter(u=>u.index>=(count.get(u.cargo.id)||0))
  return {defs,items,us}
}

function placeOne(state:ReturnType<typeof buildState>,u:Unit,c:Container){
  const p=choose(u,state.items,c,state.defs)
  if(p)state.items.push(p)
}

function pack(cargo:Cargo[],c:Container,locked:PlacedCargo[],step?:(i:number,n:number)=>void){
  const state=buildState(cargo,c,locked)
  for(let i=0;i<state.us.length;i++){placeOne(state,state.us[i],c);step?.(i+1,state.us.length)}
  return state.items
}

export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){return pack(cargo,c,locked)}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],progress?:(percent:number)=>void){
  const state=buildState(cargo,c,locked),n=state.us.length
  for(let i=0;i<n;i++){
    placeOne(state,state.us[i],c)
    progress?.(n?(i+1)/n*100:100)
    if((i&7)===7)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  }
  progress?.(100)
  return state.items
}
