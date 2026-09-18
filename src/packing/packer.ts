import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, overlap, inBounds } from './geometry'

const EPS = 0.5
const YIELD_EVERY = 18

type Orientation = { length:number; width:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }
type Point = { x:number; y:number; z:number }

const key=(x:number,y:number,z:number)=>`${x}|${y}|${z}`
const clean=(n:number)=>Math.max(0,Math.round(n*10)/10)

function orientations(c:Cargo):Orientation[]{
  const a:Orientation={length:c.length,width:c.width,rotation:0}
  if(!c.rotatable || Math.abs(c.length-c.width)<EPS)return [a]
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
  return {id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:clean(x),y:clean(y),z:clean(z),length:u.cargo.length,width:u.cargo.width,height:u.cargo.height,rotation:o.rotation,weight:u.cargo.weight,color:u.cargo.color,placementMode:'automatic',locked:false}
}

function rectArea(a:PlacedCargo,b:PlacedCargo){
  const A=dims(a),B=dims(b)
  return Math.max(0,Math.min(a.x+A.length,b.x+B.length)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+A.width,b.y+B.width)-Math.max(a.y,b.y))
}

function supportCoverage(p:PlacedCargo,items:PlacedCargo[]){
  if(p.z<=EPS)return 1
  const d=dims(p), area=d.length*d.width
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&rectArea(p,q)>EPS)
  if(!supports.length)return 0
  const xs=new Set<number>([p.x,p.x+d.length])
  const ys=new Set<number>([p.y,p.y+d.width])
  for(const q of supports){
    const qd=dims(q)
    xs.add(Math.max(p.x,q.x)); xs.add(Math.min(p.x+d.length,q.x+qd.length))
    ys.add(Math.max(p.y,q.y)); ys.add(Math.min(p.y+d.width,q.y+qd.width))
  }
  const xv=[...xs].sort((a,b)=>a-b), yv=[...ys].sort((a,b)=>a-b)
  let covered=0
  for(let xi=0;xi<xv.length-1;xi++)for(let yi=0;yi<yv.length-1;yi++){
    const cx=(xv[xi]+xv[xi+1])/2, cy=(yv[yi]+yv[yi+1])/2
    if(cx<p.x-EPS||cx>p.x+d.length+EPS||cy<p.y-EPS||cy>p.y+d.width+EPS)continue
    if(supports.some(q=>{const qd=dims(q);return cx>=q.x-EPS&&cx<=q.x+qd.length+EPS&&cy>=q.y-EPS&&cy<=q.y+qd.width+EPS}))covered+=(xv[xi+1]-xv[xi])*(yv[yi+1]-yv[yi])
  }
  return Math.min(1,covered/area)
}

function canStack(p:PlacedCargo,c:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!c.stackable)return false
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&rectArea(p,q)>EPS)
  if(supportCoverage(p,items)<0.995)return false
  for(const q of supports){
    const d=defs.get(q.cargoId)
    if(!d||!d.loadBearing||d.breakablePallet)return false
    if(d.maxLoadOnTop>0&&c.weight>d.maxLoadOnTop+EPS)return false
    if(d.maxStackLayers>0){
      let layers=1
      for(const below of items)if(Math.abs(below.z+below.height-q.z)<=EPS&&rectArea(q,below)>EPS)layers++
      if(layers>=d.maxStackLayers)return false
    }
  }
  return true
}

function collision(p:PlacedCargo,items:PlacedCargo[]){
  return items.some(q=>overlap(p,q))
}

/**
 * Generate compact candidate points from actual occupied edges.  Unlike a grid,
 * this scales with cargo count and never depends on the visual Three.js scene.
 */
