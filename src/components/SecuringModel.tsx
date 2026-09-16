import { TransformControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'

const S=.001

function Rope({a,b,radius=.002,color='#3d4543'}:{a:THREE.Vector3;b:THREE.Vector3;radius?:number;color?:string}){
 const mid=useMemo(()=>a.clone().add(b).multiplyScalar(.5),[a,b])
 const len=useMemo(()=>a.distanceTo(b),[a,b])
 const q=useMemo(()=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()),[a,b])
 return <mesh position={mid} quaternion={q}><cylinderGeometry args={[radius,radius,len,8]}/><meshStandardMaterial color={color} roughness={.72}/></mesh>
}

export default function SecuringModel({item,container,selected,onSelect,onMove,onRotate,onDragState,airBagStretch=true}:{item:SecuringItem;container:Container;selected:boolean;onSelect:()=>void;onMove:(id:string,x:number,y:number)=>void;onRotate:(id:string,rotation:number)=>void;onDragState:(v:boolean)=>void;airBagStretch?:boolean}){
 const ref=useRef<THREE.Group>(null)
 const [mode,setMode]=useState<'translate'|'rotate'>('translate')
 const center=[(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S] as [number,number,number]
 const sync=()=>{if(!ref.current)return;const r=((Math.round((ref.current.rotation.z*180/Math.PI)/90)*90)%360+360)%360;const x=Math.round((ref.current.position.x/S-item.length/2+container.length/2)/10)*10;const y=Math.round((ref.current.position.y/S-item.width/2+container.width/2)/10)*10;onMove(item.id,x,y);onRotate(item.id,r)}
 useEffect(()=>{
  if(!selected)return
  const onKey=(e:KeyboardEvent)=>{
   if(e.ctrlKey||e.altKey||e.metaKey)return
   const tag=(e.target as HTMLElement | null)?.tagName
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return
   if(e.key.toLowerCase()==='g'){e.preventDefault();setMode('translate')}
   if(e.key.toLowerCase()==='r'){e.preventDefault();setMode('rotate')}
  }
  window.addEventListener('keydown',onKey)
  return()=>window.removeEventListener('keydown',onKey)
 },[selected])
 const highlight=selected
 let body:ReactNode
 if(item.type==='triangleWood'){
  const L=item.length*S,W=item.width*S,H=item.height*S
  const shape=new THREE.Shape();shape.moveTo(-L/2,0);shape.lineTo(L/2,0);shape.lineTo(0,H);shape.closePath()
  body=<mesh position={[0,-W/2,-H/2]} rotation={[Math.PI/2,0,0]} castShadow><extrudeGeometry args={[shape,{depth:W,bevelEnabled:false}]}/><meshStandardMaterial color={highlight?'#d58a42':'#9b6738'} roughness={.86}/></mesh>
 } else if(item.type==='airBag'){
  const stretch=airBagStretch?1.08:1
  const L=item.length*S,W=item.width*S,H=item.height*S
  const skin=highlight?'#f1dda8':'#dcc793'
  body=<group scale={[stretch,stretch,stretch]}>
   <mesh castShadow scale={[L*.47,W*.47,H*.47]}><sphereGeometry args={[1,32,20]}/><meshStandardMaterial color={skin} roughness={.55}/></mesh>
   <mesh position={[L*.24,0,0]} castShadow scale={[L*.29,W*.43,H*.42]}><sphereGeometry args={[1,28,18]}/><meshStandardMaterial color={skin} roughness={.56}/></mesh>
   <mesh position={[-L*.24,0,0]} castShadow scale={[L*.29,W*.43,H*.42]}><sphereGeometry args={[1,28,18]}/><meshStandardMaterial color={skin} roughness={.56}/></mesh>
   <mesh position={[0,0,H*.39]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[Math.min(.035,W*.08),Math.min(.045,W*.10),Math.min(.16,L*.14),10]}/><meshStandardMaterial color="#8b7750" roughness={.7}/></mesh>
   <mesh position={[0,-W*.43,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[Math.min(.08,L*.07),.012,10,24]}/><meshStandardMaterial color="#8b7750"/></mesh>
  </group>
 } else if(item.type==='doorNet'){
  const w=item.width*S,h=item.height*S,cols=10,rows=10;const ropes:ReactNode[]=[]
  for(let i=0;i<=cols;i++){const x=-w/2+i*w/cols;ropes.push(<Rope key={'v'+i} a={new THREE.Vector3(-.012,x,-h/2)} b={new THREE.Vector3(-.012,x,h/2)} radius={.002}/>) }
  for(let j=0;j<=rows;j++){const z=-h/2+j*h/rows;ropes.push(<Rope key={'h'+j} a={new THREE.Vector3(-.012,-w/2,z)} b={new THREE.Vector3(-.012,w/2,z)} radius={.002}/>) }
  body=<group>{ropes}</group>
 } else {
  const pts=item.path&&item.path.length>1?item.path.map(q=>new THREE.Vector3((q.x-container.length/2)*S,(q.y-container.width/2)*S,q.z*S)):[new THREE.Vector3(-1.5,0,.04),new THREE.Vector3(0,0,.5),new THREE.Vector3(1.5,0,.04)]
  const curve=new THREE.CatmullRomCurve3(pts);const geo=new THREE.TubeGeometry(curve,24,.002,6,false)
  body=<group><mesh geometry={geo} castShadow><meshStandardMaterial color={highlight?'#e56a45':'#b24b35'} roughness={.55}/></mesh>{[pts[0],pts[pts.length-1]].map((q,i)=><mesh key={i} position={q}><sphereGeometry args={[.018,12,8]}/><meshStandardMaterial color="#343a39" metalness={.6}/></mesh>)}</group>
 }
 return <group ref={ref} position={center} rotation={[0,0,item.rotation*Math.PI/180]} onPointerOver={e=>e.stopPropagation()} onPointerOut={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect()}}>
   <mesh userData={{collisionBody:false,securingBody:true}}><boxGeometry args={[Math.max(item.length,30)*S,Math.max(item.width,30)*S,Math.max(item.height,30)*S]}/><meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false}/></mesh>
   {body}
   {selected&&<TransformControls mode={mode} size={.78} showX showY showZ showRX showRY showRZ translationSnap={S*10} rotationSnap={Math.PI/2} onMouseDown={()=>onDragState(true)} onMouseUp={()=>{onDragState(false);sync()}}/>}
 </group>
}
