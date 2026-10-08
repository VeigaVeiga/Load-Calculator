import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, supportMetrics } from './geometry'

const EPS = 0.5
const SUPPORT = 0.75
const MAX_MERGE_GAP = 120

export type LayerUnit = { cargo: Cargo; index: number }

type Rect = { x: number; y: number; w: number; h: number }

function footprint(p: Pick<PlacedCargo, 'length' | 'width' | 'rotation'>) { return dims(p) }

function overlap(a: PlacedCargo, b: PlacedCargo) {
  const A = footprint(a), B = footprint(b)
  return a.x < b.x + B.length - EPS && a.x + A.length > b.x + EPS &&
    a.y < b.y + B.width - EPS && a.y + A.width > b.y + EPS &&
    a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS
}

function inside(p: PlacedCargo, r: Rect) {
  const d = footprint(p)
  return p.x >= r.x - EPS && p.y >= r.y - EPS &&
    p.x + d.length <= r.x + r.w + EPS && p.y + d.width <= r.y + r.h + EPS
}

function splitRect(r: Rect, p: PlacedCargo) {
  const d = footprint(p)
  const x1=Math.max(r.x,p.x), x2=Math.min(r.x+r.w,p.x+d.length)
  const y1=Math.max(r.y,p.y), y2=Math.min(r.y+r.h,p.y+d.width)
  if (x2 <= x1 + EPS || y2 <= y1 + EPS) return [r]
  const out: Rect[]=[]
  if (x1-r.x > EPS) out.push({x:r.x,y:r.y,w:x1-r.x,h:r.h})
  if (r.x+r.w-x2 > EPS) out.push({x:x2,y:r.y,w:r.x+r.w-x2,h:r.h})
  if (y1-r.y > EPS) out.push({x:x1,y:r.y,w:x2-x1,h:y1-r.y})
  if (r.y+r.h-y2 > EPS) out.push({x:x1,y:y2,w:x2-x1,h:r.y+r.h-y2})
  return out
}

function mergeSupports(supports: PlacedCargo[]) {
  const rects: Rect[] = supports.map(q => { const d=footprint(q); return {x:q.x,y:q.y,w:d.length,h:d.width} })
  const out=[...rects]
  for (let i=0;i<rects.length;i+=1) for (let j=i+1;j<rects.length;j+=1) {
    const a=rects[i], b=rects[j]
    const verticalGap=Math.max(b.y-(a.y+a.h),a.y-(b.y+b.h),0)
    const horizontalGap=Math.max(b.x-(a.x+a.w),a.x-(b.x+b.w),0)
    const yOverlap=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))
    const xOverlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))
    if ((horizontalGap<=MAX_MERGE_GAP && yOverlap>EPS) || (verticalGap<=MAX_MERGE_GAP && xOverlap>EPS)) {
      out.push({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)})
    }
  }
  return out
}

function freeRects(z:number, placed:PlacedCargo[], supports:PlacedCargo[]) {
  let rects=mergeSupports(supports)
  const same=placed.filter(p=>Math.abs(p.z-z)<=EPS)
  for (const p of same) {
    const next:Rect[]=[]
    for (const r of rects) next.push(...splitRect(r,p))
    rects=next
  }
  return rects.filter(r=>r.w>EPS && r.h>EPS)
}

function candidateInRect(u:LayerUnit,z:number,r:Rect,rotation:0|90,container:Container,placed:PlacedCargo[]) {
  const c=u.cargo
  const d=rotation===0?{length:c.length,width:c.width}:{length:c.width,width:c.length}
  const cx=r.x+(r.w-d.length)/2, cy=r.y+(r.h-d.width)/2
  const positions:Array<[number,number]>=[[cx,cy],[r.x,r.y],[r.x+r.w-d.length,r.y],[r.x,r.y+r.h-d.width],[r.x+r.w-d.length,r.y+r.h-d.width],[cx,r.y],[cx,r.y+r.h-d.width],[r.x,cy],[r.x+r.w-d.length,cy]]
  let best:PlacedCargo|null=null, bestScore=-Infinity
  for(const [x,y] of positions){
    if(x<-EPS||y<-EPS||x+d.length>container.length+EPS||y+d.width>container.width+EPS) continue
    const p:PlacedCargo={id:c.id+'#'+(u.index+1),cargoId:c.id,cargoType:c.type,x,y,z,length:c.length,width:c.width,height:c.height,rotation,weight:c.weight,color:c.color,placementMode:'automatic',locked:false,stackable:c.stackable,loadBearing:c.loadBearing,maxStackLayers:c.maxStackLayers,maxLoadOnTop:c.maxLoadOnTop,rotatable:c.rotatable}
    if(placed.some(q=>overlap(p,q))) continue
    const s=supportMetrics(p,placed)
    if(s.ratio+EPS<SUPPORT||!s.centerSupported||s.maxOverhangRatio>0.25+EPS) continue
    const density=(d.length*d.width)/(r.w*r.h)
    const residualShort=Math.min(Math.max(0,r.w-d.length),Math.max(0,r.h-d.width))
    const residualLong=Math.max(Math.max(0,r.w-d.length),Math.max(0,r.h-d.width))
    const centerDist=Math.abs((x+d.length/2)-(container.length/2))+Math.abs((y+d.width/2)-(container.width/2))
    const score=s.ratio*1000000+density*100000-residualShort*30-residualLong*5-centerDist*0.15
    if(score>bestScore){best=p;bestScore=score}
  }
  return best
}

