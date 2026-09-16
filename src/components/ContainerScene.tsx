import React from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Html, Sky, Stars, TransformControls } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Cargo, Container, PlacedCargo, SecuringItem } from '../types'
import ContainerStructure from './ContainerStructure'
import ContainerFloor from './ContainerFloor'
import CargoModel from './CargoModel'
import SecuringModel from './SecuringModel'
import LashingPoints from './LashingPoints'
import { dims } from '../packing/geometry'

export type View='iso'|'top'|'front'|'rear'|'left'|'right'
const S=.001

function CameraRig({view,container,dragging,cameraQuaternion}:{view:View;container:Container;dragging:boolean;cameraQuaternion:React.MutableRefObject<THREE.Quaternion>}){
 const {camera}=useThree(); const controls=useRef<any>(null)
 useEffect(()=>{
  camera.up.set(0,0,1)
  const L=container.length*S,W=container.width*S,H=container.height*S
  const d=Math.max(L,W,H)*1.35
  const target=new THREE.Vector3(0,0,H*.34)
  const pos:Record<View,[number,number,number]>={
   iso:[d*1.04,d*.92,d*.68],
   top:[0,0,d*1.38],
   front:[-d*1.55,0,H*.45],
   rear:[d*1.55,0,H*.45],
   left:[0,-d*1.62,H*.45],
   right:[0,d*1.62,H*.45]
  }
  camera.position.set(...pos[view]); camera.lookAt(target)
  if(controls.current){controls.current.target.copy(target);controls.current.update()}
 },[view,camera,container.length,container.width,container.height])
 return <><OrbitControls ref={controls} makeDefault enabled={!dragging} enableDamping dampingFactor={.08} rotateSpeed={.5} zoomSpeed={.85} panSpeed={.65} minDistance={1.2} maxDistance={28}/><CameraQuaternionSync target={cameraQuaternion}/></>
}
function CameraQuaternionSync({target}:{target:React.MutableRefObject<THREE.Quaternion>}){const {camera}=useThree(); useFrame(()=>target.current.copy(camera.quaternion)); return null}

function CoordinateAxes({container,lang}:{container:Container;lang:'zh'|'en'}){
 const L=container.length*S,W=container.width*S
 const p:[number,number,number]=[-L/2-3,-W/2-3,0.02]
 const len=Math.min(.9,Math.max(.45,Math.min(L,W)*.7))
 return <group position={p}>
  <Line points={[[0,0,0],[len,0,0]]} color="#b4473d" lineWidth={2}/>
  <Line points={[[0,0,0],[0,len,0]]} color="#4d8052" lineWidth={2}/>
  <Line points={[[0,0,0],[0,0,len]]} color="#3f6f9e" lineWidth={2}/>
  <Html position={[len,0,0]} center><div className="axis-label axis-x">X {lang==='zh'?'长度':'Length'} →</div></Html>
  <Html position={[0,len,0]} center><div className="axis-label axis-y">Y {lang==='zh'?'宽度':'Width'} →</div></Html>
  <Html position={[0,0,len]} center><div className="axis-label axis-z">Z {lang==='zh'?'高度':'Height'} ↑</div></Html>
 </group>
}

