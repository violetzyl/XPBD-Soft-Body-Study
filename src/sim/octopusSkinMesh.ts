import * as THREE from 'three';
import { DeformedArmStation, XPBDOctopusState } from './xpbdSolver';

export interface WeldedArmMeshes {
  dorsalGeometry: THREE.BufferGeometry;
  ventralGeometry: THREE.BufferGeometry;
  updateFromXPBD: (
    state: XPBDOctopusState,
    deformedArms: DeformedArmStation[][]
  ) => void;
}

/**
 * Creates two continuous, welded tubular skin geometries (Dorsal Outer Jelly Envelope + Ventral Milky Inner Layer)
 * for all 8 octopus arms:
 * - Zero gaps or detached segments when stretched or lifted
 * - Ventral milky layer is strictly enclosed within the ventral half of the outer translucent jelly envelope
 *   (preventing any bilayer poking or Z-fighting)
 * - Uses pre-computed trigonometric tables and direct analytical normals for O(V) zero-GC per-frame updates
 *   (eliminating expensive per-frame `computeVertexNormals()` passes)
 */
export function createWeldedArmMeshes(
  numArms = 8,
  numStations = 16,
  radialSegments = 14
): WeldedArmMeshes {
  // Include 2 extra rings at the tip (mid-hemisphere ring + apex cap) for a rounded, pinch-free tentacle tip
  const ringsPerArm = numStations + 2;
  const vertsPerRing = radialSegments + 1; // +1 for UV seam wrap
  const vertsPerArm = ringsPerArm * vertsPerRing;
  const totalVerts = numArms * vertsPerArm;

  const dorsalPos = new Float32Array(totalVerts * 3);
  const dorsalNormals = new Float32Array(totalVerts * 3);
  const dorsalUVs = new Float32Array(totalVerts * 2);

  const ventralPos = new Float32Array(totalVerts * 3);
  const ventralNormals = new Float32Array(totalVerts * 3);
  const ventralUVs = new Float32Array(totalVerts * 2);

  // Pre-compute ring trigonometric lookup tables once (avoids 2,000+ Math.cos/sin calls per frame)
  const cosTable = new Float32Array(vertsPerRing);
  const sinTable = new Float32Array(vertsPerRing);
  const vDorsalScaleTable = new Float32Array(vertsPerRing);
  for (let j = 0; j < vertsPerRing; j++) {
    const theta = (j / radialSegments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    cosTable[j] = c;
    sinTable[j] = s;
    // Flatten dorsal side of the inner milky core so it hugs the ventral half strictly inside the outer jelly
    vDorsalScaleTable[j] = c > 0 ? 0.36 : 0.72;
  }

  const indices: number[] = [];

  for (let k = 0; k < numArms; k++) {
    const armVertOffset = k * vertsPerArm;
    for (let r = 0; r < ringsPerArm; r++) {
      const u = Math.min(1, r / (numStations - 1));
      for (let j = 0; j < vertsPerRing; j++) {
        const v = j / radialSegments;
        const vIdx = armVertOffset + r * vertsPerRing + j;
        dorsalUVs[vIdx * 2] = u * 2.5;
        dorsalUVs[vIdx * 2 + 1] = v;
        ventralUVs[vIdx * 2] = u * 2.5;
        ventralUVs[vIdx * 2 + 1] = v;
      }
    }

    for (let r = 0; r < ringsPerArm - 1; r++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = armVertOffset + r * vertsPerRing + j;
        const b = a + 1;
        const c = armVertOffset + (r + 1) * vertsPerRing + j;
        const d = c + 1;
        // Outward counter-clockwise winding matching +(dorsalNormal * cosT + binormal * sinT)
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const dorsalPosAttr = new THREE.BufferAttribute(dorsalPos, 3);
  dorsalPosAttr.setUsage(THREE.DynamicDrawUsage);
  const dorsalNormAttr = new THREE.BufferAttribute(dorsalNormals, 3);
  dorsalNormAttr.setUsage(THREE.DynamicDrawUsage);

  const dorsalGeometry = new THREE.BufferGeometry();
  dorsalGeometry.setAttribute('position', dorsalPosAttr);
  dorsalGeometry.setAttribute('normal', dorsalNormAttr);
  dorsalGeometry.setAttribute('uv', new THREE.BufferAttribute(dorsalUVs, 2));
  dorsalGeometry.setIndex(indices);

  const ventralPosAttr = new THREE.BufferAttribute(ventralPos, 3);
  ventralPosAttr.setUsage(THREE.DynamicDrawUsage);
  const ventralNormAttr = new THREE.BufferAttribute(ventralNormals, 3);
  ventralNormAttr.setUsage(THREE.DynamicDrawUsage);

  const ventralGeometry = new THREE.BufferGeometry();
  ventralGeometry.setAttribute('position', ventralPosAttr);
  ventralGeometry.setAttribute('normal', ventralNormAttr);
  ventralGeometry.setAttribute('uv', new THREE.BufferAttribute(ventralUVs, 2));
  ventralGeometry.setIndex(indices);

  const updateFromXPBD = (
    state: XPBDOctopusState,
    deformedArms: DeformedArmStation[][]
  ) => {
    const pos = state.positions;
    const hc = state.headCoreParticle * 3;
    const hx = pos[hc];
    const hy = pos[hc + 1];
    const hz = pos[hc + 2];

    for (let k = 0; k < numArms; k++) {
      const stations = deformedArms[k];
      const armVertOffset = k * vertsPerArm;

      for (let r = 0; r < ringsPerArm; r++) {
        const isMidDome = r === numStations;
        const isTipApex = r === numStations + 1;
        const stIdx = r >= numStations ? numStations - 1 : r;
        const st = stations[stIdx];

        // Weld station 0 smoothly into the head collar so the arm root never detaches from the head
        const headBlend = r === 0 ? 0.42 : r === 1 ? 0.14 : 0.0;
        let cx = st.position.x * (1 - headBlend) + hx * headBlend;
        let cy = st.position.y * (1 - headBlend) + (hy - 0.12) * headBlend;
        let cz = st.position.z * (1 - headBlend) + hz * headBlend;

        if (isMidDome) {
          cx += st.tangent.x * (st.radius * 0.54);
          cy += st.tangent.y * (st.radius * 0.54);
          cz += st.tangent.z * (st.radius * 0.54);
        } else if (isTipApex) {
          cx += st.tangent.x * (st.radius * 0.98);
          cy += st.tangent.y * (st.radius * 0.98);
          cz += st.tangent.z * (st.radius * 0.98);
        }

        const rad = isTipApex
          ? 0.002
          : isMidDome
          ? st.radius * 0.62
          : st.radius * (r === 0 ? 1.15 : 1.0);

        // Smoothly taper the bilayer eccentricity offset to 0 across the final 4 stations (r >= numStations - 4)
        // so the slender tentacle tip remains centered on the smooth spine axis at any drag angle
        const tipOffsetTaper =
          r >= numStations
            ? 0.0
            : r >= numStations - 4
            ? (numStations - 1 - r) / 3.0
            : 1.0;

        const dOff = rad * 0.14 * tipOffsetTaper;
        const dCx = cx + st.dorsalNormal.x * dOff;
        const dCy = Math.max(rad + 0.010, cy + st.dorsalNormal.y * dOff);
        const dCz = cz + st.dorsalNormal.z * dOff;

        const vOff = rad * 0.12 * tipOffsetTaper;
        const vCx = cx + st.ventralNormal.x * vOff;
        const vCy = Math.max(rad * 0.8 + 0.018, cy + st.ventralNormal.y * vOff);
        const vCz = cz + st.ventralNormal.z * vOff;

        const dRad = rad * 0.96;
        const vRad = rad * 0.80;

        const dNx = st.dorsalNormal.x;
        const dNy = st.dorsalNormal.y;
        const dNz = st.dorsalNormal.z;
        const bNx = st.binormal.x;
        const bNy = st.binormal.y;
        const bNz = st.binormal.z;
        const tNx = st.tangent.x;
        const tNy = st.tangent.y;
        const tNz = st.tangent.z;

        for (let j = 0; j < vertsPerRing; j++) {
          const cosT = cosTable[j];
          const sinT = sinTable[j];

          // Radial unit vector in the (dorsalNormal, binormal) cross-section plane
          const rNx = dNx * cosT + bNx * sinT;
          const rNy = dNy * cosT + bNy * sinT;
          const rNz = dNz * cosT + bNz * sinT;

          // Unit outward normal (smoothly curves into a hemisphere across the 2 tip cap rings)
          let nx = rNx;
          let ny = rNy;
          let nz = rNz;
          if (isTipApex) {
            nx = tNx;
            ny = tNy;
            nz = tNz;
          } else if (isMidDome) {
            nx = rNx * 0.78 + tNx * 0.62;
            ny = rNy * 0.78 + tNy * 0.62;
            nz = rNz * 0.78 + tNz * 0.62;
          }

          const vIdx = (armVertOffset + r * vertsPerRing + j) * 3;

          // 1. Dorsal outer translucent jelly tube (preserve circular cross-section using rNx/rNy/rNz)
          dorsalPos[vIdx] = dCx + rNx * dRad;
          dorsalPos[vIdx + 1] = Math.max(0.008, dCy + rNy * dRad);
          dorsalPos[vIdx + 2] = dCz + rNz * dRad;

          dorsalNormals[vIdx] = nx;
          dorsalNormals[vIdx + 1] = ny;
          dorsalNormals[vIdx + 2] = nz;

          // 2. Ventral milky inner layer (nestled inside with higher floor clearance y >= 0.016 to prevent Z-fighting)
          const vScaleDorsal = vDorsalScaleTable[j];
          const vScaleLat = 0.84;
          const vRx = dNx * (cosT * vScaleDorsal) + bNx * (sinT * vScaleLat);
          const vRy = dNy * (cosT * vScaleDorsal) + bNy * (sinT * vScaleLat);
          const vRz = dNz * (cosT * vScaleDorsal) + bNz * (sinT * vScaleLat);

          ventralPos[vIdx] = vCx + vRx * vRad;
          ventralPos[vIdx + 1] = Math.max(0.016, vCy + vRy * vRad);
          ventralPos[vIdx + 2] = vCz + vRz * vRad;

          ventralNormals[vIdx] = nx;
          ventralNormals[vIdx + 1] = ny;
          ventralNormals[vIdx + 2] = nz;
        }
      }
    }

    dorsalPosAttr.needsUpdate = true;
    dorsalNormAttr.needsUpdate = true;
    ventralPosAttr.needsUpdate = true;
    ventralNormAttr.needsUpdate = true;
  };

  return {
    dorsalGeometry,
    ventralGeometry,
    updateFromXPBD,
  };
}

