import { pack, RotationType } from 'binpack3d'
import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'

const EPS = 0.5

export type SolverResult = {
  placed: PlacedCargo[]
  unplaced: Cargo[]
}

function rotationToDegrees(rotationType: RotationType): 0 | 90 {
  return rotationType === RotationType.DHW ? 90 : 0
}

function clonePlacedFromCargo(
  cargo: Cargo,
  id: string,
  x: number,
  y: number,
  z: number,
  rotation: 0 | 90,
): PlacedCargo {
  return {
    id,
    cargoId: cargo.id,
    cargoType: cargo.type,
    x,
    y,
    z,
    length: cargo.length,
    width: cargo.width,
    height: cargo.height,
    rotation,
    weight: cargo.weight,
    color: cargo.color,
    placementMode: 'automatic',
    locked: false,
    stackable: cargo.stackable,
    loadBearing: cargo.loadBearing,
    maxStackLayers: cargo.maxStackLayers,
    maxLoadOnTop: cargo.maxLoadOnTop,
  }
}

function expandCargo(cargo: Cargo[]) {
  const units: Array<{ cargo: Cargo; index: number }> = []
  for (const c of cargo) {
    const quantity = Math.max(0, Math.floor(c.quantity))
    for (let index = 0; index < quantity; index += 1) units.push({ cargo: c, index })
  }
  return units
}

function effectiveDimensions(p: PlacedCargo) {
  return p.rotation % 180 === 0
    ? { length: p.length, width: p.width }
    : { length: p.width, width: p.length }
}

function overlaps(a: PlacedCargo, b: PlacedCargo) {
  const A = effectiveDimensions(a)
  const B = effectiveDimensions(b)
  return (
    a.x < b.x + B.length - EPS &&
    a.x + A.length > b.x + EPS &&
    a.y < b.y + B.width - EPS &&
    a.y + A.width > b.y + EPS &&
    a.z < b.z + b.height - EPS &&
    a.z + a.height > b.z + EPS
  )
}

function fits(p: PlacedCargo, container: Container) {
  const d = effectiveDimensions(p)
  return (
    p.x >= -EPS &&
    p.y >= -EPS &&
    p.z >= -EPS &&
    p.x + d.length <= container.length + EPS &&
    p.y + d.width <= container.width + EPS &&
    p.z + p.height <= container.height + EPS
  )
}

/**
 * First-stage solver.
 *
 * binpack3d owns candidate generation, rotations, gravity settling, support
 * and load-bearing decisions. This adapter owns our application data model,
 * coordinate conversion, locked cargo and business constraints.
 */
export function basePack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
): SolverResult {
  const units = expandCargo(cargo)
  const validLocked = locked.filter((p) => fits(p, container))

  const lockedObstacles = validLocked.map((p) => {
    const d = effectiveDimensions(p)
    return {
      position: [p.x, p.z, p.y] as [number, number, number],
      whd: [d.length, p.height, d.width] as [number, number, number],
    }
  })

  const items = units.map(({ cargo: c, index }) => ({
    partno: c.id + '#' + (index + 1),
    name: c.name,
    // binpack3d uses [width, height, depth]. Our [x,y,z] maps to
    // [length,height,width]. updown:false keeps the cargo upright.
    whd: [c.length, c.height, c.width] as [number, number, number],
    weight: c.weight,
    loadbear: c.maxLoadOnTop > 0 ? c.maxLoadOnTop : 100000000,
    updown: false,
    fragile: !c.stackable || !c.loadBearing || c.breakablePallet,
    nonStackable: !c.stackable,
    color: c.color,
  }))

  const result = pack({
    bins: [{
      partno: container.id,
      whd: [container.length, container.height, container.width],
      maxWeight: container.maxPayload,
      fixPoint: true,
      checkStable: true,
      supportSurfaceRatio: 0.75,
      obstacles: lockedObstacles,
    }],
    items,
    options: {
      biggerFirst: true,
      distributeItems: false,
      numberOfDecimals: 0,
    },
  })

  const packedByPart = new Map(
    result.bins[0]?.fittedItems.map((item) => [item.partno, item]) ?? [],
  )

  const placed: PlacedCargo[] = [...validLocked]
  const unplaced: Cargo[] = []

  for (const unit of units) {
    const key = unit.cargo.id + '#' + (unit.index + 1)
    const packed = packedByPart.get(key)
    if (!packed) {
      unplaced.push(unit.cargo)
      continue
    }

    const rotation = rotationToDegrees(packed.rotationType)
    const p = clonePlacedFromCargo(
      unit.cargo,
      key,
      packed.position[0],
      packed.position[2],
      packed.position[1],
      rotation,
    )

    if (!unit.cargo.rotatable && rotation !== 0) {
      unplaced.push(unit.cargo)
      continue
    }

    if (!fits(p, container) || placed.some((q) => overlaps(p, q))) {
      unplaced.push(unit.cargo)
      continue
    }

    placed.push(p)
  }

  // binpack3d handles the generic stability rules. Our application-specific
  // stack-layer constraints are audited once more here. If a business rule
  // rejects a top item, remove that item rather than exposing an invalid plan.
  let audit = validatePlan(placed, container, cargo)
  while (!audit.ok) {
    const offending = new Set(audit.errors.map((e) => e.split(':', 1)[0]))
    const before = placed.length
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      if (!placed[i].locked && offending.has(placed[i].id)) placed.splice(i, 1)
    }
    if (placed.length === before) break
    audit = validatePlan(placed, container, cargo)
  }

  const placedCounts = new Map<string, number>()
  for (const p of placed) placedCounts.set(p.cargoId, (placedCounts.get(p.cargoId) ?? 0) + 1)
  const finalUnplaced: Cargo[] = [...unplaced]
  for (const c of cargo) {
    const missing = Math.max(0, Math.floor(c.quantity) - (placedCounts.get(c.id) ?? 0))
    const already = finalUnplaced.filter((x) => x.id === c.id).length
    for (let i = already; i < missing; i += 1) finalUnplaced.push(c)
  }

  return { placed, unplaced: finalUnplaced }
}

export async function basePackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResult> {
  if (signal?.aborted) throw new Error('Packing cancelled')
  progress?.(20)
  await Promise.resolve()
  if (signal?.aborted) throw new Error('Packing cancelled')
  const result = basePack(cargo, container, locked)
  progress?.(100)
  return result
}
