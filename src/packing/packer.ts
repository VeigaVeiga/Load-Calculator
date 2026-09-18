import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, overlap } from './geometry'

const SNAP = 10
const EPS = 1

type Orientation = { length:number; width:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }

type Point = { x:number; y:number; z:number }

class SpatialIndex {
  private cells=new Map<string,PlacedCargo[]>()
  private readonly size=500
  private key(ix:number,iy:number,iz:number){return `${ix}|${iy}|${iz}`}
  private range(min:number,max:number){const a=Math.floor(min/this.size),b=Math.floor(Math.max(min,max-EPS)/this.size);const out:number[]=[];for(let i=a;i<=b;i++)out.push(i);return out}
  add(p:PlacedCargo){const d=dims(p);for(const ix of this.range(p.x,p.x+d.length))for(const iy of this.range(p.y,p.y+d.width))for(const iz of this.range(p.z,p.z+p.height)){const k=this.key(ix,iy,iz);const a=this.cells.get(k);if(a)a.push(p);else this.cells.set(k,[p])}}
  query(p:PlacedCargo){const d=dims(p),seen=new Set<string>(),out:PlacedCargo[]=[];for(const ix of this.range(p.x,p.x+d.length))for(const iy of this.range(p.y,p.y+d.width))for(const iz of this.range(p.z,p.z+p.height)){const a=this.cells.get(this.key(ix,iy,iz));if(!a)continue;for(const q of a)if(!seen.has(q.id)){seen.add(q.id);out.push(q)}}return out}
}

const snap=(n:number)=>Math.max(0,Math.round(n/SNAP)*SNAP)

function orientations(c:Cargo):Orientation[]{
  const a:Orientation={length:c.length,width:c.width,rotation:0}
  if(!c.rotatable||Math.abs(c.length-c.width)<EPS)return [a]
  return [a,{length:c.width,width:c.length,rotation:90}]
}

export function expandCargo(cargo:Cargo[]):Unit[]{
  const out:Unit[]=[]
  for(const c of cargo){
    const n=Math.max(0,Math.floor(c.quantity))
    for(let i=0;i<n;i++)out.push({cargo:c,index:i})
  }
  return out
}

function makePlaced(u:Unit,o:Orientation,x:number,y:number,z:number):PlacedCargo{
  return {id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x,y,z,length:u.cargo.length,width:u.cargo.width,height:u.cargo.height,rotation:o.rotation,weight:u.cargo.weight,color:u.cargo.color,placementMode:'automatic',locked:false}
}

function rectIntersectionArea(a:PlacedCargo,b:PlacedCargo){
  const A=dims(a),B=dims(b)
  return Math.max(0,Math.min(a.x+A.length,b.x+B.length)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+A.width,b.y+B.width)-Math.max(a.y,b.y))
}

function fullSupport(p:PlacedCargo,items:PlacedCargo[]){
  if(p.z<=EPS)return true
  const area=dims(p).length*dims(p).width
  let covered=0
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&rectIntersectionArea(p,q)>EPS)
  if(!supports.length)return false
  // Exact union of support rectangles using x-slices. This is fast enough for the
  // small number of items touching a single support plane and prevents floating cargo.
  const xs=new Set<number>([p.x,p.x+dims(p).length])
  for(const q of supports){const d=dims(q);xs.add(Math.max(p.x,q.x));xs.add(Math.min(p.x+dims(p).length,q.x+d.length))}
  const xvals=[...xs].sort((a,b)=>a-b)
  for(let i=0;i<xvals.length-1;i++){
    const xa=xvals[i],xb=xvals[i+1]
    if(xb-xa<=EPS)continue
    const intervals:sliceInterval[]=[]
    for(const q of supports){const d=dims(q);if(q.x<xb-EPS&&q.x+d.length>xa+EPS)intervals.push({a:Math.max(p.y,q.y),b:Math.min(p.y+dims(p).width,q.y+d.width)})}
    intervals.sort((a,b)=>a.a-b.a)
    let end=-Infinity
    let union=0
    for(const r of intervals){if(r.b<=r.a+EPS)continue;if(r.a>end+EPS){union+=r.b-r.a;end=r.b}else if(r.b>end){union+=r.b-end;end=r.b}}
    covered+=(xb-xa)*union
  }
  return covered>=area*.995
}

