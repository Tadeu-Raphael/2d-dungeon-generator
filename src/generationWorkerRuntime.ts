import { generateDungeonPipeline } from "./generationPipeline";
import {
  generateDungeonStructure,
} from "./dungeonStructureGeneration";
import {
  packDungeonStructureResult,
  packGenerationResult,
  withoutDungeonStructurePlans,
  withoutGenerationPlan,
} from "./generationWorkerProtocol";
import type {
  GenerationWorkerErrorMessage,
  GenerationWorkerMetrics,
  GenerationWorkerOutput,
  GenerationWorkerResultMessage,
  DungeonGenerationWorkRequest,
} from "./generationWorkerProtocol";
import { CorridorRoutingError } from "./generationCorridorRouter";
import { GenerationPlanValidationError } from "./generationPlanValidation";
import { DungeonStructureValidationError } from "./dungeonStructureValidation";

export function runGenerationWorkerRequest(
  requestId: number,
  request: DungeonGenerationWorkRequest,
): { message: GenerationWorkerResultMessage; transferBuffers: ArrayBuffer[] } {
  const startedAt = performance.now();
  let output: GenerationWorkerOutput;
  let transferBuffers: ArrayBuffer[];
  let roomCount: number;
  let tileCount: number;
  let levelCount: number;
  let warnings: string[];
  let packagingMs = 0;
  if (request.kind === "single") {
    const generated = generateDungeonPipeline(request.request);
    const generationMs = performance.now() - startedAt;
    const packagingStartedAt = performance.now();
    const packed = packGenerationResult(withoutGenerationPlan(generated));
    packagingMs = performance.now() - packagingStartedAt;
    output = { kind: "single", result: packed.result };
    transferBuffers = [packed.transferBuffer];
    roomCount = generated.dungeon.roomDetails.length;
    tileCount = generated.dungeon.width * generated.dungeon.height;
    levelCount = 1;
    warnings = [...new Set([
      generated.fallbackReason,
      generated.algorithmNote,
    ].filter((warning): warning is string => Boolean(warning)))];
    const metrics: GenerationWorkerMetrics = {
      generationMs,
      packagingMs,
      totalMs: performance.now() - startedAt,
      roomCount,
      tileCount,
      levelCount,
    };
    return {
      message: { type: "result", requestId, result: output, metrics, warnings },
      transferBuffers,
    };
  }

  const generated = generateDungeonStructure(request.request);
  const generationMs = performance.now() - startedAt;
  const packagingStartedAt = performance.now();
  const uiResult = withoutDungeonStructurePlans(generated);
  const packed = packDungeonStructureResult(uiResult);
  packagingMs = performance.now() - packagingStartedAt;
  output = { kind: "multilevel", result: packed.result };
  transferBuffers = packed.transferBuffers;
  roomCount = generated.levels.reduce(
    (total, level) => total + level.generation.dungeon.roomDetails.length,
    0,
  );
  tileCount = generated.levels.reduce(
    (total, level) => total + level.generation.dungeon.width * level.generation.dungeon.height,
    0,
  );
  levelCount = generated.levels.length;
  warnings = [...new Set(generated.levels.flatMap(({ generation }) => [
    generation.fallbackReason,
    generation.algorithmNote,
  ].filter((warning): warning is string => Boolean(warning))))];
  const metrics: GenerationWorkerMetrics = {
    generationMs,
    packagingMs,
    totalMs: performance.now() - startedAt,
    roomCount,
    tileCount,
    levelCount,
  };
  return {
    message: {
      type: "result",
      requestId,
      result: output,
      metrics,
      warnings,
    },
    transferBuffers,
  };
}

export function createGenerationWorkerErrorMessage(
  requestId: number,
  error: unknown,
): GenerationWorkerErrorMessage {
  const message = error instanceof Error ? error.message : String(error);
  const details: string[] | undefined = error instanceof CorridorRoutingError
    ? [...error.details]
    : error instanceof GenerationPlanValidationError
      ? error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : error instanceof DungeonStructureValidationError
        ? error.issues.map((issue) => `${issue.path}: ${issue.message}`)
      : undefined;
  return {
    type: "error",
    requestId,
    message,
    ...(details?.length ? { details } : {}),
  };
}
