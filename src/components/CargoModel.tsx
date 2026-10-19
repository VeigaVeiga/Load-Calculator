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
  const L = Math.max(1, p.length) * S
  const W = Math.max(1, p.width) * S
  const H = Math.max(1, p.height) * S
  const rawL = Math.max(1, p.length)
  const rawW = Math.max(1, p.width)
  const rawH = Math.max(1, p.height)
  const pos: [number, number, number] = local
    ? [0, 0, 0]
    : [(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + rawH / 2) * S]
  const mainColor = selected ? '#f2c94c' : hovered ? '#ffd166' : (p.color || '#c7ced3')
  const crate = p.cargoType === 'woodCrate'
  const pallet = p.cargoType === 'pallet'
  const drum = p.cargoType === 'drum'
  const pipe = p.cargoType === 'pipe'
  const ibc = p.cargoType === 'ibc'
  const vehicle = p.cargoType === 'vehicle'
  const machinery = p.cargoType === 'machinery'
  const ghostOpacity = ghost ? .24 : 1
  const eventProps = useMemo(() => ({ onPointerDown, onPointerMove, onPointerUp, onClick }), [onPointerDown, onPointerMove, onPointerUp, onClick])
  const detail = (n: number, min = 2) => Math.max(min, n) * S

  return <group position={pos} rotation={[0, 0, local ? 0 : p.rotation * Math.PI / 180]}>
    {pallet ? <>
      {/* Lightweight legacy pallet model: one load block and a simple deck/runner structure. */}
      <group position={[0, 0, (-rawH / 2 + Math.min(120, Math.max(70, rawH * .08) ) / 2) * S]}>
        <MemoBox size={[L, W, Math.min(120, Math.max(70, rawH * .08)) * S * .32]} color="#b57b45" roughness={.86} eventProps={eventProps} outline opacity={ghostOpacity} />
        {[-.34, 0, .34].map((t, i) => <MemoBox key={`deck-${i}`} position={[0, t * W * .28, Math.min(120, Math.max(70, rawH * .08)) * S * .34]} size={[L, W * .16, Math.min(120, Math.max(70, rawH * .08)) * S * .22]} color="#8a5a32" roughness={.86} outline opacity={ghostOpacity} />)}
        {[-.34, 0, .34].map((t, i) => <MemoBox key={`runner-${i}`} position={[t * L, 0, -Math.min(120, Math.max(70, rawH * .08)) * S * .20]} size={[Math.max(55, rawL * .11) * S, W * .72, Math.min(120, Math.max(70, rawH * .08)) * S * .36]} color="#76502f" roughness={.88} outline opacity={ghostOpacity} />)}
      </group>
      <MemoBox size={[L, W, Math.max(1, rawH - Math.min(120, Math.max(70, rawH * .08))) * S]} position={[0, 0, (-rawH / 2 + Math.min(120, Math.max(70, rawH * .08)) + Math.max(1, rawH - Math.min(120, Math.max(70, rawH * .08))) / 2) * S]} color={mainColor} roughness={.68} eventProps={eventProps} outline opacity={ghostOpacity} />
    </> : crate ? <>
      {/* Lightweight legacy crate model; avoid dozens of overlapping detail meshes. */}
      <MemoBox size={[L, W, H]} color="#9a6638" roughness={.82} eventProps={eventProps} outline opacity={ghostOpacity} />
      {[-.38, -.13, .13, .38].map((t, i) => <MemoBox key={`sx${i}`} position={[0, t * W, 0]} size={[L * .96, Math.max(12, rawW * .045) * S, H * .96]} color="#c08a52" roughness={.84} outline opacity={ghostOpacity} />)}
      {[-.40, 0, .40].map((t, i) => <MemoBox key={`sz${i}`} position={[t * L, 0, 0]} size={[Math.max(12, rawL * .045) * S, W * .96, H * .96]} color="#b97d46" roughness={.84} outline opacity={ghostOpacity} />)}
    </>: drum ? (() => {
      const diameter = Math.min(rawL, rawW) * .91 * S
      const radius = diameter / 2
      return <>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[radius, H * .96, radius]} material={materialFor(selected ? '#f2c94c' : mainColor, .48, ghostOpacity)} {...eventProps}>
          <cylinderGeometry args={[1, 1, 1, 32, 1, false]} />
        </mesh>
        {[-.34, .34].map((t, i) => <mesh key={`drum-rib-${i}`} position={[0, 0, t * H]} raycast={() => null}>
          <torusGeometry args={[radius * 1.005, Math.max(.003, radius * .035), 6, 32]} />
          <meshStandardMaterial color="#aab5b9" metalness={.65} roughness={.38} transparent opacity={ghostOpacity} />
        </mesh>)}
        <mesh position={[0, 0, H * .48]} raycast={() => null}>
          <circleGeometry args={[radius * .99, 32]} />
          <meshStandardMaterial color="#a7b3b7" metalness={.42} roughness={.5} side={THREE.DoubleSide} transparent opacity={ghostOpacity} />
        </mesh>
        <mesh position={[0, 0, H * .485]} raycast={() => null}>
          <torusGeometry args={[radius * .88, Math.max(.002, radius * .018), 6, 32]} />
          <meshStandardMaterial color="#566267" metalness={.6} roughness={.38} transparent opacity={ghostOpacity} />
        </mesh>
        <mesh position={[radius * .42, -radius * .28, H * .493]} raycast={() => null}>
          <cylinderGeometry args={[radius * .055, radius * .055, Math.max(.004, H * .012), 12]} />
          <meshStandardMaterial color="#384347" metalness={.55} roughness={.45} />
        </mesh>
      </>
    })() : pipe ? (() => {
      const diameter = Math.min(rawW, rawH) * .28
      const radius = diameter * S / 2
      const spacing = diameter * .86 * S
      const rows: Array<[number, number]> = [[-.5, -.5], [0, -.5], [.5, -.5], [-.5, .5], [0, .5], [.5, .5], [0, 0]]
      return <>
        {rows.map(([x, z], i) => <group key={`pipe-${i}`} position={[0, x * spacing * 1.65, z * spacing * 1.65]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh scale={[radius, L * .98, radius]} material={materialFor(selected ? '#f2c94c' : (i % 2 ? '#9ca7ab' : '#7f8c91'), .4, ghostOpacity)} {...(i === 0 ? eventProps : {})}>
            <cylinderGeometry args={[1, 1, 1, 20, 1, false]} />
          </mesh>
          <mesh position={[0, L * .49, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <ringGeometry args={[radius * .72, radius, 20]} />
            <meshStandardMaterial color="#454e52" metalness={.5} roughness={.45} side={THREE.DoubleSide} transparent opacity={ghostOpacity} />
          </mesh>
        </group>)}
        {[-.32, .32].map((t, i) => <MemoBox key={`pipe-band-${i}`} position={[t * L, 0, 0]} size={[detail(rawL * .025, 20), W * .98, detail(rawH * .025, 20)]} color="#b1a078" roughness={.65} outline opacity={ghostOpacity} />)}
      </>
    })() : ibc ? <>
      <MemoBox size={[L * .91, W * .91, H * .91]} color={selected ? '#f2c94c' : '#dfe5dc'} roughness={.34} eventProps={eventProps} outline opacity={ghostOpacity} />
      <MemoBox size={[L * .94, W * .94, detail(rawH * .055, 18)]} position={[0, 0, -H * .43]} color="#899398" roughness={.62} outline opacity={ghostOpacity} />
      {/* Galvanized cage uprights and horizontal rails. */}
      {[-.43, -.14, .14, .43].map((t, i) => <MemoBox key={`ibc-x-${i}`} position={[t * L, 0, 0]} size={[detail(rawL * .025, 9), W * .99, H * .99]} color="#aab5b8" roughness={.4} outline opacity={ghostOpacity} />)}
      {[-.43, -.14, .14, .43].map((t, i) => <MemoBox key={`ibc-y-${i}`} position={[0, t * W, 0]} size={[L * .99, detail(rawW * .025, 9), H * .99]} color="#aab5b8" roughness={.4} outline opacity={ghostOpacity} />)}
      {[-.43, .43].map((x, i) => [-.43, .43].map((y, j) => <MemoBox key={`ibc-corner-${i}-${j}`} position={[x * L, y * W, 0]} size={[detail(rawL * .035, 12), detail(rawW * .035, 12), H]} color="#89969a" roughness={.4} outline opacity={ghostOpacity} />))}
      <MemoBox size={[L * .2, W * .2, detail(rawH * .035, 12)]} position={[0, 0, H * .465]} color="#354247" roughness={.42} outline opacity={ghostOpacity} />
      <mesh position={[L * .08, -W * .12, H * .48]} raycast={() => null}><cylinderGeometry args={[detail(rawW * .045, 8), detail(rawW * .045, 8), detail(rawH * .025, 8), 12]} /><meshStandardMaterial color="#48575b" roughness={.5} /></mesh>
    </> : vehicle ? <>
      {/* A simplified but recognizable passenger vehicle: hood, cabin, glazing, wheels and lights. */}
      <MemoBox size={[L * .96, W * .83, H * .3]} position={[L * .01, 0, -H * .12]} color={selected ? '#f2c94c' : '#477b9a'} roughness={.34} eventProps={eventProps} outline opacity={ghostOpacity} />
      <MemoBox size={[L * .43, W * .7, H * .37]} position={[-L * .07, 0, H * .205]} color={selected ? '#f2c94c' : '#6e99ad'} roughness={.3} outline opacity={ghostOpacity} />
      <MemoBox size={[L * .21, W * .72, H * .2]} position={[L * .31, 0, H * .02]} color={selected ? '#f2c94c' : '#477b9a'} roughness={.32} outline opacity={ghostOpacity} />
      {[-1, 1].map(side => <MemoBox key={`windshield-side-${side}`} size={[L * .29, W * .018, H * .22]} position={[-L * .07, side * W * .355, H * .22]} color="#243c48" roughness={.26} opacity={ghostOpacity} />)}
      <MemoBox size={[L * .19, W * .61, H * .025]} position={[-L * .07, 0, H * .395]} color="#b9d1d9" roughness={.32} opacity={ghostOpacity * .9} />
      {[-.31, .31].flatMap((x, i) => [-1, 1].map((side, j) => {
        const wheelR = Math.min(rawH * .145, rawW * .105) * S
        const wheelW = Math.min(rawW * .085, rawH * .08) * S
        return <group key={`wheel-${i}-${j}`} position={[x * L, side * (W * .405), -H * .29]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}><cylinderGeometry args={[wheelR, wheelR, wheelW, 20]} /><meshStandardMaterial color="#252a2c" roughness={.88} /></mesh>
          <mesh position={[0, side * wheelW * .52, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}><cylinderGeometry args={[wheelR * .52, wheelR * .52, wheelW * .12, 16]} /><meshStandardMaterial color="#aeb8ba" metalness={.6} roughness={.4} /></mesh>
        </group>
      }))}
      {[-1, 1].map(side => <group key={`lights-${side}`}>
        <MemoBox size={[detail(rawL * .035, 12), W * .13, H * .07]} position={[L * .475, side * W * .29, -H * .13]} color="#e8dfb9" roughness={.28} opacity={ghostOpacity} />
        <MemoBox size={[detail(rawL * .035, 12), W * .13, H * .07]} position={[-L * .475, side * W * .29, -H * .13]} color="#c95849" roughness={.3} opacity={ghostOpacity} />
      </group>)}
    </> : machinery ? <>
      <MemoBox size={[L * .96, W * .94, H * .72]} position={[0, 0, H * .04]} color={selected ? '#f2c94c' : '#7f8985'} roughness={.58} eventProps={eventProps} outline opacity={ghostOpacity} />
      <MemoBox size={[L * .99, W * .97, detail(rawH * .09, 24)]} position={[0, 0, -H * .42]} color="#515d59" roughness={.62} outline opacity={ghostOpacity} />
      <MemoBox size={[L * .74, W * .72, H * .14]} position={[0, 0, H * .43]} color="#5c6863" roughness={.55} outline opacity={ghostOpacity} />
      {[-.32, .32].map((x, i) => <MemoBox key={`machine-rib-${i}`} position={[x * L, 0, H * .06]} size={[detail(rawL * .045, 16), W * .98, H * .78]} color="#a7a99a" roughness={.58} outline opacity={ghostOpacity} />)}
      <MemoBox size={[L * .25, detail(rawW * .035, 14), H * .24]} position={[L * .25, -W * .49, H * .13]} color="#c3aa55" roughness={.42} outline opacity={ghostOpacity} />
      {[-.35, .35].map((x, i) => <MemoBox key={`lifting-lug-${i}`} position={[x * L, 0, H * .49]} size={[detail(rawL * .08, 24), W * .13, detail(rawH * .035, 12)]} color="#c3a85b" roughness={.42} outline opacity={ghostOpacity} />)}
    </> : <>
      {/* Shipping carton / reusable tote: exact outer envelope, closure tape and a shipping label. */}
      <MemoBox size={[L, W, H]} color={mainColor} roughness={.86} eventProps={eventProps} outline opacity={ghostOpacity} />
      {p.cargoType === 'carton' && <>
        <MemoBox position={[0, 0, H * .485]} size={[L * .12, W * .96, detail(rawH * .012, 2)]} color={selected ? '#b89036' : '#d9bd8c'} roughness={.88} opacity={ghostOpacity} />
        <MemoBox position={[0, 0, H * .485]} size={[L * .96, W * .045, detail(rawH * .012, 2)]} color={selected ? '#b89036' : '#d9bd8c'} roughness={.88} opacity={ghostOpacity} />
        <MemoBox position={[0, W * .501, H * .04]} size={[L * .27, detail(rawW * .006, 2), H * .2]} color="#eee9dc" roughness={.72} opacity={ghostOpacity} />
        <MemoBox position={[0, W * .504, H * .055]} size={[L * .19, detail(rawW * .002, 1), H * .012]} color="#42494a" roughness={.8} opacity={ghostOpacity} />
        {[-.035, 0, .035].map((x, i) => <MemoBox key={`label-line-${i}`} position={[x * L, W * .506, H * .02]} size={[detail(rawL * .006, 1), detail(rawW * .002, 1), H * .06]} color="#62696a" roughness={.8} opacity={ghostOpacity} />)}
      </>}
    </>}
    {showName && <Html position={[0, 0, H / 2 + .02]} center><div className="cargo-name-label">{p.cargoId}</div></Html>}
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
