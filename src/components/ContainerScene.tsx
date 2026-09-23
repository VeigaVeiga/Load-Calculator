import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { createRoot, type Root } from 'react-dom/client'
import { Html, Line, OrbitControls, Sky, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Cargo, Container, PlacedCargo, SecuringItem, SecuringMaterialType } from '../types'
import { dims, validatePlacement } from '../packing/geometry'
import ContainerStructure from './ContainerStructure'
import ContainerFloor from './ContainerFloor'
import CargoModel from './CargoModel'
import SecuringModel from './SecuringModel'
import InstancedCartons from './InstancedCartons'
import LashingPoints from './LashingPoints'
import './SceneOverrides.css'

export type View = 'iso' | 'top' | 'front' | 'left' | 'right'
export type SceneTool = 'translate' | 'rotate' | 'scale'
export type SelectionMode = 'single' | 'box'
const S = .001

type Props = {
  container: Container
  items: PlacedCargo[]
  materials: SecuringItem[]
  selectedId: string | null
  selectedIds: string[]
  selectionMode: SelectionMode
  onSelect: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onMove: (id: string, x: number, y: number, z: number) => void
  onMoveMany?: (u: Array<{ id: string; x: number; y: number; z: number; rotation?: number }>) => void
  onRotate: (id: string, r: number) => void
  onRotateMaterial: (id: string, r: number) => void
  onMaterialMove: (id: string, x: number, y: number) => void
  onMaterialScale: (id: string, f: number) => void
  onAddMaterial: (type: SecuringMaterialType) => string
  view: View
  dragging: boolean
  onDragState: (v: boolean) => void
  onView?: (v: View) => void
  cargo: Cargo[]
  lang: 'zh' | 'en'
  freePlacement?: boolean
  overflowCount: number
  overflowItems: PlacedCargo[]
  securingMode?: boolean
  showDimensions: boolean
  airBagStretch?: boolean
  selectedMaterialId?: string | null
  onSelectMaterial?: (id: string | null) => void
  onDeleteMaterial?: (id: string) => void
  toolbarHost?: HTMLElement | null
}

function CameraRig({ view, container, dragging, transformActive, focusPoint, focusNonce }: { view: View; container: Container; dragging: boolean; transformActive: boolean; focusPoint: [number, number, number] | null; focusNonce: number }) {
  const { camera, size } = useThree()
  const controls = useRef<any>(null)
  useEffect(() => {
    const L = (container.length + 6000) * S, W = container.width * S, H = container.height * S
    const targetX = view === 'iso' || view === 'top' ? 1 : 0
    const target = new THREE.Vector3(targetX, 0, H * .45)
    const d = Math.max(L, W, H) * 1.15
    const pos: Record<View, [number, number, number]> = {
      iso: [targetX + d * .72, target.y + d * .58, target.z + d * .43],
      top: [targetX, 0, target.z + d * 1.55],
      front: [-d * 1.45, 0, target.z],
      left: [targetX, -d * 1.45, target.z],
      right: [targetX, d * 1.45, target.z],
    }
    const perspective = camera as THREE.PerspectiveCamera
    perspective.fov = 42
    perspective.aspect = Math.max(.25, size.width / Math.max(1, size.height))
    perspective.near = .01
    perspective.far = 120
    camera.up.set(0, 0, 1)
    camera.position.set(...pos[view])
    camera.lookAt(target)
    perspective.updateProjectionMatrix()
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [view, container.length, container.width, container.height, size.width, size.height, camera])
  useEffect(() => {
    const c = controls.current
    if (!c || !focusPoint || focusNonce === 0) return
    const nextTarget = new THREE.Vector3(...focusPoint)
    const offset = camera.position.clone().sub(c.target)
    c.target.copy(nextTarget)
    camera.position.copy(nextTarget).add(offset)
    camera.lookAt(nextTarget)
    c.update()
  }, [focusNonce, focusPoint, camera])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    // Single source of truth: after a transform ends, deselection, or Free Placement
    // being switched off, OrbitControls must be explicitly enabled again.
    c.enabled = !(dragging && transformActive)
    if (c.enabled) c.update()
  }, [dragging, transformActive])

  // Orbit is disabled only while a transform is actively being dragged.
  // Merely enabling Free Placement must never lock the camera.
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} rotateSpeed={.7} panSpeed={.65} zoomSpeed={.8} minDistance={1.2} maxDistance={45} />
}

