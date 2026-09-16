import type { Container } from '../types'
const S=.001
export default function LashingPoints({container}:{container:Container}){return <group>{container.lashingPoints.map(p=>{const x=(p.x-container.length/2)*S,y=(p.y-container.width/2)*S,z=Math.max(.012,p.z*S);return <group key={p.id} position={[x,y,z]} raycast={()=>null}><mesh userData={{collisionBody:false,collision:false,lashingPoint:true}} raycast={()=>null}><torusGeometry args={[.035,.009,8,16,Math.PI*1.35]}/><meshStandardMaterial color={'#5d6665'} metalness={.65} roughness={.35}/></mesh></group>})}</group>}
