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

export const materialFor = (color: string, roughness: number) => {
  const key = `${color}|${roughness}`
  let material = MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness })
    MATERIAL_CACHE.set(key, material)
  }
  return material
}

const edgeMaterialFor = (_color: string) => {
  const key = 'edge:industrial'
  let material = EDGE_MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.LineBasicMaterial({ color: '#30373b', transparent: true, opacity: .82 })
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
}

function Box({ size, position = [0, 0, 0], color, roughness = .7, eventProps, outline = false }: BoxProps) {
  const material = useMemo(() => materialFor(color, roughness), [color, roughness])
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
  a.eventProps === b.eventProps,
)

function Panel({ size, position, color = '#d9dddc', roughness = .56 }: {
  size: [number, number, number]
  position: [number, number, number]
  color?: string
  roughness?: number
}) {
  return <MemoBox size={size} position={position} color={color} roughness={roughness} outline />
}

function Port({ position, rotation = [Math.PI / 2, 0, 0] as [number, number, number], radius, depth, color = '#687176', ring = '#343b3f' }: {
  position: [number, number, number]
  rotation?: [number, number, number]
  radius: number
  depth: number
  color?: string
  ring?: string
}) {
  const outer = useMemo(() => new THREE.CylinderGeometry(radius, radius, depth, 20), [radius, depth])
  const inner = useMemo(() => new THREE.CylinderGeometry(radius * .62, radius * .62, depth * 1.08, 20), [radius, depth])
  const outerMat = useMemo(() => materialFor(ring, .48), [ring])
  const innerMat = useMemo(() => materialFor(color, .4), [color])
  return <group position={position} rotation={rotation}>
    <mesh geometry={outer} material={outerMat} />
    <mesh geometry={inner} material={innerMat} position={[0, depth * .04, 0]} />
  </group>
}

function CargoInterface({ l, w, h, accent, companion }: { l: number; w: number; h: number; accent: string; companion: boolean }) {
  const panel = Math.max(70, Math.min(l, w) * .42) * S
  const plate = Math.max(8, Math.min(l, w) * .035) * S
  const z = h * .5 * S + plate * .5
  return <>
    <MemoBox size={[panel, panel, plate]} position={[0, 0, z]} color="#bfc5c5" roughness={.48} outline />
    <Port position={[0, 0, z + plate * .75]} radius={panel * .25} depth={plate * .85} color={accent} ring="#343b3e" />
    {companion && <>
      <MemoBox size={[panel * .62, panel * .075, plate * .65]} position={[0, panel * .31, z + plate * .9]} color="#343b3e" roughness={.42} />
      <MemoBox size={[panel * .075, panel * .62, plate * .65]} position={[panel * .31, 0, z + plate * .9]} color="#343b3e" roughness={.42} />
    </>}
  </>
}

