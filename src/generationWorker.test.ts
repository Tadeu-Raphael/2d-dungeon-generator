import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
} from "./dungeon";
import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  estimateGenerationWork,
  GENERATION_WORKER_WORK_THRESHOLD,
  shouldGenerateInWorker,
  unpackGenerationResult,
} from "./generationWorkerProtocol";
import type {
  GenerationWorkerRequestMessage,
  GenerationWorkerResponseMessage,
} from "./generationWorkerProtocol";
import { runGenerationWorkerRequest } from "./generationWorkerRuntime";
import {
  GenerationWorkerRunner,
} from "./generationWorkerRunner";
import type { GenerationWorkerLike } from "./generationWorkerRunner";

function createRequest(
  overrides: Partial<DungeonGenerationPipelineRequest> = {},
): DungeonGenerationPipelineRequest {
  return {
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile: "military-fortress",
    seed: 83002,
    parameters: {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 64,
      height: 48,
      roomCount: 8,
      corridorWidth: 1,
    },
    ...overrides,
  };
}

class FakeGenerationWorker implements GenerationWorkerLike {
  onmessage: GenerationWorkerLike["onmessage"] = null;
  onerror: GenerationWorkerLike["onerror"] = null;
  onmessageerror: GenerationWorkerLike["onmessageerror"] = null;
  request: GenerationWorkerRequestMessage | undefined;
  terminated = false;

  postMessage(message: GenerationWorkerRequestMessage): void {
    this.request = message;
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: GenerationWorkerResponseMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<GenerationWorkerResponseMessage>);
  }
}

describe("generation Worker strategy and protocol", () => {
  it("selects the Worker using measured tile-room work rather than map size alone", () => {
    const small = createRequest({
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 160,
        height: 120,
        roomCount: 6,
      },
    });
    const medium = createRequest({
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 96,
        height: 72,
        roomCount: 18,
      },
    });
    const large = createRequest({
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 250,
        height: 250,
        roomCount: 8,
      },
    });

    expect(estimateGenerationWork(small)).toBe(115_200);
    expect(estimateGenerationWork(medium)).toBeGreaterThanOrEqual(GENERATION_WORKER_WORK_THRESHOLD);
    expect(shouldGenerateInWorker(small)).toBe(false);
    expect(shouldGenerateInWorker(medium)).toBe(true);
    expect(shouldGenerateInWorker(large)).toBe(true);
  });

  it.each([
    DUNGEON_GENERATOR_VERSION_V1,
    DUNGEON_GENERATOR_VERSION_V2,
  ])("returns a compact transferable result equivalent to synchronous %s generation", (generatorVersion) => {
    const request = createRequest({
      generatorVersion,
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 250,
        height: 250,
        roomCount: 8,
        corridorWidth: 1,
      },
    });
    const expected = generateDungeonPipeline(request);
    const workerResult = runGenerationWorkerRequest(4, request);
    const actual = unpackGenerationResult(workerResult.message.result);

    expect(actual.dungeon).toEqual(expected.dungeon);
    expect("plan" in workerResult.message.result).toBe(false);
    expect(workerResult.transferBuffer.byteLength).toBe(250 * 250);
    expect(workerResult.message.metrics).toMatchObject({
      roomCount: expected.dungeon.roomDetails.length,
      tileCount: 250 * 250,
    });
    expect(workerResult.message.warnings).toEqual([...new Set([
      expected.fallbackReason,
      expected.algorithmNote,
    ].filter((warning): warning is string => Boolean(warning)))]);
  });

  it("keeps the result deterministic for identical seeds and parameters", () => {
    const request = createRequest();
    const first = unpackGenerationResult(runGenerationWorkerRequest(1, request).message.result);
    const second = unpackGenerationResult(runGenerationWorkerRequest(2, request).message.result);

    expect(first.dungeon).toEqual(second.dungeon);
    expect(first.metadata.seed).toBe(second.metadata.seed);
    expect(first.metadata.parameters).toEqual(second.metadata.parameters);
  });
});

describe("generation Worker lifecycle", () => {
  it("terminates replaced work and ignores late messages from the old Worker", () => {
    const workers: FakeGenerationWorker[] = [];
    const runner = new GenerationWorkerRunner(() => {
      const worker = new FakeGenerationWorker();
      workers.push(worker);
      return worker;
    });
    const staleProgress: string[] = [];
    const results: unknown[] = [];
    const callbacks = {
      onProgress: (phase: "generating") => staleProgress.push(phase),
      onResult: (result: unknown) => results.push(result),
      onError: (message: string) => results.push(message),
    };
    const request = createRequest();
    const oldRequestId = runner.run(request, callbacks);
    const oldHandler = workers[0].onmessage;
    const currentRequestId = runner.run({ ...request, seed: request.seed + 1 }, callbacks);
    const staleResult = runGenerationWorkerRequest(oldRequestId, request);

    expect(currentRequestId).toBeGreaterThan(oldRequestId);
    expect(workers[0].terminated).toBe(true);
    oldHandler?.({
      data: { type: "progress", requestId: oldRequestId, phase: "generating" },
    } as MessageEvent<GenerationWorkerResponseMessage>);
    oldHandler?.({ data: staleResult.message } as MessageEvent<GenerationWorkerResponseMessage>);
    expect(staleProgress).toEqual([]);
    expect(results).toEqual([]);

    const currentResult = runGenerationWorkerRequest(currentRequestId, {
      ...request,
      seed: request.seed + 1,
    });
    workers[1].emit(currentResult.message);
    expect(results).toHaveLength(1);
    expect(workers[1].terminated).toBe(true);
  });

  it("cancels the active Worker and never applies its late result", () => {
    const worker = new FakeGenerationWorker();
    const runner = new GenerationWorkerRunner(() => worker);
    let resultCount = 0;
    const requestId = runner.run(createRequest(), {
      onProgress: () => undefined,
      onResult: () => { resultCount += 1; },
      onError: () => undefined,
    });
    const lateHandler = worker.onmessage;
    runner.cancel();
    lateHandler?.({
      data: { type: "progress", requestId, phase: "generating" },
    } as MessageEvent<GenerationWorkerResponseMessage>);

    expect(worker.terminated).toBe(true);
    expect(resultCount).toBe(0);
  });

  it("reports Worker startup and runtime errors explicitly", () => {
    const startupErrors: string[] = [];
    const startupRunner = new GenerationWorkerRunner(() => {
      throw new Error("Worker unavailable");
    });
    startupRunner.run(createRequest(), {
      onProgress: () => undefined,
      onResult: () => undefined,
      onError: (message) => startupErrors.push(message),
    });
    expect(startupErrors).toEqual(["Worker unavailable"]);

    const worker = new FakeGenerationWorker();
    const runtimeErrors: string[] = [];
    const runner = new GenerationWorkerRunner(() => worker);
    runner.run(createRequest(), {
      onProgress: () => undefined,
      onResult: () => undefined,
      onError: (message) => runtimeErrors.push(message),
    });
    worker.emit({
      type: "error",
      requestId: worker.request!.requestId,
      message: "Invalid generation request",
      details: ["width must be at least 20"],
    });
    expect(runtimeErrors).toEqual(["Invalid generation request width must be at least 20"]);
    expect(worker.terminated).toBe(true);
  });
});
