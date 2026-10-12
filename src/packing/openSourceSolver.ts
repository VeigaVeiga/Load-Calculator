import { pack } from 'binpack3d'
import { pack3D, RotationType } from './binpackingjs/3d'
import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'

/**
 * Independent candidate generator backed by the MIT-licensed binpack3d
 * corner-point heuristic (a TypeScript port of py3dbp).
 *
 * The library's load-bearing model cannot express this app's distinction
 * between self-stacking and cross-SKU support. Its output is therefore only
 * a proposal; every accepted placement is checked by the app validator.
 */
export function openSourcePackCandidate(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  order: 'volume' | 'footprint' | 'weight' | 'sequence' = 'volume',
  sequenceOrder: string[] = [],
): PlacedCargo[] | null {
  try {
    const cargoById = new Map(cargo.map((item) => [item.id, item]))
    const lockedIds = new Set(locked.map((item) => item.id))
    const lockedWeight = locked.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
    const maxWeight = container.maxPayload > 0
      ? Math.max(0, container.maxPayload - lockedWeight)
      : Number.MAX_SAFE_INTEGER

    const items = cargo.flatMap((item) =>
      Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, (_, index) => {
        const id = item.id + '#' + (index + 1)
        if (lockedIds.has(id)) return []
        return [{
          partno: id,
          name: item.name,
          whd: [item.length, item.height, item.width] as [number, number, number],
          weight: Math.max(0, item.weight),
          // Keep items upright: only floor-plane rotation is allowed by this app.
          updown: false,
          // App-specific support rules are enforced by validatePlan below.
          loadbear: Number.MAX_SAFE_INTEGER,
          fragile: false,
          nonStackable: false,
          color: item.color,
        }]
      }).flat(),
    )

    items.sort((a, b) => {
      // LoadZa-style sequence search supplies a deliberate item order. Keep it
      // intact instead of sorting it away; modern JS sort is stable, but an
      // explicit equality makes this contract clear.
      if (order === 'sequence') {
        if (sequenceOrder.length === 0) return 0
        const rank = new Map(sequenceOrder.map((id, index) => [id, index]))
        return (rank.get(a.partno) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.partno) ?? Number.MAX_SAFE_INTEGER)
      }
      const score = (item: typeof a) => {
        const [length, height, width] = item.whd
        if (order === 'weight') return item.weight
        if (order === 'footprint') return length * width
        return length * height * width
      }
      return score(b) - score(a) || a.partno.localeCompare(b.partno)
    })

    const obstacles = locked.map((item) => ({
      position: [item.x, item.z, item.y] as [number, number, number],
      whd: [
        item.rotation % 180 === 0 ? item.length : item.width,
        item.height,
        item.rotation % 180 === 0 ? item.width : item.length,
      ] as [number, number, number],
    }))

    const result = pack({
      bins: [{
        partno: container.id,
        whd: [container.length, container.height, container.width],
        maxWeight,
        checkStable: true,
        supportSurfaceRatio: 0.75,
        obstacles,
      }],
      items,
      options: { biggerFirst: false, distributeItems: true, numberOfDecimals: 0 },
    })

    const fitted = result.bins[0]?.fittedItems ?? []
    const proposed: PlacedCargo[] = fitted.flatMap((item) => {
      const cargoItem = cargoById.get(item.partno.split('#')[0])
      if (!cargoItem) return []
      const [x, z, y] = item.position
      const [length, height, width] = item.rotatedWhd
      const rotation: 0 | 90 = Math.abs(length - cargoItem.length) <= 0.5 ? 0 : 90
      return [{
        id: item.partno,
        cargoId: cargoItem.id,
        cargoType: cargoItem.type,
        x, y, z,
        length: cargoItem.length,
        width: cargoItem.width,
        height,
        rotation,
        weight: cargoItem.weight,
        color: cargoItem.color,
        placementMode: 'automatic' as const,
        locked: false,
        stackable: cargoItem.stackable,
        loadBearing: cargoItem.loadBearing,
        maxStackLayers: cargoItem.maxStackLayers,
        maxLoadOnTop: cargoItem.maxLoadOnTop,
        rotatable: cargoItem.rotatable,
      }]
    })

    // Never throw away the entire candidate because one proposed item violates
    // app-specific rules. Keep locked placements, then accept proposed items
    // from the floor upward only when the complete partial plan remains valid.
    // This preserves valid cargo while ensuring no invalid plan can escape.
    let accepted = [...locked]
    const lockedAudit = validatePlan(accepted, container, cargo)
    if (!lockedAudit.ok) {
      console.warn('[packing:binpack3d] locked placements fail validation; candidate skipped', lockedAudit.errors)
      return null
    }

    const ordered = proposed
      .filter((item) => !lockedIds.has(item.id))
      .sort((a, b) => a.z - b.z ||
        (b.length * b.width - a.length * a.width) ||
        a.y - b.y || a.x - b.x)

    let rejected = 0
    for (const item of ordered) {
      const trial = [...accepted, item]
      const audit = validatePlan(trial, container, cargo)
      if (audit.ok) accepted = trial
      else rejected += 1
    }

    console.info('[packing:binpack3d] candidate audit', {
      order,
      proposed: proposed.length,
      accepted: accepted.length - locked.length,
      rejected,
      locked: locked.length,
      unfit: Math.max(0, items.length - proposed.length),
    })
    return accepted
  } catch (error) {
    console.error('[packing:binpack3d] candidate generation failed', error)
    return null
  }
}


