import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, validatePlacement, footprintOverlap } from './geometry'
import { canPlace } from './collision'
import { canStack } from './support'
import { scoreCandidate, scoreSolution } from './scoring'

const SNAP = 10
const EPS = 3
const snap = (n: number) => Math.max(0, Math.round(n / SNAP) * SNAP)

function orientations(cargo: Cargo) {
  const first = { length: cargo.length, width: cargo.width, rotation: 0 }
  if (!cargo.rotatable || cargo.length === cargo.width) return [first]
  return [first, { length: cargo.width, width: cargo.length, rotation: 90 }]
}

export function expandCargo(cargo: Cargo[]) {
  const result: { cargo: Cargo; index: number }[] = []
  for (const item of cargo) {
    for (let i = 0; i < Math.max(0, Math.floor(item.quantity)); i += 1) result.push({ cargo: item, index: i })
  }
  return result
}

function candidatePoints(items: PlacedCargo[], container: Container, o: { length: number; width: number }) {
  const out: [number,number,number][] = []
  const seen = new Set<string>()
  const add = (x:number,y:number,z:number) => {
    x=snap(x); y=snap(y); z=snap(z)
    if(x<0||y<0||z<0||x+o.length>container.length+EPS||y+o.width>container.width+EPS||z+1>container.height+EPS) return
    const k=`${x}|${y}|${z}`
    if(!seen.has(k)){seen.add(k);out.push([x,y,z])}
  }

  // Floor candidates: four corners plus the front-left corner of each existing item.
  add(0,0,0); add(container.length-o.length,0,0); add(0,container.width-o.width,0); add(container.length-o.length,container.width-o.width,0)
  for(const q of items){
    const d=dims(q)
    add(q.x,q.y,0); add(q.x+d.length-o.length,q.y,0); add(q.x,q.y+d.width-o.width,0); add(q.x+d.length-o.length,q.y+d.width-o.width,0)
  }

  // Stacking candidates only come from the top surface of cargo at that exact height.
  const levels=[...new Set(items.map(q=>snap(q.z+q.height)))].filter(z=>z>0).sort((a,b)=>a-b)
  for(const z of levels){
    const supports=items.filter(q=>Math.abs(snap(q.z+q.height)-z)<=EPS)
    for(const q of supports){
      const d=dims(q)
      add(q.x,q.y,z); add(q.x+d.length-o.length,q.y,z); add(q.x,q.y+d.width-o.width,z); add(q.x+d.length-o.length,q.y+d.width-o.width,z)
    }
  }
  return out
}

function buildItems(cargo: Cargo[], locked: PlacedCargo[], strategy: 'volume'|'weight'|'footprint'='volume') {
  const lockedByCargo = new Map<string, number>()
  for (const p of locked) lockedByCargo.set(p.cargoId, (lockedByCargo.get(p.cargoId) || 0) + 1)
  return expandCargo(cargo)
    .filter(({cargo:c}) => c.length > 0 && c.width > 0 && c.height > 0)
    .filter(({cargo:c,index}) => index >= (lockedByCargo.get(c.id) || 0))
    .sort((a,b) => {
      const av=a.cargo.length*a.cargo.width*a.cargo.height, bv=b.cargo.length*b.cargo.width*b.cargo.height
      if(strategy==='weight') return b.cargo.weight-a.cargo.weight || bv-av
      if(strategy==='footprint') return (b.cargo.length*b.cargo.width)-(a.cargo.length*a.cargo.width) || bv-av
      return bv-av || b.cargo.weight-a.cargo.weight
    })
}

function tryPack(cargo: Cargo[], container: Container, locked: PlacedCargo[], onProgress?: (done:number,total:number)=>void) {
  const defs = new Map(cargo.map(c=>[c.id,c]))
  const result = [...locked]
  const items = buildItems(cargo, locked)
  let totalWeight = result.reduce((s,q)=>s+q.weight,0)

  for (let index=0; index<items.length; index++) {
    const c=items[index].cargo, unitIndex=items[index].index
    let best:PlacedCargo|undefined, bestScore=Infinity
    for (const o of orientations(c)) {
      for (const [x,y,z] of candidatePoints(result,container,o)) {
        const p:PlacedCargo={id:`${c.id}-${unitIndex+1}`,cargoId:c.id,cargoType:c.type,x,y,z,length:c.length,width:c.width,height:c.height,rotation:o.rotation,weight:c.weight,color:c.color,placementMode:'automatic',locked:false}
        if (!canStack(p,c,result,defs)) continue
        if (!canPlace(p,container,result) || !validatePlacement(p,container,result).ok) continue
        const score=scoreCandidate(p,result,container)
        if(score<bestScore){best=p;bestScore=score}
      }
    }
    if(best && totalWeight+best.weight<=container.maxPayload){result.push(best);totalWeight+=best.weight}
    onProgress?.(index+1,items.length)
  }
  return result
}

