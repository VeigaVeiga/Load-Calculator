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

// Vertical capacity is always based on the usable INTERNAL container height.
// doorHeight describes the opening and must never cap normal stacking.
function maxLayers(c: Cargo, o: Orientation, remainingHeight: number) {
  if (remainingHeight + EPS < o.height) return 0
  let n = Math.floor((remainingHeight + EPS) / o.height)

  // Only stackable + load-bearing cargo may use more than one layer.
  if (!c.stackable || !c.loadBearing) n = Math.min(n, 1)

  // 0 / blank means unlimited by user setting.
  const configured = Number.isFinite(c.maxStackLayers) ? Math.floor(c.maxStackLayers) : 0
  if (configured > 0) n = Math.min(n, configured)

  const topLoad = Number.isFinite(c.maxLoadOnTop) ? c.maxLoadOnTop : 0
  if (c.stackable && c.loadBearing && topLoad > 0 && c.weight > 0) {
    n = Math.min(n, Math.floor(topLoad / c.weight) + 1)
  }

  return Math.max(1, n)
}

function fits(s: FreeSpace, o: Orientation) {
  return o.length <= s.length + EPS && o.width <= s.width + EPS && o.height <= s.height + EPS
}

function splitCenteredSpace(s: FreeSpace, used: { x: number; y: number; length: number; width: number; height: number }): FreeSpace[] {
  const out: FreeSpace[] = []
  const sx2 = s.x + s.length
  const sy2 = s.y + s.width
  const ux2 = used.x + used.length
  const uy2 = used.y + used.width
  const push = (x: number, y: number, z: number, length: number, width: number, height: number) => {
    if (length > EPS && width > EPS && height > EPS) out.push({ x, y, z, length, width, height })
  }
  push(s.x, s.y, s.z, used.x - s.x, s.width, used.height)
  push(ux2, s.y, s.z, sx2 - ux2, s.width, used.height)
  push(used.x, s.y, s.z, used.length, used.y - s.y, used.height)
  push(used.x, uy2, s.z, used.length, sy2 - uy2, used.height)
  push(used.x, used.y, s.z + used.height, used.length, used.width, s.height - used.height)
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
  const remL = s.length - o.length * Math.floor((s.length + EPS) / o.length)
  const remW = s.width - o.width * Math.floor((s.width + EPS) / o.width)
  const waste = remL * s.width + remW * s.length
  const heightWaste = Math.max(0, s.height - o.height * Math.floor((s.height + EPS) / o.height))
  const zPenalty = s.z * 0.05
  return centerPenalty + waste * 0.08 + heightWaste * 0.03 + zPenalty
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

function centerPackedFootprint(items: PlacedCargo[], container: Container) {
  if (!items.length) return items
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of items) {
    const length = p.rotation % 180 === 90 ? p.width : p.length
    const width = p.rotation % 180 === 90 ? p.length : p.width
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + length)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + width)
  }
  const occupiedL = maxX - minX
  const occupiedW = maxY - minY
  const shiftX = (container.length - occupiedL) / 2 - minX
  const shiftY = (container.width - occupiedW) / 2 - minY
  if (!Number.isFinite(shiftX) || !Number.isFinite(shiftY)) return items
  return items.map(p => ({ ...p, x: p.x + shiftX, y: p.y + shiftY }))
}

export async function packLaff(cargo: Cargo[], container: Container, progress?: Progress, options: Options = {}) {
  const groups = groupBySignature(cargo)
  const total = groups.reduce((n, g) => n + g.quantity, 0)
  let result: PlacedCargo[] = []
  if (!total) { progress?.(100); return result }

  const usableInnerHeight = Math.max(0, container.height)
  let completed = 0
  let spaces: FreeSpace[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: usableInnerHeight }]
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
      const remainingHeight = Math.max(0, usableInnerHeight - space.z)
      const layers = maxLayers(c, orientation, Math.min(space.height, remainingHeight))
      if (layers <= 0) break
      const capacity = cols * rows * layers
      if (capacity <= 0) break

      const take = Math.min(remaining, capacity)
      const perLayer = cols * rows
      const fullLayers = Math.floor(take / perLayer)
      const remainder = take % perLayer
      const usedLayers = fullLayers + (remainder > 0 ? 1 : 0)
      const usedRows = remainder > 0 ? Math.ceil(remainder / cols) : rows
      const usedLength = cols * orientation.length
      const usedWidth = usedRows * orientation.width
      const usedHeight = usedLayers * orientation.height
      const centeredX = space.x + Math.max(0, (space.length - usedLength) / 2)
      const centeredY = space.y + Math.max(0, (space.width - usedWidth) / 2)
      const used = { x: centeredX, y: centeredY, length: usedLength, width: usedWidth, height: usedHeight }
      spaces = pruneSpaces([...spaces.filter(s => s !== space), ...splitCenteredSpace(space, used)])

      let placedHere = 0
      for (let layer = 0; layer < usedLayers && placedHere < take; layer++) {
        const z = space.z + layer * orientation.height
        const countThisLayer = layer < fullLayers ? perLayer : remainder
        if (countThisLayer <= 0) continue
        const rowsThisLayer = layer < fullLayers ? rows : usedRows
        for (let row = 0; row < rowsThisLayer && placedHere < take; row++) {
          const colsThisRow = Math.min(cols, countThisLayer - row * cols)
          if (colsThisRow <= 0) break
          for (let col = 0; col < colsThisRow; col++) {
            abort(options.signal)
            result.push(makePlaced(c, sequence++, orientation, centeredX + col * orientation.length, centeredY + row * orientation.width, z))
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

  result = centerPackedFootprint(result, container)
  progress?.(100)
  return result
}