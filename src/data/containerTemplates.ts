import type { Container, LashingPoint } from '../types'

function points(length:number,width:number,height:number):LashingPoint[]{
  const out:LashingPoint[]=[]; let n=1
  for(const x of [300,length/2,length-300]) for(const y of [80,width-80]) out.push({id:`F${n++}`,x,y,z:0,type:'floor',maxLoad:1000})
  for(const x of [250,length-250]) for(const z of [500,1200]) for(const y of [0,width]) out.push({id:`S${n++}`,x,y,z,type:'side',maxLoad:500})
  return out
}

export const containerTemplates:Container[]=[
 {id:'20GP',name:'20GP',length:5898,width:2352,height:2390,outerLength:6058,outerWidth:2438,outerHeight:2591,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2280,doorFrameDepth:90,maxPayload:28200,lashingPoints:points(5898,2352,2390)},
 {id:'40GP',name:'40GP',length:12032,width:2352,height:2390,outerLength:12192,outerWidth:2438,outerHeight:2591,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2280,doorFrameDepth:90,maxPayload:26700,lashingPoints:points(12032,2352,2390)},
 {id:'40HQ',name:'40HQ',length:12032,width:2352,height:2698,outerLength:12192,outerWidth:2438,outerHeight:2896,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2585,doorFrameDepth:90,maxPayload:26700,lashingPoints:points(12032,2352,2698)},
]
