import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Unit, GRID_SIZE } from '@/game/types';

interface AutoFollowCameraProps {
  units: Unit[];
  selectedUnitId: string | null;
  autoPlay: boolean;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);

export function AutoFollowCamera({ units, selectedUnitId, autoPlay }: AutoFollowCameraProps) {
  const { camera } = useThree();
  const targetLook = useRef(CENTER.clone());
  const currentLook = useRef(CENTER.clone());

  useFrame(() => {
    if (!autoPlay || !selectedUnitId) {
      // Smoothly return to center
      targetLook.current.copy(CENTER);
    } else {
      const unit = units.find(u => u.id === selectedUnitId);
      if (unit && unit.isAlive) {
        targetLook.current.set(unit.position.x, 0, unit.position.z);
      }
    }

    // Smooth lerp
    currentLook.current.lerp(targetLook.current, 0.04);

    // Offset camera position toward the unit while keeping the same relative angle
    const offset = camera.position.clone().sub(CENTER);
    const newCamPos = currentLook.current.clone().add(offset);
    camera.position.lerp(newCamPos, 0.03);
    camera.lookAt(currentLook.current);
  });

  return null;
}

