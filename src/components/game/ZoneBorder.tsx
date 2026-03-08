import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GRID_SIZE } from '@/game/types';
import * as THREE from 'three';

export function ZoneBorder({ shrinkLevel }: { shrinkLevel: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(clock.getElapsedTime() * 2) * 0.1;
    }
  });

  if (shrinkLevel <= 0) return null;

  const margin = shrinkLevel * 2;
  const safeSize = GRID_SIZE - margin * 2;
  const center = GRID_SIZE / 2 - 0.5;

  return (
    <group>
      {/* Safe zone border */}
      <mesh position={[center, 0.3, center]} ref={ref}>
        <boxGeometry args={[safeSize, 0.6, safeSize]} />
        <meshBasicMaterial color="#ff4444" wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}
