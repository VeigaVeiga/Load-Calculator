import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const ink = '#15191a'
const white = '#e5e8e8'
const white2 = '#cfd4d4'
const steel = '#737a7c'
const steel2 = '#9aa1a2'
const floor = '#b7bdbe'
const warning = '#c59a55'

function PaperWorker({ position, scale = 1, phase = 0, flip = false }: { position: [number, number, number]; scale?: number; phase?: number; flip?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const head = useMemo(() => new THREE.Shape().absarc(0, 0, 0.14, 0, Math.PI * 2, false), [])
  const torso = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-.17,0); s.lineTo(.17,0); s.lineTo(.13,.45); s.lineTo(-.13,.45); s.closePath(); return s }, [])
  const limb = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-.035,0); s.lineTo(.035,0); s.lineTo(.045,.32); s.lineTo(-.045,.32); s.closePath(); return s }, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const walk = Math.sin(t * 2.15) * .28
    const idle = Math.sin(t * .9 + phase) * .08
    if (root.current) {
      root.current.position.z = position[2] + Math.abs(Math.sin(t * 2.15)) * .018
      root.current.rotation.z = idle * .35
    }
    if (armL.current) armL.current.rotation.y = walk * .7
    if (armR.current) armR.current.rotation.y = -walk * .55
    if (legL.current) legL.current.rotation.y = walk
    if (legR.current) legR.current.rotation.y = -walk
  })
  const Paper = ({ shape, pos, rot = [Math.PI / 2, 0, 0] as [number,number,number] }: { shape: THREE.Shape; pos: [number,number,number]; rot?: [number,number,number] }) => (
    <mesh position={pos} rotation={rot}><shapeGeometry args={[shape]} /><meshBasicMaterial color={ink} side={THREE.DoubleSide} /></mesh>
  )
  return <group ref={root} position={position} scale={scale} rotation={[0, flip ? Math.PI : 0, 0]}>
    <Paper shape={head} pos={[0,0,.73]} />
    <Paper shape={torso} pos={[0,0,.29]} />
    <group ref={armL}><Paper shape={limb} pos={[.18,0,.43]} rot={[Math.PI/2,0,-.3]} /></group>
    <group ref={armR}><Paper shape={limb} pos={[-.18,0,.43]} rot={[Math.PI/2,0,.3]} /></group>
    <group ref={legL}><Paper shape={limb} pos={[.07,0,.02]} /></group>
    <group ref={legR}><Paper shape={limb} pos={[-.07,0,.02]} /></group>
  </group>
}

function Panel({ position, size, color = white, metalness = .08 }: { position: [number,number,number]; size: [number,number,number]; color?: string; metalness?: number }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} metalness={metalness} roughness={.72} /></mesh>
}

function FloorMark({ position, length, width = .055, rotation = 0, color = warning }: { position: [number,number,number]; length: number; width?: number; rotation?: number; color?: string }) {
  return <mesh position={position} rotation={[-Math.PI/2,0,rotation]}><planeGeometry args={[length,width]} /><meshBasicMaterial color={color} transparent opacity={.82} /></mesh>
}

function Conveyor({ position = [0,0,0] as [number,number,number], length = 6.5, width = 1.1, height = .88, phase = 0 }: { position?: [number,number,number]; length?: number; width?: number; height?: number; phase?: number }) {
  const rollers = useMemo(() => Array.from({ length: Math.max(6, Math.floor(length / .38)) }, (_, i) => -length/2 + .2 + i*.38), [length])
  const refs = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    refs.current.forEach((r,i) => { if (r) r.rotation.x = t * 3.2 + i * .05 })
  })
  return <group position={position}>
    <Panel position={[0,0,height-.09]} size={[length,width,.18]} color="#555c5e" metalness={.4} />
    {rollers.map((x,i)=><mesh key={i} ref={el=>{if(el) refs.current[i]=el}} position={[x,0,height+.025]} rotation={[0,Math.PI/2,0]}><cylinderGeometry args={[.085,.085,width*.91,12]} /><meshStandardMaterial color={steel2} metalness={.65} roughness={.4}/></mesh>)}
    {[-width/2,width/2].map((y,i)=><Panel key={i} position={[0,y,height+.12]} size={[length,.055,.28]} color="#e0e3e2" metalness={.25} />)}
    {[-length/2+.16,length/2-.16].map((x,i)=><Panel key={i} position={[x,0,height/2]} size={[.13,width+.06,height]} color={steel} metalness={.3} />)}
    <Panel position={[-length/2+.42,0,height-.31]} size={[.55,width+.2,.12]} color="#34393a" metalness={.5}/>
  </group>
}

function CargoUnit({ position, size = [.55,.42,.42], tint = '#c6c0b3' }: { position: [number,number,number]; size?: [number,number,number]; tint?: string }) {
  return <group position={position}>
    <Panel position={[0,0,size[2]/2+.02]} size={size} color={tint} metalness={.02} />
    <Panel position={[0,0,size[2]+.035]} size={[size[0]*.72,size[1]*.08,.018]} color="#8c9292" />
    <Panel position={[0,-size[1]/2-.01,size[2]/2]} size={[size[0]*.72,.018,size[2]*.72]} color="#9da3a3" />
  </group>
}

