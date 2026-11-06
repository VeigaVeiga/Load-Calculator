import { Html, useGLTF } from '@react-three/drei'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { memo, Suspense, useMemo } from 'react'
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

const edgeMaterialFor = (color: string, opacity = 1) => {
  const key = `edge:${color}:${opacity}`
  let material = EDGE_MATERIAL_CACHE.get(key)
  if (!material) {
    material = new THREE.LineBasicMaterial({ color: '#4d5458', transparent: true, opacity: .78 * opacity, depthWrite: false })
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
  const edgeMaterial = useMemo(() => edgeMaterialFor(color, opacity), [color, opacity])
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

type VehicleCargoModelProps = {
  length: number
  width: number
  height: number
  selected: boolean
  opacity: number
  eventProps: any
}

function VehicleCargoModel({ length, width, height, selected, opacity, eventProps }: VehicleCargoModelProps) {
  const { scene } = useGLTF('/models/passenger-sedan.glb')
  const fitted = useMemo(() => {
    const root = scene.clone(true)
    const permutations: number[][] = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ]
    const signs = [-1, 1]
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ]
    const targetRatios = [
      length / Math.max(width, .0001),
      length / Math.max(height, .0001),
      width / Math.max(height, .0001),
    ]
    let bestBounds = new THREE.Box3()
    const bestRotation = new THREE.Quaternion()
    let bestScore = Infinity

    // Find the right-handed axis orientation whose proportions best match a
    // road vehicle: long along X, width along Y and height along Z.
    for (const permutation of permutations) {
      for (const sx of signs) for (const sy of signs) for (const sz of signs) {
        const basis = [
          axes[permutation[0]].clone().multiplyScalar(sx),
          axes[permutation[1]].clone().multiplyScalar(sy),
          axes[permutation[2]].clone().multiplyScalar(sz),
        ]
        const rotation = new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2])
        if (rotation.determinant() < 0) continue
        root.quaternion.setFromRotationMatrix(rotation)
        root.position.set(0, 0, 0)
        root.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(root)
        const size = bounds.getSize(new THREE.Vector3())
        if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue
        const ratios = [
          size.x / size.y,
          size.x / size.z,
          size.y / size.z,
        ]
        const score = ratios.reduce((sum, ratio, i) =>
          sum + Math.abs(Math.log(Math.max(ratio, .0001) / targetRatios[i])), 0)
        if (score < bestScore) {
          bestScore = score
          bestBounds.copy(bounds)
          bestRotation.setFromRotationMatrix(rotation)
        }
      }
    }

    root.quaternion.copy(bestRotation)
    root.position.set(0, 0, 0)
    root.updateMatrixWorld(true)
    const size = bestBounds.getSize(new THREE.Vector3())
    // Keep the imported car's proportions. Fit it uniformly inside the
    // declared vehicle envelope instead of stretching each axis independently.
    const scale = Math.min(
      length / Math.max(size.x, .0001),
      width / Math.max(size.y, .0001),
      height / Math.max(size.z, .0001),
    )
    const center = bestBounds.getCenter(new THREE.Vector3())
    // The cargo origin is at its geometric centre. Centre the car in X/Y and
    // put the lowest point (normally the tyres) exactly on the cargo bottom.
    root.position.set(
      -center.x,
      -center.y,
      -height / (2 * scale) - bestBounds.min.z,
    )
    const fitRoot = new THREE.Group()
    fitRoot.scale.setScalar(scale)
    fitRoot.add(root)

    root.traverse(node => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const applyAppearance = (source: THREE.Material) => {
        const material = source.clone()
        material.transparent = opacity < 1 || material.transparent
        material.opacity *= opacity
        if (opacity < 1) material.depthWrite = false
        if (selected && material instanceof THREE.MeshStandardMaterial) {
          material.emissive.set('#b88920')
          material.emissiveIntensity = .16
        }
        return material
      }
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(applyAppearance)
        : applyAppearance(mesh.material)
    })
    return { root: fitRoot }
  }, [scene, length, width, height, selected, opacity])

  return <group {...eventProps}>
    <primitive object={fitted.root} />
  </group>
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
  ghost?: boolean
  ghostOpacity?: number
}

