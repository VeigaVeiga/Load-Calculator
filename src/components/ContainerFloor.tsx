import { Line } from '@react-three/drei'
import type { ReactElement } from 'react'
import type { Container } from '../types'
import ApertureLogisticsScene from './ApertureLogisticsScene'
const S=.001
export default function ContainerFloor({container}:{container:Container}){
 const L=container.length*S,W=container.width*S
 const lines:ReactElement[]=[]
 // The packing coordinate system uses z=0 as the top surface of the floor.
 // Keep the rendered floor top exactly at z=0 so automatically packed cargo
 // does not appear to float above the floor.
 const addAxisLines=(axis:'x'|'y')=>{
   const total=axis==='x'?container.length:container.width
   const half=total/2
   for(let offset=-Math.floor(half/200)*200;offset<=Math.floor(half/200)*200;offset+=200){
     const major=Math.abs(offset)%1000===0
     if(axis==='x'){
       const X=offset*S
       lines.push(<Line key={`x-${offset}`} points={[[X,-W/2,0.008],[X,W/2,0.008]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
     }else{
       const Y=offset*S
       lines.push(<Line key={`y-${offset}`} points={[[-L/2,Y,0.008],[L/2,Y,0.008]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
     }
   }
 }
 addAxisLines('x'); addAxisLines('y')
 return <group>
  <ApertureLogisticsScene />
  <mesh position={[0,0,-container.floorThickness*S/2]} receiveShadow><boxGeometry args={[L,W,container.floorThickness*S]}/><meshStandardMaterial color="#9b8b78" roughness={.9}/></mesh>
  {lines}
 </group>
}
