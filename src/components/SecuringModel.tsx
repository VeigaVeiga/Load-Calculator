import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'
import type { SceneTool } from './ContainerScene'

const S = 0.001

type Props = {
  item: SecuringItem
  container: Container
  selected: boolean
  onSelect?: () => void
  registerRef?: (id: string, obj: THREE.Group | null) => void
  onMove?: (id: string, x: number, y: number) => void
  onRotate?: (id: string, rotation: number) => void
  onScale?: (id: string, factor: number) => void
  onDragState?: (v: boolean) => void
  airBagStretch?: boolean
  focusMode?: boolean
  tool?: SceneTool
  local?: boolean
}

function Rope({a,b,radius=.022,color='#8b8f91'}:{a:THREE.Vector3;b:THREE.Vector3;radius?:number;color?:string}){
  const direction=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5),len=direction.length()
  const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize())
  return <mesh position={mid} quaternion={quaternion} raycast={()=>null}><cylinderGeometry args={[radius,radius,len,8]}/><meshStandardMaterial color={color} roughness={.72}/></mesh>
}

export default function SecuringModel({item,container,selected,registerRef,local=false}:Props){
  const center: [number,number,number]=local?[0,0,0]:[(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S]
  const material=(color:string)=><meshStandardMaterial color={selected?'#f4a23b':color} roughness={.58} metalness={.06}/>
  let body:ReactNode

  if(item.type==='triangleWood'){
    const L=item.length*S,W=item.width*S,H=item.height*S
    const shape=new THREE.Shape();shape.moveTo(-L/2,0);shape.lineTo(L/2,0);shape.lineTo(-L/2,H);shape.closePath()
    body=<group>
      <mesh position={[0,-W/2,-H/2]} rotation={[Math.PI/2,0,0]}><extrudeGeometry args={[shape,{depth:W,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:2}]}/>{material('#3979b8')}</mesh>
      <mesh position={[0,0,-H*.46]} raycast={()=>null}><boxGeometry args={[L*.88,W*.9,H*.035]}/>{material('#2f669e')}</mesh>
    </group>
  }else if(item.type==='airBag'){
    const L=item.length*S,W=Math.max(100,item.width)*S,H=Math.min(220,item.height)*S
    body=<group>
      <mesh scale={[L*.46,W*.34,H*.30]}><sphereGeometry args={[1,16,8]}/>{material('#3fa36b')}</mesh>
      <mesh position={[L*.27,0,0]} scale={[L*.25,W*.30,H*.27]}><sphereGeometry args={[1,14,8]}/>{material('#3fa36b')}</mesh>
      <mesh position={[-L*.27,0,0]} scale={[L*.25,W*.30,H*.27]}><sphereGeometry args={[1,14,8]}/>{material('#3fa36b')}</mesh>
    </group>
  }else if(item.type==='doorNet'){
    const w=Math.max(30,item.width)*S,h=Math.max(30,item.height)*S,cols=18,rows=14,ropes:ReactNode[]=[]
    for(let i=0;i<=cols;i++){const x=-w/2+i*w/cols;ropes.push(<Rope key={`v${i}`} a={new THREE.Vector3(0,x,-h/2)} b={new THREE.Vector3(0,x,h/2)} radius={.026} color={selected?'#f4a23b':'#737b82'}/>)}
    for(let j=0;j<=rows;j++){const z=-h/2+j*h/rows;ropes.push(<Rope key={`h${j}`} a={new THREE.Vector3(0,-w/2,z)} b={new THREE.Vector3(0,w/2,z)} radius={.026} color={selected?'#f4a23b':'#737b82'}/>)}
    body=<group>
      {ropes}
      <mesh position={[0,-w/2,0]} raycast={()=>null}><boxGeometry args={[.035,.035,h]}/><meshStandardMaterial color="#626970"/></mesh>
      <mesh position={[0,w/2,0]} raycast={()=>null}><boxGeometry args={[.035,.035,h]}/><meshStandardMaterial color="#626970"/></mesh>
      <mesh position={[0,0,-h/2]} raycast={()=>null}><boxGeometry args={[.035,w,.035]}/><meshStandardMaterial color="#626970"/></mesh>
      <mesh position={[0,0,h/2]} raycast={()=>null}><boxGeometry args={[.035,w,.035]}/><meshStandardMaterial color="#626970"/></mesh>
    </group>
  }else{
    const points=item.path&&item.path.length>1?item.path.map(q=>new THREE.Vector3((q.x-container.length/2)*S,(q.y-container.width/2)*S,q.z*S)):[new THREE.Vector3(-1.5,0,.05),new THREE.Vector3(0,0,.5),new THREE.Vector3(1.5,0,.05)]
    const curve=new THREE.CatmullRomCurve3(points),geometry=new THREE.TubeGeometry(curve,20,.012,8,false)
    body=<mesh geometry={geometry}><meshStandardMaterial color={selected?'#ff7b55':'#e86d43'} roughness={.45}/></mesh>
  }

  const hitL=Math.max(item.length,360),hitW=Math.max(item.width,360),hitH=Math.max(item.height,220)
  return <group ref={group=>registerRef?.(item.id,group)} position={center} rotation={[0,0,item.rotation*Math.PI/180]} onPointerDown={e=>{e.stopPropagation()}} onClick={e=>{e.stopPropagation()}} onContextMenu={e=>{e.stopPropagation();e.nativeEvent.preventDefault()}}>
    <mesh userData={{collisionBody:false,securingBody:true}}><boxGeometry args={[hitL*S,hitW*S,hitH*S]}/><meshBasicMaterial transparent opacity={0.001} depthWrite={false}/></mesh>
    {body}
  </group>
}
