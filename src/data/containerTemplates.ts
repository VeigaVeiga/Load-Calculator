import type { Container, LashingPoint } from '../types'

// Lashing rings are placed directly on the inner face line of the side rails.
// The visual rail centerline is width/2 + rail/2, while the ring center is
// exactly width/2, so the ring sits against the rail without entering cargo space.
function points(length: number, width: number, height: number): LashingPoint[] {
  const out: LashingPoint[] = []
  const count = Math.max(5, Math.round(length / 1200))
  const topZ = Math.max(80, height - 28)
  const bottomZ = 42
  for (let i = 0; i < count; i += 1) {
    const x = count === 1
      ? Math.round(length / 2)
      : Math.round(120 + i * (length - 240) / (count - 1))
    out.push({ id: `LB${i + 1}`, x, y: 0, z: bottomZ, type: 'side', maxLoad: 1000 })
    out.push({ id: `RB${i + 1}`, x, y: width, z: bottomZ, type: 'side', maxLoad: 1000 })
    out.push({ id: `LT${i + 1}`, x, y: 0, z: topZ, type: 'side', maxLoad: 1000 })
    out.push({ id: `RT${i + 1}`, x, y: width, z: topZ, type: 'side', maxLoad: 1000 })
  }
  return out
}

export const containerTemplates: Container[] = [
  { id: '20GP', name: '20GP', length: 5898, width: 2352, height: 2390, outerLength: 6058, outerWidth: 2438, outerHeight: 2591, floorThickness: 28, wallThickness: 43, roofThickness: 35, doorWidth: 2340, doorHeight: 2280, doorFrameDepth: 90, maxPayload: 28200, lashingPoints: points(5898, 2352, 2390) },
  { id: '40GP', name: '40GP', length: 12032, width: 2352, height: 2390, outerLength: 12192, outerWidth: 2438, outerHeight: 2591, floorThickness: 28, wallThickness: 43, roofThickness: 35, doorWidth: 2340, doorHeight: 2280, doorFrameDepth: 90, maxPayload: 26700, lashingPoints: points(12032, 2352, 2390) },
  { id: '40HQ', name: '40HQ', length: 12032, width: 2352, height: 2698, outerLength: 12192, outerWidth: 2438, outerHeight: 2896, floorThickness: 28, wallThickness: 43, roofThickness: 35, doorWidth: 2340, doorHeight: 2585, doorFrameDepth: 90, maxPayload: 26700, lashingPoints: points(12032, 2352, 2698) },
]
