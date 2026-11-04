import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V2,
  type Dungeon,
  type Tile,
} from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type {
  DungeonGenerationPipelineRequest,
  DungeonGenerationPipelineResult,
} from "./generationPipeline";
import type {
  DungeonLevel,
  DungeonStructure,
} from "./dungeonStructure";
import type {
  DungeonStructureGenerationRequest,
  DungeonStructureGenerationResult,
} from "./dungeonStructureGeneration";
import type { DungeonStructureConnectivityAnalysis } from "./dungeonStructureValidation";

export const GENERATION_WORKER_WORK_THRESHOLD = 10_000;

export type DungeonGenerationWorkRequest =
  | { kind: "single"; request: DungeonGenerationPipelineRequest }
  | { kind: "multilevel"; request: DungeonStructureGenerationRequest };

export interface GenerationWorkerRequestMessage {
  type: "generate";
  requestId: number;
  request: DungeonGenerationWorkRequest;
}

export interface GenerationWorkerProgressMessage {
  type: "progress";
  requestId: number;
  phase: "generating";
}

export interface GenerationWorkerMetrics {
  generationMs: number;
  packagingMs: number;
  totalMs: number;
  roomCount: number;
  tileCount: number;
  levelCount: number;
}

export type UiDungeonGenerationResult = Omit<DungeonGenerationPipelineResult, "plan">;

export type UiDungeonStructure = Omit<DungeonStructure, "levels"> & {
  levels: readonly Omit<DungeonLevel, "plan">[];
};

export interface UiDungeonStructureGenerationResult {
  structure: UiDungeonStructure;
  levels: readonly {
    levelId: string;
    generation: UiDungeonGenerationResult;
  }[];
  connectivity: DungeonStructureConnectivityAnalysis;
}

export type UiDungeonGenerationOutput =
  | { kind: "single"; result: UiDungeonGenerationResult }
  | { kind: "multilevel"; result: UiDungeonStructureGenerationResult };

export type GenerationWorkerResult = Omit<UiDungeonGenerationResult, "dungeon"> & {
  dungeon: Omit<Dungeon, "tiles"> & { tiles: ArrayBuffer };
};

export interface GenerationWorkerStructureResult {
  structure: UiDungeonStructure;
  levels: readonly {
    levelId: string;
    generation: GenerationWorkerResult;
  }[];
  connectivity: DungeonStructureConnectivityAnalysis;
}

export type GenerationWorkerOutput =
  | { kind: "single"; result: GenerationWorkerResult }
  | { kind: "multilevel"; result: GenerationWorkerStructureResult };

export interface GenerationWorkerResultMessage {
  type: "result";
  requestId: number;
  result: GenerationWorkerOutput;
  metrics: GenerationWorkerMetrics;
  warnings: string[];
}

export interface GenerationWorkerErrorMessage {
  type: "error";
  requestId: number;
  message: string;
  details?: string[];
}

export type GenerationWorkerResponseMessage =
  | GenerationWorkerProgressMessage
  | GenerationWorkerResultMessage
  | GenerationWorkerErrorMessage;

function estimatePipelineWork(request: DungeonGenerationPipelineRequest): number {
  const parameters = request.parameters ?? DEFAULT_DUNGEON_PARAMETERS;
  const tileCount = Math.max(0, parameters.width * parameters.height);
  const roomCount = Math.max(1, parameters.roomCount);
  const customProfile = request.profile === "custom" ? request.customProfile : undefined;
  const baseProfile = customProfile
    && Object.prototype.hasOwnProperty.call(DUNGEON_CONCEPTS, customProfile.baseProfile)
    ? DUNGEON_CONCEPTS[customProfile.baseProfile]
    : undefined;
  const algorithm = request.profile === "custom"
    ? customProfile?.algorithm ?? baseProfile?.algorithm ?? "bsp"
    : DUNGEON_CONCEPTS[request.profile].algorithm;
  const usesCellularPass = Boolean(
    request.cavesEnabled
    || customProfile?.cavesEnabled
    || customProfile?.mode === "natural-cavern"
    || algorithm.includes("cellular")
    || (request.profile !== "custom" && request.profile === "natural-cavern"),
  );
  const cellularIterations = usesCellularPass
    ? Math.max(1, parameters.cellularIterations)
    : 1;
  return tileCount * Math.max(roomCount, cellularIterations);
}

