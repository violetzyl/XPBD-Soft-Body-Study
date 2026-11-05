export type ColourwayId =
  | 'coral'
  | 'plum'
  | 'mint'
  | 'cobalt'
  | 'lilac'
  | 'midnight'
  | 'sunrise';

export interface JellyColourway {
  id: ColourwayId;
  name: string;
  label: string;
  specimenCode: string;
  description: string;
  // Outer translucent dorsal jelly layer
  outerJellyHex: string;
  outerAttenuationHex: string;
  outerDeepHex: string;
  // Dorsal chromatophore mottle & papillae
  mottlePrimaryHex: string;
  mottleSecondaryHex: string;
  mottleSpotHex: string;
  papillaTipHex: string;
  // Inner core & ventral milky arm layer + suckers
  milkyVentralHex: string;
  innerCoreHex: string;
  suckerRimHex: string;
  suckerCupHex: string;
  // Eyes & horns
  irisGoldHex: string;
  pupilHex: string;
  socketHex: string;
  hornHex: string;
  // UI swatch & accent
  swatchHex: string;
  swatchSecondaryHex: string;
}

export const COLOURWAYS: Record<ColourwayId, JellyColourway> = {
  coral: {
    id: 'coral',
    name: 'Coral',
    label: 'Reef Coral Bilayer',
    specimenCode: 'OCT-JL-01 · CORAL',
    description: 'Warm vermilion-amber outer gelatin cast over a dense sweet-cream ventral layer with terracotta chromatophore mottle.',
    outerJellyHex: '#ef644c',
    outerAttenuationHex: '#ff926b',
    outerDeepHex: '#b83322',
    mottlePrimaryHex: '#a32919',
    mottleSecondaryHex: '#fae0d4',
    mottleSpotHex: '#6e190f',
    papillaTipHex: '#ffaa8a',
    milkyVentralHex: '#f7efe6',
    innerCoreHex: '#f2decb',
    suckerRimHex: '#fbf6f0',
    suckerCupHex: '#e6cfc2',
    irisGoldHex: '#f5b82e',
    pupilHex: '#14110f',
    socketHex: '#d94b36',
    hornHex: '#ff8566',
    swatchHex: '#ef644c',
    swatchSecondaryHex: '#f7efe6',
  },
  plum: {
    id: 'plum',
    name: 'Plum',
    label: 'Abyssal Plum Bilayer',
    specimenCode: 'OCT-JL-02 · PLUM',
    description: 'Translucent damson-violet outer jelly cast over an opalescent lavender-milk underside with deep mulberry chromatophore rings.',
    outerJellyHex: '#8840c4',
    outerAttenuationHex: '#c07af0',
    outerDeepHex: '#4b1878',
    mottlePrimaryHex: '#3c1061',
    mottleSecondaryHex: '#e9d5ff',
    mottleSpotHex: '#24073d',
    papillaTipHex: '#cf94f7',
    milkyVentralHex: '#f3eef8',
    innerCoreHex: '#e5d4f5',
    suckerRimHex: '#f9f5fc',
    suckerCupHex: '#d8c5eb',
    irisGoldHex: '#f5be38',
    pupilHex: '#120d17',
    socketHex: '#6c2ba3',
    hornHex: '#b366ed',
    swatchHex: '#8840c4',
    swatchSecondaryHex: '#f3eef8',
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    label: 'Pelagic Mint Bilayer',
    specimenCode: 'OCT-JL-03 · MINT',
    description: 'Clear sea-glass emerald jelly over a frosted pearl-milk core with verdigris chromatophore mottle and pale turquoise papillae.',
    outerJellyHex: '#24b8a0',
    outerAttenuationHex: '#6ee7d2',
    outerDeepHex: '#0f7364',
    mottlePrimaryHex: '#0b5c50',
    mottleSecondaryHex: '#d5faf2',
    mottleSpotHex: '#063b33',
    papillaTipHex: '#7ef2de',
    milkyVentralHex: '#eef8f6',
    innerCoreHex: '#d4f0ea',
    suckerRimHex: '#f7fcfb',
    suckerCupHex: '#bfe3dc',
    irisGoldHex: '#f2b729',
    pupilHex: '#0d1715',
    socketHex: '#199682',
    hornHex: '#5ce0c8',
    swatchHex: '#24b8a0',
    swatchSecondaryHex: '#eef8f6',
  },
  cobalt: {
    id: 'cobalt',
    name: 'Cobalt',
    label: 'Pelagic Cobalt Bilayer',
    specimenCode: 'MRL-JL-01 · COBALT',
    description: 'Clear pelagic cobalt-blue jelly cast over a milky-silver guanine underbelly with dark royal-indigo back pigment and ~15 lateral spot-and-dash stripes.',
    outerJellyHex: '#2563eb',
    outerAttenuationHex: '#3b82f6',
    outerDeepHex: '#1e3a8a',
    mottlePrimaryHex: '#0f172a',
    mottleSecondaryHex: '#93c5fd',
    mottleSpotHex: '#38bdf8',
    papillaTipHex: '#7dd3fc',
    milkyVentralHex: '#f1f5f9',
    innerCoreHex: '#cbd5e1',
    suckerRimHex: '#f8fafc',
    suckerCupHex: '#cbd5e1',
    irisGoldHex: '#f59e0b',
    pupilHex: '#020617',
    socketHex: '#1e40af',
    hornHex: '#0f172a',
    swatchHex: '#2563eb',
    swatchSecondaryHex: '#f1f5f9',
  },
  lilac: {
    id: 'lilac',
    name: 'Lilac',
    label: 'Electric Lilac Bilayer',
    specimenCode: 'MRL-JL-02 · LILAC',
    description: 'Translucent violet-lilac outer jelly over an opalescent pearl-silver underbelly with deep amethyst dorsal pigment and glowing cyan-violet bars.',
    outerJellyHex: '#9333ea',
    outerAttenuationHex: '#c084fc',
    outerDeepHex: '#581c87',
    mottlePrimaryHex: '#2e1065',
    mottleSecondaryHex: '#e9d5ff',
    mottleSpotHex: '#38bdf8',
    papillaTipHex: '#d8b4fe',
    milkyVentralHex: '#faf5ff',
    innerCoreHex: '#e9d5ff',
    suckerRimHex: '#faf5ff',
    suckerCupHex: '#e9d5ff',
    irisGoldHex: '#fbbf24',
    pupilHex: '#090214',
    socketHex: '#6b21a8',
    hornHex: '#2e1065',
    swatchHex: '#9333ea',
    swatchSecondaryHex: '#faf5ff',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    label: 'Abyssal Midnight Bilayer',
    specimenCode: 'MRL-JL-03 · MIDNIGHT',
    description: 'Deep sapphire-midnight outer jelly over a metallic moonlit-silver belly with obsidian dorsal saddle and high-contrast electric-blue lateral stripes.',
    outerJellyHex: '#1d4ed8',
    outerAttenuationHex: '#38bdf8',
    outerDeepHex: '#0f172a',
    mottlePrimaryHex: '#020617',
    mottleSecondaryHex: '#7dd3fc',
    mottleSpotHex: '#00e5ff',
    papillaTipHex: '#38bdf8',
    milkyVentralHex: '#e2e8f0',
    innerCoreHex: '#94a3b8',
    suckerRimHex: '#f1f5f9',
    suckerCupHex: '#94a3b8',
    irisGoldHex: '#f59e0b',
    pupilHex: '#000000',
    socketHex: '#0f172a',
    hornHex: '#020617',
    swatchHex: '#1e3a8a',
    swatchSecondaryHex: '#cbd5e1',
  },
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise',
    label: 'Pelagic Sunrise Bilayer',
    specimenCode: 'MRL-JL-04 · SUNRISE',
    specimenPrefix: 'MRL-JL-04',
    description: 'Warm amber-rose horizon jelly cast over a champagne-silver underbelly with bronze-indigo dorsal pigment and luminous sky-blue stripes.',
    outerJellyHex: '#f97316',
    outerAttenuationHex: '#fb923c',
    outerDeepHex: '#9a3412',
    mottlePrimaryHex: '#431407',
    mottleSecondaryHex: '#fed7aa',
    mottleSpotHex: '#38bdf8',
    papillaTipHex: '#fdba74',
    milkyVentralHex: '#fffbeb',
    innerCoreHex: '#fde68a',
    suckerRimHex: '#fffbeb',
    suckerCupHex: '#fde68a',
    irisGoldHex: '#f59e0b',
    pupilHex: '#1c0a04',
    socketHex: '#c2410c',
    hornHex: '#431407',
    swatchHex: '#f97316',
    swatchSecondaryHex: '#fffbeb',
  } as JellyColourway,
};

export const COLOURWAY_LIST: JellyColourway[] = [
  COLOURWAYS.coral,
  COLOURWAYS.plum,
  COLOURWAYS.mint,
];

export const MARLIN_COLOURWAY_LIST: JellyColourway[] = [
  COLOURWAYS.cobalt,
  COLOURWAYS.lilac,
  COLOURWAYS.midnight,
  COLOURWAYS.sunrise,
];

