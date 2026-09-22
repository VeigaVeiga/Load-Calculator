import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap, supportRatio } from './geometry'

const EPS = 0.5
const GRID = 100
const SUPPORT = 0.98
const MAX_FLOOR_CANDIDATES = 900
const MAX_STACK_SOURCES = 40
const snap = (n:number) => Math.max(0, Math.round(n / 10) * 10)
type Ori = { length:number; width:number; height:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }
type Candidate = { x:number; y:number; d:number }
type FloorIndex = Map<string, Set<string>>

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
  return{id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:snap(x),y:snap(y),z:snap(z),length:u.cargo.length,width:u.cargo.width,height:o.height,weight:u.cargo.weight,color:u.cargo.color,rotation:o.rotation,placementMode:'automatic',locked:false}
}

function supports(p:PlacedCargo,items:PlacedCargo[]){
  const d=dims(p)
  return items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&Math.max(0,Math.min(p.x+d.length,q.x+dims(q).length)-Math.max(p.x,q.x))*Math.max(0,Math.min(p.y+d.width,q.y+dims(q).width)-Math.max(p.y,q.y))>EPS)
}

function stackLevel(p:PlacedCargo,items:PlacedCargo[],seen=new Set<string>()):number{
  if(p.z<=EPS||seen.has(p.id))return 1
  seen.add(p.id)
  const s=supports(p,items)
  return s.length?1+Math.max(...s.map(q=>stackLevel(q,items,new Set(seen)))):1
}

function loadAbove(q:PlacedCargo,items:PlacedCargo[]){
  return items.filter(p=>p.id!==q.id&&Math.abs(q.z+q.height-p.z)<=EPS).reduce((s,p)=>s+p.weight,0)
}

function canStack(p:PlacedCargo,c:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!c.stackable)return false
  const s=supports(p,items)
  if(!s.length||supportRatio(p,items)<SUPPORT)return false
  if(stackLevel(p,items)>Math.max(1,Math.floor(c.maxStackLayers||1)))return false
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

function units(cargo:Cargo[]){
  const out=expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0)
  out.sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    return(bv-av)||(b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0)||(b.cargo.stackable?1:0)-(a.cargo.stackable?1:0)||(b.cargo.weight-a.cargo.weight)
  })
  return out
}

function cellKey(ix:number,iy:number){return `${ix}:${iy}`}

function floorCells(x:number,y:number,o:{length:number;width:number}){
  const ix0=Math.max(0,Math.floor(x/GRID)),iy0=Math.max(0,Math.floor(y/GRID))
  const ix1=Math.ceil((x+o.length)/GRID)-1,iy1=Math.ceil((y+o.width)/GRID)-1
  const out:string[]=[]
  for(let ix=ix0;ix<=ix1;ix++)for(let iy=iy0;iy<=iy1;iy++)out.push(cellKey(ix,iy))
  return out
}

function addFloorIndex(index:FloorIndex,p:PlacedCargo){
  if(p.z>EPS)return
  const d=dims(p)
  for(const key of floorCells(p.x,p.y,d)){
    let ids=index.get(key)
    if(!ids){ids=new Set();index.set(key,ids)}
    ids.add(p.id)
  }
}

function floorFree(index:FloorIndex,x:number,y:number,o:Ori,itemsById:Map<string,PlacedCargo>){
  const probe:PlacedCargo={id:'__probe__',cargoId:'__probe__',cargoType:'carton',x,y,z:0,length:o.length,width:o.width,height:o.height,rotation:0,weight:0,color:'#000',placementMode:'automatic',locked:false}
  const ids=new Set<string>()
  for(const key of floorCells(x,y,o)){
    const cell=index.get(key)
    if(cell)for(const id of cell)ids.add(id)
  }
  for(const id of ids){const q=itemsById.get(id);if(q&&overlap(probe,q))return false}
  return true
}

