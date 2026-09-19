import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo } from 'react'
const S=.001,GAP=14
function CargoModel({p,container,selected,onPointerDown,onPointerUp,onPointerMove,onClick,showName=false,local=false,hovered=false}:{p:PlacedCargo;container:Container;selected:boolean;onPointerDown:(e:any)=>void;onPointerUp:(e:any)=>void;onPointerMove:(e:any)=>void;onClick:(e:any)=>void;showName?:boolean;local?:boolean;hovered?:boolean}){
 const d=dims(p),pos:[number,number,number]=local?[0,0,0]:[(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]
 const mainColor=selected?'#f2c94c':hovered?'#ffd166':p.color,crate=p.cargoType==='woodCrate',pallet=p.cargoType==='pallet'
 const dl=Math.max(40,d.length-GAP*2),dw=Math.max(40,d.width-GAP*2),baseH=Math.min(130,Math.max(80,p.height*.10)),bodyH=Math.max(40,p.height-baseH)
 return <group position={pos} rotation={[0,0,local?0:p.rotation*Math.PI/180]}>
  <mesh userData={{collisionBody:false,hitBox:true,cargoId:p.id}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}><boxGeometry args={[Math.max(d.length,30)*S,Math.max(d.width,30)*S,Math.max(p.height,30)*S]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
  {pallet?<><mesh position={[0,0,-p.height*S/2+baseH*S/2]}><boxGeometry args={[dl*S,dw*S,baseH*S]}/><meshStandardMaterial color="#8a5a32" roughness={.86}/></mesh><mesh position={[0,0,-p.height*S/2+baseH*S*.72]}><boxGeometry args={[dl*S,dw*S*.18,baseH*S*.22]}/><meshStandardMaterial color="#b57b45" roughness={.86}/></mesh><mesh position={[0,0,-p.height*S/2+baseH*S*.72]}><boxGeometry args={[dl*S*.18,dw*S,baseH*S*.22]}/><meshStandardMaterial color="#b57b45" roughness={.86}/></mesh><mesh position={[0,0,baseH*S/2]}><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.68}/></mesh></>:crate?<><mesh><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color="#9a6638" roughness={.82}/></mesh>{[-.42,-.14,.14,.42].map((t,i)=><mesh key={`sx${i}`} position={[0,t*dw*S,0]}><boxGeometry args={[dl*S*.98,Math.max(18,dw*.055)*S,bodyH*S*1.02]}/><meshStandardMaterial color="#c08a52" roughness={.84}/></mesh>)}{[-.44,0,.44].map((t,i)=><mesh key={`sz${i}`} position={[t*dl*S,0,0]}><boxGeometry args={[Math.max(18,dl*.055)*S,dw*S*1.01,bodyH*S*1.02]}/><meshStandardMaterial color="#b97d46" roughness={.84}/></mesh>)}</>:<><mesh><boxGeometry args={[dl*S,dw*S,bodyH*S]}/><meshStandardMaterial color={mainColor} roughness={.62}/></mesh><mesh position={[0,0,bodyH*S/2+.002]}><boxGeometry args={[Math.min(dl*.18,180)*S,dw*S+.01,.018]}/><meshStandardMaterial color="#d6bd82" roughness={.8}/></mesh><mesh position={[0,-dw*S/2-.003,0]}><boxGeometry args={[dl*S,.014,bodyH*S*.72]}/><meshStandardMaterial color="#8e6b4e" roughness={.8}/></mesh></>}
  {showName&&<Html position={[0,0,p.height*S/2+.02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
 </group>
}
export default memo(CargoModel)
