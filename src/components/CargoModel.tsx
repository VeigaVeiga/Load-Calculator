import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo, useMemo } from 'react'
import * as THREE from 'three'

const S = .001
const VISUAL_GAP_XY = 8
// Keep the visual separation subtle. The actual cargo/support geometry remains unchanged.
const VISUAL_GAP_Z = 2

// Shared geometry/materials keep large carton loads lightweight.
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const MATERIAL_CACHE = new Map<string, THREE.MeshStandardMaterial>()

export const materialFor = (color: string, roughness: number) => {
  const key = `${color}|${roughness}`
  let material = MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness })
    MATERIAL_CACHE.set(key, material)
  }
  return material
}

type BoxProps = {
  size: [number, number, number]
  position?: [number, number, number]
  color: string
  roughness?: number
  eventProps?: any
}

function Box({ size, position = [0, 0, 0], color, roughness = .7, eventProps }: BoxProps) {
  const material = useMemo(() => materialFor(color, roughness), [color, roughness])
  return <mesh geometry={UNIT_BOX} material={material} position={position} scale={size} {...eventProps} />
}

const MemoBox = memo(Box, (a, b) =>
  a.color === b.color && a.roughness === b.roughness &&
  a.size[0] === b.size[0] && a.size[1] === b.size[1] && a.size[2] === b.size[2] &&
  (a.position?.[0] ?? 0) === (b.position?.[0] ?? 0) &&
  (a.position?.[1] ?? 0) === (b.position?.[1] ?? 0) &&
  (a.position?.[2] ?? 0) === (b.position?.[2] ?? 0) &&
  a.eventProps === b.eventProps
)

type CargoModelProps = {
  p: PlacedCargo
  container: Container
  selected: boolean
  onPointerDown: (e: any) => void
  onPointerUp: (e: any) => void
  onPointerMove: (e: any) => void
  onClick: (e: any) => void
  showName?: boolean
  local?: boolean
  hovered?: boolean
}

function CargoModel({ p, container, selected, onPointerDown, onPointerUp, onPointerMove, onClick, showName = false, local = false, hovered = false }: CargoModelProps) {
  const d = dims(p)
  const visualL = Math.max(40, d.length - VISUAL_GAP_XY * 2)
  const visualW = Math.max(40, d.width - VISUAL_GAP_XY * 2)
  const visualZGap = local && p.z > 0 ? Math.min(VISUAL_GAP_Z, Math.max(0, p.height - 20)) : 0
  const visualH = Math.max(40, p.height - visualZGap)
  const pos: [number, number, number] = local ? [0, 0, visualZGap * S / 2] : [(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + (p.height - visualZGap) / 2 + visualZGap) * S]
  const mainColor = selected ? '#f2c94c' : hovered ? '#ffd166' : p.color
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const palletBaseH = pallet ? Math.min(145, Math.max(90, p.height * .12)) : 0
  const bodyH = pallet ? Math.max(40, visualH - palletBaseH) : visualH
  const eventProps = useMemo(() => ({ onPointerDown, onPointerMove, onPointerUp, onClick }), [onPointerDown, onPointerMove, onPointerUp, onClick])

  return <group position={pos} rotation={[0, 0, local ? 0 : p.rotation * Math.PI / 180]}>
    {pallet ? <>
      <group position={[0, 0, -p.height * S / 2 + palletBaseH * S / 2]}>
        <MemoBox size={[visualL * S, visualW * S, palletBaseH * S * .18]} color="#b57b45" roughness={.86} eventProps={eventProps} />
        {[-1, 0, 1].map(i => <MemoBox key={`deck-${i}`} position={[0, i * visualW * S * .30, palletBaseH * S * .22]} size={[visualL * S, visualW * S * .16, palletBaseH * S * .25]} color="#8a5a32" roughness={.86} />)}
        {[-.34, 0, .34].map(i => <MemoBox key={`runner-${i}`} position={[i * visualL * S, 0, -palletBaseH * S * .16]} size={[Math.max(70, visualL * .13) * S, visualW * S * .82, palletBaseH * S * .50]} color="#76502f" roughness={.88} />)}
        {[-.42, 0, .42].map(i => <MemoBox key={`foot-${i}`} position={[i * visualL * S, 0, -palletBaseH * S * .46]} size={[Math.max(55, visualL * .10) * S, visualW * S * .76, palletBaseH * S * .18]} color="#69472b" roughness={.9} />)}
      </group>
      <MemoBox size={[visualL * S, visualW * S, bodyH * S]} position={[0, 0, palletBaseH * S / 2]} color={mainColor} roughness={.68} eventProps={eventProps} />
    </> : crate ? <>
      <MemoBox size={[visualL * S, visualW * S, bodyH * S]} color="#9a6638" roughness={.82} eventProps={eventProps} />
      {[-.42, -.14, .14, .42].map((t, i) => <MemoBox key={`sx${i}`} position={[0, t * visualW * S, 0]} size={[visualL * S * .98, Math.max(18, visualW * .055) * S, bodyH * S * 1.02]} color="#c08a52" roughness={.84} />)}
      {[-.44, 0, .44].map((t, i) => <MemoBox key={`sz${i}`} position={[t * visualL * S, 0, 0]} size={[Math.max(18, visualL * .055) * S, visualW * S * 1.01, bodyH * S * 1.02]} color="#b97d46" roughness={.84} />)}
    </> : <MemoBox size={[visualL * S, visualW * S, bodyH * S]} color={mainColor} roughness={.62} eventProps={eventProps} />}
    {showName && <Html position={[0, 0, p.height * S / 2 + .02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

const cargoEqual = (a: CargoModelProps, b: CargoModelProps) => {
  const ap = a.p; const bp = b.p
  return ap.id === bp.id && ap.cargoId === bp.cargoId && ap.cargoType === bp.cargoType && ap.x === bp.x && ap.y === bp.y && ap.z === bp.z && ap.length === bp.length && ap.width === bp.width && ap.height === bp.height && ap.rotation === bp.rotation && ap.color === bp.color && a.selected === b.selected && a.showName === b.showName && a.local === b.local && a.hovered === b.hovered && a.container.length === b.container.length && a.container.width === b.container.width && a.container.height === b.container.height
}

export default memo(CargoModel, cargoEqual)
