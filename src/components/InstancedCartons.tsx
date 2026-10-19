import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Container, PlacedCargo } from '../types'

const S = .001
// Plain boxes are enough for a loading planner; avoid rounded-corner subdivisions
// on every instance so large carton sets stay cheap to render.
const CARTON_GEOMETRY = new THREE.BoxGeometry(1, 1, 1)
const baseColors = new Float32Array(CARTON_GEOMETRY.getAttribute('position').count * 3)
baseColors.fill(1)
CARTON_GEOMETRY.setAttribute('color', new THREE.Float32BufferAttribute(baseColors, 3))
const OUTLINE_SOURCE = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))

type Props = { items: PlacedCargo[]; container: Container; onSelect: (id: string) => void; ghost?: boolean }

function safeCartonColor(value?: string) {
  if (!value) return '#c7c7c7'
  const color = new THREE.Color(value)
  if (color.r + color.g + color.b < .18) return '#c7c7c7'
  return value
}

export default function InstancedCartons({ items, container, onSelect, ghost = false }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  // Individual carton outlines help at small counts, but become a large CPU/GPU
  // cost for hundreds of boxes. Hide them above this threshold.
  const showOutlines = items.length <= 120
  const lineRef = useRef<THREE.LineSegments>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false, transparent: ghost, opacity: ghost ? .24 : 1, depthWrite: !ghost }), [ghost])
  const lineMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: 0x59636b, transparent: true, opacity: ghost ? .35 : .92, depthTest: true }), [ghost])
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const axisZ = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const instanceColor = useMemo(() => new THREE.Color(), [])

  useLayoutEffect(() => {
    const mesh = meshRef.current, lines = lineRef.current
    if (!mesh || !lines) return
    const source = OUTLINE_SOURCE.getAttribute('position'), sourceArray = source.array as ArrayLike<number>, verticesPerBox = source.count
    const outline = showOutlines ? new Float32Array(items.length * verticesPerBox * 3) : null

    items.forEach((p, i) => {
      // Scale uses physical, unrotated L/W; the quaternion performs the single
      // 0/90-degree rotation. This avoids the old double-rotation bug.
      const physicalL = Math.max(1, p.length), physicalW = Math.max(1, p.width), physicalH = Math.max(1, p.height)
      const rotated = Math.abs(Math.round(p.rotation / 90)) % 2 === 1
      const dL = rotated ? p.width : p.length, dW = rotated ? p.length : p.width
      position.set((p.x + dL / 2 - container.length / 2) * S, (p.y + dW / 2 - container.width / 2) * S, (p.z + physicalH / 2) * S)
      quaternion.setFromAxisAngle(axisZ, p.rotation * Math.PI / 180)
      scale.set(physicalL * S, physicalW * S, physicalH * S)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      instanceColor.set(safeCartonColor(p.color))
      mesh.setColorAt(i, instanceColor)

      if (outline) {
        for (let v = 0; v < verticesPerBox; v++) {
          const si = v * 3, target = (i * verticesPerBox + v) * 3
          // Expand the wireframe very slightly beyond the box surface. Keeping
          // edges coplanar with the faces causes depth-buffer flicker (z-fighting).
          position.set((sourceArray[si] ?? 0) * 1.001, (sourceArray[si + 1] ?? 0) * 1.001, (sourceArray[si + 2] ?? 0) * 1.001).applyMatrix4(matrix)
          outline[target] = position.x; outline[target + 1] = position.y; outline[target + 2] = position.z
        }
      }
    })

    if (outline) {
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3))
      lineGeometry.computeBoundingSphere()
    } else {
      lineGeometry.deleteAttribute('position')
    }
    lines.visible = showOutlines && items.length > 0
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, container.length, container.width, matrix, position, quaternion, scale, axisZ, instanceColor, lineGeometry, showOutlines])

  if (!items.length) return null
  return <>
    <instancedMesh ref={meshRef} args={[CARTON_GEOMETRY, material, items.length]} onClick={e => { e.stopPropagation(); const index = e.instanceId; if (index != null && items[index]) onSelect(items[index].id) }} />
    <lineSegments ref={lineRef} geometry={lineGeometry} material={lineMaterial} raycast={() => null} />
  </>
}
