import { Html, Line } from '@react-three/drei'
import type { ReactNode } from 'react'
import type { Container } from '../types'

const S = .001
const BEAM = '#d6d6ce'
const EDGE = BEAM

function visualHeight(container: Container) { return container.height * S }

function Beam({ position, size, color = BEAM, opacity = .96 }: { position: [number, number, number]; size: [number, number, number]; color?: string; opacity?: number }) {
  return <mesh position={position} castShadow raycast={() => null}><boxGeometry args={size} /><meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} metalness={.15} roughness={.58} /></mesh>
}

function Panel({ position, size, opacity = .08 }: { position: [number, number, number]; size: [number, number, number]; opacity?: number }) {
  return <mesh position={position} raycast={() => null}><boxGeometry args={size} /><meshStandardMaterial color={BEAM} transparent opacity={opacity} depthWrite={false} /></mesh>
}

function SideWall({ y, container }: { y: number; container: Container }) {
  const L = container.outerLength * S, H = visualHeight(container)
  const ribs: ReactNode[] = []
  for (let x = -Math.floor(container.outerLength / 6000) * 3000; x <= Math.floor(container.outerLength / 6000) * 3000; x += 3000) ribs.push(<Line key={x} points={[[x * S, y, 0], [x * S, y, H]]} color={EDGE} lineWidth={.38} />)
  return <group><Panel position={[0, y, H / 2]} size={[L, container.wallThickness * S, H]} />{ribs}</group>
}

function HeadWall({ container, x, sideRailY, bottomZ, topZ, rail }: { container: Container; x: number; sideRailY: number; bottomZ: number; topZ: number; rail: number }) {
  const W = container.width * S, H = container.height * S
  // Extend the head-wall assembly only far enough to close the structural gap.
  // Its inner face stops at the inner face of the longitudinal rails, so the
  // longitudinal rails are joined to the head frame instead of visually passing through it.
  const headOuterX = x - rail / 2
  const longitudinalInnerX = -(container.length * S) / 2 + rail / 2
  const frameDepth = Math.max(rail, longitudinalInnerX - headOuterX)
  const frameCenterX = (headOuterX + longitudinalInnerX) / 2
  const wallOuterX = x - container.wallThickness * S / 2
  const wallInnerX = x + container.wallThickness * S / 2
  const wallFillDepth = Math.max(container.wallThickness * S, longitudinalInnerX - wallOuterX)
  const wallFillCenterX = (wallOuterX + longitudinalInnerX) / 2
  return <group>
    <Panel position={[wallFillCenterX, 0, H / 2]} size={[wallFillDepth, container.outerWidth * S, H]} opacity={.70} />
    {/* Four head-frame members are thickened together with the wall. The outer
        and inner faces are shared, preventing a separate central filler beam. */}
    <Beam position={[frameCenterX, -sideRailY, bottomZ + rail / 2]} size={[frameDepth, rail, rail]} />
    <Beam position={[frameCenterX, sideRailY, bottomZ + rail / 2]} size={[frameDepth, rail, rail]} />
    <Beam position={[frameCenterX, -sideRailY, topZ]} size={[frameDepth, rail, rail]} />
    <Beam position={[frameCenterX, sideRailY, topZ]} size={[frameDepth, rail, rail]} />
    <Beam position={[frameCenterX, 0, bottomZ + rail / 2]} size={[frameDepth, W + rail, rail]} />
    <Beam position={[frameCenterX, 0, topZ]} size={[frameDepth, W + rail, rail]} />
    <Beam position={[frameCenterX, -sideRailY, H / 2]} size={[frameDepth, rail, Math.max(.01, H)]} />
    <Beam position={[frameCenterX, sideRailY, H / 2]} size={[frameDepth, rail, Math.max(.01, H)]} />
  </group>
}

function Roof({ container }: { container: Container }) {
  const L = container.outerLength * S, W = container.outerWidth * S, H = visualHeight(container), t = container.roofThickness * S
  return <Panel position={[0, 0, H - t / 2]} size={[L, W, t]} opacity={.045} />
}

// Three transverse roof members restore the visible top segmentation without
// entering the cargo calculation volume. They are structural visualization only.
function RoofDividerLines({ container }: { container: Container }) {
  const W = container.outerWidth * S, H = visualHeight(container)
  // 40-foot containers: center line + the centers of the two resulting halves.
  // 20-foot containers: center line only.
  const dividerPositions = container.length >= 10000
    ? [-container.length / 4, 0, container.length / 4]
    : [0]
  return <group>
    {dividerPositions.map((x) => <Line key={x} points={[[x * S, -W / 2, H - .006], [x * S, W / 2, H - .006]]} color={EDGE} lineWidth={.42} />)}
  </group>
}

