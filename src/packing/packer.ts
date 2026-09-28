import type { Cargo, Container, PlacedCargo } from '../types'
import { smartPack } from './smartPack'

type PackOptions = { signal?: AbortSignal }
type Progress = (percent: number) => void

export function expandCargo(cargo: Cargo[]) {
  const out: { cargo: Cargo; index: number }[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i++) out.push({ cargo: c, index: i })
  }
  return out
}

// Kept synchronous for callers that only need a lightweight preview. The main
// automatic loading action uses autoPackAsync below, which runs the full
// mixed-cargo optimizer with obstacle-aware placement and look-ahead.
export function autoPack(cargo: Cargo[], container: Container, locked: PlacedCargo[] = []) {
  const result = locked.slice()
  const units = expandCargo(cargo)
  let x = 0
  let y = 0
  let z = 0
  let rowWidth = 0
  for (const { cargo: c, index } of units) {
    if (container.maxPayload > 0 && result.reduce((n, p) => n + p.weight, 0) + c.weight > container.maxPayload) break
    const L = c.length
    const W = c.width
    if (x + L > container.length) { x = 0; y += rowWidth; rowWidth = 0 }
    if (y + W > container.width) { x = 0; y = 0; z += c.height; rowWidth = 0 }
    if (z + c.height > container.height) break
    const rotation: 0 | 90 = c.rotatable && x + L > container.length && y + c.length <= container.width ? 90 : 0
    const l = rotation === 90 ? c.width : c.length
    const w = rotation === 90 ? c.length : c.width
    if (x + l > container.length || y + w > container.width || z + c.height > container.height) break
    result.push({ id: `${c.id}-${index + 1}`, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: c.height, weight: c.weight, color: c.color, rotation, placementMode: 'automatic', locked: false })
    x += l
    rowWidth = Math.max(rowWidth, w)
  }
  return result
}

export async function autoPackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: Progress,
  options: PackOptions = {},
) {
  return smartPack(cargo, container, locked, progress, options)
}
