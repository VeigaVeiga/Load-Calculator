import { Html } from '@react-three/drei'
import type { Container } from '../types'
const S=.001
export default function LashingPoints({container}:{container:Container}){
 return <group>{container.lashingPoints.map(p=>{
  const x=(p.x-container.length/2)*S, y=(p.y-container.width/2)*S, z=Math.max(.012,p.z*S)
  return <group key={p.id} position={[x,y,z]}><mesh><sphereGeometry args={[.025,12,12]}/><meshStandardMaterial color="#d6a63d" emissive="#6b4d08" emissiveIntensity={.15}/></mesh><Html distanceFactor={8}><div className="lashing-label">{p.id}</div></Html></group>
 })}</group>
}
