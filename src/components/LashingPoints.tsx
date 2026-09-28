import * as THREE from 'three'
import type { Container } from '../types'

const S = .001

export default function LashingPoints({ container }: { container: Container }) {
  return (
    <group>
      {container.lashingPoints.map((p) => {
        const x = (p.x - container.length / 2) * S
        const y = (p.y - container.width / 2) * S
        const z = Math.max(.012, p.z * S)
        const isLeft = p.y < container.width / 2
        const isTop = p.z > container.height / 2
        const rotation: [number, number, number] = [isLeft ? -Math.PI / 2 : Math.PI / 2, 0, 0]
        return (
          <group key={p.id} position={[x, y, z]} rotation={rotation} raycast={() => null}>
            <mesh userData={{ collisionBody: false, collision: false, lashingPoint: true, lashingSide: isLeft ? 'left' : 'right', lashingLevel: isTop ? 'top' : 'bottom' }} raycast={() => null}>
              <torusGeometry args={[.035, .009, 8, 16, Math.PI * 1.35]} />
              <meshStandardMaterial color="#5d6665" metalness={.65} roughness={.35} side={THREE.DoubleSide} />
            </mesh>
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
