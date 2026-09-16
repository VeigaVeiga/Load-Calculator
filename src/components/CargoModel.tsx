import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { useState } from 'react'
const S=.001
const GAP=16
export default function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean}){
 const d=dims(p)
 const [hovered,setHovered]=useState(false)
 const pos:[number,number,number]=local?[0,0,p.height*S/2]:[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]
 const materialColor=selected?'#f8fafc':hovered?'#e0a04b':p.color
 const edgeColor=selected?'#d36f2c':hovered?'#d08a43':'#5b4634'
 const common={castShadow:true,receiveShadow:true}
 const crate=p.cargoType==='woodCrate', pallet=p.cargoType==='pallet'
 const dl=Math.max(20,d.length-GAP*2),dw=Math.max(20,d.width-GAP*2),dh=Math.max(20,p.height-GAP*2)
 return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]} onPointerOver={e=>{e.stopPropagation();setHovered(true)}} onPointerOut={e=>{e.stopPropagation();setHovered(false)}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
  <mesh position={[0,0,0]} userData={{collisionBody:false, hitBox:true, cargoId:p.id}}><boxGeometry args={[Math.max(d.length,20)*S,Math.max(d.width,20)*S,Math.max(p.height,20)*S]}/><meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false}/></mesh>
  {pallet ? <>
    {(() => {
      const palletH = Math.min(120, Math.max(70, p.height * .12))
      const loadH = Math.max(40, p.height - palletH)
      const baseZ = -p.height*S/2 + palletH*S/2
      const loadZ = -p.height*S/2 + palletH*S + loadH*S/2
      return <>
        <mesh {...common} position={[0,0,baseZ]}><boxGeometry args={[dl*S,dw*S,palletH*S]}/><meshStandardMaterial color="#9a6738" roughness={.86}/></mesh>
        {[-.34,0,.34].map((f,i)=><mesh key={i} position={[0,f*dw*S/2,-p.height*S/2+palletH*S*.55]}><boxGeometry args={[dl*S,.11,palletH*S*.72]}/><meshStandardMaterial color="#b27a45"/></mesh>)}
        {[-.32,.32].map((f,i)=><mesh key={`r${i}`} position={[f*dl*S/2,0,-p.height*S/2+palletH*S*.52]}><boxGeometry args={[.10,dw*S,palletH*S*.68]}/><meshStandardMaterial color="#7f532d"/></mesh>)}
        <mesh {...common} position={[0,0,loadZ]}><boxGeometry args={[dl*S,dw*S,loadH*S]}/><meshStandardMaterial color={materialColor} transparent opacity={.94}/></mesh>
        <lineSegments position={[0,0,loadZ]}><edgesGeometry args={[new THREE.BoxGeometry(dl*S,dw*S,loadH*S)]}/><lineBasicMaterial color={edgeColor}/></lineSegments>
      </>
    })()}
  </> : crate ? <>
    <mesh {...common}><boxGeometry args={[dl*S,dw*S,dh*S]}/><meshStandardMaterial color={materialColor} roughness={.82}/></mesh>
    <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(dl*S,dw*S,dh*S)]}/><lineBasicMaterial color={edgeColor}/></lineSegments>
    {[-.25,.25].map((f,i)=><mesh key={i} position={[0,0,f*dh*S]}><boxGeometry args={[dl*S*1.01,.025,.045]}/><meshStandardMaterial color="#70451f"/></mesh>)}
    {[-.33,.33].map((f,i)=><mesh key={`v${i}`} position={[f*dl*S/2,0,0]}><boxGeometry args={[.045,dw*S*1.01,dh*S*1.01]}/><meshStandardMaterial color="#70451f"/></mesh>)}
  </> : <>
    <mesh {...common}><boxGeometry args={[dl*S,dw*S,dh*S]}/><meshStandardMaterial color={materialColor} transparent opacity={.94}/></mesh>
    <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(dl*S,dw*S,dh*S)]}/><lineBasicMaterial color={edgeColor}/></lineSegments>
    <mesh position={[0,0,dh*S*.015]}><boxGeometry args={[dl*S*.72,dw*S*.012,dh*S*.035]}/><meshStandardMaterial color="#6f5137"/></mesh>
  </>}
  {selected&&<Html position={[0,0,p.height*S/2+.07]} center><div className="scene-label"><b>{p.cargoId}</b><br/>{d.length.toLocaleString()} × {d.width.toLocaleString()} × {p.height.toLocaleString()} mm<br/>{p.weight.toFixed(1)} kg</div></Html>}
  {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
 </group>
}
