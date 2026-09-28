import * as THREE from 'three'
import type { Container } from '../types'

const S = .001

// TorusGeometry is created in the XY plane and its open side is centred at
// about -58.5 degrees.  Rotate the ring inside that plane first, then rotate
// the whole ring plane upright.  This keeps the U opening exactly vertical.
function Ring({ top }: { top: boolean }) {
  const localMissing = -58.5 * Math.PI / 180
  const opening = top ? -Math.PI / 2 : Math.PI / 2
  const inPlane = opening - localMissing
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[0, 0, inPlane]}>
        <mesh raycast={() => null}>
          <torusGeometry args={[.035, .009, 8, 18, Math.PI * 1.35]} />
          <meshStandardMaterial color="#5d6665" metalness={.65} roughness={.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

export default function LashingPoints({ container }: { container: Container }) {
  return (
    <group>
      {container.lashingPoints.map((p) => {
        const x = (p.x - container.length / 2) * S
        const y = (p.y - container.width / 2) * S
        const z = Math.max(.012, p.z * S)
        const isTop = p.z > container.height / 2
        return (
          <group key={p.id} position={[x, y, z]} raycast={() => null}>
            <Ring top={isTop} />
            {!isTop && <mesh position={[0, 0, -.014]} raycast={() => null}>
              <boxGeometry args={[.055, .012, .025]} />
              <meshStandardMaterial color="#4f5858" metalness={.5} roughness={.45} />
            </mesh>}
          </group>
        )
      })}
    </group>
  )
}
