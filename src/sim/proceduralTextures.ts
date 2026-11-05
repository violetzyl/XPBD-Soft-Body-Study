import * as THREE from 'three';
import { JellyColourway } from './colourways';

/**
 * Generates a high-definition biological cephalopod skin texture (1024x1024, SRGBColorSpace)
 * replicating real Octopus vulgaris / Enteroctopus dofleini dermal anatomy cast in translucent jelly:
 * 1. Dermal reticulated sulcus network (organic cellular skin patches separated by fine translucent grooves)
 * 2. Sub-dermal vascular & visceral mottle clouds
 * 3. Leucophore & iridophore light-scattering rings and ocellar patches
 * 4. Three hierarchical tiers of stellate (star-shaped cytoelastic) chromatophore organs:
 *    - Deep expanded melanophores/erythrophores with radial muscle fiber spokes
 *    - Mid-layer mottled pigment rosettes
 *    - Superficial contracted pinpoint xanthophores
 */
const _mottleTexCache = new Map<string, THREE.CanvasTexture>();

export function createChromatophoreMottleTexture(
  colourway: JellyColourway,
  anisotropy = 4
): THREE.CanvasTexture {
  const cacheKey = `${colourway.id}_${anisotropy}`;
  const cached = _mottleTexCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base translucent jelly dermis hue
  ctx.fillStyle = colourway.outerJellyHex;
  ctx.fillRect(0, 0, size, size);

  let seed =
    colourway.id === 'coral' ? 104729 : colourway.id === 'plum' ? 22193 : 88147;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Helper to draw seamlessly across toroidal tile boundaries
  const drawTiled = (
    cx: number,
    cy: number,
    margin: number,
    fn: (tx: number, ty: number) => void
  ) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const tx = cx + ox;
        const ty = cy + oy;
        if (
          tx + margin < 0 ||
          tx - margin > size ||
          ty + margin < 0 ||
          ty - margin > size
        ) {
          continue;
        }
        fn(tx, ty);
      }
    }
  };

  // Layer 1: Deep sub-dermal reticulated chromatophore clouds & disruptive patches
  for (let i = 0; i < 110; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 42 + rand() * 96;
    drawTiled(cx, cy, r, (tx, ty) => {
      const grad = ctx.createRadialGradient(tx, ty, r * 0.08, tx, ty, r);
      grad.addColorStop(0, `${colourway.outerAttenuationHex}72`);
      grad.addColorStop(0.55, `${colourway.mottlePrimaryHex}48`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Layer 2: Organic dermal reticulation (polygonal skin sulcus network around papilla centers)
  const cellCenters: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 88; i++) {
    cellCenters.push({
      x: rand() * size,
      y: rand() * size,
      r: 32 + rand() * 48,
    });
  }

  ctx.lineCap = 'round';
  for (const cell of cellCenters) {
    drawTiled(cell.x, cell.y, cell.r * 1.4, (tx, ty) => {
      // Pale dermal patch cushion
      const patchGrad = ctx.createRadialGradient(
        tx,
        ty,
        cell.r * 0.05,
        tx,
        ty,
        cell.r
      );
      patchGrad.addColorStop(0, `${colourway.mottleSecondaryHex}40`);
      patchGrad.addColorStop(0.7, `${colourway.outerJellyHex}22`);
      patchGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = patchGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, cell.r, 0, Math.PI * 2);
      ctx.fill();

      // Reticulated skin fold ring (sulcus groove)
      ctx.strokeStyle = `${colourway.mottleSpotHex}26`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const segs = 9;
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        const wobble = 0.86 + 0.24 * Math.sin(ang * 3 + cell.x * 0.05);
        const px = tx + Math.cos(ang) * cell.r * wobble;
        const py = ty + Math.sin(ang) * cell.r * wobble;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }

  // Layer 3: Leucophore & iridophore translucent ocellar rings (pale reflective rings in real octopus skin)
  for (let i = 0; i < 160; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 10 + rand() * 28;
    const rot = rand() * Math.PI;
    const aspect = 0.68 + rand() * 0.48;
    drawTiled(cx, cy, r * 1.3, (tx, ty) => {
      ctx.strokeStyle = `${colourway.mottleSecondaryHex}68`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(tx, ty, r, r * aspect, rot, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // Layer 4: Expanded stellate chromatophores (star-like cytoelastic sacculus with radial spokes)
  for (let i = 0; i < 280; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 6.5 + Math.pow(rand(), 1.4) * 14.5;
    const color =
      i % 3 === 0 ? colourway.mottleSpotHex : colourway.mottlePrimaryHex;
    const alpha = 0.34 + rand() * 0.48;
    const numSpokes = 7 + (i % 5);
    const baseAngle = rand() * Math.PI * 2;

    drawTiled(cx, cy, r * 1.5, (tx, ty) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      // Stellate radial cytoelastic spokes
      ctx.lineWidth = 1.1;
      for (let k = 0; k < numSpokes; k++) {
        const ang = baseAngle + (k / numSpokes) * Math.PI * 2;
        const spokeLen = r * (1.05 + 0.35 * ((k * 7) % 3) * 0.33);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(ang) * spokeLen, ty + Math.sin(ang) * spokeLen);
        ctx.stroke();
      }

      // Central pigment sacculus
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.72, 0, Math.PI * 2);
      ctx.fill();

      // Pale halo around expanded chromatophore
      ctx.strokeStyle = `${colourway.mottleSecondaryHex}44`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Layer 5: Fine contracted pinpoint chromatophores & xanthophore freckles (high-frequency biological grain)
  for (let i = 0; i < 720; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 1.6 + Math.pow(rand(), 2.0) * 5.2;
    const isDark = i % 4 === 0;
    const isLight = i % 5 === 0;
    ctx.fillStyle = isDark
      ? colourway.mottleSpotHex
      : isLight
      ? colourway.mottleSecondaryHex
      : colourway.mottlePrimaryHex;
    ctx.globalAlpha = 0.28 + rand() * 0.56;
    drawTiled(cx, cy, r + 2, (tx, ty) => {
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1.0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 2.4);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  _mottleTexCache.set(cacheKey, tex);
  return tex;
}

/**
 * Generates a high-resolution linear grayscale bump map (512x512) for authentic octopus
 * dermal micro-relief: reticulated skin grooves (sulci), primary/secondary papilla mounds,
 * and fine epidermal pore texture.
 */
export function createPapillaBumpTexture(anisotropy = 4): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, size, size);

  let seed = 49157;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const drawTiled = (
    cx: number,
    cy: number,
    margin: number,
    fn: (tx: number, ty: number) => void
  ) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const tx = cx + ox;
        const ty = cy + oy;
        if (
          tx + margin < 0 ||
          tx - margin > size ||
          ty + margin < 0 ||
          ty - margin > size
        ) {
          continue;
        }
        fn(tx, ty);
      }
    }
  };

  // 1. Reticulated dermal cushions & dark sulcus grooves
  for (let i = 0; i < 110; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 18 + rand() * 30;
    drawTiled(cx, cy, r + 4, (tx, ty) => {
      const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
      grad.addColorStop(0, '#9e9e9e');
      grad.addColorStop(0.78, '#868686');
      grad.addColorStop(0.94, '#5c5c5c'); // Sulcus groove trough
      grad.addColorStop(1, '#787878');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 2. Raised primary & secondary papillae mounds
  for (let i = 0; i < 420; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 4 + Math.pow(rand(), 1.5) * 14;
    drawTiled(cx, cy, r + 2, (tx, ty) => {
      const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, '#d2d2d2');
      grad.addColorStop(0.82, '#949494');
      grad.addColorStop(1, '#787878');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 3.2);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the warm studio casting slab texture (tiger shark jelly studio aesthetic:
 * matte warm travertine/alabaster casting board with subtle centimeter metric grid and radial specimen rings).
 */
export function createStudioSlabTexture(anisotropy = 4): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm studio alabaster surface
  const bgGrad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.52
  );
  bgGrad.addColorStop(0, '#f6f2eb');
  bgGrad.addColorStop(0.7, '#ece6dc');
  bgGrad.addColorStop(1, '#dfd7ca');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle metric grid lines
  ctx.strokeStyle = 'rgba(110, 98, 85, 0.11)';
  ctx.lineWidth = 1;
  const step = size / 16;
  for (let i = 0; i <= 16; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Finer subdivisions
  ctx.strokeStyle = 'rgba(110, 98, 85, 0.045)';
  const subStep = step / 4;
  for (let i = 0; i <= 64; i++) {
    const p = i * subStep;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Concentric studio specimen span rings (20 cm, 40 cm, 60 cm)
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.strokeStyle = 'rgba(95, 84, 72, 0.16)';
  ctx.setLineDash([6, 6]);
  for (const rFrac of [0.16, 0.28, 0.40]) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * rFrac, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the dual procedural maps for the Blue Marlin (Makaira nigricans) bilayer jelly study:
 * 1. `pigmentMap`: Clear cobalt/palette jelly base with a dark pigment layer covering the dorsal back
 *    and fins, accented by 15 transverse lateral stripes composed of aligned spots and dashes.
 * 2. `stripeEmissiveMap`: Dedicated electric-blue luminescence mask for the ~15 lateral spot-and-dash
 *    stripes and dorsal fin ray filaments, used in "Light-Up" mode and during bill slashes / tail swishes.
 *
 * UV convention on the Blue Marlin trunk & fins:
 * - `u` (horizontal X in texture, `0..1`): Axial position from bill tip (`0.0`) to caudal fork (`1.0`).
 * - `v` (vertical Y in texture, `0..1`): Circumferential angle around cross-section (`theta / 2pi`),
 *   where `v = 0` and `v = 1` are the dorsal crest (top back), `v = 0.25` and `v = 0.75` are the left/right lateral flanks,
 *   and `v = 0.50` is the ventral belly midline.
 */
const _marlinPigmentCache = new Map<
  string,
  { pigmentMap: THREE.CanvasTexture; stripeEmissiveMap: THREE.CanvasTexture }
>();
let _cachedMarlinNormalTex: THREE.CanvasTexture | null = null;

export function createMarlinPigmentAndStripeTextures(
  colourway: JellyColourway,
  anisotropy = 4
): {
  pigmentMap: THREE.CanvasTexture;
  stripeEmissiveMap: THREE.CanvasTexture;
} {
  const cacheKey = `${colourway.id}_${anisotropy}`;
  const cached = _marlinPigmentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const size = 1024;
  const pigCanvas = document.createElement('canvas');
  pigCanvas.width = size;
  pigCanvas.height = size;
  const pCtx = pigCanvas.getContext('2d')!;

  const emiCanvas = document.createElement('canvas');
  emiCanvas.width = size;
  emiCanvas.height = size;
  const eCtx = emiCanvas.getContext('2d')!;

  // Clear emissive background
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  const bodyMaxX = Math.floor(0.87 * size);

  // 1. Biologically Authentic Countershading across the Body Trunk (u in 0..0.87)
  // Top & bottom of UV (v near 0.0 or 1.0) correspond to the dorsal crest (cos(theta) > 0),
  // v ~ 0.25 and v ~ 0.75 are the left and right lateral flanks,
  // and v near 0.50 is the silvery-white ventral belly (cos(theta) < 0).
  const dorsalGrad = pCtx.createLinearGradient(0, 0, 0, size);
  dorsalGrad.addColorStop(0.0, colourway.mottlePrimaryHex);
  dorsalGrad.addColorStop(0.13, colourway.outerDeepHex);
  dorsalGrad.addColorStop(0.24, colourway.outerJellyHex);
  dorsalGrad.addColorStop(0.36, colourway.milkyVentralHex);
  dorsalGrad.addColorStop(0.50, '#f8fafc');
  dorsalGrad.addColorStop(0.64, colourway.milkyVentralHex);
  dorsalGrad.addColorStop(0.76, colourway.outerJellyHex);
  dorsalGrad.addColorStop(0.87, colourway.outerDeepHex);
  dorsalGrad.addColorStop(1.0, colourway.mottlePrimaryHex);
  pCtx.fillStyle = dorsalGrad;
  pCtx.fillRect(0, 0, bodyMaxX, size);

  let seed = 71933;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Subtle dermal chromatophore mottling & metallic sheen patches along the upper flank
  for (let m = 0; m < 220; m++) {
    const uM = 0.22 + rand() * 0.62;
    const flank = m % 2;
    const vBase = flank === 0 ? 0.08 + rand() * 0.22 : 0.70 + rand() * 0.22;
    const mx = uM * size;
    const my = vBase * size;
    const rx = 14 + rand() * 28;
    const ry = 6 + rand() * 14;
    const mGrad = pCtx.createRadialGradient(mx, my, 1, mx, my, Math.max(rx, ry));
    mGrad.addColorStop(
      0,
      m % 3 === 0 ? `${colourway.mottlePrimaryHex}44` : `${colourway.outerJellyHex}38`
    );
    mGrad.addColorStop(1, 'transparent');
    pCtx.fillStyle = mGrad;
    pCtx.beginPath();
    pCtx.ellipse(mx, my, rx, ry, (rand() - 0.5) * 0.4, 0, Math.PI * 2);
    pCtx.fill();
  }

  // Darken elongated bill (rostrum, u = 0..0.22) and steep dorsal nape saddle
  const rostrumGrad = pCtx.createLinearGradient(0, 0, 0.26 * size, 0);
  rostrumGrad.addColorStop(0.0, `${colourway.mottlePrimaryHex}cc`);
  rostrumGrad.addColorStop(0.55, `${colourway.outerDeepHex}77`);
  rostrumGrad.addColorStop(1.0, 'transparent');
  pCtx.fillStyle = rostrumGrad;
  pCtx.fillRect(0, 0, Math.floor(0.26 * size), size);

  // Iridescent silver-azure opercular gill plate highlight (u ~ 0.27..0.32)
  for (const vFlank of [0.26, 0.74]) {
    const ox = 0.292 * size;
    const oy = vFlank * size;
    const opGrad = pCtx.createRadialGradient(ox, oy, 4, ox, oy, 46);
    opGrad.addColorStop(0, `${colourway.milkyVentralHex}aa`);
    opGrad.addColorStop(0.55, `${colourway.mottleSecondaryHex}44`);
    opGrad.addColorStop(1, 'transparent');
    pCtx.fillStyle = opGrad;
    pCtx.beginPath();
    pCtx.ellipse(ox, oy, 28, 48, 0, 0, Math.PI * 2);
    pCtx.fill();
  }

  // 2. Fifteen (15) Cohesive Organic Transverse Lateral Bars Composed of Closely Spaced Dashes & Spots
  // Spaced from behind the operculum (u = 0.305) to the caudal peduncle (u = 0.835)
  const numStripes = 15;
  for (let s = 0; s < numStripes; s++) {
    const tStripe = s / (numStripes - 1);
    const uCenter = 0.305 + Math.pow(tStripe, 0.96) * 0.525;
    const xBase = uCenter * size;
    const barPhase = s * 0.85;
    const taperScale = 1.0 - 0.30 * tStripe;

    for (const flank of [0, 1]) {
      const vDorsal = flank === 0 ? 0.055 : 0.945;
      const vVentral = flank === 0 ? 0.415 : 0.585;

      // Soft underlying vertical bar halo connecting the dashes & spots into a recognizable marlin stripe
      pCtx.save();
      pCtx.strokeStyle = `${colourway.mottleSecondaryHex}48`;
      pCtx.lineWidth = 7.5 * taperScale;
      pCtx.lineCap = 'round';
      pCtx.beginPath();
      pCtx.moveTo(xBase - 2, vDorsal * size);
      pCtx.quadraticCurveTo(
        xBase + 8,
        ((vDorsal + vVentral) * 0.5) * size,
        xBase - 1,
        vVentral * size
      );
      pCtx.stroke();
      pCtx.restore();

      eCtx.save();
      eCtx.strokeStyle = 'rgba(2, 132, 199, 0.32)';
      eCtx.lineWidth = 8.5 * taperScale;
      eCtx.lineCap = 'round';
      eCtx.beginPath();
      eCtx.moveTo(xBase - 2, vDorsal * size);
      eCtx.quadraticCurveTo(
        xBase + 8,
        ((vDorsal + vVentral) * 0.5) * size,
        xBase - 1,
        vVentral * size
      );
      eCtx.stroke();
      eCtx.restore();

      const numElements = 16;
      for (let k = 0; k < numElements; k++) {
        const frac = k / (numElements - 1);
        const vPos = vDorsal + frac * (vVentral - vDorsal);

        // Natural biological bar sweep: angles slightly forward from dorsal crest then curves gently rearward on mid-flank
        const curveSweep =
          Math.sin(frac * Math.PI * 1.08) * 7.5 -
          Math.cos(frac * Math.PI * 0.8 + barPhase * 0.15) * 2.5;
        const jitterX = (rand() - 0.5) * 2.6;
        const jitterY = (rand() - 0.5) * 2.0;
        const cx = xBase + curveSweep + jitterX;
        const cy = vPos * size + jitterY;

        const envAlpha = Math.sin(Math.pow(frac, 0.76) * Math.PI);
        if (envAlpha < 0.06) continue;

        // Dorsal 65% features elongated vertical dashes; ventral 35% transitions into ovoid spots
        const isDash = frac < 0.65 ? k % 3 !== 2 : k % 2 === 0;
        const rx = (2.1 + rand() * 1.1) * taperScale;
        const ry =
          (isDash ? 9.5 + rand() * 4.5 : 3.2 + rand() * 1.8) *
          taperScale *
          (0.72 + 0.38 * envAlpha);
        const tilt =
          (flank === 0 ? 1 : -1) * (0.10 * Math.cos(frac * Math.PI) + (rand() - 0.5) * 0.08);

        // Draw primary organic chromatophore dash/spot on pigmentMap
        pCtx.save();
        pCtx.translate(cx, cy);
        pCtx.rotate(tilt);

        const spotGrad = pCtx.createRadialGradient(0, 0, rx * 0.1, 0, 0, Math.max(rx, ry) * 1.18);
        spotGrad.addColorStop(0, colourway.mottleSpotHex);
        spotGrad.addColorStop(0.45, colourway.mottleSecondaryHex);
        spotGrad.addColorStop(0.82, `${colourway.mottlePrimaryHex}aa`);
        spotGrad.addColorStop(1, 'transparent');
        pCtx.fillStyle = spotGrad;
        pCtx.beginPath();
        pCtx.ellipse(0, 0, rx * 1.15, ry * 1.12, 0, 0, Math.PI * 2);
        pCtx.fill();
        pCtx.restore();

        // Draw electric-blue bioluminescent core on stripeEmissiveMap for "Light-Up" mode
        eCtx.save();
        eCtx.translate(cx, cy);
        eCtx.rotate(tilt);
        const emiGrad = eCtx.createRadialGradient(0, 0, rx * 0.08, 0, 0, Math.max(rx, ry) * 1.28);
        emiGrad.addColorStop(0, '#bae6fd');
        emiGrad.addColorStop(0.36, '#00e5ff');
        emiGrad.addColorStop(0.75, '#0284c7');
        emiGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        eCtx.fillStyle = emiGrad;
        eCtx.beginPath();
        eCtx.ellipse(0, 0, rx * 1.22, ry * 1.18, 0, 0, Math.PI * 2);
        eCtx.fill();
        eCtx.restore();
      }
    }
  }

  // 3. Dedicated Dark Pigmented Fin-Ray Band in u = 0.88..1.0
  // Fin vertices map root-to-tip along X (0.89..0.985) and chordwise ray-to-ray along Y (0.0..0.90)
  const finBandX = Math.floor(0.88 * size);
  const finGrad = pCtx.createLinearGradient(finBandX, 0, size, 0);
  finGrad.addColorStop(0, colourway.mottlePrimaryHex);
  finGrad.addColorStop(0.45, colourway.outerDeepHex);
  finGrad.addColorStop(0.85, colourway.outerJellyHex);
  finGrad.addColorStop(1.0, colourway.mottlePrimaryHex);
  pCtx.fillStyle = finGrad;
  pCtx.fillRect(finBandX, 0, size - finBandX, size);

  // Subtle radial bony fin-ray striations running from fin root (finBandX) to fin tip (size)
  for (let r = 0; r < 84; r++) {
    const yRay = (r / 84) * size;
    pCtx.strokeStyle =
      r % 2 === 0 ? `${colourway.mottlePrimaryHex}88` : `${colourway.outerDeepHex}44`;
    pCtx.lineWidth = 1.4;
    pCtx.beginPath();
    pCtx.moveTo(finBandX, yRay);
    pCtx.lineTo(size, yRay);
    pCtx.stroke();

    if (r % 3 === 0) {
      eCtx.strokeStyle = 'rgba(0, 229, 255, 0.14)';
      eCtx.lineWidth = 1.1;
      eCtx.beginPath();
      eCtx.moveTo(finBandX + 4, yRay);
      eCtx.lineTo(size - 6, yRay);
      eCtx.stroke();
    }
  }

  const pigmentMap = new THREE.CanvasTexture(pigCanvas);
  pigmentMap.colorSpace = THREE.SRGBColorSpace;
  pigmentMap.wrapS = THREE.ClampToEdgeWrapping;
  pigmentMap.wrapT = THREE.RepeatWrapping;
  pigmentMap.anisotropy = anisotropy;
  pigmentMap.needsUpdate = true;

  const stripeEmissiveMap = new THREE.CanvasTexture(emiCanvas);
  stripeEmissiveMap.colorSpace = THREE.SRGBColorSpace;
  stripeEmissiveMap.wrapS = THREE.ClampToEdgeWrapping;
  stripeEmissiveMap.wrapT = THREE.RepeatWrapping;
  stripeEmissiveMap.anisotropy = anisotropy;
  stripeEmissiveMap.needsUpdate = true;

  const result = { pigmentMap, stripeEmissiveMap };
  _marlinPigmentCache.set(cacheKey, result);
  return result;
}

/**
 * Generates a high-resolution tangent-space normal map (512x512) encoding the fine
 * anatomical surface bumps of the Blue Marlin without any vertical ribbing artifacts on the body:
 * - Body Trunk (`u in 0.00..0.86`):
 *   - Smooth rostral bill denticle micro-grain (`u in 0.00..0.22`)
 *   - Mouth gape mandibular commissure groove & maxillary lip ridge (`u in 0.115..0.255`)
 *   - Paired nostrils / olfactory nares ahead of the orbit (`u ~ 0.232`)
 *   - Multi-plate Operculum (preopercle ridge, gill cover seam, branchiostegal rays at `u ~ 0.275..0.325`)
 *   - Continuous Lateral Line sensory canal with neuromast pores (`u in 0.30..0.85`)
 *   - Fine elongated pelagic dermal scale imbrications (`u in 0.30..0.84`)
 * - Fin UV Band (`u in 0.88..1.00` ONLY):
 *   - Radial bony lepidotrichia fin-ray ridges running from fin base to fin tip
 */
export function createMarlinNormalTexture(anisotropy = 4): THREE.CanvasTexture {
  if (_cachedMarlinNormalTex) {
    return _cachedMarlinNormalTex;
  }
  const size = 512;
  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext('2d')!;

  // Neutral mid-height (128)
  hCtx.fillStyle = 'rgb(128, 128, 128)';
  hCtx.fillRect(0, 0, size, size);

  // 1. Subtle Elongated Pelagic Scale Imbrications on the Body Trunk (u in 0.31..0.83)
  let seed = 90421;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  hCtx.lineCap = 'round';
  for (let i = 0; i < 380; i++) {
    const u = 0.31 + rand() * 0.51;
    const v = 0.06 + rand() * 0.88;
    if (Math.abs(v - 0.5) < 0.08) continue;
    const sx = u * size;
    const sy = v * size;
    hCtx.strokeStyle = i % 2 === 0 ? 'rgba(136, 136, 136, 0.22)' : 'rgba(120, 120, 120, 0.22)';
    hCtx.lineWidth = 1.0;
    hCtx.beginPath();
    hCtx.moveTo(sx - 3.0, sy);
    hCtx.lineTo(sx + 3.0, sy + (v < 0.5 ? 0.6 : -0.6));
    hCtx.stroke();
  }

  // 2. Curved Operculum (Gill Cover) & Preopercle Plates at u ~ 0.275..0.325 on both flanks
  for (const vFlank of [0.25, 0.75]) {
    const cy = vFlank * size;
    const cx = 0.292 * size;
    const r = size * 0.102;

    // Posterior opercular cleft groove
    hCtx.strokeStyle = 'rgb(88, 88, 88)';
    hCtx.lineWidth = 2.6;
    hCtx.beginPath();
    hCtx.arc(cx, cy, r, -0.82, 0.82);
    hCtx.stroke();

    // Raised opercular margin ridge
    hCtx.strokeStyle = 'rgb(168, 168, 168)';
    hCtx.lineWidth = 2.0;
    hCtx.beginPath();
    hCtx.arc(cx - 2.2, cy, r, -0.80, 0.80);
    hCtx.stroke();

    // Anterior preopercular crescent seam
    hCtx.strokeStyle = 'rgb(96, 96, 96)';
    hCtx.lineWidth = 1.8;
    hCtx.beginPath();
    hCtx.arc(cx - 10, cy, r * 0.84, -0.68, 0.68);
    hCtx.stroke();

    // Sub-opercular branchiostegal rays
    hCtx.strokeStyle = 'rgb(152, 152, 152)';
    hCtx.lineWidth = 1.2;
    for (let b = 0; b < 4; b++) {
      const ang = (vFlank < 0.5 ? 0.22 : -0.58) + b * 0.11;
      hCtx.beginPath();
      hCtx.arc(cx - 4, cy, r * (0.72 + b * 0.055), ang, ang + 0.30);
      hCtx.stroke();
    }
  }

  // 3. Mouth Gape (mandibular cleft groove extending from u = 0.115 to u = 0.255)
  for (const vJaw of [0.34, 0.66]) {
    const yJaw = vJaw * size;
    hCtx.strokeStyle = 'rgb(78, 78, 78)';
    hCtx.lineWidth = 2.8;
    hCtx.beginPath();
    hCtx.moveTo(0.115 * size, yJaw);
    hCtx.quadraticCurveTo(0.185 * size, yJaw + (vJaw < 0.5 ? 4 : -4), 0.255 * size, yJaw);
    hCtx.stroke();

    // Raised maxillary lip ridge above gape
    hCtx.strokeStyle = 'rgb(168, 168, 168)';
    hCtx.lineWidth = 1.8;
    hCtx.beginPath();
    hCtx.moveTo(0.115 * size, yJaw + (vJaw < 0.5 ? -2.4 : 2.4));
    hCtx.quadraticCurveTo(
      0.185 * size,
      yJaw + (vJaw < 0.5 ? 1.2 : -1.2),
      0.255 * size,
      yJaw + (vJaw < 0.5 ? -2.4 : 2.4)
    );
    hCtx.stroke();
  }

  // 4. Nostrils (Paired Nares — anterior & posterior olfactory pits ahead of the eye at u = 0.232)
  for (const vNare of [0.19, 0.81]) {
    const nx = 0.232 * size;
    const ny = vNare * size;
    for (const dx of [-3.5, 2.5]) {
      const grad = hCtx.createRadialGradient(nx + dx, ny, 0.5, nx + dx, ny, 3.6);
      grad.addColorStop(0, 'rgb(72, 72, 72)');
      grad.addColorStop(0.65, 'rgb(160, 160, 160)');
      grad.addColorStop(1, 'rgb(128, 128, 128)');
      hCtx.fillStyle = grad;
      hCtx.beginPath();
      hCtx.arc(nx + dx, ny, 3.6, 0, Math.PI * 2);
      hCtx.fill();
    }
  }

  // 5. Lateral Line (delicate sensory canal arching over pectoral fin then straight to peduncle, u = 0.30..0.85)
  for (const vSide of [0.24, 0.76]) {
    const yBase = vSide * size;
    const archDir = vSide < 0.5 ? -1 : 1;

    hCtx.strokeStyle = 'rgb(162, 162, 162)';
    hCtx.lineWidth = 1.6;
    hCtx.beginPath();
    hCtx.moveTo(0.30 * size, yBase + archDir * 18);
    hCtx.bezierCurveTo(
      0.38 * size,
      yBase + archDir * 22,
      0.44 * size,
      yBase,
      0.85 * size,
      yBase
    );
    hCtx.stroke();

    hCtx.strokeStyle = 'rgb(102, 102, 102)';
    hCtx.lineWidth = 1.1;
    hCtx.beginPath();
    hCtx.moveTo(0.30 * size, yBase + archDir * 19.6);
    hCtx.bezierCurveTo(
      0.38 * size,
      yBase + archDir * 23.6,
      0.44 * size,
      yBase + archDir * 1.5,
      0.85 * size,
      yBase + archDir * 1.5
    );
    hCtx.stroke();
  }

  // 6. Fin-Ray Bony Lepidotrichia Ridges RESTRICTED STRICTLY to the Fin UV Band (u in 0.88..1.00)
  const finStartX = Math.floor(0.88 * size);
  for (let r = 0; r < 84; r++) {
    const y = (r / 84) * size;
    const isPeak = r % 2 === 0;
    hCtx.strokeStyle = isPeak ? 'rgb(168, 168, 168)' : 'rgb(92, 92, 92)';
    hCtx.lineWidth = 1.6;
    hCtx.beginPath();
    hCtx.moveTo(finStartX, y);
    hCtx.lineTo(size, y);
    hCtx.stroke();
  }

  // Convert heightfield into a tangent-space RGB normal map via Sobel gradients
  const srcData = hCtx.getImageData(0, 0, size, size).data;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = size;
  nCanvas.height = size;
  const nCtx = nCanvas.getContext('2d')!;
  const outImg = nCtx.createImageData(size, size);
  const dst = outImg.data;
  const strength = 1.85;

  const sampleH = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(size - 1, x));
    const cy = ((y % size) + size) % size;
    return srcData[(cy * size + cx) * 4] / 255.0;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dX =
        sampleH(x + 1, y - 1) +
        2 * sampleH(x + 1, y) +
        sampleH(x + 1, y + 1) -
        (sampleH(x - 1, y - 1) + 2 * sampleH(x - 1, y) + sampleH(x - 1, y + 1));
      const dY =
        sampleH(x - 1, y + 1) +
        2 * sampleH(x, y + 1) +
        sampleH(x + 1, y + 1) -
        (sampleH(x - 1, y - 1) + 2 * sampleH(x, y - 1) + sampleH(x + 1, y - 1));

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  nCtx.putImageData(outImg, 0, 0);

  const normalTex = new THREE.CanvasTexture(nCanvas);
  normalTex.colorSpace = THREE.NoColorSpace;
  normalTex.wrapS = THREE.ClampToEdgeWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.anisotropy = anisotropy;
  normalTex.needsUpdate = true;
  _cachedMarlinNormalTex = normalTex;
  return normalTex;
}

