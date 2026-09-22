import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'

const S = .001
const GAP_XY = 8
const GAP_Z = 1
const CARTON_GEOMETRY = new RoundedBoxGeometry(1, 1, 1, 2, .035)
// RoundedBoxGeometry has no vertex color attribute by default. Supplying a
// white base color lets InstancedMesh.instanceColor work without multiplying
// against an undefined attribute (the cause of the previous black cartons).
const baseColors = new Float32Array(CARTON_GEOMETRY.getAttribute('position').count * 3)
baseColors.fill(1)
CARTON_GEOMETRY.setAttribute('color', new THREE.Float32BufferAttribute(baseColors, 3))
const OUTLINE_SOURCE = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))

type Props = {
  items: PlacedCargo[]
  container: Container
  onSelect: (id: string) => void
}

export default function InstancedCartons({ items, container, onSelect }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const lineRef = useRef<THREE.LineSegments>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }), [])
  const lineMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: 0x58636b, transparent: true, opacity: 0.82, depthTest: true }), [])
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const axisZ = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const instanceColor = useMemo(() => new THREE.Color(), [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    const lines = lineRef.current
    if (!mesh || !lines) return

    const source = OUTLINE_SOURCE.getAttribute('position')
    const sourceArray = source.array as ArrayLike<number>
    const verticesPerBox = source.count
    const outline = new Float32Array(items.length * verticesPerBox * 3)

    items.forEach((p, i) => {
      const d = dims(p)
      const visualL = Math.max(40, d.length - GAP_XY * 2)
      const visualW = Math.max(40, d.width - GAP_XY * 2)
      const visualH = Math.max(40, p.height - (p.z > 0 ? GAP_Z : 0))
      const x = (p.x + d.length / 2 - container.length / 2) * S
      const y = (p.y + d.width / 2 - container.width / 2) * S
      const z = (p.z + visualH / 2) * S
      position.set(x, y, z)
      quaternion.setFromAxisAngle(axisZ, p.rotation * Math.PI / 180)
      scale.set(visualL * S, visualW * S, visualH * S)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      instanceColor.set(p.color || '#c7c7c7')
      mesh.setColorAt(i, instanceColor)

      for (let v = 0; v < verticesPerBox; v++) {
        const si = v * 3
        const target = (i * verticesPerBox + v) * 3
        position.set(sourceArray[si] ?? 0, sourceArray[si + 1] ?? 0, sourceArray[si + 2] ?? 0).applyMatrix4(matrix)
        outline[target] = position.x
        outline[target + 1] = position.y
        outline[target + 2] = position.z
      }
    })

    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3))
    lineGeometry.computeBoundingSphere()
    lines.visible = items.length > 0
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, container, matrix, position, quaternion, scale, axisZ, instanceColor, lineGeometry])

  if (!items.length) return null

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[CARTON_GEOMETRY, material, items.length]}
        onClick={(e) => {
          e.stopPropagation()
          const index = e.instanceId
          if (index != null && items[index]) onSelect(items[index].id)
        }}
      />
      <lineSegments ref={lineRef} geometry={lineGeometry} material={lineMaterial} raycast={() => null} />
    </>
  )
}
