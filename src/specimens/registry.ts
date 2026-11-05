import { BLUE_MARLIN_SPECIMEN } from './blueMarlinSpecimen';
import { OCTOPUS_SPECIMEN } from './octopusSpecimen';
import { TIGER_SHARK_SPECIMEN } from './tigerSharkSpecimen';
import { JellySpecimenDefinition, SpecimenId } from './types';

/**
 * Central Registry of Swappable Bilayer Jelly Specimens.
 * To add a new jelly object (manually or via AI), create a `JellySpecimenDefinition`
 * with its 3D controller and object-specific control component, and register it here.
 */
export const SPECIMEN_REGISTRY: Record<SpecimenId, JellySpecimenDefinition<any>> = {
  octopus: OCTOPUS_SPECIMEN,
  tiger_shark: TIGER_SHARK_SPECIMEN,
  blue_marlin: BLUE_MARLIN_SPECIMEN,
};

export const SPECIMEN_LIST: JellySpecimenDefinition<any>[] = [
  OCTOPUS_SPECIMEN,
  TIGER_SHARK_SPECIMEN,
  BLUE_MARLIN_SPECIMEN,
];

export function getSpecimenDefinition(id: SpecimenId): JellySpecimenDefinition<any> {
  return SPECIMEN_REGISTRY[id] || OCTOPUS_SPECIMEN;
}

