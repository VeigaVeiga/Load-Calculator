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
        if (end !== -1) code = code.slice(0, start) + "  // Cargo edits intentionally do not trigger auto packing. Use the Auto Pack button instead." + code.slice(end)
      }
      code = code.replace("const [showDimensions, setShowDimensions] = useState(true)", "const [showDimensions, setShowDimensions] = useState(false)")
      code = code.replace("const [packingProgress, setPackingProgress] = useState<number | null>(null)", "const [packingProgress, setPackingProgress] = useState<number | null>(null)\n  const packingAbortRef = useRef<AbortController | null>(null)")
      const runStart = code.indexOf("  const runPacking = async (nextContainer = container) => {")
      if (runStart !== -1) {
        const runEndMarker = "\n\n\n  const addMaterial = ("
        const runEnd = code.indexOf(runEndMarker, runStart)
        if (runEnd !== -1) {
          const replacement = `  const runPacking = async (nextContainer = container) => {
    if (packingProgress !== null) return
    const controller = new AbortController()
    packingAbortRef.current = controller
    ;(globalThis as any).__packingAbortSignal = controller.signal
    const locked = placed.filter((p) => p.locked)
    setPackingProgress(0)
    setMessage('')
    let lastProgress = -1
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (controller.signal.aborted) return
      const result = await autoPackAsync(cargo, nextContainer, locked, (percent) => {
        const safePercent = Math.min(100, Math.max(0, Math.round(percent)))
        if (safePercent !== lastProgress) {
          lastProgress = safePercent
          setPackingProgress(safePercent)
        }
      })
      if (controller.signal.aborted) return
      setPlaced(result)
      setSelectedId(null)
      setSelectedIds([])
      setMessage(lang === 'zh' ? '自动装柜完成' : 'Auto packing complete')
    } finally {
      if ((globalThis as any).__packingAbortSignal === controller.signal) (globalThis as any).__packingAbortSignal = undefined
      packingAbortRef.current = null
      setPackingProgress(null)
    }
  }

  const cancelPacking = () => {
    packingAbortRef.current?.abort()
    ;(globalThis as any).__packingAbortSignal = undefined
    packingAbortRef.current = null
    setPackingProgress(null)
    setMessage(lang === 'zh' ? '已取消装柜计算' : 'Packing cancelled')
  }`
          code = code.slice(0, runStart) + replacement + code.slice(runEnd)
        }
      }
      const progressNeedle = "<span>{lang === 'zh' ? '正在搜索摆放位置与旋转组合，请稍候…' : 'Searching placement and rotation combinations…'}</span>"
      code = code.replace(progressNeedle, progressNeedle + "\n                  <button className=\"packing-cancel\" onClick={cancelPacking}>{lang === 'zh' ? '取消计算' : 'Cancel'}</button>")
      return { code, map: null }
    }
    if (id.endsWith('/src/packing/packer.ts')) {
      code = code.replace("if(stackLevel(p,items)>Math.max(1,Math.floor(c.maxStackLayers||1)))return false", "const maxLayers=c.stackable?Math.max(2,Math.floor(c.maxStackLayers||2)):1\n  if(stackLevel(p,items)>maxLayers)return false")
      const old = "for(const x of [q.x,q.x+qd.length-o.length])for(const y of [q.y,q.y+qd.width-o.width]){"
      const replacement = "for(const x of [q.x,q.x+(qd.length-o.length)/2,q.x+qd.length-o.length])for(const y of [q.y,q.y+(qd.width-o.width)/2,q.y+qd.width-o.width]){"
      code = code.replace(old, replacement)
      code = code.replace("const state=buildState(cargo,c,locked),n=state.us.length;if(n===0){", "const state=buildState(cargo,c,locked),n=state.us.length;const signal=(globalThis as any).__packingAbortSignal as AbortSignal|undefined;if(signal?.aborted)return state.items;if(n===0){")
      code = code.replace("for(const group of groups.values()){", "for(const group of groups.values()){if(signal?.aborted)return state.items;")
      code = code.replace("for(const u of group){placeOne(state,u,c);done++;report(done,total);", "for(const u of group){if(signal?.aborted)return state.items;placeOne(state,u,c);done++;report(done,total);")
      code = code.replace("for(let i=0;i<n;i++){placeOne(state,state.us[i],c);report(i+1,n);", "for(let i=0;i<n;i++){if(signal?.aborted)return state.items;placeOne(state,state.us[i],c);report(i+1,n);")
      return { code, map: null }
    }
    return null
  },
}

export default defineConfig({
  plugins: [plannerRuntimeFixes, react()],
})