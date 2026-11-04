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
import type { DungeonConcept } from "./dungeonProfiles";

type BaselineParameters = Pick<DungeonParameters, "width" | "height" | "roomCount">
  & Partial<Pick<DungeonParameters, "cellularFillPercent" | "cellularIterations" | "drunkardCoveragePercent">>;

export interface DungeonGenerationBaseline {
  id: string;
  scale: "small" | "medium" | "large";
  profile: DungeonConcept | "custom";
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
    expectedFingerprint: "a6bb96e09ddb3ea45d0cc83fb68f96763dc0890e9fff452c7fd439dc5839155a",
  },
  {
    id: "large-laboratory-hybrid",
    scale: "large",
    profile: "arcane-laboratory",
    algorithm: "hybrid",
    seed: 33003,
    parameters: { width: 96, height: 72, roomCount: 18 },
    expectedRoomCount: 18,
    expectedFingerprint: "5d2ed4d3f5374288fc1f50e2e7b20e217fb70373fec7e840fc5bf7c62d88b41f",
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
    expectedFingerprint: "99e2a7e502b3ef8a72f68345d46a21f79416543ef3f8d62cc39a22bc1368b86d",
  },
];

export function generateDungeonV1BaselineCollection(): DungeonGenerationBaselineRun[] {
  return DUNGEON_GENERATION_V1_BASELINES.map((baseline) => {
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
    const request: DungeonGenerationRequest = {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      algorithm: baseline.algorithm,
      seed: baseline.seed,
      profile: baseline.profile,
      parameters,
      settings: { baselineId: baseline.id },
    };

    return {
      baseline,
      request,
      generation: generateDungeonVersioned(request),
    };
  });
}
