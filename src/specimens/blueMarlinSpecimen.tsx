import * as THREE from 'three';
import { BlueMarlinControlsModule } from '../components/controls/BlueMarlinControlsModule';
import {
  BlueMarlinSpecificParams,
  MarlinDragConstraint,
  computeBlueMarlinTelemetry,
  createBlueMarlinSimState,
  stepBlueMarlinSim,
  triggerMarlinBillSlash,
  triggerMarlinStripePulse,
  triggerMarlinTailSwish,
} from '../sim/blueMarlinSim';
import {
  DeformableFalcateFin,
  createFalcateFinGeometry,
  createMarlinLunateCaudalGeometry,
  createMarlinMandibleGeometry,
  createSpineSkinnedSailDorsal,
} from '../sim/blueMarlinSkinMesh';
import { COLOURWAYS, ColourwayId } from '../sim/colourways';
import {
  createMarlinNormalTexture,
  createMarlinPigmentAndStripeTextures,
} from '../sim/proceduralTextures';
import {
  JellySpecimenDefinition,
  SpecimenRuntimeController,
  SpecimenSharedResources,
  SpecimenTelemetry,
} from './types';

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();

export type MarlinGrabPart =
  | 'none'
  | 'bill'
  | 'spine'
  | 'dorsal1'
  | 'dorsal2'
  | 'anal1'
  | 'pec_left'
  | 'pec_right'
  | 'pelvic_left'
  | 'pelvic_right'
  | 'caudal';

interface MarlinFinDynamicState {
  id: Exclude<MarlinGrabPart, 'none' | 'bill' | 'spine'>;
  stationIdx: number;
  span: number;
  rootWorld: THREE.Vector3;
  tipWorld: THREE.Vector3;
  grabOriginWorld: THREE.Vector3;
  worldDeflect: THREE.Vector3;
  worldVel: THREE.Vector3;
}

