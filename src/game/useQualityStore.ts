import { create } from 'zustand';

export type QualityLevel = 'low' | 'medium' | 'high';

interface QualitySettings {
  postProcessing: boolean;
  shadowMapSize: number;
  shadows: boolean;
  surfaceDetails: boolean;
  environmentVFX: boolean;
  dpr: [number, number];
  lightCount: 'minimal' | 'standard' | 'full';
  propDetail: 'low' | 'medium' | 'high';
  fogParticles: boolean;
  antialias: boolean;
}

interface QualityStore {
  level: QualityLevel;
  settings: QualitySettings;
  setLevel: (level: QualityLevel) => void;
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    postProcessing: false,
    shadowMapSize: 512,
    shadows: false,
    surfaceDetails: false,
    environmentVFX: false,
    dpr: [1, 1],
    lightCount: 'minimal',
    propDetail: 'low',
    fogParticles: false,
    antialias: false,
  },
  medium: {
    postProcessing: false,
    shadowMapSize: 1024,
    shadows: true,
    surfaceDetails: false,
    environmentVFX: false,
    dpr: [1, 1.25],
    lightCount: 'standard',
    propDetail: 'medium',
    fogParticles: false,
    antialias: true,
  },
  high: {
    postProcessing: true,
    shadowMapSize: 2048,
    shadows: true,
    surfaceDetails: true,
    environmentVFX: true,
    dpr: [1, 1.5],
    lightCount: 'full',
    propDetail: 'high',
    fogParticles: true,
    antialias: true,
  },
};

export const useQualityStore = create<QualityStore>((set) => ({
  level: 'medium',
  settings: PRESETS.medium,
  setLevel: (level) => set({ level, settings: PRESETS[level] }),
}));
