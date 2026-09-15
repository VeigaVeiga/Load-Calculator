import React from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Container, PlacedCargo, SecuringItem } from '../types'
import ContainerStructure from './ContainerStructure'
import ContainerFloor from './ContainerFloor'
import CargoModel from './CargoModel'
import SecuringModel from './SecuringModel'
import { dims } from '../packing/geometry'
export type View='iso'|'top'|'front'|'rear'|'left'|'right'
const S=.001
function CameraRig({view,container,dragging,cameraQuaternion}:{view:View;container:Container;dragging:boolean;cameraQuaternion:React.MutableRefObject<THREE.Quaternion>}){
 const {camera}=useThree(); const controls=useRef<any>(null)
 useEffect(()=>{
  camera.up.set(0,0,1)
  const L=container.length*S,W=container.width*S,H=container.height*S
  const d=Math.max(L,W,H)*1.35
  const target=new THREE.Vector3(0,0,H*.38)
  const pos:Record<View,[number,number,number]>={iso:[d*1.08,d*.92,d*.72],top:[0,0,d*1.4],front:[-d*1.55,0,H*.45],rear:[d*1.55,0,H*.45],left:[0,-d*1.65,H*.45],right:[0,d*1.65,H*.45]}
  camera.position.set(...pos[view]); camera.lookAt(target); if(controls.current){controls.current.target.copy(target);controls.current.update()}
 },[view,camera,container.length,container.width,container.height])
 return <><OrbitControls ref={controls} makeDefault enabled={!dragging} enableDamping dampingFactor={.09} rotateSpeed={.55} zoomSpeed={.9} panSpeed={.7} minDistance={1.2} maxDistance={24}/><CameraQuaternionSync target={cameraQuaternion}/></>
}
function CameraQuaternionSync({target}:{target:React.MutableRefObject<THREE.Quaternion>}){const {camera}=useThree(); useFrame(()=>target.current.copy(camera.quaternion)); return null}
function CargoInteraction({p,container,selected,onSelect,onMove,onDragState}:{p:PlacedCargo;container:Container;selected:boolean;onSelect:()=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onDragState:(v:boolean)=>void}){
 const [draggingLocal,setDraggingLocal]=useState(false)
 const plane=useRef(new THREE.Plane(new THREE.Vector3(0,0,1),0))
 const offset=useRef(new THREE.Vector3())
 const lastMove=useRef({x:Number.NaN,y:Number.NaN})
 const d=dims(p)
 const point=(e:any)=>{
  const out=new THREE.Vector3()
  plane.current.set(new THREE.Vector3(0,0,1),-(p.z*S))
  return e.ray.intersectPlane(plane.current,out)?out:null
 }
 const down=(e:any)=>{
  if(p.locked)return
  e.stopPropagation()
  onSelect()
  const pt=point(e)
  if(!pt)return
  const cargoCenter=new THREE.Vector3((p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S)
  offset.current.copy(cargoCenter).sub(pt)
  setDraggingLocal(true)
  onDragState(true)
  e.target.setPointerCapture?.(e.pointerId)
 }
 const move=(e:any)=>{
  if(!draggingLocal||p.locked)return
  e.stopPropagation()
  const pt=point(e)
  if(!pt)return
  const world=pt.clone().add(offset.current)
  const nx=Math.round((world.x+d.length*S/2+container.length*S/2)/(S*10))*10
  const ny=Math.round((world.y+d.width*S/2+container.width*S/2)/(S*10))*10
  if(nx===lastMove.current.x&&ny===lastMove.current.y)return
  lastMove.current={x:nx,y:ny}
  onMove(p.id,nx,ny,p.z)
 }
 const up=(e:any)=>{
  if(!draggingLocal)return
  e.stopPropagation()
  setDraggingLocal(false)
  onDragState(false)
  e.target.releasePointerCapture?.(e.pointerId)
 }
 return <CargoModel p={p} container={container} selected={selected} onPointerDown={down} onPointerMove={move} onPointerUp={up} onClick={e=>{e.stopPropagation();onSelect()}}/>
}
function Scene({container,items,materials,selectedId,onSelect,onMove,onMaterialMove,view,dragging,onDragState,cameraQuaternion}:{container:Container;items:PlacedCargo[];materials:SecuringItem[];selectedId:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onMaterialMove:(id:string,x:number,y:number)=>void;view:View;dragging:boolean;onDragState:(v:boolean)=>void;cameraQuaternion:React.MutableRefObject<THREE.Quaternion>}){
 return <>
  <color attach="background" args={['#edf0f1']}/><ambientLight intensity={1.7}/><directionalLight position={[6,8,10]} intensity={2.1} castShadow/><Environment preset="city"/>
  <ContainerStructure container={container}/><ContainerFloor container={container}/>
  {items.map(p=><CargoInteraction key={p.id} p={p} container={container} selected={p.id===selectedId} onSelect={()=>onSelect(p.id)} onMove={onMove} onDragState={onDragState}/>)}
  {materials.map(m=><SecuringModel key={m.id} item={m} container={container} onMove={onMaterialMove} onDragState={onDragState}/>)}
  <CameraRig view={view} container={container} dragging={dragging} cameraQuaternion={cameraQuaternion}/>
 </>
}
export default function ContainerScene(props:{container:Container;items:PlacedCargo[];materials:SecuringItem[];selectedId:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onMaterialMove:(id:string,x:number,y:number)=>void;view:View;dragging:boolean;onDragState:(v:boolean)=>void;onView:(v:View)=>void}){
 return <div className="scene-host"><Canvas shadows camera={{position:[7,7,5],fov:42}} onPointerMissed={()=>props.onSelect(null)}><Scene {...props} cameraQuaternion={useRef(new THREE.Quaternion())}/></Canvas></div>
}
