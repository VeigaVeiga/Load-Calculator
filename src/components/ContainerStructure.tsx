import { Html, Line } from '@react-three/drei'
import type { ReactNode } from 'react'
import type { Container } from '../types'

const S = .001
const BEAM = '#2f6f9f'
const EDGE = '#5e8db3'

// The loading view is dimensioned against the usable internal height. The
// external height remains visible in the top information panel, but the 3D
// shell no longer adds the ~200 mm roof/floor difference and makes the user
// think another cargo layer can physically fit.
function visualHeight(container: Container) {
  return container.height * S
}

function Beam({ position, size, color = BEAM, opacity = .96 }: { position: [number, number, number]; size: [number, number, number]; color?: string; opacity?: number }) {
  return <mesh position={position} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} metalness={.15} roughness={.58} /></mesh>
}

function Panel({ position, size, opacity = .08 }: { position: [number, number, number]; size: [number, number, number]; opacity?: number }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color="#7da8c6" transparent opacity={opacity} depthWrite={false} /></mesh>
}

function SideWall({ y, container }: { y: number; container: Container }) {
  const L = container.outerLength * S, H = visualHeight(container)
  const ribs: ReactNode[] = []
  for (let x = -Math.floor(container.outerLength / 6000) * 3000; x <= Math.floor(container.outerLength / 6000) * 3000; x += 3000) ribs.push(<Line key={x} points={[[x * S, y, 0], [x * S, y, H]]} color={EDGE} lineWidth={.38} />)
  return <group><Panel position={[0, y, H / 2]} size={[L, container.wallThickness * S, H]} />{ribs}</group>
}

function HeadWall({ container }: { container: Container }) {
  const W = container.outerWidth * S, H = visualHeight(container), x = -container.outerLength * S / 2
  return <group><mesh position={[x, 0, H / 2]}><boxGeometry args={[container.wallThickness * S, W, H]} /><meshStandardMaterial color="#315f83" transparent opacity={.24} roughness={.78} metalness={.08} /></mesh><Beam position={[x + .012, 0, H / 2]} size={[.05, W, H]} color="#3d78a5" opacity={.42} /></group>
}

function Roof({ container }: { container: Container }) {
  const L = container.outerLength * S, W = container.outerWidth * S, H = visualHeight(container), t = container.roofThickness * S
  const ribs: ReactNode[] = []
  for (let x = -Math.floor(container.outerLength / 6000) * 3000; x <= Math.floor(container.outerLength / 6000) * 3000; x += 3000) ribs.push(<Line key={x} points={[[x * S, -W / 2, H - t], [x * S, W / 2, H - t]]} color={EDGE} lineWidth={.38} />)
  return <group><Panel position={[0, 0, H - t / 2]} size={[L, W, t]} opacity={.045} />{ribs}</group>
}

function DoorFrame({ container }: { container: Container }) {
  const L = container.outerLength * S, W = container.outerWidth * S, H = visualHeight(container), x = L / 2 + .006, post = .10, rail = .13, dw = container.doorWidth * S, dh = Math.min(container.doorHeight * S, H), upperH = Math.max(0, H - dh)
  return <group>
    <Beam position={[x, -W / 2 + post / 2, H / 2]} size={[post, post, H]} />
    <Beam position={[x, W / 2 - post / 2, H / 2]} size={[post, post, H]} />
    {upperH > .001 && <mesh position={[x, 0, dh + upperH / 2]} castShadow><boxGeometry args={[post, W * .94, upperH]} /><meshStandardMaterial color="#2f6f9f" metalness={.12} roughness={.58} /></mesh>}
    <Beam position={[x, 0, .045]} size={[post, dw + post, .09]} />
  </group>
}

function DoorLeaf({ container, side }: { container: Container; side: -1 | 1 }) {
  const L = container.outerLength * S, dw = container.doorWidth * S, dh = Math.min(container.doorHeight * S, visualHeight(container)), t = .035, leafW = dw / 2, x = L / 2 + .055, hingeY = side * dw / 2, openAngle = side * Math.PI / 2
  return <group position={[x, hingeY, dh / 2]} rotation={[0, 0, openAngle]}><group position={[0, -side * leafW / 2, 0]}>
    <mesh castShadow><boxGeometry args={[t, leafW, dh]} /><meshStandardMaterial color="#3d7ea9" metalness={.2} roughness={.55} /></mesh>
    {[.18, .38, .58, .78].map((f, i) => <Beam key={i} position={[-.012, 0, dh * (f - .5)]} size={[.055, leafW - .04, .045]} color="#285d82" />)}
    <Beam position={[-.018, 0, 0]} size={[.065, .045, Math.max(.01, dh - .08)]} color="#234f70" />
    {[-.33, .33].map((f, i) => <Beam key={`v${i}`} position={[-.012, f * leafW, 0]} size={[.06, .045, Math.max(.01, dh - .06)]} color="#234f70" />)}
    <mesh position={[-.032, 0, 0]}><boxGeometry args={[.025, Math.max(.01, leafW - .10), Math.max(.01, dh - .14)]} /><meshStandardMaterial color="#6e9fbe" transparent opacity={.7} /></mesh>
  </group></group>
}

