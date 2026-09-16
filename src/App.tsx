import { useEffect, useMemo, useState } from 'react'
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
    opt: '优化装载',
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
    import: '导入模板',
    export: '导出三视图',
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
    stopPlacement: '结束摆放',
    securingHint: '添加后可在 3D 视图中拖动 · 统计只记录当前方案材料。',
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
    import: 'Import Template',
    export: 'Export 3 Views',
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
    stopPlacement: 'Stop Placement',
    securingHint:
      'Drag added materials in the 3D view · counts reflect the current plan.',
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

  const [tab, setTab] = useState<'cargo' | 'analysis' | 'secure'>('cargo')

  const [view, setView] = useState<View>('iso')

  const [dragging, setDragging] = useState(false)

  const [freePlacement, setFreePlacement] = useState(false)

  const [message, setMessage] = useState('')

  const [lowPower, setLowPower] = useState(false)
  const [showDimensions, setShowDimensions] = useState(true)
  const [airBagStretch, setAirBagStretch] = useState(true)
  const [packingProgress, setPackingProgress] = useState<number | null>(null)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 780px)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setLowPower(mobile || reduced)
  }, [])

  const [materials, setMaterials] = useState<SecuringItem[]>([])

  useEffect(() => {
    if (!message) return

    const timer = window.setTimeout(() => {
      setMessage('')
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [message])

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
    const zoneXMax = Math.max(1000, container.length - 700)
    let cursorX = 250
    let cursorY = -11550
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
    key:
      | 'quantity'
      | 'length'
      | 'width'
      | 'height'
      | 'weight',
    raw: number,
  ) => {
    const value = Math.max(
      key === 'quantity' ||
        key === 'length' ||
        key === 'width' ||
        key === 'height'
        ? 1
        : 0,
      Number.isFinite(raw) ? raw : 0,
    )

    setCargo((items) =>
      items.map((c) => {
        if (c.id !== id) {
          return c
        }

        const next = {
          ...c,
          [key]: value,
        }

        const volume = cbm(
          next.length,
          next.width,
          next.height,
          next.quantity,
        )

        if (volume > MAX_CARGO_VOLUME_CBM) {
          setMessage(tr.volumeLimit)
          return c
        }

        setMessage('')

        return next
      }),
    )
  }

  const remove = (id: string) => {
    setCargo((items) =>
      items.filter((c) => c.id !== id),
    )

    setPlaced((items) =>
      items.filter((p) => p.cargoId !== id),
    )

    setSelectedId(null)
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
      const result = await autoPackAsync(cargo, nextContainer, locked, (done, total) => {
        const percent = total ? Math.round((done / total) * 100) : 100
        if (percent !== lastProgress) {
          lastProgress = percent
          setPackingProgress(percent)
        }
      })
      setPlaced(result)
      setSelectedId(null)
      setMessage(lang === 'zh' ? '自动装柜完成' : 'Auto packing complete')
    } finally {
      setPackingProgress(null)
    }
  }

  const repack = () => { void runPacking(container) }

  const addMaterial = (
    type: SecuringMaterialType,
  ) => {
    const n = materials.length + 1

    const material: SecuringItem = {
      id: `${type}-${n}`,
      type,
      x: 350 + ((n - 1) % 8) * 1450,
      y: 11550 + container.width / 2 - 50 - Math.floor((n - 1) / 8) * 950,
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
              ? container.doorWidth
              : 1000,
      height:
        type === 'triangleWood'
          ? 150
          : type === 'lashingBelt'
            ? 4
            : type === 'doorNet'
              ? container.doorHeight
              : 1800,
      rotation: 0,
    }
    material.y = Math.round(11550 + container.width / 2 - material.width / 2 - Math.floor((n - 1) / 8) * 950)

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

  const exportThree = () => {
    const W = 1400
    const H = 820

    const esc = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    const box = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
      name: string,
      show: boolean,
    ) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity=".72" stroke="#56615e"/>${
        show
          ? `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#263238">${esc(name)}</text>`
          : ''
      }`

    let top = ''
    let front = ''
    let side = ''

    for (const p of placed) {
      const dimensions =
        p.rotation % 180 === 0
          ? {
              l: p.length,
              w: p.width,
            }
          : {
              l: p.width,
              w: p.length,
            }

      const cargoDef = cargo.find(
        (c) => c.id === p.cargoId,
      )

      const show = !!cargoDef?.showName

      const name =
        cargoDef?.name || p.cargoId

      top += box(
        80 +
          (p.x / container.length) *
            600,
        85 +
          (p.y / container.width) *
            180,
        (dimensions.l / container.length) *
          600,
        (dimensions.w / container.width) *
          180,
        p.color,
        name,
        show,
      )

      front += box(
        80 +
          (p.y / container.width) *
            600,
        335 +
          (1 -
            (p.z + p.height) /
              container.height) *
            200,
        (dimensions.w / container.width) *
          600,
        (p.height / container.height) *
          200,
        p.color,
        name,
        show,
      )

      side += box(
        780 +
          (p.x / container.length) *
            420,
        335 +
          (1 -
            (p.z + p.height) /
              container.height) *
            200,
        (dimensions.l / container.length) *
          420,
        (p.height / container.height) *
          200,
        p.color,
        name,
        show,
      )
    }

    const matRows = Object.entries(
      materialCounts,
    )
      .map(
        ([key, value], index) =>
          `<text x="80" y="${
            620 + index * 24
          }" font-size="14">${
            esc(
              materialNames[
                key as SecuringMaterialType
              ][lang],
            )
          } × ${value}</text>`,
      )
      .join('')

    const title =
      lang === 'zh'
        ? `集装箱装载规划器 · ${container.name}`
        : `Container Loading Planner · ${container.name}`

    const svg = `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="${W}"
        height="${H}"
        viewBox="0 0 ${W} ${H}"
      >
        <rect
          width="100%"
          height="100%"
          fill="#f7f8f5"
        />

        <text
          x="50"
          y="42"
          font-size="24"
          font-weight="700"
          fill="#334047"
        >
          ${esc(title)}
        </text>

        <text
          x="50"
          y="66"
          font-size="13"
          fill="#66716c"
        >
          ${esc(
            `${
              lang === 'zh'
                ? '内部'
                : 'Internal'
            } ${container.length.toLocaleString()} × ${container.width.toLocaleString()} × ${container.height.toLocaleString()} mm`,
          )}
        </text>

        <text
          x="80"
          y="75"
          font-size="15"
          font-weight="700"
        >
          ${lang === 'zh' ? '顶视图' : 'TOP VIEW'}
        </text>

        <rect
          x="80"
          y="85"
          width="600"
          height="180"
          fill="none"
          stroke="#45504c"
        />

        ${top}

        <text
          x="80"
          y="325"
          font-size="15"
          font-weight="700"
        >
          ${
            lang === 'zh'
              ? '正视图（柜门）'
              : 'FRONT VIEW (DOOR)'
          }
        </text>

        <rect
          x="80"
          y="335"
          width="600"
          height="200"
          fill="none"
          stroke="#45504c"
        />

        ${front}

        <text
          x="780"
          y="325"
          font-size="15"
          font-weight="700"
        >
          ${lang === 'zh' ? '侧视图' : 'SIDE VIEW'}
        </text>

        <rect
          x="780"
          y="335"
          width="420"
          height="200"
          fill="none"
          stroke="#45504c"
        />

        ${side}

        <text
          x="50"
          y="585"
          font-size="17"
          font-weight="700"
        >
          ${
            lang === 'zh'
              ? '加固材料'
              : 'SECURING MATERIALS'
          }
        </text>

        ${
          matRows ||
          `<text x="80" y="620" font-size="14">${
            lang === 'zh'
              ? '无'
              : 'None'
          }</text>`
        }

        <text
          x="780"
          y="585"
          font-size="17"
          font-weight="700"
        >
          ${
            lang === 'zh'
              ? '装载摘要'
              : 'LOAD SUMMARY'
          }
        </text>

        <text
          x="780"
          y="615"
          font-size="14"
        >
          ${
            lang === 'zh'
              ? '货物数量'
              : 'Cargo units'
          }: ${totals.q}
        </text>

        <text
          x="780"
          y="640"
          font-size="14"
        >
          ${
            lang === 'zh'
              ? '总重量'
              : 'Gross weight'
          }: ${totals.w.toFixed(1)} kg
        </text>

        <text
          x="780"
          y="665"
          font-size="14"
        >
          ${
            lang === 'zh'
              ? '总体积'
              : 'Volume'
          }: ${totals.v.toFixed(2)} m³
        </text>
      </svg>
    `

    const blob = new Blob(
      [svg],
      {
        type: 'image/svg+xml;charset=utf-8',
      },
    )

    const url =
      URL.createObjectURL(blob)

    const img = new Image()

    img.onload = () => {
      const canvas =
        document.createElement('canvas')

      canvas.width = W * 2
      canvas.height = H * 2

      const ctx =
        canvas.getContext('2d')

      if (!ctx) {
        URL.revokeObjectURL(url)
        return
      }

      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, W, H)

      URL.revokeObjectURL(url)

      canvas.toBlob((png) => {
        if (!png) return

        const downloadUrl =
          URL.createObjectURL(png)

        const a =
          document.createElement('a')

        a.href = downloadUrl
        a.download = `${container.name}-three-views.png`
        a.click()

        window.setTimeout(
          () =>
            URL.revokeObjectURL(
              downloadUrl,
            ),
          1000,
        )
      }, 'image/png')
    }

    img.src = url
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="hero-title">
          <div className="hero-orbit" aria-hidden="true" />
          <div className="hero-rule" aria-hidden="true" />
          <h1>{tr.title}</h1>
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

          <button
            disabled
            className="disabled-btn"
          >
            {tr.import}
          </button>

          <button
            onClick={exportThree}
          >
            {tr.export}
          </button>
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
            <button onClick={repack}>
              {tr.auto}
            </button>

            <button onClick={repack}>
              {tr.opt}
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

          <div className="securing-palette">
            <div className="palette-title">
              <span>{tr.materials}</span>
              <small>{lang === 'zh' ? '点击添加到 3D 场景' : 'Click to add to 3D scene'}</small>
            </div>
            <div className="material-toolbar">
              <button onClick={() => addMaterial('triangleWood')}>▰ {tr.triangle}</button>
              <button onClick={() => addMaterial('lashingBelt')}>━ {tr.belt}</button>
              <button onClick={() => addMaterial('airBag')}>□ {tr.airbag}</button>
              <button onClick={() => addMaterial('doorNet')}>▦ {tr.net}</button>
            </div>
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

                  {volume >
                    MAX_CARGO_VOLUME_CBM && (
                    <div className="volume-error">
                      {tr.volumeLimit}
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
            <span>{tr.view}</span>
            <button className={showDimensions ? 'active' : ''} onClick={() => setShowDimensions(v => !v)}>{lang === 'zh' ? '尺寸标注' : 'Dimensions'}</button>

            <button
              className={
                freePlacement
                  ? 'active placement-toggle'
                  : ''
              }
              onClick={() =>
                setFreePlacement(
                  (value) => {
                    const next =
                      !value

                    if (!next) {
                      setDragging(false)
                    }

                    return next
                  },
                )
              }
            >
              {freePlacement
                ? tr.stopPlacement
                : tr.freePlacement}
            </button>

            {(
              [
                ['iso', tr.iso],
                ['top', tr.top],
                ['front', tr.front],
                ['rear', tr.rear],
                ['left', tr.left],
                ['right', tr.right],
              ] as [View, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={
                  view === value
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setView(value)
                }
              >
                {label}
              </button>
            ))}

            <button
              onClick={() =>
                setView('iso')
              }
            >
              {tr.reset}
            </button>
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
              onSelect={setSelectedId}
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
              lowPower={lowPower}
              showDimensions={showDimensions}
              airBagStretch={airBagStretch}
            />
          </div>

          <div className="viewer-foot">
            <span>{tr.grid}</span>

            <span>{tr.axis}</span>

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
              onClick={() =>
                setTab('cargo')
              }
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
              onClick={() =>
                setTab('secure')
              }
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

              <p className="hint">{tr.securingHint}<br/>{lang === 'zh' ? '选中模型后：G 移动 · R 旋转' : 'Select a model: G = move · R = rotate'}</p>

              <h4>{tr.materialCount}</h4>
              <label className="stretch-toggle"><input type="checkbox" checked={airBagStretch} onChange={e => setAirBagStretch(e.target.checked)} /> {lang === 'zh' ? '充气袋允许拉伸适配间隙' : 'Allow air bags to stretch to fit gaps'}</label>

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