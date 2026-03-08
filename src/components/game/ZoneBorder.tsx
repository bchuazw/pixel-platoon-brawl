import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { GRID_SIZE } from '@/game/types';
import * as THREE from 'three';

export function ZoneBorder({ shrinkLevel }: { shrinkLevel: number }) {
  const lineRef = useRef<THREE.LineLoop>(null);

  useFrame(({ clock }) => {
    if (lineRef.current) {
      const mat = lineRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.5 + Math.sin(clock.getElapsedTime() * 3) * 0.2;
    }
  });

  if (shrinkLevel <= 0) return null;

  const margin = shrinkLevel * 2;
  const halfSize = (GRID_SIZE - margin * 2) / 2;
  const center = GRID_SIZE / 2 - 0.5;
  const y = 0.15;

  // Line loop around safe zone border — no wireframe box
  const points = useMemo(() => {
    const pts = [
      new THREE.Vector3(center - halfSize, y, center - halfSize),
      new THREE.Vector3(center + halfSize, y, center - halfSize),
      new THREE.Vector3(center + halfSize, y, center + halfSize),
      new THREE.Vector3(center - halfSize, y, center + halfSize),
    ];
    return pts;
  }, [center, halfSize]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  return (
    <group>
      <lineLoop ref={lineRef} geometry={geometry}>
        <lineBasicMaterial color="#ff4444" transparent opacity={0.6} linewidth={2} />
      </lineLoop>
      {/* Vertical warning pillars at corners */}
      {points.map((p, i) => (
        <mesh key={i} position={[p.x, 0.3, p.z]}>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshBasicMaterial color="#ff4444" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}
