import type { Cargo, Container, PlacedCargo } from '../types'

const EPS = 0.5

type Progress = (percent: number) => void
type Options = { signal?: AbortSignal }
type Orientation = { length: number; width: number; height: number; rotation: 0 | 90 }
type FreeSpace = { x: number; y: number; z: number; length: number; width: number; height: number }
type Group = { cargo: Cargo; quantity: number; startIndex: number }

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
  let n = Math.floor(containerHeight / o.height)
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

function splitSpace(s: FreeSpace, used: { length: number; width: number; height: number }): FreeSpace[] {
  const out: FreeSpace[] = []
  const x = s.x, y = s.y, z = s.z
  if (s.length - used.length > EPS) out.push({ x: x + used.length, y, z, length: s.length - used.length, width: s.width, height: used.height })
  if (s.width - used.width > EPS) out.push({ x, y: y + used.width, z, length: used.length, width: s.width - used.width, height: used.height })
  if (s.height - used.height > EPS) out.push({ x, y, z: z + used.height, length: s.length, width: s.width, height: s.height - used.height })
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
  const waste = (s.length * s.width * s.height) - (o.length * o.width * o.height)
  const fit = Math.min(s.length - o.length, s.width - o.width, s.height - o.height)
  return centerPenalty + waste * 0.00001 + Math.max(0, fit) * 0.02
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
    else groups.set(key, { cargo: c, quantity, startIndex: 0 })
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
 * Batch LAFF-style packer. It works on rectangular free spaces instead of
 * testing every new box against every already placed box. This is deliberately
 * heuristic: speed and stable, supportable layers are preferred over brute force.
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
      const batchCols = Math.min(cols, Math.max(1, Math.ceil(Math.sqrt(take * cols / Math.max(1, rows)))))
      const batchRows = Math.min(rows, Math.ceil(take / batchCols))
      const usedCols = Math.min(cols, batchCols)
      const usedRows = Math.min(rows, batchRows)
      const perLayer = usedCols * usedRows
      const takeLayers = Math.ceil(take / perLayer)
      const usedHeight = Math.min(space.height, takeLayers * orientation.height)
      const usedLength = usedCols * orientation.length
      const usedWidth = usedRows * orientation.width
      const ox = space.x + Math.max(0, (space.length - usedLength) / 2)
      const oy = space.y + Math.max(0, (space.width - usedWidth) / 2)

      const used = { length: usedLength, width: usedWidth, height: usedHeight }
      spaces = pruneSpaces([...spaces.filter(s => s !== space), ...splitSpace(space, used)])

      let placedHere = 0
      for (let layer = 0; layer < takeLayers && placedHere < take; layer++) {
        const z = space.z + layer * orientation.height
        for (let row = 0; row < usedRows && placedHere < take; row++) {
          for (let col = 0; col < usedCols && placedHere < take; col++) {
            abort(options.signal)
            result.push(makePlaced(c, sequence++, orientation, ox + col * orientation.length, oy + row * orientation.width, z))
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
