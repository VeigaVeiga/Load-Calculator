import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const dark = '#25282a'
const metal = '#c9ced0'
const metalDark = '#747a7d'
const floor = '#b8bdbe'
const accent = '#d7d9d8'

function PaperWorker({ position, scale = 1, phase = 0, flip = false }: { position: [number, number, number]; scale?: number; phase?: number; flip?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const walk = Math.sin(t * 2.2) * 0.22
    if (root.current) root.current.position.z = position[2] + Math.abs(Math.sin(t * 2.2)) * 0.025
    if (arm.current) arm.current.rotation.y = walk * 0.65
    if (legL.current) legL.current.rotation.y = walk
    if (legR.current) legR.current.rotation.y = -walk
  })
  const side = flip ? -1 : 1
  return (
    <group ref={root} position={position} scale={scale} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh position={[0, 0, 0.72]} castShadow>
        <sphereGeometry args={[0.16, 12, 8]} />
        <meshStandardMaterial color={dark} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.47]} castShadow>
        <boxGeometry args={[0.24, 0.14, 0.42]} />
        <meshStandardMaterial color={dark} roughness={1} />
      </mesh>
      <group ref={arm}>
        <mesh position={[side * 0.18, 0, 0.48]} rotation={[0, 0, side * -0.22]}>
          <boxGeometry args={[0.07, 0.055, 0.34]} />
          <meshStandardMaterial color={dark} roughness={1} />
        </mesh>
      </group>
      <group ref={legL}>
        <mesh position={[0.075, 0, 0.18]}>
          <boxGeometry args={[0.075, 0.065, 0.35]} />
          <meshStandardMaterial color={dark} roughness={1} />
        </mesh>
      </group>
      <group ref={legR}>
        <mesh position={[-0.075, 0, 0.18]}>
          <boxGeometry args={[0.075, 0.065, 0.35]} />
          <meshStandardMaterial color={dark} roughness={1} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.84]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.018, 6, 12]} />
        <meshStandardMaterial color={dark} roughness={1} />
      </mesh>
    </group>
  )
}

function Conveyor({ position = [0, 0, 0] as [number, number, number], length = 7, width = 1.15, height = 1.05 }: { position?: [number, number, number]; length?: number; width?: number; height?: number }) {
  const rollers = useMemo(() => Array.from({ length: Math.max(4, Math.floor(length / 0.42)) }, (_, i) => -length / 2 + 0.22 + i * 0.42), [length])
  const refs = useRef<THREE.Mesh[]>([])
  useFrame((_, delta) => refs.current.forEach(r => { if (r) r.rotation.x += delta * 2.2 }))
  return (
    <group position={position}>
      <mesh position={[0, 0, height - 0.12]} receiveShadow>
        <boxGeometry args={[length, width, 0.18]} />
        <meshStandardMaterial color={metalDark} roughness={0.82} />
      </mesh>
      {rollers.map((x, i) => <mesh key={i} ref={el => { if (el) refs.current[i] = el }} position={[x, 0, height + 0.02]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.09, width * 0.92, 12]} />
        <meshStandardMaterial color={metal} metalness={0.55} roughness={0.5} />
      </mesh>)}
      {[-width / 2, width / 2].map((y, i) => <mesh key={i} position={[0, y, height + 0.12]}>
        <boxGeometry args={[length, 0.06, 0.28]} />
        <meshStandardMaterial color={accent} metalness={0.25} roughness={0.6} />
      </mesh>)}
      {[-length / 2 + 0.15, length / 2 - 0.15].map((x, i) => <mesh key={i} position={[x, 0, height / 2]}>
        <boxGeometry args={[0.12, width + 0.05, height]} />
        <meshStandardMaterial color={metalDark} metalness={0.3} roughness={0.7} />
      </mesh>)}
    </group>
  )
}

function Forklift({ position = [0, 0, 0] as [number, number, number] }) {
  const root = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (root.current) root.current.position.x = position[0] + Math.sin(t * 0.22) * 1.8
  })
  return (
    <group ref={root} position={position}>
      <mesh position={[0, 0, 0.38]} castShadow>
        <boxGeometry args={[1.05, 0.72, 0.55]} />
        <meshStandardMaterial color="#b8b9b8" roughness={0.7} />
      </mesh>
      <mesh position={[-0.25, 0, 0.88]}>
        <boxGeometry args={[0.55, 0.58, 0.85]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      <mesh position={[0.62, 0, 0.62]}>
        <boxGeometry args={[0.85, 0.08, 0.08]} />
        <meshStandardMaterial color={metalDark} metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0.62, 0, 0.43]}>
        <boxGeometry args={[0.85, 0.08, 0.08]} />
        <meshStandardMaterial color={metalDark} metalness={0.5} roughness={0.45} />
      </mesh>
      {[-0.32, 0.32].map((y, i) => <mesh key={i} position={[0.32, y, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 12]} />
        <meshStandardMaterial color="#303234" roughness={0.95} />
      </mesh>)}
    </group>
  )
}

export default function ApertureLogisticsScene() {
  return (
    <group>
      <mesh position={[0, 0, -0.06]} receiveShadow>
        <boxGeometry args={[18, 9, 0.12]} />
        <meshStandardMaterial color={floor} roughness={0.92} />
      </mesh>
      <mesh position={[0, 4.15, 2.8]}>
        <boxGeometry args={[18, 0.18, 5.6]} />
        <meshStandardMaterial color="#d4d7d7" roughness={0.9} />
      </mesh>
      {[-7, 7].map(x => <group key={x} position={[x, 0, 2.1]}>
        <mesh><boxGeometry args={[0.18, 8.2, 4.2]} /><meshStandardMaterial color={metalDark} roughness={0.85} /></mesh>
      </group>)}
      {[-3.5, 0, 3.5].map(y => <mesh key={y} position={[0, y, 4.95]}>
        <boxGeometry args={[17.5, 0.12, 0.12]} />
        <meshStandardMaterial color="#8c9294" metalness={0.35} roughness={0.65} />
      </mesh>)}
      <Conveyor position={[-2.3, 2.25, 0]} length={7.4} />
      <Conveyor position={[1.9, -2.2, 0]} length={5.2} width={1.05} />
      <group position={[-5.4, -2.4, 0]}>
        {[0, 1, 2].map(i => <mesh key={i} position={[0, 0, 1.1 + i * 0.9]}><boxGeometry args={[1.7, 0.75, 0.08]} /><meshStandardMaterial color={metalDark} metalness={0.25} roughness={0.75} /></mesh>)}
        <mesh position={[0, 0, 1.9]}><boxGeometry args={[0.08, 0.85, 3.1]} /><meshStandardMaterial color={metalDark} /></mesh>
        <mesh position={[0, 0, 1.9]}><boxGeometry args={[1.78, 0.08, 3.1]} /><meshStandardMaterial color={metalDark} /></mesh>
      </group>
      <Forklift position={[3.8, 1.25, 0]} />
      <PaperWorker position={[-4.4, 1.2, 0]} scale={1.15} phase={0.2} />
      <PaperWorker position={[4.6, -0.7, 0]} scale={0.95} phase={2.1} flip />
      <PaperWorker position={[-2.5, -3.15, 0]} scale={0.82} phase={4.2} />
    </group>
  )
}
