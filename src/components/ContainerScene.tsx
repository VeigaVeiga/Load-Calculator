import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { createRoot, type Root } from 'react-dom/client'
import { Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera, Text, TransformControls } from '@react-three/drei'
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
import { isLightIndustrialTheme } from '../theme'
const MATERIAL_STAGE_GAP = 500
const MATERIAL_STAGE_DEPTH = 3000

type Props = {
  container: Container; items: PlacedCargo[]; materials: SecuringItem[]; selectedId: string | null; selectedIds: string[]; selectionMode: SelectionMode
  onSelect: (id: string | null) => void; onSelectMany: (ids: string[]) => void
  onMove: (id: string, x: number, y: number, z: number) => void
  onMoveMany?: (u: Array<{ id: string; x: number; y: number; z: number; rotation?: number }>) => void
  onRotate: (id: string, r: number) => void; onRotateMaterial: (id: string, r: number) => void
  onMaterialMove: (id: string, x: number, y: number) => void; onMaterialScale: (id: string, f: number) => void
  onAddMaterial: (type: SecuringMaterialType) => string; onUpdateMaterialPath: (id: string, path: Array<{x:number;y:number;z:number}>) => void; view: View; dragging: boolean; onDragState: (v: boolean) => void
  onView?: (v: View) => void; cargo: Cargo[]; lang: 'zh' | 'en'; freePlacement?: boolean; overflowCount: number; overflowItems: PlacedCargo[]
  securingMode?: boolean; showDimensions: boolean; airBagStretch?: boolean; selectedMaterialId?: string | null
  onSelectMaterial?: (id: string | null) => void; onDeleteMaterial?: (id: string) => void; toolbarHost?: HTMLElement | null
}

function CameraRig({ view, container, dragging, transformActive, focusPoint, focusNonce, routeMode }: { view: View; container: Container; dragging: boolean; transformActive: boolean; focusPoint: [number, number, number] | null; focusNonce: number; routeMode: boolean }) {
  const { camera, size, invalidate } = useThree(); const controls = useRef<any>(null)
  useEffect(() => {
    const L = (container.length + 6000) * S, W = container.width * S, H = container.height * S
    const targetX = view === 'iso' || view === 'top' ? 1 : 0
    const target = new THREE.Vector3(targetX, 0, H * .45)
    const d = Math.max(L, W, H) * (routeMode ? .72 : 1.15)
    const pos: Record<View, [number, number, number]> = { iso: [targetX + d * .72, target.y + d * .58, target.z + d * .43], top: [targetX, 0, target.z + d * 1.55], front: [-d * 1.45, 0, target.z], left: [targetX, -d * 1.45, target.z], right: [targetX, d * 1.45, target.z] }
    camera.position.set(...pos[view]); camera.up.set(0, 0, 1); camera.lookAt(target)
    if (camera instanceof THREE.OrthographicCamera) {
      const aspect = Math.max(.25, size.width / Math.max(1, size.height)), span = d * .72
      camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span; camera.near = .01; camera.far = 120
    } else {
      const perspective = camera as THREE.PerspectiveCamera
      perspective.fov = 42; perspective.aspect = Math.max(.25, size.width / Math.max(1, size.height)); perspective.near = .01; perspective.far = 120
    }
    camera.updateProjectionMatrix(); controls.current?.target.copy(target); controls.current?.update()
  }, [view, container.length, container.width, container.height, size.width, size.height, camera, routeMode])
  useEffect(() => { const c = controls.current; if (!c || !focusPoint || focusNonce === 0) return; const nextTarget = new THREE.Vector3(...focusPoint); const offset = camera.position.clone().sub(c.target); c.target.copy(nextTarget); camera.position.copy(nextTarget).add(offset); camera.lookAt(nextTarget); c.update() }, [focusNonce, focusPoint, camera])
  useEffect(() => { const c = controls.current; if (!c) return; c.enabled = !(dragging && transformActive); if (c.enabled) c.update() }, [dragging, transformActive])
  return <OrbitControls ref={controls} makeDefault enableDamping={false} rotateSpeed={.7} panSpeed={.65} zoomSpeed={.8} minDistance={1.2} maxDistance={45} onChange={() => invalidate()} />
}

function CoordinateAxes({ container }: { container: Container }) {
  const L = container.length * S, W = container.width * S, p: [number, number, number] = [-L / 2 - .65, -W / 2 - .65, .02]
  return <group position={p} raycast={() => null}><Line points={[[0,0,0],[.55,0,0]]} color="#c23b36" lineWidth={2}/><Line points={[[0,0,0],[0,.55,0]]} color="#3d7b52" lineWidth={2}/><Line points={[[0,0,0],[0,0,.55]]} color="#376fa5" lineWidth={2}/><Html position={[.62,0,0]} center><div className="axis-label axis-x">X</div></Html><Html position={[0,.62,0]} center><div className="axis-label axis-y">Y</div></Html><Html position={[0,0,.62]} center><div className="axis-label axis-z">Z</div></Html></group>
}

