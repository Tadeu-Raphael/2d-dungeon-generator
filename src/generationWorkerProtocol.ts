import {
  DEFAULT_DUNGEON_PARAMETERS,
  type Dungeon,
  type Tile,
} from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type {
  DungeonGenerationPipelineRequest,
  DungeonGenerationPipelineResult,
} from "./generationPipeline";

export const GENERATION_WORKER_WORK_THRESHOLD = 120_000;

export interface GenerationWorkerRequestMessage {
  type: "generate";
  requestId: number;
  request: DungeonGenerationPipelineRequest;
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
}

export type UiDungeonGenerationResult = Omit<DungeonGenerationPipelineResult, "plan">;

export type GenerationWorkerResult = Omit<UiDungeonGenerationResult, "dungeon"> & {
  dungeon: Omit<Dungeon, "tiles"> & { tiles: ArrayBuffer };
};

export interface GenerationWorkerResultMessage {
  type: "result";
  requestId: number;
  result: GenerationWorkerResult;
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

export function estimateGenerationWork(request: DungeonGenerationPipelineRequest): number {
  const parameters = request.parameters ?? DEFAULT_DUNGEON_PARAMETERS;
  const tileCount = Math.max(0, parameters.width * parameters.height);
  const roomCount = Math.max(1, parameters.roomCount);
  const usesCellularPass = request.cavesEnabled
    || request.profile === "natural-cavern"
    || DUNGEON_CONCEPTS[request.profile].algorithm.includes("cellular");
  const cellularIterations = usesCellularPass
    ? Math.max(1, parameters.cellularIterations)
    : 1;
  return tileCount * Math.max(roomCount, cellularIterations);
}

export function shouldGenerateInWorker(request: DungeonGenerationPipelineRequest): boolean {
  return estimateGenerationWork(request) >= GENERATION_WORKER_WORK_THRESHOLD;
}

export function withoutGenerationPlan(
  result: DungeonGenerationPipelineResult,
): UiDungeonGenerationResult {
  const uiResult = { ...result };
  delete uiResult.plan;
  return uiResult;
}

export function packGenerationResult(result: DungeonGenerationPipelineResult): {
  result: GenerationWorkerResult;
  transferBuffer: ArrayBuffer;
} {
  const uiResult = withoutGenerationPlan(result);
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

function isDungeonTile(value: number): value is Tile {
  return Number.isInteger(value) && value >= 0 && value <= 160;
}
