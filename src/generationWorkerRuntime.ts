import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  packGenerationResult,
} from "./generationWorkerProtocol";
import type {
  GenerationWorkerErrorMessage,
  GenerationWorkerMetrics,
  GenerationWorkerResultMessage,
} from "./generationWorkerProtocol";
import { CorridorRoutingError } from "./generationCorridorRouter";
import { GenerationPlanValidationError } from "./generationPlanValidation";

export function runGenerationWorkerRequest(
  requestId: number,
  request: DungeonGenerationPipelineRequest,
): { message: GenerationWorkerResultMessage; transferBuffer: ArrayBuffer } {
  const startedAt = performance.now();
  const generation = generateDungeonPipeline(request);
  const generationMs = performance.now() - startedAt;
  const packagingStartedAt = performance.now();
  const packed = packGenerationResult(generation);
  const packagingMs = performance.now() - packagingStartedAt;
  const metrics: GenerationWorkerMetrics = {
    generationMs,
    packagingMs,
    totalMs: performance.now() - startedAt,
    roomCount: generation.dungeon.roomDetails.length,
    tileCount: generation.dungeon.width * generation.dungeon.height,
  };
  const warnings = [...new Set([
    generation.fallbackReason,
    generation.algorithmNote,
  ].filter((warning): warning is string => Boolean(warning)))];
  return {
    message: {
      type: "result",
      requestId,
      result: packed.result,
      metrics,
      warnings,
    },
    transferBuffer: packed.transferBuffer,
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
      : undefined;
  return {
    type: "error",
    requestId,
    message,
    ...(details?.length ? { details } : {}),
  };
}
