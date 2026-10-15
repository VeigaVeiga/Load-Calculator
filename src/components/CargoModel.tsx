import { Html } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const S = .001
export const UNIT_BOX = new RoundedBoxGeometry(1, 1, 1, 1, .006)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX, 24)
const MATERIAL_CACHE = new Map<string, THREE.MeshStandardMaterial>()
const EDGE_MATERIAL_CACHE = new Map<string, THREE.LineBasicMaterial>()

export const materialFor = (color: string, roughness: number, opacity = 1) => {
  const key = `${color}|${roughness}|${opacity}`
  let material = MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
    MATERIAL_CACHE.set(key, material)
  }
  return material
}

const edgeMaterialFor = (color: string) => {
  const key = `edge:${color}`
  let material = EDGE_MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.LineBasicMaterial({ color: '#4d5458', transparent: true, opacity: .78 })
    EDGE_MATERIAL_CACHE.set(key, material)
  }
  return material
}

type BoxProps = {
  size: [number, number, number]
  position?: [number, number, number]
  color: string
  roughness?: number
  eventProps?: any
  outline?: boolean
  opacity?: number
}

function Box({ size, position = [0, 0, 0], color, roughness = .7, eventProps, outline = false, opacity = 1 }: BoxProps) {
  const material = useMemo(() => materialFor(color, roughness, opacity), [color, roughness, opacity])
  const edgeMaterial = useMemo(() => edgeMaterialFor(color), [color])
  return <group position={position}>
    <mesh geometry={UNIT_BOX} material={material} scale={size} {...eventProps} />
    {outline && <lineSegments geometry={UNIT_EDGES} material={edgeMaterial} scale={size} raycast={() => null} />}
  </group>
}

const MemoBox = memo(Box, (a, b) =>
  a.color === b.color && a.roughness === b.roughness && a.outline === b.outline &&
  a.size[0] === b.size[0] && a.size[1] === b.size[1] && a.size[2] === b.size[2] &&
  (a.position?.[0] ?? 0) === (b.position?.[0] ?? 0) &&
  (a.position?.[1] ?? 0) === (b.position?.[1] ?? 0) &&
  (a.position?.[2] ?? 0) === (b.position?.[2] ?? 0) &&
  a.eventProps === b.eventProps && (a.opacity ?? 1) === (b.opacity ?? 1),
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
  ghost?: boolean
}

