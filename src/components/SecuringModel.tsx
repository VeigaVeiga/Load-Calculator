import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'

const S = .001

function Rope({ a, b, radius = .022, color = '#8b8f91' }: { a: THREE.Vector3; b: THREE.Vector3; radius?: number; color?: string }) {
  const direction = b.clone().sub(a)
  const len = direction.length()
  if (len < 0.0001) return null
  const mid = a.clone().add(b).multiplyScalar(.5)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return <mesh position={mid} quaternion={quaternion}><cylinderGeometry args={[radius, radius, len, 8]} /><meshStandardMaterial color={color} roughness={.72} /></mesh>
}

// Full door net in the local Y/Z door plane. 45-degree dashed lines are
// generated from the actual door rectangle, with a 200 mm pitch.
function DashedDoorNet({ width, height, selected }: { width: number; height: number; selected: boolean }) {
  const w = Math.max(30, width) * S
  const h = Math.max(30, height) * S
  const pitch = 200 * S
  const dash = 105 * S
  const gap = 95 * S
  const segments: ReactNode[] = []
  const color = selected ? '#f4a23b' : '#5f6870'
  const minB = -((w + h) / 2)
  const maxB = (w + h) / 2
  let index = 0

  for (let b = minB; b <= maxB + 1e-7; b += pitch) {
    const y0 = Math.max(-w / 2, -h / 2 - b)
    const y1 = Math.min(w / 2, h / 2 - b)
    if (y1 <= y0 + 1e-7) continue

    const p0 = new THREE.Vector3(0, y0, y0 + b)
    const p1 = new THREE.Vector3(0, y1, y1 + b)
    const direction = p1.clone().sub(p0)
    const length = direction.length()
    if (length < 0.001) continue
    const unit = direction.normalize()

    for (let d = 0; d < length - 1e-7; d += dash + gap) {
      const e = Math.min(length, d + dash)
      if (e - d < 0.008) continue
      segments.push(<Rope key={`door-net-${index++}`} a={p0.clone().addScaledVector(unit, d)} b={p0.clone().addScaledVector(unit, e)} radius={.006} color={color} />)
    }
  }
  
  // Add the opposite diagonal family so the net forms a complete cross-hatch.
  for (let b = minB; b <= maxB + 1e-7; b += pitch) {
    const y0 = Math.max(-w / 2, b - h / 2)
    const y1 = Math.min(w / 2, b + h / 2)
    if (y1 <= y0 + 1e-7) continue

    const p0 = new THREE.Vector3(0, y0, b - y0)
    const p1 = new THREE.Vector3(0, y1, b - y1)
    const direction = p1.clone().sub(p0)
    const length = direction.length()
    if (length < 0.001) continue
    const unit = direction.normalize()

    for (let d = 0; d < length - 1e-7; d += dash + gap) {
      const e = Math.min(length, d + dash)
      if (e - d < 0.008) continue
      segments.push(<Rope key={`door-net-reverse-${index++}`} a={p0.clone().addScaledVector(unit, d)} b={p0.clone().addScaledVector(unit, e)} radius={.006} color={color} />)
    }
  }

  return <group>{segments}</group>
}

type Props = {
  item: SecuringItem
  container: Container
  selected: boolean
  registerRef?: (id: string, obj: THREE.Group | null) => void
  local?: boolean
  onSelect?: () => void
}