const floorCache=new Map<string,Candidate[]>()
function floorCandidates(c:Container,o:Ori){
  const maxX=Math.max(0,c.length-o.length),maxY=Math.max(0,c.width-o.width),key=`${c.length}x${c.width}:${o.length}x${o.width}`
  const cached=floorCache.get(key);if(cached)return cached
  const cx=maxX/2,cy=maxY/2,step=GRID
  const out:Candidate[]=[]
  const maxIx=Math.floor(maxX/step),maxIy=Math.floor(maxY/step)
  for(let ix=0;ix<=maxIx;ix++)for(let iy=0;iy<=maxIy;iy++){
    const x=ix*step,y=iy*step
    out.push({x,y,d:Math.hypot(x+o.length/2-c.length/2,y+o.width/2-c.width/2)})
  }
  if(maxX%step!==0)for(let iy=0;iy<=maxIy;iy++){const y=iy*step;out.push({x:maxX,y,d:Math.hypot(maxX+o.length/2-c.length/2,y+o.width/2-c.width/2)})}
  if(maxY%step!==0)for(let ix=0;ix<=maxIx;ix++){const x=ix*step;out.push({x,y:maxY,d:Math.hypot(x+o.length/2-c.length/2,maxY+o.width/2-c.width/2)})}
  if(maxX%step!==0&&maxY%step!==0)out.push({x:maxX,y:maxY,d:Math.hypot(maxX+o.length/2-c.length/2,maxY+o.width/2-c.width/2)})
  out.sort((a,b)=>a.d-b.d)
  const result=out.slice(0,MAX_FLOOR_CANDIDATES)
  floorCache.set(key,result)
  return result
}

function stackCandidates(items:PlacedCargo[],c:Container,o:Ori,u:Unit){
  const centerX=c.length/2-o.length/2,centerY=c.width/2-o.width/2
  const same=items.filter(q=>q.cargoId===u.cargo.id).sort((a,b)=>Math.hypot(a.x-centerX,a.y-centerY)-Math.hypot(b.x-centerX,b.y-centerY))
  const source=(same.length?same:items).slice(0,MAX_STACK_SOURCES)
  const out:{x:number;y:number;z:number;d:number}[]=[]
  const seen=new Set<string>()
  for(const q of source){
    const qd=dims(q),z=q.z+q.height
    const xs=[q.x,q.x+qd.length-o.length,q.x+(qd.length-o.length)/2]
    const ys=[q.y,q.y+qd.width-o.width,q.y+(qd.width-o.width)/2]
    for(const x of xs)for(const y of ys){
      const xx=Math.max(0,Math.min(c.length-o.length,snap(x)))
      const yy=Math.max(0,Math.min(c.width-o.width,snap(y)))
      const key=`${xx}:${yy}:${z}`
      if(seen.has(key))continue
      seen.add(key)
      if(xx+o.length<=c.length&&yy+o.width<=c.width)out.push({x:xx,y:yy,z,d:Math.hypot((xx+o.length/2)-c.length/2,(yy+o.width/2)-c.width/2)+z*.35})
    }
  }
  return out.sort((a,b)=>a.d-b.d)
}

function cgScore(p:PlacedCargo,c:Container,totalW:number,sumX:number,sumY:number){
  const w=totalW+p.weight
  const gx=(sumX+p.weight*(p.x+dims(p).length/2))/w
  const gy=(sumY+p.weight*(p.y+dims(p).width/2))/w
  const cg=Math.hypot(gx-c.length/2,gy-c.width/2)
  const center=Math.hypot((p.x+dims(p).length/2)-c.length/2,(p.y+dims(p).width/2)-c.width/2)
  return -cg*100000-center*80-p.z*25
}

function floorAdjacency(p:PlacedCargo,items:PlacedCargo[]){
  const d=dims(p)
  let score=0
  for(const q of items){
    if(q.z>EPS)continue
    const qd=dims(q)
    const overlapY=Math.max(0,Math.min(p.y+d.width,q.y+qd.width)-Math.max(p.y,q.y))
    const overlapX=Math.max(0,Math.min(p.x+d.length,q.x+qd.length)-Math.max(p.x,q.x))
    if(Math.abs(p.x+d.length-q.x)<=EPS||Math.abs(q.x+qd.length-p.x)<=EPS)score+=overlapY
    if(Math.abs(p.y+d.width-q.y)<=EPS||Math.abs(q.y+qd.width-p.y)<=EPS)score+=overlapX
  }
  return score
}

