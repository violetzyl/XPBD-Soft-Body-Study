import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLOURWAYS, ColourwayId } from '../sim/colourways';
import { LIGHTING_PRESETS, LightingPresetId } from '../sim/lightingPresets';
import {
  createChromatophoreMottleTexture,
  createPapillaBumpTexture,
  createStudioSlabTexture,
} from '../sim/proceduralTextures';
import { WGSL_XPBD_INTEGRATE_SHADER } from '../sim/xpbdSolver';
import { getSpecimenDefinition } from '../specimens/registry';
import {
  SpecimenId,
  SpecimenRuntimeController,
  SpecimenSharedResources,
  SpecimenSSSUniforms,
  SpecimenTelemetry,
} from '../specimens/types';

export interface OctopusJellyCanvasProps {
  specimenId: SpecimenId;
  specimenParams: any;
  colourway: ColourwayId;
  lightingPreset: LightingPresetId;
  showTetCage: boolean;
  dropBeadTrigger: number;
  clearBeadsTrigger: number;
  liftAndDropTrigger: number;
  resetPoseTrigger: number;
  cameraPresetTrigger: { preset: string; seq: number };
  onTelemetryUpdate: (telemetry: SpecimenTelemetry) => void;
}

// Pre-allocated scratch math objects outside the animation loop (Zero-GC rule)
const _v1 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNDC = new THREE.Vector2();
const _dragPlane = new THREE.Plane();
const _dragIntersect = new THREE.Vector3();