export function packSupportedLayers(units:LayerUnit[],placed:PlacedCargo[],container:Container,totalWeight:number,progress?:(percent:number)=>void){
  const remaining=[...units]
  const stackLayerCount = (cargoId:string) => new Set(placed.filter(p => p.cargoId === cargoId).map(p => Math.round(p.z * 10) / 10)).size
  let weight=totalWeight
  const added:PlacedCargo[]=[]
  let guard=0
  while(remaining.length && guard<units.length*2){
    guard+=1
    const levels=[...new Set(placed.filter(p=>p.z+p.height>EPS&&p.z+p.height<container.height-EPS&&(p.loadBearing!==false||p.stackable===true)).map(p=>Math.round((p.z+p.height)*10)/10))].sort((a,b)=>a-b)
    let chosen:PlacedCargo|null=null, chosenIndex=-1
    for(const z of levels){
      const supports=placed.filter(p=>Math.abs(p.z+p.height-z)<=EPS&&(p.loadBearing!==false||p.stackable===true))
      if(!supports.length) continue
      const rects=freeRects(z,placed,supports)
      let layerBest:PlacedCargo|null=null, layerIndex=-1, layerScore=-Infinity
      for(let i=0;i<remaining.length;i+=1){
        const u=remaining[i]
        const existingLayers = stackLayerCount(u.cargo.id)
        const maxLayers = u.cargo.maxStackLayers ?? Infinity
        if (existingLayers >= maxLayers) continue
        const rots:Array<0|90>=u.cargo.rotatable===false||u.cargo.length===u.cargo.width?[0]:[0,90]
        for(const rot of rots) for(const r of rects){
          const p=candidateInRect(u,z,r,rot,container,placed)
          if(!p) continue

          const d=footprint(p)
          const adjacent = placed.reduce((sum,q)=>{
            if(Math.abs(q.z-z)>EPS) return sum
            const qd=footprint(q)
            const xTouch = Math.abs(p.x+d.length-q.x)<=EPS || Math.abs(q.x+qd.length-p.x)<=EPS
            const yTouch = Math.max(0,Math.min(p.y+d.width,q.y+qd.width)-Math.max(p.y,q.y))
            const yTouchEdge = Math.abs(p.y+d.width-q.y)<=EPS || Math.abs(q.y+qd.width-p.y)<=EPS
            const xOverlap = Math.max(0,Math.min(p.x+d.length,q.x+qd.length)-Math.max(p.x,q.x))
            return sum + (xTouch ? yTouch : 0) + (yTouchEdge ? xOverlap : 0)
          },0)

          const centerDistance =
            Math.abs((p.x+d.length/2)-container.length/2) +
            Math.abs((p.y+d.width/2)-container.width/2)

          const currentSameLevel = placed.filter(q=>Math.abs(q.z-z)<=EPS)
          const currentMinX = currentSameLevel.length ? Math.min(...currentSameLevel.map(q=>q.x)) : p.x
          const currentMaxX = currentSameLevel.length ? Math.max(...currentSameLevel.map(q=>q.x+footprint(q).length)) : p.x+d.length
          const currentMinY = currentSameLevel.length ? Math.min(...currentSameLevel.map(q=>q.y)) : p.y
          const currentMaxY = currentSameLevel.length ? Math.max(...currentSameLevel.map(q=>q.y+footprint(q).width)) : p.y+d.width
          const spanX = Math.max(currentMaxX,p.x+d.length)-Math.min(currentMinX,p.x)
          const spanY = Math.max(currentMaxY,p.y+d.width)-Math.min(currentMinY,p.y)

          // Prefer edge contact and a compact footprint, then center the layer.
          // Support remains the hard constraint inside candidateInRect().
          const score =
            adjacent * 180 +
            d.length*d.width * 0.02 -
            spanX * spanY * 0.0008 -
            centerDistance * 0.2

          if(score>layerScore){layerBest=p;layerIndex=i;layerScore=score}
        }
      }
      if(layerBest){chosen=layerBest;chosenIndex=layerIndex;break}
    }
    if(!chosen) break
    remaining.splice(chosenIndex,1)
    placed.push(chosen); added.push(chosen); weight+=chosen.weight
    progress?.(Math.round((added.length/Math.max(1,units.length))*100))
  }
  return {remaining,added,totalWeight:weight}
}