function CoordinateAxes({ container }: { container: Container }) {
  const L = container.length * S, W = container.width * S
  const p: [number, number, number] = [-L / 2 - .65, -W / 2 - .65, .02]
  return <group position={p} raycast={() => null}>
    <Line points={[[0, 0, 0], [.55, 0, 0]]} color="#c23b36" lineWidth={2} />
    <Line points={[[0, 0, 0], [0, .55, 0]]} color="#3d7b52" lineWidth={2} />
    <Line points={[[0, 0, 0], [0, 0, .55]]} color="#376fa5" lineWidth={2} />
    <Html position={[.62, 0, 0]} center><div className="axis-label axis-x">X</div></Html>
    <Html position={[0, .62, 0]} center><div className="axis-label axis-y">Y</div></Html>
    <Html position={[0, 0, .62]} center><div className="axis-label axis-z">Z</div></Html>
  </group>
}

function CargoObject({ p, container, selected, onSelect, registerRef, showName }: { p: PlacedCargo; container: Container; selected: boolean; onSelect: () => void; registerRef: (id: string, o: THREE.Group | null) => void; showName: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => { registerRef(p.id, ref.current); return () => registerRef(p.id, null) }, [p.id, registerRef])
  // TransformControls owns the live Three.js transform. React selection re-renders must not overwrite it.
  useLayoutEffect(() => {
    const o = ref.current
    if (!o) return
    const d = dims(p)
    o.position.set((p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + p.height / 2) * S)
    o.rotation.set(0, 0, p.rotation * Math.PI / 180)
  }, [p.x, p.y, p.z, p.rotation, p.length, p.width, p.height, container.length, container.width])
  return <group ref={ref} onPointerDown={e => { e.stopPropagation(); onSelect() }} onClick={e => { e.stopPropagation(); onSelect() }}>
    <CargoModel p={{ ...p, x: 0, y: 0, z: 0 }} container={container} selected={selected} hovered={false} showName={showName} local onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect() }} />
  </group>
}

function MaterialObject({ item, container, selected, onSelect, registerRef, onDelete }: { item: SecuringItem; container: Container; selected: boolean; onSelect: () => void; registerRef: (id: string, o: THREE.Group | null) => void; onDelete: () => void }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => { registerRef(item.id, ref.current); return () => registerRef(item.id, null) }, [item.id, registerRef])
  const maxX = Math.max(0, container.length - item.length), maxY = Math.max(0, container.width - item.width), maxZ = Math.max(0, container.height - item.height)
  const x = Math.max(0, Math.min(maxX, item.x))
  const y = Math.max(0, Math.min(maxY, item.y))
  const z = Math.max(0, Math.min(maxZ, item.z))
  const pos: [number, number, number] = [(x + item.length / 2 - container.length / 2) * S, (y + item.width / 2 - container.width / 2) * S, (z + item.height / 2) * S]
  return <group ref={ref} position={pos} rotation={[0, 0, item.rotation * Math.PI / 180]} onPointerDown={e => { e.stopPropagation(); onSelect() }} onPointerUp={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect() }} onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onDelete() }}>
    <SecuringModel item={{ ...item, x, y, z }} container={container} selected={selected} local onSelect={onSelect} />
  </group>
}

