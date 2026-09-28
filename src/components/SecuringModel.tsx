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
  return <mesh position={mid} quaternion={quaternion}>
    <cylinderGeometry args={[radius, radius, len, 8]} />
    <meshStandardMaterial color={color} roughness={.72} />
  </mesh>
}

function DashedDoorNet({ width, height, selected }: { width: number; height: number; selected: boolean }) {
  // 200 mm pitch, 45-degree dashed lines, clipped to the whole door opening.
  const w = Math.max(30, width) * S
  const h = Math.max(30, height) * S
  const pitch = 200 * S
  const dash = 105 * S
  const gap = 95 * S
  const segments: ReactNode[] = []
  const color = selected ? '#f4a23b' : '#5f6870'

  // The net lives in the Y/Z plane of the container door (X=0 locally).
  for (let offset = -h; offset <= w; offset += pitch) {
    const startY = Math.max(-w / 2, -h / 2 - offset)
    const startZ = Math.max(-h / 2, -w / 2 + offset)
    const endY = Math.min(w / 2, h / 2 - offset)
    const endZ = Math.min(h / 2, w / 2 + offset)
    if (endY <= startY || endZ <= startZ) continue

    const a = new THREE.Vector3(0, startY, startZ)
    const b = new THREE.Vector3(0, endY, endZ)
    const direction = b.clone().sub(a)
    const length = direction.length()
    if (length < 0.001) continue
    const unit = direction.normalize()
    for (let d = 0; d < length; d += dash + gap) {
      const e = Math.min(length, d + dash)
      if (e - d < 0.015) continue
      segments.push(<Rope key={`${offset.toFixed(4)}-${d.toFixed(4)}`} a={a.clone().addScaledVector(unit, d)} b={a.clone().addScaledVector(unit, e)} radius={.010} color={color} />)
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
    const L = 150 * S, W = 150 * S, H = 150 * S, shape = new THREE.Shape()
    shape.moveTo(-L / 2, -H / 2)
    shape.lineTo(L / 2, -H / 2)
    shape.lineTo(-L / 2, H / 2)
    shape.closePath()
    // Only the actual triangular timber is rendered. No artificial cube outline.
    body = <group rotation={[0, -Math.PI / 2, 0]}><mesh><extrudeGeometry args={[shape, { depth: W, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1 }]} />{material('#3979b8')}</mesh></group>
  } else if (item.type === 'airBag') {
    const L = Math.max(300, item.length) * S
    const W = Math.max(180, item.width) * S
    const H = Math.max(160, item.height) * S
    // Do not create a transparent cube hit target. It used to intercept clicks
    // and prevent other materials inside its bounds from being selected.
    body = <group>
      <mesh scale={[L * .46, W * .34, H * .30]}><sphereGeometry args={[1, 16, 8]} />{material('#3fa36b')}</mesh>
      <mesh position={[L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}><sphereGeometry args={[1, 14, 8]} />{material('#3fa36b')}</mesh>
      <mesh position={[-L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}><sphereGeometry args={[1, 14, 8]} />{material('#3fa36b')}</mesh>
    </group>
  } else if (item.type === 'doorNet') {
    const w = Math.max(30, item.width) * S
    const h = Math.max(30, item.height) * S
    const frame = selected ? '#f4a23b' : '#626970'
    body = <group>
      <DashedDoorNet width={item.width} height={item.height} selected={selected} />
      <mesh position={[0, -w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color={frame} /></mesh>
      <mesh position={[0, w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color={frame} /></mesh>
      <mesh position={[0, 0, -h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color={frame} /></mesh>
      <mesh position={[0, 0, h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color={frame} /></mesh>
    </group>
  } else {
    // X-shaped lashing belt: top-left -> bottom-right, bottom crossbar,
    // bottom-left -> top-right, with eyelet markers at all four anchors.
    const w = Math.max(600, Math.min(container.width, 2400)) * S
    const h = Math.max(600, Math.min(container.height, 2500)) * S
    const yL = -w / 2, yR = w / 2, zB = -h / 2, zT = h / 2
    const beltColor = selected ? '#f4a23b' : '#c08a2e'
    const radius = .018
    body = <group>
      <Rope a={new THREE.Vector3(0, yL, zT)} b={new THREE.Vector3(0, yR, zB)} radius={radius} color={beltColor} />
      <Rope a={new THREE.Vector3(0, yR, zT)} b={new THREE.Vector3(0, yL, zB)} radius={radius} color={beltColor} />
      <Rope a={new THREE.Vector3(0, yL, zB)} b={new THREE.Vector3(0, yR, zB)} radius={radius * 1.12} color={beltColor} />
      <mesh position={[0, yL, zT]}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
      <mesh position={[0, yR, zT]}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
      <mesh position={[0, yL, zB]}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
      <mesh position={[0, yR, zB]}><sphereGeometry args={[.045, 10, 6]} />{material('#72777b')}</mesh>
    </group>
  }

  return <group
    ref={group => registerRef?.(item.id, group)}
    position={center}
    rotation={[0, 0, item.rotation * Math.PI / 180]}
    onPointerDown={e => { e.stopPropagation(); onSelect?.() }}
    onPointerUp={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); onSelect?.() }}
    onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onSelect?.() }}
  >
    {body}
  </group>
}
