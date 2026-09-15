import { useRef,useState } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'
const S=.001
export default function SecuringModel({item,container,onMove,onDragState}:{item:SecuringItem;container:Container;onMove:(id:string,x:number,y:number)=>void;onDragState:(v:boolean)=>void}){
 const [drag,setDrag]=useState(false); const start=useRef({x:0,y:0}); const off=useRef({x:0,y:0}); const plane=useRef(new THREE.Plane(new THREE.Vector3(0,0,1),-item.z*S))
 const center:[number,number,number]=[(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S]
 const hit=(e:any)=>{const v=new THREE.Vector3();plane.current.set(new THREE.Vector3(0,0,1),-item.z*S);return e.ray.intersectPlane(plane.current,v)?v:null}
 const down=(e:any)=>{e.stopPropagation();const p=hit(e);if(!p)return;start.current={x:e.nativeEvent?.offsetX??0,y:e.nativeEvent?.offsetY??0};e.target.setPointerCapture?.(e.pointerId);off.current={x:center[0]-p.x,y:center[1]-p.y};setDrag(true);onDragState(true)}
 const move=(e:any)=>{if(!drag)return;e.stopPropagation();const p=hit(e);if(!p)return;onMove(item.id,Math.round((p.x+off.current.x+item.length*S/2+container.length*S/2)/(S*10))*10,Math.round((p.y+off.current.y+item.width*S/2+container.width*S/2)/(S*10))*10)}
 const up=(e:any)=>{e.stopPropagation();if(drag){setDrag(false);onDragState(false)}e.target.releasePointerCapture?.(e.pointerId)}
 const common={onPointerDown:down,onPointerMove:move,onPointerUp:up,onClick:(e:any)=>e.stopPropagation()}
 if(item.type==='doorNet') return <group position={center} {...common}><mesh><boxGeometry args={[.025,item.width*S,item.height*S]}/><meshStandardMaterial color="#8b95a2" transparent opacity={.38}/></mesh></group>
 if(item.type==='lashingBelt') return <group position={center} rotation={[0,0,item.rotation*Math.PI/180]} {...common}><mesh><boxGeometry args={[item.length*S,.045,.035]}/><meshStandardMaterial color="#7b2f2f"/></mesh></group>
 if(item.type==='airBag') return <group position={center} {...common}><mesh><boxGeometry args={[item.length*S,item.width*S,item.height*S]}/><meshStandardMaterial color="#c8b97a" transparent opacity={.65}/></mesh></group>
 return <group position={center} rotation={[0,0,item.rotation*Math.PI/180]} {...common}><mesh position={[0,0,item.height*S/2]}><coneGeometry args={[item.width*S*.7,item.height*S,4]}/><meshStandardMaterial color="#9b6b3f"/></mesh></group>
}