function SecuringMaterialZone({ container, lang }: { container: Container; lang: 'zh' | 'en' }) {
  const depth = MATERIAL_STAGE_DEPTH * S, gap = MATERIAL_STAGE_GAP * S, width = container.length * S, y = container.width * S / 2 + gap + depth / 2, z = .006
  const border = [[-width/2,y-depth/2,z],[width/2,y-depth/2,z],[width/2,y+depth/2,z],[-width/2,y+depth/2,z],[-width/2,y-depth/2,z]] as [number,number,number][]
  return <group raycast={() => null}><mesh position={[0,y,z]}><planeGeometry args={[width,depth]}/><meshStandardMaterial color={isLightIndustrialTheme() ? '#dbe5ee' : '#7f8991'} transparent opacity={isLightIndustrialTheme() ? .38 : .13} depthWrite={false}/></mesh><Line points={border} color={isLightIndustrialTheme() ? "#8294a4" : "#68737b"} lineWidth={1.5} transparent opacity={.85}/><Line points={[[-width/2,y,z],[width/2,y,z]]} color={isLightIndustrialTheme() ? "#a7b5c2" : "#8b949b"} lineWidth={1} transparent opacity={.65}/><Text position={[0,y,z+.003]} rotation={[0,0,Math.PI]} fontSize={.34} letterSpacing={.025} color={isLightIndustrialTheme() ? "#455a6d" : "#e0e5e8"} anchorX="center" anchorY="middle" outlineWidth={.002} outlineColor={isLightIndustrialTheme() ? "#edf3f7" : "#343b40"}>{lang === 'zh' ? '加 固 材 料 区' : 'SECURING MATERIALS'}</Text></group>
}

function OverflowCargoZone({ container, items, cargo, lang }: { container: Container; items: PlacedCargo[]; cargo: Cargo[]; lang: 'zh' | 'en' }) {
  const layout = useMemo(() => {
    const placements: Array<{ p: PlacedCargo; x: number; y: number; rotation: number }> = []
    let x = 0, rowY = -(MATERIAL_STAGE_DEPTH + MATERIAL_STAGE_GAP), rowDepth = 0
    for (const original of items) {
      const normal = dims(original)
      let w = normal.length, d = normal.width, rotation = original.rotation
      if (w > container.length || d > MATERIAL_STAGE_DEPTH) {
        const rotatedW = normal.width, rotatedD = normal.length
        if (rotatedW <= container.length && rotatedD <= MATERIAL_STAGE_DEPTH) {
          w = rotatedW; d = rotatedD; rotation = (original.rotation + 90) % 360
        } else continue
      }
      if (x + w > container.length) { x = 0; rowY += rowDepth; rowDepth = 0 }
      if (rowY + d > -MATERIAL_STAGE_GAP) continue
      placements.push({ p: original, x, y: rowY, rotation })
      x += w
      rowDepth = Math.max(rowDepth, d)
    }
    return placements
  }, [items, container.length])
  const width = container.length * S, depth = MATERIAL_STAGE_DEPTH * S
  const y = -(container.width * S / 2 + MATERIAL_STAGE_GAP * S + depth / 2), z = .006
  const border = [[-width/2,y-depth/2,z],[width/2,y-depth/2,z],[width/2,y+depth/2,z],[-width/2,y+depth/2,z],[-width/2,y-depth/2,z]] as [number,number,number][]
  return <group raycast={() => null}>
    <mesh position={[0,y,z]}><planeGeometry args={[width,depth]}/><meshStandardMaterial color={isLightIndustrialTheme() ? "#f3dfbf" : "#b78b55"} transparent opacity={isLightIndustrialTheme() ? .45 : .13} depthWrite={false}/></mesh>
    <Line points={border} color={isLightIndustrialTheme() ? "#bd8a4e" : "#a77c49"} lineWidth={1.5} transparent opacity={.85}/>
    <Line points={[[-width/2,y,z],[width/2,y,z]]} color={isLightIndustrialTheme() ? "#d1aa78" : "#b78b55"} lineWidth={1} transparent opacity={.65}/>
    <Text position={[0,y,z+.003]} rotation={[0,0,Math.PI]} fontSize={.36} letterSpacing={.025} color={isLightIndustrialTheme() ? "#805a2f" : "#f6d5a4"} anchorX="center" anchorY="middle" outlineWidth={.002} outlineColor={isLightIndustrialTheme() ? "#fff6e8" : "#60482d"}>{lang === 'zh' ? `溢 出 货 物 区 · ${items.length} 件` : `OVERFLOW CARGO · ${items.length}`}</Text>
    {layout.map(({p,x:px,y:py,rotation}, index) => {
      const d = dims({ ...p, rotation })
      const position: [number,number,number] = [(px+d.length/2-container.length/2)*S, (py+d.width/2-container.width/2)*S, p.height*S/2]
      return <group key={p.id} position={position} rotation={[0,0,rotation*Math.PI/180]} raycast={() => null}>
        <CargoModel p={{...p,x:0,y:0,z:0,rotation:0}} container={container} selected={false} hovered={false} showName={!!cargo.find(c=>c.id===p.cargoId)?.showName} local onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}/>
      </group>
    })}
  </group>
}