function SceneContent({ props }: { props: Props }) {
  const { container, items, materials, selectedId, selectedIds, onSelect, onSelectMany, onMove, onMoveMany, onRotate, onRotateMaterial, onMaterialMove, onMaterialScale, onAddMaterial, view, dragging, onDragState, cargo, lang, showDimensions } = props
  const refs = useRef<Record<string, THREE.Group>>({})
  const snapshots = useRef<Record<string, { position: THREE.Vector3; rotation: number; scale: THREE.Vector3 }>>({})
  const [tool, setTool] = useState<SceneTool>('translate')
  const [sceneSelectionMode, setSceneSelectionMode] = useState<'single' | 'multi'>(props.selectionMode === 'box' ? 'multi' : 'single')
  const [freePlacementEnabled, setFreePlacementEnabled] = useState(!!props.freePlacement)
  const [focusPoint, setFocusPoint] = useState<[number, number, number] | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const activeMaterial = props.selectedMaterialId ? materials.find(m => m.id === props.selectedMaterialId) ?? null : null
  const activeId = activeMaterial?.id ?? (freePlacementEnabled ? selectedId : null)
  const activeObject = activeId ? refs.current[activeId] ?? null : null
  const multi = sceneSelectionMode === 'multi'
  const registerRef = useCallback((id: string, o: THREE.Group | null) => { if (o) refs.current[id] = o; else delete refs.current[id] }, [])

  const selectCargo = (id: string) => {
    props.onSelectMaterial?.(null)
    if (freePlacementEnabled) {
      const p = items.find(q => q.id === id)
      if (p) {
        const d = dims(p)
        setFocusPoint([(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + p.height / 2) * S])
        setFocusNonce(n => n + 1)
      }
    }
    if (multi) {
      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
      onSelectMany(next)
    } else onSelect(id)
  }

  const capture = () => {
    snapshots.current = {}
    const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
    for (const id of ids) { const o = refs.current[id]; if (o) snapshots.current[id] = { position: o.position.clone(), rotation: o.rotation.z, scale: o.scale.clone() } }
    if (activeMaterial) { const o = refs.current[activeMaterial.id]; if (o) snapshots.current[activeMaterial.id] = { position: o.position.clone(), rotation: o.rotation.z, scale: o.scale.clone() } }
  }

  const candidateFor = (p: PlacedCargo, o: THREE.Group) => {
    const r = ((Math.round(o.rotation.z / (Math.PI / 2)) * 90) % 360 + 360) % 360
    const d = dims({ ...p, rotation: r })
    const x = Math.max(0, Math.min(container.length - d.length, Math.round((o.position.x / S - d.length / 2 + container.length / 2) / 10) * 10))
    const y = Math.max(0, Math.min(container.width - d.width, Math.round((o.position.y / S - d.width / 2 + container.width / 2) / 10) * 10))
    const z = Math.max(0, Math.round((o.position.z / S - p.height / 2) / 10) * 10)
    return { candidate: { ...p, x, y, z, rotation: r }, x, y, z, r }
  }

  const previewCargo = () => {
    if (!selectedId) return
    const p = items.find(q => q.id === selectedId), o = refs.current[selectedId]
    if (!p || !o) return
    const { candidate } = candidateFor(p, o)
    const validation = validatePlacement(candidate, container, items.filter(q => q.id !== selectedId))
    if (!validation.ok) {
      const last = snapshots.current[selectedId]
      if (last) { o.position.copy(last.position); o.rotation.z = last.rotation; o.scale.copy(last.scale) }
      return
    }
    snapshots.current[selectedId] = { position: o.position.clone(), rotation: o.rotation.z, scale: o.scale.clone() }
  }

  const commit = () => {
    if (activeMaterial) {
      const o = refs.current[activeMaterial.id]
      if (!o) return
      const r = ((Math.round(o.rotation.z / (Math.PI / 2)) * 90) % 360 + 360) % 360
      const rawX = Math.round((o.position.x / S - activeMaterial.length / 2 + container.length / 2) / 10) * 10
      const rawY = Math.round((o.position.y / S - activeMaterial.width / 2 + container.width / 2) / 10) * 10
      onMaterialMove(activeMaterial.id, Math.max(0, Math.min(container.length - activeMaterial.length, rawX)), Math.max(0, Math.min(container.width - activeMaterial.width, rawY)))
      onRotateMaterial(activeMaterial.id, r)
      if (tool === 'scale') {
        const s = snapshots.current[activeMaterial.id]
        if (s) { const f = Math.max(.25, Math.min(4, o.scale.x / Math.max(.001, s.scale.x))); o.scale.set(1, 1, 1); onMaterialScale(activeMaterial.id, f) }
      }
      return
    }
    const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : [])
    const updates: Array<{ id: string; x: number; y: number; z: number; rotation?: number }> = []
    for (const id of ids) {
      const p = items.find(q => q.id === id), o = refs.current[id]
      if (!p || !o) continue
      const { candidate, x, y, z, r } = candidateFor(p, o)
      const validation = validatePlacement(candidate, container, items.filter(q => q.id !== id))
      if (validation.ok) updates.push({ id, x, y, z, rotation: r })
      else if (snapshots.current[id]) { o.position.copy(snapshots.current[id].position); o.rotation.z = snapshots.current[id].rotation }
    }
    if (updates.length) {
      if (onMoveMany) onMoveMany(updates)
      else updates.forEach(u => { onMove(u.id, u.x, u.y, u.z); if (u.rotation != null) onRotate(u.id, u.rotation) })
    }
  }

  const applyMulti = () => {
    if (!multi || selectedIds.length < 2) return
    const first = refs.current[selectedIds[0]], base = snapshots.current[selectedIds[0]]
    if (!first || !base) return
    const dx = first.position.x - base.position.x, dy = first.position.y - base.position.y, dz = first.position.z - base.position.z, dr = first.rotation.z - base.rotation
    for (const id of selectedIds.slice(1)) { const o = refs.current[id], s = snapshots.current[id]; if (!o || !s) continue; o.position.copy(s.position).add(new THREE.Vector3(dx, dy, dz)); o.rotation.z = s.rotation + dr }
  }

  useEffect(() => {
    // CAMERA_LOCK_FIX_V2: release the transform state even when the pointerup
    // happens outside the canvas and TransformControls misses its mouseup.
    const releaseTransform = () => onDragState(false)
    window.addEventListener('pointerup', releaseTransform, true)
    window.addEventListener('mouseup', releaseTransform, true)
    window.addEventListener('blur', releaseTransform)
    return () => {
      window.removeEventListener('pointerup', releaseTransform, true)
      window.removeEventListener('mouseup', releaseTransform, true)
      window.removeEventListener('blur', releaseTransform)
    }
  }, [onDragState])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onSelect(null); onSelectMany([]); props.onSelectMaterial?.(null) }
      if (e.key === 'Delete' && props.selectedMaterialId) { props.onDeleteMaterial?.(props.selectedMaterialId); props.onSelectMaterial?.(null) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [props.selectedMaterialId, props.onDeleteMaterial, onSelect, onSelectMany])

  useEffect(() => {
    const group = document.querySelector('.view-toolbar>.toolbar-group:nth-child(2)') as HTMLElement | null
    if (!group) return
    const label = group.querySelector('b'); if (label) label.textContent = '模式'
    const buttons = Array.from(group.querySelectorAll('button')) as HTMLButtonElement[]
    const single = buttons[0], multiButton = buttons[1]
    if (!single || !multiButton) return
    single.textContent = '单选'; multiButton.textContent = '多选'
    let freeButton = group.querySelector('.scene-free-placement-dom') as HTMLButtonElement | null
    if (!freeButton) { freeButton = document.createElement('button'); freeButton.className = 'scene-free-placement-dom'; group.appendChild(freeButton) }
    freeButton.textContent = '自由摆放'
    const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation() }
    const onSingle = (e: Event) => { stop(e); setSceneSelectionMode('single'); onSelectMany([]) }
    const onMulti = (e: Event) => { stop(e); setSceneSelectionMode('multi') }
    const onFree = (e: Event) => { stop(e); setFreePlacementEnabled(v => !v) }
    single.addEventListener('click', onSingle, true); multiButton.addEventListener('click', onMulti, true); freeButton.addEventListener('click', onFree, true)
    single.classList.toggle('active', sceneSelectionMode === 'single'); multiButton.classList.toggle('active', sceneSelectionMode === 'multi'); freeButton.classList.toggle('active', freePlacementEnabled)
    return () => { single.removeEventListener('click', onSingle, true); multiButton.removeEventListener('click', onMulti, true); freeButton?.removeEventListener('click', onFree, true); freeButton?.remove() }
  }, [sceneSelectionMode, freePlacementEnabled, onSelectMany])

  const addMaterial = (type: SecuringMaterialType) => {
    const id = onAddMaterial(type)
    const sizes: Record<SecuringMaterialType, [number, number]> = { triangleWood: [200, 150], lashingBelt: [3000, 4], airBag: [1000, 1000], doorNet: [40, container.width] }
    const [length, width] = sizes[type]
    const x = Math.max(0, container.length - length), y = Math.max(0, (container.width - width) / 2)
    onMaterialMove(id, x, y)
  }

  const toolbar = <div className="scene-toolbox" style={{ pointerEvents: 'auto' }}>
    <button className={tool === 'translate' ? 'active' : ''} onClick={() => setTool('translate')}>↔ 移动</button>
    <button className={tool === 'rotate' ? 'active' : ''} onClick={() => setTool('rotate')}>⟳ 旋转</button>
    <button disabled={!activeMaterial} className={!activeMaterial ? 'disabled' : tool === 'scale' ? 'active' : ''} onClick={() => setTool('scale')}>⤢ 缩放</button>
    <button disabled={!activeMaterial} className={!activeMaterial ? 'disabled' : 'danger'} onClick={() => { if (props.selectedMaterialId) { props.onDeleteMaterial?.(props.selectedMaterialId); props.onSelectMaterial?.(null) } }}>删除选中</button>
    <div className="tool-divider" /><b>加固材料</b>
    <button onClick={() => addMaterial('triangleWood')}>三角木</button><button onClick={() => addMaterial('lashingBelt')}>紧固带</button><button onClick={() => addMaterial('airBag')}>充气袋</button><button onClick={() => addMaterial('doorNet')}>柜门网</button>
  </div>

  const instancedCartons = useMemo(() => items.filter(p => p.cargoType === 'carton' && !selectedIds.includes(p.id) && p.id !== selectedId && !cargo.find(c => c.id === p.cargoId)?.showName), [items, selectedIds, selectedId, cargo])
  const instancedIds = useMemo(() => new Set(instancedCartons.map(p => p.id)), [instancedCartons])
  const individualItems = useMemo(() => items.filter(p => !instancedIds.has(p.id)), [items, instancedIds])

  return <>
    <Sky distance={450000} sunPosition={[25, 30, 55]} inclination={.48} azimuth={.25} turbidity={3.2} rayleigh={2.1} mieCoefficient={.75} />
    <ambientLight intensity={1.65} /><directionalLight position={[8, 10, 18]} intensity={2.2} /><hemisphereLight intensity={.45} groundColor="#dbe3e8" color="#fff" />
    <ContainerStructure container={container} lang={lang} showDimensions={showDimensions} /><ContainerFloor container={container} /><LashingPoints container={container} /><CoordinateAxes container={container} />
    <InstancedCartons items={instancedCartons} container={container} onSelect={selectCargo} />
    {individualItems.map(p => <CargoObject key={p.id} p={p} container={container} selected={selectedIds.includes(p.id) || p.id === selectedId} onSelect={() => selectCargo(p.id)} registerRef={registerRef} showName={!!cargo.find(c => c.id === p.cargoId)?.showName} />)}
    {materials.map(m => <MaterialObject key={m.id} item={m} container={container} selected={m.id === props.selectedMaterialId} onSelect={() => { onSelect(null); onSelectMany([]); props.onSelectMaterial?.(m.id) }} onDelete={() => { props.onDeleteMaterial?.(m.id); props.onSelectMaterial?.(null) }} registerRef={registerRef} />)}
    {activeObject && (activeMaterial || freePlacementEnabled) && <TransformControls
      object={activeObject}
      mode={activeMaterial && tool === 'scale' ? 'scale' : tool}
      axis={undefined}
      translationSnap={.01}
      rotationSnap={Math.PI / 2}
      scaleSnap={.05}
      showX={tool === 'rotate' ? true : true} showY={tool === 'rotate' ? false : true} showZ
      onMouseDown={(event: any) => { event.stopPropagation(); capture(); onDragState(true) }}
      onMouseUp={(event: any) => { event.stopPropagation(); commit(); requestAnimationFrame(() => onDragState(false)) }}
      onChange={() => { applyMulti(); previewCargo() }}
    />}
    <CameraRig view={view} container={container} dragging={dragging} transformActive={!!activeObject && !!(activeMaterial || freePlacementEnabled)} focusPoint={focusPoint} focusNonce={focusNonce} />
    const toolbarRoot = useRef<Root | null>(null)
  useEffect(() => {
    const host = props.toolbarHost
    if (!host) return
    if (!toolbarRoot.current) toolbarRoot.current = createRoot(host)
    toolbarRoot.current.render(toolbar)
    return () => { toolbarRoot.current?.unmount(); toolbarRoot.current = null }
  }, [props.toolbarHost, tool, activeMaterial?.id, props.selectedMaterialId, freePlacementEnabled])
  </>
}

export default function ContainerScene(props: Props) {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  return <div className="scene-shell" style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Canvas shadows dpr={[1, 1.4]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ position: [10, 8, 6], fov: 42, near: .01, far: 120, up: [0, 0, 1] }} onPointerMissed={() => { props.onSelect(null); props.onSelectMany([]); setSelectedMaterialId(null) }}>
      <SceneContent props={{ ...props, selectedMaterialId, onSelectMaterial: setSelectedMaterialId, toolbarHost }} />
    </Canvas>
    <div ref={setToolbarHost} className="scene-toolbar-host" style={{ position: 'absolute', top: 12, left: 12, zIndex: 50, pointerEvents: 'none' }} />
  </div>
}