function CargoModel({ p, container, selected, onPointerDown, onPointerUp, onPointerMove, onClick, showName = false, local = false, hovered = false, ghost = false, ghostOpacity: ghostOpacityOverride }: CargoModelProps) {
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
  const ghostOpacity = ghostOpacityOverride ?? (ghost ? .24 : 1)
  const eventProps = useMemo(() => ({ onPointerDown, onPointerMove, onPointerUp, onClick }), [onPointerDown, onPointerMove, onPointerUp, onClick])
  const detail = (n: number, min = 2) => Math.max(min, n) * S
  return <group position={pos} rotation={[0, 0, local ? 0 : p.rotation * Math.PI / 180]}>
    {pallet ? <>
      {/* Lightweight legacy pallet model: one load block and a simple deck/runner structure. */}
      <group position={[0, 0, (-rawH / 2 + Math.min(120, Math.max(70, rawH * .08) ) / 2) * S]}>
        <MemoBox size={[L, W, Math.min(120, Math.max(70, rawH * .08)) * S * .32]} color="#b57b45" roughness={.86} eventProps={eventProps} outline opacity={ghostOpacity} />
        {[-.34, 0, .34].map((t, i) => <MemoBox key={`deck-${i}`} position={[0, t * W * .28, Math.min(120, Math.max(70, rawH * .08)) * S * .34]} size={[L, W * .16, Math.min(120, Math.max(70, rawH * .08)) * S * .22]} color="#8a5a32" roughness={.86} opacity={ghostOpacity} />)}
        {[-.34, 0, .34].map((t, i) => <MemoBox key={`runner-${i}`} position={[t * L, 0, -Math.min(120, Math.max(70, rawH * .08)) * S * .20]} size={[Math.max(55, rawL * .11) * S, W * .72, Math.min(120, Math.max(70, rawH * .08)) * S * .36]} color="#76502f" roughness={.88} opacity={ghostOpacity} />)}
      </group>
      <MemoBox size={[L, W, Math.max(1, rawH - Math.min(120, Math.max(70, rawH * .08))) * S]} position={[0, 0, (-rawH / 2 + Math.min(120, Math.max(70, rawH * .08)) + Math.max(1, rawH - Math.min(120, Math.max(70, rawH * .08))) / 2) * S]} color={mainColor} roughness={.68} eventProps={eventProps} outline opacity={ghostOpacity} />
    </> : crate ? (() => {
      // Open timber export crate: corner uprights, perimeter rails, spaced slats and a skid base.
      const postX = Math.max(35, rawL * .055) * S
      const postY = Math.max(35, rawW * .055) * S
      const railZ = Math.max(28, rawH * .055) * S
      const railX = Math.max(30, rawL * .045) * S
      const railY = Math.max(30, rawW * .045) * S
      const board = Math.max(18, Math.min(rawL, rawW) * .035) * S
      const zTop = H * .5 - railZ * .5
      const zBottom = -H * .5 + railZ * .5
      return <>
        {[-1, 1].flatMap(x => [-1, 1].map(y => <MemoBox key={`crate-post-${x}-${y}`} position={[x * (L - postX) * .5, y * (W - postY) * .5, 0]} size={[postX, postY, H]} color="#85552f" roughness={.9} outline opacity={ghostOpacity}/>))}
        {[-1, 1].flatMap(y => [-1, 1].map(z => <MemoBox key={`crate-long-rail-${y}-${z}`} position={[0, y * (W - railY) * .5, z > 0 ? zTop : zBottom]} size={[L - postX * .5, railY, railZ]} color="#b47a43" roughness={.88} outline opacity={ghostOpacity}/>))}
        {[-1, 1].flatMap(x => [-1, 1].map(z => <MemoBox key={`crate-end-rail-${x}-${z}`} position={[x * (L - railX) * .5, 0, z > 0 ? zTop : zBottom]} size={[railX, W - postY * .5, railZ]} color="#a96f3b" roughness={.88} outline opacity={ghostOpacity}/>))}
        {[-1, 1].flatMap(y => [ -.24, 0, .24 ].map((t, i) => <MemoBox key={`crate-side-slat-${y}-${i}`} position={[0, y * (W / 2 - postY / 2), t * H]} size={[Math.max(1, L - postX * 2), board, Math.max(24, rawH * .075) * S]} color="#c18b52" roughness={.9} opacity={ghostOpacity}/>))}
        {[-1, 1].flatMap(x => [ -.24, 0, .24 ].map((t, i) => <MemoBox key={`crate-end-slat-${x}-${i}`} position={[x * (L / 2 - postX / 2), 0, t * H]} size={[board, Math.max(1, W - postY * 2), Math.max(24, rawH * .075) * S]} color="#bd844a" roughness={.9} opacity={ghostOpacity}/>))}
        {[-.32, .32].map((y, i) => <MemoBox key={`crate-floor-${i}`} position={[0, y * W, zBottom - railZ * .35]} size={[L * .96, board, railZ * .7]} color="#79502e" roughness={.92} opacity={ghostOpacity}/> )}
        <MemoBox size={[L * .98, W * .08, railZ * .8]} position={[0, 0, -H * .5 + railZ * .25]} color="#79502e" roughness={.92} opacity={ghostOpacity}/>
      </>
    })() : drum ? (() => {
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
    </> : vehicle ? <Suspense fallback={<MemoBox size={[L * .98, W * .84, H * .72]} color={selected ? '#f2c94c' : '#9b5144'} roughness={.45} eventProps={eventProps} outline opacity={ghostOpacity} />}>
      <VehicleCargoModel length={L} width={W} height={H} selected={selected} opacity={ghostOpacity} eventProps={eventProps} />
    </Suspense> : machinery ? <>
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
    a.local === b.local && a.hovered === b.hovered && a.ghost === b.ghost && a.ghostOpacity === b.ghostOpacity && a.container.length === b.container.length &&
    a.container.width === b.container.width && a.container.height === b.container.height
}

export default memo(CargoModel, cargoEqual)
