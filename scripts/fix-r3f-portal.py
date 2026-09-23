from pathlib import Path

p = Path('src/components/ContainerScene.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("import { createPortal } from 'react-dom'\n", "")
old = "{typeof document !== 'undefined' ? createPortal(<div className=\"scene-toolbar-portal\">{toolbar}</div>, document.body) : null}"
new = "<Html fullscreen transform={False} zIndexRange={[10000, 0]} style={{ pointerEvents: 'none' }}><div className=\"scene-toolbar-portal\" style={{ pointerEvents: 'auto', position: 'absolute', left: 12, top: 12 }}>{toolbar}</div></Html>"
if old not in s:
    raise SystemExit('Expected toolbar portal expression was not found')
s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
