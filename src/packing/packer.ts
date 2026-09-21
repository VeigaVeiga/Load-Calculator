import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, inBounds, overlap } from './geometry'

const EPS = 0.5
const SNAP = 10
const SUPPORT = 0.98
const snap = (n:number) => Math.max(0, Math.round(n / SNAP) * SNAP)
type Ori = { length:number; width:number; height:number; rotation:0|90 }
type Unit = { cargo:Cargo; index:number }

function orientations(c:Cargo):Ori[]{
  const a:Ori={length:c.length,width:c.width,height:c.height,rotation:0}
  if(!c.rotatable || Math.abs(c.length-c.width)<EPS)return[a]
  return[a,{length:c.width,width:c.length,height:c.height,rotation:90}]
}
export function expandCargo(cargo:Cargo[]):Unit[]{const out:Unit[]=[];for(const c of cargo)for(let i=0;i<Math.max(0,Math.floor(c.quantity));i++)out.push({cargo:c,index:i});return out}
function placed(u:Unit,o:Ori,x:number,y:number,z:number):PlacedCargo{return{id:`${u.cargo.id}-${u.index+1}`,cargoId:u.cargo.id,cargoType:u.cargo.type,x:snap(x),y:snap(y),z:snap(z),length:u.cargo.length,width:u.cargo.width,height:o.height,weight:u.cargo.weight,color:u.cargo.color,rotation:o.rotation,placementMode:'automatic',locked:false}}
function area(a:PlacedCargo,b:PlacedCargo){const A=dims(a),B=dims(b);return Math.max(0,Math.min(a.x+A.length,b.x+B.length)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+A.width,b.y+B.width)-Math.max(a.y,b.y))}
function coverage(p:PlacedCargo,s:PlacedCargo[]){if(p.z<=EPS)return 1;const d=dims(p),total=d.length*d.width;if(!s.length)return 0;const xs=[p.x,p.x+d.length,...s.flatMap(q=>{const qd=dims(q);return[Math.max(p.x,q.x),Math.min(p.x+d.length,q.x+qd.length)]})].filter(x=>x>=p.x-EPS&&x<=p.x+d.length+EPS).sort((a,b)=>a-b);const ys=[p.y,p.y+d.width,...s.flatMap(q=>{const qd=dims(q);return[Math.max(p.y,q.y),Math.min(p.y+d.width,q.y+qd.width)]})].filter(y=>y>=p.y-EPS&&y<=p.y+d.width+EPS).sort((a,b)=>a-b);let covered=0;for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;if(s.some(q=>{const qd=dims(q);return x>=q.x-EPS&&x<=q.x+qd.length+EPS&&y>=q.y-EPS&&y<=q.y+qd.width+EPS}))covered+=(xs[i+1]-xs[i])*(ys[j+1]-ys[j])}return Math.min(1,covered/total)}
function supportsAt(p:PlacedCargo,items:PlacedCargo[]){return items.filter(q=>Math.abs(q.z+q.height-p.z)<=EPS&&area(p,q)>EPS)}
function level(p:PlacedCargo,items:PlacedCargo[],seen=new Set<string>()):number{if(p.z<=EPS||seen.has(p.id))return 1;seen.add(p.id);const s=supportsAt(p,items);return s.length?1+Math.max(...s.map(q=>level(q,items,new Set(seen)))):1}
function canPlace(p:PlacedCargo,c:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
  if(p.z<=EPS)return true
  if(!c.stackable)return false
  const s=supportsAt(p,items)
  if(coverage(p,s)<SUPPORT)return false
  if(level(p,items)>Math.max(1,Math.floor(c.maxStackLayers||1)))return false
  return s.every(q=>{const d=defs.get(q.cargoId);return !!d&&d.loadBearing&&!d.breakablePallet})
}
function validLocked(lock:PlacedCargo[],c:Container,qty:Map<string,number>){const out:PlacedCargo[]=[];for(const p of lock){if(!qty.get(p.cargoId)||!inBounds(p,c)||out.some(q=>overlap(p,q)))continue;out.push(p)}return out}
function units(cargo:Cargo[]){return expandCargo(cargo).filter(u=>u.cargo.length>0&&u.cargo.width>0&&u.cargo.height>0).sort((a,b)=>{const av=a.cargo.length*a.cargo.width*a.cargo.height,bv=b.cargo.length*b.cargo.width*b.cargo.height;return(b.cargo.loadBearing?1:0)-(a.cargo.loadBearing?1:0)||(b.cargo.stackable?1:0)-(a.cargo.stackable?1:0)||(bv-av)||(b.cargo.weight-a.cargo.weight)})}

