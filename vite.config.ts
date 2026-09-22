import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const disableCargoEditAutoPacking: Plugin = {
  name: 'disable-cargo-edit-auto-packing',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/App.tsx')) return null

    const start = code.indexOf("  const cargoSignature = useMemo(() => cargo.map(c => `${c.id}:${c.quantity}:${c.length}:${c.width}:${c.height}:${c.weight}:${c.type}:${c.stackable}:${c.loadBearing}:${c.rotatable}:${c.maxStackLayers}:${c.maxLoadOnTop}`).join('|'), [cargo])")
    if (start === -1) return null

    const endMarker = "\n\n  const totals = useMemo("
    const end = code.indexOf(endMarker, start)
    if (end === -1) return null

    const replacement = "  // Cargo edits intentionally do not trigger auto packing. Use the Auto Pack button instead."
    return { code: code.slice(0, start) + replacement + code.slice(end), map: null }
  },
}

export default defineConfig({
  plugins: [disableCargoEditAutoPacking, react()],
})
