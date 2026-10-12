import { pack } from 'binpack3d'
import type { Cargo, Container, PlacedCargo } from '../types'
import { validatePlan } from './geometry'

/**
 * Independent candidate generator backed by the MIT-licensed binpack3d
 * corner-point heuristic (a TypeScript port of py3dbp).
 *
 * This is deliberately NOT the final validator: its load-bearing semantics
 * cannot express this app's distinction between same-SKU stacking and
 * cross-SKU support. Every result must pass our stricter logistics validator.
 */
export function openSourcePackCandidate(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
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
          // Keep every item upright. The app only permits floor-plane rotation.
          updown: false,
          // Generate a geometry candidate first. App-specific support rules are
          // enforced by validatePlan below, not approximated by this library.
          loadbear: Number.MAX_SAFE_INTEGER,
          fragile: false,
          nonStackable: false,
          color: item.color,
        }]
      }).flat(),
    )

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
      options: { biggerFirst: true, distributeItems: true, numberOfDecimals: 0 },
    })

    const fitted = result.bins[0]?.fittedItems ?? []
    const placed: PlacedCargo[] = [
      ...locked,
      ...fitted.flatMap((item) => {
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
      }),
    ]

    const audit = validatePlan(placed, container, cargo)
    return audit.ok ? placed : null
  } catch {
    // Keep packing available if a future upstream library change is incompatible.
    return null
  }
}
