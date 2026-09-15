import React from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { View } from './ContainerScene'

function GizmoScene({ cameraQuaternion, onView }: { cameraQuaternion: React.MutableRefObject<THREE.Quaternion>; onView: (v: View) => void }) {
  const group = React.useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.quaternion.copy(cameraQuaternion.current).invert()
  })

  const face = (position: [number, number, number], rotation: [number, number, number], label: string, view: View) => (
    <group position={position} rotation={rotation} onClick={(e) => { e.stopPropagation(); onView(view) }}>
      <mesh>
        <planeGeometry args={[0.62, 0.62]} />
        <meshStandardMaterial color="#e8ece9" transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
      <Text fontSize={0.18} color="#42504c" anchorX="center" anchorY="middle">{label}</Text>
    </group>
  )

  return <>
    <ambientLight intensity={2} />
    <group ref={group}>
      <mesh>
        <boxGeometry args={[0.64, 0.64, 0.64]} />
        <meshStandardMaterial color="#d7dfdb" transparent opacity={0.24} wireframe />
      </mesh>
      {face([0, 0, 0.33], [0, 0, 0], 'X−', 'front')}
      {face([0, 0, -0.33], [0, Math.PI, 0], 'X+', 'rear')}
      {face([0.33, 0, 0], [0, Math.PI / 2, 0], 'Y+', 'right')}
      {face([-0.33, 0, 0], [0, -Math.PI / 2, 0], 'Y−', 'left')}
      {face([0, 0.33, 0], [-Math.PI / 2, 0, 0], 'Z+', 'top')}
      <arrowHelper args={[new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0), 0.82, 0xd9534f, 0.12, 0.07]} />
      <arrowHelper args={[new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 0.82, 0x5a7fa6, 0.12, 0.07]} />
      <arrowHelper args={[new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0), 0.82, 0x5f8b6f, 0.12, 0.07]} />
    </group>
  </>
}

export default function ViewGizmo3D({ cameraQuaternion, onView }: { cameraQuaternion: React.MutableRefObject<THREE.Quaternion>; onView: (v: View) => void }) {
  return <div className="view-gizmo-3d">
    <Canvas orthographic camera={{ position: [2.7, 2.7, 2.7], zoom: 155, near: 0.1, far: 10 }} gl={{ alpha: true, antialias: true }}>
      <GizmoScene cameraQuaternion={cameraQuaternion} onView={onView} />
    </Canvas>
  </div>
}
