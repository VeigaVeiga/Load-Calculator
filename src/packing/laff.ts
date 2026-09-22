import type { Cargo, Container, PlacedCargo } from '../types'

const EPS = 0.5

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }

type Orientation = {
  length: number
  width: number
  height: number
  rotation: 0 | 90
}

type SupportKind = 'floor' | 'cargo'

type FreeSpace = {
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  supported: boolean
  supportKind: SupportKind
  supportCargoId?: string
  supportCargoTemplateId?: string
  supportCargoType?: Cargo['type']
  supportLoadBearing?: boolean
  supportMaxLoadOnTop?: number
  stackDepth: number
}

type Candidate = {
  space: FreeSpace
  orientation: Orientation
  score: number
  x: number
  y: number
  z: number
}

const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Packing cancelled', 'AbortError')
}

const yieldBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })

function orientations(cargo: Cargo): Orientation[] {
  const base: Orientation = {
    length: cargo.length,
    width: cargo.width,
    height: cargo.height,
    rotation: 0,
  }
  if (!cargo.rotatable || Math.abs(cargo.length - cargo.width) < EPS) return [base]
  return [
    base,
    { length: cargo.width, width: cargo.length, height: cargo.height, rotation: 90 },
  ]
}

function canStackOnSpace(cargo: Cargo, space: FreeSpace): boolean {
  if (!space.supported) return false
  if (space.supportKind === 'floor') return true
  if (!space.supportLoadBearing) return false
  return true
}

function maxAllowedDepth(cargo: Cargo): number {
  if (!cargo.stackable || !cargo.loadBearing) return 1
  const configured = Number.isFinite(cargo.maxStackLayers)
    ? Math.floor(cargo.maxStackLayers)
    : 0
  return configured > 0 ? configured : Number.MAX_SAFE_INTEGER
}

function boxesOverlap(
  a: { x: number; y: number; z: number; length: number; width: number; height: number },
  b: { x: number; y: number; z: number; length: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.length - EPS &&
    a.x + a.length > b.x + EPS &&
    a.y < b.y + b.width - EPS &&
    a.y + a.width > b.y + EPS &&
    a.z < b.z + b.height - EPS &&
    a.z + a.height > b.z + EPS
  )
}

function fitsContainer(
  x: number,
  y: number,
  z: number,
  o: Orientation,
  container: Container,
) {
  return (
    x >= -EPS &&
    y >= -EPS &&
    z >= -EPS &&
    x + o.length <= container.length + EPS &&
    y + o.width <= container.width + EPS &&
    z + o.height <= container.height + EPS
  )
}

function splitSpace(
  space: FreeSpace,
  placed: {
    x: number
    y: number
    z: number
    length: number
    width: number
    height: number
  },
  supportTop: boolean,
  cargo: Cargo,
  placedId: string,
): FreeSpace[] {
  const result: FreeSpace[] = []
  const x2 = space.x + space.length
  const y2 = space.y + space.width
  const ux = placed.x + placed.length
  const uy = placed.y + placed.width

  const push = (
    x: number,
    y: number,
    z: number,
    length: number,
    width: number,
    height: number,
    supported: boolean,
    overrides: Partial<FreeSpace> = {},
  ) => {
    if (length <= EPS || width <= EPS || height <= EPS) return
    result.push({
      x,
      y,
      z,
      length,
      width,
      height,
      supported,
      supportKind: space.supportKind,
      supportCargoId: space.supportCargoId,
      supportCargoTemplateId: space.supportCargoTemplateId,
      supportCargoType: space.supportCargoType,
      supportLoadBearing: space.supportLoadBearing,
      supportMaxLoadOnTop: space.supportMaxLoadOnTop,
      stackDepth: space.stackDepth,
      ...overrides,
    })
  }

  push(space.x, space.y, space.z, placed.x - space.x, space.width, space.height, space.supported)
  push(ux, space.y, space.z, x2 - ux, space.width, space.height, space.supported)
  push(placed.x, space.y, space.z, placed.length, placed.y - space.y, space.height, space.supported)
  push(placed.x, uy, space.z, placed.length, y2 - uy, space.height, space.supported)

  if (supportTop) {
    push(
      placed.x,
      placed.y,
      placed.z + placed.height,
      placed.length,
      placed.width,
      space.z + space.height - (placed.z + placed.height),
      true,
      {
        supportKind: 'cargo',
        supportCargoId: placedId,
        supportCargoTemplateId: cargo.id,
        supportCargoType: cargo.type,
        supportLoadBearing: true,
        supportMaxLoadOnTop: Number.isFinite(cargo.maxLoadOnTop) ? cargo.maxLoadOnTop : 0,
        stackDepth: space.stackDepth + 1,
      },
    )
  }

  return result
}