function Forklift({ position = [0,0,0] as [number,number,number] }) {
  const root = useRef<THREE.Group>(null)
  useFrame(({clock}) => {
    if (!root.current) return
    root.current.position.x = position[0] + Math.sin(clock.elapsedTime*.22)*1.35
  })
  return <group ref={root} position={position}>
    <Panel position={[0,0,.33]} size={[1.12,.72,.48]} color="#b39b61" />
    <Panel position={[-.22,0,.78]} size={[.48,.58,.76]} color="#3a4041" />
    <Panel position={[.08,0,.93]} size={[.58,.46,.07]} color="#d6d8d6" />
    <Panel position={[.66,0,.58]} size={[.82,.075,.075]} color="#4f5657" metalness={.6}/>
    <Panel position={[.66,0,.39]} size={[.82,.075,.075]} color="#4f5657" metalness={.6}/>
    {[-.31,.31].map((y,i)=><mesh key={i} position={[.31,y,.17]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.18,.18,.15,14]}/><meshStandardMaterial color="#292d2e" roughness={.95}/></mesh>)}
  </group>
}

function Shelf({ position }: { position: [number,number,number] }) {
  return <group position={position}>
    {[.7,1.5,2.3].map((z,i)=><Panel key={i} position={[0,0,z]} size={[2.1,.72,.08]} color="#8a9091" metalness={.3}/>) }
    {[-1,1].map((x,i)=><Panel key={i} position={[x,0,1.5]} size={[.08,.78,3.05]} color="#6e7576" metalness={.45}/>) }
    <CargoUnit position={[-.48,-.05,.74]} size={[.62,.45,.42]} tint="#c7c1b5" />
    <CargoUnit position={[.35,.04,1.54]} size={[.54,.42,.52]} tint="#bfc6c5" />
    <CargoUnit position={[-.35,.02,2.34]} size={[.7,.46,.38]} tint="#d1c8b8" />
  </group>
}

function CeilingLight({ position }: { position: [number,number,number] }) {
  return <group position={position}>
    <Panel position={[0,0,0]} size={[1.55,.25,.05]} color="#f1f2ef" />
    <mesh position={[0,0,-.035]}><boxGeometry args={[1.15,.18,.018]} /><meshBasicMaterial color="#fffaf0" /></mesh>
  </group>
}

export default function ApertureLogisticsScene(){
  return <group>
    <Panel position={[0,0,-.08]} size={[18,9,.16]} color={floor} />
    <Panel position={[0,4.22,2.85]} size={[18,.18,5.8]} color="#dfe2e1" />
    {[-7.2,7.2].map(x=><group key={x}><Panel position={[x,0,2.15]} size={[.22,8.35,4.3]} color="#8a9091" metalness={.25}/><Panel position={[x + (x>0 ? -.14:.14),0,3.65]} size={[.5,8.05,.08]} color="#cfd3d2" metalness={.25}/></group>)}
    {[-3.5,0,3.5].map(y=><Panel key={y} position={[0,y,4.85]} size={[17.5,.12,.12]} color="#707778" metalness={.5}/>)}
    {[-5,0,5].map(x=><CeilingLight key={x} position={[x,2.9,4.73]}/>)}

    <FloorMark position={[-1.8,0,.01]} length={7.4} rotation={0} />
    <FloorMark position={[4.7,-1.25,.01]} length={4.8} rotation={Math.PI/2} />
    <FloorMark position={[-5.3,-2.2,.01]} length={2.2} width={.12} rotation={0} color="#777d7e" />
    <FloorMark position={[-5.3,-2.2,.012]} length={1.5} width={.12} rotation={Math.PI/2} color="#777d7e" />

    <Conveyor position={[-2.15,2.2,0]} length={7.4} phase={.2}/>
    <Conveyor position={[2.55,-2.0,0]} length={5.4} width={1.05} phase={1.4}/>
    <Conveyor position={[4.9,.35,0]} length={3.4} width={.9} phase={2.4}/>

    <CargoUnit position={[-4.05,2.2,1.03]} size={[.55,.42,.52]} tint="#c7c0b2" />
    <CargoUnit position={[-2.1,2.2,1.03]} size={[.62,.48,.46]} tint="#bfc7c7" />
    <CargoUnit position={[-.15,2.2,1.03]} size={[.5,.4,.58]} tint="#d1c7b6" />
    <CargoUnit position={[2.2,-2,1.03]} size={[.56,.44,.48]} tint="#c4c9c8" />

    <Shelf position={[-5.1,-1.15,0]} />
    <Shelf position={[5.45,2.05,0]} />
    <Forklift position={[3.7,1.15,0]} />

    <PaperWorker position={[-4.5,1.1,0]} scale={1.12} phase={.2}/>
    <PaperWorker position={[4.45,-.7,0]} scale={.95} phase={2.1} flip/>
    <PaperWorker position={[-2.8,-3.15,0]} scale={.82} phase={4.2}/>
    <PaperWorker position={[1.2,2.95,0]} scale={.76} phase={5.1} flip/>
  </group>
}