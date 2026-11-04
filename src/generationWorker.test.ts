import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
} from "./dungeon";
import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  generateDungeonStructure,
} from "./dungeonStructureGeneration";
import type { DungeonStructureGenerationRequest } from "./dungeonStructureGeneration";
import {
  estimateGenerationWork,
  GENERATION_WORKER_WORK_THRESHOLD,
  shouldGenerateInWorker,
  unpackGenerationOutput,
} from "./generationWorkerProtocol";
import type {
  DungeonGenerationWorkRequest,
  GenerationWorkerOutput,
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

function createWorkRequest(
  request: DungeonGenerationPipelineRequest = createRequest(),
): DungeonGenerationWorkRequest {
  return { kind: "single", request };
}

function createStructureRequest(): DungeonStructureGenerationRequest {
  return {
    seed: 83002,
    profile: "military-fortress",
    parameters: {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 64,
      height: 48,
      roomCount: 6,
      corridorWidth: 1,
      entranceMode: "upper-stairs",
    },
    levels: [
      {
        name: "Subsolo",
        verticalIndex: -1,
        width: 64,
        height: 48,
        roomCount: 6,
        topologyStyle: "linear",
        spatialLayoutStyle: "axis-branches",
      },
      {
        name: "Nível principal",
        verticalIndex: 0,
        width: 64,
        height: 48,
        roomCount: 6,
        topologyStyle: "branching",
        spatialLayoutStyle: "clusters",
      },
    ],
    entryLevelIndex: 1,
    verticalConnectionCount: 1,
    allowedVerticalConnectionKinds: ["stairs"],
    requireGlobalConnectivity: true,
    allowVerticalCycles: false,
  };
}

function unpackSingleResult(output: GenerationWorkerOutput) {
  const unpacked = unpackGenerationOutput(output);
  if (unpacked.kind !== "single") throw new Error("Expected a single-level Worker result.");
  return unpacked.result;
}

function getSingleWorkerResult(output: GenerationWorkerOutput) {
  if (output.kind !== "single") throw new Error("Expected a single-level Worker result.");
  return output.result;
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
        width: 32,
        height: 24,
        roomCount: 6,
      },
    });
    const medium = createRequest({
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 64,
        height: 48,
        roomCount: 12,
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
    const multilevelRequest: DungeonGenerationWorkRequest = {
      kind: "multilevel",
      request: createStructureRequest(),
    };

    expect(GENERATION_WORKER_WORK_THRESHOLD).toBe(10_000);
    expect(estimateGenerationWork(createWorkRequest(small))).toBe(4_608);
    expect(estimateGenerationWork(createWorkRequest(medium))).toBe(36_864);
    expect(estimateGenerationWork(createWorkRequest(medium))).toBeGreaterThanOrEqual(GENERATION_WORKER_WORK_THRESHOLD);
    expect(shouldGenerateInWorker(createWorkRequest(small))).toBe(false);
    expect(shouldGenerateInWorker(createWorkRequest(medium))).toBe(true);
    expect(shouldGenerateInWorker(createWorkRequest(large))).toBe(true);
    expect(estimateGenerationWork(multilevelRequest)).toBe(36_864);
    expect(shouldGenerateInWorker(multilevelRequest)).toBe(true);
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
    const workerResult = runGenerationWorkerRequest(4, createWorkRequest(request));
    const actual = unpackSingleResult(workerResult.message.result);
    const packedResult = getSingleWorkerResult(workerResult.message.result);

    expect(actual.dungeon).toEqual(expected.dungeon);
    expect("plan" in packedResult).toBe(false);
    expect(workerResult.transferBuffers[0]?.byteLength).toBe(250 * 250);
    expect(workerResult.message.metrics).toMatchObject({
      roomCount: expected.dungeon.roomDetails.length,
      tileCount: 250 * 250,
    });
    expect(workerResult.message.warnings).toEqual([...new Set([
      expected.fallbackReason,
      expected.algorithmNote,
    ].filter((warning): warning is string => Boolean(warning)))]);
  });

  it("preserves custom-profile settings and synchronous equivalence in the Worker", () => {
    const request = createRequest({
      profile: "custom",
      customProfile: {
        id: "worker-custom-profile",
        name: "Perfil no Worker",
        baseProfile: "military-fortress",
        topology: { style: "circuit", parameters: { cycleCount: 1 } },
        v2Preferences: { spatialLayoutWeights: { ring: 100 } },
      },
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 96,
        height: 72,
        roomCount: 8,
        corridorWidth: 1,
      },
    });
    const expected = generateDungeonPipeline(request);
    const workerResult = runGenerationWorkerRequest(9, createWorkRequest(request));
    const actual = unpackSingleResult(workerResult.message.result);

    expect(shouldGenerateInWorker(createWorkRequest(request))).toBe(true);
    expect(actual.dungeon).toEqual(expected.dungeon);
    expect(actual.metadata.profile).toBe("worker-custom-profile");
    expect(actual.metadata.settings.customProfileId).toBe("worker-custom-profile");
  });

  it("keeps the result deterministic for identical seeds and parameters", () => {
    const request = createRequest();
    const first = unpackSingleResult(
      runGenerationWorkerRequest(1, createWorkRequest(request)).message.result,
    );
    const second = unpackSingleResult(
      runGenerationWorkerRequest(2, createWorkRequest(request)).message.result,
    );

    expect(first.dungeon).toEqual(second.dungeon);
    expect(first.metadata.seed).toBe(second.metadata.seed);
    expect(first.metadata.parameters).toEqual(second.metadata.parameters);
  });

  it("transfers one compact map buffer per multilevel V2 plan", () => {
    const request = createStructureRequest();
    const expected = generateDungeonStructure(request);
    const workerResult = runGenerationWorkerRequest(8, {
      kind: "multilevel",
      request,
    });
    const actual = unpackGenerationOutput(workerResult.message.result);
    if (actual.kind !== "multilevel") throw new Error("Expected a multilevel Worker result.");
    const packed = workerResult.message.result;
    if (packed.kind !== "multilevel") throw new Error("Expected a packed multilevel result.");

    expect(actual.result.structure.verticalConnections).toEqual(expected.structure.verticalConnections);
    expect(actual.result.levels.map(({ generation }) => generation.dungeon))
      .toEqual(expected.levels.map(({ generation }) => generation.dungeon));
    expect(workerResult.transferBuffers.map((buffer) => buffer.byteLength))
      .toEqual([64 * 48, 64 * 48]);
    expect(packed.result.levels.every(
      ({ generation }) => !("plan" in generation),
    )).toBe(true);
    expect(packed.result.structure.levels.every(
      (level) => !("plan" in level),
    )).toBe(true);
    expect(workerResult.message.metrics).toMatchObject({
      levelCount: 2,
      tileCount: 2 * 64 * 48,
      roomCount: expected.levels.reduce(
        (total, level) => total + level.generation.dungeon.roomDetails.length,
        0,
      ),
    });
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
    const oldRequestId = runner.run(createWorkRequest(request), callbacks);
    const oldHandler = workers[0].onmessage;
    const currentRequestId = runner.run(
      createWorkRequest({ ...request, seed: request.seed + 1 }),
      callbacks,
    );
    const staleResult = runGenerationWorkerRequest(oldRequestId, createWorkRequest(request));

    expect(currentRequestId).toBeGreaterThan(oldRequestId);
    expect(workers[0].terminated).toBe(true);
    oldHandler?.({
      data: { type: "progress", requestId: oldRequestId, phase: "generating" },
    } as MessageEvent<GenerationWorkerResponseMessage>);
    oldHandler?.({ data: staleResult.message } as MessageEvent<GenerationWorkerResponseMessage>);
    expect(staleProgress).toEqual([]);
    expect(results).toEqual([]);

    const currentResult = runGenerationWorkerRequest(
      currentRequestId,
      createWorkRequest({ ...request, seed: request.seed + 1 }),
    );
    workers[1].emit(currentResult.message);
    expect(results).toHaveLength(1);
    expect(workers[1].terminated).toBe(true);
  });

  it("cancels the active Worker and never applies its late result", () => {
    const worker = new FakeGenerationWorker();
    const runner = new GenerationWorkerRunner(() => worker);
    let resultCount = 0;
    const requestId = runner.run(createWorkRequest(), {
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
    startupRunner.run(createWorkRequest(), {
      onProgress: () => undefined,
      onResult: () => undefined,
      onError: (message) => startupErrors.push(message),
    });
    expect(startupErrors).toEqual(["Worker unavailable"]);

    const worker = new FakeGenerationWorker();
    const runtimeErrors: string[] = [];
    const runner = new GenerationWorkerRunner(() => worker);
    runner.run(createWorkRequest(), {
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
