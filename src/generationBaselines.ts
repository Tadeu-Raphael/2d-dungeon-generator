import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  generateDungeonVersioned,
} from "./dungeon";
import type {
  Algorithm,
  DungeonGenerationRequest,
  DungeonParameters,
  VersionedDungeonGeneration,
} from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type { CustomDungeonProfile, DungeonConcept } from "./dungeonProfiles";

type BaselineParameters = Pick<DungeonParameters, "width" | "height" | "roomCount">
  & Partial<Pick<DungeonParameters, "cellularFillPercent" | "cellularIterations" | "drunkardCoveragePercent">>;

export interface DungeonGenerationBaseline {
  id: string;
  scale: "small" | "medium" | "large";
  profile: DungeonConcept | "custom";
  customProfile?: CustomDungeonProfile;
  algorithm: Algorithm;
  seed: number;
  parameters: BaselineParameters;
  expectedRoomCount: number;
  expectedFingerprint: string;
}

export interface DungeonGenerationBaselineRun {
  baseline: DungeonGenerationBaseline;
  request: DungeonGenerationRequest;
  generation: VersionedDungeonGeneration;
}

export const DUNGEON_GENERATION_V1_BASELINES: readonly DungeonGenerationBaseline[] = [
  {
    id: "small-fortress-bsp",
    scale: "small",
    profile: "military-fortress",
    algorithm: "bsp",
    seed: 11001,
    parameters: { width: 32, height: 24, roomCount: 6 },
    expectedRoomCount: 4,
    expectedFingerprint: "fc976061af40b7b797e0cfafa1660bc19dc6d0dd9235e7891dc370a85dad3dc3",
  },
  {
    id: "medium-temple-bsp-cellular",
    scale: "medium",
    profile: "ancient-temple",
    algorithm: "bsp-cellular",
    seed: 22002,
    parameters: { width: 64, height: 48, roomCount: 12, cellularFillPercent: 48 },
    expectedRoomCount: 12,
    expectedFingerprint: "8c26b0766a77f0e42a095414c580d268c9a75731a63837b5887ee1a88f241538",
  },
  {
    id: "large-laboratory-hybrid",
    scale: "large",
    profile: "arcane-laboratory",
    algorithm: "hybrid",
    seed: 33003,
    parameters: { width: 96, height: 72, roomCount: 18 },
    expectedRoomCount: 18,
    expectedFingerprint: "7a17f25e34e619c77885626db40fb5e9578d456482d6f8f027c5f284a0419e2c",
  },
  {
    id: "small-natural-cavern-cellular",
    scale: "small",
    profile: "natural-cavern",
    algorithm: "cellular",
    seed: 44004,
    parameters: { width: 32, height: 24, roomCount: 6, cellularFillPercent: 48 },
    expectedRoomCount: 0,
    expectedFingerprint: "ad547dcb5a8b75ce0a1d870af0e0fbb5c92e8c16b5d1971778b88730a1784d7f",
  },
  {
    id: "medium-custom-drunkard",
    scale: "medium",
    profile: "custom",
    customProfile: {
      id: "medium-custom-drunkard",
      name: "Galerias errantes",
      baseProfile: "abandoned-mine",
      algorithm: "drunkard",
      topology: { style: "branching" },
    },
    algorithm: "drunkard",
    seed: 55005,
    parameters: { width: 64, height: 48, roomCount: 12, drunkardCoveragePercent: 34 },
    expectedRoomCount: 0,
    expectedFingerprint: "1a3024a8b656a6ffc1dbfe6da05861e0684dfef2b711f0130a327fa04552d091",
  },
  {
    id: "large-catacombs-bsp-drunkard",
    scale: "large",
    profile: "catacombs",
    algorithm: "bsp-drunkard",
    seed: 66006,
    parameters: { width: 80, height: 60, roomCount: 16, drunkardCoveragePercent: 34 },
    expectedRoomCount: 16,
    expectedFingerprint: "a65b9c5aad9edf242f6dba9ba32402cdbd9578033489767e7ecb184bf4d802ca",
  },
];

export function createDungeonV1BaselineRequest(
  baseline: DungeonGenerationBaseline,
): DungeonGenerationRequest {
  const profile = baseline.profile === "custom" ? undefined : DUNGEON_CONCEPTS[baseline.profile];
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    ...baseline.parameters,
    roomTypeDistributionEnabled: true,
    roomTypeCategoryFrequencies:
      profile?.roomTypeCategoryFrequencies ?? DEFAULT_DUNGEON_PARAMETERS.roomTypeCategoryFrequencies,
    trapCategoryWeights:
      profile?.trapCategoryWeights ?? DEFAULT_DUNGEON_PARAMETERS.trapCategoryWeights,
    treasureCategoryWeights:
      profile?.treasureCategoryWeights ?? DEFAULT_DUNGEON_PARAMETERS.treasureCategoryWeights,
  };
  return {
    generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
    algorithm: baseline.algorithm,
    seed: baseline.seed,
    profile: baseline.profile,
    parameters,
    settings: { baselineId: baseline.id },
  };
}

export function generateDungeonV1BaselineCollection(): DungeonGenerationBaselineRun[] {
  return DUNGEON_GENERATION_V1_BASELINES.map((baseline) => {
    const request = createDungeonV1BaselineRequest(baseline);
    return {
      baseline,
      request,
      generation: generateDungeonVersioned(request),
    };
  });
}
