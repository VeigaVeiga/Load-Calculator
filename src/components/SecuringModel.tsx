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
    const L = 150 * S
    const W = 150 * S
    const H = 150 * S
    const shape = new THREE.Shape()
    // Cross-section in X/Z after rotating the extruded shape: the vertical
    // right-angle face is at -X, while the sloped face falls toward +X.
    shape.moveTo(-L / 2, -H / 2)
    shape.lineTo(-L / 2, H / 2)
    shape.lineTo(L / 2, -H / 2)
    shape.closePath()
    body = (
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
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
    const leftY = 38
    const rightY = container.width - 38
    const spanY = Math.max(0, rightY - leftY) * S
    const bottomZ = 42 * S
    const topZ = Math.max(80, container.height - 28) * S
    const spanZ = Math.max(0, topZ - bottomZ)
    const yL = -spanY / 2
    const yR = spanY / 2
    const zB = 0
    const zT = spanZ
    const beltColor = selected ? '#f4a23b' : '#c08a2e'
    const radius = .018
    body = (
      <group>
        <Rope a={new THREE.Vector3(0, yL, zT)} b={new THREE.Vector3(0, yR, zB)} radius={radius} color={beltColor} />
        <Rope a={new THREE.Vector3(0, yR, zT)} b={new THREE.Vector3(0, yL, zB)} radius={radius} color={beltColor} />
        <Rope a={new THREE.Vector3(0, yL, zB)} b={new THREE.Vector3(0, yR, zB)} radius={radius * 1.12} color={beltColor} />
        <mesh position={[0, yL, zT]} raycast={() => null}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
        <mesh position={[0, yR, zT]} raycast={() => null}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
        <mesh position={[0, yL, zB]} raycast={() => null}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
        <mesh position={[0, yR, zB]} raycast={() => null}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
      </group>
    )
  }

  return (
    <group ref={group => registerRef?.(item.id, group)} position={center} rotation={[0, 0, item.rotation * Math.PI / 180]} onPointerDown={e => { e.stopPropagation(); onSelect?.() }} onPointerUp={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect?.() }} onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onSelect?.() }}>
      {body}
    </group>
  )
}
