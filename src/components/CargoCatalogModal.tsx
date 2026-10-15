import { createPortal } from 'react-dom'
import type { CargoType } from '../types'

type Preset = {
  id: string
  name: string
  en: string
  category: string
  categoryEn: string
  type: CargoType
  length: number
  width: number
  height: number
  weight: number
  color: string
  note: string
  noteEn: string
  stackable?: boolean
  loadBearing?: boolean
  rotatable?: boolean
}

const PRESETS: Preset[] = [
  { id:'carton-small', name:'小型纸箱', en:'Small carton', category:'纸箱包装', categoryEn:'Cartons', type:'carton', length:400,width:300,height:250,weight:8,color:'#c9a574',note:'常见小件纸箱示例尺寸',noteEn:'Illustrative small shipping carton dimensions' },
  { id:'carton-large', name:'大型纸箱', en:'Large carton', category:'纸箱包装', categoryEn:'Cartons', type:'carton', length:600,width:400,height:400,weight:15,color:'#b88b5a',note:'通用预设，可按实际货物修改',noteEn:'General preset; edit to match actual cargo' },
  { id:'pallet', name:'托盘货物（1200×1100）', en:'Palletized cargo (1200×1100)', category:'托盘及周转箱', categoryEn:'Pallets & totes', type:'pallet', length:1200,width:1100,height:1000,weight:350,color:'#b88b5a',note:'含货物的整体包络尺寸；非空托盘尺寸',noteEn:'Overall loaded unit size, not an empty pallet' },
  { id:'wood-crate', name:'木箱 / 木架箱', en:'Wooden crate', category:'木箱及设备', categoryEn:'Crates & equipment', type:'woodCrate', length:1200,width:1000,height:1000,weight:180,color:'#9a6638',note:'适用于一般木箱外形示意',noteEn:'Generic wooden crate envelope' },
  { id:'drum', name:'钢制油桶（200 L）', en:'Steel drum (200 L)', category:'桶、罐及容器', categoryEn:'Drums & containers', type:'drum', length:590,width:590,height:880,weight:220,color:'#6f8992',note:'近似外形尺寸；重量含示例货物',noteEn:'Approximate envelope; sample gross weight' },
  { id:'ibc', name:'IBC 吨桶（1000 L）', en:'IBC tank (1000 L)', category:'桶、罐及容器', categoryEn:'Drums & containers', type:'ibc', length:1200,width:1000,height:1160,weight:1100,color:'#d9e1d8',note:'常见 1000 L IBC 的近似包络尺寸',noteEn:'Approximate envelope for a common 1000 L IBC' },
  { id:'pipe', name:'钢管捆 / 管材', en:'Steel pipe bundle', category:'长尺寸货物', categoryEn:'Long cargo', type:'pipe', length:6000,width:600,height:600,weight:500,color:'#8d999e',note:'作为整捆货物示意；请按支架及捆扎后尺寸录入',noteEn:'Bundle envelope; include racks and strapping in dimensions',stackable:false,loadBearing:false,rotatable:false },
  { id:'vehicle', name:'乘用汽车', en:'Passenger car', category:'车辆及特殊货物', categoryEn:'Vehicles & special cargo', type:'vehicle', length:4800,width:1900,height:1500,weight:1800,color:'#477b9a',note:'仅为车辆外形占位模型；不包含车轮挡、绑带或专用运输架',noteEn:'Visual placeholder only; excludes wheel chocks, lashings and transport racks',stackable:false,loadBearing:false,rotatable:false },
  { id:'machinery', name:'工业机械 / 设备', en:'Industrial machinery', category:'木箱及设备', categoryEn:'Crates & equipment', type:'machinery', length:1800,width:1200,height:1500,weight:850,color:'#8b9690',note:'简化设备外形，重心和吊点需按实际设备确认',noteEn:'Simplified machine envelope; verify actual CG and lifting points',stackable:false,loadBearing:false },
  { id:'euro-tote', name:'周转箱 / 塑料箱', en:'Reusable plastic tote', category:'托盘及周转箱', categoryEn:'Pallets & totes', type:'carton', length:600,width:400,height:320,weight:12,color:'#78969b',note:'以长方体显示；可修改尺寸',noteEn:'Shown as a cuboid; dimensions are editable' },
]

export default function CargoCatalogModal({
  lang,
  onClose,
  onSelect,
}: {
  lang: 'zh' | 'en'
  onClose: () => void
  onSelect: (preset: Preset) => void
}) {
  const categories = [...new Set(PRESETS.map(p => lang === 'zh' ? p.category : p.categoryEn))]
  return createPortal(<div className="cargo-catalog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="cargo-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="cargo-catalog-title">
      <header className="cargo-catalog-header">
        <div>
          <span className="catalog-eyebrow">{lang === 'zh' ? '货物预设库 / CARGO LIBRARY' : 'CARGO PRESET LIBRARY'}</span>
          <h2 id="cargo-catalog-title">{lang === 'zh' ? '选择货物类型' : 'Choose a cargo type'}</h2>
          <p>{lang === 'zh' ? '选择一个模型加入货物列表，再按实际货物修改尺寸、重量和数量。' : 'Add a model to the cargo list, then edit its actual dimensions, weight and quantity.'}</p>
        </div>
        <button className="catalog-close" onClick={onClose} aria-label={lang === 'zh' ? '关闭' : 'Close'}>×</button>
      </header>
      <div className="cargo-catalog-grid">
        {categories.map(category => <div className="cargo-catalog-category" key={category}>
          <h3>{category}</h3>
          <div className="cargo-catalog-cards">
            {PRESETS.filter(p => (lang === 'zh' ? p.category : p.categoryEn) === category).map(p => <button className="cargo-preset-card" key={p.id} onClick={() => onSelect(p)}>
              <span className={`preset-swatch preset-${p.type}`} aria-hidden="true">
                {p.type === 'drum' ? '◉' : p.type === 'pipe' ? '◎' : p.type === 'ibc' ? '▦' : p.type === 'vehicle' ? '▰' : p.type === 'pallet' ? '▤' : p.type === 'woodCrate' ? '▧' : p.type === 'machinery' ? '⚙' : '▣'}
              </span>
              <span className="preset-copy">
                <strong>{lang === 'zh' ? p.name : p.en}</strong>
                <small>{p.length} × {p.width} × {p.height} mm</small>
                <small>{lang === 'zh' ? p.note : p.noteEn}</small>
              </span>
              <span className="preset-add">+</span>
            </button>)}
          </div>
        </div>)}
      </div>
      <footer className="cargo-catalog-foot">
        <span>{lang === 'zh' ? '尺寸为常见规格的示例值，不是强制标准。装柜前请以货物实测尺寸、毛重、重心及承载限制为准。' : 'Dimensions are illustrative common values, not mandatory standards. Use measured dimensions, gross weight, centre of gravity and load limits for real loading.'}</span>
        <button onClick={onClose}>{lang === 'zh' ? '完成' : 'Done'}</button>
      </footer>
    </section>
  </div>, document.body)
}