function choose(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>,weight:number,sumX:number,sumY:number,floorIndex:FloorIndex,itemsById:Map<string,PlacedCargo>){
  let best:PlacedCargo|undefined,bestScore=-Infinity
  for(const o of orientations(u.cargo)){
    const base=floorCandidates(c,o)
    const candidates=base.slice()
    const edgeXs=new Set<number>([0,Math.max(0,c.length-o.length)])
    const edgeYs=new Set<number>([0,Math.max(0,c.width-o.width)])
    for(const q of items){
      if(q.z>EPS)continue
      const qd=dims(q)
      edgeXs.add(Math.max(0,Math.min(c.length-o.length,q.x)))
      edgeXs.add(Math.max(0,Math.min(c.length-o.length,q.x+qd.length-o.length)))
      edgeYs.add(Math.max(0,Math.min(c.width-o.width,q.y)))
      edgeYs.add(Math.max(0,Math.min(c.width-o.width,q.y+qd.width-o.width)))
    }
    for(const x of edgeXs)for(const y of edgeYs)candidates.push({x,y,d:Math.hypot(x+o.length/2-c.length/2,y+o.width/2-c.width/2)})
    candidates.sort((a,b)=>a.d-b.d)
    for(const q of candidates.slice(0,MAX_FLOOR_CANDIDATES)){
      if(!floorFree(floorIndex,q.x,q.y,o,itemsById))continue
      const p=makePlaced(u,o,q.x,q.y,0)
      if(weight+p.weight>c.maxPayload+EPS)continue
      const compact=floorAdjacency(p,items)
      const score=cgScore(p,c,weight,sumX,sumY)+compact*45-q.d*.05
      if(score>bestScore){bestScore=score;best=p}
    }
    if(!best){
      for(const q of stackCandidates(items,c,o,u)){
        const p=makePlaced(u,o,q.x,q.y,q.z)
        if(weight+p.weight>c.maxPayload+EPS||items.some(x=>overlap(p,x))||!canStack(p,u.cargo,items,defs))continue
        const support=supports(p,items)
        const supportArea=Math.max(0,supportRatio(p,items))
        const score=cgScore(p,c,weight,sumX,sumY)+supportArea*1200+support.length*180-q.d*1200
        if(score>bestScore){bestScore=score;best=p}
      }
    }
  }
  return best
}

function buildState(cargo:Cargo[],c:Container,locked:PlacedCargo[]){
  const defs=new Map(cargo.map(x=>[x.id,x])),qty=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,qty),count=new Map<string,number>()
  for(const p of items)count.set(p.cargoId,(count.get(p.cargoId)||0)+1)
  const floorIndex:FloorIndex=new Map()
  for(const p of items)if(p.z<=EPS)addFloorIndex(floorIndex,p)
  const itemsById=new Map(items.map(p=>[p.id,p]))
  let weight=items.reduce((s,p)=>s+p.weight,0),sumX=items.reduce((s,p)=>s+p.weight*(p.x+dims(p).length/2),0),sumY=items.reduce((s,p)=>s+p.weight*(p.y+dims(p).width/2),0)
  const us=units(cargo).filter(u=>u.index>=(count.get(u.cargo.id)||0))
  return{defs,items,floorIndex,itemsById,weight,sumX,sumY,us}
}

function placeOne(state:ReturnType<typeof buildState>,u:Unit,c:Container){
  const p=choose(u,state.items,c,state.defs,state.weight,state.sumX,state.sumY,state.floorIndex,state.itemsById)
  if(!p)return
  state.items.push(p);state.itemsById.set(p.id,p)
  state.weight+=p.weight;state.sumX+=p.weight*(p.x+dims(p).length/2);state.sumY+=p.weight*(p.y+dims(p).width/2)
  if(p.z<=EPS)addFloorIndex(state.floorIndex,p)
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
    placeOne(state,state.us[i],c);progress?.(n?(i+1)/n*100:100)
    if((i&7)===7)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  }
  progress?.(100)
  return state.items
}