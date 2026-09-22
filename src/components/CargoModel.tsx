import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const S = .001
export const UNIT_BOX = new RoundedBoxGeometry(1, 1, 1, 1, .006)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX, 24)
const MATERIAL_CACHE = new Map<string, THREE.MeshStandardMaterial>()
const EDGE_MATERIAL_CACHE = new Map<string, THREE.LineBasicMaterial>()

export const materialFor = (color:string, roughness:number) => {
  const key=`${color}|${roughness}`
  let material=MATERIAL_CACHE.get(key)
  if(!material){ material=new THREE.MeshStandardMaterial({color,roughness}); MATERIAL_CACHE.set(key,material) }
  return material
}
const edgeMaterialFor = (color:string) => {
  const key=`edge:${color}`
  let material=EDGE_MATERIAL_CACHE.get(key)
  if(!material){ material=new THREE.LineBasicMaterial({color:'#4d5458',transparent:true,opacity:.78}); EDGE_MATERIAL_CACHE.set(key,material) }
  return material
}

type BoxProps={size:[number,number,number];position?:[number,number,number];color:string;roughness?:number;eventProps?:any;outline?:boolean}
function Box({size,position=[0,0,0],color,roughness=.7,eventProps,outline=false}:BoxProps){
  const material=useMemo(()=>materialFor(color,roughness),[color,roughness])
  const edgeMaterial=useMemo(()=>edgeMaterialFor(color),[color])
  return <group position={position}>
    <mesh geometry={UNIT_BOX} material={material} scale={size} {...eventProps}/>
    {outline&&<lineSegments geometry={UNIT_EDGES} material={edgeMaterial} scale={size} raycast={()=>null}/>} 
  </group>
}
const MemoBox=memo(Box,(a,b)=>a.color===b.color&&a.roughness===b.roughness&&a.outline===b.outline&&a.size[0]===b.size[0]&&a.size[1]===b.size[1]&&a.size[2]===b.size[2]&&(a.position?.[0]??0)===(b.position?.[0]??0)&&(a.position?.[1]??0)===(b.position?.[1]??0)&&(a.position?.[2]??0)===(b.position?.[2]??0)&&a.eventProps===b.eventProps)

type CargoModelProps={p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean;hovered?:boolean}
function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false,hovered=false}:CargoModelProps){
  const d=dims(p)
  // Physical dimensions are exact. Visual separation comes only from bevel and outline.
  const visualL=d.length, visualW=d.width, visualH=p.height
  const pos:[number,number,number]=local?[0,0,0]:[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+visualH/2)*S]
  const mainColor=selected?'#f2c94c':hovered?'#ffd166':(p.color||'#c7ced3')
  const crate=p.cargoType==='woodCrate', pallet=p.cargoType==='pallet'
  const palletDeckH=pallet?Math.min(120,Math.max(70,visualH*.08)):0
  const bodyH=pallet?Math.max(1,visualH-palletDeckH):visualH
  const eventProps=useMemo(()=>({onPointerDown,onPointerMove,onPointerUp,onClick}),[onPointerDown,onPointerMove,onPointerUp,onClick])

  return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]}>
    {pallet?<>
      {/* Entire palletized load stays inside the exact cargo bounding box. */}
      <group position={[0,0,(-visualH/2+palletDeckH/2)*S]}>
        <MemoBox size={[visualL*S,visualW*S,palletDeckH*S*.32]} color="#b57b45" roughness={.86} eventProps={eventProps} outline/>
        {[-.34,0,.34].map((i,k)=><MemoBox key={`deck-${k}`} position={[0,i*visualW*S*.28,palletDeckH*S*.34]} size={[visualL*S,visualW*S*.16,palletDeckH*S*.22]} color="#8a5a32" roughness={.86} outline/>)}
        {[-.34,0,.34].map((i,k)=><MemoBox key={`runner-${k}`} position={[i*visualL*S,0,-palletDeckH*S*.20]} size={[Math.max(55,visualL*.11)*S,visualW*S*.72,palletDeckH*S*.36]} color="#76502f" roughness={.88} outline/>)}
      </group>
      <MemoBox size={[visualL*S,visualW*S,bodyH*S]} position={[0,0,(-visualH/2+palletDeckH+bodyH/2)*S]} color={mainColor} roughness={.68} eventProps={eventProps} outline/>
    </>:crate?<>
      <MemoBox size={[visualL*S,visualW*S,visualH*S]} color="#9a6638" roughness={.82} eventProps={eventProps} outline/>
      {[-.38,-.13,.13,.38].map((t,i)=><MemoBox key={`sx${i}`} position={[0,t*visualW*S,0]} size={[visualL*S*.96,Math.max(12,visualW*.045)*S,visualH*S*.96]} color="#c08a52" roughness={.84} outline/>)}
      {[-.40,0,.40].map((t,i)=><MemoBox key={`sz${i}`} position={[t*visualL*S,0,0]} size={[Math.max(12,visualL*.045)*S,visualW*S*.96,visualH*S*.96]} color="#b97d46" roughness={.84} outline/>)}
    </>:<MemoBox size={[visualL*S,visualW*S,visualH*S]} color={mainColor} roughness={.62} eventProps={eventProps} outline/>}
    {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

const cargoEqual=(a:CargoModelProps,b:CargoModelProps)=>{
  const ap=a.p,bp=b.p
  return ap.id===bp.id&&ap.cargoId===bp.cargoId&&ap.cargoType===bp.cargoType&&ap.x===bp.x&&ap.y===bp.y&&ap.z===bp.z&&ap.length===bp.length&&ap.width===bp.width&&ap.height===bp.height&&ap.rotation===bp.rotation&&ap.color===bp.color&&a.selected===b.selected&&a.showName===b.showName&&a.local===b.local&&a.hovered===b.hovered&&a.container.length===b.container.length&&a.container.width===b.container.width&&a.container.height===b.container.height
}
export default memo(CargoModel,cargoEqual)
