import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const SNAP = 10
const snap = (n: number) => Math.max(0, Math.round(n / SNAP) * SNAP)

type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type Unit = { cargo: Cargo; index: number }

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}

export function expandCargo(cargo: Cargo[]): Unit[] {
  const out: Unit[] = []
  for (const c of cargo) {
    const q = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < q; i++) out.push({ cargo: c, index: i })
  }
  return out
}

function makePlaced(u: Unit, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return {
    id: `${u.cargo.id}-${u.index + 1}`,
    cargoId: u.cargo.id,
    cargoType: u.cargo.type,
    x: snap(x), y: snap(y), z: snap(z),
    length: u.cargo.length, width: u.cargo.width, height: o.height,
    rotation: o.rotation, weight: u.cargo.weight, color: u.cargo.color,
    placementMode: 'automatic', locked: false,
  }
}

function footprintArea(a: PlacedCargo, b: PlacedCargo) {
  const A = dims(a), B = dims(b)
  return Math.max(0, Math.min(a.x + A.length, b.x + B.length) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + A.width, b.y + B.width) - Math.max(a.y, b.y))
}

function supportCoverage(p: PlacedCargo, supports: PlacedCargo[]) {
  if (p.z <= EPS) return 1
  const d = dims(p), area = d.length * d.width
  if (!supports.length || area <= EPS) return 0
  const xs = new Set<number>([p.x, p.x + d.length]), ys = new Set<number>([p.y, p.y + d.width])
  for (const q of supports) {
    const qd = dims(q)
    xs.add(Math.max(p.x, q.x)); xs.add(Math.min(p.x + d.length, q.x + qd.length))
    ys.add(Math.max(p.y, q.y)); ys.add(Math.min(p.y + d.width, q.y + qd.width))
  }
  const xv = [...xs].filter(v => v >= p.x - EPS && v <= p.x + d.length + EPS).sort((a,b)=>a-b)
  const yv = [...ys].filter(v => v >= p.y - EPS && v <= p.y + d.width + EPS).sort((a,b)=>a-b)
  let covered = 0
  for (let i=0;i<xv.length-1;i++) for (let j=0;j<yv.length-1;j++) {
    const cx=(xv[i]+xv[i+1])/2, cy=(yv[j]+yv[j+1])/2
    if (supports.some(q=>{const qd=dims(q);return cx>=q.x-EPS&&cx<=q.x+qd.length+EPS&&cy>=q.y-EPS&&cy<=q.y+qd.width+EPS})) covered+=(xv[i+1]-xv[i])*(yv[j+1]-yv[j])
  }
  return Math.min(1, covered / area)
}

function stackLevel(p: PlacedCargo, items: PlacedCargo[], seen=new Set<string>()): number {
  if (p.z<=EPS || seen.has(p.id)) return 1
  seen.add(p.id)
  const pd=dims(p)
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&footprintArea(p,q)>=pd.length*pd.width*0.98)
  if(!supports.length)return 1
  return 1+Math.max(...supports.map(q=>stackLevel(q,items,new Set(seen))))
}

function canStack(p: PlacedCargo, cargo: Cargo, items: PlacedCargo[], defs: Map<string,Cargo>) {
  if(p.z<=EPS)return true
  if(!cargo.stackable)return false
  const pd=dims(p)
  const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&footprintArea(p,q)>EPS)
  if(!supports.length||supportCoverage(p,supports)<0.98)return false
  const level=Math.max(...supports.map(q=>stackLevel(q,items)))+1
  const maxLayers=Math.max(1,Math.floor(cargo.maxStackLayers||1))
  if(level>maxLayers)return false
  for(const q of supports){
    const d=defs.get(q.cargoId)
    if(!d||!d.loadBearing||d.breakablePallet)return false
    // 0 means no user-defined top-load limit. Weight changes must not silently
    // disable stacking when the cargo is explicitly marked load-bearing.
    if(d.maxLoadOnTop>0&&cargo.weight>d.maxLoadOnTop+EPS)return false
  }
  return true
}

function validLocked(locked: PlacedCargo[], c: Container, quantities: Map<string,number>) {
  const out:PlacedCargo[]=[]
  for(const p of locked){if((quantities.get(p.cargoId)||0)<=0)continue;if(!inBounds(p,c))continue;if(out.some(q=>overlap(p,q)))continue;out.push(p)}
  return out
}

function orderUnits(cargo: Cargo[]) {
  return expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0).sort((a,b)=>{
    const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height
    const af=a.cargo.length*a.cargo.width,bf=b.cargo.length*b.cargo.width
    return ((b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0))||((b.cargo.stackable?1:0)-(a.cargo.stackable?1:0))||(bf-af)||(bv-av)||(b.cargo.weight-a.cargo.weight)
  })
}

