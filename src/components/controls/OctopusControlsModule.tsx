import React from 'react';
import { SpecificControlsProps } from '../../specimens/types';

export interface OctopusSpecificParams {
  muscleActivity: number;
  curlOverride: number; // 0 = Writhe, 1 = Curl Up, -1 = Let Go
}

export const OctopusControlsModule: React.FC<
  SpecificControlsProps<OctopusSpecificParams>
> = ({ params, onChangeParams }) => {
  const { muscleActivity, curlOverride } = params;

  return (
    <div
      data-testid="specific-controls-octopus"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {/* 1. Octopus Muscle Strain Wave Intensity Slider */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[190px] max-w-[260px]">
        <label
          htmlFor="muscle-activity-slider"
          className="text-xs font-medium text-stone-700 whitespace-nowrap shrink-0"
        >
          Strain
        </label>
        <input
          id="muscle-activity-slider"
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={muscleActivity}
          onChange={(e) =>
            onChangeParams({
              ...params,
              muscleActivity: parseFloat(e.target.value),
            })
          }
          className="w-full accent-stone-800 cursor-pointer"
        />
        <span className="text-xs font-mono-tabular text-stone-700 w-9 text-right shrink-0">
          {Math.round(muscleActivity * 100)}%
        </span>
      </div>

      {/* 2. Octopus Three Specific Poses: Writhe, Curl Up, Let Go */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
          Octopus Pose
        </span>
        <div
          role="group"
          aria-label="Arm Curl Mode"
          className="inline-flex items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
        >
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, curlOverride: 0 })}
            aria-pressed={curlOverride === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              curlOverride === 0
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Writhe
          </button>
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, curlOverride: 1 })}
            aria-pressed={curlOverride === 1}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              curlOverride === 1
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Curl Up
          </button>
          <button
            type="button"
            onClick={() => onChangeParams({ ...params, curlOverride: -1 })}
            aria-pressed={curlOverride === -1}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              curlOverride === -1
                ? 'bg-white text-stone-950 shadow-xs'
                : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            Let Go
          </button>
        </div>
      </div>
    </div>
  );
};
