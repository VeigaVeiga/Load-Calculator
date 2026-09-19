import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import ContainerScene, { type View } from './components/ContainerScene'
import CargoProperties from './components/CargoProperties'
import CenterOfGravity from './components/CenterOfGravity'
import { containerTemplates } from './data/containerTemplates'
import { cargoTemplates } from './data/cargoTemplates'
import type {
  Cargo,
  CargoType,
  Container,
  PlacedCargo,
  SecuringItem,
  SecuringMaterialType,
} from './types'
import { autoPack, autoPackAsync } from './packing/packer'
import { validatePlacement } from './packing/geometry'
import { analyzeWeight } from './analysis/weight'
import { cbm, mm } from './utils'
import { createDocxWithPlanImages, extractZipEntry } from './utils/docxTemplate'

type Lang = 'zh' | 'en'

const MAX_CARGO_VOLUME_CBM = 120

const T = {
  zh: {
    title: '集装箱装载规划器',
    cargo: '货物列表',
    add: '添加货物',
    carton: '纸箱',
    pallet: '托盘',
    crate: '木箱',
    auto: '自动装柜',
    clear: '清除未锁定',
    properties: '货物属性',
    weight: '重量分析',
    secure: '加固方案',
    view: '视图',
    iso: '等轴',
    top: '顶视图',
    front: '柜头视图',
    rear: '柜门视图',
    left: '左视图',
    right: '右视图',
    reset: '重置视图',
    lang: '语言',
    custom: '自定义集装箱',
    import: '',
    export: '导出三视图',
    exportPlan: '导出装箱方案',
    autoQuality: '自动',
    lowQuality: '性能',
    standardQuality: '标准',
    ultraQuality: '极致',
    securingMode: '加固模式',
    exitSecuringMode: '退出加固',
    materials: '加固材料',
    triangle: '三角木',
    belt: '紧固带',
    airbag: '充气袋',
    net: '柜门网',
    materialCount: '材料统计',
    empty: '选择货物后显示货物数据',
    payload: '最大载重',
    door: '柜门',
    internal: '内部尺寸',
    external: '外部尺寸',
    items: '货物项',
    quantity: '数量',
    unitWeight: '单件重量',
    length: '长度',
    width: '宽度',
    height: '高度',
    stack: '可堆叠',
    loadBearing: '可承重',
    rotate: '允许旋转',
    color: '颜色',
    showName: '3D 显示货物名称',
    type: '类型',
    position: '位置',
    lock: '锁定位置',
    rotate90: '旋转 90°',
    snap: '吸附 100 mm',
    delete: '删除',
    units: '件',
    placed: '已放置',
    grid: '网格 100 mm · 吸附 10 mm',
    dragHint: '默认自由视角；开启“自由摆放”后可拖动货物',
    axis: 'X 长度 → · Y 宽度 → · Z 高度 ↑',
    none: '无',
    frontWeight: '柜头侧',
    doorWeight: '柜门侧',
    leftWeight: '左侧',
    rightWeight: '右侧',
    fourCorners: '四角重量',
    balance: '平衡度',
    customApply: '应用',
    volumeLimit: `输入数据后总体积不得超过 ${MAX_CARGO_VOLUME_CBM} CBM`,
    invalidPlacement: '超出集装箱内部尺寸',
    collision: '与其他货物发生碰撞',
    support: '支撑面积不足',
    floating: '货物处于悬空位置，请检查支撑',
    freePlacement: '自由摆放',
    singleSelect: '单选',
    boxSelect: '框选',
    stopPlacement: '结束摆放',
    securingHint: '从 3D 左侧工具栏选择加固材料。',
    planningAid: '仅作为装载规划辅助，不代表加固认证。',
    cargoType: '货物类型',
    name: '名称',
    volume: '总体积',
    total: '总计',
  },

  en: {
    title: 'Container Loading Planner',
    cargo: 'Cargo List',
    add: 'Add Cargo',
    carton: 'Carton',
    pallet: 'Pallet',
    crate: 'Wood Crate',
    auto: 'Auto Pack',
    opt: 'Optimize Load',
    clear: 'Clear Unlocked',
    properties: 'Cargo',
    weight: 'Weight Analysis',
    secure: 'Securing',
    view: 'View',
    iso: 'ISO',
    top: 'TOP VIEW',
    front: 'FRONT VIEW',
    rear: 'DOOR VIEW',
    left: 'LEFT VIEW',
    right: 'RIGHT VIEW',
    reset: 'RESET VIEW',
    lang: 'Language',
    custom: 'Custom Container',
    import: '',
    export: 'Export 3 Views',
    exportPlan: 'Export Loading Plan',
    autoQuality: 'Auto',
    lowQuality: 'Performance',
    standardQuality: 'Standard',
    ultraQuality: 'Ultra',
    securingMode: 'Securing Mode',
    exitSecuringMode: 'Exit Securing',
    materials: 'Securing Materials',
    triangle: 'Triangle Wood',
    belt: 'Lashing Belt',
    airbag: 'Air Bag',
    net: 'Door Net',
    materialCount: 'Material Summary',
    empty: 'Select a cargo to show cargo data',
    payload: 'Payload',
    door: 'Door',
    internal: 'Internal Dimensions',
    external: 'External Dimensions',
    items: 'cargo items',
    quantity: 'Qty',
    unitWeight: 'Unit Weight',
    length: 'Length',
    width: 'Width',
    height: 'Height',
    stack: 'Stackable',
    loadBearing: 'Load-bearing',
    rotate: 'Rotatable',
    color: 'Color',
    showName: 'Show cargo name in 3D',
    type: 'Type',
    position: 'Position',
    lock: 'Lock position',
    rotate90: 'Rotate 90°',
    snap: 'Snap 100 mm',
    delete: 'Delete',
    units: 'units',
    placed: 'placed',
    grid: 'Grid 100 mm · Snap 10 mm',
    dragHint: 'Free camera by default; enable Free Placement to drag cargo',
    axis: 'X Length → · Y Width → · Z Height ↑',
    none: 'None',
    frontWeight: 'Front side',
    doorWeight: 'Door side',
    leftWeight: 'Left side',
    rightWeight: 'Right side',
    fourCorners: 'Four Corners',
    balance: 'Balance',
    customApply: 'Apply',
    volumeLimit: `Total volume must not exceed ${MAX_CARGO_VOLUME_CBM} CBM after input`,
    invalidPlacement: 'Outside container internal dimensions',
    collision: 'Collision with another cargo',
    support: 'Insufficient support area',
    floating: 'Cargo is floating; check support',
    freePlacement: 'Free Placement',
    singleSelect: 'Single Select',
    boxSelect: 'Box Select',
    stopPlacement: 'Stop Placement',
    securingHint: 'Choose securing materials from the 3D toolbar.',
    planningAid: 'Planning aid only; not a securing certification.',
    cargoType: 'Cargo Type',
    name: 'Name',
    volume: 'Total Volume',
    total: 'Total',
  },
}

