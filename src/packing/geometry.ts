import type { Container, PlacedCargo, ValidationResult } from '../types'
export function dims(p:Pick<PlacedCargo,'length'|'width'|'rotation'>){return Math.abs(Math.round(p.rotation/90))%2===0?{length:p.length,width:p.width}:{length:p.width,width:p.length}}
export function bounds(p:PlacedCargo){const d=dims(p);return{x1:p.x,x2:p.x+d.length,y1:p.y,y2:p.y+d.width,z1:p.z,z2:p.z+p.height}}
export function overlap(a:PlacedCargo,b:PlacedCargo){const A=bounds(a),B=bounds(b);return A.x1<B.x2&&A.x2>B.x1&&A.y1<B.y2&&A.y2>B.y1&&A.z1<B.z2&&A.z2>B.z1}
export function footprintOverlap(a:PlacedCargo,b:PlacedCargo){const A=bounds(a),B=bounds(b);return A.x1<B.x2&&A.x2>B.x1&&A.y1<B.y2&&A.y2>B.y1}
export function inBounds(p:PlacedCargo,c:Container){const d=dims(p);return p.x>=0&&p.y>=0&&p.z>=0&&p.x+d.length<=c.length&&p.y+d.width<=c.width&&p.z+p.height<=c.height}
export function supportRatio(p:PlacedCargo,others:PlacedCargo[]){if(p.z<=2)return 1;const d=dims(p),area=d.length*d.width;let supported=0;for(const q of others)if(q.id!==p.id&&Math.abs(q.z+q.height-p.z)<=3){const Q=dims(q);supported+=Math.max(0,Math.min(p.x+d.length,q.x+Q.length)-Math.max(p.x,q.x))*Math.max(0,Math.min(p.y+d.width,q.y+Q.width)-Math.max(p.y,q.y))}return Math.min(1,supported/area)}
export function validatePlacement(p:PlacedCargo,c:Container,others:PlacedCargo[]):ValidationResult{
 const errors:string[]=[],warnings:string[]=[]
 if(!inBounds(p,c))errors.push('超出集装箱内部尺寸')
 if(others.some(q=>q.id!==p.id&&overlap(p,q)))errors.push('与其他货物发生碰撞')
 const above=others.filter(q=>Math.abs(q.z+q.height-p.z)<3&&footprintOverlap(p,q))
 if(p.z>2){const sr=supportRatio(p,others);if(sr<.95)warnings.push(`支撑面积不足 ${Math.round(sr*100)}%`)}
 if(above.length===0&&p.z>2)warnings.push('货物处于悬空位置，请检查支撑')
 return {ok:errors.length===0,errors,warnings}
}
