import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Container, SecuringItem } from '../types'

const S = .001
const HIT_GEOMETRY = new THREE.BoxGeometry(1, 1, 1)
const OUTLINE_GEOMETRY = new THREE.EdgesGeometry(HIT_GEOMETRY)

// Keep the geometry objects shared. Creating BoxGeometry/EdgesGeometry on every
// React render was one of the causes of progressive GPU/CPU pressure during
// long editing sessions.
function OutlineBox({ size, selected }: { size: [number, number, number]; selected: boolean }) {
  return <lineSegments geometry={OUTLINE_GEOMETRY} scale={size} raycast={() => null}>
    <lineBasicMaterial color={selected ? '#f4a23b' : '#5d666b'} transparent opacity={selected ? .95 : .72} />
  </lineSegments>
}

type Props = { item: SecuringItem; container: Container; selected: boolean; registerRef?: (id: string, obj: THREE.Group | null) => void; local?: boolean; onSelect?: () => void }

function Rope({ a, b, radius = .022, color = '#8b8f91' }: { a: THREE.Vector3; b: THREE.Vector3; radius?: number; color?: string }) {
  const direction = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(.5), len = direction.length(), quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return <mesh position={mid} quaternion={quaternion} raycast={() => null}><cylinderGeometry args={[radius, radius, len, 8]} /><meshStandardMaterial color={color} roughness={.72} /></mesh>
}

export default function SecuringModel({ item, container, selected, registerRef, local = false, onSelect }: Props) {
  const center: [number, number, number] = local ? [0, 0, 0] : [(item.x + item.length / 2 - container.length / 2) * S, (item.y + item.width / 2 - container.width / 2) * S, (item.z + item.height / 2) * S]
  const material = (color: string) => <meshStandardMaterial color={selected ? '#f4a23b' : color} roughness={.58} metalness={.06} />
  let body: ReactNode
  const visualLength = item.length, visualWidth = item.width, visualHeight = item.height

  if (item.type === 'triangleWood') {
    const L = 150 * S, W = 150 * S, H = 150 * S, shape = new THREE.Shape()
    shape.moveTo(-L / 2, -H / 2); shape.lineTo(L / 2, -H / 2); shape.lineTo(-L / 2, H / 2); shape.closePath()
    body = <group rotation={[0, -Math.PI / 2, 0]}><mesh><extrudeGeometry args={[shape, { depth: W, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1 }]} />{material('#3979b8')}</mesh><OutlineBox size={[150 * S, 150 * S, 150 * S]} selected={selected} /></group>
  } else if (item.type === 'airBag') {
    const L = item.length * S, W = Math.max(100, item.width) * S, H = Math.min(220, item.height) * S
    body = <group><mesh scale={[L * .46, W * .34, H * .30]}>{<sphereGeometry args={[1, 12, 6]} />}{material('#3fa36b')}</mesh><mesh position={[L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}>{<sphereGeometry args={[1, 10, 6]} />}{material('#3fa36b')}</mesh><mesh position={[-L * .27, 0, 0]} scale={[L * .25, W * .30, H * .27]}>{<sphereGeometry args={[1, 10, 6]} />}{material('#3fa36b')}</mesh></group>
  } else if (item.type === 'doorNet') {
    const w = Math.max(30, item.width) * S, h = Math.max(30, item.height) * S, cols = 18, rows = 14, ropes: ReactNode[] = []
    for (let i = 0; i <= cols; i++) { const x = -w / 2 + i * w / cols; ropes.push(<Rope key={`v${i}`} a={new THREE.Vector3(0, x, -h / 2)} b={new THREE.Vector3(0, x, h / 2)} radius={.026} color={selected ? '#f4a23b' : '#737b82'} />) }
    for (let j = 0; j <= rows; j++) { const z = -h / 2 + j * h / rows; ropes.push(<Rope key={`h${j}`} a={new THREE.Vector3(0, -w / 2, z)} b={new THREE.Vector3(0, w / 2, z)} radius={.026} color={selected ? '#f4a23b' : '#737b82'} />) }
    body = <group>{ropes}<mesh position={[0, -w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color="#626970" /></mesh><mesh position={[0, w / 2, 0]} raycast={() => null}><boxGeometry args={[.035, .035, h]} /><meshStandardMaterial color="#626970" /></mesh><mesh position={[0, 0, -h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color="#626970" /></mesh><mesh position={[0, 0, h / 2]} raycast={() => null}><boxGeometry args={[.035, w, .035]} /><meshStandardMaterial color="#626970" /></mesh></group>
  } else {
    // Use a local path so the material is not translated twice by the parent.
    const points = item.path && item.path.length > 1
      ? item.path.map(q => new THREE.Vector3((q.x - item.x - item.length / 2) * S, (q.y - item.y - item.width / 2) * S, (q.z - item.z - item.height / 2) * S))
      : [new THREE.Vector3(-item.length * S / 2, 0, .05), new THREE.Vector3(0, 0, .5), new THREE.Vector3(item.length * S / 2, 0, .05)]
    const curve = new THREE.CatmullRomCurve3(points), geometry = new THREE.TubeGeometry(curve, 20, .012, 8, false)
    body = <mesh geometry={geometry}><meshStandardMaterial color={selected ? '#ff7b55' : '#e86d43'} roughness={.45} /></mesh>
  }

  // A modest hit target keeps thin belts selectable without making the hit box
  // so large that clicking a neighbouring cargo selects the material instead.
  const hitL = Math.max(visualLength, 140), hitW = Math.max(visualWidth, 140), hitH = Math.max(visualHeight, 120)
  return <group
    ref={group => registerRef?.(item.id, group)}
    position={center}
    rotation={[0, 0, item.rotation * Math.PI / 180]}
    onPointerDown={e => { e.stopPropagation(); onSelect?.() }}
    onPointerUp={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); onSelect?.() }}
    onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onSelect?.() }}
  >
    <mesh userData={{ collisionBody: false, securingBody: true }} onPointerDown={e => { e.stopPropagation(); onSelect?.() }} onPointerUp={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect?.() }}>
      <boxGeometry args={[hitL * S, hitW * S, hitH * S]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {body}
    {selected && item.type !== 'doorNet' && <OutlineBox size={[hitL * S, hitW * S, hitH * S]} selected />}
  </group>
}
