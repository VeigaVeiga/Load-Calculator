import type { Container, PlacedCargo } from '../types'
import { dims, bounds } from './geometry'

const EPS = 0.5

export function fitsContainer(p: PlacedCargo, c: Container) {
  const d = dims(p)
  return (
    p.x >= -EPS &&
    p.y >= -EPS &&
    p.z >= -EPS &&
    p.x + d.length <= c.length + EPS &&
    p.y + d.width <= c.width + EPS &&
    p.z + p.height <= c.height + EPS
  )
}

// Physical collision bodies only. Container hooks/lashing points remain
// visual/attachment nodes and are deliberately not part of this list.
export function collides(p: PlacedCargo, items: PlacedCargo[]) {
  const A = bounds(p)
  return items.some((q) => {
    if (q.id === p.id) return false
    const B = bounds(q)
    return (
      A.x1 < B.x2 - EPS &&
      A.x2 > B.x1 + EPS &&
      A.y1 < B.y2 - EPS &&
      A.y2 > B.y1 + EPS &&
      A.z1 < B.z2 - EPS &&
      A.z2 > B.z1 + EPS
    )
  })
}

export function canPlace(p: PlacedCargo, c: Container, items: PlacedCargo[]) {
  return fitsContainer(p, c) && !collides(p, items)
}
