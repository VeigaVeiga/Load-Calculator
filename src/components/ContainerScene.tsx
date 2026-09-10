import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { Cargo, Container, PackedBox } from '../types'

interface Props {
  container: Container
  cargo: Cargo[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function Box3D({
  box,
  selected,
  onClick,
}: {
  box: PackedBox
  selected: boolean
  onClick: () => void
}) {
  const scale = 0.001
  return (
    <mesh
      position={[
        (box.x + box.length / 2) * scale,
        (box.z + box.height / 2) * scale,
        (box.y + box.width / 2) * scale,
      ]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <boxGeometry
        args={[
          box.length * scale,
          box.height * scale,
          box.width * scale,
        ]}
      />
      <meshStandardMaterial
        color={selected ? '#ffffff' : box.color}
        transparent
        opacity={0.9}
        roughness={0.65}
      />
    </mesh>
  )
}

function SceneContent({ container, cargo, selectedId, onSelect }: Props) {
  const scale = 0.001
  const boxes: PackedBox[] = []

  // V1 intentionally uses a simple shelf layout.
  // Later this section can be replaced by LAFF / EB-AFIT.
  let cursorX = 0
  let cursorY = 0
  let cursorZ = 0
  let rowHeight = 0

  for (const item of cargo) {
    for (let i = 0; i < item.quantity; i++) {
      if (cursorX + item.length > container.length) {
        cursorX = 0
        cursorY += 900
        rowHeight = 0
      }

      if (cursorY + item.width > container.width) {
        cursorX = 0
        cursorY = 0
        cursorZ += 900
        rowHeight = 0
      }

      if (cursorZ + item.height > container.height) continue

      boxes.push({
        id: `${item.id}-${i + 1}`,
        cargoId: item.id,
        x: cursorX,
        y: cursorY,
        z: cursorZ,
        length: item.length,
        width: item.width,
        height: item.height,
        color: item.color,
      })

      cursorX += item.length
      rowHeight = Math.max(rowHeight, item.height)
    }
  }

  const centerX = container.length * scale / 2
  const centerZ = container.width * scale / 2

  return (
    <>
      <color attach="background" args={['#f5f6f8']} />

      <ambientLight intensity={1.5} />
      <directionalLight position={[8, 10, 8]} intensity={2.5} />
      <Environment preset="city" />

      <group position={[-centerX, 0, -centerZ]}>
        {/* Container floor */}
        <mesh position={[centerX, -0.04, centerZ]}>
          <boxGeometry args={[container.length * scale, 0.08, container.width * scale]} />
          <meshStandardMaterial color="#c9cdd3" />
        </mesh>

        {/* Container outline */}
        <lineSegments>
          <edgesGeometry
            args={[
              new THREE.BoxGeometry(
                container.length * scale,
                container.height * scale,
                container.width * scale,
              ),
            ]}
          />
          <lineBasicMaterial color="#8c929b" />
        </lineSegments>

        {boxes.map((box) => (
          <Box3D
            key={box.id}
            box={box}
            selected={selectedId === box.id}
            onClick={() => onSelect(box.id)}
          />
        ))}

        <Grid
          args={[container.length * scale, container.width * scale]}
          position={[centerX, 0.01, centerZ]}
          cellSize={0.5}
          cellThickness={0.5}
          sectionSize={2}
          sectionThickness={1}
          fadeDistance={25}
          infiniteGrid={false}
        />
      </group>

      <OrbitControls makeDefault />
    </>
  )
}

export default function ContainerScene(props: Props) {
  return (
    <Canvas camera={{ position: [14, 9, 15], fov: 42 }}>
      <SceneContent {...props} />
    </Canvas>
  )
}