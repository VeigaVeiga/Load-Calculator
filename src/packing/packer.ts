import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const snap = (n: number) => Math.max(0, Math.round(n / 10) * 10)
type Orientation = { length:number;width:number;height:number;rotation:0|90 }
type Unit = { cargo:Cargo; index:number }

function orientations(c:Cargo):Orientation[]{
  const a:Orientation={length:c.length,width:c.width,height:c.height,rotation:0}
  if(!c.rotatable || Math.abs(c.length-c.width)<EPS) return [a]
  return [a,{length:c.width,width:c.length,height:c.height,rotation:90}]
}

export function expandCargo(cargo:Cargo[]):Unit[]{
  const out:Unit[]=[]
  for(const c of cargo){const q=Math.max(0,Math.floor(c.quantity));for(let i=0;i<q;i++)out.push({cargo:c,index:i})}
  return out
}

function makePlaced(u:Unit,o:Orientation,x:number,y:number,z:number):PlacedCargo{
  return {id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:snap(x),y:snap(y),z:snap(z),length:u.cargo.length,width:u.cargo.width,height:u.cargo.height,rotation:o.rotation,weight:u.cargo.weight,color:u.cargo.color,placementMode:'automatic',locked:false}
}

function footprintArea(a:PlacedCargo,b:PlacedCargo){const A=dims(a),B=dims(b);return Math.max(0,Math.min(a.x+A.length,b.x+B.length)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+A.width,b.y+B.width)-Math.max(a.y,b.y))}

function supportCoverage(p:PlacedCargo,supports:PlacedCargo[]){
  if(p.z<=EPS)return 1
  const d=dims(p),area=d.length*d.width
  if(!supports.length||area<=EPS)return 0
  const xs=new Set<number>([p.x,p.x+d.length]),ys=new Set<number>([p.y,p.y+d.width])
  for(const q of supports){const qd=dims(q);xs.add(Math.max(p.x,q.x));xs.add(Math.min(p.x+d.length,q.x+qd.length));ys.add(Math.max(p.y,q.y));ys.add(Math.min(p.y+d.width,q.y+qd.width))}
  const xv=[...xs].filter(v=>v>=p.x-EPS&&v<=p.x+d.length+EPS).sort((a,b)=>a-b),yv=[...ys].filter(v=>v>=p.y-EPS&&v<=p.y+d.width+EPS).sort((a,b)=>a-b)
  let covered=0
  for(let i=0;i<xv.length-1;i++)for(let j=0;j<yv.length-1;j++){
    const cx=(xv[i]+xv[i+1])/2,cy=(yv[j]+yv[j+1])/2
    if(supports.some(q=>{const d0=dims(q);return cx>=q.x-EPS&&cx<=q.x+d0.length+EPS&&cy>=q.y-EPS&&cy<=q.y+d0.width+EPS}))covered+=(xv[i+1]-xv[i])*(yv[j+1]-yv[j])
  }
  return Math.min(1,covered/area)
}

function stackLevel(p:PlacedCargo,items:PlacedCargo[],seen=new Set<string>()):number{
  if(p.z<=EPS||seen.has(p.id))return 1
  seen.add(p.id)
  const pd=dims(p),supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&footprintArea(p,q)>=pd.length*pd.width*.995)
  if(!supports.length)return 1
  return 1+Math.max(...supports.map(q=>stackLevel(q,items,new Set(seen))))
}

function canStack(p:PlacedCargo,cargo:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!cargo.stackable)return false
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&footprintArea(p,q)>EPS)
  if(!supports.length||supportCoverage(p,supports)<.995)return false
  const level=Math.max(...supports.map(q=>stackLevel(q,items)))+1
  if(cargo.maxStackLayers>0&&level>cargo.maxStackLayers)return false
  for(const q of supports){
    const d=defs.get(q.cargoId)
    if(!d||!d.loadBearing||d.breakablePallet)return false
    if(d.maxLoadOnTop>0&&cargo.weight>d.maxLoadOnTop+EPS)return false
  }
  return true
}

function validLocked(locked:PlacedCargo[],c:Container,quantities:Map<string,number>){
  const out:PlacedCargo[]=[]
  for(const p of locked){if((quantities.get(p.cargoId)||0)<=0||!inBounds(p,c))continue;if(out.some(q=>overlap(p,q)))continue;out.push(p)}
  return out
}

function orderUnits(cargo:Cargo[]){
  return expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0).sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    const af=a.cargo.length*a.cargo.width,bf=b.cargo.length*b.cargo.width
    return (b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0)||(b.cargo.stackable?1:0)-(a.cargo.stackable?1:0)||bf-af||bv-av||b.cargo.weight-a.cargo.weight
  })
}