function CargoModel({ p, container, selected, onPointerDown, onPointerUp, onPointerMove, onClick, showName = false, local = false, hovered = false, ghost = false }: CargoModelProps) {
  const d = dims(p)
  const visualL = p.length
  const visualW = p.width
  const visualH = p.height
  const pos: [number, number, number] = local
    ? [0, 0, 0]
    : [(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + visualH / 2) * S]
  const mainColor = selected ? '#f2c94c' : hovered ? '#ffd166' : (p.color || '#c7ced3')
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const drum = p.cargoType === 'drum'
  const pipe = p.cargoType === 'pipe'
  const ibc = p.cargoType === 'ibc'
  const vehicle = p.cargoType === 'vehicle'
  const machinery = p.cargoType === 'machinery'
  const palletDeckH = pallet ? Math.min(120, Math.max(70, visualH * .08)) : 0
  const bodyH = pallet ? Math.max(1, visualH - palletDeckH) : visualH
  const eventProps = useMemo(() => ({ onPointerDown, onPointerMove, onPointerUp, onClick }), [onPointerDown, onPointerMove, onPointerUp, onClick])
  const ghostOpacity = ghost ? .24 : 1

  return <group position={pos} rotation={[0, 0, local ? 0 : p.rotation * Math.PI / 180]}>
    {pallet ? <>
      <group position={[0, 0, (-visualH / 2 + palletDeckH / 2) * S]}>
        <MemoBox size={[visualL * S, visualW * S, palletDeckH * S * .32]} color="#b57b45" roughness={.86} eventProps={eventProps} outline opacity={ghostOpacity} />
        {[-.34, 0, .34].map((i, k) => <MemoBox key={`deck-${k}`} position={[0, i * visualW * S * .28, palletDeckH * S * .34]} size={[visualL * S, visualW * S * .16, palletDeckH * S * .22]} color="#8a5a32" roughness={.86} outline opacity={ghostOpacity} />)}
        {[-.34, 0, .34].map((i, k) => <MemoBox key={`runner-${k}`} position={[i * visualL * S, 0, -palletDeckH * S * .20]} size={[Math.max(55, visualL * .11) * S, visualW * S * .72, palletDeckH * S * .36]} color="#76502f" roughness={.88} outline opacity={ghostOpacity} />)}
      </group>
      <MemoBox size={[visualL * S, visualW * S, bodyH * S]} position={[0, 0, (-visualH / 2 + palletDeckH + bodyH / 2) * S]} color={mainColor} roughness={.68} eventProps={eventProps} outline opacity={ghostOpacity} />
    </> : crate ? <>
      <MemoBox size={[visualL * S, visualW * S, visualH * S]} color="#9a6638" roughness={.82} eventProps={eventProps} outline opacity={ghostOpacity} />
      {[-.38, -.13, .13, .38].map((t, i) => <MemoBox key={`sx${i}`} position={[0, t * visualW * S, 0]} size={[visualL * S * .96, Math.max(12, visualW * .045) * S, visualH * S * .96]} color="#c08a52" roughness={.84} outline opacity={ghostOpacity} />)}
      {[-.40, 0, .40].map((t, i) => <MemoBox key={`sz${i}`} position={[t * visualL * S, 0, 0]} size={[Math.max(12, visualL * .045) * S, visualW * S * .96, visualH * S * .96]} color="#b97d46" roughness={.84} outline opacity={ghostOpacity} />)}
    </> : drum ? <>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[visualW * S * .48, visualH * S * .48, visualW * S * .48]} material={materialFor(selected ? '#f2c94c' : '#6f8992', .48, ghostOpacity)} {...eventProps}>
        <cylinderGeometry args={[1, 1, 1, 24, 1, false]} />
      </mesh>
      {[-.38, .38].map((z, i) => <mesh key={i} position={[0, 0, z * visualH * S]} raycast={() => null}>
        <torusGeometry args={[Math.min(visualW, visualL) * S * .47, Math.max(3, Math.min(visualW, visualL) * S * .018), 5, 24]} />
        <meshStandardMaterial color="#b9c4c7" metalness={.72} roughness={.35} transparent opacity={ghostOpacity} />
      </mesh>)}
      <mesh position={[0, 0, visualH * S * .47]} raycast={() => null}>
        <circleGeometry args={[visualW * S * .44, 24]} />
        <meshStandardMaterial color="#7d969e" metalness={.38} roughness={.48} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, visualH * S * .47]} raycast={() => null}>
        <torusGeometry args={[visualW * S * .44, visualW * S * .014, 5, 24]} />
        <meshStandardMaterial color="#c1cbcd" metalness={.72} roughness={.32} />
      </mesh>
      <mesh position={[visualL * S * .17, -visualW * S * .12, visualH * S * .48]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <cylinderGeometry args={[visualW * S * .045, visualW * S * .045, Math.max(3, visualH * S * .022), 12]} />
        <meshStandardMaterial color="#303b3f" metalness={.55} roughness={.5} />
      </mesh>
    </> : pipe ? <>
      <mesh rotation={[0, 0, -Math.PI / 2]} scale={[visualW * S * .43, visualL * S, visualW * S * .43]} material={materialFor(selected ? '#f2c94c' : '#8d999e', .42, ghostOpacity)} {...eventProps}>
        <cylinderGeometry args={[1, 1, 1, 20, 1, false]} />
      </mesh>
      <mesh position={[visualL * S * .49, 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <ringGeometry args={[visualW * S * .30, visualW * S * .43, 20]} />
        <meshStandardMaterial color="#30383b" side={THREE.DoubleSide} />
      </mesh>
    </> : ibc ? <>
      <MemoBox size={[visualL * S, visualW * S, visualH * S]} color={selected ? '#f2c94c' : '#d9e1d8'} roughness={.34} eventProps={eventProps} outline opacity={ghostOpacity} />
      {[-.44, -.15, .15, .44].map((t, i) => <MemoBox key={i} position={[t * visualL * S, 0, 0]} size={[Math.max(5, visualL * .022) * S, visualW * S * .98, visualH * S * .98]} color="#a8b2b4" roughness={.4} outline opacity={ghostOpacity} />)}
      {[-.44, .44].map((t, i) => <MemoBox key={i} position={[0, t * visualW * S, 0]} size={[visualL * S * .98, Math.max(5, visualW * .022) * S, visualH * S * .98]} color="#a8b2b4" roughness={.4} outline opacity={ghostOpacity} />)}
      <MemoBox size={[visualL * S * .22, visualW * S * .22, Math.max(12, visualH * .035) * S]} position={[0, 0, visualH * S * .45]} color="#3b4548" roughness={.5} outline opacity={ghostOpacity} />
    </> : vehicle ? <>
      <MemoBox size={[visualL * S * .98, visualW * S * .82, visualH * S * .43]} position={[0, 0, -visualH * S * .16]} color={selected ? '#f2c94c' : '#477b9a'} roughness={.38} eventProps={eventProps} outline opacity={ghostOpacity} />
      <MemoBox size={[visualL * S * .48, visualW * S * .68, visualH * S * .34]} position={[-visualL * S * .04, 0, visualH * S * .22]} color={selected ? '#f2c94c' : '#83a6b8'} roughness={.28} outline opacity={ghostOpacity} />
      {[-.32, .32].flatMap((x, i) => [-1, 1].map((side, j) => {
        const tireRadius = Math.min(visualH * .12, visualW * .105) * S
        const tireWidth = Math.min(visualW * .10, visualH * .09) * S
        return <mesh key={i * 2 + j} position={[x * visualL * S, side * (visualW * S / 2 - tireWidth / 2), -visualH * S * .27]} raycast={() => null}>
        <cylinderGeometry args={[tireRadius, tireRadius, tireWidth, 16]} />
        <meshStandardMaterial color="#202629" roughness={.9} />
      </mesh>
      }))}
      <MemoBox size={[visualL * S * .025, visualW * S * .52, visualH * S * .13]} position={[visualL * S * .17, 0, visualH * S * .23]} color="#293b46" roughness={.35} opacity={ghostOpacity} />
      <MemoBox size={[visualL * S * .025, visualW * S * .52, visualH * S * .11]} position={[-visualL * S * .22, 0, visualH * S * .22]} color="#293b46" roughness={.35} opacity={ghostOpacity} />
      {[-1, 1].map(side => <MemoBox key={side} size={[visualL * S * .30, visualW * S * .018, visualH * S * .12]} position={[-visualL * S * .04, side * visualW * S * .32, visualH * S * .23]} color="#293b46" roughness={.35} opacity={ghostOpacity} />)}
      <MemoBox size={[visualL * S * .035, visualW * S * .30, visualH * S * .075]} position={[visualL * S * .475, 0, -visualH * S * .19]} color="#26343a" roughness={.45} opacity={ghostOpacity} />
    </> : machinery ? <>
      <MemoBox size={[visualL * S, visualW * S, visualH * S]} color={selected ? '#f2c94c' : '#8b9690'} roughness={.62} eventProps={eventProps} outline opacity={ghostOpacity} />
      <MemoBox size={[visualL * S * .72, visualW * S * .72, visualH * S * .12]} position={[0, 0, visualH * S * .56]} color="#515d59" roughness={.55} outline opacity={ghostOpacity} />
      {[-.3, .3].map((x, i) => <MemoBox key={i} position={[x * visualL * S, 0, visualH * S * .18]} size={[Math.max(8, visualL * .035) * S, visualW * S * .78, visualH * S * .12]} color="#c0a34e" roughness={.65} outline opacity={ghostOpacity} />)}
    </> : <>
      <MemoBox size={[visualL * S, visualW * S, visualH * S]} color={mainColor} roughness={.62} eventProps={eventProps} outline opacity={ghostOpacity} />
      {p.cargoType === 'carton' && <>
        <MemoBox position={[0, 0, visualH * S * .48]} size={[visualL * S * .12, visualW * S * .94, Math.max(2, visualH * .01) * S]} color={selected ? '#b89036' : '#d6b57b'} roughness={.88} opacity={ghostOpacity} />
        <MemoBox position={[0, 0, visualH * S * .48]} size={[visualL * S * .94, visualW * S * .045, Math.max(2, visualH * .01) * S]} color={selected ? '#b89036' : '#d6b57b'} roughness={.88} opacity={ghostOpacity} />
        <MemoBox position={[0, visualW * S * .48, 0]} size={[visualL * S * .02, Math.max(2, visualW * .01) * S, visualH * S * .94]} color="#8e704c" roughness={.9} opacity={ghostOpacity} />
      </>}
    </>}
    {showName && <Html position={[0, 0, p.height * S / 2 + .02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

const cargoEqual = (a: CargoModelProps, b: CargoModelProps) => {
  const ap = a.p, bp = b.p
  return ap.id === bp.id && ap.cargoId === bp.cargoId && ap.cargoType === bp.cargoType &&
    ap.x === bp.x && ap.y === bp.y && ap.z === bp.z && ap.length === bp.length &&
    ap.width === bp.width && ap.height === bp.height && ap.rotation === bp.rotation &&
    ap.color === bp.color && a.selected === b.selected && a.showName === b.showName &&
    a.local === b.local && a.hovered === b.hovered && a.ghost === b.ghost && a.container.length === b.container.length &&
    a.container.width === b.container.width && a.container.height === b.container.height
}

export default memo(CargoModel, cargoEqual)
