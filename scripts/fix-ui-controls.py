from pathlib import Path

root = Path(__file__).resolve().parents[1]

p = root / 'src/components/ContainerScene.tsx'
s = p.read_text(encoding='utf-8')
old = """      onMouseDown={(event: any) => { event.stopPropagation(); capture(); onDragState(true) }}\n      onMouseUp={(event: any) => { event.stopPropagation(); onDragState(false); commit() }}\n      onChange={() => { applyMulti(); previewCargo() }}\n"""
new = """      onMouseDown={(event: any) => { event.stopPropagation(); capture(); onDragState(true) }}\n      onMouseUp={(event: any) => { event.stopPropagation(); commit(); onDragState(false) }}\n      onChange={() => { applyMulti(); previewCargo() }}\n"""
if old not in s:
    raise SystemExit('TransformControls mouse handlers not found')
s = s.replace(old, new, 1)
old = """      axis={tool === 'rotate' ? 'Z' : undefined}\n      translationSnap={.01}\n      rotationSnap={Math.PI / 2}\n      scaleSnap={.05}\n      showX={tool !== 'rotate'} showY={tool !== 'rotate'} showZ\n"""
new = """      axis={undefined}\n      translationSnap={.01}\n      rotationSnap={Math.PI / 2}\n      scaleSnap={.05}\n      showX={tool === 'rotate' ? true : true} showY={tool === 'rotate' ? false : true} showZ\n"""
if old not in s:
    raise SystemExit('TransformControls axis block not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

p = root / 'src/components/CargoProperties.tsx'
s = p.read_text(encoding='utf-8')
s = s.replace("{lang === 'zh' ? '单件重量' : 'Unit Weight'}", "{lang === 'zh' ? '单件重量 (KG)' : 'Unit Weight (KG)'}")
s = s.replace("{lang === 'zh' ? '原始尺寸' : 'Original Size'}", "{lang === 'zh' ? '原始尺寸 (mm)' : 'Original Size (mm)'}")
s = s.replace("{lang === 'zh' ? '实际占地' : 'Placed Footprint'}", "{lang === 'zh' ? '实际尺寸 (mm)' : 'Placed Size (mm)'}")
s = s.replace("{lang === 'zh' ? '位置' : 'Position'}", "{lang === 'zh' ? '位置 (mm)' : 'Position (mm)'}")
p.write_text(s, encoding='utf-8')

p = root / 'src/components/SceneOverrides.css'
s = p.read_text(encoding='utf-8')
s = s.replace('.scene-toolbox{position:absolute!important;left:10px!important;top:10px!important;', '.scene-toolbox{position:fixed!important;left:10px!important;top:86px!important;')
p.write_text(s, encoding='utf-8')

print('patched')
