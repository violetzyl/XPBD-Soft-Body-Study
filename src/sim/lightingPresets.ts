export type LightingPresetId = 'studio' | 'rim' | 'underwater';

export interface LightingPresetConfig {
  id: LightingPresetId;
  name: string;
  shortLabel: string;
  description: string;
  // Scene background, fog, and slab tint
  backgroundHex: string;
  fogHex: string;
  fogDensity: number;
  slabTintHex: string;
  slabRoughness: number;
  platterRimHex: string;
  toneMappingExposure: number;
  // Hemisphere light (sky / ground fill)
  hemiSkyHex: string;
  hemiGroundHex: string;
  hemiIntensity: number;
  // Primary Key Light
  keyColorHex: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  // Primary Back/Rim Light (drives translucent edge glow & SSS)
  rimColorHex: string;
  rimIntensity: number;
  rimPosition: [number, number, number];
  // Secondary Accent / Caustic Kicker Light
  kickerColorHex: string;
  kickerIntensity: number;
  kickerPosition: [number, number, number];
  // Jelly Subsurface Scattering & Specular Reflection parameters
  sssStrength: number;
  sssDistortion: number;
  sssPower: number;
  envMapIntensity: number;
  clearcoatIntensity: number;
  causticShimmer: number;
}

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPresetConfig> = {
  studio: {
    id: 'studio',
    name: 'Soft Diffused Studio',
    shortLabel: 'Soft Studio',
    description:
      'Broad overhead softbox illumination on a warm alabaster slab with balanced fill and smooth clearcoat reflections.',
    backgroundHex: '#eae4dc',
    fogHex: '#eae4dc',
    fogDensity: 0.055,
    slabTintHex: '#ffffff',
    slabRoughness: 0.76,
    platterRimHex: '#b8a892',
    toneMappingExposure: 1.08,
    hemiSkyHex: '#fff9f2',
    hemiGroundHex: '#d8cfc2',
    hemiIntensity: 1.05,
    keyColorHex: '#fff5e6',
    keyIntensity: 2.1,
    keyPosition: [3.0, 5.5, 3.2],
    rimColorHex: '#e0f2fe',
    rimIntensity: 1.25,
    rimPosition: [-3.2, 2.6, -3.4],
    kickerColorHex: '#fde68a',
    kickerIntensity: 0.55,
    kickerPosition: [-2.8, 3.2, 2.5],
    sssStrength: 0.52,
    sssDistortion: 0.35,
    sssPower: 2.4,
    envMapIntensity: 1.2,
    clearcoatIntensity: 1.0,
    causticShimmer: 0.0,
  },
  rim: {
    id: 'rim',
    name: 'Dramatic Rim Lighting',
    shortLabel: 'Dramatic Rim',
    description:
      'High-contrast dark stage with intense grazing backlights that ignite internal subsurface scattering through the translucent jelly.',
    backgroundHex: '#121318',
    fogHex: '#121318',
    fogDensity: 0.085,
    slabTintHex: '#262830',
    slabRoughness: 0.42,
    platterRimHex: '#78716c',
    toneMappingExposure: 1.22,
    hemiSkyHex: '#334155',
    hemiGroundHex: '#0f172a',
    hemiIntensity: 0.32,
    keyColorHex: '#fff0db',
    keyIntensity: 0.95,
    keyPosition: [2.4, 4.2, 2.8],
    rimColorHex: '#ffbe76',
    rimIntensity: 4.6,
    rimPosition: [-1.8, 1.45, -3.2],
    kickerColorHex: '#38bdf8',
    kickerIntensity: 3.1,
    kickerPosition: [3.2, 1.35, -2.6],
    sssStrength: 1.35,
    sssDistortion: 0.45,
    sssPower: 1.85,
    envMapIntensity: 1.55,
    clearcoatIntensity: 1.0,
    causticShimmer: 0.0,
  },
  underwater: {
    id: 'underwater',
    name: 'Subtle Underwater',
    shortLabel: 'Underwater',
    description:
      'Pelagic teal-blue water column with filtered surface caustics, aquatic depth fog, and cool bioluminescent subsurface scatter.',
    backgroundHex: '#0d2b38',
    fogHex: '#0d2b38',
    fogDensity: 0.092,
    slabTintHex: '#5f8d9c',
    slabRoughness: 0.52,
    platterRimHex: '#4b7bec',
    toneMappingExposure: 1.15,
    hemiSkyHex: '#67e8f9',
    hemiGroundHex: '#083344',
    hemiIntensity: 0.88,
    keyColorHex: '#5eead4',
    keyIntensity: 2.45,
    keyPosition: [1.2, 5.8, 1.5],
    rimColorHex: '#22d3ee',
    rimIntensity: 2.75,
    rimPosition: [-2.6, 2.2, -3.0],
    kickerColorHex: '#34d399',
    kickerIntensity: 1.45,
    kickerPosition: [2.8, 2.0, -1.8],
    sssStrength: 1.05,
    sssDistortion: 0.4,
    sssPower: 2.1,
    envMapIntensity: 1.35,
    clearcoatIntensity: 1.0,
    causticShimmer: 1.0,
  },
};

export const LIGHTING_PRESET_LIST: LightingPresetConfig[] = [
  LIGHTING_PRESETS.studio,
  LIGHTING_PRESETS.rim,
  LIGHTING_PRESETS.underwater,
];
