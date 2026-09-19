import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'
import type { SceneTool } from './ContainerScene'

const S=.001
function Rope({a,b,radius=.009,color='#4a4a4a'}:{a:THREE.Vector3;b:THREE.Vector3;radius?:number;color?:string}){const mid=a.clone().add(b).multiplyScalar(.5),len=a.distanceTo(b),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return <mesh position={mid} quaternion={q}><cylinderGeometry args={[radius,radius,len,8]}/><meshStandardMaterial color={color} roughness={.65}/></mesh>}
export default function SecuringModel({item,container,selected,onSelect,registerRef,tool='move'}:{item:SecuringItem;container:Container;selected:boolean;onSelect:()=>void;registerRef?:(id:string,obj:THREE.Group|null)=>void;onMove:(id:string,x:number,y:number)=>void;onRotate:(id:string,rotation:number)=>void;onScale:(id:string,factor:number)=>void;onDragState:(v:boolean)=>void;airBagStretch?:boolean;focusMode?:boolean;tool?:SceneTool}){
 const center:[number,number,number]=[(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S]
 let body:ReactNode
 if(item.type==='triangleWood'){
  const L=item.length*S,W=item.width*S,H=item.height*S;const shape=new THREE.Shape();shape.moveTo(-L/2,0);shape.lineTo(L/2,0);shape.lineTo(-L/2,H);shape.closePath();body=<mesh position={[0,-W/2,-H/2]} rotation={[Math.PI/2,0,0]}><extrudeGeometry args={[shape,{depth:W,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1}]}/><meshStandardMaterial color={selected?'#f0b35d':'#a86d3e'} roughness={.82}/></mesh>
 } else if(item.type==='airBag'){
  const L=item.length*S,W=Math.max(120,item.width)*S,H=Math.min(500,item.height)*S;body=<group><mesh scale={[L*.46,W*.34,H*.32]}><sphereGeometry args={[1,18,10]}/><meshStandardMaterial color={selected?'#f0d08a':'#d8b978'} roughness={.5}/></mesh><mesh position={[L*.27,0,0]} scale={[L*.25,W*.31,H*.28]}><sphereGeometry args={[1,16,10]}/><meshStandardMaterial color={selected?'#f0d08a':'#d8b978'} roughness={.5}/></mesh><mesh position={[-L*.27,0,0]} scale={[L*.25,W*.31,H*.28]}><sphereGeometry args={[1,16,10]}/><meshStandardMaterial color={selected?'#f0d08a':'#d8b978'} roughness={.5}/></mesh></group>
 } else if(item.type==='doorNet'){
  const w=item.width*S,h=item.height*S,cols=16,rows=12,ropes:ReactNode[]=[];for(let i=0;i<=cols;i++){const x=-w/2+i*w/cols;ropes.push(<Rope key={`v${i}`} a={new THREE.Vector3(0,x,-h/2)} b={new THREE.Vector3(0,x,h/2)} radius={.012} color="#68757c"/>)}for(let j=0;j<=rows;j++){const z=-h/2+j*h/rows;ropes.push(<Rope key={`h${j}`} a={new THREE.Vector3(0,-w/2,z)} b={new THREE.Vector3(0,w/2,z)} radius={.012} color="#68757c"/>)}body=<group>{ropes}</group>
 } else {
  const pts=item.path&&item.path.length>1?item.path.map(q=>new THREE.Vector3((q.x-container.length/2)*S,(q.y-container.width/2)*S,q.z*S)):[new THREE.Vector3(-1.5,0,.05),new THREE.Vector3(0,0,.5),new THREE.Vector3(1.5,0,.05)];const curve=new THREE.CatmullRomCurve3(pts);body=<mesh geometry={new THREE.TubeGeometry(curve,16,.008,8,false)}><meshStandardMaterial color={selected?'#f06a42':'#b64d35'} roughness={.5}/></mesh>
 }
 return <group ref={g=>registerRef?.(item.id,g)} position={center} rotation={[0,0,item.rotation*Math.PI/180]} onPointerDown={e=>{e.stopPropagation();onSelect()}} onClick={e=>{e.stopPropagation();onSelect()}}>
  <mesh userData={{collisionBody:false,securingBody:true}}><boxGeometry args={[Math.max(item.length,260)*S,Math.max(item.width,260)*S,Math.max(item.height,140)*S]}/><meshBasicMaterial transparent opacity={0}/></mesh>
  {body}
 </group>
}