function CargoObject({ p, container, selected, onSelect, registerRef, showName, ghost = false }: { p: PlacedCargo; container: Container; selected: boolean; onSelect: () => void; registerRef: (id: string, o: THREE.Group | null) => void; showName: boolean; ghost?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => { registerRef(p.id, ref.current); return () => registerRef(p.id, null) }, [p.id, registerRef])
  // Sync only when the persisted cargo transform changes. Drag-state is intentionally
  // excluded: toggling it after TransformControls commits can replay stale React props.
  useLayoutEffect(() => { const o = ref.current; if (!o) return; const d = dims(p); o.position.set((p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S); o.rotation.set(0,0,p.rotation*Math.PI/180) }, [p.x,p.y,p.z,p.rotation,p.length,p.width,p.height,container.length,container.width])
  return <group ref={ref} onPointerDown={e=>{e.stopPropagation();onSelect()}} onClick={e=>{e.stopPropagation();onSelect()}}><CargoModel p={{...p,x:0,y:0,z:0}} container={container} selected={selected} hovered={false} showName={showName} ghost={ghost} local onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect()}}/></group>
}

function materialPlacement(item: SecuringItem, container: Container) { const maxX=Math.max(0,container.length-item.length),maxY=Math.max(0,container.width+MATERIAL_STAGE_GAP+MATERIAL_STAGE_DEPTH-item.width),maxZ=Math.max(0,container.height-item.height);return{x:Math.max(0,Math.min(maxX,item.x)),y:Math.max(0,Math.min(maxY,item.y)),z:Math.max(0,Math.min(maxZ,item.z))} }
function materialWorldPosition(item: SecuringItem, container: Container): [number,number,number] {
  if(item.type==='doorNet') return [(container.length/2)*S+.012,0,(container.doorHeight/2)*S]
  // A lashing belt is a transverse restraint: its 3D geometry spans the full
  // container width, so its anchor must stay on the container's centerline.
  if(item.type==='lashingBelt') return [(item.x+item.length/2-container.length/2)*S,0,item.z*S]
  return [(item.x+item.length/2-container.length/2)*S,(item.y+item.width/2-container.width/2)*S,(item.z+item.height/2)*S]
}
function MaterialObject({ item, container, selected, onSelect, registerRef, onDelete }: { item: SecuringItem; container: Container; selected: boolean; onSelect: () => void; registerRef: (id: string, o: THREE.Group | null) => void; onDelete: () => void }) {
  const ref=useRef<THREE.Group>(null);useEffect(()=>{registerRef(item.id,ref.current);return()=>registerRef(item.id,null)},[item.id,registerRef]);const {x,y,z}=materialPlacement(item,container),pos=materialWorldPosition({...item,x,y,z},container)
  return <group ref={ref} position={pos} rotation={[0,0,item.rotation*Math.PI/180]} onPointerDown={e=>{e.stopPropagation();onSelect()}} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect()}} onContextMenu={e=>{e.stopPropagation();e.nativeEvent.preventDefault();onDelete()}}><SecuringModel item={{...item,x,y,z}} container={container} selected={selected} local onSelect={onSelect}/></group>
}
function stageFootprint(type: SecuringMaterialType, container: Container): [number,number] {if(type==='lashingBelt')return[700,Math.min(2700,container.width+300)];if(type==='airBag')return[1100,1100];if(type==='triangleWood')return[350,350];return[Math.min(container.length,2800),Math.min(container.width,2600)]}
function stagePosition(type: SecuringMaterialType, materials: SecuringItem[], container: Container){const stageMinY=container.width+MATERIAL_STAGE_GAP,stageMaxY=stageMinY+MATERIAL_STAGE_DEPTH,centerX=container.length/2,centerY=stageMinY+MATERIAL_STAGE_DEPTH/2,[fw,fd]=stageFootprint(type,container),candidates:Array<[number,number]>=[[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],[-2,0],[2,0],[0,-2],[0,2],[-2,-1],[2,-1],[-2,1],[2,1]],stepX=Math.max(700,fw+180),stepY=Math.max(650,Math.min(1200,fd+180));const intersects=(cx:number,cy:number)=>materials.some(m=>{const[mw,md]=stageFootprint(m.type,container),mcx=m.x+m.length/2,mcy=m.type==='lashingBelt'?m.y+2:m.y+m.width/2;return Math.abs(cx-mcx)<(fw+mw)/2&&Math.abs(cy-mcy)<(fd+md)/2});for(const[gx,gy]of candidates){const cx=centerX+gx*stepX,cy=centerY+gy*stepY;if(cx-fw/2<0||cx+fw/2>container.length||cy-fd/2<stageMinY||cy+fd/2>stageMaxY)continue;if(!intersects(cx,cy))return{x:Math.max(0,cx-fw/2),y:Math.max(0,cy-(type==='lashingBelt'?2:fw/2)),z:0}}return{x:Math.max(0,centerX-fw/2),y:stageMinY+100,z:0}}