function IndustrialCargo({ p, eventProps, selected, hovered }: { p: PlacedCargo; eventProps: any; selected: boolean; hovered: boolean }) {
  const l = p.length, w = p.width, h = p.height
  const accent = selected ? '#e5bd45' : hovered ? '#d9b34c' : '#6e9aa3'
  const body = selected ? '#d8d6c8' : hovered ? '#d4d7d4' : '#c8cdcc'
  const dark = '#687075'
  const seam = '#7c8588'
  const corner = Math.max(26, Math.min(l, w, h) * .055)
  const rail = Math.max(10, Math.min(l, w) * .025)
  const companion = /companion|partner|伙伴/i.test(p.cargoId || '')
  const plate = Math.max(9, Math.min(l, w) * .028)
  return <>
    <MemoBox size={[l * S, w * S, h * S]} color={body} roughness={.58} eventProps={eventProps} outline />

    <Panel size={[l * .90 * S, rail * S, h * .86 * S]} position={[0, -w * .5 * S - rail * .12 * S, 0]} color={dark} roughness={.56} />
    <Panel size={[rail * S, w * .90 * S, h * .86 * S]} position={[-l * .5 * S - rail * .12 * S, 0, 0]} color={dark} roughness={.56} />

    {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sy], i) => (
      <MemoBox key={`corner-${i}`} size={[corner * S, corner * S, h * .90 * S]} position={[sx * (l * .5 - corner * .5) * S, sy * (w * .5 - corner * .5) * S, 0]} color="#555e62" roughness={.5} outline />
    ))}

    <CargoInterface l={l} w={w} h={h} accent={accent} companion={companion} />

    <MemoBox size={[l * .74 * S, plate * S, plate * .7 * S]} position={[0, w * .5 * S + plate * .35 * S, h * .22 * S]} color={seam} roughness={.5} />
    <MemoBox size={[l * .74 * S, plate * S, plate * .7 * S]} position={[0, w * .5 * S + plate * .35 * S, -h * .22 * S]} color={seam} roughness={.5} />
    {[-.25, 0, .25].map((t, i) => <mesh key={`light-${i}`} position={[t * l * S, w * .5 * S + plate * .75 * S, h * .28 * S]}>
      <sphereGeometry args={[Math.max(4, plate * .42), 10, 10]} />
      <meshStandardMaterial color={i === 1 ? accent : '#657276'} emissive={i === 1 ? accent : '#000000'} emissiveIntensity={i === 1 ? .8 : 0} roughness={.32} />
    </mesh>)}

    {companion && <>
      <MemoBox size={[l * .58 * S, plate * S, plate * .75 * S]} position={[0, -w * .5 * S - plate * .38 * S, 0]} color="#3f484c" roughness={.44} />
      <MemoBox size={[plate * S, w * .58 * S, plate * .75 * S]} position={[l * .5 * S + plate * .38 * S, 0, 0]} color="#3f484c" roughness={.44} />
      <Port position={[0, -w * .5 * S - plate * .75 * S, 0]} radius={Math.max(18, Math.min(l, w) * .16) * S} depth={plate * .7 * S} color="#7fa8ad" ring="#31383b" rotation={[Math.PI / 2, 0, 0]} />
    </>}
  </>
}

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
  const visualL = p.length
  const visualW = p.width
  const visualH = p.height
  const pos: [number, number, number] = local
    ? [0, 0, 0]
    : [(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + visualH / 2) * S]
  const eventProps = useMemo(() => ({ onPointerDown, onPointerMove, onPointerUp, onClick }), [onPointerDown, onPointerMove, onPointerUp, onClick])
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const palletDeckH = pallet ? Math.min(120, Math.max(70, visualH * .08)) : 0
  const bodyH = pallet ? Math.max(1, visualH - palletDeckH) : visualH

  const model = pallet ? <>
    <group position={[0, 0, (-visualH / 2 + palletDeckH / 2) * S]}>
      <MemoBox size={[visualL * S, visualW * S, palletDeckH * S * .32]} color="#777f80" roughness={.7} eventProps={eventProps} outline />
      {[-.34, 0, .34].map((i, k) => <MemoBox key={`deck-${k}`} position={[0, i * visualW * S * .28, palletDeckH * S * .34]} size={[visualL * S, visualW * S * .16, palletDeckH * S * .22]} color="#a8adab" roughness={.72} outline />)}
      {[-.34, 0, .34].map((i, k) => <MemoBox key={`runner-${k}`} position={[i * visualL * S, 0, -palletDeckH * S * .20]} size={[Math.max(55, visualL * .11) * S, visualW * S * .72, palletDeckH * S * .36]} color="#555d60" roughness={.72} outline />)}
    </group>
    <group position={[0, 0, (-visualH / 2 + palletDeckH + bodyH / 2) * S]}>
      <IndustrialCargo p={{ ...p, height: bodyH }} eventProps={eventProps} selected={selected} hovered={hovered} />
    </group>
  </> : crate ? <>
    <MemoBox size={[visualL * S, visualW * S, visualH * S]} color="#77706a" roughness={.78} eventProps={eventProps} outline />
    {[-.38, -.13, .13, .38].map((t, i) => <MemoBox key={`sx${i}`} position={[0, t * visualW * S, 0]} size={[visualL * S * .96, Math.max(12, visualW * .045) * S, visualH * S * .96]} color="#9b9188" roughness={.76} outline />)}
    {[-.40, 0, .40].map((t, i) => <MemoBox key={`sz${i}`} position={[t * visualL * S, 0, 0]} size={[Math.max(12, visualL * .045) * S, visualW * S * .96, visualH * S * .96]} color="#8b8179" roughness={.76} outline />)}
    <CargoInterface l={visualL} w={visualW} h={visualH} accent="#8ca4a8" companion={false} />
  </> : <IndustrialCargo p={p} eventProps={eventProps} selected={selected} hovered={hovered} />

  return <group position={pos} rotation={[0, 0, local ? 0 : p.rotation * Math.PI / 180]}>
    {model}
    {showName && <Html position={[0, 0, p.height * S / 2 + .02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
  </group>
}

const cargoEqual = (a: CargoModelProps, b: CargoModelProps) => {
  const ap = a.p, bp = b.p
  return ap.id === bp.id && ap.cargoId === bp.cargoId && ap.cargoType === bp.cargoType &&
    ap.x === bp.x && ap.y === bp.y && ap.z === bp.z && ap.length === bp.length &&
    ap.width === bp.width && ap.height === bp.height && ap.rotation === bp.rotation &&
    ap.color === bp.color && a.selected === b.selected && a.showName === b.showName &&
    a.local === b.local && a.hovered === b.hovered && a.container.length === b.container.length &&
    a.container.width === b.container.width && a.container.height === b.container.height
}

export default memo(CargoModel, cargoEqual)
