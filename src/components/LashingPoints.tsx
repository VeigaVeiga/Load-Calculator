import * as THREE from 'three'
import type { Container } from '../types'

const S = .001

// The ring is a U-shaped hook mounted on the side wall.  Its opening must
// point vertically: upper hooks open downward, lower hooks open upward.
function Ring({ top, left }: { top: boolean; left: boolean }) {
  // TorusGeometry's missing arc is centred around -58.5 degrees in its local
  // XY plane.  First put that plane vertical (XZ), then rotate the ring in
  // its own plane so the missing/open side is exactly vertical.
  const opening = top ? -Math.PI / 2 : Math.PI / 2
  const localMissing = -58.5 * Math.PI / 180
  const inPlane = opening - localMissing
  const flip = left ? 0 : Math.PI
  return (
    <group rotation={[Math.PI / 2, 0, inPlane + flip]}>
      <mesh raycast={() => null}>
        <torusGeometry args={[.035, .009, 8, 18, Math.PI * 1.35]} />
        <meshStandardMaterial color="#5d6665" metalness={.65} roughness={.35} side={THREE.DoubleSide} />
      </mesh>
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
        const isLeft = p.y < container.width / 2
        const isTop = p.z > container.height / 2
        return (
          <group key={p.id} position={[x, y, z]} raycast={() => null}>
            <Ring top={isTop} left={isLeft} />
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
