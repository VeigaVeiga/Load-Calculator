from pathlib import Path
import re

p = Path('src/components/ContainerScene.tsx')
s = p.read_text(encoding='utf-8')

# Camera focus: 3ds-Max-like focus on the clicked cargo while Free Placement is on.
s = s.replace(
"function CameraRig({ view, container, dragging, transformActive }: { view: View; container: Container; dragging: boolean; transformActive: boolean }) {",
"function CameraRig({ view, container, dragging, transformActive, focusPoint, focusNonce }: { view: View; container: Container; dragging: boolean; transformActive: boolean; focusPoint: [number, number, number] | null; focusNonce: number }) {"
)
needle = "  useEffect(() => {\n    const c = controls.current\n    if (!c) return\n    // Single source of truth: after a transform ends, deselection, or Free Placement\n"
insert = "  useEffect(() => {\n    const c = controls.current\n    if (!c || !focusPoint || focusNonce === 0) return\n    const nextTarget = new THREE.Vector3(...focusPoint)\n    const offset = camera.position.clone().sub(c.target)\n    c.target.copy(nextTarget)\n    camera.position.copy(nextTarget).add(offset)\n    camera.lookAt(nextTarget)\n    c.update()\n  }, [focusNonce, focusPoint, camera])\n\n" + needle
if needle not in s:
    raise SystemExit('Camera focus insertion point not found')
s = s.replace(needle, insert, 1)

# Scene state for focus.
old = "  const [freePlacementEnabled, setFreePlacementEnabled] = useState(!!props.freePlacement)\n  const activeMaterial"
new = "  const [freePlacementEnabled, setFreePlacementEnabled] = useState(!!props.freePlacement)\n  const [focusPoint, setFocusPoint] = useState<[number, number, number] | null>(null)\n  const [focusNonce, setFocusNonce] = useState(0)\n  const activeMaterial"
if old not in s:
    raise SystemExit('focus state insertion point not found')
s = s.replace(old, new, 1)

old_select = "  const selectCargo = (id: string) => {\n    props.onSelectMaterial?.(null)\n    if (multi) {\n      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]\n      onSelectMany(next)\n    } else onSelect(id)\n  }"
new_select = "  const selectCargo = (id: string) => {\n    props.onSelectMaterial?.(null)\n    if (freePlacementEnabled) {\n      const p = items.find(q => q.id === id)\n      if (p) {\n        const d = dims(p)\n        setFocusPoint([(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + p.height / 2) * S])\n        setFocusNonce(n => n + 1)\n      }\n    }\n    if (multi) {\n      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]\n      onSelectMany(next)\n    } else onSelect(id)\n  }"
if old_select not in s:
    raise SystemExit('selectCargo block not found')
s = s.replace(old_select, new_select, 1)

# Keep the last valid transform, not merely the transform at drag start.
old_preview = "  const previewCargo = () => {\n    if (!selectedId) return\n    const p = items.find(q => q.id === selectedId), o = refs.current[selectedId]\n    if (!p || !o) return\n    const { candidate } = candidateFor(p, o)\n    const validation = validatePlacement(candidate, container, items.filter(q => q.id !== selectedId))\n    if (!validation.ok && snapshots.current[selectedId]) { o.position.copy(snapshots.current[selectedId].position); o.rotation.z = snapshots.current[selectedId].rotation }\n  }"
new_preview = "  const previewCargo = () => {\n    if (!selectedId) return\n    const p = items.find(q => q.id === selectedId), o = refs.current[selectedId]\n    if (!p || !o) return\n    const { candidate } = candidateFor(p, o)\n    const validation = validatePlacement(candidate, container, items.filter(q => q.id !== selectedId))\n    if (!validation.ok) {\n      const last = snapshots.current[selectedId]\n      if (last) { o.position.copy(last.position); o.rotation.z = last.rotation; o.scale.copy(last.scale) }\n      return\n    }\n    snapshots.current[selectedId] = { position: o.position.clone(), rotation: o.rotation.z, scale: o.scale.clone() }\n  }"
if old_preview not in s:
    raise SystemExit('preview block not found')
s = s.replace(old_preview, new_preview, 1)

# Show only the useful rotation handle: vertical Z rotation. Translation still has X/Y/Z.
old_gizmo = "      showX showY showZ\n      onMouseDown={(event: any) => { event.stopPropagation(); onDragState(true) }}"
new_gizmo = "      showX={tool !== 'rotate'} showY={tool !== 'rotate'} showZ\n      onMouseDown={(event: any) => { event.stopPropagation(); capture(); onDragState(true) }}"
if old_gizmo not in s:
    raise SystemExit('TransformControls props not found')
s = s.replace(old_gizmo, new_gizmo, 1)

# Pass focus state to camera.
s = s.replace(
"    <CameraRig view={view} container={container} dragging={dragging} transformActive={!!activeObject && !!(activeMaterial || freePlacementEnabled)} />",
"    <CameraRig view={view} container={container} dragging={dragging} transformActive={!!activeObject && !!(activeMaterial || freePlacementEnabled)} focusPoint={focusPoint} focusNonce={focusNonce} />"
)

p.write_text(s, encoding='utf-8')
print('scene v4 patched')
