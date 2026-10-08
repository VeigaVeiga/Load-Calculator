import type { Cargo, Container, PlacedCargo } from '../types'
import { basePack, basePackAsync } from './baseSolver'

export function expandCargo(cargo: Cargo[]) {
  const out: { cargo: Cargo; index: number }[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i += 1) out.push({ cargo: c, index: i })
  }
  return out
}

/**
 * Compatibility entry point. Automatic packing has one implementation now:
 * binpack3d through baseSolver. No legacy synchronous row/level packer remains.
 */
export function autoPack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
) {
  return basePack(cargo, container, locked).placed
}

export async function autoPackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
  options: { signal?: AbortSignal } = {},
) {
  return (await basePackAsync(cargo, container, locked, progress, options.signal)).placed
}
