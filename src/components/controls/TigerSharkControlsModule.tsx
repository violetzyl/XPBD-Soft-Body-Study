import React from 'react';
import { SpecificControlsProps } from '../../specimens/types';

export interface TigerSharkSpecificParams {
  tailBeatIntensity: number;
  swimPose: 'cruise' | 'arch' | 'rest';
}

export const TigerSharkControlsModule: React.FC<
  SpecificControlsProps<TigerSharkSpecificParams>
> = ({ params, onChangeParams }) => {
  const { tailBeatIntensity, swimPose } = params;

  return (
    <div
      data-testid="specific-controls-tiger-shark"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {/* 1. Shark Caudal Drive Intensity Slider */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[190px] max-w-[260px]">
        <label
          htmlFor="shark-tail-drive-slider"
          className="text-xs font-medium text-stone-700 whitespace-nowrap shrink-0"
        >
          Caudal Drive
        </label>
        <input
          id="shark-tail-drive-slider"
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={tailBeatIntensity}
          onChange={(e) =>
            onChangeParams({
              ...params,
              tailBeatIntensity: parseFloat(e.target.value),
            })
          }
          className="w-full accent-stone-800 cursor-pointer"
        />
        <span className="text-xs font-mono-tabular text-stone-700 w-9 text-right shrink-0">
          {Math.round(tailBeatIntensity * 100)}%
        </span>
      </div>

      {/* 2. Shark Three Specific Poses: Cruise, Dorsal Arch, Platter Rest */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
          Shark Pose
        </span>
        <div
          role="group"
          aria-label="Shark Swim Pose"
          className="inline-flex items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
        >
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, swimPose: 'cruise' })}
            aria-pressed={swimPose === 'cruise'}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              swimPose === 'cruise'
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Cruise Wave
          </button>
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, swimPose: 'arch' })}
            aria-pressed={swimPose === 'arch'}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              swimPose === 'arch'
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Dorsal Arch
          </button>
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, swimPose: 'rest' })}
            aria-pressed={swimPose === 'rest'}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              swimPose === 'rest'
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Platter Rest
          </button>
        </div>
      </div>
    </div>
  );
};
