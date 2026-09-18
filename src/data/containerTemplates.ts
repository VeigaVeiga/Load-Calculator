import type { Container, LashingPoint } from '../types'

function points(length:number,width:number,height:number):LashingPoint[]{
 const out:LashingPoint[]=[]; const count=Math.max(5,Math.round(length/1200))
 for(let i=0;i<count;i++){const x=count===1?Math.round(length/2):Math.round(120+i*(length-240)/(count-1));out.push({id:`LB${i+1}`,x,y:38,z:38,type:'side',maxLoad:1000});out.push({id:`RB${i+1}`,x,y:width-38,z:38,type:'side',maxLoad:1000});out.push({id:`LT${i+1}`,x,y:38,z:Math.max(38,height-24),type:'side',maxLoad:1000});out.push({id:`RT${i+1}`,x,y:width-38,z:Math.max(38,height-24),type:'side',maxLoad:1000})}
 for(const x of [120,Math.max(120,length-120)]) for(const y of [90,width-90]) out.push({id:`F${out.length+1}`,x,y,z:25,type:'floor',maxLoad:1000})
 return out
}

export const containerTemplates:Container[]=[
 {id:'20GP',name:'20GP',length:5898,width:2352,height:2390,outerLength:6058,outerWidth:2438,outerHeight:2591,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2280,doorFrameDepth:90,maxPayload:28200,lashingPoints:points(5898,2352,2390)},
 {id:'40GP',name:'40GP',length:12032,width:2352,height:2390,outerLength:12192,outerWidth:2438,outerHeight:2591,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2280,doorFrameDepth:90,maxPayload:26700,lashingPoints:points(12032,2352,2390)},
 {id:'40HQ',name:'40HQ',length:12032,width:2352,height:2698,outerLength:12192,outerWidth:2438,outerHeight:2896,floorThickness:28,wallThickness:43,roofThickness:35,doorWidth:2340,doorHeight:2585,doorFrameDepth:90,maxPayload:26700,lashingPoints:points(12032,2352,2698)},
]