function pruneSpaces(spaces: FreeSpace[]) {
  const valid = spaces.filter(
    (s) => s.length > EPS && s.width > EPS && s.height > EPS && s.supported,
  )

  const unique: FreeSpace[] = []
  for (const s of valid) {
    const duplicate = unique.some(
      (q) =>
        Math.abs(q.x - s.x) <= EPS &&
        Math.abs(q.y - s.y) <= EPS &&
        Math.abs(q.z - s.z) <= EPS &&
        Math.abs(q.length - s.length) <= EPS &&
        Math.abs(q.width - s.width) <= EPS &&
        Math.abs(q.height - s.height) <= EPS &&
        q.supportCargoId === s.supportCargoId,
    )
    if (!duplicate) unique.push(s)
  }

  return unique.filter(
    (s, i, all) =>
      !all.some(
        (q, j) =>
          i !== j &&
          q.supportCargoId === s.supportCargoId &&
          q.x <= s.x + EPS &&
          q.y <= s.y + EPS &&
          q.z <= s.z + EPS &&
          q.x + q.length >= s.x + s.length - EPS &&
          q.y + q.width >= s.y + s.width - EPS &&
          q.z + q.height >= s.z + s.height - EPS,
      ),
  )
}

function supportLoadFits(space: FreeSpace, cargo: Cargo, supportLoads: Map<string, number>) {
  if (space.supportKind !== 'cargo' || !space.supportCargoId) return true
  const limit = Number.isFinite(space.supportMaxLoadOnTop) ? space.supportMaxLoadOnTop ?? 0 : 0
  if (limit <= 0) return true
  const used = supportLoads.get(space.supportCargoId) ?? 0
  return used + cargo.weight <= limit + EPS
}

function candidateScore(
  space: FreeSpace,
  orientation: Orientation,
  cargo: Cargo,
  container: Container,
  current: PlacedCargo[],
  x: number,
  y: number,
) {
  const cx = x + orientation.length / 2
  const cy = y + orientation.width / 2
  const targetX = container.length / 2
  const targetY = container.width / 2
  const centerDistance = Math.hypot(cx - targetX, cy - targetY)
  const left = Math.max(0, space.length - orientation.length)
  const right = Math.max(0, space.width - orientation.width)
  const heightWaste = Math.max(0, space.height - orientation.height)

  let supportPriority = 0
  if (
    cargo.type !== 'pallet' &&
    space.supportKind === 'cargo' &&
    space.supportCargoType === 'pallet' &&
    space.supportLoadBearing
  ) {
    supportPriority = -100000000
  }

  if (cargo.type === 'pallet' && cargo.loadBearing) {
    if (space.supportKind !== 'floor') return Number.POSITIVE_INFINITY
    supportPriority -= 20000000
  }

  let cgPenalty = 0
  const currentWeight = current.reduce((sum, p) => sum + p.weight, 0)
  if (currentWeight > 0) {
    const candidateWeight = cargo.weight
    const total = currentWeight + candidateWeight
    const currentCx =
      current.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weight, 0) / currentWeight
    const currentCy =
      current.reduce((sum, p) => sum + (p.y + p.width / 2) * p.weight, 0) / currentWeight
    const nextCx = (currentCx * currentWeight + cx * candidateWeight) / total
    const nextCy = (currentCy * currentWeight + cy * candidateWeight) / total
    cgPenalty = Math.hypot(nextCx - targetX, nextCy - targetY) * 0.12
  }

  return (
    supportPriority +
    left * 0.05 +
    right * 0.05 +
    heightWaste * 0.01 +
    centerDistance * 0.8 +
    space.z * 0.03 +
    cgPenalty
  )
}

function findCandidate(
  spaces: FreeSpace[],
  cargo: Cargo,
  container: Container,
  current: PlacedCargo[],
  supportLoads: Map<string, number>,
): Candidate | undefined {
  let best: Candidate | undefined
  const maxDepth = maxAllowedDepth(cargo)

  for (const space of spaces) {
    if (!canStackOnSpace(cargo, space)) continue
    if (
      space.supportKind === 'cargo' &&
      space.supportCargoTemplateId === cargo.id &&
      space.stackDepth >= maxDepth
    ) {
      continue
    }
    if (!supportLoadFits(space, cargo, supportLoads)) continue

    for (const orientation of orientations(cargo)) {
      if (
        orientation.length > space.length + EPS ||
        orientation.width > space.width + EPS ||
        orientation.height > space.height + EPS
      ) {
        continue
      }

      // Corner candidates preserve usable rectangles. Centering every box
      // inside every free rectangle fragments space and caused under-loading.
      const xCandidates = [
        space.x,
        space.x + Math.max(0, space.length - orientation.length),
        space.x + Math.max(0, (space.length - orientation.length) / 2),
      ]
      const yCandidates = [
        space.y,
        space.y + Math.max(0, space.width - orientation.width),
        space.y + Math.max(0, (space.width - orientation.width) / 2),
      ]

      for (const x of [...new Set(xCandidates)]) {
        for (const y of [...new Set(yCandidates)]) {
          const z = space.z
          if (!fitsContainer(x, y, z, orientation, container)) continue

          const p = {
            x,
            y,
            z,
            length: orientation.length,
            width: orientation.width,
            height: orientation.height,
          }

          if (current.some((q) => boxesOverlap(p, q))) continue

          const score = candidateScore(space, orientation, cargo, container, current, x, y)
          if (!Number.isFinite(score)) continue
          if (!best || score < best.score) best = { space, orientation, score, x, y, z }
        }
      }
    }
  }

  return best
}