function candidatePoints(items:PlacedCargo[],c:Container):Point[]{
  const out:Point[]=[]
  const seen=new Set<string>()
  const add=(x:number,y:number,z:number)=>{
    x=clean(x);y=clean(y);z=clean(z)
    if(x<-EPS||y<-EPS||z<-EPS||x>c.length+EPS||y>c.width+EPS||z>c.height+EPS)return
    const k=key(x,y,z);if(!seen.has(k)){seen.add(k);out.push({x,y,z})}
  }
  add(0,0,0)
  // Standard extreme points: floor corners, side edges and tops.
  for(const q of items){
    const d=dims(q)
    add(q.x+d.length,q.y,q.z)
    add(q.x,q.y+d.width,q.z)
    add(q.x+d.length,q.y+d.width,q.z)
    add(q.x,q.y,q.z+q.height)
  }
  // Cross-edge points are essential when two rows meet or a rotated box fills a gap.
  const xs=new Set<number>([0,c.length]), ys=new Set<number>([0,c.width]), zs=new Set<number>([0])
  for(const q of items){const d=dims(q);xs.add(q.x);xs.add(q.x+d.length);ys.add(q.y);ys.add(q.y+d.width);zs.add(q.z);zs.add(q.z+q.height)}
  const xu=[...xs].sort((a,b)=>a-b), yu=[...ys].sort((a,b)=>a-b), zu=[...zs].sort((a,b)=>a-b)
  // Only test cross sections that are created by an existing top surface.
  for(const z of zu){
    if(z>c.height+EPS)continue
    for(const x of xu)for(const y of yu){
      if(x<=c.length+EPS&&y<=c.width+EPS)add(x,y,z)
    }
  }
  out.sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)
  return out
}

function contactScore(p:PlacedCargo,items:PlacedCargo[],c:Container){
  const d=dims(p)
  let side=0, top=0
  for(const q of items){
    const qd=dims(q), area=rectArea(p,q)
    if(area<=EPS)continue
    if(Math.abs(p.z-(q.z+q.height))<=EPS)top+=area/(d.length*d.width)
    if(Math.abs(p.x-(q.x+qd.length))<=EPS||Math.abs(p.x+d.length-q.x)<=EPS)side+=Math.min(d.width,qd.width)/Math.max(d.width,qd.width)
    if(Math.abs(p.y-(q.y+qd.width))<=EPS||Math.abs(p.y+d.width-q.y)<=EPS)side+=Math.min(d.length,qd.length)/Math.max(d.length,qd.length)
  }
  const wall=(p.x<=EPS?1:0)+(Math.abs(p.x+d.length-c.length)<=EPS?1:0)+(p.y<=EPS?1:0)+(Math.abs(p.y+d.width-c.width)<=EPS?1:0)
  const volume=d.length*d.width*d.height
  // Lower score is better: first minimize height, then reward contact and compact fill.
  return p.z*100000 + (1-top)*1200 + (1-Math.min(1,side/4))*300 + (c.length-(p.x+d.length))*0.02 + (c.width-(p.y+d.width))*0.02 - wall*80 - volume*0.000001
}

function orderUnits(cargo:Cargo[],strategy:'footprint'|'height'|'volume'|'weight'='footprint'){
  return expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0).sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    const af=a.cargo.length*a.cargo.width,bf=b.cargo.length*b.cargo.width
    if(strategy==='height')return b.cargo.height-a.cargo.height||bf-af||bv-av
    if(strategy==='volume')return bv-av||bf-af||b.cargo.height-a.cargo.height
    if(strategy==='weight')return b.cargo.weight-a.cargo.weight||bf-af||bv-av
    return bf-af||b.cargo.height-a.cargo.height||bv-av
  })
}

function validLocked(locked:PlacedCargo[],c:Container,quantities:Map<string,number>){
  const out:PlacedCargo[]=[]
  for(const p of locked){
    if((quantities.get(p.cargoId)||0)<=0||!inBounds(p,c))continue
    if(out.some(q=>overlap(p,q)))continue
    out.push(p)
  }
  return out
}

