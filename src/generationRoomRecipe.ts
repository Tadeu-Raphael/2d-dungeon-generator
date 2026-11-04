import {
  DUNGEON_GENERATOR_VERSION_V1,
  generateDungeonVersioned,
} from "./dungeon";
import type {
  Dungeon,
  DungeonGenerationMetadata,
  DungeonParameters,
  RoomSizeFrequencies,
} from "./dungeon";
import type { DungeonConcept, DungeonConceptProfile } from "./dungeonProfiles";

const MAX_V2_ROOM_RECIPE_ATTEMPTS = 5;
const ROOM_RECIPE_COMPACTNESS_FALLBACKS = [70, 50, 30, 0] as const;

export interface RoomRecipeResult {
  generation: DungeonGenerationMetadata;
  dungeon: Dungeon;
  roomCount: number;
  recoveryAttempts: number;
  recipeCompactness: number;
}

function applyRoomSizeBias(
  parameters: DungeonParameters,
  bias: "compact" | "balanced" | "monumental",
): DungeonParameters {
  if (parameters.roomSizeDistributionEnabled) return parameters;

  const multipliers: Record<keyof RoomSizeFrequencies, number> = bias === "compact"
    ? { micro: 1.4, verySmall: 1.3, small: 1.15, medium: 0.9, large: 0.55, veryLarge: 0.3, colossal: 0.15 }
    : bias === "monumental"
      ? { micro: 0.25, verySmall: 0.45, small: 0.7, medium: 1, large: 1.3, veryLarge: 1.5, colossal: 1.6 }
      : { micro: 1, verySmall: 1, small: 1, medium: 1, large: 1, veryLarge: 1, colossal: 1 };
  const weighted = Object.fromEntries(
    Object.entries(parameters.roomSizeFrequencies).map(([key, frequency]) => [
      key,
      frequency * multipliers[key as keyof RoomSizeFrequencies],
    ]),
  ) as RoomSizeFrequencies;
  const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    throw new RangeError("At least one room-size frequency must be positive.");
  }
  const normalized = Object.fromEntries(
    Object.entries(weighted).map(([key, value]) => [key, Math.round((value / total) * 100)]),
  ) as RoomSizeFrequencies;
  const roundingDifference = 100 - Object.values(normalized).reduce((sum, value) => sum + value, 0);

  return {
    ...parameters,
    roomSizeDistributionEnabled: true,
    roomSizeFrequencies: {
      ...normalized,
      medium: Math.max(0, normalized.medium + roundingDifference),
    },
  };
}

export function generateV2RoomRecipe(
  request: { profile: DungeonConcept; seed: number },
  parameters: DungeonParameters,
  profile: DungeonConceptProfile,
): RoomRecipeResult {
  const biasedParameters = applyRoomSizeBias(parameters, profile.v2Preferences.roomSizeBias);
  const compactnessAttempts = [
    ...new Set([
      biasedParameters.corridorCompactness,
      ...ROOM_RECIPE_COMPACTNESS_FALLBACKS.filter(
        (value) => value < biasedParameters.corridorCompactness,
      ),
    ]),
  ].slice(0, MAX_V2_ROOM_RECIPE_ATTEMPTS);
  let bestResult: RoomRecipeResult | undefined;

  for (const [index, recipeCompactness] of compactnessAttempts.entries()) {
    const recipeSeed = index === 0
      ? request.seed
      : (request.seed + Math.imul(index, 0x9e3779b9)) >>> 0;
    const recipeParameters = {
      ...biasedParameters,
      corridorCompactness: recipeCompactness,
    };
    const generated = generateDungeonVersioned({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      algorithm: "bsp",
      seed: recipeSeed,
      profile: request.profile,
      parameters: recipeParameters,
      settings: {
        role: "v2-room-and-content-recipe",
        roomRecipeAttempt: index + 1,
        roomRecipeCompactness: recipeCompactness,
        roomRecipeSeed: recipeSeed,
      },
    });
    const candidate: RoomRecipeResult = {
      dungeon: generated.dungeon,
      generation: {
        ...generated.metadata,
        seed: request.seed,
        parameters: biasedParameters,
        settings: {
          ...generated.metadata.settings,
          roomRecipeAttempt: index + 1,
          roomRecipeCompactness: recipeCompactness,
        },
      },
      roomCount: generated.dungeon.roomDetails.length,
      recoveryAttempts: index + 1,
      recipeCompactness,
    };
    if (!bestResult || candidate.roomCount > bestResult.roomCount) bestResult = candidate;
    if (candidate.roomCount >= parameters.roomCount) return candidate;
  }

  if (!bestResult) throw new Error("The bounded V2 room recipe did not run.");
  return {
    ...bestResult,
    recoveryAttempts: compactnessAttempts.length,
  };
}