function cargoGroups(cargo: Cargo[]) {
  const map = new Map<string, { cargo: Cargo; quantity: number }>()
  for (const c of cargo) {
    const quantity = Math.max(0, Math.floor(c.quantity))
    if (!quantity || c.length <= 0 || c.width <= 0 || c.height <= 0) continue

    const key = [
      c.id,
      c.length,
      c.width,
      c.height,
      c.weight,
      c.stackable,
      c.loadBearing,
      c.rotatable,
      c.maxStackLayers,
      c.maxLoadOnTop,
      c.breakablePallet,
    ].join('|')

    const existing = map.get(key)
    if (existing) existing.quantity += quantity
    else map.set(key, { cargo: c, quantity })
  }

  return [...map.values()].sort((a, b) => {
    const aBase = a.cargo.type === 'pallet' && a.cargo.loadBearing ? 1 : 0
    const bBase = b.cargo.type === 'pallet' && b.cargo.loadBearing ? 1 : 0
    if (aBase !== bBase) return bBase - aBase
    const av = a.cargo.length * a.cargo.width * a.cargo.height
    const bv = b.cargo.length * b.cargo.width * b.cargo.height
    return bv - av
  })
}

function makePlaced(
  cargo: Cargo,
  index: number,
  orientation: Orientation,
  x: number,
  y: number,
  z: number,
): PlacedCargo {
  return {
    id: `${cargo.id}-${index + 1}`,
    cargoId: cargo.id,
    cargoType: cargo.type,
    x,
    y,
    z,
    length: orientation.length,
    width: orientation.width,
    height: orientation.height,
    weight: cargo.weight,
    color: cargo.color,
    rotation: orientation.rotation,
    placementMode: 'automatic',
    locked: false,
  }
}

function bestFloorPalletLayout(cargo: Cargo, quantity: number, container: Container) {
  let best:
    | { orientation: Orientation; cols: number; rows: number; capacity: number }
    | undefined

  for (const orientation of orientations(cargo)) {
    const cols = Math.floor((container.length + EPS) / orientation.length)
    const rows = Math.floor((container.width + EPS) / orientation.width)
    if (cols <= 0 || rows <= 0) continue
    const capacity = cols * rows
    if (!best || capacity > best.capacity) best = { orientation, cols, rows, capacity }
  }

  if (!best) return undefined

  const take = Math.min(quantity, best.capacity)
  const usedLength = best.cols * best.orientation.length
  const usedWidth = best.rows * best.orientation.width
  const startX = Math.max(0, (container.length - usedLength) / 2)
  const startY = Math.max(0, (container.width - usedWidth) / 2)

  return { ...best, take, startX, startY }
}

function centerLayout(items: PlacedCargo[], container: Container) {
  if (!items.length) return items
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const p of items) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + p.length)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + p.width)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return items
  }

  const shiftX = (container.length - (maxX - minX)) / 2 - minX
  const shiftY = (container.width - (maxY - minY)) / 2 - minY
  const shifted = items.map((p) => ({ ...p, x: p.x + shiftX, y: p.y + shiftY }))

  const valid = shifted.every(
    (p) =>
      p.x >= -EPS &&
      p.y >= -EPS &&
      p.z >= -EPS &&
      p.x + p.length <= container.length + EPS &&
      p.y + p.width <= container.width + EPS &&
      p.z + p.height <= container.height + EPS,
  )

  return valid ? shifted : items
}

function validate(items: PlacedCargo[], container: Container) {
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    if (
      a.x < -EPS ||
      a.y < -EPS ||
      a.z < -EPS ||
      a.x + a.length > container.length + EPS ||
      a.y + a.width > container.width + EPS ||
      a.z + a.height > container.height + EPS
    ) {
      return false
    }
    for (let j = i + 1; j < items.length; j++) if (boxesOverlap(a, items[j])) return false
  }
  return true
}