function packCore(cargo:Cargo[],c:Container,locked:PlacedCargo[],strategy:'footprint'|'height'|'volume'|'weight',onStep?:(i:number,total:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x]))
  const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]))
  const items=validLocked(locked,c,quantities)
  const lockedCount=new Map<string,number>()
  for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo,strategy).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0))
  let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){
    const u=units[i]
    let best:PlacedCargo|undefined,bestScore=Infinity
    const points=candidatePoints(items,c)
    for(const o of orientations(u.cargo)){
      if(o.length>c.length+EPS||o.width>c.width+EPS||u.cargo.height>c.height+EPS)continue
      for(const pt of points){
        if(pt.x+o.length>c.length+EPS||pt.y+o.width>c.width+EPS||pt.z+u.cargo.height>c.height+EPS)continue
        const p=makePlaced(u,o,pt.x,pt.y,pt.z)
        if(totalWeight+p.weight>c.maxPayload+EPS)continue
        if(collision(p,items))continue
        if(!canStack(p,u.cargo,items,defs))continue
        const score=contactScore(p,items,c)
        if(score<bestScore){bestScore=score;best=p}
      }
    }
    if(best){items.push(best);totalWeight+=best.weight}
    onStep?.(i+1,units.length)
  }
  return items
}

function scoreSolution(items:PlacedCargo,c:Container,total:number){return 0}
function solutionScore(items:PlacedCargo[],c:Container,total:number){
  const completion=total?items.length/total:1
  let weight=0,mx=0,my=0
  for(const p of items){const d=dims(p);weight+=p.weight;mx+=p.weight*(p.x+d.length/2);my+=p.weight*(p.y+d.width/2)}
  const bx=weight?Math.abs(mx/weight-c.length/2):0,by=weight?Math.abs(my/weight-c.width/2):0
  const volume=items.reduce((s,p)=>s+dims(p).length*dims(p).width*p.height,0)
  return completion*1e12 - bx*1e5 - by*1e5 + volume
}

export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){
  const total=expandCargo(cargo).length
  if(!total)return validLocked(locked,c,new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])))
  const strategies:['footprint','height','volume','weight']=['footprint','height','volume','weight']
  let best:PlacedCargo[]=[]
  let bestScore=-Infinity
  for(const s of strategies){
    const r=packCore(cargo,c,locked,s)
    const sc=solutionScore(r,c,total)
    if(sc>bestScore){bestScore=sc;best=r}
    if(r.length>=total)return r
  }
  return best
}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],onProgress?:(percent:number)=>void){
  const total=expandCargo(cargo).length
  if(!total){onProgress?.(100);return validLocked(locked,c,new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])))}
  // Run one deterministic strategy asynchronously. Progress is always clamped to 0..100.
  const defs=new Map(cargo.map(x=>[x.id,x]))
  const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]))
  const items=validLocked(locked,c,quantities)
  const lockedCount=new Map<string,number>()
  for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo,'footprint').filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0))
  let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){
    const u=units[i];let best:PlacedCargo|undefined,bestScore=Infinity
    const points=candidatePoints(items,c)
    for(const o of orientations(u.cargo)){
      if(o.length>c.length+EPS||o.width>c.width+EPS||u.cargo.height>c.height+EPS)continue
      for(const pt of points){
        if(pt.x+o.length>c.length+EPS||pt.y+o.width>c.width+EPS||pt.z+u.cargo.height>c.height+EPS)continue
        const p=makePlaced(u,o,pt.x,pt.y,pt.z)
        if(totalWeight+p.weight>c.maxPayload+EPS||collision(p,items)||!canStack(p,u.cargo,items,defs))continue
        const sc=contactScore(p,items,c)
        if(sc<bestScore){bestScore=sc;best=p}
      }
    }
    if(best){items.push(best);totalWeight+=best.weight}
    onProgress?.(Math.min(100,Math.round(((i+1)/units.length)*100)))
    if(i%YIELD_EVERY===YIELD_EVERY-1)await new Promise<void>(r=>setTimeout(r,0))
  }
  return items
}