export const BLUE_MARLIN_SPECIMEN: JellySpecimenDefinition<BlueMarlinSpecificParams> = {
  id: 'blue_marlin',
  name: 'Blue Marlin Bilayer Jelly Study',
  shortName: 'Blue Marlin',
  specimenPrefix: 'MRL-JL-03',
  specificControlsTitle: 'Marlin Pelagic Biomechanics',
  supportedColourways: ['cobalt', 'lilac', 'midnight', 'sunrise'],
  defaultColourway: 'cobalt',
  defaultParams: {
    tailSwishIntensity: 1.0,
    dorsalRaised: true,
    lightUpMode: true,
    slashTriggerSeq: 0,
    swishTriggerSeq: 0,
  },
  cameraPresets: [
    {
      id: 'studio',
      label: 'Studio 3/4',
      position: [2.75, 1.78, 3.05],
      target: [0, 0.52, 0.12],
    },
    {
      id: 'top',
      label: 'Top Profile',
      position: [0.01, 4.95, 0.20],
      target: [0, 0.45, 0.20],
    },
    {
      id: 'eye',
      label: 'Bill & Nape',
      position: [1.55, 0.98, 2.15],
      target: [0.0, 0.56, 0.95],
    },
    {
      id: 'curl',
      label: 'Crescent Tail',
      position: [1.75, 1.05, -2.25],
      target: [0.0, 0.58, -1.15],
    },
  ],
  studyNotes: {
    title: 'Makaira nigricans · SDF Bilayer Jelly, Normal Mapping & Electric-Blue Stripes',
    paragraphs: [
      'Anatomical Bilayer & Surface Bumps: A clear cobalt-hued outer jelly layer with Beer–Lambert absorption sits over a milky-silver underbelly with an angle-dependent guanine sheen. Dark dorsal pigment and ~15 lateral spot-and-dash stripes are paired with normal-mapped fin rays, operculum, mouth gape, nostrils, and lateral line.',
      'Muscle-Strain & Volume-Preserving Dorsal Compression: Trigger a Tail Swish, slash the long rounded bill rapidly side-to-side through bait beads, fold or raise the tall anterior dorsal fin (vertically compressing the internal tetrahedral mesh while preserving total volume), and toggle Light-Up mode so the 15 lateral stripes glow and flash in electric blue.',
    ],
  },
  SpecificControlsComponent: BlueMarlinControlsModule,

  createController(
    shared: SpecimenSharedResources
  ): SpecimenRuntimeController<BlueMarlinSpecificParams> {
    const {
      scene,
      outerJellyMat,
      irisMat,
      pupilMat,
      socketMat,
      beadInstanced,
      maxBeads,
      contactShadowMesh,
      contactShadowMat,
      grabRingMesh,
      grabTetherLine,
      grabTetherGeo,
      grabTetherPositions,
      sssUniforms,
      isSoftwareGl,
    } = shared;

    const simState = createBlueMarlinSimState(40);
    const numSpine = simState.numSpine;
    const radialSegs = 36;
    const stationRenderY = new Float32Array(numSpine);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Dedicated Blue Marlin Bilayer & Fin Hydrofoil Materials with Traveling-Wave Bioluminescent Shader:
    let activeColourway: ColourwayId = 'cobalt';
    const initialPal = COLOURWAYS[activeColourway];
    const { pigmentMap, stripeEmissiveMap } =
      createMarlinPigmentAndStripeTextures(initialPal, 4);
    const marlinNormalTex = createMarlinNormalTexture(4);

    const marlinStripeUniforms = {
      uStripeWavePhase: { value: 0.0 },
      uStripeGlow: { value: simState.stripeGlowIntensity },
      uDragExcite: { value: 0.0 },
      uGrabAxialU: { value: 0.35 },
      uStripeEmissiveMap: { value: stripeEmissiveMap },
    };

    const attachMarlinStripeShader = (
      mat: THREE.MeshPhysicalMaterial,
      cacheKey: string
    ) => {
      mat.customProgramCacheKey = () => cacheKey;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSssColor = sssUniforms.uSssColor;
        shader.uniforms.uRimLightPos = sssUniforms.uRimLightPos;
        shader.uniforms.uRimLightColor = sssUniforms.uRimLightColor;
        shader.uniforms.uKeyLightPos = sssUniforms.uKeyLightPos;
        shader.uniforms.uSssStrength = sssUniforms.uSssStrength;
        shader.uniforms.uSssDistortion = sssUniforms.uSssDistortion;
        shader.uniforms.uSssPower = sssUniforms.uSssPower;
        shader.uniforms.uCausticShimmer = sssUniforms.uCausticShimmer;
        shader.uniforms.uTime = sssUniforms.uTime;
        shader.uniforms.uGrabWorldPos = sssUniforms.uGrabWorldPos;
        shader.uniforms.uStressGlow = sssUniforms.uStressGlow;
        shader.uniforms.uStripeWavePhase = marlinStripeUniforms.uStripeWavePhase;
        shader.uniforms.uStripeGlow = marlinStripeUniforms.uStripeGlow;
        shader.uniforms.uDragExcite = marlinStripeUniforms.uDragExcite;
        shader.uniforms.uGrabAxialU = marlinStripeUniforms.uGrabAxialU;
        shader.uniforms.uStripeEmissiveMap = marlinStripeUniforms.uStripeEmissiveMap;

        shader.vertexShader =
          `varying vec3 vJellyWorldPos;\nvarying vec2 vMarlinUV;\n` +
          shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
             vJellyWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
             vMarlinUV = uv;`
          );

        shader.fragmentShader =
          `varying vec3 vJellyWorldPos;
           varying vec2 vMarlinUV;
           uniform vec3 uSssColor;
           uniform vec3 uRimLightPos;
           uniform vec3 uRimLightColor;
           uniform vec3 uKeyLightPos;
           uniform float uSssStrength;
           uniform float uSssDistortion;
           uniform float uSssPower;
           uniform float uCausticShimmer;
           uniform float uTime;
           uniform vec3 uGrabWorldPos;
           uniform float uStressGlow;
           uniform float uStripeWavePhase;
           uniform float uStripeGlow;
           uniform float uDragExcite;
           uniform float uGrabAxialU;
           uniform sampler2D uStripeEmissiveMap;\n` +
          shader.fragmentShader
            .replace(
              '#include <dithering_fragment>',
              `vec3 viewVec = normalize(cameraPosition - vJellyWorldPos);
               vec3 rimDir = normalize(uRimLightPos - vJellyWorldPos);
               vec3 keyDir = normalize(uKeyLightPos - vJellyWorldPos);
               vec3 worldN = normalize(( vec4(normal, 0.0) * viewMatrix ).xyz);

               vec3 transHalfRim = normalize(rimDir + worldN * uSssDistortion);
               float backScatterRim = pow(clamp(dot(viewVec, -transHalfRim), 0.0, 1.0), uSssPower);
               vec3 transHalfKey = normalize(keyDir + worldN * uSssDistortion);
               float backScatterKey = pow(clamp(dot(viewVec, -transHalfKey), 0.0, 1.0), uSssPower + 0.8);

               float fresnelRim = pow(1.0 - clamp(abs(dot(viewVec, worldN)), 0.0, 1.0), 2.5);
               vec3 sssContribution = uSssColor * (backScatterRim * 0.85 + backScatterKey * 0.45 + fresnelRim * 0.55) * uSssStrength;
               sssContribution += uRimLightColor * (fresnelRim * backScatterRim * 0.45 * uSssStrength);

               if (uStripeGlow > 0.01) {
                 vec3 rawStripeEmi = texture2D(uStripeEmissiveMap, vMarlinUV).rgb;
                 float isFinBand = step(0.87, vMarlinUV.x);
                 float uBody = clamp(vMarlinUV.x / 0.86, 0.0, 1.0);
                 float tStripeZone = clamp((uBody - 0.295) / 0.545, 0.0, 1.0);
                 float rostralCaudalWave = 0.38 + 0.62 * sin(uStripeWavePhase - tStripeZone * 11.4);
                 float dvScintillation = 0.68 + 0.32 * cos(vMarlinUV.y * 46.0 - uStripeWavePhase * 1.9);
                 float grabProx = exp(-pow((uBody - uGrabAxialU) / 0.16, 2.0)) * uDragExcite;
                 float touchRipple = grabProx * (0.85 + 0.50 * sin(abs(uBody - uGrabAxialU) * 32.0 - uStripeWavePhase * 2.8));

                 float finSpan = clamp((vMarlinUV.x - 0.885) / 0.10, 0.0, 1.0);
                 float finPulse = 0.52 + 0.48 * sin(uStripeWavePhase * 1.25 - finSpan * 6.5 - vMarlinUV.y * 8.0);

                 float waveMod = mix(
                   (0.65 + 0.90 * rostralCaudalWave * dvScintillation) + touchRipple,
                   0.72 + 0.72 * finPulse,
                   isFinBand
                 );
                 float rawLen = length(rawStripeEmi);
                 float corePeak = smoothstep(0.42, 1.15, rawLen);
                 vec3 bioStripeRadiance = rawStripeEmi * uStripeGlow * waveMod * 1.28;
                 bioStripeRadiance += vec3(0.65, 0.98, 1.0) * corePeak * uStripeGlow * 0.52 * (rostralCaudalWave + touchRipple * 0.65);

                 float stripeMask = smoothstep(0.05, 0.75, rawLen);
                 sssContribution += bioStripeRadiance;
                 sssContribution += vec3(0.0, 0.86, 1.0) * fresnelRim * min(1.5, uStripeGlow * 0.30) * (0.30 + 0.70 * stripeMask);
               }

               if (uStressGlow > 0.01) {
                 float distToGrab = length(vJellyWorldPos - uGrabWorldPos);
                 float localStretch = exp(-distToGrab * distToGrab * 3.2) * uStressGlow;
                 sssContribution += mix(uSssColor, vec3(0.45, 0.95, 1.0), 0.55) * localStretch * (0.45 + 0.55 * fresnelRim);
               }

               if (uCausticShimmer > 0.01) {
                 float cWave1 = sin(vJellyWorldPos.x * 9.5 + uTime * 2.4) * cos(vJellyWorldPos.z * 9.5 - uTime * 1.9);
                 float cWave2 = sin((vJellyWorldPos.x + vJellyWorldPos.z) * 7.2 - uTime * 2.8);
                 float caustic = pow(max(0.0, 0.5 + 0.5 * (cWave1 * 0.6 + cWave2 * 0.4)), 4.0);
                 sssContribution += uRimLightColor * caustic * 0.28 * uCausticShimmer * max(0.2, worldN.y + 0.5);
               }

               gl_FragColor.rgb += sssContribution;
               #include <dithering_fragment>`
            );
      };
    };

    const marlinOuterMat = outerJellyMat.clone();
    marlinOuterMat.map = pigmentMap;
    marlinOuterMat.bumpMap = null;
    marlinOuterMat.normalMap = marlinNormalTex;
    marlinOuterMat.normalScale = new THREE.Vector2(0.26, 0.26);
    marlinOuterMat.ior = 1.15;
    marlinOuterMat.thickness = 0.22;
    marlinOuterMat.attenuationColor = new THREE.Color(initialPal.outerAttenuationHex);
    marlinOuterMat.attenuationDistance = 0.82;
    marlinOuterMat.emissive = new THREE.Color('#00e5ff');
    marlinOuterMat.emissiveMap = stripeEmissiveMap;
    marlinOuterMat.emissiveIntensity = 0.85;
    marlinOuterMat.sheen = 0.76;
    marlinOuterMat.sheenColor = new THREE.Color('#38bdf8');
    attachMarlinStripeShader(marlinOuterMat, 'marlin-outer-bio-v3');
    marlinOuterMat.needsUpdate = true;

    // Dedicated Fin Hydrofoil Material (single-layer watertight fins with crisp lepidotrichia fin rays & zero inner-core z-fighting)
    const marlinFinMat = marlinOuterMat.clone();
    marlinFinMat.normalScale = new THREE.Vector2(0.36, 0.36);
    marlinFinMat.transmission = isSoftwareGl ? 0.0 : 0.55;
    marlinFinMat.thickness = 0.06;
    marlinFinMat.opacity = isSoftwareGl ? 0.88 : 1.0;
    marlinFinMat.roughness = 0.18;
    marlinFinMat.iridescence = 0.68;
    marlinFinMat.iridescenceIOR = 1.38;
    attachMarlinStripeShader(marlinFinMat, 'marlin-fin-bio-v3');
    marlinFinMat.needsUpdate = true;

    // Dynamic internal bioluminescent PointLight that casts electric-blue light onto bait beads and tabletop slab in Light-Up mode
    const stripeBioLight = new THREE.PointLight('#00e5ff', 0.85, 3.4, 1.5);
    stripeBioLight.position.set(0, 0.55, 0.18);
    group.add(stripeBioLight);

    // Inner Milky-Silver Underbelly with Angle-Dependent Sheen (Iridescence + Grazing Cyan-Silver Sheen)
    const marlinBellyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPal.milkyVentralHex),
      emissive: new THREE.Color(initialPal.innerCoreHex),
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      iridescence: 0.88,
      iridescenceIOR: 1.42,
      sheen: 1.0,
      sheenRoughness: 0.16,
      sheenColor: new THREE.Color('#7dd3fc'),
    });

    // 2. SDF-Skinned Dual-Layer Trunk, Long Rounded Bill & Integrated Dual Caudal Peduncle Keels
    const vertsPerRing = radialSegs + 1;
    const totalVerts = numSpine * vertsPerRing;
    const cosTable = new Float32Array(vertsPerRing);
    const sinTable = new Float32Array(vertsPerRing);
    for (let j = 0; j < vertsPerRing; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      cosTable[j] = Math.cos(theta);
      sinTable[j] = Math.sin(theta);
    }

    const outerPos = new Float32Array(totalVerts * 3);
    const outerNorm = new Float32Array(totalVerts * 3);
    const outerUV = new Float32Array(totalVerts * 2);

    const innerPos = new Float32Array(totalVerts * 3);
    const innerNorm = new Float32Array(totalVerts * 3);
    const innerUV = new Float32Array(totalVerts * 2);

    const indices: number[] = [];
    for (let s = 0; s < numSpine; s++) {
      const u = s / (numSpine - 1);
      // Map body trunk u in [0, 1] strictly to texture U in [0.0, 0.86] so the trunk never samples the [0.88, 1.0] fin UV band!
      const uTex = u * 0.86;
      for (let j = 0; j < vertsPerRing; j++) {
        const vIdx = s * vertsPerRing + j;
        outerUV[vIdx * 2] = uTex;
        outerUV[vIdx * 2 + 1] = j / radialSegs;
        innerUV[vIdx * 2] = uTex;
        innerUV[vIdx * 2 + 1] = j / radialSegs;

        if (s < numSpine - 1 && j < radialSegs) {
          const a = s * vertsPerRing + j;
          const b = a + 1;
          const c = (s + 1) * vertsPerRing + j;
          const d = c + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    const outerGeo = new THREE.BufferGeometry();
    const outerPosAttr = new THREE.BufferAttribute(outerPos, 3);
    outerPosAttr.setUsage(THREE.DynamicDrawUsage);
    const outerNormAttr = new THREE.BufferAttribute(outerNorm, 3);
    outerNormAttr.setUsage(THREE.DynamicDrawUsage);
    outerGeo.setAttribute('position', outerPosAttr);
    outerGeo.setAttribute('normal', outerNormAttr);
    outerGeo.setAttribute('uv', new THREE.BufferAttribute(outerUV, 2));
    outerGeo.setIndex(indices);

    const innerGeo = new THREE.BufferGeometry();
    const innerPosAttr = new THREE.BufferAttribute(innerPos, 3);
    innerPosAttr.setUsage(THREE.DynamicDrawUsage);
    const innerNormAttr = new THREE.BufferAttribute(innerNorm, 3);
    innerNormAttr.setUsage(THREE.DynamicDrawUsage);
    innerGeo.setAttribute('position', innerPosAttr);
    innerGeo.setAttribute('normal', innerNormAttr);
    innerGeo.setAttribute('uv', new THREE.BufferAttribute(innerUV, 2));
    innerGeo.setIndex(indices);

    const outerMesh = new THREE.Mesh(outerGeo, marlinOuterMat);
    outerMesh.castShadow = !isSoftwareGl;
    outerMesh.frustumCulled = false;
    outerMesh.renderOrder = 2;
    group.add(outerMesh);

    const innerBellyMesh = new THREE.Mesh(innerGeo, marlinBellyMat);
    innerBellyMesh.frustumCulled = false;
    innerBellyMesh.renderOrder = 1;
    group.add(innerBellyMesh);

    // 3. Articulated Shorter Lower Jaw (Mandible) Contoured Flush with the Ventral Skull Joint (u = 0.235 -> 0.12)
    const mandibleGeo = createMarlinMandibleGeometry(0.42, 0.048, 0.032, 12, 14);
    const mandibleMesh = new THREE.Mesh(mandibleGeo, marlinOuterMat);
    mandibleMesh.rotation.order = 'YXZ';
    mandibleMesh.frustumCulled = false;
    mandibleMesh.renderOrder = 2;
    group.add(mandibleMesh);

    // 4. All Fins Designed with Convex Leading Edges, Falcate Trailing Edges & Flush Surface Mounting:
    // 4a. Spine-Skinned Primary Dorsal Fin (Tall Swept-Back Anterior Lobe + Low Crest, u = 0.265..0.685)
    const sailDorsalDef = createSpineSkinnedSailDorsal(0.82, 0.175, 28, 12);
    const sailDorsalOuter = new THREE.Mesh(sailDorsalDef.geometry, marlinFinMat);
    sailDorsalOuter.castShadow = !isSoftwareGl;
    sailDorsalOuter.frustumCulled = false;
    sailDorsalOuter.renderOrder = 2;
    group.add(sailDorsalOuter);

    // 4b. Secondary Dorsal Finlet (u ~ 0.74) & Secondary Anal Finlet (u ~ 0.78)
    const dorsalFinletDef = createFalcateFinGeometry(0.21, 0.038, 0.19, 0.15, 0.018, 0.05);
    const dorsalFinletMesh = new THREE.Mesh(dorsalFinletDef.geometry, marlinFinMat);
    dorsalFinletMesh.rotation.order = 'YXZ';
    dorsalFinletMesh.frustumCulled = false;
    dorsalFinletMesh.renderOrder = 2;
    group.add(dorsalFinletMesh);

    const analFinletDef = createFalcateFinGeometry(0.18, 0.032, 0.16, 0.13, 0.016, 0.04);
    const analFinletMesh = new THREE.Mesh(analFinletDef.geometry, marlinFinMat);
    analFinletMesh.rotation.order = 'YXZ';
    analFinletMesh.frustumCulled = false;
    analFinletMesh.renderOrder = 2;
    group.add(analFinletMesh);

    // 4c. Primary Falcate Anal Fin (u ~ 0.62)
    const primaryAnalDef = createFalcateFinGeometry(0.30, 0.042, 0.42, 0.25, 0.024, 0.09);
    const primaryAnalMesh = new THREE.Mesh(primaryAnalDef.geometry, marlinFinMat);
    primaryAnalMesh.rotation.order = 'YXZ';
    primaryAnalMesh.frustumCulled = false;
    primaryAnalMesh.renderOrder = 2;
    group.add(primaryAnalMesh);

    // 4d. Long Sickle-Shaped Pectoral Fins (u ~ 0.31)
    const leftPecDef = createFalcateFinGeometry(0.32, 0.042, 1.04, 0.54, 0.028, 0.16);
    const leftPecOuter = new THREE.Mesh(leftPecDef.geometry, marlinFinMat);
    leftPecOuter.castShadow = !isSoftwareGl;
    leftPecOuter.frustumCulled = false;
    leftPecOuter.renderOrder = 2;

    const rightPecDef = createFalcateFinGeometry(0.32, 0.042, 1.04, 0.54, 0.028, 0.16);
    const rightPecOuter = new THREE.Mesh(rightPecDef.geometry, marlinFinMat);
    rightPecOuter.castShadow = !isSoftwareGl;
    rightPecOuter.frustumCulled = false;
    rightPecOuter.renderOrder = 2;
    group.add(leftPecOuter, rightPecOuter);

    // 4e. Thin Ventral Pelvic Spines (u ~ 0.33)
    const leftPelvicDef = createFalcateFinGeometry(0.056, 0.010, 0.60, 0.46, 0.011, 0.08);
    const rightPelvicDef = createFalcateFinGeometry(0.056, 0.010, 0.60, 0.46, 0.011, 0.08);
    const leftPelvicMesh = new THREE.Mesh(leftPelvicDef.geometry, marlinFinMat);
    const rightPelvicMesh = new THREE.Mesh(rightPelvicDef.geometry, marlinFinMat);
    leftPelvicMesh.rotation.order = 'YXZ';
    rightPelvicMesh.rotation.order = 'YXZ';
    leftPelvicMesh.frustumCulled = false;
    rightPelvicMesh.frustumCulled = false;
    leftPelvicMesh.renderOrder = 2;
    rightPelvicMesh.renderOrder = 2;
    group.add(leftPelvicMesh, rightPelvicMesh);

    // 4f. Unified High Crescent-Shaped Lunate Caudal Tail (u ~ 0.97)
    const caudalLunateDef = createMarlinLunateCaudalGeometry(
      1.04,
      0.96,
      0.34,
      0.042,
      0.64,
      0.028,
      16,
      14
    );
    const caudalMesh = new THREE.Mesh(caudalLunateDef.geometry, marlinFinMat);
    caudalMesh.castShadow = !isSoftwareGl;
    caudalMesh.frustumCulled = false;
    caudalMesh.renderOrder = 2;
    group.add(caudalMesh);

    // 5. Large Pelagic Eyes Flush-Mounted in Lateral Orbital Sockets (u ~ 0.256)
    // Outward-facing hemisphere caps prevent the far-side eye from refracting through the translucent snout
    const eyeSocketGeo = new THREE.SphereGeometry(0.048, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const eyeIrisGeo = new THREE.SphereGeometry(0.038, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const eyePupilGeo = new THREE.SphereGeometry(0.024, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const marlinEyes: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.rotation.order = 'YXZ';
      const sMesh = new THREE.Mesh(eyeSocketGeo, socketMat);
      sMesh.rotation.z = -side * Math.PI * 0.5;
      sMesh.scale.set(0.88, 0.24, 1.02);
      const iMesh = new THREE.Mesh(eyeIrisGeo, irisMat);
      iMesh.rotation.z = -side * Math.PI * 0.5;
      iMesh.scale.set(0.88, 0.24, 0.94);
      iMesh.position.set(side * 0.005, 0.001, 0.002);
      const pMesh = new THREE.Mesh(eyePupilGeo, pupilMat);
      pMesh.rotation.z = -side * Math.PI * 0.5;
      pMesh.scale.set(0.95, 0.24, 0.82);
      pMesh.position.set(side * 0.009, 0.001, 0.003);
      eg.add(sMesh, iMesh, pMesh);
      group.add(eg);
      marlinEyes.push(eg);
    }

    // 6. Interactive Fin Dynamic States (mapped to 40-station spine indices)
    const finStates: Record<
      Exclude<MarlinGrabPart, 'none' | 'bill' | 'spine'>,
      MarlinFinDynamicState
    > = {
      dorsal1: {
        id: 'dorsal1',
        stationIdx: 14,
        span: 0.82,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      dorsal2: {
        id: 'dorsal2',
        stationIdx: 29,
        span: 0.19,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      anal1: {
        id: 'anal1',
        stationIdx: 24,
        span: 0.42,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pec_left: {
        id: 'pec_left',
        stationIdx: 12,
        span: 1.04,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pec_right: {
        id: 'pec_right',
        stationIdx: 12,
        span: 1.04,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pelvic_left: {
        id: 'pelvic_left',
        stationIdx: 13,
        span: 0.60,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pelvic_right: {
        id: 'pelvic_right',
        stationIdx: 13,
        span: 0.60,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      caudal: {
        id: 'caudal',
        stationIdx: 38,
        span: 1.04,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
    };

    const finMeshTargets: {
      mesh: THREE.Object3D;
      part: Exclude<MarlinGrabPart, 'none' | 'bill' | 'spine'>;
    }[] = [
      { mesh: sailDorsalOuter, part: 'dorsal1' },
      { mesh: leftPecOuter, part: 'pec_left' },
      { mesh: rightPecOuter, part: 'pec_right' },
      { mesh: primaryAnalMesh, part: 'anal1' },
      { mesh: dorsalFinletMesh, part: 'dorsal2' },
      { mesh: leftPelvicMesh, part: 'pelvic_left' },
      { mesh: rightPelvicMesh, part: 'pelvic_right' },
      { mesh: caudalMesh, part: 'caudal' },
    ];

    // 7. XPBD Tetrahedral & Axial Truss Wireframe Overlay (including the compressible Dorsal Fin Tetrahedral Cage!)
    const numCageLines = (numSpine - 1) * 5 + simState.dorsalTetras.length * 4;
    const tetLinePositions = new Float32Array(numCageLines * 2 * 3);
    const tetLineGeo = new THREE.BufferGeometry();
    const tetLineAttr = new THREE.BufferAttribute(tetLinePositions, 3);
    tetLineAttr.setUsage(THREE.DynamicDrawUsage);
    tetLineGeo.setAttribute('position', tetLineAttr);
    const tetLineMat = new THREE.LineBasicMaterial({
      color: '#00e5ff',
      transparent: true,
      opacity: 0.52,
    });
    const tetLines = new THREE.LineSegments(tetLineGeo, tetLineMat);
    tetLines.visible = false;
    tetLines.renderOrder = 4;
    scene.add(tetLines);

    let grabPart: MarlinGrabPart = 'none';
    let grabStationIdx = -1;
    let grabDorsalChordU = 0.14;
    const grabInitialHitWorld = new THREE.Vector3();
    const grabLocalOffsetFromStation = new THREE.Vector3();
    const grabTarget = new THREE.Vector3();
    const activeGrabPointWorld = new THREE.Vector3();
    let bodyOffsetY = 0;
    let bodyVelY = 0;
    let jellySquash = 0;
    let jellySquashVel = 0;
    let autoLiftTimer = 0;

    const applyFinDeformation = (
      finObj: THREE.Object3D,
      finState: MarlinFinDynamicState,
      outerDef: DeformableFalcateFin,
      scaleY = 1.0,
      scaleXZ = 1.0
    ) => {
      finState.rootWorld.copy(finObj.position);
      _v0.set(0, finState.span * 0.82 * scaleY, -finState.span * 0.28);
      _v0.applyQuaternion(finObj.quaternion).add(finObj.position);
      finState.tipWorld.copy(_v0);

      _invQuat.copy(finObj.quaternion).invert();
      _v1.copy(finState.worldDeflect).applyQuaternion(_invQuat);
      outerDef.applyLocalBendAndScale(_v1.x, _v1.y, _v1.z, scaleY, scaleXZ);
    };

    const syncVisuals = (cameraPosition: THREE.Vector3) => {
      const stations = simState.stations;
      const squashY = Math.max(0.68, 1.0 - jellySquash * 0.48);
      const squashXZ = 1.0 / Math.sqrt(squashY);

      // Volume-preserving dorsal fin compression transfers displaced volume into the dorsal nape ridge
      const dorsalFoldScaleY = Math.max(0.22, simState.dorsalElevationBlend);
      const dorsalFoldScaleXZ = 1.0 / Math.sqrt(dorsalFoldScaleY);
      const napeVolumeCompensation = 1.0 + (1.0 - dorsalFoldScaleY) * 0.14;

      // Update Electric-Blue Lateral Stripe Luminescence intensity, traveling wave uniforms & internal bioluminescent light
      marlinOuterMat.emissiveIntensity = simState.stripeGlowIntensity * 1.12;
      marlinFinMat.emissiveIntensity = simState.stripeGlowIntensity * 0.75;
      marlinBellyMat.emissiveIntensity =
        0.16 + Math.min(0.32, simState.stripeGlowIntensity * 0.14);

      marlinStripeUniforms.uStripeWavePhase.value = simState.stripeWavePhase;
      marlinStripeUniforms.uStripeGlow.value = simState.stripeGlowIntensity;
      if (grabPart !== 'none' && grabStationIdx >= 0) {
        marlinStripeUniforms.uGrabAxialU.value =
          simState.stations[grabStationIdx].u;
        const dragMag = grabTarget.distanceTo(grabInitialHitWorld);
        marlinStripeUniforms.uDragExcite.value = Math.min(
          1.4,
          0.55 + dragMag * 0.85
        );
      } else {
        marlinStripeUniforms.uDragExcite.value *= 0.88;
      }

      const midSt = stations[16];
      stripeBioLight.position.set(midSt.pos.x, midSt.pos.y + 0.08, midSt.pos.z);
      stripeBioLight.intensity = simState.lightUpMode
        ? Math.min(1.65, simState.stripeGlowIntensity * 0.62)
        : 0.0;

      // 1. Update SDF-Skinned Dual-Layer Trunk, Long Rounded Bill & Integrated Dual Caudal Keels
      for (let s = 0; s < numSpine; s++) {
        const st = stations[s];
        const u = st.u;
        const cosYaw = Math.cos(st.yaw);
        const sinYaw = Math.sin(st.yaw);

        const dorsalZoneWeight =
          u >= 0.22 && u <= 0.72
            ? Math.sin(((u - 0.22) / 0.50) * Math.PI)
            : 0.0;
        const localWidthScale =
          squashXZ * (1.0 + (napeVolumeCompensation - 1.0) * dorsalZoneWeight);
        const rx = st.rx * localWidthScale;
        const ry = st.ry * squashY;

        let cavityEnv = 0.0;
        if (u > 0.05 && u < 0.90) {
          cavityEnv = Math.sin(Math.pow((u - 0.05) / 0.85, 0.78) * Math.PI);
        }

        const centerWy = Math.max(
          0.018 + ry + st.ventralDepth * squashY,
          st.pos.y + bodyOffsetY
        );
        stationRenderY[s] = centerWy;

        for (let j = 0; j < vertsPerRing; j++) {
          const cosT = cosTable[j];
          const sinT = sinTable[j];

          let yOffset = 0;
          if (cosT > 0) {
            yOffset = st.dorsalArch * Math.pow(cosT, 1.38) * squashY;
          } else {
            yOffset = -st.ventralDepth * Math.pow(-cosT, 1.28) * squashY;
          }

          let xFlare = 0;
          if (st.keelFlare > 0 && Math.abs(sinT) > 0.58) {
            const upperKeelLobe = Math.exp(-Math.pow((cosT - 0.25) / 0.14, 2));
            const lowerKeelLobe = Math.exp(-Math.pow((cosT + 0.25) / 0.14, 2));
            xFlare =
              Math.sign(sinT) *
              st.keelFlare *
              Math.pow(Math.abs(sinT), 1.5) *
              (upperKeelLobe + lowerKeelLobe);
          }

          const localX = sinT * rx + xFlare;
          const localY = cosT * ry + yOffset;

          const wx = st.pos.x + cosYaw * localX;
          const wy = centerWy + localY;
          const wz = st.pos.z + sinYaw * localX;

          const nx = cosYaw * sinT;
          const ny = cosT;
          const nz = sinYaw * sinT;
          const nLen = Math.hypot(nx, ny, nz) || 1;

          const vIdx = (s * vertsPerRing + j) * 3;
          outerPos[vIdx] = wx;
          outerPos[vIdx + 1] = wy;
          outerPos[vIdx + 2] = wz;
          outerNorm[vIdx] = nx / nLen;
          outerNorm[vIdx + 1] = ny / nLen;
          outerNorm[vIdx + 2] = nz / nLen;

          const innerScaleX = 0.62 * cavityEnv;
          const innerScaleY = (cosT > 0 ? 0.36 : 0.66) * cavityEnv;
          const innerLocalX = sinT * rx * innerScaleX;
          const innerLocalY =
            -ry * 0.06 * cavityEnv + localY * innerScaleY;

          const iwx = st.pos.x + cosYaw * innerLocalX;
          const iwy = centerWy + innerLocalY;
          const iwz = st.pos.z + sinYaw * innerLocalX;

          innerPos[vIdx] = iwx;
          innerPos[vIdx + 1] = iwy;
          innerPos[vIdx + 2] = iwz;
          innerNorm[vIdx] = nx / nLen;
          innerNorm[vIdx + 1] = ny / nLen;
          innerNorm[vIdx + 2] = nz / nLen;
        }
      }

      outerPosAttr.needsUpdate = true;
      outerNormAttr.needsUpdate = true;
      innerPosAttr.needsUpdate = true;
      innerNormAttr.needsUpdate = true;

      // Update bounding sphere of outerMesh so Three.js raycasting is accurate when body translates/deforms
      outerGeo.computeBoundingSphere();

      // 2. Articulated Shorter Lower Jaw (Mandible) Hinged at Ventral Skull Joint (station 9 -> station 5 chord)
      const stJaw = stations[9];
      const stBillMid = stations[5];
      const cosJ = Math.cos(stJaw.yaw);
      const sinJ = Math.sin(stJaw.yaw);
      const jawDx = stBillMid.pos.x - stJaw.pos.x;
      const jawDy = stationRenderY[5] - stationRenderY[9];
      const jawDz = stBillMid.pos.z - stJaw.pos.z;
      const jawHoriz = Math.hypot(jawDx, jawDz) || 1e-5;
      const jawChordYaw = Math.atan2(jawDx, jawDz);
      const jawChordPitch = Math.atan2(jawDy, jawHoriz);

      mandibleMesh.position.set(
        stJaw.pos.x - sinJ * 0.015,
        stationRenderY[9] - (stJaw.ry * 0.56) * squashY,
        stJaw.pos.z - cosJ * 0.015
      );
      mandibleMesh.rotation.set(
        simState.jawGapeAngle - jawChordPitch,
        jawChordYaw,
        0
      );

      // 3. Spine-Skinned Tall Swept-Back Anterior Dorsal Lobe + Low Crest
      const swishBoost =
        simState.tailSwishBurstTimer > 0
          ? 1.0 + 0.95 * Math.sin((simState.tailSwishBurstTimer / 1.05) * Math.PI)
          : 1.0;
      const effectiveSwish = simState.tailSwishIntensity * swishBoost;

      sailDorsalDef.updateFromSpine(
        stations,
        stationRenderY,
        squashY,
        dorsalFoldScaleY,
        dorsalFoldScaleXZ,
        simState.dorsalSweepFold,
        finStates.dorsal1.worldDeflect,
        grabDorsalChordU,
        simState.swimPhase,
        effectiveSwish,
        finStates.dorsal1.rootWorld,
        finStates.dorsal1.tipWorld
      );
      sailDorsalDef.geometry.computeBoundingSphere();

      // 4. Secondary Dorsal Finlet (station 29, u ~ 0.74) & Anal Finlet (station 31, u ~ 0.79)
      const stD2 = stations[29];
      dorsalFinletMesh.position.set(
        stD2.pos.x,
        stationRenderY[29] + (stD2.ry + stD2.dorsalArch) * squashY - 0.005,
        stD2.pos.z
      );
      dorsalFinletMesh.rotation.set(stD2.pitch * 0.5, -stD2.yaw, 0);
      applyFinDeformation(dorsalFinletMesh, finStates.dorsal2, dorsalFinletDef);

      const stA2 = stations[31];
      analFinletMesh.position.set(
        stA2.pos.x,
        Math.max(
          0.05,
          stationRenderY[31] - (stA2.ry + stA2.ventralDepth) * squashY + 0.005
        ),
        stA2.pos.z
      );
      analFinletMesh.rotation.set(-stA2.pitch * 0.5, -stA2.yaw, Math.PI);

      // 5. Primary Falcate Anal Fin (station 24, u ~ 0.615)
      const stA1 = stations[24];
      primaryAnalMesh.position.set(
        stA1.pos.x,
        Math.max(
          0.07,
          stationRenderY[24] - (stA1.ry + stA1.ventralDepth) * squashY + 0.006
        ),
        stA1.pos.z
      );
      primaryAnalMesh.rotation.set(-stA1.pitch * 0.5, -stA1.yaw, Math.PI);
      applyFinDeformation(primaryAnalMesh, finStates.anal1, primaryAnalDef);

      // 6. Long Sickle-Shaped Pectoral Fins with Dynamic Hydroplane Flare & Sprint Tuck (station 12, u ~ 0.308)
      const stPec = stations[12];
      const cosPec = Math.cos(stPec.yaw);
      const sinPec = Math.sin(stPec.yaw);
      const pecSweepAngle = 0.52 - simState.pecFlareBlend * 0.34;
      const pecDihedral =
        1.86 -
        simState.pecFlareBlend * 0.24 +
        Math.sin(simState.swimPhase * 0.5) * 0.035;
      const pecSurfaceX = stPec.rx * squashXZ * 0.96;

      leftPecOuter.position.set(
        stPec.pos.x + cosPec * pecSurfaceX,
        Math.max(0.05, stationRenderY[12] - stPec.ry * squashY * 0.32),
        stPec.pos.z + sinPec * pecSurfaceX
      );
      leftPecOuter.rotation.set(0.08, -stPec.yaw - pecSweepAngle, -pecDihedral);
      applyFinDeformation(leftPecOuter, finStates.pec_left, leftPecDef);

      rightPecOuter.position.set(
        stPec.pos.x - cosPec * pecSurfaceX,
        Math.max(0.05, stationRenderY[12] - stPec.ry * squashY * 0.32),
        stPec.pos.z - sinPec * pecSurfaceX
      );
      rightPecOuter.rotation.set(0.08, -stPec.yaw + pecSweepAngle, pecDihedral);
      applyFinDeformation(rightPecOuter, finStates.pec_right, rightPecDef);

      // 7. Thin Ventral Pelvic Spines (station 13, u ~ 0.333)
      const stPelv = stations[13];
      const cosPelv = Math.cos(stPelv.yaw);
      const sinPelv = Math.sin(stPelv.yaw);
      const pelvSweep = -1.16 - (1.0 - simState.pecFlareBlend) * 0.18;
      const pelvSurfaceY = Math.max(
        0.04,
        stationRenderY[13] - (stPelv.ry + stPelv.ventralDepth) * squashY + 0.004
      );
      leftPelvicMesh.position.set(
        stPelv.pos.x + cosPelv * 0.032,
        pelvSurfaceY,
        stPelv.pos.z + sinPelv * 0.032
      );
      leftPelvicMesh.rotation.set(pelvSweep, -stPelv.yaw - 0.07, Math.PI);
      applyFinDeformation(leftPelvicMesh, finStates.pelvic_left, leftPelvicDef);

      rightPelvicMesh.position.set(
        stPelv.pos.x - cosPelv * 0.032,
        pelvSurfaceY,
        stPelv.pos.z - sinPelv * 0.032
      );
      rightPelvicMesh.rotation.set(pelvSweep, -stPelv.yaw + 0.07, Math.PI);
      applyFinDeformation(rightPelvicMesh, finStates.pelvic_right, rightPelvicDef);

      // 8. Unified High Crescent-Shaped Lunate Caudal Tail with Double-Hinged Feathering (station 38, u ~ 0.974)
      const stTail = stations[38];
      caudalMesh.position.set(
        stTail.pos.x,
        stationRenderY[38],
        stTail.pos.z
      );
      caudalMesh.rotation.set(0, simState.caudalFeatherAngle, 0);
      applyFinDeformation(caudalMesh, finStates.caudal, caudalLunateDef);

      // 9. Large Pelagic Eyes Flush-Mounted in Lateral Orbital Sockets (station 10, u ~ 0.256)
      const stEye = stations[10];
      const cosEye = Math.cos(stEye.yaw);
      const sinEye = Math.sin(stEye.yaw);
      const eyeSurfaceX = stEye.rx * squashXZ * 0.97;
      marlinEyes[0].position.set(
        stEye.pos.x - cosEye * eyeSurfaceX,
        stationRenderY[10] + stEye.ry * squashY * 0.14,
        stEye.pos.z - sinEye * eyeSurfaceX
      );
      marlinEyes[0].rotation.set(-stEye.pitch * 0.6, -stEye.yaw, 0.14);

      marlinEyes[1].position.set(
        stEye.pos.x + cosEye * eyeSurfaceX,
        stationRenderY[10] + stEye.ry * squashY * 0.14,
        stEye.pos.z + sinEye * eyeSurfaceX
      );
      marlinEyes[1].rotation.set(-stEye.pitch * 0.6, -stEye.yaw, -0.14);

      // 10. Contact Shadow
      contactShadowMesh.position.x = stations[15].pos.x * 0.5;
      contactShadowMesh.position.z = stations[15].pos.z;
      contactShadowMat.opacity = Math.max(
        0.22,
        0.85 * Math.exp(-bodyOffsetY * 0.75)
      );

      // 11. Bait Beads InstancedMesh
      for (let b = 0; b < maxBeads; b++) {
        const bead = simState.beads[b];
        if (bead) {
          _v0.set(bead.pos.x, bead.pos.y, bead.pos.z);
          _quat.identity();
          _scale.setScalar(bead.r);
          _mat4.compose(_v0, _quat, _scale);
        } else {
          _mat4.makeScale(0, 0, 0);
        }
        beadInstanced.setMatrixAt(b, _mat4);
      }
      beadInstanced.instanceMatrix.needsUpdate = true;

      // 12. XPBD Axial & Compressible Dorsal Tetrahedral Cage Wireframe
      if (tetLines.visible) {
        let ptr = 0;
        for (let s = 0; s < numSpine - 1; s++) {
          const stA = stations[s];
          const stB = stations[s + 1];
          const cA = Math.cos(stA.yaw);
          const sA = Math.sin(stA.yaw);
          const cB = Math.cos(stB.yaw);
          const sB = Math.sin(stB.yaw);

          tetLinePositions[ptr++] = stA.pos.x;
          tetLinePositions[ptr++] = stationRenderY[s];
          tetLinePositions[ptr++] = stA.pos.z;
          tetLinePositions[ptr++] = stB.pos.x;
          tetLinePositions[ptr++] = stationRenderY[s + 1];
          tetLinePositions[ptr++] = stB.pos.z;

          const offsets: [number, number][] = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [ox, oy] of offsets) {
            tetLinePositions[ptr++] = stA.pos.x + cA * ox * stA.rx * 0.85;
            tetLinePositions[ptr++] =
              stationRenderY[s] + oy * stA.ry * 0.85;
            tetLinePositions[ptr++] = stA.pos.z + sA * ox * stA.rx * 0.85;
            tetLinePositions[ptr++] = stB.pos.x + cB * ox * stB.rx * 0.85;
            tetLinePositions[ptr++] =
              stationRenderY[s + 1] + oy * stB.ry * 0.85;
            tetLinePositions[ptr++] = stB.pos.z + sB * ox * stB.rx * 0.85;
          }
        }

        // Draw internal Dorsal Fin Tetrahedral Truss nodes (compressing vertically when folded!)
        for (const tet of simState.dorsalTetras) {
          const sIdx = tet.stationIdx;
          const st = stations[sIdx];
          const uChord = Math.max(0, Math.min(1, (st.u - 0.265) / 0.42));
          const hNorm = tet.restHeight / 0.82;
          const baseY =
            stationRenderY[sIdx] + (st.ry + st.dorsalArch) * squashY - 0.015;
          const tipY = baseY + tet.currentHeight * 0.96;
          const halfW = tet.currentWidth * 1.15;
          const totalSweepZ =
            (0.24 * (1.0 - 0.35 * uChord) + 0.04) * Math.pow(hNorm, 1.22) +
            simState.dorsalSweepFold * 0.22 * Math.pow(hNorm, 1.15);
          const sweepZ = -totalSweepZ;

          tetLinePositions[ptr++] = st.pos.x - halfW;
          tetLinePositions[ptr++] = baseY;
          tetLinePositions[ptr++] = st.pos.z;
          tetLinePositions[ptr++] = st.pos.x;
          tetLinePositions[ptr++] = tipY;
          tetLinePositions[ptr++] = st.pos.z + sweepZ;

          tetLinePositions[ptr++] = st.pos.x + halfW;
          tetLinePositions[ptr++] = baseY;
          tetLinePositions[ptr++] = st.pos.z;
          tetLinePositions[ptr++] = st.pos.x;
          tetLinePositions[ptr++] = tipY;
          tetLinePositions[ptr++] = st.pos.z + sweepZ;

          tetLinePositions[ptr++] = st.pos.x - halfW;
          tetLinePositions[ptr++] = baseY;
          tetLinePositions[ptr++] = st.pos.z;
          tetLinePositions[ptr++] = st.pos.x + halfW;
          tetLinePositions[ptr++] = baseY;
          tetLinePositions[ptr++] = st.pos.z;

          tetLinePositions[ptr++] = st.pos.x;
          tetLinePositions[ptr++] = baseY;
          tetLinePositions[ptr++] = st.pos.z + tet.currentChord * 0.35;
          tetLinePositions[ptr++] = st.pos.x;
          tetLinePositions[ptr++] = tipY;
          tetLinePositions[ptr++] = st.pos.z + sweepZ;
        }

        tetLineAttr.needsUpdate = true;
      }

      // 13. Update Grab Ring & Stress Glow
      if (grabPart !== 'none' && grabStationIdx >= 0) {
        if (grabPart === 'spine' || grabPart === 'bill') {
          const st = stations[grabStationIdx];
          activeGrabPointWorld.set(
            st.pos.x + grabLocalOffsetFromStation.x,
            stationRenderY[grabStationIdx] + grabLocalOffsetFromStation.y,
            st.pos.z + grabLocalOffsetFromStation.z
          );
        } else {
          const st = stations[grabStationIdx];
          const finSt = finStates[grabPart];
          activeGrabPointWorld
            .set(
              st.pos.x + grabLocalOffsetFromStation.x,
              stationRenderY[grabStationIdx] + grabLocalOffsetFromStation.y,
              st.pos.z + grabLocalOffsetFromStation.z
            )
            .add(finSt.worldDeflect);
        }

        grabRingMesh.visible = true;
        grabRingMesh.position.copy(activeGrabPointWorld);
        grabRingMesh.lookAt(cameraPosition);

        grabTetherLine.visible = true;
        grabTetherPositions[0] = activeGrabPointWorld.x;
        grabTetherPositions[1] = activeGrabPointWorld.y;
        grabTetherPositions[2] = activeGrabPointWorld.z;
        grabTetherPositions[3] = grabTarget.x;
        grabTetherPositions[4] = grabTarget.y;
        grabTetherPositions[5] = grabTarget.z;
        (
          grabTetherGeo.getAttribute('position') as THREE.BufferAttribute
        ).needsUpdate = true;
        sssUniforms.uGrabWorldPos.value.copy(activeGrabPointWorld);
        sssUniforms.uStressGlow.value = 1.05;
      } else {
        grabRingMesh.visible = false;
        grabTetherLine.visible = false;
        sssUniforms.uStressGlow.value = Math.max(
          Math.abs(jellySquash) * 1.2,
          simState.billSlashTimer > 0 ? 0.95 : 0
        );
      }
    };

    syncVisuals(new THREE.Vector3(2.75, 1.78, 3.05));

    const findClosestStationIdx = (pt: THREE.Vector3): number => {
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let s = 0; s < numSpine; s++) {
        const st = simState.stations[s];
        const dx = pt.x - st.pos.x;
        const dy = pt.y - stationRenderY[s];
        const dz = pt.z - st.pos.z;
        const dSq = dx * dx * 0.5 + dy * dy * 0.5 + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = s;
        }
      }
      return bestIdx;
    };

    return {
      group,
      tetLines,

      applyParams(next: BlueMarlinSpecificParams) {
        const wasLit = simState.lightUpMode;
        simState.tailSwishIntensity = next.tailSwishIntensity;
        simState.dorsalRaised = next.dorsalRaised;
        simState.lightUpMode = next.lightUpMode;

        if (next.lightUpMode && !wasLit) {
          triggerMarlinStripePulse(simState);
          marlinOuterMat.emissiveIntensity = simState.stripeGlowIntensity * 1.12;
          marlinFinMat.emissiveIntensity = simState.stripeGlowIntensity * 0.75;
          marlinStripeUniforms.uStripeGlow.value = simState.stripeGlowIntensity;
          stripeBioLight.intensity = Math.min(1.65, simState.stripeGlowIntensity * 0.62);
        } else if (!next.lightUpMode && wasLit) {
          simState.stripePulseTimer = 0;
          simState.stripeGlowIntensity = 0;
          simState.perStripeExcitation.fill(0);
          marlinOuterMat.emissiveIntensity = 0;
          marlinFinMat.emissiveIntensity = 0;
          marlinStripeUniforms.uStripeGlow.value = 0;
          stripeBioLight.intensity = 0;
        }

        if (next.slashTriggerSeq && next.slashTriggerSeq !== simState.lastSlashSeq) {
          simState.lastSlashSeq = next.slashTriggerSeq;
          triggerMarlinBillSlash(simState);
        }
        if (next.swishTriggerSeq && next.swishTriggerSeq !== simState.lastSwishSeq) {
          simState.lastSwishSeq = next.swishTriggerSeq;
          triggerMarlinTailSwish(simState);
        }
      },

      setColourway(id: ColourwayId) {
        if (id === activeColourway) return;
        activeColourway = id;
        const pal = COLOURWAYS[id] || COLOURWAYS.cobalt;
        const { pigmentMap: newPigment, stripeEmissiveMap: newEmi } =
          createMarlinPigmentAndStripeTextures(pal, 4);
        marlinStripeUniforms.uStripeEmissiveMap.value = newEmi;

        marlinOuterMat.map = newPigment;
        marlinOuterMat.emissiveMap = newEmi;
        marlinOuterMat.attenuationColor.set(pal.outerAttenuationHex);
        marlinOuterMat.needsUpdate = true;

        marlinFinMat.map = newPigment;
        marlinFinMat.emissiveMap = newEmi;
        marlinFinMat.attenuationColor.set(pal.outerAttenuationHex);
        marlinFinMat.needsUpdate = true;

        marlinBellyMat.color.set(pal.milkyVentralHex);
        marlinBellyMat.emissive.set(pal.innerCoreHex);
        marlinBellyMat.needsUpdate = true;
      },

      setShowTetCage(visible: boolean) {
        tetLines.visible = visible;
      },

      dropBaitBead(x?: number, z?: number) {
        const angle = (simState.beads.length * 1.25) % (Math.PI * 2);
        simState.beads.push({
          id: simState.nextBeadId++,
          pos: {
            x: x ?? Math.sin(angle) * 0.35,
            y: 0.78,
            z: z ?? 1.65 + Math.cos(angle) * 0.28,
          },
          vel: { x: 0, y: -1.1, z: 0 },
          r: 0.085,
        });
        if (simState.beads.length > maxBeads) simState.beads.shift();
      },

      clearBeads() {
        simState.beads.length = 0;
      },

      liftAndBounce() {
        autoLiftTimer = 0.28;
        grabPart = 'dorsal1';
        grabStationIdx = 14;
        grabDorsalChordU = 0.14;
        const st = simState.stations[14];
        grabInitialHitWorld.copy(finStates.dorsal1.tipWorld);
        grabLocalOffsetFromStation.set(
          grabInitialHitWorld.x - st.pos.x,
          grabInitialHitWorld.y - stationRenderY[14],
          grabInitialHitWorld.z - st.pos.z
        );
        grabTarget.set(
          grabInitialHitWorld.x,
          grabInitialHitWorld.y + 0.95,
          grabInitialHitWorld.z
        );
      },

      resetPose() {
        grabPart = 'none';
        grabStationIdx = -1;
        bodyOffsetY = 0;
        bodyVelY = 0;
        jellySquash = 0;
        jellySquashVel = 0;
        simState.billSlashTimer = 0;
        simState.tailSwishBurstTimer = 0;
        for (const st of simState.stations) {
          st.pos.x = 0;
          st.pos.y = st.restY;
          st.pos.z = st.restZ;
          st.prevPos.x = 0;
          st.prevPos.y = st.restY;
          st.prevPos.z = st.restZ;
          st.vel.x = 0;
          st.vel.y = 0;
          st.vel.z = 0;
        }
        for (const fin of Object.values(finStates)) {
          fin.worldDeflect.set(0, 0, 0);
          fin.worldVel.set(0, 0, 0);
        }
      },

      tryGrabAtRay(ray: THREE.Ray) {
        group.updateMatrixWorld(true);
        _raycaster.ray.copy(ray);

        let bestPart: MarlinGrabPart = 'none';
        let bestHitDist = Infinity;
        const bestHitPt = new THREE.Vector3();

        // 1. Check all fin meshes
        for (const target of finMeshTargets) {
          const hits = _raycaster.intersectObject(target.mesh, false);
          if (hits.length > 0 && hits[0].distance < bestHitDist) {
            bestHitDist = hits[0].distance;
            bestPart = target.part;
            bestHitPt.copy(hits[0].point);
          }
        }

        // 2. Check outer body trunk/bill mesh and mandible mesh so clicking the body never grabs a hidden far-side fin
        for (const bodyMesh of [outerMesh, mandibleMesh]) {
          const hits = _raycaster.intersectObject(bodyMesh, false);
          if (hits.length > 0 && hits[0].distance < bestHitDist) {
            bestHitDist = hits[0].distance;
            bestHitPt.copy(hits[0].point);
            const sIdx = findClosestStationIdx(bestHitPt);
            bestPart = sIdx <= 9 ? 'bill' : 'spine';
          }
        }

        if (bestPart !== 'none') {
          grabPart = bestPart;
          if (bestPart === 'bill' || bestPart === 'spine') {
            grabStationIdx = findClosestStationIdx(bestHitPt);
          } else if (bestPart === 'dorsal1') {
            const rawIdx = findClosestStationIdx(bestHitPt);
            grabStationIdx = Math.max(10, Math.min(26, rawIdx));
            const uStation = simState.stations[grabStationIdx].u;
            grabDorsalChordU = Math.max(0, Math.min(1, (uStation - 0.265) / 0.42));
            finStates.dorsal1.grabOriginWorld
              .copy(bestHitPt)
              .sub(finStates.dorsal1.worldDeflect);
          } else {
            const fin = finStates[bestPart];
            grabStationIdx = fin.stationIdx;
            fin.grabOriginWorld.copy(bestHitPt).sub(fin.worldDeflect);
          }

          const st = simState.stations[grabStationIdx];
          grabInitialHitWorld.copy(bestHitPt);
          grabLocalOffsetFromStation.set(
            bestHitPt.x - st.pos.x,
            bestHitPt.y - stationRenderY[grabStationIdx],
            bestHitPt.z - st.pos.z
          );
          grabTarget.copy(bestHitPt);
          return { grabbed: true, hitPoint: bestHitPt.clone() };
        }

        // 3. Fallback proximity check along axial spine & bill stations
        let bestIdx = -1;
        let bestDistSq = 0.42 * 0.42;
        for (let s = 0; s < numSpine; s++) {
          const st = simState.stations[s];
          _v2.set(st.pos.x, stationRenderY[s], st.pos.z);
          const dSq = ray.distanceSqToPoint(_v2);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = s;
          }
        }
        if (bestIdx >= 0) {
          grabPart = bestIdx <= 9 ? 'bill' : 'spine';
          grabStationIdx = bestIdx;
          const st = simState.stations[bestIdx];
          grabInitialHitWorld.set(st.pos.x, stationRenderY[bestIdx], st.pos.z);
          grabLocalOffsetFromStation.set(0, 0, 0);
          grabTarget.copy(grabInitialHitWorld);
          return { grabbed: true, hitPoint: grabTarget.clone() };
        }

        return { grabbed: false, hitPoint: _v0 };
      },

      updateGrabTarget(target: THREE.Vector3) {
        if (grabPart !== 'none' && grabStationIdx >= 0) {
          grabTarget.set(
            Math.max(-2.6, Math.min(2.6, target.x)),
            Math.max(0.05, Math.min(2.6, target.y)),
            Math.max(-2.6, Math.min(2.6, target.z))
          );
        }
      },

      releaseGrab() {
        if (grabPart === 'bill') {
          triggerMarlinBillSlash(simState);
        } else if (grabPart === 'caudal') {
          triggerMarlinTailSwish(simState);
        }
        grabPart = 'none';
        grabStationIdx = -1;
      },

      stepAndSync(dt: number, cameraPosition: THREE.Vector3) {
        const clampedDt = Math.min(0.033, dt);

        if (autoLiftTimer > 0) {
          autoLiftTimer -= clampedDt;
          if (autoLiftTimer <= 0) {
            autoLiftTimer = 0;
            grabPart = 'none';
            grabStationIdx = -1;
          }
        }

        // Build unified 3D XPBD dragConstraint from user cursor displacement (deltaX, deltaY, deltaZ)
        let dragConstraint: MarlinDragConstraint | undefined;
        if (grabPart !== 'none' && grabStationIdx >= 0) {
          const deltaX = grabTarget.x - grabInitialHitWorld.x;
          const deltaY = grabTarget.y - grabInitialHitWorld.y;
          const deltaZ = grabTarget.z - grabInitialHitWorld.z;

          if (grabPart === 'bill' || grabPart === 'spine') {
            const desiredLift = Math.max(0, deltaY * 0.65);
            bodyOffsetY +=
              (desiredLift - bodyOffsetY) * (1 - Math.exp(-14 * clampedDt));

            dragConstraint = {
              active: true,
              part: grabPart,
              stationIdx: grabStationIdx,
              deltaX: deltaX * 0.92,
              deltaY: deltaY * 0.55,
              deltaZ: deltaZ * 0.95,
              liftArchFactor: Math.min(1.0, bodyOffsetY * 1.25),
            };
          } else {
            // Fin drag: split smoothly between elastic fin hydrofoil bending and coupled XPBD trunk compliance
            const fin = finStates[grabPart];
            _v0.set(deltaX * 0.52, deltaY * 0.45, deltaZ * 0.42);
            const maxFinBend = grabPart === 'dorsal1' ? 0.46 : 0.42;
            if (_v0.length() > maxFinBend) {
              _v0.setLength(maxFinBend);
            }
            fin.worldDeflect.lerp(_v0, 1 - Math.exp(-20 * clampedDt));

            const desiredLift = Math.max(0, deltaY * 0.55);
            bodyOffsetY +=
              (desiredLift - bodyOffsetY) * (1 - Math.exp(-12 * clampedDt));

            dragConstraint = {
              active: true,
              part: 'fin',
              stationIdx: grabStationIdx,
              deltaX: deltaX * 0.65,
              deltaY: deltaY * 0.45,
              deltaZ: deltaZ * 0.78,
              liftArchFactor: Math.min(1.0, bodyOffsetY * 1.15),
            };
          }

          // Decay non-grabbed fins smoothly
          for (const [fKey, fin] of Object.entries(finStates)) {
            if (fKey !== grabPart) {
              fin.worldVel.addScaledVector(fin.worldDeflect, -140 * clampedDt);
              fin.worldVel.multiplyScalar(Math.exp(-5.5 * clampedDt));
              fin.worldDeflect.addScaledVector(fin.worldVel, clampedDt);
            }
          }
        } else {
          // Decay fin deflections with viscoelastic spring recoil
          for (const fin of Object.values(finStates)) {
            fin.worldVel.addScaledVector(fin.worldDeflect, -140 * clampedDt);
            fin.worldVel.multiplyScalar(Math.exp(-5.5 * clampedDt));
            fin.worldDeflect.addScaledVector(fin.worldVel, clampedDt);
          }

          // Vertical gravity & multi-bounce jelly landing on the studio slab
          if (bodyOffsetY > 0.001 || Math.abs(bodyVelY) > 0.02) {
            bodyVelY -= 16.5 * clampedDt;
            bodyOffsetY += bodyVelY * clampedDt;
            if (bodyOffsetY <= 0) {
              bodyOffsetY = 0;
              if (bodyVelY < -0.28) {
                const impact = -bodyVelY;
                jellySquashVel += impact * 2.6;
                bodyVelY = impact * 0.60;
                simState.stripeGlowIntensity = Math.max(
                  simState.stripeGlowIntensity,
                  1.8
                );
              } else {
                bodyVelY = 0;
              }
            }
          }
        }

        // Advance XPBD soft-body simulation WITH the active 3D dragConstraint!
        stepBlueMarlinSim(simState, clampedDt, dragConstraint);

        const squashAccel = -620 * jellySquash - 3.6 * jellySquashVel;
        jellySquashVel += squashAccel * clampedDt;
        jellySquash = Math.max(
          -0.32,
          Math.min(0.38, jellySquash + jellySquashVel * clampedDt)
        );

        sssUniforms.uTime.value = simState.simTime;
        syncVisuals(cameraPosition);
      },

      getTelemetry(): SpecimenTelemetry {
        const t = computeBlueMarlinTelemetry(simState);
        const grabLabel =
          grabPart === 'bill'
            ? 'Rounded Bill · Elastic Spear Flex (Release to Slash Bait)'
            : grabPart === 'spine'
            ? 'Pelagic Trunk & High Nape · 3D Axial & Lateral Jelly Flex'
            : grabPart === 'dorsal1'
            ? 'Anterior Dorsal Sail · Tetrahedral Hydrofoil & Trunk Flex'
            : grabPart === 'pec_left' || grabPart === 'pec_right'
            ? 'Sickle Pectoral Fin · Falcate Hydrofoil Deflection'
            : grabPart === 'caudal'
            ? 'Crescent Caudal Tail · Lunate Fluke Flex (Release to Swish)'
            : simState.billSlashTimer > 0
            ? 'Bill Slash Active · Slashing Bait Cluster & Flashing Stripes'
            : 'Drag bill, tall dorsal sail, sickle pectorals, or crescent tail';

        return {
          specimenPrefix: 'MRL-JL-03',
          adhesionLabel: 'Stripe Glow',
          adhesionPct: t.stripeGlowPct,
          grabRegionLabel: grabLabel,
          activeBeadCount: simState.beads.length,
          isDragging: grabPart !== 'none',
          meanStrainPct: t.meanStrainPct,
          metrics: [
            {
              id: 'mass',
              label: 'Mass',
              value: t.massGrams.toFixed(1),
              unit: 'g',
              testId: 'readout-mass',
            },
            {
              id: 'volume',
              label: 'Volume',
              value: t.volumeCm3.toFixed(1),
              unit: 'cm³',
              testId: 'readout-volume',
            },
            {
              id: 'billForkLength',
              label: 'Bill-to-Fork Length',
              value: t.billToForkLengthCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-bill-fork-length',
            },
            {
              id: 'dorsalHeight',
              label: 'Dorsal Fin Height',
              value: t.dorsalFinHeightCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-dorsal-height',
            },
          ],
        };
      },

      dispose() {
        scene.remove(group);
        scene.remove(tetLines);
        outerGeo.dispose();
        innerGeo.dispose();
        mandibleGeo.dispose();
        sailDorsalDef.dispose();
        dorsalFinletDef.dispose();
        analFinletDef.dispose();
        primaryAnalDef.dispose();
        leftPecDef.dispose();
        rightPecDef.dispose();
        leftPelvicDef.dispose();
        rightPelvicDef.dispose();
        caudalLunateDef.dispose();
        eyeSocketGeo.dispose();
        eyeIrisGeo.dispose();
        eyePupilGeo.dispose();
        tetLineGeo.dispose();
        tetLineMat.dispose();
        marlinOuterMat.dispose();
        marlinFinMat.dispose();
        marlinBellyMat.dispose();
      },
    };
  },
};