function candidatePoints(items:PlacedCargo,c:Container,o:Orientation):never[]
function candidatePoints(items:PlacedCargo[],c:Container,o:Orientation) {
  const xs=new Set<number>([0,snap((c.length-o.length)/2),Math.max(0,c.length-o.length)])
  const ys=new Set<number>([0,snap((c.width-o.width)/2),Math.max(0,c.width-o.width)])
  const zs=new Set<number>([0])
  for(const q of items){
    const d=dims(q)
    xs.add(snap(q.x));xs.add(snap(q.x+d.length));xs.add(snap(q.x+d.length-o.length))
    ys.add(snap(q.y));ys.add(snap(q.y+d.width));ys.add(snap(q.y+d.width-o.width))
    zs.add(snap(q.z));zs.add(snap(q.z+q.height))
  }
  const points:Array<[number,number,number]>=[]
  for(const z of [...zs].sort((a,b)=>a-b))for(const y of [...ys].sort((a,b)=>a-b))for(const x of [...xs].sort((a,b)=>a-b)){
    if(x>=-EPS&&y>=-EPS&&z>=-EPS&&x+o.length<=c.length+EPS&&y+o.width<=c.width+EPS&&z+o.height<=c.height+EPS)points.push([x,y,z])
  }
  return points
}

function choosePlacement(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>,totalWeight:number) {
  let best:{p:PlacedCargo;score:number}|undefined
  const same=items.filter(q=>q.cargoId===u.cargo.id)
  const preferredRotation=same.length?same[0].rotation:undefined
  const cx=(c.length-u.cargo.length)/2,cy=(c.width-u.cargo.width)/2
  for(const o of orientations(u.cargo))for(const [x,y,z] of candidatePoints(items,c,o)){
    if(totalWeight+u.cargo.weight>c.maxPayload+EPS)continue
    const p=makePlaced(u,o,x,y,z)
    if(!inBounds(p,c)||items.some(q=>overlap(p,q)))continue
    if(!canStack(p,u.cargo,items,defs))continue
    const stacking=p.z>EPS
    const supports=stacking?items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&footprintArea(p,q)>EPS):[]
    const support=stacking?supportCoverage(p,supports):1
    if(stacking&&support<0.98)continue

    // Keep identical cartons/pallets in one orientation and in compact rows/layers.
    const rotationConsistency=preferredRotation===undefined||o.rotation===preferredRotation?900000:0
    const centerDistance=Math.hypot(x-cx,y-cy)
    const sameDistance=same.length?Math.min(...same.map(q=>Math.hypot(x-q.x,y-q.y))):0
    const xAlign=same.reduce((s,q)=>s+(Math.abs(x-q.x)<=SNAP?1:0),0)
    const yAlign=same.reduce((s,q)=>s+(Math.abs(y-q.y)<=SNAP?1:0),0)
    const contact=items.reduce((s,q)=>{
      const d=dims(q),pd=dims(p)
      const x=Math.max(0,Math.min(p.y+pd.width,q.y+d.width)-Math.max(p.y,q.y))
      const y=Math.max(0,Math.min(p.x+pd.length,q.x+d.length)-Math.max(p.x,q.x))
      return s+(Math.abs(q.x+d.length-p.x)<=EPS||Math.abs(p.x+pd.length-q.x)<=EPS?x:0)+(Math.abs(q.y+d.width-p.y)<=EPS||Math.abs(p.y+pd.width-q.y)<=EPS?y:0)
    },0)
    const stackBonus=stacking?2_500_000:0
    const floorBonus=!stacking?450_000:0
    const alignment=xAlign*180000+yAlign*180000
    const compactness=same.length?Math.max(0,1_000_000-sameDistance*250):0
    const centerBias=Math.max(0,600_000-centerDistance*180)
    const contactBonus=contact*900
    const heightPenalty=p.z*30
    const score=stackBonus+floorBonus+rotationConsistency+alignment+compactness+centerBias+contactBonus-support*0+support*300000-heightPenalty
    if(!best||score>best.score)best={p,score}
  }
  return best?.p
}

function packCore(cargo:Cargo[],c:Container,locked:PlacedCargo[],onStep?:(i:number,total:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x]));const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]));const items=validLocked(locked,c,quantities)
  const lockedCount=new Map<string,number>();for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  const units=orderUnits(cargo).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0))
  for(let i=0;i<units.length;i++){const p=choosePlacement(units[i],items,c,defs,totalWeight);if(p){items.push(p);totalWeight+=p.weight}onStep?.(i+1,units.length)}
  return items
}

export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){return packCore(cargo,c,locked)}

export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],onStep?:(percent:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x]));const quantities=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)]));const items=validLocked(locked,c,quantities)
  const lockedCount=new Map<string,number>();for(const p of items)lockedCount.set(p.cargoId,(lockedCount.get(p.cargoId)||0)+1)
  const units=orderUnits(cargo).filter(u=>u.index>=(lockedCount.get(u.cargo.id)||0));let totalWeight=items.reduce((s,p)=>s+p.weight,0)
  const batch=8
  for(let i=0;i<units.length;i++){const p=choosePlacement(units[i],items,c,defs,totalWeight);if(p){items.push(p);totalWeight+=p.weight}if(i%batch===0||i===units.length-1){onStep?.(units.length?((i+1)/units.length)*100:100);await new Promise<void>(r=>setTimeout(r,0))}}
  return items
}
