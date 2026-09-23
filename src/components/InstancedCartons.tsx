import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Container, PlacedCargo } from '../types'

const S = .001

// The mesh is the exact physical carton size. Do not shrink or inflate it here:
// visual separation is provided by the bevel + outline only.
const CARTON_GEOMETRY = new RoundedBoxGeometry(1, 1, 1, 2, .035)
const baseColors = new Float32Array(CARTON_GEOMETRY.getAttribute('position').count * 3)
baseColors.fill(1)
CARTON_GEOMETRY.setAttribute('color', new THREE.Float32BufferAttribute(baseColors, 3))
const OUTLINE_SOURCE = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))

type Props = {
  items: PlacedCargo[]
  container: Container
  onSelect: (id: string) => void
}

function safeCartonColor(value?: string) {
  if (!value) return '#c7c7c7'
  const color = new THREE.Color(value)
  if (color.r + color.g + color.b < 0.18) return '#c7c7c7'
  return value
}

export default function InstancedCartons({ items, container, onSelect }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const lineRef = useRef<THREE.LineSegments>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }), [])
  const lineMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: 0x59636b, transparent: true, opacity: 0.92, depthTest: true }), [])
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
      // IMPORTANT: the instance is rotated by its quaternion, so its scale
      // must use the unrotated physical dimensions. Using dims(p) here and
      // rotating again caused a 90° cargo to be visually rotated twice.
      const visualL = Math.max(1, p.length)
      const visualW = Math.max(1, p.width)
      const visualH = Math.max(1, p.height)
      const x = (p.x + (p.rotation % 180 === 0 ? p.length : p.width) / 2 - container.length / 2) * S
      const y = (p.y + (p.rotation % 180 === 0 ? p.width : p.length) / 2 - container.width / 2) * S
      const z = (p.z + visualH / 2) * S
      position.set(x, y, z)
      quaternion.setFromAxisAngle(axisZ, p.rotation * Math.PI / 180)
      scale.set(visualL * S, visualW * S, visualH * S)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      instanceColor.set(safeCartonColor(p.color))
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
  }, [items, container.length, container.width, matrix, position, quaternion, scale, axisZ, instanceColor, lineGeometry])

  useMemo(() => () => {
    material.dispose()
    lineMaterial.dispose()
    lineGeometry.dispose()
  }, [material, lineMaterial, lineGeometry])

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
