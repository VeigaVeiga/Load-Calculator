import type { Cargo, Container, PlacedCargo } from '../types'

const EPS = 0.5

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }
type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type FreeSpace = { x: number; y: number; z: number; length: number; width: number; height: number }
type Group = { cargo: Cargo; quantity: number }

const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Packing cancelled', 'AbortError')
}

const yieldBrowser = () => new Promise<void>(resolve => {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) window.requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

function orientations(c: Cargo): Orientation[] {
  const a: Orientation = { length: c.length, width: c.width, height: c.height, rotation: 0 }
  if (!c.rotatable || Math.abs(c.length - c.width) < EPS) return [a]
  return [a, { length: c.width, width: c.length, height: c.height, rotation: 90 }]
}

function maxLayers(c: Cargo, o: Orientation, containerHeight: number) {
  let n = Math.floor((containerHeight + EPS) / o.height)
  if (!c.stackable) n = Math.min(n, 1)
  const configured = Math.floor(c.maxStackLayers || 0)
  if (configured > 0) n = Math.min(n, configured)
  if (c.maxLoadOnTop > 0 && Number.isFinite(c.maxLoadOnTop) && c.weight > 0) {
    n = Math.min(n, Math.floor(c.maxLoadOnTop / c.weight) + 1)
  }
  return Math.max(1, n)
}

function fits(s: FreeSpace, o: Orientation) {
  return o.length <= s.length + EPS && o.width <= s.width + EPS && o.height <= s.height + EPS
}

// The occupied block starts at the free-space origin. This is important:
// centering a batch while splitting from the origin creates phantom free space
// and can cause the next batch to overlap it.
function splitSpace(s: FreeSpace, used: { length: number; width: number; height: number }): FreeSpace[] {
  const out: FreeSpace[] = []
  if (s.length - used.length > EPS) out.push({ x: s.x + used.length, y: s.y, z: s.z, length: s.length - used.length, width: s.width, height: used.height })
  if (s.width - used.width > EPS) out.push({ x: s.x, y: s.y + used.width, z: s.z, length: used.length, width: s.width - used.width, height: used.height })
  if (s.height - used.height > EPS) out.push({ x: s.x, y: s.y, z: s.z + used.height, length: s.length, width: s.width, height: s.height - used.height })
  return out
}

function pruneSpaces(spaces: FreeSpace[]) {
  const valid = spaces.filter(s => s.length > EPS && s.width > EPS && s.height > EPS)
  return valid.filter((s, i) => !valid.some((q, j) => i !== j && q.x <= s.x + EPS && q.y <= s.y + EPS && q.z <= s.z + EPS && q.x + q.length >= s.x + s.length - EPS && q.y + q.width >= s.y + s.width - EPS && q.z + q.height >= s.z + s.height - EPS))
}

function scoreSpace(s: FreeSpace, o: Orientation, c: Container) {
  const cx = s.x + s.length / 2, cy = s.y + s.width / 2
  const dx = cx - c.length / 2, dy = cy - c.width / 2
  const centerPenalty = Math.hypot(dx, dy) * 0.35
  // Prefer spaces that can take a complete row/column/layer. This gives a
  // compact floor plan and avoids the previous pyramid-like fragmentation.
  const remL = s.length - o.length * Math.floor((s.length + EPS) / o.length)
  const remW = s.width - o.width * Math.floor((s.width + EPS) / o.width)
  const waste = remL * s.width + remW * s.length
  const heightWaste = Math.max(0, s.height - o.height * Math.floor((s.height + EPS) / o.height))
  return centerPenalty + waste * 0.08 + heightWaste * 0.03
}

function choosePlacement(spaces: FreeSpace[], cargo: Cargo, c: Container) {
  let best: { space: FreeSpace; orientation: Orientation; score: number } | undefined
  for (const s of spaces) for (const o of orientations(cargo)) {
    if (!fits(s, o)) continue
    const score = scoreSpace(s, o, c)
    if (!best || score < best.score) best = { space: s, orientation: o, score }
  }
  return best
}

function groupBySignature(cargo: Cargo[]): Group[] {
  const groups = new Map<string, Group>()
  for (const c of cargo) {
    const quantity = Math.max(0, Math.floor(c.quantity))
    if (!quantity || c.length <= 0 || c.width <= 0 || c.height <= 0) continue
    const key = `${c.length}|${c.width}|${c.height}|${c.weight}|${c.stackable}|${c.loadBearing}|${c.rotatable}|${c.maxStackLayers}|${c.maxLoadOnTop}|${c.breakablePallet}`
    const existing = groups.get(key)
    if (existing) existing.quantity += quantity
    else groups.set(key, { cargo: c, quantity })
  }
  return [...groups.values()].sort((a, b) => {
    const aa = a.cargo.length * a.cargo.width, bb = b.cargo.length * b.cargo.width
    return bb - aa || (b.cargo.length * b.cargo.width * b.cargo.height) - (a.cargo.length * a.cargo.width * a.cargo.height)
  })
}

function makePlaced(c: Cargo, index: number, o: Orientation, x: number, y: number, z: number): PlacedCargo {
  return { id: `${c.id}-${index + 1}`, cargoId: c.id, cargoType: c.type, x, y, z, length: c.length, width: c.width, height: o.height, weight: c.weight, color: c.color, rotation: o.rotation, placementMode: 'automatic', locked: false }
}

/**
 * Batch LAFF/free-space packer.
 *
 * Important correctness rules:
 * - a batch always occupies the exact free-space origin that is subsequently
 *   split, so batches cannot overlap one another;
 * - full columns/rows are consumed before a partial final row, maximizing fill;
 * - no arbitrary centering of a partial batch is used, avoiding large phantom
 *   gaps caused by the old centered-batch implementation;
 * - unlimited stacking means the physical container height is the limit when
 *   maxStackLayers is empty/zero.
 */
export async function packLaff(cargo: Cargo[], container: Container, progress?: Progress, options: Options = {}) {
  const groups = groupBySignature(cargo)
  const total = groups.reduce((n, g) => n + g.quantity, 0)
  const result: PlacedCargo[] = []
  if (!total) { progress?.(100); return result }

  let completed = 0
  let spaces: FreeSpace[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }]
  let sequence = 0

  for (const group of groups) {
    abort(options.signal)
    let remaining = group.quantity
    const c = group.cargo

    while (remaining > 0) {
      abort(options.signal)
      const choice = choosePlacement(spaces, c, container)
      if (!choice) break
      const { space, orientation } = choice
      const cols = Math.floor((space.length + EPS) / orientation.length)
      const rows = Math.floor((space.width + EPS) / orientation.width)
      const layers = maxLayers(c, orientation, space.height)
      const capacity = cols * rows * layers
      if (capacity <= 0) break

      const take = Math.min(remaining, capacity)

      // Fill complete columns and rows first. Only the final row/layer is
      // partial, so a 600-box load stays compact instead of forming a pyramid.
      const perLayer = cols * rows
      const fullLayers = Math.floor(take / perLayer)
      const remainder = take % perLayer
      const usedLayers = fullLayers + (remainder > 0 ? 1 : 0)
      const usedRows = remainder > 0 ? Math.ceil(remainder / cols) : rows
      const usedCols = cols
      const usedHeight = usedLayers * orientation.height
      const usedLength = usedCols * orientation.length
      const usedWidth = usedRows * orientation.width

      const used = { length: usedLength, width: usedWidth, height: usedHeight }
      spaces = pruneSpaces([...spaces.filter(s => s !== space), ...splitSpace(space, used)])

      let placedHere = 0
      for (let layer = 0; layer < usedLayers && placedHere < take; layer++) {
        const z = space.z + layer * orientation.height
        const rowLimit = layer < fullLayers ? rows : usedRows
        for (let row = 0; row < rowLimit && placedHere < take; row++) {
          const colLimit = (layer === fullLayers && remainder > 0 && row === rowLimit - 1) ? Math.min(cols, remainder - row * cols) : cols
          for (let col = 0; col < colLimit && placedHere < take; col++) {
            abort(options.signal)
            result.push(makePlaced(c, sequence++, orientation, space.x + col * orientation.length, space.y + row * orientation.width, z))
            placedHere++
            completed++
            progress?.(Math.min(99, Math.round(completed / total * 100)))
          }
        }
        if ((completed & 31) === 0) await yieldBrowser()
      }

      remaining -= placedHere
      if (!placedHere) break
      await yieldBrowser()
    }
  }

  progress?.(100)
  return result
}
