import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlacement } from './geometry'

const snap = (value: number, grid = 10) => Math.round(value / grid) * grid

function orientations(cargo: Cargo) {
  return cargo.rotatable
    ? [{ length: cargo.length, width: cargo.width, rotation: 0 }, { length: cargo.width, width: cargo.length, rotation: 90 }]
    : [{ length: cargo.length, width: cargo.width, rotation: 0 }]
}

export function expandCargo(cargo: Cargo[]) {
  const result: { cargo: Cargo; index: number }[] = []
  for (const item of cargo) {
    for (let i = 0; i < Math.max(0, Math.floor(item.quantity)); i += 1) result.push({ cargo: item, index: i })
  }
  return result
}

export function autoPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = []): PlacedCargo[] {
  const result: PlacedCargo[] = [...locked]
  const items = expandCargo(cargo).sort((a, b) => {
    const va = a.cargo.length * a.cargo.width * a.cargo.height
    const vb = b.cargo.length * b.cargo.width * b.cargo.height
    return vb - va
  })

  const candidatesFor = (itemsPlaced: PlacedCargo[], cargo: Cargo, orientation?: { length: number; width: number }) => {
    const set = new Set<string>(['0|0|0'])
    const ow = orientation?.width ?? cargo.width
    const centerY = snap((container.width - ow) / 2)
    set.add(`0|${Math.max(0,centerY)}|0`)
    for (const p of itemsPlaced) {
      const d = p.rotation % 180 === 0 ? { length: p.length, width: p.width } : { length: p.width, width: p.length }
      const points: [number, number, number][] = [
        [p.x + d.length, p.y, p.z],
        [p.x, p.y + d.width, p.z],
        [p.x, p.y, p.z + p.height],
        [p.x + d.length, p.y + d.width, p.z],
        [p.x + d.length, p.y, p.z + p.height],
        [p.x, p.y + d.width, p.z + p.height],
      ]
      for (const [x, y, z] of points) if (x >= 0 && y >= 0 && z >= 0) {
        set.add(`${snap(x)}|${snap(y)}|${snap(z)}`)
        const cy = snap((container.width - ow) / 2)
        set.add(`${snap(x)}|${Math.max(0,cy)}|${snap(z)}`)
      }
    }
    return [...set].map(s => s.split('|').map(Number) as [number, number, number])
      .sort((a, b) => {
        const ay = Math.abs((a[1] + ow / 2) - container.width / 2)
        const by = Math.abs((b[1] + ow / 2) - container.width / 2)
        return (ay - by) || (a[2] - b[2]) || (a[0] - b[0]) || (a[1] - b[1])
      })
  }

  for (const item of items) {
    const c = item.cargo
    let found: PlacedCargo | undefined
    for (const o of orientations(c)) {
      for (const candidate of candidatesFor(result, c, o)) {
        const p: PlacedCargo = {
          id: `${c.id}-${item.index + 1}`,
          cargoId: c.id,
          cargoType: c.type,
          x: candidate[0], y: candidate[1], z: candidate[2],
          length: c.length, width: c.width, height: c.height,
          rotation: o.rotation, weight: c.weight, color: c.color,
          placementMode: 'automatic', locked: false,
        }
        if (validatePlacement(p, container, result).ok) { found = p; break }
      }
      if (found) break
    }
    if (found) result.push(found)
  }
  return result
}
