import type { Container, PlacedCargo } from '../types'
import { dims } from './geometry'
import { supportRatio } from './support'

export function scoreCandidate(p:PlacedCargo,items:PlacedCargo[],c:Container){
 const d=dims(p),cx=p.x+d.length/2,cy=p.y+d.width/2
 let total=p.weight,mx=p.weight*cx,my=p.weight*cy
 let usedL=p.x+d.length,usedW=p.y+d.width
 for(const q of items){const qd=dims(q);total+=q.weight;mx+=q.weight*(q.x+qd.length/2);my+=q.weight*(q.y+qd.width/2);usedL=Math.max(usedL,q.x+qd.length);usedW=Math.max(usedW,q.y+qd.width)}
 const balance=(Math.abs(mx/total-c.length/2)/c.length)+(Math.abs(my/total-c.width/2)/c.width)
 const wall=Math.min(p.x,c.length-p.x-d.length,p.y,c.width-p.y-d.width)
 let contact=0
 for(const q of items){const qd=dims(q);const gx=Math.max(q.x-(p.x+d.length),p.x-(q.x+qd.length),0);const gy=Math.max(q.y-(p.y+d.width),p.y-(q.y+qd.width),0);if(gx<=10&&gy<=10)contact++}
 const compact=(usedL*usedW)/(c.length*c.width)
 const perimeter=(usedL/c.length)+(usedW/c.width)
 const centerY=Math.abs(cy-c.width/2)
 // Deterministic floor-first heuristic. It prefers the lowest valid layer,
 // then a centered width, then fills from the front (X) without creating gaps.
 // CG balance is deliberately a late tie-breaker.
 return (p.z/c.height)*100000000 + (centerY/c.width)*50000 + (p.y/c.width)*18000 + (p.x/c.length)*9000 + compact*700 + perimeter*180 + balance*400 + Math.max(0,wall)/Math.max(c.length,c.width)*10 - contact*140 - supportRatio(p,items)*10
}
export function scoreSolution(items:PlacedCargo[],c:Container,totalUnits:number){
 let weight=0,mx=0,my=0,volume=0,usedL=0,usedW=0,maxZ=0
 for(const p of items){const d=dims(p);weight+=p.weight;mx+=p.weight*(p.x+d.length/2);my+=p.weight*(p.y+d.width/2);volume+=d.length*d.width*p.height;usedL=Math.max(usedL,p.x+d.length);usedW=Math.max(usedW,p.y+d.width);maxZ=Math.max(maxZ,p.z+p.height)}
 const bx=weight?Math.abs(mx/weight-c.length/2)/c.length:1
 const by=weight?Math.abs(my/weight-c.width/2)/c.width:1
 const utilization=volume/(c.length*c.width*c.height)
 const completion=totalUnits?items.length/totalUnits:1
 const footprintPenalty=(usedL*usedW)/(c.length*c.width)
 const heightPenalty=maxZ/c.height
 return completion*10000+utilization*1800-(bx+by)*900-footprintPenalty*300-heightPenalty*120
}
