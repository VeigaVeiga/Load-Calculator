import { Line } from '@react-three/drei'
import type { Container } from '../types'
const S=.001
export default function ContainerFloor({container}:{container:Container}){
 const L=container.length*S,W=container.width*S
 const lines=[]
 for(let x=0;x<=container.length;x+=100){
   const X=(x-container.length/2)*S
   const major=x%1000===0||x===container.length
   lines.push(<Line key={`x-${x}`} points={[[X,-W/2,0.0015],[X,W/2,0.0015]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
 }
 for(let y=0;y<=container.width;y+=100){
   const Y=(y-container.width/2)*S
   const major=y%1000===0||y===container.width
   lines.push(<Line key={`y-${y}`} points={[[-L/2,Y,0.0015],[L/2,Y,0.0015]]} color={major?'#8d96a1':'#cfd4da'} lineWidth={major?0.9:0.28}/>)
 }
 return <group>
  <mesh position={[0,0,-container.floorThickness*S/2-0.004]} receiveShadow><boxGeometry args={[L,W,container.floorThickness*S]}/><meshStandardMaterial color="#9b8b78" roughness={.9}/></mesh>
  {lines}
 </group>
}