function DoorFrame({ container, sideRailY, bottomZ, topZ, rail }: { container: Container; sideRailY: number; bottomZ: number; topZ: number; rail: number }) {
  const L = container.outerLength * S, x = L / 2 + rail / 2, W = container.width * S, H = container.height * S
  const doorH = Math.min(container.doorHeight * S, H)
  const floorEdge = container.length * S / 2
  const thresholdDepth = Math.max(0, x - floorEdge)
  const thresholdCenterX = floorEdge + thresholdDepth / 2
  // The door posts must fill the whole side-wall thickness transition:
  // from the internal cargo boundary to the outside face of the side wall.
  // Keep the inner face exactly at the internal width so the post never enters
  // the cargo calculation volume.
  const sideInnerY = container.width * S / 2
  const sideOuterY = container.outerWidth * S / 2
  const sidePostDepthY = Math.max(rail, sideOuterY - sideInnerY)
  const sidePostCenterOffset = (sideInnerY + sideOuterY) / 2
  // Extend the post in X to meet the side-wall panel cleanly. The inner end is
  // exactly at the outer shell face; it does not project into the container.
  const doorPostOuterX = x + rail / 2
  const doorPostInnerX = L / 2
  const sidePostDepthX = Math.max(rail, doorPostOuterX - doorPostInnerX)
  const sidePostCenterX = (doorPostInnerX + doorPostOuterX) / 2
  return <group>
    <Beam position={[sidePostCenterX, -sidePostCenterOffset, H / 2]} size={[sidePostDepthX, sidePostDepthY, H]} />
    <Beam position={[sidePostCenterX, sidePostCenterOffset, H / 2]} size={[sidePostDepthX, sidePostDepthY, H]} />
    <Beam position={[x, 0, topZ]} size={[rail, W + rail, rail]} />
    {thresholdDepth > 0 && <>
      <Beam position={[thresholdCenterX, 0, topZ]} size={[thresholdDepth, W + rail, rail]} />
      <Beam position={[thresholdCenterX, 0, bottomZ + rail / 2]} size={[thresholdDepth, W + rail, rail]} />
    </>}
    <Beam position={[x, 0, bottomZ + rail / 2]} size={[rail, W + rail, rail]} />
    {doorH < H - .001 && <Beam position={[x, 0, doorH + (H - doorH) / 2]} size={[rail, W, H - doorH]} />}
  </group>
}

function DoorLeaf({ container, side }: { container: Container; side: -1 | 1 }) {
  const L = container.outerLength * S, dw = container.doorWidth * S, dh = Math.min(container.doorHeight * S, visualHeight(container)), t = .035, leafW = dw / 2, x = L / 2 + .055, hingeY = side * dw / 2, openAngle = side * Math.PI / 2
  return <group position={[x, hingeY, dh / 2]} rotation={[0, 0, openAngle]}><group position={[0, -side * leafW / 2, 0]}>
    <mesh castShadow raycast={() => null}><boxGeometry args={[t, leafW, dh]} /><meshStandardMaterial color={BEAM} metalness={.2} roughness={.55} /></mesh>
    {[.18, .38, .58, .78].map((f, i) => <Beam key={i} position={[-.012, 0, dh * (f - .5)]} size={[.055, leafW - .04, .045]} />)}
    <Beam position={[-.018, 0, 0]} size={[.065, .045, Math.max(.01, dh - .08)]} />
    {[-.33, .33].map((f, i) => <Beam key={`v${i}`} position={[-.012, f * leafW, 0]} size={[.06, .045, Math.max(.01, dh - .06)]} />)}
    <mesh position={[-.032, 0, 0]} raycast={() => null}><boxGeometry args={[.025, Math.max(.01, leafW - .10), Math.max(.01, dh - .14)]} /><meshStandardMaterial color={BEAM} transparent opacity={.7} /></mesh>
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
  const L = container.outerLength * S, W = container.outerWidth * S, H = visualHeight(container), IW = container.width * S, IH = container.height * S, rail = .055, rightX = L / 2
  const sideRailY = IW / 2 + rail / 2
  const topRailZ = IH + rail / 2
  const bottomRailZ = -rail / 2
  const headX = -L / 2 - rail / 2
  return <group>
    <Roof container={container} />
    <RoofDividerLines container={container} />
    <SideWall y={-W / 2} container={container} />
    <SideWall y={W / 2} container={container} />
    <Beam position={[0, -sideRailY, topRailZ]} size={[L, rail, rail]} />
    <Beam position={[0, sideRailY, topRailZ]} size={[L, rail, rail]} />
    <Beam position={[0, -sideRailY, bottomRailZ]} size={[L, rail, rail]} />
    <Beam position={[0, sideRailY, bottomRailZ]} size={[L, rail, rail]} />
    <HeadWall container={container} x={headX} sideRailY={sideRailY} bottomZ={bottomRailZ} topZ={topRailZ} rail={rail} />
    <DoorFrame container={container} sideRailY={sideRailY} bottomZ={bottomRailZ} topZ={topRailZ} rail={rail} />
    <DoorLeaf container={container} side={-1} />
    <DoorLeaf container={container} side={1} />
    {showDimensions && <>
      <LengthRuler container={container} />
      <DimensionLine axis="y" points={[[rightX + .28, -IW / 2, .12], [rightX + .28, IW / 2, .12]]} label={`${lang === 'zh' ? '内部宽度' : 'INTERNAL WIDTH'} · ${container.width.toLocaleString()} mm`} position={[rightX + .28, 0, .29]} />
      <DimensionLine axis="y" points={[[rightX + .62, -container.doorWidth * S / 2, -.08], [rightX + .62, container.doorWidth * S / 2, -.08]]} label={`${lang === 'zh' ? '柜门宽度' : 'DOOR WIDTH'} · ${container.doorWidth.toLocaleString()} mm`} position={[rightX + .62, 0, -.23]} />
      <DimensionLine axis="y" vertical points={[[rightX + .30, IW / 2 + .28, 0], [rightX + .30, IW / 2 + .28, IH]]} label={`${lang === 'zh' ? '内部高度' : 'INTERNAL HEIGHT'} · ${container.height.toLocaleString()} mm`} position={[rightX + .30, IW / 2 + .28, IH / 2]} />
      <DimensionLine axis="y" vertical points={[[rightX + .70, container.doorWidth * S / 2 + .48, 0], [rightX + .70, container.doorWidth * S / 2 + .48, Math.min(container.doorHeight * S, H)]]} label={`${lang === 'zh' ? '柜门高度' : 'DOOR HEIGHT'} · ${container.doorHeight.toLocaleString()} mm`} position={[rightX + .70, container.doorWidth * S / 2 + .48, Math.min(container.doorHeight * S, H) / 2]} />
    </>}
  </group>
}