function packStrategy(cargo:Cargo[],container:Container,locked:PlacedCargo[],strategy:'volume'|'weight'|'footprint') {
 const defs=new Map(cargo.map(c=>[c.id,c])); const result=[...locked]; const items=buildItems(cargo,locked,strategy); let totalWeight=result.reduce((s,q)=>s+q.weight,0)
 for(const item of items){let best:PlacedCargo|undefined,bestScore=Infinity;for(const o of orientations(item.cargo)){for(const [x,y,z] of candidatePoints(result,container,o)){const p:PlacedCargo={id:`${item.cargo.id}-${item.index+1}`,cargoId:item.cargo.id,cargoType:item.cargo.type,x,y,z,length:item.cargo.length,width:item.cargo.width,height:item.cargo.height,rotation:o.rotation,weight:item.cargo.weight,color:item.cargo.color,placementMode:'automatic',locked:false};if(!canStack(p,item.cargo,result,defs)||!canPlace(p,container,result))continue;const score=scoreCandidate(p,result,container);if(score<bestScore){best=p;bestScore=score}}}if(best&&totalWeight+best.weight<=container.maxPayload){result.push(best);totalWeight+=best.weight}}
 return result
}

export function autoPack(cargo:Cargo[],container:Container,locked:PlacedCargo[]=[]){
 const totalUnits=expandCargo(cargo).length
 const strategies: ('volume' | 'weight' | 'footprint')[] = [
  'volume',
  'weight',
  'footprint',
]; let best=locked,bestScore=-Infinity
 for(const strategy of strategies){const r=packStrategy(cargo,container,locked,strategy);const sc=scoreSolution(r,container,totalUnits);if(sc>bestScore){best=r;bestScore=sc}}
 return best
}

export async function autoPackAsync(cargo:Cargo[],container:Container,locked:PlacedCargo[]=[],onProgress?:(done:number,total:number)=>void){
 const strategies:['volume','weight']=['volume','weight']
 const totalUnits=expandCargo(cargo).length
 let best=[...locked],bestScore=-Infinity
 for(let pass=0;pass<strategies.length;pass++){
  const strategy=strategies[pass]
  const items=buildItems(cargo,locked,strategy),total=items.length
  const result=[...locked],defs=new Map(cargo.map(c=>[c.id,c]))
  let totalWeight=result.reduce((sum,q)=>sum+q.weight,0)
  for(let index=0;index<items.length;index++){
   const c=items[index].cargo,unitIndex=items[index].index
   let bestItem:PlacedCargo|undefined,bestItemScore=Infinity
   for(const o of orientations(c)) for(const [x,y,z] of candidatePoints(result,container,o)){
    const p:PlacedCargo={id:`${c.id}-${unitIndex+1}`,cargoId:c.id,cargoType:c.type,x,y,z,length:c.length,width:c.width,height:c.height,rotation:o.rotation,weight:c.weight,color:c.color,placementMode:'automatic',locked:false}
    if(!canStack(p,c,result,defs)||!canPlace(p,container,result)||!validatePlacement(p,container,result).ok)continue
    const sc=scoreCandidate(p,result,container);if(sc<bestItemScore){bestItem=p;bestItemScore=sc}
   }
   if(bestItem&&totalWeight+bestItem.weight<=container.maxPayload){result.push(bestItem);totalWeight+=bestItem.weight}
   onProgress?.(Math.round(((pass*total)+(index+1))/(strategies.length*Math.max(total,1))*100),Math.max(total*strategies.length,1))
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  }
  const finalScore=scoreSolution(result,container,totalUnits)
  if(finalScore>bestScore){best=result;bestScore=finalScore}
 }
 onProgress?.(100,100)
 return best
}
