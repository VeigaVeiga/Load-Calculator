from pathlib import Path
import re

p = Path('src/App.tsx')
s = p.read_text()
s = s.replace('const [showDimensions, setShowDimensions] = useState(true)', 'const [showDimensions, setShowDimensions] = useState(false)')
s = s.replace("  const cargoSignatureRef = useRef('')\n", '')
s, n = re.subn(r"  const cargoSignature = useMemo\(\(\) => cargo\.map\(c => `.*?\n  \}, \[cargoSignature\]\)\n", '', s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('automatic packing effect not found')
s = s.replace('      maxStackLayers: 4,\n      maxLoadOnTop: 100,', '      maxStackLayers: 0,\n      maxLoadOnTop: 0,')
old = re.compile(r"  const exportThree=async\(\)=>\{.*?\n  \}\n\n  const setCellText", re.S)
new = '''  const exportThree=async()=>{\n    const W=1800,H=1100,margin=60,titleH=44,gap=36,viewW=W-2*margin\n    const topH=Math.max(300,Math.round(viewW*container.width/container.length))\n    const sideH=Math.max(300,Math.round(viewW*container.height/container.length))\n    const top=await svgToPng(makeTopViewSvg(viewW,topH),viewW,topH)\n    const sf=await svgToPng(makeSideFrontSvg(viewW,sideH),viewW,sideH)\n    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H)\n    const drawFit=async(bytes:Uint8Array,x:number,y:number,maxW:number,maxH:number)=>{const bmp=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const r=Math.min(maxW/bmp.width,maxH/bmp.height);const w=bmp.width*r,h=bmp.height*r;ctx.drawImage(bmp,x+(maxW-w)/2,y+(maxH-h)/2,w,h);bmp.close()}\n    await drawFit(top,margin,margin+titleH,viewW,H/2-margin-titleH-gap/2)\n    await drawFit(sf,margin,H/2+gap/2,viewW,H/2-margin-gap/2)\n    const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('PNG export failed');const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`${container.name}-three-views.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)\n  }\n\n  const setCellText'''
s, n = old.subn(new, s, count=1)
if n != 1:
    raise SystemExit('export function not found')
p.write_text(s)