type sliceInterval={a:number;b:number}

function stackAllowed(p:PlacedCargo, c:Cargo, items:PlacedCargo[], defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!c.stackable)return false
  if(!fullSupport(p,items))return false
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&rectIntersectionArea(p,q)>EPS)
  if(!supports.length)return false
  for(const q of supports){
    const d=defs.get(q.cargoId)
    if(!d||!d.loadBearing||d.breakablePallet)return false
    if(d.maxLoadOnTop>0&&c.weight>d.maxLoadOnTop+EPS)return false
  }
  return true
}

function extremePoints(items:PlacedCargo[],c:Container):Point[]{
  const pts:Point[]=[{x:0,y:0,z:0}]
  // Extreme points are the three exposed faces of every already placed box.
  // Unlike the old Cartesian product of X/Y/Z candidates, this stays O(n) points.
  for(const q of items){
    const d=dims(q)
    pts.push({x:q.x+d.length,y:q.y,z:q.z})
    pts.push({x:q.x,y:q.y+d.width,z:q.z})
    pts.push({x:q.x,y:q.y,z:q.z+q.height})
    pts.push({x:q.x+d.length,y:q.y+d.width,z:q.z})
  }
  const seen=new Set<string>(),out:Point[]=[]
  for(const p of pts){
    const x=snap(p.x),y=snap(p.y),z=snap(p.z)
    if(x<0||y<0||z<0||x>c.length+EPS||y>c.width+EPS||z>c.height+EPS)continue
    const k=`${x}|${y}|${z}`
    if(!seen.has(k)){seen.add(k);out.push({x,y,z})}
  }
  out.sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)
  return out
}

function localScore(p:PlacedCargo,items:PlacedCargo[],c:Container){
  const d=dims(p)
  let contact=0,wall=0,nearby=0
  for(const q of items){
    const qd=dims(q)
    const xTouch=Math.abs((p.x+d.length)-q.x)<=EPS||Math.abs(p.x-(q.x+qd.length))<=EPS
    const yTouch=Math.abs((p.y+d.width)-q.y)<=EPS||Math.abs(p.y-(q.y+qd.width))<=EPS
    const zTouch=Math.abs((p.z+dims(p).length*0+ p.height)-q.z)<=EPS||Math.abs(p.z-(q.z+q.height))<=EPS
    if(xTouch&&rectIntersectionArea(p,q)>EPS)contact+=1
    if(yTouch&&rectIntersectionArea(p,q)>EPS)contact+=1
    if(zTouch&&rectIntersectionArea(p,q)>EPS)contact+=4
    if((xTouch||yTouch)&&rectIntersectionArea(p,q)>EPS)nearby+=1
  }
  if(p.x<=EPS||Math.abs(p.x+d.length-c.length)<=EPS)wall+=2
  if(p.y<=EPS||Math.abs(p.y+d.width-c.width)<=EPS)wall+=2
  if(p.z<=EPS)wall+=3
  // Lower Z is preferred for stability; contact and walls reduce wasted slivers.
  const centerY=Math.abs((p.y+d.width/2)-c.width/2)
  return p.z*10000 + centerY*.015 - contact*260 - nearby*20 - wall*40
}

function orderUnits(cargo:Cargo[], strategy:'footprint'|'height'|'weight'='footprint'){
  return expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0).sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    const af=a.cargo.length*a.cargo.width,bf=b.cargo.length*b.cargo.width
    // Large footprints first makes the extreme-point layout deterministic and avoids
    // the old behaviour where later edits collapsed the solution into one row.
    if(strategy==='height') return b.cargo.height-a.cargo.height||bf-af||b.cargo.weight-a.cargo.weight
    if(strategy==='weight') return b.cargo.weight-a.cargo.weight||bf-af||bv-av
    return bf-af||bv-av||b.cargo.weight-a.cargo.weight
  })
}

