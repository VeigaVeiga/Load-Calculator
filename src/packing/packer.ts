import type { Cargo, Container, PlacedCargo } from '../types'
import { smartPack } from './smartPack'

type PackOptions = { signal?: AbortSignal }
type Progress = (percent: number) => void

export function expandCargo(cargo: Cargo[]) {
  const out: { cargo: Cargo; index: number }[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i += 1) {
      out.push({ cargo: c, index: i })
    }
  }
  return out
}

// There is intentionally only one automatic packing implementation.
// smartPack is the canonical solver used by the UI.
export async function autoPackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: Progress,
  options: PackOptions = {},
) {
  return smartPack(cargo, container, locked, progress, options)
}
