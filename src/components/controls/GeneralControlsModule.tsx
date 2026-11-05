import React from 'react';
import {
  ArrowUpFromLine,
  Eye,
  Grid,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { COLOURWAYS, COLOURWAY_LIST, ColourwayId } from '../../sim/colourways';
import { LIGHTING_PRESET_LIST, LightingPresetId } from '../../sim/lightingPresets';
import { SpecimenCameraPreset } from '../../specimens/types';

export interface GeneralControlsModuleProps {
  colourway: ColourwayId;
  supportedColourways?: ColourwayId[];
  onSelectColourway: (id: ColourwayId) => void;
  lightingPreset: LightingPresetId;
  onSelectLightingPreset: (id: LightingPresetId) => void;
  showTetCage: boolean;
  onToggleTetCage: () => void;
  activeBeadCount: number;
  onDropBaitBead: () => void;
  onClearBeads: () => void;
  onLiftAndDrop: () => void;
  onResetPose: () => void;
  cameraPresets: SpecimenCameraPreset[];
  activeCameraPreset: string;
  onSelectCameraPreset: (presetId: string) => void;
}

export const GeneralControlsModule: React.FC<GeneralControlsModuleProps> = ({
  colourway,
  supportedColourways,
  onSelectColourway,
  lightingPreset,
  onSelectLightingPreset,
  showTetCage,
  onToggleTetCage,
  activeBeadCount,
  onDropBaitBead,
  onClearBeads,
  onLiftAndDrop,
  onResetPose,
  cameraPresets,
  activeCameraPreset,
  onSelectCameraPreset,
}) => {
  const activeColourwayList =
    supportedColourways && supportedColourways.length > 0
      ? supportedColourways.map((id) => COLOURWAYS[id])
      : COLOURWAY_LIST;

  return (
    <div
      data-testid="general-controls-module"
      className="flex flex-col gap-2.5"
    >
      {/* General Row 1: Colourway + Studio Lighting (Shared across all specimens) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 1. Colourways Selector (Adapts to active specimen's supported palettes) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
            Colourway
          </span>
          <div
            role="group"
            aria-label="Jelly Colourway"
            className="inline-flex flex-wrap items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
          >
            {activeColourwayList.map((cw) => {
              const active = cw.id === colourway;
              return (
                <button
                  key={cw.id}
                  type="button"
                  data-testid={`select-colourway-${cw.id}`}
                  onClick={() => onSelectColourway(cw.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-stone-950 shadow-xs'
                      : 'text-stone-700 hover:text-stone-950'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-stone-400/60 shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${cw.swatchHex} 55%, ${cw.swatchSecondaryHex} 55%)`,
                    }}
                  />
                  <span>{cw.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Studio Lighting Environment Presets Selector (Shared across all specimens) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-600 whitespace-nowrap inline-flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-stone-500" />
            <span>Lighting</span>
          </span>
          <div
            role="group"
            aria-label="Lighting Presets"
            className="inline-flex items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
          >
            {LIGHTING_PRESET_LIST.map((lp) => {
              const active = lp.id === lightingPreset;
              return (
                <button
                  key={lp.id}
                  type="button"
                  onClick={() => onSelectLightingPreset(lp.id)}
                  aria-pressed={active}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-stone-950 shadow-xs'
                      : 'text-stone-700 hover:text-stone-950'
                  }`}
                >
                  {lp.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* General Row 2: Shared Tabletop Physics Actions + Camera Framing + XPBD Cage + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-stone-200/90">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDropBaitBead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Drop Bait Bead ({activeBeadCount})</span>
          </button>

          <button
            type="button"
            onClick={onLiftAndDrop}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-900 bg-amber-300/85 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Lift &amp; Jelly Bounce</span>
          </button>

          {activeBeadCount > 0 && (
            <button
              type="button"
              onClick={onClearBeads}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-700 hover:text-stone-950 bg-stone-200/75 hover:bg-stone-300/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Camera Framing Presets */}
        <div
          role="group"
          aria-label="Camera Framing Presets"
          className="inline-flex items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
        >
          <Eye className="w-3.5 h-3.5 text-stone-500 ml-1 mr-0.5 shrink-0" />
          {cameraPresets.map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => onSelectCameraPreset(cam.id)}
              aria-pressed={activeCameraPreset === cam.id}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeCameraPreset === cam.id
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-700 hover:text-stone-950'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        {/* XPBD Cage Wireframe & Reset */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTetCage}
            aria-pressed={showTetCage}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showTetCage
                ? 'bg-stone-900 text-white'
                : 'bg-stone-200/75 text-stone-700 hover:text-stone-950'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Cage</span>
          </button>

          <button
            type="button"
            onClick={onResetPose}
            aria-label="Reset Pose"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-700 hover:text-stone-950 bg-stone-200/75 hover:bg-stone-300/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
