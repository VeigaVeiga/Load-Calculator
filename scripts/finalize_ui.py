from pathlib import Path
p=Path('src/App.tsx')
s=p.read_text()
s=s.replace("const [showDimensions, setShowDimensions] = useState(true)", "const [showDimensions, setShowDimensions] = useState(false)")
s=s.replace("  const cargoSignatureRef = useRef('')\n", "")
block="""  const cargoSignature = useMemo(() => cargo.map(c => `${c.id}:${c.quantity}:${c.length}:${c.width}:${c.height}:${c.weight}:${c.type}:${c.stackable}:${c.loadBearing}:${c.rotatable}:${c.maxStackLayers}:${c.maxLoadOnTop}`).join('|'), [cargo])\n  useEffect(() => {\n    if (!cargoSignatureRef.current) { cargoSignatureRef.current = cargoSignature; return }\n    if (cargoSignatureRef.current === cargoSignature) return\n    cargoSignatureRef.current = cargoSignature\n    const timer = window.setTimeout(() => { void runPacking(container) }, 550)\n    return () => window.clearTimeout(timer)\n  }, [cargoSignature])\n\n"""
if block not in s:
    raise SystemExit('automatic packing block not found')
s=s.replace(block, "")
s=s.replace("      maxStackLayers: 4,\n      maxLoadOnTop: 100,", "      maxStackLayers: 0,\n      maxLoadOnTop: 0,")
p.write_text(s)
