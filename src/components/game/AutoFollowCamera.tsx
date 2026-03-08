import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Unit, GRID_SIZE } from '@/game/types';

interface AutoFollowCameraProps {
  units: Unit[];
  selectedUnitId: string | null;
  autoPlay: boolean;
  orbitRef: React.RefObject<any>;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);

export function AutoFollowCamera({ units, selectedUnitId, autoPlay, orbitRef }: AutoFollowCameraProps) {
  const targetLook = useRef(CENTER.clone());

  useFrame(() => {
    if (!orbitRef.current) return;

    if (!autoPlay || !selectedUnitId) {
      // Smoothly return to center
      targetLook.current.lerp(CENTER, 0.03);
    } else {
      const unit = units.find(u => u.id === selectedUnitId);
      if (unit && unit.isAlive) {
        const unitPos = new THREE.Vector3(unit.position.x, 0, unit.position.z);
        targetLook.current.lerp(unitPos, 0.06);
      }
    }

    // Move OrbitControls target instead of fighting the camera directly
    const controls = orbitRef.current;
    controls.target.lerp(targetLook.current, 0.05);
    controls.update();
  });

  return null;
}
