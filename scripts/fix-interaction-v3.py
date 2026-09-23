from pathlib import Path

root=Path(__file__).resolve().parents[1]
scene=root/'src/components/ContainerScene.tsx'
app=root/'src/App.tsx'
s=scene.read_text(encoding='utf-8')
a=app.read_text(encoding='utf-8')

# Cargo transform reset: the group center must use the cargo's physical dimensions,
# not the rotated bounding dimensions. TransformControls supplies the rotation.
s=s.replace("import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'", "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'")
s=s.replace("  const d = dims(p)\n  const pos: [number, number, number] = [(p.x + d.length / 2 - container.length / 2) * S, (p.y + d.width / 2 - container.width / 2) * S, (p.z + p.height / 2) * S]", "  const pos: [number, number, number] = [(p.x + p.length / 2 - container.length / 2) * S, (p.y + p.width / 2 - container.width / 2) * S, (p.z + p.height / 2) * S]")

# Keep the last committed transform authoritative immediately after mouse-up.
s=s.replace("onMouseUp={(event: any) => { event.stopPropagation(); commit(); onDragState(false) }}", "onMouseUp={(event: any) => { event.stopPropagation(); commit(); requestAnimationFrame(() => onDragState(false)) }}")

# Move the toolbar completely outside the R3F scene. It is now a normal DOM portal,
# so camera movement can never transform it.
s=s.replace("    <Html fullscreen style={{ pointerEvents: 'none' }}><div style={{ pointerEvents: 'none' }}>{toolbar}</div></Html>\n", "    {typeof document !== 'undefined' ? createPortal(<div className=\"scene-toolbar-portal\">{toolbar}</div>, document.body) : null}\n")

scene.write_text(s,encoding='utf-8')

# Explicit units in cargo input labels.
a=a.replace("{tr.quantity}\n\n                      <input", "{tr.quantity} <small className=\"field-unit\">(件)</small>\n\n                      <input")
a=a.replace("{tr.unitWeight}\n\n                      <input", "{tr.unitWeight} <small className=\"field-unit\">(KG)</small>\n\n                      <input")
a=a.replace("{tr.length}\n\n                      <input", "{tr.length} <small className=\"field-unit\">(mm)</small>\n\n                      <input")
a=a.replace("{tr.width}\n\n                      <input", "{tr.width} <small className=\"field-unit\">(mm)</small>\n\n                      <input")
a=a.replace("{tr.height}\n\n                      <input", "{tr.height} <small className=\"field-unit\">(mm)</small>\n\n                      <input")
app.write_text(a,encoding='utf-8')

css=root/'src/App.css'
if css.exists():
    c=css.read_text(encoding='utf-8')
else:
    c=''
c += '''\n\n/* INTERACTION_V3: the 3D toolbar is a document-level overlay, never part of the R3F scene. */\n.scene-toolbar-portal {\n  position: fixed;\n  left: 24px;\n  top: 148px;\n  z-index: 100000;\n  pointer-events: none;\n}\n.scene-toolbar-portal .scene-toolbox {\n  position: relative !important;\n  left: auto !important;\n  top: auto !important;\n  right: auto !important;\n  bottom: auto !important;\n  transform: none !important;\n  pointer-events: auto !important;\n}\n.field-unit {\n  font-size: 10px;\n  opacity: .72;\n  font-weight: 600;\n  margin-left: 3px;\n}\n'''
css.write_text(c,encoding='utf-8')