export async function packLaff(
  cargo: Cargo[],
  container: Container,
  progress?: Progress,
  options: Options = {},
) {
  const groups = cargoGroups(cargo)
  const total = groups.reduce((sum, group) => sum + group.quantity, 0)
  if (!total) {
    progress?.(100)
    return []
  }

  const H = Math.max(0, container.height)
  let done = 0
  let sequence = 0
  const result: PlacedCargo[] = []
  const supportLoads = new Map<string, number>()
  let spaces: FreeSpace[] = [
    {
      x: 0,
      y: 0,
      z: 0,
      length: container.length,
      width: container.width,
      height: H,
      supported: true,
      supportKind: 'floor',
      stackDepth: 0,
    },
  ]

  for (const group of groups) {
    abort(options.signal)
    const cargoItem = group.cargo
    let remaining = group.quantity
    const floorOnlyPallet = cargoItem.type === 'pallet' && cargoItem.loadBearing

    // Load-bearing pallets are the foundation of a mixed load. Put the first
    // layer on the real container floor as a centered grid before cartons or
    // crates are considered. They are never stacked on another pallet.
    if (floorOnlyPallet && remaining > 0) {
      const layout = bestFloorPalletLayout(cargoItem, remaining, container)
      if (layout) {
        for (let i = 0; i < layout.take; i++) {
          abort(options.signal)
          const row = Math.floor(i / layout.cols)
          const col = i % layout.cols
          const pallet = makePlaced(
            cargoItem,
            sequence++,
            layout.orientation,
            layout.startX + col * layout.orientation.length,
            layout.startY + row * layout.orientation.width,
            0,
          )

          if (
            !fitsContainer(pallet.x, pallet.y, pallet.z, layout.orientation, container) ||
            result.some((q) => boxesOverlap(pallet, q))
          ) {
            continue
          }

          const supportSpace = spaces.find(
            (s) =>
              s.supportKind === 'floor' &&
              s.z <= EPS &&
              pallet.x >= s.x - EPS &&
              pallet.y >= s.y - EPS &&
              pallet.x + pallet.length <= s.x + s.length + EPS &&
              pallet.y + pallet.width <= s.y + s.width + EPS,
          )
          if (!supportSpace) continue

          result.push(pallet)
          spaces = pruneSpaces([
            ...spaces.filter((s) => s !== supportSpace),
            ...splitSpace(supportSpace, pallet, true, cargoItem, pallet.id),
          ])
          remaining -= 1
          done += 1
          progress?.(Math.min(99, Math.round((done / total) * 100)))
          if ((done & 7) === 0) await yieldBrowser()
        }
      }
    }

    while (remaining > 0) {
      abort(options.signal)
      const candidateSpaces = floorOnlyPallet
        ? spaces.filter((s) => s.supportKind === 'floor' && s.z <= EPS)
        : spaces

      const candidate = findCandidate(
        candidateSpaces,
        cargoItem,
        container,
        result,
        supportLoads,
      )
      if (!candidate) break

      const placed = makePlaced(
        cargoItem,
        sequence++,
        candidate.orientation,
        candidate.x,
        candidate.y,
        candidate.z,
      )

      if (
        !fitsContainer(placed.x, placed.y, placed.z, candidate.orientation, container) ||
        result.some((q) => boxesOverlap(placed, q))
      ) {
        break
      }

      result.push(placed)
      if (candidate.space.supportKind === 'cargo' && candidate.space.supportCargoId) {
        const id = candidate.space.supportCargoId
        supportLoads.set(id, (supportLoads.get(id) ?? 0) + cargoItem.weight)
      }

      const createsTopSupport =
        (cargoItem.type === 'pallet' && cargoItem.loadBearing) ||
        (cargoItem.stackable && cargoItem.loadBearing)

      spaces = pruneSpaces([
        ...spaces.filter((s) => s !== candidate.space),
        ...splitSpace(candidate.space, placed, createsTopSupport, cargoItem, placed.id),
      ])

      remaining -= 1
      done += 1
      progress?.(Math.min(99, Math.round((done / total) * 100)))
      if ((done & 7) === 0) await yieldBrowser()
    }

    await yieldBrowser()
  }

  const centered = centerLayout(result, container)
  if (validate(centered, container)) {
    progress?.(100)
    return centered
  }

  const safe: PlacedCargo[] = []
  for (const item of centered) {
    if (
      item.x < -EPS ||
      item.y < -EPS ||
      item.z < -EPS ||
      item.x + item.length > container.length + EPS ||
      item.y + item.width > container.width + EPS ||
      item.z + item.height > container.height + EPS
    ) continue
    if (!safe.some((q) => boxesOverlap(item, q))) safe.push(item)
  }

  progress?.(100)
  return safe
}
