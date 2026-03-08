import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Unit, GRID_SIZE } from '@/game/types';

interface AutoFollowCameraProps {
  units: Unit[];
  selectedUnitId: string | null;
  autoPlay: boolean;
  orbitRef: React.RefObject<any>;
  cameraAngleIndex: number;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
const CAM_DISTANCE = 22;
const CAM_HEIGHT = 18;

function getAnglePosition(angleIndex: number, target: THREE.Vector3): THREE.Vector3 {
  const angle = (Math.PI / 4) + (angleIndex * Math.PI / 2);
  return new THREE.Vector3(
    target.x + Math.cos(angle) * CAM_DISTANCE,
    CAM_HEIGHT,
    target.z + Math.sin(angle) * CAM_DISTANCE
  );
}

export function AutoFollowCamera({ units, selectedUnitId, autoPlay, orbitRef, cameraAngleIndex }: AutoFollowCameraProps) {
  const targetLook = useRef(CENTER.clone());
  const { camera } = useThree();

  useFrame(() => {
    if (!orbitRef.current) return;

    if (!autoPlay || !selectedUnitId) {
      targetLook.current.lerp(CENTER, 0.03);
    } else {
      const unit = units.find(u => u.id === selectedUnitId);
      if (unit && unit.isAlive) {
        const unitPos = new THREE.Vector3(unit.position.x, 0, unit.position.z);
        targetLook.current.lerp(unitPos, 0.06);
      }
    }

    const controls = orbitRef.current;
    controls.target.lerp(targetLook.current, 0.05);

    // Lock camera angle — maintain consistent azimuthal position relative to target
    if (autoPlay) {
      const desiredPos = getAnglePosition(cameraAngleIndex, controls.target);
      camera.position.lerp(desiredPos, 0.04);
    }

    controls.update();
  });

  return null;
}