function candidatePoints(items:PlacedCargo[]){
  const set=new Set<string>(),add=(x:number,y:number,z:number)=>set.add(`${snap(x)},${snap(y)},${snap(z)}`)
  add(0,0,0)
  for(const q of items){const d=dims(q)
    add(q.x+d.length,q.y,q.z);add(q.x,q.y+d.width,q.z);add(q.x+d.length,q.y+d.width,q.z)
    add(q.x,q.y,q.z+q.height);add(q.x+d.length,q.y,q.z+q.height);add(q.x,q.y+d.width,q.z+q.height);add(q.x+d.length,q.y+d.width,q.z+q.height)
  }
  return [...set].map(v=>v.split(',').map(Number) as [number,number,number])
}

function floorCoverage(items:PlacedCargo[],c:Container){return Math.min(1,items.filter(p=>p.z<=EPS).reduce((s,p)=>s+dims(p).length*dims(p).width,0)/(c.length*c.width))}

function contactScore(p:PlacedCargo,items:PlacedCargo[],c:Container){
  const d=dims(p);let s=0
  if(p.z<=EPS)s+=d.length*d.width*80
  if(p.x<=EPS)s+=d.width*40;if(p.y<=EPS)s+=d.length*40;if(p.x+d.length>=c.length-EPS)s+=d.width*40;if(p.y+d.width>=c.width-EPS)s+=d.length*40
  for(const q of items){const qd=dims(q)
    if(Math.abs(q.x+qd.length-p.x)<=EPS||Math.abs(p.x+d.length-q.x)<=EPS)s+=Math.max(0,Math.min(p.y+d.width,q.y+qd.width)-Math.max(p.y,q.y))*Math.min(p.height,q.height)*6
    if(Math.abs(q.y+qd.width-p.y)<=EPS||Math.abs(p.y+d.width-q.y)<=EPS)s+=Math.max(0,Math.min(p.x+d.length,q.x+qd.length)-Math.max(p.x,q.x))*Math.min(p.height,q.height)*6
    if(Math.abs(q.z+q.height-p.z)<=EPS)s+=footprintArea(p,q)*180
  }
  return s
}

function choosePlacement(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>,totalWeight:number){
  let best:{p:PlacedCargo;score:number}|undefined
  const coverage=floorCoverage(items,c),points=candidatePoints(items).sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0]-b[0])
  for(const o of orientations(u.cargo))for(const [x,y,z] of points){
    if(z>EPS&&!u.cargo.stackable)continue
    if(x+o.length>c.length+EPS||y+o.width>c.width+EPS||z+o.height>c.height+EPS)continue
    if(totalWeight+u.cargo.weight>c.maxPayload+EPS)continue
    const p=makePlaced(u,o,x,y,z)
    if(!inBounds(p,c)||items.some(q=>overlap(p,q))||!canStack(p,u.cargo,items,defs))continue
    const contact=contactScore(p,items,c),rightGap=c.length-(p.x+o.length),sideGap=c.width-(p.y+o.width),topGap=c.height-(p.z+o.height),stacking=p.z>EPS
    // Keep filling the current floor until it is substantially occupied, then
    // strongly prefer a fully-supported upper layer. This prevents the old
    // one-layer behaviour while still using small floor gaps when useful.
    const stackBonus=stacking?(coverage>.78?180000:70000):0
    const floorBonus=!stacking&&coverage<.78?120000:0
    const score=contact*1000+stackBonus+floorBonus-Math.abs(rightGap)*2-Math.abs(sideGap)*2-topGap*.03-p.z*25-p.y*.01-p.x*.002
    if(!best||score>best.score)best={p,score}
  }
  return best?.p
}

function packCore(cargo:Cargo[],c:Container,locked:PlacedCargo[],onStep?:(i:number,total:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x])),quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,quantities),lockedCount=new Map<string,number>()
  for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0));let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){const p=choosePlacement(units[i],items,c,defs,totalWeight);if(p){items.push(p);totalWeight+=p.weight}onStep?.(i+1,units.length)}
  return items
}

export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){return packCore(cargo,c,locked)}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],onProgress?:(percent:number)=>void){
  const total=expandCargo(cargo).length
  if(!total){onProgress?.(100);return validLocked(locked,c,new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])))}
  const defs=new Map(cargo.map(x=>[x.id,x])),quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,quantities),lockedCount=new Map<string,number>()
  for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0));let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  for(let i=0;i<units.length;i++){const p=choosePlacement(units[i],items,c,defs,totalWeight);if(p){items.push(p);totalWeight+=p.weight}if(i%4===0)await new Promise<void>(r=>setTimeout(r,0));onProgress?.(Math.round((i+1)/units.length*100))}
  onProgress?.(100);return items
}
