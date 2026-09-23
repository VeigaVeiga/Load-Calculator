import type { Cargo, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'

export default function CargoProperties({
  placed,
  cargo,
  onChange,
  onDelete,
  lang='zh',
}: {
  placed: PlacedCargo | undefined
  cargo: Cargo | undefined
  onChange: (p: Partial<PlacedCargo>) => void
  onDelete: () => void
  lang?: 'zh' | 'en'
}) {
  if (!placed || !cargo) return <div className="empty-props">{lang === 'zh' ? '选择货物或加固材料查看数据' : 'Select cargo or securing material'}</div>
  const d = dims(placed)
  const typeName = lang === 'zh'
    ? (cargo.type === 'woodCrate' ? '木箱' : cargo.type === 'pallet' ? '托盘' : '纸箱')
    : (cargo.type === 'woodCrate' ? 'WOOD CRATE' : cargo.type === 'pallet' ? 'PALLET' : 'CARTON')
  return <div className="properties">
    <div className="prop-title">
      <div><b>{cargo.name}</b><small>{typeName}</small></div>
      <button onClick={onDelete}>{lang === 'zh' ? '删除' : 'Delete'}</button>
    </div>
    <div className="cargo-data">
      <div>{lang === 'zh' ? '数量' : 'Quantity'} <b>1 / {cargo.quantity}</b></div>
      <div>{lang === 'zh' ? '单件重量 (KG)' : 'Unit Weight (KG)'} <b>{placed.weight.toFixed(1)} kg</b></div>
      <div>{lang === 'zh' ? '原始尺寸 (mm)' : 'Original Size (mm)'} <b>{cargo.length} × {cargo.width} × {cargo.height} mm</b></div>
      <div>{lang === 'zh' ? '实际尺寸 (mm)' : 'Placed Size (mm)'} <b>{d.length} × {d.width} × {placed.height} mm</b></div>
      <div>{lang === 'zh' ? '位置 (mm)' : 'Position (mm)'} <b>{placed.x} × {placed.y} × {placed.z} mm</b></div>
      <div>{lang === 'zh' ? '旋转' : 'Rotation'} <b>{placed.rotation}°</b></div>
    </div>
    <label className="check">
      <input type="checkbox" checked={placed.locked} onChange={e => onChange({locked: e.target.checked})}/>
      {lang === 'zh' ? '锁定位置' : 'Lock position'}
    </label>
  </div>
}
