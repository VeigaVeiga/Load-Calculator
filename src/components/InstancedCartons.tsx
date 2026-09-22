import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Container, PlacedCargo } from '../types'
import { dims } from '../packing/geometry'
import { UNIT_BOX, materialFor } from './CargoModel'

const S = .001
const GAP_XY = 8
const GAP_Z = 8

type Props = {
  items: PlacedCargo[]
  container: Container
  onSelect: (id: string) => void
}

/**
 * GPU-batched renderer for ordinary cartons. Selected/named/special cargo should
 * stay on CargoModel so their editing and detailed visuals remain interactive.
 */
export default function InstancedCartons({ items, container, onSelect }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => materialFor('#c7c7c7', .62), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const position = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    items.forEach((p, i) => {
      const d = dims(p)
      const l = Math.max(40, d.length - GAP_XY * 2) * S
      const w = Math.max(40, d.width - GAP_XY * 2) * S
      const zg = p.z > 0 ? Math.min(GAP_Z, Math.max(0, p.height - 20)) : 0
      const h = Math.max(40, p.height - zg) * S
      const x = (p.x + d.length / 2 - container.length / 2) * S
      const y = (p.y + d.width / 2 - container.width / 2) * S
      const z = (p.z + (p.height - zg) / 2 + zg) * S
      position.set(x, y, z)
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rotation * Math.PI / 180)
      scale.set(l, w, h)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, container, matrix, position, quaternion, scale])

  if (!items.length) return null

  return <instancedMesh ref={meshRef} args={[UNIT_BOX, material, items.length]} onClick={e => {
    e.stopPropagation()
    const index = e.instanceId
    if (index != null && items[index]) onSelect(items[index].id)
  }} />
}
