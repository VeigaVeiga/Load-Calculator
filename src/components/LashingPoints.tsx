import { useState } from 'react'
import * as THREE from 'three'
import type { Container } from '../types'

const S = .001
type Props = { container: Container; selectable?: boolean; allowedIds?: string[]; selectedIds?: string[]; onPointSelect?: (id: string) => void }

function Ring({ top, color }: { top: boolean; color: string }) {
  const localMissing = -58.5 * Math.PI / 180
  const opening = top ? Math.PI / 2 : -Math.PI / 2
  const inPlane = opening - localMissing
  return <group rotation={[Math.PI / 2, 0, 0]}><group rotation={[0, 0, inPlane]}>
    <mesh raycast={() => null}><torusGeometry args={[.035, .009, 8, 18, Math.PI * 1.35]} /><meshStandardMaterial color={color} metalness={.65} roughness={.35} side={THREE.DoubleSide} /></mesh>
  </group></group>
}

export default function LashingPoints({ container, selectable = false, allowedIds = [], selectedIds = [], onPointSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  return <group>
    {container.lashingPoints.map((p) => {
      const x = (p.x - container.length / 2) * S
      const y = (p.y - container.width / 2) * S
      const z = Math.max(.012, p.z * S)
      const isTop = p.z > container.height / 2
      const allowed = selectable && allowedIds.includes(p.id)
      const selected = selectedIds.includes(p.id)
      const color = selected ? '#8dffb0' : allowed && hoveredId === p.id ? '#c5ff62' : allowed ? '#36e879' : '#5d6665'
      return <group key={p.id} position={[x, y, z]}>
        <Ring top={isTop} color={color} />
        {selectable && <mesh
          onPointerOver={e => { e.stopPropagation(); if (allowed) setHoveredId(p.id) }}
          onPointerOut={e => { e.stopPropagation(); setHoveredId(current => current === p.id ? null : current) }}
          onPointerDown={e => { e.stopPropagation(); if (allowed) onPointSelect?.(p.id) }}
        >
          <sphereGeometry args={[.125, 14, 10]} />
          <meshBasicMaterial color={color} transparent opacity={allowed ? (hoveredId === p.id ? .48 : .25) : .008} depthWrite={false} />
        </mesh>}
        {!isTop && <mesh position={[0, 0, -.014]} raycast={() => null}><boxGeometry args={[.055, .012, .025]} /><meshStandardMaterial color="#4f5858" metalness={.5} roughness={.45} /></mesh>}
      </group>
    })}
  </group>
}