/** Lightweight procedural skybox for the Light Industrial CAD theme. */
function ProceduralSky() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3072
    canvas.height = 1536
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height)
    sky.addColorStop(0, '#4f9ddd')
    sky.addColorStop(.34, '#83c1ee')
    sky.addColorStop(.62, '#c3e3fa')
    sky.addColorStop(1, '#eaf5fc')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Soft, painterly cloud clusters; deterministic placement avoids rerender flicker.
    let seed = 20261019
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let cluster = 0; cluster < 42; cluster++) {
      const cx = rand() * canvas.width
      const cy = canvas.height * (.32 + rand() * .46)
      const scale = 34 + rand() * 86
      const puffs = 10 + Math.floor(rand() * 13)
      for (let puff = 0; puff < puffs; puff++) {
        const x = cx + (rand() - .5) * scale * 3.1
        const y = cy + (rand() - .5) * scale * .8
        const radius = scale * (.42 + rand() * .78)
        const g = ctx.createRadialGradient(x, y, radius * .08, x, y, radius)
        g.addColorStop(0, 'rgba(255,255,255,.62)')
        g.addColorStop(.38, 'rgba(255,255,255,.42)')
        g.addColorStop(.76, 'rgba(255,255,255,.14)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, y, radius * 1.7, radius * .68, (rand() - .5) * .18, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [])
  useEffect(() => () => texture?.dispose(), [texture])
  if (!texture) return null
  return <mesh renderOrder={-1000} frustumCulled={false}>
    <sphereGeometry args={[85, 48, 32]} />
    <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
  </mesh>
}

function SceneContent({props}:{props:Props}){
 const{invalidate}=useThree()
 const{container,items,materials,selectedId,selectedIds,onSelect,onSelectMany,onMove,onMoveMany,onRotate,onRotateMaterial,onMaterialMove,onMaterialScale,onAddMaterial,onUpdateMaterialPath,view,dragging,onDragState,cargo,lang,showDimensions}=props
 const refs=useRef<Record<string,THREE.Group>>({}),transformControls=useRef<any>(null),snapshots=useRef<Record<string,{position:THREE.Vector3;rotation:number;scale:THREE.Vector3}>>({}),lastValidTransforms=useRef<Record<string,{position:THREE.Vector3;rotation:number}>>({})
 const containerStructureRef=useRef<THREE.Group|null>(null);const[tool,setTool]=useState<SceneTool>('translate'),[sceneSelectionMode,setSceneSelectionMode]=useState<'single'|'multi'>(props.selectionMode==='box'?'multi':'single'),[freePlacementEnabled,setFreePlacementEnabled]=useState(!!props.freePlacement),[activeTransformId,setActiveTransformId]=useState<string|null>(null),[focusPoint,setFocusPoint]=useState<[number,number,number]|null>(null),[focusNonce,setFocusNonce]=useState(0),[routeEdit,setRouteEdit]=useState<{materialId:string;nodeIds:string[]}|null>(null)
 const activeMaterial=props.selectedMaterialId?materials.find(m=>m.id===props.selectedMaterialId)??null:null,activeId=activeMaterial?.id??(freePlacementEnabled?activeTransformId:null),activeObject=activeId?refs.current[activeId]??null:null,multi=sceneSelectionMode==='multi'
 const registerRef=useCallback((id:string,o:THREE.Group|null)=>{if(o)refs.current[id]=o;else delete refs.current[id]},[])
 const selectCargo=(id:string)=>{props.onSelectMaterial?.(null);setActiveTransformId(freePlacementEnabled?id:null);if(freePlacementEnabled){const p=items.find(q=>q.id===id);if(p){const d=dims(p);setFocusPoint([(p.x+d.length/2-container.length/2)*S,(p.y+d.width/2-container.width/2)*S,(p.z+p.height/2)*S]);setFocusNonce(n=>n+1)}}if(multi){const next=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];onSelectMany(next)}else onSelect(id)}
 const selectMaterial=(id:string)=>{const m=materials.find(q=>q.id===id);props.onSelectMaterial?.(id);onSelect(null);onSelectMany([]);setActiveTransformId(null);if(m){setFocusPoint(materialWorldPosition(m,container));setFocusNonce(n=>n+1)}}
 const capture=()=>{snapshots.current={};const ids=selectedIds.length?selectedIds:(selectedId?[selectedId]:[]);for(const id of ids){const o=refs.current[id];if(o){snapshots.current[id]={position:o.position.clone(),rotation:o.rotation.z,scale:o.scale.clone()};lastValidTransforms.current[id]={position:o.position.clone(),rotation:o.rotation.z}}}if(activeMaterial){const o=refs.current[activeMaterial.id];if(o){snapshots.current[activeMaterial.id]={position:o.position.clone(),rotation:o.rotation.z,scale:o.scale.clone()};lastValidTransforms.current[activeMaterial.id]={position:o.position.clone(),rotation:o.rotation.z}}}}
 const candidateFor=(p:PlacedCargo,o:THREE.Group)=>{const r=((Math.round(o.rotation.z/(Math.PI/2))*90)%360+360)%360,d=dims({...p,rotation:r}),x=Math.max(0,Math.min(container.length-d.length,Math.round((o.position.x/S-d.length/2+container.length/2)/10)*10)),y=Math.round((o.position.y/S-d.width/2+container.width/2)/10)*10,z=Math.max(0,Math.round((o.position.z/S-p.height/2)/10)*10);return{candidate:{...p,x,y,z,rotation:r},x,y,z,r}}
 const rememberPending=()=>{}
 const handleObjectChange=()=>{
  applyMulti()
  if(!activeMaterial){
   const ids=selectedIds.length?selectedIds:(selectedId?[selectedId]:[])
   for(const id of ids){
    const p=items.find(q=>q.id===id),o=refs.current[id]
    if(!p||!o)continue
    const rotation=((Math.round(o.rotation.z/(Math.PI/2))*90)%360+360)%360
    const d=dims({...p,rotation})
    const last=lastValidTransforms.current[id]
    const target=o.position.clone()
    const start=last?.position.clone()??target.clone()
    const distance=start.distanceTo(target)
    const steps=Math.max(1,Math.ceil(distance/(.02*S)))
    let safe=start.clone(),blockedAt:THREE.Vector3|null=null
    const startX=start.x/S-d.length/2+container.length/2
    const startY=start.y/S-d.width/2+container.width/2
    const startZ=start.z/S-p.height/2
    const initialOverlaps=new Map<string,number>()
    for(const q of items){
     if(q.id===id||ids.includes(q.id))continue
     const qd=dims(q)
     const ox=Math.max(0,Math.min(startX+d.length,q.x+qd.length)-Math.max(startX,q.x))
     const oy=Math.max(0,Math.min(startY+d.width,q.y+qd.width)-Math.max(startY,q.y))
     const oz=Math.max(0,Math.min(startZ+p.height,q.z+q.height)-Math.max(startZ,q.z))
     const volume=ox*oy*oz
     if(volume>0)initialOverlaps.set(q.id,volume)
    }
    const isBlocked=(probe:THREE.Vector3)=>{
     const x=probe.x/S-d.length/2+container.length/2
     const y=probe.y/S-d.width/2+container.width/2
     const z=probe.z/S-p.height/2
     if(x<0||z<0||x+d.length>container.length||z+p.height>container.height)return true
     return items.some(q=>{
      if(q.id===id||ids.includes(q.id))return false
      const qd=dims(q)
      const ox=Math.max(0,Math.min(x+d.length,q.x+qd.length)-Math.max(x,q.x))
      const oy=Math.max(0,Math.min(y+d.width,q.y+qd.width)-Math.max(y,q.y))
      const oz=Math.max(0,Math.min(z+p.height,q.z+q.height)-Math.max(z,q.z))
      const volume=ox*oy*oz
      // Existing tiny overlaps can occur from imported/previously packed stacks.
      // Permit motion that does not worsen an existing overlap, so cargo can be
      // pulled free instead of becoming locked to one direction.
      return volume>Math.max(1,initialOverlaps.get(q.id)??0)+1
     })
    }
    for(let step=1;step<=steps;step++){
     const probe=start.clone().lerp(target,step/steps)
     if(isBlocked(probe)){blockedAt=probe;break}
     safe.copy(probe)
    }
    if(blockedAt){
     let low=0,high=1
     const span=blockedAt.clone().sub(safe)
     for(let i=0;i<10;i++){
      const mid=(low+high)/2,probe=safe.clone().addScaledVector(span,mid)
      if(isBlocked(probe))high=mid;else low=mid
     }
     o.position.copy(safe.clone().addScaledVector(span,low))
     o.rotation.z=last?.rotation??o.rotation.z
    }
    lastValidTransforms.current[id]={position:o.position.clone(),rotation:o.rotation.z}
   }
  }
  invalidate()
 }
 const commit=()=>{if(activeMaterial){const o=refs.current[activeMaterial.id];if(!o)return;const r=((Math.round(o.rotation.z/(Math.PI/2))*90)%360+360)%360;if(activeMaterial.type==='doorNet'){o.position.set((container.length/2)*S+.012,0,(container.doorHeight/2)*S);o.rotation.z=0;onMaterialMove(activeMaterial.id,container.length-40,0);onRotateMaterial(activeMaterial.id,0);return}const rawX=Math.round((o.position.x/S-activeMaterial.length/2+container.length/2)/10)*10,rawY=Math.round((o.position.y/S-activeMaterial.width/2+container.width/2)/10)*10,maxY=container.width+MATERIAL_STAGE_GAP+MATERIAL_STAGE_DEPTH-activeMaterial.width;onMaterialMove(activeMaterial.id,Math.max(0,Math.min(container.length-activeMaterial.length,rawX)),Math.max(0,Math.min(maxY,rawY)));onRotateMaterial(activeMaterial.id,r);if(tool==='scale'){const s=snapshots.current[activeMaterial.id];if(s){const f=Math.max(.25,Math.min(4,o.scale.x/Math.max(.001,s.scale.x)));o.scale.set(1,1,1);onMaterialScale(activeMaterial.id,f)}}return}const ids=selectedIds.length?selectedIds:(selectedId?[selectedId]:[]),updates:Array<{id:string;x:number;y:number;z:number;rotation?:number}>=[];for(const id of ids){const p=items.find(q=>q.id===id),o=refs.current[id];if(!p||!o)continue;const result=candidateFor(p,o),candidate={...p,x:result.x,y:result.y,z:result.z,rotation:result.r},validation=validatePlacement(candidate,container,items.filter(q=>q.id!==id&&!ids.includes(q.id)),undefined,true);if(validation.ok)updates.push({id,x:result.x,y:result.y,z:result.z,rotation:result.r});else if(snapshots.current[id]){o.position.copy(snapshots.current[id].position);o.rotation.z=snapshots.current[id].rotation}}if(updates.length){if(onMoveMany)onMoveMany(updates);else updates.forEach(u=>{if(u.rotation!=null)onRotate(u.id,u.rotation);onMove(u.id,u.x,u.y,u.z)})}}
 const applyMulti=()=>{if(!multi||selectedIds.length<2)return;const first=refs.current[selectedIds[0]],base=snapshots.current[selectedIds[0]];if(!first||!base)return;const dx=first.position.x-base.position.x,dy=first.position.y-base.position.y,dz=first.position.z-base.position.z,dr=first.rotation.z-base.rotation;for(const id of selectedIds.slice(1)){const o=refs.current[id],s=snapshots.current[id];if(!o||!s)continue;o.position.copy(s.position).add(new THREE.Vector3(dx,dy,dz));o.rotation.z=s.rotation+dr}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){onSelect(null);onSelectMany([]);props.onSelectMaterial?.(null);setActiveTransformId(null)}if(e.key==='Delete'&&props.selectedMaterialId){props.onDeleteMaterial?.(props.selectedMaterialId);props.onSelectMaterial?.(null);setActiveTransformId(null)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[props.selectedMaterialId,props.onDeleteMaterial,onSelect,onSelectMany])
 useEffect(()=>{setSceneSelectionMode(props.selectionMode==='box'?'multi':'single')},[props.selectionMode])
 useEffect(()=>{setFreePlacementEnabled(!!props.freePlacement)},[props.freePlacement])
  // Fade the shell during hook selection, then restore each material's original settings.
  useEffect(()=>{
    const root=containerStructureRef.current
    if(!root)return
    root.traverse(object=>{
      const mesh=object as THREE.Mesh
      if(!mesh.isMesh||!mesh.material)return
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material]
      materials.forEach(material=>{
        const data=material.userData as Record<string,unknown>
        if(data.routeBaseOpacity===undefined){
          data.routeBaseOpacity=material.opacity
          data.routeBaseTransparent=material.transparent
          data.routeBaseDepthWrite=material.depthWrite
        }
        if(routeEdit){
          material.transparent=true
          material.opacity=Math.min(Number(data.routeBaseOpacity),.22)
          material.depthWrite=false
        }else{
          material.opacity=Number(data.routeBaseOpacity)
          material.transparent=Boolean(data.routeBaseTransparent)
          material.depthWrite=Boolean(data.routeBaseDepthWrite)
        }
        material.needsUpdate=true
      })
    })
  },[routeEdit])
  // Fully release the active gizmo after deselection so Three.js cannot retain a stale axis.
  useEffect(()=>{if(!props.selectedId&&props.selectedIds.length===0&&!props.selectedMaterialId)setActiveTransformId(null)},[props.selectedId,props.selectedIds,props.selectedMaterialId])
 
   const pointById = (id: string) => container.lashingPoints.find(p => p.id === id)
  const routeAllowedIds = useMemo(() => {
    if (!routeEdit) return []
    const points = container.lashingPoints
    const isTop = (p: typeof points[number]) => p.z > container.height / 2
    const side = (p: typeof points[number]) => p.y <= container.width / 2 ? 'L' : 'R'
    const slot = (p: typeof points[number]) => Number(p.id.match(/(\d+)$/)?.[1] ?? 0)
    const chosen = routeEdit.nodeIds.map(pointById).filter(Boolean) as typeof points
    if (chosen.length === 0) return points.filter(isTop).map(p => p.id)
    const first = chosen[0], last = chosen[chosen.length - 1]
    // Correct route: top A -> bottom B -> bottom A -> top B.
     // The diagonal legs cross the container; the lower cross-piece joins the two bottom hooks.
     if (chosen.length === 1) return points.filter(p => !isTop(p) && side(p) !== side(first) && Math.abs(slot(p)-slot(first)) <= 4).map(p => p.id)
     if (chosen.length === 2) return points.filter(p => !isTop(p) && side(p) !== side(last) && Math.abs(slot(p)-slot(last)) <= 1).map(p => p.id)
     if (chosen.length === 3) return points.filter(p => isTop(p) && side(p) !== side(first) && Math.abs(slot(p)-slot(first)) <= 4).map(p => p.id)
    return []
  }, [routeEdit, container.lashingPoints, container.height, container.width])
  const chooseRoutePoint = (pointId: string) => {
    if (!routeEdit || !routeAllowedIds.includes(pointId)) return
    const nodeIds = [...routeEdit.nodeIds, pointId]
    const path = nodeIds.map(pointById).filter(Boolean).map(p => ({ x: p!.x, y: p!.y, z: p!.z }))
    onUpdateMaterialPath(routeEdit.materialId, path)
    if (nodeIds.length >= 4) {
      setRouteEdit(null)
      props.onSelectMaterial?.(routeEdit.materialId)
    } else setRouteEdit({ materialId: routeEdit.materialId, nodeIds })
  }
  const beginLashingRoute = () => {
    const existing = props.selectedMaterialId ? materials.find(m => m.id === props.selectedMaterialId && m.type === 'lashingBelt') : undefined
    const id = existing?.id ?? onAddMaterial('lashingBelt')
    onUpdateMaterialPath(id, [])
    setRouteEdit({ materialId: id, nodeIds: [] })
    setTool('translate')
    props.onSelectMaterial?.(id)
    onSelect(null)
    onSelectMany([])
    setActiveTransformId(null)
    props.onView?.('iso')
    setFocusPoint([0, 0, container.height * S * .45])
    setFocusNonce(n => n + 1)
  }
  const cancelLashingRoute = () => {
    if (routeEdit) {
      const material = materials.find(m => m.id === routeEdit.materialId)
      if (material && !material.path?.length) {
        props.onDeleteMaterial?.(material.id)
        props.onSelectMaterial?.(null)
      }
    }
    setRouteEdit(null)
  }

const addMaterial=(type:SecuringMaterialType)=>{if(type==='doorNet'){const existing=materials.find(m=>m.type==='doorNet');if(existing){selectMaterial(existing.id);return existing.id}}const id=onAddMaterial(type);if(type==='doorNet'){onMaterialMove(id,container.length-40,0);return id}const p=stagePosition(type,materials,container);onMaterialMove(id,p.x,p.y);return id}
 const toolbar=<div className="scene-toolbox" style={{pointerEvents:'auto'}}><button className={tool==='translate'?'active':''} onClick={()=>setTool('translate')}>↔ 移动</button><button className={tool==='rotate'?'active':''} onClick={()=>setTool('rotate')}>⟳ 旋转</button><button disabled={!activeMaterial} className={!activeMaterial?'disabled':tool==='scale'?'active':''} onClick={()=>setTool('scale')}>⤢ 缩放</button><button disabled={!activeMaterial} className={!activeMaterial?'disabled':'danger'} onClick={()=>{if(props.selectedMaterialId){props.onDeleteMaterial?.(props.selectedMaterialId);props.onSelectMaterial?.(null)}}}>删除选中</button><div className="tool-divider"/><b>加固材料</b><button onClick={()=>addMaterial('triangleWood')}>三角木</button><button className={routeEdit?'active':''} onClick={routeEdit?cancelLashingRoute:beginLashingRoute}>{routeEdit?(lang==='zh'?'取消绑扎':'Cancel strap'):(lang==='zh'?'紧固带':'Lashing strap')}</button><button onClick={()=>addMaterial('airBag')}>充气袋</button><button disabled={materials.some(m=>m.type==='doorNet')} onClick={()=>addMaterial('doorNet')}>柜门网</button></div>
 const toolbarRoot=useRef<Root|null>(null)
 useEffect(()=>{const host=props.toolbarHost;if(!host)return;if(!toolbarRoot.current)toolbarRoot.current=createRoot(host);toolbarRoot.current.render(toolbar);return()=>{toolbarRoot.current?.unmount();toolbarRoot.current=null}},[props.toolbarHost,tool,activeMaterial?.id,props.selectedMaterialId,freePlacementEnabled,selectedId,materials.length])
 const instancedCartons=useMemo(()=>items.filter(p=>p.cargoType==='carton'&&!selectedIds.includes(p.id)&&p.id!==selectedId&&!cargo.find(c=>c.id===p.cargoId)?.showName),[items,selectedIds,selectedId,cargo]),instancedIds=useMemo(()=>new Set(instancedCartons.map(p=>p.id)),[instancedCartons]),individualItems=useMemo(()=>items.filter(p=>!instancedIds.has(p.id)),[items,instancedIds])
 const visibleMaterials=useMemo(()=>view==='iso'?materials:materials.filter(m=>m.type==='doorNet'||m.y<container.width),[view,materials,container.width])
 const orthographic=view!=='iso'
 return <>{routeEdit&&<Html fullscreen><div className="lashing-route-hud">{lang==='zh'?['选择顶部起点','选择对侧底部挂钩（斜拉）','选择起点侧底部挂钩（横拉）','选择对侧顶部终点（斜拉）'][routeEdit.nodeIds.length]:'Select '+['top start','opposite-side bottom hook (diagonal)','start-side bottom hook (crosswise)','opposite-side top end (diagonal)'][routeEdit.nodeIds.length]} <button onClick={cancelLashingRoute}>{lang==='zh'?'取消':'Cancel'}</button></div></Html>}{orthographic?<OrthographicCamera makeDefault position={[0,0,10]} zoom={1}/>:<PerspectiveCamera makeDefault position={[10,8,6]} fov={42} near={.01} far={120}/>}<color attach="background" args={[isLightIndustrialTheme() ? '#83c1ee' : '#080808']}/>{isLightIndustrialTheme() && <ProceduralSky/>}<ambientLight intensity={isLightIndustrialTheme() ? 1.55 : 1.15}/><directionalLight position={[8,10,18]} intensity={isLightIndustrialTheme() ? 2.0 : 1.8}/><hemisphereLight intensity={isLightIndustrialTheme() ? .55 : .25} groundColor={isLightIndustrialTheme() ? '#c8d1d9' : '#080808'} color={isLightIndustrialTheme() ? '#ffffff' : '#d8d8d0'}/><group ref={containerStructureRef}><ContainerStructure container={container} lang={lang} showDimensions={showDimensions}/></group><ContainerFloor container={container}/>{view==='iso'&&<><SecuringMaterialZone container={container} lang={lang}/><OverflowCargoZone container={container} items={props.overflowItems} cargo={cargo} lang={lang}/></>}<LashingPoints container={container} selectable={!!routeEdit} allowedIds={routeAllowedIds} selectedIds={routeEdit?.nodeIds ?? []} onPointSelect={chooseRoutePoint}/><CoordinateAxes container={container}/><InstancedCartons items={instancedCartons} container={container} onSelect={selectCargo} ghost={!!routeEdit}/>{individualItems.map(p=><CargoObject key={p.id} p={p} container={container} selected={selectedIds.includes(p.id)||p.id===selectedId} onSelect={()=>selectCargo(p.id)} registerRef={registerRef} showName={!!cargo.find(c=>c.id===p.cargoId)?.showName} ghost={!!routeEdit}/>)}{visibleMaterials.map(m=><MaterialObject key={m.id} item={m} container={container} selected={m.id===props.selectedMaterialId} onSelect={()=>selectMaterial(m.id)} onDelete={()=>{props.onDeleteMaterial?.(m.id);props.onSelectMaterial?.(null);setActiveTransformId(null)}} registerRef={registerRef}/>)}{activeObject&&(activeMaterial||freePlacementEnabled)&&<TransformControls ref={transformControls} key={`${activeId}:${tool}`} object={activeObject} mode={activeMaterial&&tool==='scale'?'scale':tool} {...(tool==='rotate'?{axis:'Z'}:{})} space="local" translationSnap={null} rotationSnap={Math.PI/2} size={1.15} scaleSnap={.05} showX={true} showY={tool!=='rotate'} showZ onMouseDown={()=>{capture();onDragState(true)}} onMouseUp={()=>{commit();invalidate();requestAnimationFrame(()=>{onDragState(false);invalidate()})}} onObjectChange={handleObjectChange}/>}<CameraRig view={view} container={container} dragging={dragging} transformActive={!!activeObject&&!!(activeMaterial||freePlacementEnabled)} focusPoint={focusPoint} focusNonce={focusNonce} routeMode={!!routeEdit}/></>
}
export default function ContainerScene(props:Props){const[selectedMaterialId,setSelectedMaterialId]=useState<string|null>(null),[toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null);return <div className="scene-shell" style={{position:'relative',width:'100%',height:'100%'}}><Canvas frameloop="demand" dpr={[1,1.25]} gl={{antialias:true,powerPreference:'high-performance'}} camera={{position:[10,8,6],fov:42,near:.01,far:120,up:[0,0,1]}} onPointerMissed={()=>{props.onSelect(null);props.onSelectMany([]);setSelectedMaterialId(null)}}><SceneContent props={{...props,selectedMaterialId,onSelectMaterial:setSelectedMaterialId,toolbarHost}}/></Canvas><div ref={setToolbarHost} className="scene-toolbar-host" style={{position:'absolute',top:12,left:12,zIndex:50,pointerEvents:'none'}}/></div>}