function CargoInteraction({p,container,selected,onSelect,onMove,onRotate,onDragState,showName,freePlacement}:{p:PlacedCargo;container:Container;selected:boolean;onSelect:()=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onRotate:(id:string,rotation:number)=>void;onDragState:(v:boolean)=>void;showName:boolean;freePlacement:boolean}){
 const groupRef=useRef<THREE.Group>(null)
 const [mode,setMode]=useState<'translate'|'rotate'>('translate')
 const [transformObject,setTransformObject]=useState<THREE.Group|null>(null)
 const d=dims(p)
 const pivot=[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,p.z*S] as [number,number,number]
 const syncTransform=()=>{
  const g=groupRef.current
  if(!g)return
  const deg=((Math.round((g.rotation.z*180/Math.PI)/90)*90)%360+360)%360
  const rd=dims({...p,rotation:deg})
  const x=Math.round((g.position.x/S-rd.length/2+container.length/2)/10)*10
  const y=Math.round((g.position.y/S-rd.width/2+container.width/2)/10)*10
  const z=Math.max(0,Math.round((g.position.z/S)/10)*10)
  onMove(p.id,x,y,z)
  onRotate(p.id,deg)
 }
 useEffect(()=>{
  if(!selected||!freePlacement)return
  const onKey=(e:KeyboardEvent)=>{
   if(e.ctrlKey||e.altKey||e.metaKey)return
   const tag=(e.target as HTMLElement | null)?.tagName
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return
   if(e.key.toLowerCase()==='g'){e.preventDefault();setMode('translate')}
   if(e.key.toLowerCase()==='r'){e.preventDefault();setMode('rotate')}
   if(e.key==='Escape'){onSelect()}
  }
  window.addEventListener('keydown',onKey)
  return()=>window.removeEventListener('keydown',onKey)
 },[selected,freePlacement,onSelect])
 useEffect(()=>{ if(groupRef.current) setTransformObject(groupRef.current) },[])
 const handleControlDown=()=>onDragState(true)
 const handleControlUp=()=>{onDragState(false);syncTransform()}
 const highlight=selected
 return <group ref={groupRef} position={pivot} rotation={[0,0,p.rotation*Math.PI/180]}
   onPointerOver={e=>e.stopPropagation()} onPointerOut={e=>e.stopPropagation()}
   onClick={e=>{e.stopPropagation();onSelect()}}>
   <CargoModel p={{...p,x:0,y:0,z:0} as PlacedCargo} container={container} selected={highlight} onPointerDown={e=>{e.stopPropagation();onSelect()}} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect()}} showName={showName} local/>
   {selected&&freePlacement&&transformObject&&<TransformControls
     object={transformObject}
     mode={mode}
     size={.82}
     showX showY showZ showRX showRY showRZ
     translationSnap={S*10}
     rotationSnap={Math.PI/2}
     onMouseDown={handleControlDown}
     onMouseUp={handleControlUp}
   />}
   {selected&&freePlacement&&<Html position={[0,0,p.height*S+.16]} center><div className="transform-mode-hint">{mode==='translate'?'G 移动  ·  R 旋转':'R 旋转  ·  G 移动'} · 90°</div></Html>}
 </group>
}
function ZonePlate({container,side,label,detail}:{container:Container;side:-1|1;label:string;detail:string}){
 const L=container.length*S
 const y=side*(container.width*S/2+11.55)
 return <group position={[0,y,0.018]}>
  <mesh rotation={[-0.0,0,0]}><boxGeometry args={[L,2.55,.035]}/><meshStandardMaterial color="#b8b1a3" roughness={.94}/></mesh>
  <Line points={[[-L/2,-1.2,0.022],[L/2,-1.2,0.022],[L/2,1.2,0.022],[-L/2,1.2,0.022],[-L/2,-1.2,0.022]]} color="#7f776b" lineWidth={1}/>
  <Html position={[-L/2+.35,-1.05,.08]} center><div className="scene-zone-label"><b>{label}</b><span>{detail}</span></div></Html>
 </group>
}

function OverflowZone({container,count,items,lang}:{container:Container;count:number;items:PlacedCargo[];lang:'zh'|'en'}){
 if(count<=0)return null
 const zoneY=-(container.width*S/2+11.55)
 return <group>
  <ZonePlate container={container} side={-1} label={lang==='zh'?'溢出货物区':'OVERFLOW CARGO'} detail={lang==='zh'?`${count} 件未装载`:`${count} unplaced`}/>
  {items.map(p=><group key={p.id} position={[(p.x+p.length/2-container.length/2)*S,(p.y+p.width/2-container.width/2)*S,p.z*S]} rotation={[0,0,p.rotation*Math.PI/180]}><CargoModel p={{...p,x:0,y:0,z:0} as PlacedCargo} container={container} selected={false} onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} showName={false} local/></group>)}
  {count>items.length&&<Html position={[0,zoneY,.14]} center><div className="overflow-more">+{count-items.length}</div></Html>}
 </group>
}
function SecuringZone({container,lang}:{container:Container;lang:'zh'|'en'}){
 return <ZonePlate container={container} side={1} label={lang==='zh'?'加固材料区':'SECURING MATERIALS'} detail={lang==='zh'?'从这里拖入柜内':'Drag into container'}/>
}