function candidateXY(items:PlacedCargo[],c:Container,o:Ori){
  const xs=new Set<number>([0,snap(c.length-o.length)])
  const ys=new Set<number>([0,snap(c.width-o.width)])
  for(const q of items){
    const d=dims(q)
    xs.add(snap(q.x));xs.add(snap(q.x+d.length));xs.add(snap(q.x-o.length));xs.add(snap(q.x+d.length-o.length))
    ys.add(snap(q.y));ys.add(snap(q.y+d.width));ys.add(snap(q.y-o.width));ys.add(snap(q.y+d.width-o.width))
  }
  return {xs:[...xs].filter(x=>x>=-EPS&&x+o.length<=c.length+EPS).sort((a,b)=>a-b),ys:[...ys].filter(y=>y>=-EPS&&y+o.width<=c.width+EPS).sort((a,b)=>a-b)}
}

function choose(u:Unit,items:PlacedCargo[],c:Container,defs:Map<string,Cargo>,weight:number){
  let floorBest:PlacedCargo|undefined,floorScore=-Infinity
  let stackBest:PlacedCargo|undefined,stackScore=-Infinity
  const same=items.filter(q=>q.cargoId===u.cargo.id)
  const centerY=c.width/2

  for(const o of orientations(u.cargo)){
    const {xs,ys}=candidateXY(items,c,o)
    const zs=[0,...items.map(q=>snap(q.z+q.height))].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b)
    for(const z of zs)for(const y of ys)for(const x of xs){
      if(weight+u.cargo.weight>c.maxPayload+EPS)continue
      const p=placed(u,o,x,y,z)
      if(!inBounds(p,c)||items.some(q=>overlap(p,q))||!canPlace(p,u.cargo,items,defs))continue
      const supports=supportsAt(p,items),cov=coverage(p,supports)
      if(p.z>EPS&&cov<SUPPORT)continue
      const nearest=same.length?Math.min(...same.map(q=>Math.hypot(p.x-q.x,p.y-q.y))):999999
      const aligned=same.reduce((n,q)=>n+(Math.abs(p.x-q.x)<=SNAP?1:0)+(Math.abs(p.y-q.y)<=SNAP?1:0),0)
      if(p.z<=EPS){
        /* Floor-first packing: fill from the header toward the doors in regular rows.
           This prevents the old scorer from jumping to a stack while a large floor gap remained. */
        const rowCenter=Math.abs((p.y+o.width/2)-centerY)
        const score=5000000-p.x*2200-rowCenter*80+aligned*500000+Math.max(0,500000-nearest*400)
        if(score>floorScore){floorScore=score;floorBest=p}
      }else{
        /* Stack only after no floor placement exists. Prefer same-type footprints and low Z. */
        const score=2500000+aligned*700000+cov*600000+Math.max(0,500000-nearest*350)-p.z*150
        if(score>stackScore){stackScore=score;stackBest=p}
      }
    }
  }
  return floorBest??stackBest
}

function pack(cargo:Cargo[],c:Container,locked:PlacedCargo[],step?:(i:number,n:number)=>void){
  const defs=new Map(cargo.map(x=>[x.id,x])),qty=new Map(cargo.map(x=>[x.id,Math.floor(x.quantity)])),items=validLocked(locked,c,qty),count=new Map<string,number>()
  for(const p of items)count.set(p.cargoId,(count.get(p.cargoId)||0)+1)
  let w=items.reduce((s,p)=>s+p.weight,0)
  const us=units(cargo).filter(u=>u.index>=(count.get(u.cargo.id)||0))
  for(let i=0;i<us.length;i++){const p=choose(us[i],items,c,defs,w);if(p){items.push(p);w+=p.weight}step?.(i+1,us.length)}
  return items
}
export function autoPack(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[]){return pack(cargo,c,locked)}
export async function autoPackAsync(cargo:Cargo[],c:Container,locked:PlacedCargo[]=[],progress?:(percent:number)=>void){const result=pack(cargo,c,locked);progress?.(100);return result}
