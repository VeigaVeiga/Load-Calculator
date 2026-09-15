import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
const S=.001
export default function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void}){
 const d=dims(p)
 const pos:[number,number,number]=[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]
 const materialColor=selected?'#f8fafc':p.color
 const edgeColor=selected?'#1d4ed8':'#5b4634'
 const common={castShadow:true,receiveShadow:true}
 const crate=p.cargoType==='woodCrate', pallet=p.cargoType==='pallet'
 return <group position={pos} rotation={[0,0,p.rotation*Math.PI/180]} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
  {pallet ? <>
   <mesh {...common}><boxGeometry args={[p.length*S,p.width*S,p.height*S]}/><meshStandardMaterial color={materialColor} transparent opacity={.92}/></mesh>
   {[-.34,0,.34].map((f,i)=><mesh key={i} position={[0,f*p.width*S,-p.height*S/2+.06]}><boxGeometry args={[p.length*S,.11,.12]}/><meshStandardMaterial color="#9a6738"/></mesh>)}
   {[-.32,.32].map((f,i)=><mesh key={`r${i}`} position={[f*p.length*S,0,-p.height*S/2+.11]}><boxGeometry args={[.10,p.width*S,.08]}/><meshStandardMaterial color="#7f532d"/></mesh>)}
  </> : crate ? <>
   <mesh {...common}><boxGeometry args={[p.length*S,p.width*S,p.height*S]}/><meshStandardMaterial color={materialColor} roughness={.82}/></mesh>
   <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(p.length*S,p.width*S,p.height*S)]}/><lineBasicMaterial color={edgeColor}/></lineSegments>
   {[-.25,.25].map((f,i)=><mesh key={i} position={[0,0,f*p.height*S]}><boxGeometry args={[p.length*S*1.01,.025,.045]}/><meshStandardMaterial color="#70451f"/></mesh>)}
   {[-.33,.33].map((f,i)=><mesh key={`v${i}`} position={[f*p.length*S/2,0,0]}><boxGeometry args={[.045,p.width*S*1.01,p.height*S*1.01]}/><meshStandardMaterial color="#70451f"/></mesh>)}
  </> : <>
   <mesh {...common}><boxGeometry args={[p.length*S,p.width*S,p.height*S]}/><meshStandardMaterial color={materialColor} transparent opacity={.94}/></mesh>
   <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(p.length*S,p.width*S,p.height*S)]}/><lineBasicMaterial color={edgeColor}/></lineSegments>
   <mesh position={[0,0,p.height*S*.015]}><boxGeometry args={[p.length*S*.72,p.width*S*.012,p.height*S*.035]}/><meshStandardMaterial color="#6f5137"/></mesh>
  </>}
  {selected&&<Html position={[0,0,p.height*S/2+.07]} center><div className="scene-label"><b>{p.cargoId}</b><br/>{d.length.toLocaleString()} × {d.width.toLocaleString()} × {p.height.toLocaleString()} mm<br/>{p.weight.toFixed(1)} kg</div></Html>}
 </group>
}
