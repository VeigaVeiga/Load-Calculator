import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'
import type { SceneTool } from './ContainerScene'

const S = 0.001

type Props = {
  item: SecuringItem
  container: Container
  selected: boolean
  onSelect: () => void
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

function Rope({
  a,
  b,
  radius = 0.009,
  color = '#68737a',
}: {
  a: THREE.Vector3
  b: THREE.Vector3
  radius?: number
  color?: string
}) {
  const direction = b.clone().sub(a)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const len = direction.length()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  )

  return (
    <mesh position={mid} quaternion={quaternion} raycast={() => null}>
      <cylinderGeometry args={[radius, radius, len, 8]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  )
}

export default function SecuringModel({
  item,
  container,
  selected,
  onSelect,
  registerRef,
  local = false,
}: Props) {
  const center: [number, number, number] = local
    ? [0, 0, 0]
    : [
        (item.x + item.length / 2 - container.length / 2) * S,
        (item.y + item.width / 2 - container.width / 2) * S,
        (item.z + item.height / 2) * S,
      ]

  const material = (color: string) => (
    <meshStandardMaterial
      color={selected ? '#f4a23b' : color}
      roughness={0.58}
      metalness={0.08}
    />
  )

  let body: ReactNode

  if (item.type === 'triangleWood') {
    const L = item.length * S
    const W = item.width * S
    const H = item.height * S
    const shape = new THREE.Shape()
    shape.moveTo(-L / 2, 0)
    shape.lineTo(L / 2, 0)
    shape.lineTo(-L / 2, H)
    shape.closePath()

    body = (
      <mesh position={[0, -W / 2, -H / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: W,
              bevelEnabled: true,
              bevelThickness: 0.006,
              bevelSize: 0.006,
              bevelSegments: 2,
            },
          ]}
        />
        {material('#3979b8')}
      </mesh>
    )
  } else if (item.type === 'airBag') {
    const L = item.length * S
    const W = Math.max(100, item.width) * S
    const H = Math.min(260, item.height) * S

    body = (
      <group>
        <mesh scale={[L * 0.46, W * 0.34, H * 0.32]}>
          <sphereGeometry args={[1, 20, 12]} />
          {material('#3fa36b')}
        </mesh>
        <mesh position={[L * 0.27, 0, 0]} scale={[L * 0.25, W * 0.31, H * 0.28]}>
          <sphereGeometry args={[1, 18, 10]} />
          {material('#3fa36b')}
        </mesh>
        <mesh position={[-L * 0.27, 0, 0]} scale={[L * 0.25, W * 0.31, H * 0.28]}>
          <sphereGeometry args={[1, 18, 10]} />
          {material('#3fa36b')}
        </mesh>
      </group>
    )
  } else if (item.type === 'doorNet') {
    const w = Math.max(30, item.width) * S
    const h = Math.max(30, item.height) * S
    const cols = 16
    const rows = 12
    const ropes: ReactNode[] = []

    for (let i = 0; i <= cols; i += 1) {
      const x = -w / 2 + (i * w) / cols
      ropes.push(
        <Rope
          key={`v${i}`}
          a={new THREE.Vector3(0, x, -h / 2)}
          b={new THREE.Vector3(0, x, h / 2)}
          radius={0.012}
          color="#737b82"
        />,
      )
    }

    for (let j = 0; j <= rows; j += 1) {
      const z = -h / 2 + (j * h) / rows
      ropes.push(
        <Rope
          key={`h${j}`}
          a={new THREE.Vector3(0, -w / 2, z)}
          b={new THREE.Vector3(0, w / 2, z)}
          radius={0.012}
          color="#737b82"
        />,
      )
    }

    body = <group>{ropes}</group>
  } else {
    const points =
      item.path && item.path.length > 1
        ? item.path.map(
            (q) =>
              new THREE.Vector3(
                (q.x - container.length / 2) * S,
                (q.y - container.width / 2) * S,
                q.z * S,
              ),
          )
        : [
            new THREE.Vector3(-1.5, 0, 0.05),
            new THREE.Vector3(0, 0, 0.5),
            new THREE.Vector3(1.5, 0, 0.05),
          ]

    const curve = new THREE.CatmullRomCurve3(points)
    const geometry = new THREE.TubeGeometry(curve, 20, 0.01, 8, false)

    body = (
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={selected ? '#ff7b55' : '#e86d43'}
          roughness={0.45}
        />
      </mesh>
    )
  }

  const hitL = Math.max(item.length, 300)
  const hitW = Math.max(item.width, 300)
  const hitH = Math.max(item.height, 180)

  return (
    <group
      ref={(group) => registerRef?.(item.id, group)}
      position={center}
      rotation={[0, 0, (item.rotation * Math.PI) / 180]}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <mesh userData={{ collisionBody: false, securingBody: true }}>
        <boxGeometry args={[hitL * S, hitW * S, hitH * S]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
      {body}
    </group>
  )
}