export function estimateGenerationWork(request: DungeonGenerationWorkRequest): number {
  if (request.kind === "single") return estimatePipelineWork(request.request);
  return request.request.levels.reduce((total, level) => (
    total + estimatePipelineWork({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: level.profile ?? request.request.profile,
      ...(
        level.customProfile
        || level.profile === undefined
        || level.profile === request.request.profile
          ? {
            customProfile: level.customProfile ?? request.request.customProfile,
          }
          : {}
      ),
      seed: request.request.seed,
      parameters: {
        ...request.request.parameters,
        width: level.width,
        height: level.height,
        roomCount: level.roomCount,
      },
      cavesEnabled: request.request.cavesEnabled,
    })
  ), 0);
}

export function shouldGenerateInWorker(request: DungeonGenerationWorkRequest): boolean {
  return estimateGenerationWork(request) >= GENERATION_WORKER_WORK_THRESHOLD;
}

export function withoutGenerationPlan(
  result: DungeonGenerationPipelineResult,
): UiDungeonGenerationResult {
  const uiResult = { ...result };
  delete uiResult.plan;
  return uiResult;
}

export function packGenerationResult(result: UiDungeonGenerationResult): {
  result: GenerationWorkerResult;
  transferBuffer: ArrayBuffer;
} {
  const uiResult = result;
  const { dungeon, ...pipelineResult } = uiResult;
  if (
    !Number.isSafeInteger(dungeon.width)
    || !Number.isSafeInteger(dungeon.height)
    || dungeon.tiles.length !== dungeon.height
  ) {
    throw new RangeError("Generated dungeon dimensions do not match its tile rows.");
  }

  const transferBuffer = new ArrayBuffer(dungeon.width * dungeon.height);
  const packedTiles = new Uint8Array(transferBuffer);
  let index = 0;
  for (const row of dungeon.tiles) {
    if (row.length !== dungeon.width) {
      throw new RangeError("Generated dungeon contains a tile row with an invalid width.");
    }
    for (const tile of row) {
      if (!isDungeonTile(tile) || tile > 255) {
        throw new RangeError(`Generated dungeon contains an unsupported tile value: ${tile}.`);
      }
      packedTiles[index] = tile;
      index += 1;
    }
  }

  return {
    result: {
      ...pipelineResult,
      dungeon: {
        ...dungeon,
        tiles: transferBuffer,
      },
    },
    transferBuffer,
  };
}

export function unpackGenerationResult(result: GenerationWorkerResult): UiDungeonGenerationResult {
  const { dungeon, ...pipelineResult } = result;
  const { tiles: transferBuffer, ...dungeonData } = dungeon;
  const { width, height } = dungeonData;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || transferBuffer.byteLength !== width * height
  ) {
    throw new RangeError("Worker returned tile data that does not match the dungeon dimensions.");
  }

  const packedTiles = new Uint8Array(transferBuffer);
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x += 1) {
      const tile = packedTiles[y * width + x];
      if (!isDungeonTile(tile)) {
        throw new RangeError(`Worker returned an unsupported tile value: ${tile}.`);
      }
      row.push(tile);
    }
    tiles.push(row);
  }

  return {
    ...pipelineResult,
    dungeon: {
      ...dungeonData,
      tiles,
    },
  };
}

export function withoutDungeonStructurePlans(
  result: DungeonStructureGenerationResult,
): UiDungeonStructureGenerationResult {
  return {
    structure: {
      ...result.structure,
      levels: result.structure.levels.map(({ plan: _plan, ...level }) => level),
    },
    levels: result.levels.map(({ levelId, generation }) => ({
      levelId,
      generation: withoutGenerationPlan(generation),
    })),
    connectivity: result.connectivity,
  };
}

export function packDungeonStructureResult(
  result: UiDungeonStructureGenerationResult,
): { result: GenerationWorkerStructureResult; transferBuffers: ArrayBuffer[] } {
  const transferBuffers: ArrayBuffer[] = [];
  const levels = result.levels.map(({ levelId, generation }) => {
    const packed = packGenerationResult(generation);
    transferBuffers.push(packed.transferBuffer);
    return { levelId, generation: packed.result };
  });
  return {
    result: {
      structure: result.structure,
      levels,
      connectivity: result.connectivity,
    },
    transferBuffers,
  };
}

export function unpackGenerationOutput(output: GenerationWorkerOutput): UiDungeonGenerationOutput {
  if (output.kind === "single") {
    return { kind: "single", result: unpackGenerationResult(output.result) };
  }
  return {
    kind: "multilevel",
    result: {
      structure: output.result.structure,
      levels: output.result.levels.map(({ levelId, generation }) => ({
        levelId,
        generation: unpackGenerationResult(generation),
      })),
      connectivity: output.result.connectivity,
    },
  };
}

function isDungeonTile(value: number): value is Tile {
  return Number.isInteger(value) && value >= 0 && value <= 160;
}
