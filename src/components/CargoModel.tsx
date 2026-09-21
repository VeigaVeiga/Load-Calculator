import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo } from 'react'

const S = .001
const VISUAL_GAP_XY = 8
const VISUAL_GAP_Z = 8

function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false,hovered=false}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean;hovered?:boolean}) {
  const d = dims(p)
  const visualL = Math.max(40,d.length-VISUAL_GAP_XY*2)
  const visualW = Math.max(40,d.width-VISUAL_GAP_XY*2)
  const visualZGap = local && p.z > 0 ? Math.min(VISUAL_GAP_Z, Math.max(0,p.height-20)) : 0
  const visualH = Math.max(40,p.height-visualZGap)
  const pos:[number,number,number] = local
    ? [0,0,visualZGap*S/2]
    : [(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+(p.height-visualZGap)/2+visualZGap)*S]
  const mainColor = selected ? '#f2c94c' : hovered ? '#ffd166' : p.color
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const palletBaseH = pallet ? Math.min(145,Math.max(90,p.height*.12)) : 0
  const bodyH = pallet ? Math.max(40,visualH-palletBaseH) : visualH
  const eventProps={onPointerDown,onPointerMove,onPointerUp,onClick}
  return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]}>
    {pallet ? <>
      <group position={[0,0,-p.height*S/2+palletBaseH*S/2]}>
        <mesh {...eventProps}><boxGeometry args={[visualL*S,visualW*S,palletBaseH*S*.18]}/><meshStandardMaterial color="#b57b45" roughness={.86}/></mesh>
        {[-1,0,1].map(i=><mesh key={`deck-${i}`} position={[0,i*visualW*S*.30,palletBaseH*S*.22]}><boxGeometry args={[visualL*S,visualW*S*.16,palletBaseH*S*.25]}/><meshStandardMaterial color="#8a5a32" roughness={.86}/></mesh>)}
        {[-.34,0,.34].map(i=><mesh key={`runner-${i}`} position={[i*visualL*S,0,-palletBaseH*S*.16]}><boxGeometry args={[Math.max(70,visualL*.13)*S,visualW*S*.82,palletBaseH*S*.50]}/><meshStandardMaterial color="#76502f" roughness={.88}/></mesh>)}
        {[-.42,0,.42].map(i=><mesh key={`foot-${i}`} position={[i*visualL*S,0,-palletBaseH*S*.46]}><boxGeometry args={[Math.max(55,visualL*.10)*S,visualW*S*.76,palletBaseH*S*.18]}/><meshStandardMaterial color="#69472b" roughness={.9}/></mesh>)}
      </group>
      <mesh position={[0,0,palletBaseH*S/2]} {...eventProps}><boxGeometry args={[visualL*S,visualW*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.68}/></mesh>
    </> : crate ? <>
      <mesh {...eventProps}><boxGeometry args={[visualL*S,visualW*S,bodyH*S]}/><meshStandardMaterial color="#9a6638" roughness={.82}/></mesh>
      {[-.42,-.14,.14,.42].map((t,i)=><mesh key={`sx${i}`} position={[0,t*visualW*S,0]}><boxGeometry args={[visualL*S*.98,Math.max(18,visualW*.055)*S,bodyH*S*1.02]}/><meshStandardMaterial color="#c08a52" roughness={.84}/></mesh>)}
      {[-.44,0,.44].map((t,i)=><mesh key={`sz${i}`} position={[t*visualL*S,0,0]}><boxGeometry args={[Math.max(18,visualL*.055)*S,visualW*S*1.01,bodyH*S*1.02]}/><meshStandardMaterial color="#b97d46" roughness={.84}/></mesh>)}
    </> : <mesh {...eventProps}><boxGeometry args={[visualL*S,visualW*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.62}/></mesh>}
    {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

export default memo(CargoModel)
