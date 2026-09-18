import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo } from 'react'
const S=.001
const GAP=16
function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false,hovered=false}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean;hovered?:boolean}){
 const d=dims(p)
 const pos:[number,number,number]=local?[0,0,p.height*S/2]:[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]
 const materialColor=selected?'#ffffff':hovered?'#e0a04b':p.color
 const materialOpacity=selected ? 0.55 : 0.8
 const crate=p.cargoType==='woodCrate', pallet=p.cargoType==='pallet'
 const dl=Math.max(20,d.length-GAP*2),dw=Math.max(20,d.width-GAP*2),dh=Math.max(20,p.height-GAP*2)
 const common={castShadow:false,receiveShadow:false}
 return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]}
  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
  <mesh userData={{collisionBody:false,hitBox:true,cargoId:p.id}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
   <boxGeometry args={[Math.max(d.length,20)*S,Math.max(d.width,20)*S,Math.max(p.height,20)*S]}/><meshBasicMaterial transparent opacity={0.015} depthWrite={false}/>
  </mesh>
  {pallet ? <>
   <mesh {...common} raycast={()=>null} position={[0,0,-p.height*S/2+Math.min(120,p.height*.12)*S/2]}><boxGeometry args={[dl*S,dw*S,Math.min(120,Math.max(70,p.height*.12))*S]}/><meshStandardMaterial color={selected?'#d7b27a':'#9a6738'} transparent opacity={materialOpacity} roughness={.86}/></mesh>
   <mesh {...common} raycast={()=>null} position={[0,0,Math.min(120,Math.max(70,p.height*.12))*S/2]}><boxGeometry args={[dl*S,dw*S,Math.max(40,p.height-Math.min(120,Math.max(70,p.height*.12)))*S]}/><meshStandardMaterial color={materialColor} transparent opacity={materialOpacity}/></mesh>
  </> : <>
   <mesh {...common} raycast={()=>null}><boxGeometry args={[dl*S,dw*S,dh*S]}/><meshStandardMaterial color={materialColor} transparent opacity={materialOpacity} roughness={crate?.82:.72}/></mesh>
  </>}

  {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
 </group>
}

export default memo(CargoModel)