function EndTick({ p, axis }: { p: [number, number, number]; axis: 'x' | 'y' }) {
  const d = .025
  return axis === 'y' ? <Line points={[[p[0] - d, p[1], p[2]], [p[0] + d, p[1], p[2]]]} color="#465260" lineWidth={.8} /> : <Line points={[[p[0], p[1] - d, p[2]], [p[0], p[1] + d, p[2]]]} color="#465260" lineWidth={.8} />
}

function DimensionLine({ points, label, position, axis, vertical = false }: { points: [[number, number, number], [number, number, number]]; label: string; position: [number, number, number]; axis: 'x' | 'y'; vertical?: boolean }) {
  return <group><Line points={points} color="#465260" lineWidth={1.05} /><EndTick p={points[0]} axis={axis} /><EndTick p={points[1]} axis={axis} /><Html position={position} center><div className={`cad-dimension ${vertical ? 'cad-vertical' : ''}`}>{label}</div></Html></group>
}

function LengthRuler({ container }: { container: Container }) {
  const L = container.length * S, y = -container.outerWidth * S / 2 - .40, z = .035
  const marks: ReactNode[] = []
  for (let x = 0; x <= container.length; x += 1000) { const xx = (x - container.length / 2) * S; marks.push(<Line key={`t-${x}`} points={[[xx, y, z - .04], [xx, y, z + .04]]} color="#465260" lineWidth={.8} />, <Html key={`l-${x}`} position={[xx, y - .02, z + .075]} center><div className="cad-tick-label">{x.toLocaleString()}</div></Html>) }
  if (container.length % 1000) { const xx = container.length / 2 * S; marks.push(<Line key="end" points={[[xx, y, z - .04], [xx, y, z + .04]]} color="#465260" lineWidth={.8} />, <Html key="endl" position={[xx, y - .02, z + .075]} center><div className="cad-tick-label">{container.length.toLocaleString()}</div></Html>) }
  return <group><Line points={[[-L / 2, y, z], [L / 2, y, z]]} color="#465260" lineWidth={1.1} />{marks}</group>
}

export default function ContainerStructure({ container, lang = 'zh', showDimensions = true }: { container: Container; lang?: 'zh' | 'en'; showDimensions?: boolean }) {
  const L = container.outerLength * S, W = container.outerWidth * S, H = visualHeight(container), IL = container.length * S, IW = container.width * S, IH = container.height * S, post = .075, rail = .055, rightX = L / 2
  return <group>
    <Roof container={container} /><HeadWall container={container} /><SideWall y={-W / 2} container={container} /><SideWall y={W / 2} container={container} />
    {[-L / 2, L / 2].flatMap(x => [-W / 2, W / 2].map(y => <Beam key={`${x}-${y}`} position={[x, y, H / 2]} size={[post, post, H]} color="#454945" />))}
    <Beam position={[0, -W / 2, H - rail / 2]} size={[L, rail, rail]} /><Beam position={[0, W / 2, H - rail / 2]} size={[L, rail, rail]} /><DoorFrame container={container} /><DoorLeaf container={container} side={-1} /><DoorLeaf container={container} side={1} />
    {showDimensions && <>
      <LengthRuler container={container} />
      <DimensionLine axis="y" points={[[rightX + .28, -IW / 2, .12], [rightX + .28, IW / 2, .12]]} label={`${lang === 'zh' ? '内部宽度' : 'INTERNAL WIDTH'} · ${container.width.toLocaleString()} mm`} position={[rightX + .28, 0, .29]} />
      <DimensionLine axis="y" points={[[rightX + .62, -container.doorWidth * S / 2, -.08], [rightX + .62, container.doorWidth * S / 2, -.08]]} label={`${lang === 'zh' ? '柜门宽度' : 'DOOR WIDTH'} · ${container.doorWidth.toLocaleString()} mm`} position={[rightX + .62, 0, -.23]} />
      <DimensionLine axis="y" vertical points={[[rightX + .30, IW / 2 + .28, 0], [rightX + .30, IW / 2 + .28, IH]]} label={`${lang === 'zh' ? '内部高度' : 'INTERNAL HEIGHT'} · ${container.height.toLocaleString()} mm`} position={[rightX + .30, IW / 2 + .28, IH / 2]} />
      <DimensionLine axis="y" vertical points={[[rightX + .70, container.doorWidth * S / 2 + .48, 0], [rightX + .70, container.doorWidth * S / 2 + .48, Math.min(container.doorHeight * S, H)]]} label={`${lang === 'zh' ? '柜门高度' : 'DOOR HEIGHT'} · ${container.doorHeight.toLocaleString()} mm`} position={[rightX + .70, container.doorWidth * S / 2 + .48, Math.min(container.doorHeight * S, H) / 2]} />
    </>}
  </group>
}
