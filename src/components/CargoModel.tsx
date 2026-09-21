import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo } from 'react'

const S = .001
const VISUAL_GAP = 4

function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false,hovered=false}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean;hovered?:boolean}) {
  const d = dims(p)
  const pos:[number,number,number] = local ? [0,0,0] : [(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]
  const mainColor = selected ? '#f2c94c' : hovered ? '#ffd166' : p.color
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const dl = Math.max(40,d.length-VISUAL_GAP*2)
  const dw = Math.max(40,d.width-VISUAL_GAP*2)

  /* Keep the visual model's bottom/top exactly on the cargo bounding box.
     The visual gap is horizontal only; shortening Z was the cause of floating layers. */
  const palletBaseH = pallet ? Math.min(145,Math.max(90,p.height*.12)) : 0
  const bodyH = pallet ? Math.max(40,p.height-palletBaseH) : Math.max(40,p.height)

  return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]}>
    <mesh userData={{collisionBody:false,hitBox:true,cargoId:p.id}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}>
      <boxGeometry args={[Math.max(d.length,30)*S,Math.max(d.width,30)*S,Math.max(p.height,30)*S]}/>
      <meshBasicMaterial transparent opacity={0} depthWrite={false}/>
    </mesh>

    {pallet ? <>
      <group position={[0,0,-p.height*S/2+palletBaseH*S/2]}>
        <mesh><boxGeometry args={[dl*S,dw*S,palletBaseH*S*.18]}/><meshStandardMaterial color="#b57b45" roughness={.86}/></mesh>
        {[-1,0,1].map(i=><mesh key={`deck-${i}`} position={[0,i*dw*S*.30,palletBaseH*S*.22]}><boxGeometry args={[dl*S,dw*S*.16,palletBaseH*S*.25]}/><meshStandardMaterial color="#8a5a32" roughness={.86}/></mesh>)}
        {[-.34,0,.34].map(i=><mesh key={`runner-${i}`} position={[i*dl*S,0,-palletBaseH*S*.16]}><boxGeometry args={[Math.max(70,dl*.13)*S,dw*S*.82,palletBaseH*S*.50]}/><meshStandardMaterial color="#76502f" roughness={.88}/></mesh>)}
        {[-.42,0,.42].map(i=><mesh key={`foot-${i}`} position={[i*dl*S,0,-palletBaseH*S*.46]}><boxGeometry args={[Math.max(55,dl*.10)*S,dw*S*.76,palletBaseH*S*.18]}/><meshStandardMaterial color="#69472b" roughness={.9}/></mesh>)}
      </group>
      <mesh position={[0,0,palletBaseH*S/2]}><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.68}/></mesh>
    </> : crate ? <>
      <mesh><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color="#9a6638" roughness={.82}/></mesh>
      {[-.42,-.14,.14,.42].map((t,i)=><mesh key={`sx${i}`} position={[0,t*dw*S,0]}><boxGeometry args={[dl*S*.98,Math.max(18,dw*.055)*S,bodyH*S*1.02]}/><meshStandardMaterial color="#c08a52" roughness={.84}/></mesh>)}
      {[-.44,0,.44].map((t,i)=><mesh key={`sz${i}`} position={[t*dl*S,0,0]}><boxGeometry args={[Math.max(18,dl*.055)*S,dw*S*1.01,bodyH*S*1.02]}/><meshStandardMaterial color="#b97d46" roughness={.84}/></mesh>)}
    </> : <>
      <mesh><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.62}/></mesh>
    </>}
    {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

export default memo(CargoModel)
