import type { Cargo, PlacedCargo } from '../types'
import { dims, footprintOverlap } from './geometry'

export function supportRatio(p:PlacedCargo,others:PlacedCargo[]){
 if(p.z<=3)return 1
 const d=dims(p),area=d.length*d.width
 let supported=0
 for(const q of others){
  if(Math.abs(q.z+q.height-p.z)>3)continue
  const Q=dims(q)
  supported+=Math.max(0,Math.min(p.x+d.length,q.x+Q.length)-Math.max(p.x,q.x))*Math.max(0,Math.min(p.y+d.width,q.y+Q.width)-Math.max(p.y,q.y))
 }
 return Math.min(1,supported/area)
}
export function canStack(p:PlacedCargo,cargo:Cargo,items:PlacedCargo[],defs:Map<string,Cargo>){
 if(p.z<=3)return true
 if(!cargo.stackable)return false
 const supports=items.filter(q=>Math.abs(q.z+q.height-p.z)<=3&&footprintOverlap(p,q))
 if(!supports.length||supportRatio(p,items)<.95)return false
 for(const q of supports){
  const d=defs.get(q.cargoId)
  if(!d||!d.stackable||d.breakablePallet)return false
  if(d.maxLoadOnTop>0&&cargo.weight>d.maxLoadOnTop+3)return false
 }
 const layers=1+supports.reduce((m,q)=>{
  let n=1,cur=q
  while(cur.z>3&&n<32){const below=items.find(x=>Math.abs(x.z+x.height-cur.z)<=3&&footprintOverlap(cur,x));if(!below)break;n++;cur=below}
  return Math.max(m,n)
 },1)
 const limit=Math.min(...supports.map(q=>Math.max(1,defs.get(q.cargoId)?.maxStackLayers||1)))
 return layers<=limit
}
