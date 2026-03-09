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

// Reusable vectors to avoid per-frame allocations
const _desiredPos = new THREE.Vector3();
const _unitPos = new THREE.Vector3();

function getAnglePosition(angleIndex: number, target: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const angle = (Math.PI / 4) + (angleIndex * Math.PI / 2);
  return out.set(
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
    // Only act when autoPlay is on — do NOT interfere with manual camera otherwise
    if (!autoPlay) return;

    if (!selectedUnitId) {
      targetLook.current.lerp(CENTER, 0.03);
    } else {
      const unit = units.find(u => u.id === selectedUnitId);
      if (unit && unit.isAlive) {
        _unitPos.set(unit.position.x, 0, unit.position.z);
        targetLook.current.lerp(_unitPos, 0.06);
      }
    }

    const controls = orbitRef.current;
    controls.target.lerp(targetLook.current, 0.05);

    // Smoothly maintain camera angle relative to target
    getAnglePosition(cameraAngleIndex, controls.target, _desiredPos);
    camera.position.lerp(_desiredPos, 0.04);

    controls.update();
  });

  return null;
}