export const OctopusJellyCanvas: React.FC<OctopusJellyCanvasProps> = ({
  specimenId,
  specimenParams,
  colourway,
  lightingPreset,
  showTetCage,
  dropBeadTrigger,
  clearBeadsTrigger,
  liftAndDropTrigger,
  resetPoseTrigger,
  cameraPresetTrigger,
  onTelemetryUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpecimenRuntimeController<any> | null>(null);
  const sharedResourcesRef = useRef<SpecimenSharedResources | null>(null);
  const onTelemetryRef = useRef(onTelemetryUpdate);
  onTelemetryRef.current = onTelemetryUpdate;

  const propsRef = useRef({
    specimenId,
    specimenParams,
    colourway,
    lightingPreset,
    showTetCage,
  });
  propsRef.current = {
    specimenId,
    specimenParams,
    colourway,
    lightingPreset,
    showTetCage,
  };

  const sssUniformsRef = useRef<SpecimenSSSUniforms>({
    uSssColor: { value: new THREE.Color('#ff926b') },
    uRimLightPos: { value: new THREE.Vector3(-3.2, 2.6, -3.4) },
    uRimLightColor: { value: new THREE.Color('#e0f2fe') },
    uKeyLightPos: { value: new THREE.Vector3(3.0, 5.5, 3.2) },
    uSssStrength: { value: 0.52 },
    uSssDistortion: { value: 0.35 },
    uSssPower: { value: 2.4 },
    uCausticShimmer: { value: 0.0 },
    uTime: { value: 0.0 },
    uGrabWorldPos: { value: new THREE.Vector3(0, -10, 0) },
    uStressGlow: { value: 0.0 },
  });

  const sceneRefs = useRef<{
    scene?: THREE.Scene;
    outerJellyMat?: THREE.MeshPhysicalMaterial;
    milkyCoreMat?: THREE.MeshPhysicalMaterial;
    suckerMat?: THREE.MeshStandardMaterial;
    papillaMat?: THREE.MeshPhysicalMaterial;
    irisMat?: THREE.MeshStandardMaterial;
    pupilMat?: THREE.MeshStandardMaterial;
    socketMat?: THREE.MeshPhysicalMaterial;
    hornMat?: THREE.MeshPhysicalMaterial;
    slabMat?: THREE.MeshStandardMaterial;
    platterRimMat?: THREE.MeshStandardMaterial;
    hemiLight?: THREE.HemisphereLight;
    keyLight?: THREE.DirectionalLight;
    rimLight?: THREE.DirectionalLight;
    kickerLight?: THREE.DirectionalLight;
    renderer?: THREE.WebGLRenderer;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    targetCamPos?: THREE.Vector3 | null;
    targetLookAt?: THREE.Vector3 | null;
  }>({});

  // Sync object-specific parameters & cage visibility into active specimen controller
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.applyParams(specimenParams);
      ctrl.setShowTetCage(showTetCage);
    }
  }, [specimenParams, showTetCage]);

  // Swap active jelly specimen cleanly when `specimenId` changes
  useEffect(() => {
    const shared = sharedResourcesRef.current;
    if (!shared) return;

    if (controllerRef.current) {
      controllerRef.current.dispose();
      controllerRef.current = null;
    }

    const def = getSpecimenDefinition(specimenId);
    const ctrl = def.createController(shared);
    ctrl.applyParams(propsRef.current.specimenParams);
    ctrl.setColourway?.(propsRef.current.colourway);
    ctrl.setShowTetCage(propsRef.current.showTetCage);
    controllerRef.current = ctrl;
    onTelemetryRef.current(ctrl.getTelemetry());

    // Frame camera on the newly swapped specimen's default preset
    const defaultCam = def.cameraPresets[0];
    if (defaultCam) {
      sceneRefs.current.targetCamPos = new THREE.Vector3(...defaultCam.position);
      sceneRefs.current.targetLookAt = new THREE.Vector3(...defaultCam.target);
    }
  }, [specimenId]);

  // Update colourway materials dynamically across any mounted specimen
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs.outerJellyMat || !refs.renderer) return;
    const pal = COLOURWAYS[colourway] || COLOURWAYS.coral;
    const maxAniso = refs.renderer.capabilities.getMaxAnisotropy();

    controllerRef.current?.setColourway?.(colourway);

    const newMottleTex = createChromatophoreMottleTexture(pal, maxAniso);
    refs.outerJellyMat.map = newMottleTex;
    refs.outerJellyMat.color.set('#ffffff');
    refs.outerJellyMat.attenuationColor.set(pal.outerAttenuationHex);
    refs.outerJellyMat.sheenColor.set(pal.outerAttenuationHex);
    refs.outerJellyMat.needsUpdate = true;
    sssUniformsRef.current.uSssColor.value.set(pal.outerAttenuationHex);

    refs.milkyCoreMat?.color.set(pal.milkyVentralHex);
    refs.milkyCoreMat?.emissive.set(pal.innerCoreHex);
    refs.suckerMat?.color.set(pal.suckerRimHex);
    refs.suckerMat?.emissive.set(pal.suckerCupHex);
    refs.papillaMat?.color.set(pal.papillaTipHex);
    refs.irisMat?.color.set(pal.irisGoldHex);
    refs.pupilMat?.color.set(pal.pupilHex);
    refs.socketMat?.color.set(pal.socketHex);
    refs.hornMat?.color.set(pal.hornHex);
  }, [colourway]);

  // Update lighting preset & Subsurface Scattering uniforms
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs.scene || !refs.renderer) return;
    const preset = LIGHTING_PRESETS[lightingPreset];

    refs.scene.background = new THREE.Color(preset.backgroundHex);
    refs.scene.fog = new THREE.FogExp2(preset.fogHex, preset.fogDensity);
    refs.renderer.toneMappingExposure = preset.toneMappingExposure;

    if (refs.hemiLight) {
      refs.hemiLight.color.set(preset.hemiSkyHex);
      refs.hemiLight.groundColor.set(preset.hemiGroundHex);
      refs.hemiLight.intensity = preset.hemiIntensity;
    }
    if (refs.keyLight) {
      refs.keyLight.color.set(preset.keyColorHex);
      refs.keyLight.intensity = preset.keyIntensity;
      refs.keyLight.position.set(...preset.keyPosition);
    }
    if (refs.rimLight) {
      refs.rimLight.color.set(preset.rimColorHex);
      refs.rimLight.intensity = preset.rimIntensity;
      refs.rimLight.position.set(...preset.rimPosition);
    }
    if (refs.kickerLight) {
      refs.kickerLight.color.set(preset.kickerColorHex);
      refs.kickerLight.intensity = preset.kickerIntensity;
      refs.kickerLight.position.set(...preset.kickerPosition);
    }
    if (refs.slabMat) {
      refs.slabMat.color.set(preset.slabTintHex);
      refs.slabMat.roughness = preset.slabRoughness;
    }
    if (refs.platterRimMat) {
      refs.platterRimMat.color.set(preset.platterRimHex);
    }
    if (refs.outerJellyMat) {
      refs.outerJellyMat.envMapIntensity = preset.envMapIntensity;
      refs.outerJellyMat.clearcoat = preset.clearcoatIntensity;
    }
    if (refs.milkyCoreMat) {
      refs.milkyCoreMat.envMapIntensity = preset.envMapIntensity * 0.85;
    }

    const u = sssUniformsRef.current;
    u.uRimLightPos.value.set(...preset.rimPosition);
    u.uRimLightColor.value.set(preset.rimColorHex);
    u.uKeyLightPos.value.set(...preset.keyPosition);
    u.uSssStrength.value = preset.sssStrength;
    u.uSssDistortion.value = preset.sssDistortion;
    u.uSssPower.value = preset.sssPower;
    u.uCausticShimmer.value = preset.causticShimmer;
  }, [lightingPreset]);

  useEffect(() => {
    if (dropBeadTrigger === 0) return;
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.dropBaitBead();
      onTelemetryRef.current(ctrl.getTelemetry());
    }
  }, [dropBeadTrigger]);

  useEffect(() => {
    if (clearBeadsTrigger === 0) return;
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.clearBeads();
      onTelemetryRef.current(ctrl.getTelemetry());
    }
  }, [clearBeadsTrigger]);

  useEffect(() => {
    if (liftAndDropTrigger === 0) return;
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.liftAndBounce();
      onTelemetryRef.current(ctrl.getTelemetry());
    }
  }, [liftAndDropTrigger]);

  useEffect(() => {
    if (resetPoseTrigger === 0) return;
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.resetPose();
      onTelemetryRef.current(ctrl.getTelemetry());
    }
  }, [resetPoseTrigger]);

  useEffect(() => {
    if (cameraPresetTrigger.seq === 0) return;
    const def = getSpecimenDefinition(propsRef.current.specimenId);
    const camSpec =
      def.cameraPresets.find((c) => c.id === cameraPresetTrigger.preset) ||
      def.cameraPresets[0];
    if (camSpec) {
      sceneRefs.current.targetCamPos = new THREE.Vector3(...camSpec.position);
      sceneRefs.current.targetLookAt = new THREE.Vector3(...camSpec.target);
    }
  }, [cameraPresetTrigger]);

  // Main Studio Stage & Shared Bilayer Material Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let gpuDevice: any = null;
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && !isSoftwareGl) {
      (navigator as any).gpu
        ?.requestAdapter()
        .then((adapter: any) => adapter?.requestDevice())
        .then((device: any) => {
          if (!device) return;
          gpuDevice = device;
          device.createShaderModule({ code: WGSL_XPBD_INTEGRATE_SHADER });
        })
        .catch(() => {});
    }

    const initialLight = LIGHTING_PRESETS[propsRef.current.lightingPreset];

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = initialLight.toneMappingExposure;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(container.clientWidth || 1280, container.clientHeight || 800);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialLight.backgroundHex);
    scene.fog = new THREE.FogExp2(initialLight.fogHex, initialLight.fogDensity);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      38,
      (container.clientWidth || 1280) / (container.clientHeight || 800),
      0.1,
      40
    );
    camera.position.set(2.35, 2.15, 3.15);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.38, 0.05);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 1.25;
    controls.maxDistance = 8.5;
    controls.update();

    const cancelCameraTransition = () => {
      sceneRefs.current.targetCamPos = null;
      sceneRefs.current.targetLookAt = null;
    };
    controls.addEventListener('start', cancelCameraTransition);

    // Multi-Preset Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(
      initialLight.hemiSkyHex,
      initialLight.hemiGroundHex,
      initialLight.hemiIntensity
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      initialLight.keyColorHex,
      initialLight.keyIntensity
    );
    keyLight.position.set(...initialLight.keyPosition);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 14;
    const d = 3.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      initialLight.rimColorHex,
      initialLight.rimIntensity
    );
    rimLight.position.set(...initialLight.rimPosition);
    scene.add(rimLight);

    const kickerLight = new THREE.DirectionalLight(
      initialLight.kickerColorHex,
      initialLight.kickerIntensity
    );
    kickerLight.position.set(...initialLight.kickerPosition);
    scene.add(kickerLight);

    // Studio Tabletop Slab (static matrix optimization)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const slabTex = createStudioSlabTexture(maxAniso);
    const slabGeo = new THREE.CylinderGeometry(3.8, 3.9, 0.14, 56);
    const slabMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialLight.slabTintHex),
      map: slabTex,
      roughness: initialLight.slabRoughness,
      metalness: 0.04,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = -0.07;
    slabMesh.receiveShadow = true;
    slabMesh.matrixAutoUpdate = false;
    slabMesh.updateMatrix();
    scene.add(slabMesh);

    const platterRimGeo = new THREE.TorusGeometry(3.82, 0.022, 10, 56);
    platterRimGeo.rotateX(Math.PI / 2);
    const platterRimMat = new THREE.MeshStandardMaterial({
      color: initialLight.platterRimHex,
      roughness: 0.35,
      metalness: 0.65,
    });
    const platterRim = new THREE.Mesh(platterRimGeo, platterRimMat);
    platterRim.position.y = -0.01;
    platterRim.matrixAutoUpdate = false;
    platterRim.updateMatrix();
    scene.add(platterRim);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(20, 15, 12, 0.44)');
    sGrad.addColorStop(0.55, 'rgba(20, 15, 12, 0.18)');
    sGrad.addColorStop(1, 'rgba(20, 15, 12, 0.0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowGeo = new THREE.PlaneGeometry(3.7, 3.7);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.position.y = 0.003;
    scene.add(contactShadowMesh);

    // Shared Bilayer Jelly Materials with Subsurface Scattering & Caustics
    const initialPal = COLOURWAYS[propsRef.current.colourway];
    const mottleTex = createChromatophoreMottleTexture(initialPal, maxAniso);
    const bumpTex = createPapillaBumpTexture(maxAniso);

    sssUniformsRef.current.uSssColor.value.set(initialPal.outerAttenuationHex);
    sssUniformsRef.current.uRimLightPos.value.set(...initialLight.rimPosition);
    sssUniformsRef.current.uRimLightColor.value.set(initialLight.rimColorHex);
    sssUniformsRef.current.uKeyLightPos.value.set(...initialLight.keyPosition);
    sssUniformsRef.current.uSssStrength.value = initialLight.sssStrength;
    sssUniformsRef.current.uSssDistortion.value = initialLight.sssDistortion;
    sssUniformsRef.current.uSssPower.value = initialLight.sssPower;
    sssUniformsRef.current.uCausticShimmer.value = initialLight.causticShimmer;

    const outerJellyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: mottleTex,
      bumpMap: bumpTex,
      bumpScale: 0.018,
      roughness: 0.12,
      metalness: 0.02,
      transmission: isSoftwareGl ? 0 : 0.78,
      transparent: true,
      opacity: isSoftwareGl ? 0.70 : 0.90,
      ior: 1.44,
      thickness: 1.25,
      attenuationDistance: 0.85,
      attenuationColor: new THREE.Color(initialPal.outerAttenuationHex),
      clearcoat: initialLight.clearcoatIntensity,
      clearcoatRoughness: 0.06,
      envMapIntensity: initialLight.envMapIntensity,
      sheen: 0.6,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(initialPal.outerAttenuationHex),
      depthWrite: true,
    });

    outerJellyMat.onBeforeCompile = (shader) => {
      const u = sssUniformsRef.current;
      shader.uniforms.uSssColor = u.uSssColor;
      shader.uniforms.uRimLightPos = u.uRimLightPos;
      shader.uniforms.uRimLightColor = u.uRimLightColor;
      shader.uniforms.uKeyLightPos = u.uKeyLightPos;
      shader.uniforms.uSssStrength = u.uSssStrength;
      shader.uniforms.uSssDistortion = u.uSssDistortion;
      shader.uniforms.uSssPower = u.uSssPower;
      shader.uniforms.uCausticShimmer = u.uCausticShimmer;
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uGrabWorldPos = u.uGrabWorldPos;
      shader.uniforms.uStressGlow = u.uStressGlow;

      shader.vertexShader =
        `varying vec3 vJellyWorldPos;\n` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vJellyWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader =
        `varying vec3 vJellyWorldPos;
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
         uniform float uStressGlow;\n` +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `vec3 viewVec = normalize(cameraPosition - vJellyWorldPos);
           vec3 rimDir = normalize(uRimLightPos - vJellyWorldPos);
           vec3 keyDir = normalize(uKeyLightPos - vJellyWorldPos);
           vec3 worldN = normalize(( vec4(normal, 0.0) * viewMatrix ).xyz);

           vec3 transHalfRim = normalize(rimDir + worldN * uSssDistortion);
           float backScatterRim = pow(clamp(dot(viewVec, -transHalfRim), 0.0, 1.0), uSssPower);
           vec3 transHalfKey = normalize(keyDir + worldN * uSssDistortion);
           float backScatterKey = pow(clamp(dot(viewVec, -transHalfKey), 0.0, 1.0), uSssPower + 0.8);

           float fresnelRim = pow(1.0 - clamp(abs(dot(viewVec, worldN)), 0.0, 1.0), 2.6);
           vec3 sssContribution = uSssColor * (backScatterRim * 0.85 + backScatterKey * 0.45 + fresnelRim * 0.55) * uSssStrength;
           sssContribution += uRimLightColor * (fresnelRim * backScatterRim * 0.45 * uSssStrength);

           if (uStressGlow > 0.01) {
             float distToGrab = length(vJellyWorldPos - uGrabWorldPos);
             float localStretch = exp(-distToGrab * distToGrab * 3.2) * uStressGlow;
             sssContribution += mix(uSssColor, vec3(1.0, 0.94, 0.82), 0.45) * localStretch * (0.42 + 0.58 * fresnelRim);
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

    const milkyCoreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPal.milkyVentralHex),
      emissive: new THREE.Color(initialPal.innerCoreHex),
      emissiveIntensity: 0.24,
      roughness: 0.26,
      metalness: 0.0,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
      envMapIntensity: initialLight.envMapIntensity * 0.85,
    });

    const suckerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialPal.suckerRimHex),
      emissive: new THREE.Color(initialPal.suckerCupHex),
      emissiveIntensity: 0.22,
      roughness: 0.3,
      metalness: 0.02,
    });

    const papillaMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPal.papillaTipHex),
      roughness: 0.2,
      metalness: 0.0,
      clearcoat: 0.92,
      transparent: true,
      opacity: 0.88,
    });

    const socketMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPal.socketHex),
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const irisMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialPal.irisGoldHex),
      emissive: new THREE.Color(initialPal.irisGoldHex),
      emissiveIntensity: 0.28,
      roughness: 0.18,
      metalness: 0.38,
    });
    const pupilMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialPal.pupilHex),
      roughness: 0.1,
      metalness: 0.05,
    });
    const hornMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPal.hornHex),
      roughness: 0.22,
      clearcoat: 0.92,
    });

    const maxBeads = 12;
    const beadGeo = new THREE.SphereGeometry(1, 16, 12);
    const beadMat = new THREE.MeshPhysicalMaterial({
      color: '#f59e0b',
      emissive: '#d97706',
      emissiveIntensity: 0.25,
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 1.0,
    });
    const beadInstanced = new THREE.InstancedMesh(beadGeo, beadMat, maxBeads);
    beadInstanced.castShadow = !isSoftwareGl;
    beadInstanced.frustumCulled = false;
    scene.add(beadInstanced);

    const grabRingGeo = new THREE.RingGeometry(0.075, 0.112, 24);
    const grabRingMat = new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    });
    const grabRingMesh = new THREE.Mesh(grabRingGeo, grabRingMat);
    grabRingMesh.visible = false;
    scene.add(grabRingMesh);

    const grabTetherPositions = new Float32Array(6);
    const grabTetherGeo = new THREE.BufferGeometry();
    grabTetherGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(grabTetherPositions, 3)
    );
    const grabTetherMat = new THREE.LineBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.75,
    });
    const grabTetherLine = new THREE.Line(grabTetherGeo, grabTetherMat);
    grabTetherLine.visible = false;
    grabTetherLine.renderOrder = 5;
    scene.add(grabTetherLine);

    const sharedResources: SpecimenSharedResources = {
      scene,
      outerJellyMat,
      milkyCoreMat,
      suckerMat,
      papillaMat,
      irisMat,
      pupilMat,
      socketMat,
      hornMat,
      beadInstanced,
      maxBeads,
      contactShadowMesh,
      contactShadowMat,
      grabRingMesh,
      grabTetherLine,
      grabTetherGeo,
      grabTetherPositions,
      sssUniforms: sssUniformsRef.current,
      isSoftwareGl,
    };
    sharedResourcesRef.current = sharedResources;

    // Mount initial specimen from registry
    const initialDef = getSpecimenDefinition(propsRef.current.specimenId);
    const ctrl = initialDef.createController(sharedResources);
    ctrl.applyParams(propsRef.current.specimenParams);
    ctrl.setShowTetCage(propsRef.current.showTetCage);
    controllerRef.current = ctrl;

    sceneRefs.current = {
      scene,
      outerJellyMat,
      milkyCoreMat,
      suckerMat,
      papillaMat,
      irisMat,
      pupilMat,
      socketMat,
      hornMat,
      slabMat,
      platterRimMat,
      hemiLight,
      keyLight,
      rimLight,
      kickerLight,
      renderer,
      camera,
      controls,
      targetCamPos: null,
      targetLookAt: null,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pointer Interaction delegated cleanly to active SpecimenRuntimeController
    let isDraggingSpecimen = false;

    const getPointerNDC = (ev: PointerEvent | MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || !controllerRef.current) return;
      getPointerNDC(ev);
      _raycaster.setFromCamera(_pointerNDC, camera);

      const res = controllerRef.current.tryGrabAtRay(_raycaster.ray);
      if (res.grabbed) {
        ev.stopPropagation();
        isDraggingSpecimen = true;
        camera.getWorldDirection(_v1);
        _dragPlane.setFromNormalAndCoplanarPoint(_v1.negate(), res.hitPoint);
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
        onTelemetryRef.current(controllerRef.current.getTelemetry());
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingSpecimen || !controllerRef.current) return;
      getPointerNDC(ev);
      _raycaster.setFromCamera(_pointerNDC, camera);
      if (_raycaster.ray.intersectPlane(_dragPlane, _dragIntersect)) {
        controllerRef.current.updateGrabTarget(_dragIntersect);
      }
    };

    const onPointerUp = () => {
      if (isDraggingSpecimen && controllerRef.current) {
        isDraggingSpecimen = false;
        controllerRef.current.releaseGrab();
        controls.enabled = true;
        renderer.domElement.style.cursor = 'grab';
        onTelemetryRef.current(controllerRef.current.getTelemetry());
      }
    };

    const onDoubleClick = (ev: MouseEvent) => {
      if (!controllerRef.current) return;
      getPointerNDC(ev);
      _raycaster.setFromCamera(_pointerNDC, camera);
      const hits = _raycaster.intersectObject(slabMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        controllerRef.current.dropBaitBead(pt.x, pt.z);
        onTelemetryRef.current(controllerRef.current.getTelemetry());
      }
    };

    const domElem = renderer.domElement;
    domElem.style.cursor = 'grab';
    domElem.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('dblclick', onDoubleClick);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 800;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let lastTelemetryTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const rawDt = Math.min(0.25, Math.max(0.008, (now - lastTime) / 1000));
      const dt = Math.min(0.033, rawDt);
      lastTime = now;

      const activeCtrl = controllerRef.current;
      if (activeCtrl) {
        activeCtrl.stepAndSync(dt, camera.position);
      }

      const refs = sceneRefs.current;
      if (refs.targetCamPos && refs.targetLookAt) {
        const k = isSoftwareGl
          ? Math.min(1, 1 - Math.exp(-18.0 * rawDt))
          : 1 - Math.exp(-10.5 * rawDt);
        camera.position.lerp(refs.targetCamPos, k);
        controls.target.lerp(refs.targetLookAt, k);
        if (camera.position.distanceToSquared(refs.targetCamPos) < 0.002) {
          camera.position.copy(refs.targetCamPos);
          controls.target.copy(refs.targetLookAt);
          refs.targetCamPos = null;
          refs.targetLookAt = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (activeCtrl && now - lastTelemetryTime > 125) {
        lastTelemetryTime = now;
        onTelemetryRef.current(activeCtrl.getTelemetry());
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    onTelemetryRef.current(ctrl.getTelemetry());
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      domElem.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('dblclick', onDoubleClick);
      domElem.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', onResize);
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
      controls.dispose();
      renderer.dispose();
      if (gpuDevice && gpuDevice.destroy) {
        gpuDevice.destroy();
      }
      if (domElem.parentNode === container) {
        container.removeChild(domElem);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="octopus-jelly-canvas"
      className="w-full h-full relative overflow-hidden"
      aria-label="Interactive 3D Bilayer Jelly Specimen XPBD Soft-Body Viewport"
    />
  );
};
