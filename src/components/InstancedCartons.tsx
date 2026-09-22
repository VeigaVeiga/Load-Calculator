import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { materialFor } from './CargoModel'

const S = .001
const GAP_XY = 8
const GAP_Z = 1

const CARTON_GEOMETRY = new RoundedBoxGeometry(1, 1, 1, 2, .035)

type Props = {
  items: PlacedCargo[]
  container: Container
  onSelect: (id: string) => void
}

/** GPU-batched renderer for ordinary cartons. */
export default function InstancedCartons({ items, container, onSelect }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => {
    const m = materialFor('#ffffff', .62)
    m.vertexColors = true
    m.needsUpdate = true
    return m
  }, [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const axisZ = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const instanceColor = useMemo(() => new THREE.Color(), [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    items.forEach((p, i) => {
      const d = dims(p)
      const l = Math.max(40, p.length - GAP_XY * 2) * S
      const w = Math.max(40, p.width - GAP_XY * 2) * S
      const visualH = Math.max(40, p.height - (p.z > 0 ? GAP_Z : 0))
      const x = (p.x + d.length / 2 - container.length / 2) * S
      const y = (p.y + d.width / 2 - container.width / 2) * S
      const z = (p.z + visualH / 2) * S

      position.set(x, y, z)
      quaternion.setFromAxisAngle(axisZ, p.rotation * Math.PI / 180)
      // Keep the unrotated dimensions here. Rotation is applied exactly once by the quaternion.
      scale.set(l, w, visualH * S)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)

      instanceColor.set(p.color || '#c7c7c7')
      mesh.setColorAt(i, instanceColor)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, container, matrix, position, quaternion, scale, axisZ, instanceColor])

  if (!items.length) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[CARTON_GEOMETRY, material, items.length]}
      onClick={(e) => {
        e.stopPropagation()
        const index = e.instanceId
        if (index != null && items[index]) onSelect(items[index].id)
      }}
    />
  )
}
