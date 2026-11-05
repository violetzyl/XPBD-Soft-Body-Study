import React from 'react';
import * as THREE from 'three';
import { ColourwayId } from '../sim/colourways';

export type SpecimenId = 'octopus' | 'tiger_shark' | 'blue_marlin';

export interface SpecimenMetricReadout {
  id: string;
  label: string;
  value: string;
  unit: string;
  testId: string;
}

export interface SpecimenCameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface SpecimenTelemetry {
  specimenPrefix: string;
  adhesionLabel: string;
  adhesionPct: number;
  grabRegionLabel: string;
  activeBeadCount: number;
  isDragging: boolean;
  meanStrainPct: number;
  metrics: [
    SpecimenMetricReadout,
    SpecimenMetricReadout,
    SpecimenMetricReadout,
    SpecimenMetricReadout,
  ];
}

export interface SpecimenSSSUniforms {
  uSssColor: { value: THREE.Color };
  uRimLightPos: { value: THREE.Vector3 };
  uRimLightColor: { value: THREE.Color };
  uKeyLightPos: { value: THREE.Vector3 };
  uSssStrength: { value: number };
  uSssDistortion: { value: number };
  uSssPower: { value: number };
  uCausticShimmer: { value: number };
  uTime: { value: number };
  uGrabWorldPos: { value: THREE.Vector3 };
  uStressGlow: { value: number };
}

export interface SpecimenSharedResources {
  scene: THREE.Scene;
  outerJellyMat: THREE.MeshPhysicalMaterial;
  milkyCoreMat: THREE.MeshPhysicalMaterial;
  suckerMat: THREE.MeshStandardMaterial;
  papillaMat: THREE.MeshPhysicalMaterial;
  irisMat: THREE.MeshStandardMaterial;
  pupilMat: THREE.MeshStandardMaterial;
  socketMat: THREE.MeshPhysicalMaterial;
  hornMat: THREE.MeshPhysicalMaterial;
  beadInstanced: THREE.InstancedMesh;
  maxBeads: number;
  contactShadowMesh: THREE.Mesh;
  contactShadowMat: THREE.MeshBasicMaterial;
  grabRingMesh: THREE.Mesh;
  grabTetherLine: THREE.Line;
  grabTetherGeo: THREE.BufferGeometry;
  grabTetherPositions: Float32Array;
  sssUniforms: SpecimenSSSUniforms;
  isSoftwareGl: boolean;
}

export interface SpecimenRuntimeController<TParams = any> {
  group: THREE.Group;
  tetLines: THREE.LineSegments;
  applyParams: (params: TParams) => void;
  setColourway?: (id: ColourwayId) => void;
  setShowTetCage: (visible: boolean) => void;
  dropBaitBead: (x?: number, z?: number) => void;
  clearBeads: () => void;
  liftAndBounce: () => void;
  resetPose: () => void;
  tryGrabAtRay: (ray: THREE.Ray) => { grabbed: boolean; hitPoint: THREE.Vector3 };
  updateGrabTarget: (target: THREE.Vector3) => void;
  releaseGrab: () => void;
  stepAndSync: (dt: number, cameraPosition: THREE.Vector3) => void;
  getTelemetry: () => SpecimenTelemetry;
  dispose: () => void;
}

export interface SpecificControlsProps<TParams = any> {
  params: TParams;
  onChangeParams: (next: TParams) => void;
}

export interface JellySpecimenDefinition<TParams = any> {
  id: SpecimenId;
  name: string;
  shortName: string;
  specimenPrefix: string;
  specificControlsTitle: string;
  defaultParams: TParams;
  supportedColourways?: ColourwayId[];
  defaultColourway?: ColourwayId;
  cameraPresets: SpecimenCameraPreset[];
  studyNotes: {
    title: string;
    paragraphs: string[];
  };
  SpecificControlsComponent: React.FC<SpecificControlsProps<TParams>>;
  createController: (
    shared: SpecimenSharedResources
  ) => SpecimenRuntimeController<TParams>;
}

