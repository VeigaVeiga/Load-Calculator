import type { Cargo, Container, PlacedCargo } from '../types'
import { packLaff } from './laff'

type PackOptions = { signal?: AbortSignal }
type Progress = (percent: number) => void

// Production packing is delegated to the batch LAFF/free-space engine.
// Keep the historical exports stable for the rest of the application.
export function expandCargo(cargo: Cargo[]) {
  const out: { cargo: Cargo; index: number }[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i++) out.push({ cargo: c, index: i })
  }
  return out
}

function makePlaced(c: Cargo, index: number, x: number, y: number, z: number, rotation: 0 | 90): PlacedCargo {
  return {
    id: `${c.id}-${index + 1}`,
    cargoId: c.id,
    cargoType: c.type,
    x, y, z,
    length: c.length,
    width: c.width,
    height: c.height,
    weight: c.weight,
    color: c.color,
    rotation,
    placementMode: 'automatic',
    locked: false,
  }
}

// Synchronous compatibility path. It avoids the old per-box O(n²) collision loop.
function packSync(cargo: Cargo[], container: Container, locked: PlacedCargo[]) {
  const result = locked.slice()
  const groups = cargo
    .filter(c => c.quantity > 0 && c.length > 0 && c.width > 0 && c.height > 0)
    .slice()
    .sort((a, b) => (b.length * b.width) - (a.length * a.width) || (b.length * b.width * b.height) - (a.length * a.width * a.height))

  for (const c of groups) {
    const n = Math.floor(c.quantity)
    const rotations: (0 | 90)[] = c.rotatable && c.length !== c.width ? [0, 90] : [0]
    let placed = 0
    for (const rotation of rotations) {
      if (placed >= n) break
      const L = rotation === 90 ? c.width : c.length
      const W = rotation === 90 ? c.length : c.width
      const cols = Math.floor(container.length / L)
      const rows = Math.floor(container.width / W)
      let layers = Math.floor(container.height / c.height)
      if (!c.stackable) layers = Math.min(layers, 1)
      if (c.maxStackLayers > 0) layers = Math.min(layers, Math.floor(c.maxStackLayers))
      if (c.maxLoadOnTop > 0 && c.weight > 0) layers = Math.min(layers, Math.floor(c.maxLoadOnTop / c.weight) + 1)
      if (cols <= 0 || rows <= 0 || layers <= 0) continue
      const cap = cols * rows * layers
      const take = Math.min(n - placed, cap)
      const x0 = Math.max(0, (container.length - Math.min(cols * L, container.length)) / 2)
      const y0 = Math.max(0, (container.width - Math.min(rows * W, container.width)) / 2)
      for (let i = 0; i < take; i++) {
        const perLayer = cols * rows
        const layer = Math.floor(i / perLayer)
        const slot = i % perLayer
        const row = Math.floor(slot / cols)
        const col = slot % cols
        result.push(makePlaced(c, placed, x0 + col * L, y0 + row * W, layer * c.height, rotation))
        placed++
      }
    }
  }
  return result
}

export function autoPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = []) {
  return packSync(cargo, container, locked)
}

export async function autoPackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: Progress,
  options: PackOptions = {},
) {
  const packed = await packLaff(cargo, container, progress, options)
  if (!locked.length) return packed
  return [...locked, ...packed]
}