function packCore(cargo:Cargo[],c:Container,locked:PlacedCargo[],orderStrategy:'footprint'|'height'|'weight'='footprint',onStep?:(i:number,total:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x]))
  const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]))
  const safeLocked=locked.filter(p=>{
    const q=quantities.get(p.cargoId)||0
    return p.x>=0&&p.y>=0&&p.z>=0&&p.x+dims(p).length<=c.length+EPS&&p.y+dims(p).width<=c.width+EPS&&p.z+p.height<=c.height+EPS&&q>0
  })
  const lockedCount=new Map<string,number>()
  for(const p of safeLocked)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo,orderStrategy).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0))
  const items=[...safeLocked]
  const index=new SpatialIndex()
  for(const p of items)index.add(p)
  let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){
    const u=units[i]
    let best:PlacedCargo|undefined
    let bestScore=Infinity
    for(const o of orientations(u.cargo)){
      if(o.length>c.length+EPS||o.width>c.width+EPS||u.cargo.height>c.height+EPS)continue
      for(const pt of extremePoints(items,c)){
        if(pt.x+o.length>c.length+EPS||pt.y+o.width>c.width+EPS||pt.z+u.cargo.height>c.height+EPS)continue
        const p=makePlaced(u,o,pt.x,pt.y,pt.z)
        if(totalWeight+p.weight>c.maxPayload+EPS)continue
        if(index.query(p).some(q=>overlap(p,q)))continue
        if(!stackAllowed(p,u.cargo,index.query(p),defs))continue
        const score=localScore(p,items,c)
        if(score<bestScore){bestScore=score;best=p}
      }
    }
    if(best){items.push(best);index.add(best);totalWeight+=best.weight}
    onStep?.(i+1,units.length)
  }
  return items
}

function solutionScore(items:PlacedCargo[],c:Container,total:number){
  const completion=total?items.length/total:1
  let weight=0,mx=0,my=0,usedL=0,usedW=0,usedV=0
  for(const p of items){const d=dims(p);weight+=p.weight;mx+=p.weight*(p.x+d.length/2);my+=p.weight*(p.y+d.width/2);usedL=Math.max(usedL,p.x+d.length);usedW=Math.max(usedW,p.y+d.width);usedV=Math.max(usedV,p.z+p.height)}
  const bx=weight?Math.abs(mx/weight-c.length/2)/c.length:1
  const by=weight?Math.abs(my/weight-c.width/2)/c.width:1
  const footprint=(usedL*usedW)/(c.length*c.width)
  const vertical=usedV/c.height
  return completion*1e9 - bx*3e6 - by*3e6 - footprint*15000 - vertical*2000
}

export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){
  const total=expandCargo(cargo).length
  if(!total)return [...locked]
  const result=packCore(cargo,c,locked,'footprint')
  const result2=packCore(cargo,c,locked,'height')
  const s1=solutionScore(result,c,total),s2=solutionScore(result2,c,total)
  return s2>s1?result2:result
}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],onProgress?:(percent:number)=>void){
  // Run one deterministic pass and yield between batches. This keeps the browser responsive
  // for 90–600 units while preserving the same calculation space used by the sync path.
  const total=expandCargo(cargo).length
  if(!total){onProgress?.(100);return [...locked]}
  const defs=new Map(cargo.map(x=>[x.id,x]))
  const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]))
  const safeLocked=locked.filter(p=>quantities.get(p.cargoId)>0)
  const lockedCount=new Map<string,number>()
  for(const p of safeLocked)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo,'footprint').filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0))
  const items=[...safeLocked]
  const index=new SpatialIndex()
  for(const p of items)index.add(p)
  let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){
    const u=units[i];let best:PlacedCargo|undefined;let bestScore=Infinity
    for(const o of orientations(u.cargo)){
      if(o.length>c.length+EPS||o.width>c.width+EPS||u.cargo.height>c.height+EPS)continue
      for(const pt of extremePoints(items,c)){
        if(pt.x+o.length>c.length+EPS||pt.y+o.width>c.width+EPS||pt.z+u.cargo.height>c.height+EPS)continue
        const p=makePlaced(u,o,pt.x,pt.y,pt.z)
        if(totalWeight+p.weight>c.maxPayload+EPS||index.query(p).some(q=>overlap(p,q))||!stackAllowed(p,u.cargo,index.query(p),defs))continue
        const score=localScore(p,items,c)
        if(score<bestScore){bestScore=score;best=p}
      }
    }
    if(best){items.push(best);index.add(best);totalWeight+=best.weight}
    onProgress?.(Math.min(100,Math.round(((i+1)/units.length)*100)))
    if(i%12===11)await new Promise<void>(resolve=>setTimeout(resolve,0))
  }
  return items
}
