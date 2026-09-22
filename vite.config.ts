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
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
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
      // Inject a guaranteed visible progress overlay near the App root, independent of the existing progress markup.
      const returnNeedle = "return ("
      if (!code.includes('className="packing-progress-overlay"')) {
        const returnAt = code.indexOf(returnNeedle)
        if (returnAt !== -1) {
          const overlay = `{packingProgress !== null && (\n        <div className=\"packing-progress-overlay\" style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',zIndex:100000,minWidth:320,padding:'12px 16px',background:'#ffffff',border:'1px solid #cbd5e1',borderRadius:10,boxShadow:'0 8px 30px rgba(0,0,0,.18)',fontFamily:'sans-serif'}}>\n          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,fontWeight:700}}><span>{lang === 'zh' ? '装柜计算中' : 'Packing'}</span><span>{packingProgress}%</span></div>\n          <div style={{height:8,background:'#e5e7eb',borderRadius:99,overflow:'hidden'}}><div style={{width:packingProgress+'%',height:'100%',background:'#2563eb',transition:'width .12s linear'}} /></div>\n          <button type=\"button\" onClick={cancelPacking} style={{marginTop:10,width:'100%',padding:'7px 10px',border:0,borderRadius:6,cursor:'pointer',fontWeight:700}}>{lang === 'zh' ? '取消计算' : 'Cancel'}</button>\n        </div>\n      )}\n      `
          code = code.slice(0, returnAt + returnNeedle.length) + '\n      ' + overlay + code.slice(returnAt + returnNeedle.length)
        }
      }
      return { code, map: null }
    }
    if (id.endsWith('/src/packing/packer.ts')) {
      code = code.replace("if(stackLevel(p,items)>Math.max(1,Math.floor(c.maxStackLayers||1)))return false", "const maxLayers=c.stackable?Math.max(2,Math.floor(c.maxStackLayers||2)):1\n  if(stackLevel(p,items)>maxLayers)return false")
      const old = "for(const x of [q.x,q.x+qd.length-o.length])for(const y of [q.y,q.y+qd.width-o.width]){"
      const replacement = "for(const x of [q.x,q.x+(qd.length-o.length)/2,q.x+qd.length-o.length])for(const y of [q.y,q.y+(qd.width-o.width)/2,q.y+qd.width-o.width]){"
      code = code.replace(old, replacement)
      code = code.replace("const state=buildState(cargo,c,locked),n=state.us.length;if(n===0){", "const state=buildState(cargo,c,locked),n=state.us.length;const signal=(globalThis as any).__packingAbortSignal as AbortSignal|undefined;if(signal?.aborted)return state.items;if(n===0){")
      // Cooperative version of the homogeneous fast path: yield to the browser while filling each layer.
      const fastMarker = "function fastUniformPack(state:ReturnType<typeof buildState>,c:Container,step?:(i:number,n:number)=>void){"
      if (!code.includes('async function fastUniformPackAsync(')) {
        const fastStart = code.indexOf(fastMarker)
        if (fastStart !== -1) {
          const asyncFn = `async function fastUniformPackAsync(state:ReturnType<typeof buildState>,c:Container,step?:(i:number,n:number)=>void){\n  if(state.items.length!==0||state.us.length<40)return false\n  const group=state.us,base=group[0].cargo\n  if(!group.every(u=>sameCargo(u.cargo,base)))return false\n  const choices=orientations(base).map(o=>{const cols=Math.floor(c.length/o.length),rows=Math.floor(c.width/o.width);return {o,cols,rows,perLayer:cols*rows}}).sort((a,b)=>b.perLayer-a.perLayer),best=choices[0]\n  if(!best||best.perLayer<=0)return false\n  let maxLayers=Math.floor(c.height/best.o.height);const configured=Math.floor(base.maxStackLayers||0);if(!base.stackable)maxLayers=1;else if(configured>1)maxLayers=Math.min(maxLayers,configured);maxLayers=Math.max(1,maxLayers)\n  let done=0\n  for(let layer=0;layer<maxLayers&&done<group.length;layer++){\n    if(signal?.aborted)return true\n    const z=layer*best.o.height,xOffset=Math.max(0,(c.length-best.cols*best.o.length)/2),yOffset=Math.max(0,(c.width-best.rows*best.o.width)/2)\n    const slots:{x:number;y:number;d:number}[]=[]\n    for(let row=0;row<best.rows;row++)for(let col=0;col<best.cols;col++){const x=xOffset+col*best.o.length,y=yOffset+row*best.o.width;slots.push({x,y,d:Math.hypot(x+best.o.length/2-c.length/2,y+best.o.width/2-c.width/2)})}\n    slots.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x)\n    for(const slot of slots){if(done>=group.length)break;if(signal?.aborted)return true;const u=group[done],p=makePlaced(u,best.o,slot.x,slot.y,z);if(!inBounds(p,c)||overlapsAny(p,state.items))continue;if(z>0&&!canStack(p,base,state.items,state.defs))continue;state.items.push(p);done++;step?.(done,group.length);if((done&31)===0)await new Promise<void>(resolve=>setTimeout(resolve,0))}\n    await new Promise<void>(resolve=>setTimeout(resolve,0))\n  }\n  return done===group.length\n}\n`
          code = code.slice(0, fastStart) + asyncFn + code.slice(fastStart)
        }
      }
      code = code.replace("if(fastUniformPack(state,c,report)){progress?.(100);return state.items}", "if(await fastUniformPackAsync(state,c,report)){progress?.(100);return state.items}")
      code = code.replace("if(groups.size>1){", "if(groups.size>1){if(signal?.aborted)return state.items;")
      code = code.replace("const ok=fastUniformGroup(state,group,c,(i)=>report(done+i,total))", "if(signal?.aborted)return state.items;const ok=fastUniformGroup(state,group,c,(i)=>report(done+i,total))")
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