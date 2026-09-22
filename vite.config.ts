import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const plannerRuntimeFixes: Plugin = {
  name: 'planner-runtime-fixes',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/App.tsx')) {
      const start = code.indexOf("  const cargoSignature = useMemo(() => cargo.map(c => `${c.id}:${c.quantity}:${c.length}:${c.width}:${c.height}:${c.weight}:${c.type}:${c.stackable}:${c.loadBearing}:${c.rotatable}:${c.maxStackLayers}:${c.maxLoadOnTop}`).join('|'), [cargo])")
      if (start !== -1) {
        const endMarker = "\n\n  const totals = useMemo("
        const end = code.indexOf(endMarker, start)
        if (end !== -1) {
          const replacement = "  // Cargo edits intentionally do not trigger auto packing. Use the Auto Pack button instead."
          code = code.slice(0, start) + replacement + code.slice(end)
        }
      }

      // Dimension annotations are an optional visual aid and start disabled.
      code = code.replace("const [showDimensions, setShowDimensions] = useState(true)", "const [showDimensions, setShowDimensions] = useState(false)")
      return { code, map: null }
    }

    if (id.endsWith('/src/packing/packer.ts')) {
      // A checked 'stackable' cargo must be able to form at least a second layer.
      // Keep explicit larger limits, while treating 0/1 as the basic stackable mode.
      code = code.replace(
        "if(stackLevel(p,items)>Math.max(1,Math.floor(c.maxStackLayers||1)))return false",
        "const maxLayers=c.stackable?Math.max(2,Math.floor(c.maxStackLayers||2)):1\n  if(stackLevel(p,items)>maxLayers)return false",
      )

      // Add center and edge candidates so a new layer can sit on a broad support area,
      // rather than relying only on the four corners of the supporting cargo.
      const old = "for(const x of [q.x,q.x+qd.length-o.length])for(const y of [q.y,q.y+qd.width-o.width]){"
      const replacement = "for(const x of [q.x,q.x+(qd.length-o.length)/2,q.x+qd.length-o.length])for(const y of [q.y,q.y+(qd.width-o.width)/2,q.y+qd.width-o.width]){"
      code = code.replace(old, replacement)
      return { code, map: null }
    }

    return null
  },
}

export default defineConfig({
  plugins: [plannerRuntimeFixes, react()],
})
