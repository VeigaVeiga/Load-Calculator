import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const dark = '#17191a'
const metal = '#c9ced0'
const metalDark = '#747a7d'
const floor = '#b8bdbe'
const accent = '#d7d9d8'

function PaperWorker({ position, scale = 1, phase = 0, flip = false }: { position: [number, number, number]; scale?: number; phase?: number; flip?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const head = useMemo(() => new THREE.Shape().absarc(0, 0, 0.15, 0, Math.PI * 2, false), [])
  const torso = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-.16,0); s.lineTo(.16,0); s.lineTo(.13,.43); s.lineTo(-.13,.43); s.closePath(); return s }, [])
  const limb = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-.035,0); s.lineTo(.035,0); s.lineTo(.045,.34); s.lineTo(-.045,.34); s.closePath(); return s }, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const walk = Math.sin(t * 2.2) * 0.24
    if (root.current) root.current.position.z = position[2] + Math.abs(Math.sin(t * 2.2)) * 0.025
    if (arm.current) arm.current.rotation.y = walk * .8
    if (legL.current) legL.current.rotation.y = walk
    if (legR.current) legR.current.rotation.y = -walk
  })
  const Paper = ({ shape, pos, rot = [Math.PI / 2,0,0] as [number,number,number] }: { shape: THREE.Shape; pos: [number,number,number]; rot?: [number,number,number] }) => (
    <mesh position={pos} rotation={rot}><shapeGeometry args={[shape]} /><meshBasicMaterial color={dark} side={THREE.DoubleSide} /></mesh>
  )
  return <group ref={root} position={position} scale={scale} rotation={[0, flip ? Math.PI : 0, 0]}>
    <Paper shape={head} pos={[0,0,.72]} />
    <Paper shape={torso} pos={[0,0,.29]} />
    <group ref={arm}>
      <Paper shape={limb} pos={[.18,0,.43]} rot={[Math.PI/2,0,-.25]} />
      <Paper shape={limb} pos={[-.18,0,.43]} rot={[Math.PI/2,0,.25]} />
    </group>
    <group ref={legL}><Paper shape={limb} pos={[.07,0,.02]} /></group>
    <group ref={legR}><Paper shape={limb} pos={[-.07,0,.02]} /></group>
  </group>
}

function Conveyor({ position = [0, 0, 0] as [number, number, number], length = 7, width = 1.15, height = 1.05 }: { position?: [number, number, number]; length?: number; width?: number; height?: number }) {
  const rollers = useMemo(() => Array.from({ length: Math.max(4, Math.floor(length / 0.42)) }, (_, i) => -length / 2 + 0.22 + i * 0.42), [length])
  const refs = useRef<THREE.Mesh[]>([])
  useFrame((_, delta) => refs.current.forEach(r => { if (r) r.rotation.x += delta * 2.2 }))
  return <group position={position}>
    <mesh position={[0,0,height-.12]} receiveShadow><boxGeometry args={[length,width,.18]} /><meshStandardMaterial color={metalDark} roughness={.82} /></mesh>
    {rollers.map((x,i)=><mesh key={i} ref={el=>{if(el)refs.current[i]=el}} position={[x,0,height+.02]} rotation={[0,Math.PI/2,0]}><cylinderGeometry args={[.09,.09,width*.92,12]} /><meshStandardMaterial color={metal} metalness={.55} roughness={.5}/></mesh>)}
    {[-width/2,width/2].map((y,i)=><mesh key={i} position={[0,y,height+.12]}><boxGeometry args={[length,.06,.28]}/><meshStandardMaterial color={accent} metalness={.25} roughness={.6}/></mesh>)}
    {[-length/2+.15,length/2-.15].map((x,i)=><mesh key={i} position={[x,0,height/2]}><boxGeometry args={[.12,width+.05,height]}/><meshStandardMaterial color={metalDark} metalness={.3} roughness={.7}/></mesh>)}
  </group>
}

function Forklift({ position = [0,0,0] as [number,number,number] }) {
  const root=useRef<THREE.Group>(null)
  useFrame(({clock})=>{if(root.current)root.current.position.x=position[0]+Math.sin(clock.elapsedTime*.22)*1.8})
  return <group ref={root} position={position}>
    <mesh position={[0,0,.38]} castShadow><boxGeometry args={[1.05,.72,.55]}/><meshStandardMaterial color="#b8b9b8" roughness={.7}/></mesh>
    <mesh position={[-.25,0,.88]}><boxGeometry args={[.55,.58,.85]}/><meshStandardMaterial color={dark} roughness={.8}/></mesh>
    <mesh position={[.62,0,.62]}><boxGeometry args={[.85,.08,.08]}/><meshStandardMaterial color={metalDark} metalness={.5} roughness={.45}/></mesh>
    <mesh position={[.62,0,.43]}><boxGeometry args={[.85,.08,.08]}/><meshStandardMaterial color={metalDark} metalness={.5} roughness={.45}/></mesh>
    {[-.32,.32].map((y,i)=><mesh key={i} position={[.32,y,.18]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.19,.19,.14,12]}/><meshStandardMaterial color="#303234" roughness={.95}/></mesh>)}
  </group>
}

export default function ApertureLogisticsScene(){
  return <group>
    <mesh position={[0,0,-.06]} receiveShadow><boxGeometry args={[18,9,.12]}/><meshStandardMaterial color={floor} roughness={.92}/></mesh>
    <mesh position={[0,4.15,2.8]}><boxGeometry args={[18,.18,5.6]}/><meshStandardMaterial color="#d4d7d7" roughness={.9}/></mesh>
    {[-7,7].map(x=><group key={x} position={[x,0,2.1]}><mesh><boxGeometry args={[.18,8.2,4.2]}/><meshStandardMaterial color={metalDark} roughness={.85}/></mesh></group>)}
    {[-3.5,0,3.5].map(y=><mesh key={y} position={[0,y,4.95]}><boxGeometry args={[17.5,.12,.12]}/><meshStandardMaterial color="#8c9294" metalness={.35} roughness={.65}/></mesh>)}
    <Conveyor position={[-2.3,2.25,0]} length={7.4}/><Conveyor position={[1.9,-2.2,0]} length={5.2} width={1.05}/>
    <group position={[-5.4,-2.4,0]}>{[0,1,2].map(i=><mesh key={i} position={[0,0,1.1+i*.9]}><boxGeometry args={[1.7,.75,.08]}/><meshStandardMaterial color={metalDark} metalness={.25} roughness={.75}/></mesh>)}<mesh position={[0,0,1.9]}><boxGeometry args={[.08,.85,3.1]}/><meshStandardMaterial color={metalDark}/></mesh><mesh position={[0,0,1.9]}><boxGeometry args={[1.78,.08,3.1]}/><meshStandardMaterial color={metalDark}/></mesh></group>
    <Forklift position={[3.8,1.25,0]}/>
    <PaperWorker position={[-4.4,1.2,0]} scale={1.15} phase={.2}/><PaperWorker position={[4.6,-.7,0]} scale={.95} phase={2.1} flip/><PaperWorker position={[-2.5,-3.15,0]} scale={.82} phase={4.2}/>
  </group>
}