function Scene(props:{container:Container;items:PlacedCargo[];materials:SecuringItem[];selectedId:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onRotate:(id:string,rotation:number)=>void;onRotateMaterial:(id:string,rotation:number)=>void;onMaterialMove:(id:string,x:number,y:number)=>void;view:View;dragging:boolean;onDragState:(v:boolean)=>void;cameraQuaternion:React.MutableRefObject<THREE.Quaternion>;cargo:Cargo[];lang:'zh'|'en';freePlacement:boolean;overflowCount:number;overflowItems:PlacedCargo[];lowPower:boolean;showDimensions:boolean;airBagStretch:boolean}){
 const {container,items,materials,selectedId,onSelect,selectedMaterialId,onSelectMaterial,onMove,onRotate,onRotateMaterial,onMaterialMove,view,dragging,onDragState,cameraQuaternion,cargo,lang,freePlacement,overflowCount,overflowItems,showDimensions,airBagStretch}=props
 const isLowPower = props.lowPower
 return <>
  <Sky distance={450} sunPosition={[5,2,10]} turbidity={3.2} rayleigh={0.65} mieCoefficient={0.0018} mieDirectionalG={0.72}/>
  {!isLowPower&&<Stars radius={120} depth={70} count={isLowPower?260:1300} factor={isLowPower?.7:1.25} saturation={0} fade speed={.08}/>} 
  <fog attach="fog" args={['#252b2c',24,60]}/>
  <ambientLight intensity={isLowPower?1.35:1.65}/><directionalLight position={[6,8,12]} intensity={isLowPower?1.1:1.55} castShadow={!isLowPower}/>
  <ContainerStructure container={container} lang={lang} showDimensions={showDimensions}/><ContainerFloor container={container}/><LashingPoints container={container}/><CoordinateAxes container={container} lang={lang}/>
  <OverflowZone container={container} count={overflowCount} items={overflowItems} lang={lang}/><SecuringZone container={container} lang={lang}/>
  {items.map(p=><CargoInteraction key={p.id} p={p} container={container} selected={p.id===selectedId} onSelect={()=>onSelect(p.id)} onMove={onMove} onRotate={onRotate} onDragState={onDragState} showName={!!cargo.find(c=>c.id===p.cargoId)?.showName} freePlacement={freePlacement}/>)}
  {materials.map(m=><SecuringModel key={m.id} item={m} container={container} selected={m.id===selectedMaterialId} onSelect={()=>onSelectMaterial(m.id)} onMove={onMaterialMove} onRotate={onRotateMaterial} onDragState={onDragState} airBagStretch={airBagStretch}/>) }
  <CameraRig view={view} container={container} dragging={dragging} cameraQuaternion={cameraQuaternion}/>
 </>
}

function WebGLGate({children}:{children:React.ReactNode}) {
 const [ok,setOk]=useState<boolean | null>(null)
 useEffect(()=>{
  try { const canvas=document.createElement('canvas'); const gl=canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); setOk(!!gl) } catch { setOk(false) }
 },[])
 if(ok===null)return <div className="webgl-fallback"><b>INITIALIZING 3D SYSTEM</b><span>正在检测图形设备…</span></div>
 if(!ok)return <div className="webgl-fallback"><b>3D SYSTEM UNAVAILABLE</b><span>当前设备或浏览器无法提供 WebGL。装载数据仍可继续查看。</span></div>
 return <>{children}</>
}

export default function ContainerScene(props:{container:Container;items:PlacedCargo[];materials:SecuringItem[];selectedId:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,x:number,y:number,z:number)=>void;onRotate:(id:string,rotation:number)=>void;onRotateMaterial:(id:string,rotation:number)=>void;onMaterialMove:(id:string,x:number,y:number)=>void;view:View;dragging:boolean;onDragState:(v:boolean)=>void;onView:(v:View)=>void;cargo:Cargo[];lang:'zh'|'en';freePlacement:boolean;overflowCount:number;overflowItems:PlacedCargo[];lowPower?:boolean;showDimensions:boolean;airBagStretch:boolean}){
 const lowPower=props.lowPower??false
 const cameraQuaternion=useRef(new THREE.Quaternion())
 const [selectedMaterialId,setSelectedMaterialId]=useState<string|null>(null)
 return <div className="scene-host"><WebGLGate><Canvas dpr={lowPower?1:[1,1.35]} shadows={!lowPower} frameloop="always" gl={{antialias:!lowPower,powerPreference:lowPower?'low-power':'high-performance',failIfMajorPerformanceCaveat:false}} camera={{position:[7,7,5],fov:42}} onPointerMissed={()=>{props.onSelect(null);setSelectedMaterialId(null)}}><Scene {...props} selectedMaterialId={selectedMaterialId} onSelectMaterial={setSelectedMaterialId} lowPower={lowPower} cameraQuaternion={cameraQuaternion}/></Canvas></WebGLGate></div>
}