const materialNames: Record<
  SecuringMaterialType,
  { zh: string; en: string }
> = {
  triangleWood: {
    zh: '三角木',
    en: 'Triangle Wood',
  },
  lashingBelt: {
    zh: '紧固带',
    en: 'Lashing Belt',
  },
  airBag: {
    zh: '充气袋',
    en: 'Air Bag',
  },
  doorNet: {
    zh: '柜门网',
    en: 'Door Net',
  },
}

function makeCustom(
  base: Container,
  length: number,
  width: number,
  height: number,
): Container {
  return {
    ...base,
    id: 'CUSTOM',
    name: 'CUSTOM',
    length,
    width,
    height,
    outerLength: length + 160,
    outerWidth: width + 86,
    outerHeight: height + 198,
    doorWidth: Math.max(500, width - 12),
    doorHeight: Math.max(500, height - 100),
  }
}

function App() {
  const [lang, setLang] = useState<Lang>('zh')
  const tr = T[lang]

  const [containerId, setContainerId] = useState('40HQ')

  const [custom, setCustom] = useState({
    length: 12032,
    width: 2352,
    height: 2698,
  })

  const base = containerTemplates.find((c) => c.id === '40HQ')!

  const container =
    containerId === 'CUSTOM'
      ? makeCustom(
          base,
          custom.length,
          custom.width,
          custom.height,
        )
      : containerTemplates.find((c) => c.id === containerId)!

  const [cargo, setCargo] = useState<Cargo[]>(
    cargoTemplates.map((x) => ({
      ...x,
      locked: false,
      showName: false,
    })),
  )

  const [placed, setPlaced] = useState<PlacedCargo[]>(() =>
    autoPack(cargoTemplates, base),
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState<'single'|'box'>('single')

  const [tab, setTab] = useState<'cargo' | 'analysis' | 'secure'>('cargo')

  const [view, setView] = useState<View>('iso')

  const [dragging, setDragging] = useState(false)

  const [freePlacement, setFreePlacement] = useState(false)

  const [message, setMessage] = useState('')

  const [securingMode, setSecuringMode] = useState(false)
  const [showDimensions, setShowDimensions] = useState(true)
  const [airBagStretch] = useState(false)
  const cargoSignatureRef = useRef('')
  const [packingProgress, setPackingProgress] = useState<number | null>(null)


  const [materials, setMaterials] = useState<SecuringItem[]>([])

  useEffect(() => {
    if (!message) return

    const timer = window.setTimeout(() => {
      setMessage('')
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [message])

  const cargoSignature = useMemo(() => cargo.map(c => `${c.id}:${c.quantity}:${c.length}:${c.width}:${c.height}:${c.weight}:${c.type}:${c.stackable}:${c.loadBearing}:${c.rotatable}:${c.maxStackLayers}:${c.maxLoadOnTop}`).join('|'), [cargo])
  useEffect(() => {
    if (!cargoSignatureRef.current) { cargoSignatureRef.current = cargoSignature; return }
    if (cargoSignatureRef.current === cargoSignature) return
    cargoSignatureRef.current = cargoSignature
    const timer = window.setTimeout(() => { void runPacking(container) }, 550)
    return () => window.clearTimeout(timer)
  }, [cargoSignature])

  const totals = useMemo(
    () => ({
      q: cargo.reduce((s, c) => s + c.quantity, 0),
      v: cargo.reduce(
        (s, c) =>
          s + cbm(c.length, c.width, c.height, c.quantity),
        0,
      ),
      w: cargo.reduce(
        (s, c) => s + c.weight * c.quantity,
        0,
      ),
    }),
    [cargo],
  )

  const analysis = useMemo(
    () => analyzeWeight(placed, container),
    [placed, container],
  )

  const placedByCargo = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of placed) map[p.cargoId] = (map[p.cargoId] || 0) + 1
    return map
  }, [placed])

  const overflowCount = useMemo(() =>
    cargo.reduce((sum, c) => sum + Math.max(0, Math.floor(c.quantity) - (placedByCargo[c.id] || 0)), 0),
    [cargo, placedByCargo],
  )

  const overflowItems = useMemo<PlacedCargo[]>(() => {
    const result: PlacedCargo[] = []
    const gap = 180
    const zoneXMax = Math.max(1000, container.length - 500)
    let cursorX = 250
    let cursorY = -3000
    let rowDepth = 0
    for (const c of cargo) {
      const missing = Math.max(0, Math.floor(c.quantity) - (placedByCargo[c.id] || 0))
      for (let i = 0; i < missing && result.length < 48; i += 1) {
        const rotation = c.rotatable && (result.length % 2 === 1) ? 90 : 0
        const L = rotation % 180 === 0 ? c.length : c.width
        const W = rotation % 180 === 0 ? c.width : c.length
        if (cursorX + L > zoneXMax && cursorX > 250) {
          cursorX = 250
          cursorY -= rowDepth + gap
          rowDepth = 0
        }
        result.push({
          id: `overflow-${c.id}-${i + 1}`,
          cargoId: c.id,
          cargoType: c.type,
          x: cursorX,
          y: cursorY,
          z: 0,
          length: c.length,
          width: c.width,
          height: c.height,
          rotation,
          weight: c.weight,
          color: c.color,
          placementMode: 'manual',
          locked: false,
        })
        cursorX += L + gap
        rowDepth = Math.max(rowDepth, W)
      }
    }
    return result
  }, [cargo, placedByCargo, container.length])

  const selected = placed.find((p) => p.id === selectedId)

  const selectedCargo = cargo.find(
    (c) => c.id === selected?.cargoId,
  )

  const selectOne = (id: string | null) => {
    setSelectedId(id)
    setSelectedIds(id ? [id] : [])
  }

  const selectMany = (ids: string[]) => {
    setSelectedIds(ids)
    setSelectedId(ids[0] ?? null)
  }

  const setP = (
    id: string,
    patch: Partial<PlacedCargo>,
  ) => {
    setPlaced((items) => {
      const current = items.find((p) => p.id === id)

      if (!current) {
        return items
      }

      if (
        current.locked &&
        patch.locked === undefined
      ) {
        return items
      }

      const next: PlacedCargo = {
        ...current,
        ...patch,
        placementMode: 'manual',
      }

      const validation = validatePlacement(
        next,
        container,
        items,
      )

      if (!validation.ok) {
        const translated = validation.errors.map(
          (error) => {
            if (lang === 'zh') {
              return error
            }

            if (error === '超出集装箱内部尺寸') {
              return 'Outside container internal dimensions'
            }

            if (error === '与其他货物发生碰撞') {
              return 'Collision with another cargo'
            }

            return error
          },
        )

        setMessage(translated.join(' · '))

        return items
      }

      setMessage('')

      return items.map((p) =>
        p.id === id ? next : p,
      )
    })
  }

  const move = (
    id: string,
    x: number,
    y: number,
    z: number,
  ) => {
    setP(id, {
      x,
      y,
      z,
    })
  }

  const rotateCargo = (id: string, rotation: number) => {
    setP(id, { rotation: ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 })
  }

  const add = () => {
    const n = cargo.length + 1

    const newCargo: Cargo = {
      id: `NEW-${n}`,
      name: `NEW-${n}`,
      type: 'carton',
      quantity: 1,
      length: 600,
      width: 400,
      height: 400,
      weight: 10,
      color: '#b88b5a',
      showName: false,
      locked: false,
      stackable: true,
      loadBearing: true,
      rotatable: true,
      maxStackLayers: 4,
      maxLoadOnTop: 100,
      breakablePallet: false,
    }

    setCargo((items) => [...items, newCargo])
  }

  const update = (
    id: string,
    key: keyof Cargo,
    value: unknown,
  ) => {
    setCargo((items) =>
      items.map((c) =>
        c.id === id
          ? {
              ...c,
              [key]: value,
            }
          : c,
      ),
    )

    if (key === 'color') {
      setPlaced((items) =>
        items.map((p) =>
          p.cargoId === id
            ? {
                ...p,
                color: String(value),
              }
            : p,
        ),
      )
    }

    if (key === 'type') {
      setPlaced((items) =>
        items.map((p) =>
          p.cargoId === id
            ? {
                ...p,
                cargoType: value as CargoType,
              }
            : p,
        ),
      )
    }

    if (key === 'locked') {
      setPlaced((items) =>
        items.map((p) =>
          p.cargoId === id
            ? {
                ...p,
                locked: Boolean(value),
              }
            : p,
        ),
      )
    }
  }

  const updateNumber = (
    id: string,
    key: 'quantity'|'length'|'width'|'height'|'weight',
    raw: number,
  ) => {
    const value = Math.max(key === 'quantity' || key === 'length' || key === 'width' || key === 'height' ? 1 : 0, Number.isFinite(raw) ? raw : 0)
    setCargo(items => items.map(c => c.id === id ? { ...c, [key]: value } : c))
  }

  const limitsFor=(c:Cargo)=>({maxQuantity:c.type==='pallet'?50:600,maxVolume:MAX_CARGO_VOLUME_CBM})
  const inputInvalid=(c:Cargo,key:'quantity'|'length'|'width'|'height')=>{
    const lim=limitsFor(c); const vol=cbm(c.length,c.width,c.height,c.quantity)
    return key==='quantity' ? c.quantity>lim.maxQuantity || vol>lim.maxVolume : vol>lim.maxVolume
  }

  const remove = (id: string) => {
    setCargo((items) =>
      items.filter((c) => c.id !== id),
    )

    setPlaced((items) =>
      items.filter((p) => p.cargoId !== id),
    )

    setSelectedId(null)
    setSelectedIds([])
    setMessage('')
  }

  const changeType = (
    id: string,
    type: CargoType,
  ) => {
    update(id, 'type', type)
  }

  const runPacking = async (nextContainer = container) => {
    if (packingProgress !== null) return
    const locked = placed.filter((p) => p.locked)
    setPackingProgress(0)
    setMessage('')
    let lastProgress = -1
    try {
      const result = await autoPackAsync(cargo, nextContainer, locked, (percent) => {
        const safePercent = Math.min(100, Math.max(0, Math.round(percent)))
        if (safePercent !== lastProgress) {
          lastProgress = safePercent
          setPackingProgress(safePercent)
        }
      })
      setPlaced(result)
      setSelectedId(null)
      setSelectedIds([])
      setMessage(lang === 'zh' ? '自动装柜完成' : 'Auto packing complete')
    } finally {
      setPackingProgress(null)
    }
  }


  const addMaterial = (
    type: SecuringMaterialType,
  ) => {
    const n = materials.length + 1

    const material: SecuringItem = {
      id: `${type}-${n}`,
      type,
      x: Math.max(0, Math.round(container.length / 2 - 500)),
      y: Math.max(0, Math.round(container.width / 2 - 500)),
      z: 0,
      length:
        type === 'triangleWood'
          ? 200
          : type === 'lashingBelt'
            ? 3000
            : type === 'doorNet'
              ? 40
              : 1000,
      width:
        type === 'triangleWood'
          ? 150
          : type === 'lashingBelt'
            ? 4
            : type === 'doorNet'
              ? container.width
              : 1000,
      height:
        type === 'triangleWood'
          ? 150
          : type === 'lashingBelt'
            ? 4
            : type === 'doorNet'
              ? container.height
              : 1800,
      rotation: 0,
    }

    setMaterials((items) => [
      ...items,
      material,
    ])
  }

  const moveMaterial = (
    id: string,
    x: number,
    y: number,
  ) => {
    setMaterials((items) =>
      items.map((m) =>
        m.id === id
          ? {
              ...m,
              x,
              y,
            }
          : m,
      ),
    )
  }

  const deleteMaterial = (id:string) => {
    setMaterials(items => items.filter(m => m.id !== id))
    setSelectedId(null)
    setSelectedIds([])
  }

  const scaleMaterial = (id:string, factor:number) => {
    const f=Math.max(.25,Math.min(4,factor))
    setMaterials(items=>items.map(m=>m.id===id?{...m,length:Math.round(m.length*f/10)*10,width:Math.round(m.width*f/10)*10,height:Math.round(m.height*f/10)*10}:m))
  }

  const materialCounts = useMemo(
    () =>
      materials.reduce(
        (result, material) => ({
          ...result,
          [material.type]:
            (result[material.type] || 0) + 1,
        }),
        {} as Record<string, number>,
      ),
    [materials],
  )

  const makeTopViewSvg=(W:number,H:number)=>{
    const ratio=container.length/container.width
    const boxH=Math.min(H-70,(W-80)/ratio),boxW=boxH*ratio,bx=(W-boxW)/2,by=50
    const rect=(x:number,y:number,w:number,h:number,c:string)=>`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${c}" fill-opacity=".82" stroke="#243b4b" stroke-width="1.2"/>`
    let shapes=''
    for(const p of placed){const d=p.rotation%180===0?{l:p.length,w:p.width}:{l:p.width,w:p.length};shapes+=rect(bx+p.x/container.length*boxW,by+p.y/container.width*boxH,d.l/container.length*boxW,d.w/container.width*boxH,p.color)}
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><text x="${W/2}" y="25" text-anchor="middle" font-size="17" font-weight="700" fill="#17354d">${container.name} · ${lang==='zh'?'俯视示意图':'TOP VIEW'}</text><rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="#eef4f7" stroke="#17354d" stroke-width="2"/>${shapes}</svg>`
  }

  const makeSideFrontSvg=(W:number,H:number)=>{
    const fit=(x:number,y:number,maxW:number,maxH:number,ratio:number)=>{const w=Math.min(maxW,maxH*ratio),h=w/ratio;return{x:x+(maxW-w)/2,y:y+(maxH-h)/2,w,h}}
    const gap=34,side=fit(25,48,W*.63-gap/2,H-80,container.length/container.height),front=fit(W*.63+gap/2,48,W*.37-25-gap/2,H-80,container.width/container.height)
    const rect=(x:number,y:number,w:number,h:number,c:string)=>`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${c}" fill-opacity=".82" stroke="#243b4b" stroke-width="1.1"/>`
    let left='',frontShapes=''
    for(const p of placed){const d=p.rotation%180===0?{l:p.length,w:p.width}:{l:p.width,w:p.length};left+=rect(side.x+p.x/container.length*side.w,side.y+(1-(p.z+p.height)/container.height)*side.h,d.l/container.length*side.w,p.height/container.height*side.h,p.color);frontShapes+=rect(front.x+p.y/container.width*front.w,front.y+(1-(p.z+p.height)/container.height)*front.h,d.w/container.width*front.w,p.height/container.height*front.h,p.color)}
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><text x="${side.x+side.w/2}" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#17354d">${lang==='zh'?'侧视示意图':'SIDE VIEW'}</text><text x="${front.x+front.w/2}" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#17354d">${lang==='zh'?'正视示意图':'FRONT VIEW'}</text><rect x="${side.x}" y="${side.y}" width="${side.w}" height="${side.h}" fill="#eef4f7" stroke="#17354d" stroke-width="2"/>${left}<rect x="${front.x}" y="${front.y}" width="${front.w}" height="${front.h}" fill="#eef4f7" stroke="#17354d" stroke-width="2"/>${frontShapes}</svg>`
  }

  const svgToPng=async(svg:string,W:number,H:number)=>{
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}))
    try{const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');ctx.drawImage(img,0,0,W,H);const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('PNG export failed');return new Uint8Array(await blob.arrayBuffer())}finally{URL.revokeObjectURL(url)}
  }

  const exportThree=async()=>{
    const top=await svgToPng(makeTopViewSvg(1000,420),1000,420),sf=await svgToPng(makeSideFrontSvg(1000,430),1000,430)
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=950;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,950)
    const a1=await createImageBitmap(new Blob([top],{type:'image/png'})),a2=await createImageBitmap(new Blob([sf],{type:'image/png'}));ctx.drawImage(a1,40,30,1520,420);ctx.drawImage(a2,40,480,1520,440);a1.close();a2.close()
    const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('PNG export failed');const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`${container.name}-three-views.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
  }

  const setCellText=(cell:Element,text:string)=>{
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';const texts=Array.from(cell.getElementsByTagNameNS(ns,'t'));if(texts.length){texts[0].textContent=text;for(let i=1;i<texts.length;i++)texts[i].textContent=''}
  }

  const exportPlan=async()=>{
    try{
      const response=await fetch('/装箱方案模板.docx');if(!response.ok)throw new Error('Template not found');const template=await response.arrayBuffer();const templateBytes=new Uint8Array(template);const xmlBytes=await extractZipEntry(templateBytes,'word/document.xml');const xmlText=new TextDecoder().decode(xmlBytes)
      const parser=new DOMParser();const doc=parser.parseFromString(xmlText,'application/xml');const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';const tables=Array.from(doc.getElementsByTagNameNS(w,'tbl'));const cargoTable=tables[0],infoTable=tables[1];if(!cargoTable||!infoTable)throw new Error('Template tables not found')
      const rows=Array.from(cargoTable.getElementsByTagNameNS(w,'tr'));const containerCells=Array.from(rows[0].getElementsByTagNameNS(w,'tc'));if(containerCells[1])setCellText(containerCells[1],`${container.name}（${container.length.toLocaleString()}×${container.width.toLocaleString()}×${container.height.toLocaleString()} mm）`);if(containerCells[3])setCellText(containerCells[3],lang==='zh'?'均匀、紧凑、对称布满箱底':'Uniform, compact and symmetrical loading')
      const loadedById=new Map<string,PlacedCargo[]>();for(const p of placed){const a=loadedById.get(p.cargoId)||[];a.push(p);loadedById.set(p.cargoId,a)};const loaded=cargo.filter(c=>(loadedById.get(c.id)?.length||0)>0);const totalWeight=placed.reduce((sum,p)=>sum+p.weight,0);const cargoLines=loaded.map(c=>`${c.name} × ${(loadedById.get(c.id)||[]).length}`).join('；');const dimsLines=loaded.map(c=>{const p=(loadedById.get(c.id)||[])[0];const d=p.rotation%180===0?{l:p.length,w:p.width}:{l:p.width,w:p.length};return `${d.l}×${d.w}×${p.height}`}).join('；');const typeLines=loaded.map(c=>c.type==='pallet'?tr.pallet:c.type==='woodCrate'?tr.crate:tr.carton).join('；');const first=Array.from(rows[2]?.getElementsByTagNameNS(w,'tc')||[]);for(const r0 of rows.slice(3)){for(const cell of Array.from(r0.getElementsByTagNameNS(w,'tc')))setCellText(cell,'')};if(first.length>=7){setCellText(first[1],cargoLines||'-');setCellText(first[2],String(placed.length));setCellText(first[3],loaded.length===1?(loaded[0].weight||0).toFixed(1):'-');setCellText(first[4],totalWeight.toFixed(1));setCellText(first[5],dimsLines||'-');setCellText(first[6],typeLines||'-')}
      const infoRows=Array.from(infoTable.getElementsByTagNameNS(w,'tr'));if(infoRows[2]){const c=Array.from(infoRows[2].getElementsByTagNameNS(w,'tc'));if(c[1])setCellText(c[1],lang==='zh'?`根据当前3D视图内货物的实际位置、尺寸、旋转及堆叠状态生成装箱方案，共装载 ${placed.length} 件货物。`:`The loading plan is generated from the current 3D cargo arrangement; ${placed.length} units are loaded.`)}if(infoRows[3]){const c=Array.from(infoRows[3].getElementsByTagNameNS(w,'tc'));if(c[1])setCellText(c[1],lang==='zh'?`1、箱内货物紧密码靠，装载均匀、稳定、对称、配载合理。\n2、货物装箱后不影响箱门关闭。`:`1. Cargo is compact and stable.\n2. Cargo must not obstruct the doors.`)}if(infoRows[4]){const c=Array.from(infoRows[4].getElementsByTagNameNS(w,'tc'));if(c[1])setCellText(c[1],lang==='zh'?'按当前装载结果配置三角木、紧固带、气袋及其他需要的加固材料，防止运输过程中位移。':'Place securing materials at gaps and required positions to prevent movement.')}if(infoRows[5]){const c=Array.from(infoRows[5].getElementsByTagNameNS(w,'tc'));const materialText=Object.entries(materialCounts).map(([k,v])=>`${materialNames[k as SecuringMaterialType][lang]} × ${v}`).join('、')|| (lang==='zh'?'暂无加固材料':'No securing materials');if(c[1])setCellText(c[1],materialText)}
      const updatedXml=new XMLSerializer().serializeToString(doc);const top=await svgToPng(makeTopViewSvg(1000,420),1000,420);const sf=await svgToPng(makeSideFrontSvg(1000,430),1000,430);const output=await createDocxWithPlanImages(template,updatedXml,top,sf);const blob=new Blob([output],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`${container.name}-装箱方案.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);setMessage(lang==='zh'?'已按 Word 模板导出装箱方案':'Loading plan exported from Word template')
    }catch(error){console.error(error);setMessage(lang==='zh'?'装箱方案模板导出失败，请检查模板文件':'Loading plan template export failed')}
  }

  return (
    <div className={`app theme-portal ${securingMode ? 'securing-mode' : ''}`}>
      <header className="topbar">
        <div className="hero-title">
          <div className="hero-orbit" aria-hidden="true" />
          <div className="hero-rule" aria-hidden="true" />
          <h1>{tr.title} <span className="beta-badge">Beta</span></h1>
        </div>

        <div className="top-actions">
          <label>
            {tr.lang}

            <select
              value={lang}
              onChange={(e) =>
                setLang(
                  e.target.value as Lang,
                )
              }
            >
              <option value="zh">
                中文
              </option>

              <option value="en">
                English
              </option>
            </select>
          </label>

          <label>
            {lang === 'zh'
              ? '集装箱'
              : 'Container'}

            <select
              value={containerId}
              onChange={(e) => {
                const id =
                  e.target.value

                setContainerId(id)

                const nextContainer =
                  id === 'CUSTOM'
                    ? makeCustom(
                        base,
                        custom.length,
                        custom.width,
                        custom.height,
                      )
                    : containerTemplates.find(
                        (x) => x.id === id,
                      )!

                void runPacking(nextContainer)
              }}
            >
              {containerTemplates.map(
                (c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.name}
                  </option>
                ),
              )}

              <option value="CUSTOM">
                {tr.custom}
              </option>
            </select>
          </label>

          <button onClick={exportPlan}>{tr.exportPlan}</button>
          <button onClick={exportThree}>{tr.export}</button>
        </div>
      </header>

      {containerId === 'CUSTOM' && (
        <div className="custom-bar">
          <b>{tr.custom}</b>

          <label>
            L
            <input
              type="number"
              value={custom.length}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  length: Math.max(
                    1,
                    Number(
                      e.target.value,
                    ),
                  ),
                })
              }
            />
            mm
          </label>

          <label>
            W
            <input
              type="number"
              value={custom.width}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  width: Math.max(
                    1,
                    Number(
                      e.target.value,
                    ),
                  ),
                })
              }
            />
            mm
          </label>

          <label>
            H
            <input
              type="number"
              value={custom.height}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  height: Math.max(
                    1,
                    Number(
                      e.target.value,
                    ),
                  ),
                })
              }
            />
            mm
          </label>

          <button
            onClick={() => void runPacking(container)}
          >
            {tr.customApply}
          </button>
        </div>
      )}

      <section className="summary">
        <div>
          <span>{tr.internal}</span>
          <strong>
            {mm(container.length)} ×{' '}
            {mm(container.width)} ×{' '}
            {mm(container.height)}
          </strong>
        </div>

        <div>
          <span>{tr.external}</span>
          <strong>
            {mm(container.outerLength)} ×{' '}
            {mm(container.outerWidth)} ×{' '}
            {mm(container.outerHeight)}
          </strong>
        </div>

        <div>
          <span>{tr.door}</span>
          <strong>
            {mm(container.doorWidth)} ×{' '}
            {mm(container.doorHeight)}
          </strong>
        </div>

        <div>
          <span>{tr.payload}</span>

          <strong>
            {container.maxPayload.toLocaleString()}{' '}
            kg
          </strong>

          <small>
            {totals.q} {tr.units} ·{' '}
            {totals.v.toFixed(2)} m³ ·{' '}
            {totals.w.toFixed(1)} kg
          </small>
        </div>
      </section>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div>
              <h2>{tr.cargo}</h2>

              <span>
                {cargo.length} {tr.items}
              </span>
            </div>

            <button onClick={add}>
              + {tr.add}
            </button>
          </div>

          <div className="tool-row">
            <button onClick={() => void runPacking(container)}>
              {tr.auto}
            </button>

            <button
              onClick={() =>
                setPlaced((items) =>
                  items.filter(
                    (p) => p.locked,
                  ),
                )
              }
            >
              {tr.clear}
            </button>
          </div>

          <div className="cargo-list">
            {cargo.map((c) => {
              const volume = cbm(
                c.length,
                c.width,
                c.height,
                c.quantity,
              )

              return (
                <div
                  key={c.id}
                  className={`cargo-card ${
                    selectedCargo?.id === c.id
                      ? 'active'
                      : ''
                  }`}
                >
                  <div className="cargo-title">
                    <span
                      className="dot"
                      style={{
                        background:
                          c.color,
                      }}
                    />

                    <label className="name-field">
                      <span>
                        {tr.name}
                      </span>

                      <input
                        aria-label={tr.name}
                        value={c.name}
                        onChange={(e) =>
                          update(
                            c.id,
                            'name',
                            e.target.value,
                          )
                        }
                      />
                    </label>

                    <input
                      className="color-picker"
                      type="color"
                      value={c.color}
                      title={tr.color}
                      onChange={(e) =>
                        update(
                          c.id,
                          'color',
                          e.target.value,
                        )
                      }
                    />

                    <button
                      className="delete"
                      onClick={() =>
                        remove(c.id)
                      }
                    >
                      ×
                    </button>
                  </div>

                  <div className="type-toggle">
                    <span>{tr.type}</span>

                    <label
                      className={
                        c.type ===
                        'carton'
                          ? 'selected'
                          : ''
                      }
                    >
                      <input
                        type="radio"
                        name={`type-${c.id}`}
                        checked={
                          c.type ===
                          'carton'
                        }
                        onChange={() =>
                          changeType(
                            c.id,
                            'carton',
                          )
                        }
                      />

                      {tr.carton}
                    </label>

                    <label
                      className={
                        c.type ===
                        'pallet'
                          ? 'selected'
                          : ''
                      }
                    >
                      <input
                        type="radio"
                        name={`type-${c.id}`}
                        checked={
                          c.type ===
                          'pallet'
                        }
                        onChange={() =>
                          changeType(
                            c.id,
                            'pallet',
                          )
                        }
                      />

                      {tr.pallet}
                    </label>

                    <label
                      className={
                        c.type ===
                        'woodCrate'
                          ? 'selected'
                          : ''
                      }
                    >
                      <input
                        type="radio"
                        name={`type-${c.id}`}
                        checked={
                          c.type ===
                          'woodCrate'
                        }
                        onChange={() =>
                          changeType(
                            c.id,
                            'woodCrate',
                          )
                        }
                      />

                      {tr.crate}
                    </label>
                  </div>

                  <div className="fields">
                    <label>
                      {tr.quantity}

                      <input
                        className={inputInvalid(c,'quantity')?'input-limit-error':''}
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) =>
                          updateNumber(
                            c.id,
                            'quantity',
                            Number(
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>

                    <label>
                      {tr.unitWeight}

                      <input
                        type="number"
                        min="0"
                        value={c.weight}
                        onChange={(e) =>
                          updateNumber(
                            c.id,
                            'weight',
                            Number(
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="fields">
                    <label>
                      {tr.length}

                      <input
                        className={inputInvalid(c,'length')?'input-limit-error':''}
                        type="number"
                        min="1"
                        value={c.length}
                        onChange={(e) =>
                          updateNumber(
                            c.id,
                            'length',
                            Number(
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>

                    <label>
                      {tr.width}

                      <input
                        className={inputInvalid(c,'width')?'input-limit-error':''}
                        type="number"
                        min="1"
                        value={c.width}
                        onChange={(e) =>
                          updateNumber(
                            c.id,
                            'width',
                            Number(
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>

                    <label>
                      {tr.height}

                      <input
                        className={inputInvalid(c,'height')?'input-limit-error':''}
                        type="number"
                        min="1"
                        value={c.height}
                        onChange={(e) =>
                          updateNumber(
                            c.id,
                            'height',
                            Number(
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          c.stackable
                        }
                        onChange={(e) =>
                          update(
                            c.id,
                            'stackable',
                            e.target.checked,
                          )
                        }
                      />

                      {tr.stack}
                    </label>

                    <label>
                      <input type="checkbox" checked={c.loadBearing} onChange={e=>update(c.id,'loadBearing',e.target.checked)} />
                      {tr.loadBearing}
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={
                          c.rotatable
                        }
                        onChange={(e) =>
                          update(
                            c.id,
                            'rotatable',
                            e.target.checked,
                          )
                        }
                      />

                      {tr.rotate}
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={
                          c.showName
                        }
                        onChange={(e) =>
                          update(
                            c.id,
                            'showName',
                            e.target.checked,
                          )
                        }
                      />

                      {tr.showName}
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={
                          !!c.locked
                        }
                        onChange={(e) =>
                          update(
                            c.id,
                            'locked',
                            e.target.checked,
                          )
                        }
                      />

                      {tr.lock}
                    </label>
                  </div>

                  <div
                    className={`cargo-volume ${
                      volume >
                      MAX_CARGO_VOLUME_CBM
                        ? 'over'
                        : ''
                    }`}
                  >
                    {tr.volume}:{' '}
                    {volume.toFixed(2)} CBM
                  </div>

                  {(volume > MAX_CARGO_VOLUME_CBM || c.quantity > limitsFor(c).maxQuantity) && (
                    <div className="volume-error">
                      {c.quantity > limitsFor(c).maxQuantity ? (lang==='zh'?`件数超过 ${limitsFor(c).maxQuantity} 件限制`:`Quantity exceeds ${limitsFor(c).maxQuantity}`) : tr.volumeLimit}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        <section className="viewer">
          <div className="viewer-head">
            <div>
              <h2>
                {lang === 'zh'
                  ? '3D 装载视图'
                  : '3D Load View'}
              </h2>

              <span>
                {tr.dragHint}
              </span>
            </div>

            <div className="view-badge">
              {placed.length}/
              {totals.q} {tr.placed}
            </div>
          </div>

          <div className="view-toolbar">
            <div className="toolbar-group"><b>{tr.view}</b>
              {([['iso',tr.iso],['top',tr.top],['front',tr.front],['left',tr.left],['right',tr.right]] as [View,string][]).map(([value,label])=><button key={value} className={view===value?'active':''} onClick={()=>setView(value)}>{label}</button>)}
              <button className={securingMode?'active':''} onClick={()=>setSecuringMode(v=>!v)}>{tr.securingMode}</button>
              <label className="dimension-toggle"><input type="checkbox" checked={showDimensions} onChange={e=>setShowDimensions(e.target.checked)}/>{lang==='zh'?'容器尺寸标注':'Container Dimensions'}</label>
            </div>
            <div className="toolbar-group"><b>{lang==='zh'?'模式':'MODE'}</b>
              <button className={selectionMode==='box'?'active':''} onClick={()=>setSelectionMode('box')}>{lang==='zh'?'多选':'MULTI SELECT'}</button>
              <button className={freePlacement?'active':''} onClick={()=>setFreePlacement(v=>!v)}>{tr.freePlacement}</button>
            </div>
          </div>

          <div className="canvas-wrap">
            {packingProgress !== null && (
              <div className="packing-overlay">
                <div className="packing-panel">
                  <div className="packing-kicker">{lang === 'zh' ? '装载计算中' : 'PACKING IN PROGRESS'}</div>
                  <strong>{packingProgress}%</strong>
                  <div className="packing-track"><i style={{ width: `${packingProgress}%` }} /></div>
                  <span>{lang === 'zh' ? '正在搜索摆放位置与旋转组合，请稍候…' : 'Searching placement and rotation combinations…'}</span>
                </div>
              </div>
            )}
            <ContainerScene
              container={container}
              items={placed}
              materials={materials}
              selectedId={selectedId}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onSelect={selectOne}
              onSelectMany={selectMany}
              onMove={move}
              onRotate={rotateCargo}
              onMaterialMove={
                moveMaterial
              }
              onRotateMaterial={(id, rotation) =>
                setMaterials((items) =>
                  items.map((m) =>
                    m.id === id
                      ? { ...m, rotation: ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 }
                      : m,
                  ),
                )
              }
              view={view}
              dragging={dragging}
              onDragState={
                setDragging
              }
              onView={setView}
              cargo={cargo}
              lang={lang}
              freePlacement={
                freePlacement
              }
              overflowCount={overflowCount}
              overflowItems={overflowItems}
              securingMode={securingMode}
              showDimensions={showDimensions}
              airBagStretch={airBagStretch}
              onAddMaterial={addMaterial}
              onMaterialScale={scaleMaterial}
              onDeleteMaterial={deleteMaterial}
            />
          </div>

          <div className="viewer-foot">
            <span>{tr.grid}</span>

            <span>
              {lang === 'zh' ? '偏载' : 'IMBALANCE'} {analysis.dominantOffset.toFixed(0)} kg
            </span>
            {overflowCount > 0 && (
              <span className="overflow-badge">
                {lang === 'zh' ? `未装载 ${overflowCount} 件` : `${overflowCount} unplaced`}
              </span>
            )}
          </div>
        </section>

        <aside className="right-panel">
          {message && (
            <div className="status-message">
              {message}
            </div>
          )}

          <div className="tabs">
            <button
              className={
                tab === 'cargo'
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setTab('cargo')
                setSecuringMode(false)
              }}
            >
              {tr.properties}
            </button>

            <button
              className={
                tab === 'analysis'
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setTab('analysis')
              }
            >
              {tr.weight}
            </button>

            <button
              className={
                tab === 'secure'
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setTab('secure')
                setSecuringMode(true)
              }}
            >
              {tr.secure}
            </button>
          </div>

          {tab === 'cargo' && (
            <CargoProperties
              placed={selected}
              cargo={selectedCargo}
              onChange={(patch) => {
                if (selected) {
                  setP(
                    selected.id,
                    patch,
                  )
                }
              }}
              onDelete={() => {
                if (selected) {
                  setPlaced((items) =>
                    items.filter(
                      (p) =>
                        p.id !==
                        selected.id,
                    ),
                  )

                  setSelectedId(null)
                  setSelectedIds([])
                }
              }}
              lang={lang}
            />
          )}

          {tab === 'analysis' && (
            <div className="analysis">
              <h3>{tr.weight}</h3>
              <div className="bias-primary">
                <span>{lang === 'zh' ? '当前偏载' : 'CURRENT IMBALANCE'}</span>
                <b>{analysis.dominantOffset.toFixed(0)} kg</b>
                <strong>{analysis.dominantDirection === 'balanced' ? (lang === 'zh' ? '基本平衡' : 'BALANCED') : analysis.dominantDirection === 'front' ? (lang === 'zh' ? '偏柜头' : 'TOWARD FRONT') : analysis.dominantDirection === 'rear' ? (lang === 'zh' ? '偏柜门' : 'TOWARD DOOR') : analysis.dominantDirection === 'left' ? (lang === 'zh' ? '偏左侧' : 'TOWARD LEFT') : (lang === 'zh' ? '偏右侧' : 'TOWARD RIGHT')}</strong>
              </div>
              <p className="analysis-note">{lang === 'zh' ? '偏载 = 相对两侧的实际重量差。' : 'Imbalance is the actual weight difference between opposite sides.'}</p>
              <CenterOfGravity analysis={analysis} container={container} lang={lang}/>
            </div>
          )}

          {tab === 'secure' && (
            <div className="analysis">
              <h3>{tr.secure}</h3>

              <p className="hint">{tr.securingHint}</p>

              <h4>{tr.materialCount}</h4>
              <div className="material-stats">
                {(
                  [
                    'triangleWood',
                    'lashingBelt',
                    'airBag',
                    'doorNet',
                  ] as SecuringMaterialType[]
                ).map((key) => (
                  <span key={key}>
                    {
                      materialNames[
                        key
                      ][lang]
                    }

                    <b>
                      {materialCounts[
                        key
                      ] || 0}
                    </b>
                  </span>
                ))}
              </div>

              {materials.length >
                0 && (
                <button
                  className="danger-btn"
                  onClick={() =>
                    setMaterials([])
                  }
                >
                  {lang === 'zh'
                    ? '清空材料'
                    : 'Clear Materials'}
                </button>
              )}

              <small>
                {tr.planningAid}
              </small>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App