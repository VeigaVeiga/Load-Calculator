import { Line } from '@react-three/drei'
import type { ReactElement } from 'react'
import type { Container } from '../types'
const S=.001
export default function ContainerFloor({container}:{container:Container}){
 const L=container.length*S,W=container.width*S
 const lines:ReactElement[]=[]
 // Grid is symmetric about the container centerline. 200 mm minor grid, 1 m major grid.
 const addAxisLines=(axis:'x'|'y')=>{
   const total=axis==='x'?container.length:container.width
   const half=total/2
   for(let offset=-Math.floor(half/200)*200;offset<=Math.floor(half/200)*200;offset+=200){
     const major=Math.abs(offset)%1000===0
     if(axis==='x'){
       const X=offset*S
       lines.push(<Line key={`x-${offset}`} points={[[X,-W/2,0.0015],[X,W/2,0.0015]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
     }else{
       const Y=offset*S
       lines.push(<Line key={`y-${offset}`} points={[[-L/2,Y,0.0015],[L/2,Y,0.0015]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
     }
   }
 }
 addAxisLines('x'); addAxisLines('y')
 return <group>
  <mesh position={[0,0,-container.floorThickness*S/2-0.004]} receiveShadow><boxGeometry args={[L,W,container.floorThickness*S]}/><meshStandardMaterial color="#9b8b78" roughness={.9}/></mesh>
  {lines}
 </group>
}
