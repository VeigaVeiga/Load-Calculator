import type { Container, PlacedCargo } from '../types'
import { dims, bounds } from './geometry'

export function fitsContainer(p:PlacedCargo,c:Container){
 const d=dims(p)
 return p.x>=0&&p.y>=0&&p.z>=0&&p.x+d.length<=c.length+3&&p.y+d.width<=c.width+3&&p.z+p.height<=c.height+3
}
// Packing Engine 2.0: collision bodies are cargo only. Container hooks/lashing points
// are visual/attachment nodes and are deliberately not part of this list.
export function collides(p:PlacedCargo,items:PlacedCargo[]){
 const A=bounds(p)
 return items.some(q=>{
  if(q.id===p.id)return false
  const B=bounds(q)
  return A.x1<B.x2-1&&A.x2>B.x1+1&&A.y1<B.y2-1&&A.y2>B.y1+1&&A.z1<B.z2-1&&A.z2>B.z1+1
 })
}
export function canPlace(p:PlacedCargo,c:Container,items:PlacedCargo[]){return fitsContainer(p,c)&&!collides(p,items)}