export default function SecuringModel({ item, container, selected, registerRef, local = false, onSelect }: Props) {
  const center: [number, number, number] = local
    ? [0, 0, 0]
    : [(item.x + item.length / 2 - container.length / 2) * S, (item.y + item.width / 2 - container.width / 2) * S, (item.z + item.height / 2) * S]
  const material = (color: string) => <meshStandardMaterial color={selected ? '#f4a23b' : color} roughness={.58} metalness={.06} />
  let body: ReactNode

  if (item.type === 'triangleWood') {
    const L = Math.max(1, item.length) * S
    const W = Math.max(1, item.width) * S
    const H = Math.max(1, item.height) * S
    const shape = new THREE.Shape()
    // Cross-section in X/Z after rotating the extruded shape: the vertical
    // right-angle face is at -X, while the sloped face falls toward +X.
    shape.moveTo(-L / 2, -H / 2)
    shape.lineTo(-L / 2, H / 2)
    shape.lineTo(L / 2, -H / 2)
    shape.closePath()
    body = (
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0, -W / 2]}>
          <extrudeGeometry args={[shape, { depth: W, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1 }]} />
          {material('#3979b8')}
        </mesh>
      </group>
    )
  } else if (item.type === 'airBag') {
    const L = Math.max(300, item.length) * S
    const W = Math.max(180, item.width) * S
    const H = Math.max(160, item.height) * S
    body = <group><mesh scale={[L * .46, W * .34, H * .30]}><sphereGeometry args={[1, 16, 8]} />{material('#3fa36b')}</mesh><mesh position={[L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}><sphereGeometry args={[1, 14, 8]} />{material('#3fa36b')}</mesh><mesh position={[-L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}><sphereGeometry args={[1, 14, 8]} />{material('#3fa36b')}</mesh></group>
  } else if (item.type === 'doorNet') {
    const w = Math.max(30, container.doorWidth) * S
    const h = Math.max(30, container.doorHeight) * S
    const frame = selected ? '#f4a23b' : '#626970'
    body = (
      <group>
        <DashedDoorNet width={container.doorWidth} height={container.doorHeight} selected={selected} />
        <mesh position={[0, -w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color={frame} /></mesh>
        <mesh position={[0, w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color={frame} /></mesh>
        <mesh position={[0, 0, -h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color={frame} /></mesh>
        <mesh position={[0, 0, h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color={frame} /></mesh>
      </group>
    )
  } else {
    const beltColor = selected ? '#ffb347' : '#d5a23c'
    const darkEdge = selected ? '#fff0cf' : '#74511c'
    const sourcePath = item.path !== undefined ? item.path : [
      { x: item.x + item.length / 2, y: 38, z: Math.max(80, container.height - 28) },
      { x: item.x + item.length / 2, y: 38, z: 42 },
      { x: item.x + item.length / 2, y: container.width - 38, z: 42 },
      { x: item.x + item.length / 2, y: container.width - 38, z: Math.max(80, container.height - 28) },
    ]
    const points = sourcePath.map(p => new THREE.Vector3((p.x - (item.x + item.length / 2)) * S, (p.y - container.width / 2) * S, (p.z - item.z) * S))
    const strapWidth = .05
    const straps: ReactNode[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const direction = b.clone().sub(a)
      if (direction.length() < .001) continue
      direction.normalize()
      let side = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1))
      if (side.length() < .001) side = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0))
      side.normalize().multiplyScalar(strapWidth / 2)
      const vertices = [a.clone().add(side), a.clone().sub(side), b.clone().add(side), b.clone().sub(side)]
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap(v => [v.x, v.y, v.z]), 3))
      geometry.setIndex([0, 1, 2, 2, 1, 3])
      geometry.computeVertexNormals()
      straps.push(<mesh key={i} geometry={geometry}><meshStandardMaterial color={beltColor} roughness={.82} metalness={0} side={THREE.DoubleSide} /></mesh>)
      straps.push(<Rope key={'edge-a'+i} a={vertices[0]} b={vertices[2]} radius={.0012} color={darkEdge} />)
      straps.push(<Rope key={'edge-b'+i} a={vertices[1]} b={vertices[3]} radius={.0012} color={darkEdge} />)
    }
    const buckle = points.length >= 2 && points[0].distanceTo(points[1]) > .25 ? (() => {
      const direction = points[1].clone().sub(points[0]).normalize()
      const midpoint = points[0].clone().lerp(points[1], .56)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      return <group position={midpoint} quaternion={quaternion}>
        <mesh position={[0, 0, .012]}><boxGeometry args={[.085, .13, .018]} /><meshStandardMaterial color={selected ? '#fff0cf' : '#8e989d'} metalness={.78} roughness={.32} /></mesh>
        <mesh position={[0, -.035, .026]}><boxGeometry args={[.065, .055, .012]} /><meshStandardMaterial color={selected ? '#ffe0a3' : '#5e686d'} metalness={.72} roughness={.36} /></mesh>
        <mesh position={[0, .048, .028]} rotation={[.18, 0, 0]}><boxGeometry args={[.018, .09, .012]} /><meshStandardMaterial color={selected ? '#fff0cf' : '#aab2b6'} metalness={.8} roughness={.28} /></mesh>
      </group>
    })() : null
    body = <group>{straps}{buckle}</group>
  }

  return (
    <group ref={group => registerRef?.(item.id, group)} position={center} rotation={[0, 0, item.rotation * Math.PI / 180]} onPointerDown={e => { e.stopPropagation(); onSelect?.() }} onPointerUp={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect?.() }} onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onSelect?.() }}>
      {body}
    </group>
  )
}