/**
 * Second independent candidate generator using MIT-licensed binpackingjs
 * (pivot-based 3D packing with best-fit rotation scoring). This implementation
 * has no runtime dependencies and is used as a peer candidate to binpack3d.
 * Locked placements are intentionally handled by binpack3d, which supports
 * obstacles; this adapter is used only when no locked cargo exists.
 */
export function binpackingJsCandidate(
  cargo: Cargo[],
  container: Container,
): PlacedCargo[] | null {
  if (cargo.some(item => Math.floor(item.quantity) < 0)) return null
  try {
    const cargoById = new Map(cargo.map(item => [item.id, item]))
    const items = cargo.flatMap(item =>
      Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, (_, index) => ({
        name: item.id + '#' + (index + 1),
        width: item.length,
        height: item.height,
        depth: item.width,
        weight: Math.max(0, item.weight),
        // Standard carton/pallet loading keeps the height axis upright.
        allowedRotations: item.rotatable === false
          ? [RotationType.WHD] as const
          : [RotationType.WHD, RotationType.DHW] as const,
      })),
    )
    const result = pack3D({
      bins: [{
        name: container.id,
        width: container.length,
        height: container.height,
        depth: container.width,
        maxWeight: container.maxPayload > 0 ? container.maxPayload : Number.MAX_SAFE_INTEGER,
      }],
      items,
    })
    const proposed: PlacedCargo[] = (result.packedBins[0]?.items ?? []).flatMap(item => {
      const id = item.sourceItem.name
      const cargoId = id.slice(0, id.lastIndexOf('#'))
      const source = cargoById.get(cargoId)
      if (!source) return []
      const [x, z, y] = item.position
      const [length, height, width] = item.dimension
      return [{
        id,
        cargoId,
        cargoType: source.type,
        x, y, z, length, width, height,
        rotation: Math.abs(length - source.length) <= 0.5 ? 0 : 90,
        weight: source.weight,
        color: source.color,
        placementMode: 'automatic' as const,
        locked: false,
        stackable: source.stackable,
        loadBearing: source.loadBearing,
        maxStackLayers: source.maxStackLayers,
        maxLoadOnTop: source.maxLoadOnTop,
        rotatable: source.rotatable,
      }]
    })

    let accepted: PlacedCargo[] = []
    const ordered = proposed.sort((a, b) => a.z - b.z || b.length * b.width - a.length * a.width || a.y - b.y || a.x - b.x)
    for (const item of ordered) {
      const trial = [...accepted, item]
      if (validatePlan(trial, container, cargo).ok) accepted = trial
    }
    console.info('[packing:binpackingjs] candidate audit', {
      proposed: proposed.length,
      accepted: accepted.length,
      unfit: result.unfitItems.length,
    })
    return accepted
  } catch (error) {
    console.error('[packing:binpackingjs] candidate generation failed', error)
    return null
  }
}
