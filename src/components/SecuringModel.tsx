import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'
import type { SceneTool } from './ContainerScene'
const S=0.001
function Rope({a,b,radius=0.009,color='#68737a'}:{a:THREE.Vector3;b:THREE.Vector3;radius?:number;color?:string}){const mid=a.clone().add(b).multiplyScalar(.5),len=a.distanceTo(b),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return <mesh position={mid} quaternion={q} raycast={()=>null}><cylinderGeometry args={[radius,radius,len,8]}/><meshStandardMaterial color={color} roughness={.7}/></mesh>}
export default function SecuringModel({item,container,selected,onSelect,registerRef,local=false}:{item:SecuringItem;container:Container;selected:boolean;onSelect:()=>void;registerRef?:(id:string,obj:THREE.Group|null)=>void;onMove?:(id:string,x:number,y:number)=>void;onRotate?:(id:string,rotation:number)=>void;onScale?:(id:string,factor:number)=>void;onDragState?:(v:boolean)=>void;airBagStretch?:boolean;focusMode?:boolean;tool?:SceneTool;local?:boolean}){
 const center:[number,number,number]=local?[0,0,0]:[(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S]
 let body:ReactNode
 const mat=(color:string)=><meshStandardMaterial color={selected?'#f4a23b':color} roughness={.58} metalness={.08}/>
 if(item.type==='triangleWood'){
  const L=item.length*S,W=item.width*S,H=item.height*S
  const shape=new THREE.Shape();shape.moveTo(-L/2,0);shape.lineTo(L/2,0);shape.lineTo(-L/2,H);shape.closePath()
  body=<mesh position={[0,-W/2,-H/2]} rotation={[Math.PI/2,0,0]}><extrudeGeometry args={[shape,{depth:W,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:2}]}/>{mat('#3979b8')}</mesh>
 }else if(item.type==='airBag'){
  const L=item.length*S,W=Math.max(100,item.width)*S,H=Math.min(260,item.height)*S
  body=<group><mesh scale={[L*.46,W*.34,H*.32]}><sphereGeometry args={[1,20,12]}/>{mat('#3fa36b')}</mesh><mesh position={[L*.27,0,0]} scale={[L*.25,W*.31,H*.28]}><sphereGeometry args={[1,18,10]}/>{mat('#3fa36b')}</mesh><mesh position={[-L*.27,0,0]} scale={[L*.25,W*.31,H*.28]}><sphereGeometry args={[1,18,10]}/>{mat('#3fa36b')}</mesh></group>
 }else if(item.type==='doorNet'){
  const w=Math.max(30,item.width)*S,h=Math.max(30,item.height)*S,cols=16,rows=12,ropes:ReactNode[]=[]
  for(let i=0;i<=cols;i++){const x=-w/2+i*w/cols;ropes.push(<Rope key={'v'+i} a={new THREE.Vector3(0,x,-h/2)} b={new THREE.Vector3(0,x,h/2)} radius={.012} color="#737b82"/>)}
  for(let j=0;j<=rows;j++){const z=-h/2+j*h/rows;ropes.push(<Rope key={'h'+j} a={new THREE.Vector3(0,-w/2,z)} b={new THREE.Vector3(0,w/2,z)} radius={.012} color="#737b82"/>)}
  body=<group>{ropes}</group>
 }else{
  const pts=item.path&&item.path.length>1?item.path.map(q=>new THREE.Vector3((q.x-container.length/2)*S,(q.y-container.width/2)*S,q.z*S)):[new THREE.Vector3(-1.5,0,.05),new THREE.Vector3(0,0,.5),new THREE.Vector3(1.5,0,.05)]
  const curve=new THREE.CatmullRomCurve3(pts);body=<mesh geometry={new THREE.TubeGeometry(curve,20,.010,8,false)}><meshStandardMaterial color={selected?'#ff7b55':'#e86d43'} roughness={.45}/></mesh>
 }
 const hitW=Math.max(item.length,Math.max(item.width,300)),hitH=Math.max(item.height,180)
 return <group ref={g=>registerRef?.(item.id,g)} position={center} rotation={[0,0,item.rotation*Math.PI/180]} onPointerDown={e=>{e.stopPropagation();onSelect()}} onClick={e=>{e.stopPropagation();onSelect()}}>
  <mesh userData={{collisionBody:false,securingBody:true}} raycast={(raycaster,intersects)=>{const o=raycaster.intersectObject((raycaster as any).object,true);if(o.length)intersects.push(o[0])}}><boxGeometry args={[hitW*S,Math.max(item.width,300)*S,hitH*S]}/><meshBasicMaterial transparent opacity={0.001} depthWrite={false}/></mesh>
  {body}
 </group>
}
