import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { CombatEvent } from '@/game/types';
import * as THREE from 'three';

interface ScreenShakeProps {
  events: CombatEvent[];
}

export function ScreenShake({ events }: ScreenShakeProps) {
  const { camera } = useThree();
  const shakeIntensity = useRef(0);
  const shakeDecay = useRef(0);
  const originalPos = useRef(new THREE.Vector3());
  const lastEventCount = useRef(0);

  useEffect(() => {
    if (events.length > lastEventCount.current) {
      const newEvents = events.slice(lastEventCount.current);
      for (const e of newEvents) {
        if (Date.now() - e.timestamp > 500) continue;
        if (e.type === 'kill') {
          shakeIntensity.current = Math.max(shakeIntensity.current, 0.4);
        } else if (e.type === 'crit') {
          shakeIntensity.current = Math.max(shakeIntensity.current, 0.25);
        } else if (e.type === 'damage') {
          shakeIntensity.current = Math.max(shakeIntensity.current, 0.12);
        } else if (e.message?.includes('grenade') || e.message?.includes('GRENADE') || e.weaponId === 'rocket_launcher') {
          shakeIntensity.current = Math.max(shakeIntensity.current, 0.5);
        }
      }
      lastEventCount.current = events.length;
    }
  }, [events.length]);

  useFrame(() => {
    if (shakeIntensity.current > 0.001) {
      const shake = shakeIntensity.current;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      camera.position.z += (Math.random() - 0.5) * shake;
      shakeIntensity.current *= 0.88; // decay
    }
  });

  return null;
}
