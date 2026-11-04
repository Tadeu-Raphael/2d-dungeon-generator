import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDungeonPipeline } from "./generationPipeline";
import {
  createDungeonLevelPipelineRequest,
  generateDungeonStructure,
} from "./dungeonStructureGeneration";
import type { DungeonStructureGenerationResult } from "./dungeonStructureGeneration";
import { DEFAULT_DUNGEON_PARAMETERS, type Dungeon } from "./dungeon";
import { WALL_TILE } from "./core/tiles";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import {
  estimateGenerationWork,
  GENERATION_WORKER_WORK_THRESHOLD,
  shouldGenerateInWorker,
  withoutDungeonStructurePlans,
  withoutGenerationPlan,
} from "./generationWorkerProtocol";
import type {
  DungeonGenerationWorkRequest,
  GenerationWorkerMetrics,
  UiDungeonGenerationResult,
  UiDungeonStructureGenerationResult,
} from "./generationWorkerProtocol";
import { GenerationWorkerRunner } from "./generationWorkerRunner";

export type DungeonGenerationStatus = "ready" | "running" | "cancelled" | "error";

interface DungeonGenerationState {
  generation: UiDungeonGenerationResult;
  structure?: UiDungeonStructureGenerationResult;
  metrics: GenerationWorkerMetrics;
  warnings: string[];
  status: DungeonGenerationStatus;
  isWorker: boolean;
  hasGenerationResult: boolean;
  progress?: string;
  error?: string;
}

function getRepresentativeRequest(request: DungeonGenerationWorkRequest) {
  if (request.kind === "single") return request.request;
  const level = request.request.levels[request.request.entryLevelIndex]
    ?? request.request.levels[0];
  if (!level) throw new RangeError("Multilevel generation needs at least one configured level.");
  return createDungeonLevelPipelineRequest(request.request, level);
}

function createPendingState(request: DungeonGenerationWorkRequest): DungeonGenerationState {
  const representativeRequest = getRepresentativeRequest(request);
  const parameters = representativeRequest.parameters ?? DEFAULT_DUNGEON_PARAMETERS;
  const customProfile = representativeRequest.profile === "custom"
    ? representativeRequest.customProfile
    : undefined;
  const customBaseAlgorithm = customProfile
    && Object.prototype.hasOwnProperty.call(DUNGEON_CONCEPTS, customProfile.baseProfile)
    ? DUNGEON_CONCEPTS[customProfile.baseProfile].algorithm
    : undefined;
  const algorithm = representativeRequest.profile === "custom"
    ? customProfile?.algorithm ?? customBaseAlgorithm ?? "bsp"
    : DUNGEON_CONCEPTS[representativeRequest.profile].algorithm;
  const dungeon: Dungeon = {
    width: 1,
    height: 1,
    tiles: [[WALL_TILE]],
    rooms: 0,
    roomDetails: [],
    traps: [],
    treasureCategoryWeights: parameters.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityWeights,
    treasureChancePercent: parameters.treasureChancePercent,
    treasureConsumablesEnabled: parameters.treasureConsumablesEnabled,
    floorCount: 0,
    seed: representativeRequest.seed,
    algorithm,
    corridorWidth: parameters.corridorWidth,
    doubleDoorsEnabled: parameters.doubleDoorsEnabled,
    trapCategoryWeights: parameters.trapCategoryWeights,
    roomTrapChancePercent: parameters.roomTrapChancePercent,
    corridorTrapChancePercent: parameters.corridorTrapChancePercent,
  };
  const generation: UiDungeonGenerationResult = {
    dungeon,
    metadata: {
      generatorVersion: representativeRequest.generatorVersion,
      seed: representativeRequest.seed,
      profile: representativeRequest.profile,
      algorithm,
      parameters,
      settings: {},
      generatedAt: "",
    },
    requestedGeneratorVersion: representativeRequest.generatorVersion,
  };
  return {
    generation,
    metrics: {
      generationMs: 0,
      packagingMs: 0,
      totalMs: 0,
      roomCount: 0,
      tileCount: 0,
      levelCount: request.kind === "single" ? 1 : request.request.levels.length,
    },
    warnings: [],
    status: "running",
    isWorker: false,
    hasGenerationResult: false,
    progress: "Preparando a geração em segundo plano...",
  };
}

function summarizeStructureGeneration(
  result: DungeonStructureGenerationResult,
  generationMs: number,
): DungeonGenerationState {
  const uiResult = withoutDungeonStructurePlans(result);
  const entryLevelId = uiResult.structure.connectivity.entryLevelId;
  const representativeGeneration = uiResult.levels.find((level) => level.levelId === entryLevelId)
    ?? uiResult.levels[0];
  if (!representativeGeneration) {
    throw new RangeError("Multilevel generation returned no generated levels.");
  }
  const warnings = [...new Set(uiResult.levels.flatMap(({ generation }) => [
    generation.fallbackReason,
    generation.algorithmNote,
  ].filter((warning): warning is string => Boolean(warning))))];
  return {
    generation: representativeGeneration.generation,
    structure: uiResult,
    metrics: {
      generationMs,
      packagingMs: 0,
      totalMs: generationMs,
      roomCount: uiResult.levels.reduce(
        (total, level) => total + level.generation.dungeon.roomDetails.length,
        0,
      ),
      tileCount: uiResult.levels.reduce(
        (total, level) => total + level.generation.dungeon.width * level.generation.dungeon.height,
        0,
      ),
      levelCount: uiResult.levels.length,
    },
    warnings,
    status: "ready",
    isWorker: false,
    hasGenerationResult: true,
  };
}

function runSynchronously(request: DungeonGenerationWorkRequest): DungeonGenerationState {
  const startedAt = performance.now();
  if (request.kind === "multilevel") {
    return summarizeStructureGeneration(
      generateDungeonStructure(request.request),
      performance.now() - startedAt,
    );
  }
  const result = generateDungeonPipeline(request.request);
  const generationMs = performance.now() - startedAt;
  return {
    generation: withoutGenerationPlan(result),
    metrics: {
      generationMs,
      packagingMs: 0,
      totalMs: generationMs,
      roomCount: result.dungeon.roomDetails.length,
      tileCount: result.dungeon.width * result.dungeon.height,
      levelCount: 1,
    },
    warnings: [result.fallbackReason, result.algorithmNote]
      .filter((warning): warning is string => Boolean(warning)),
    status: "ready",
    isWorker: false,
    hasGenerationResult: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDungeonGeneration(request: DungeonGenerationWorkRequest) {
  const runner = useMemo(() => new GenerationWorkerRunner(), []);
  const requestIdRef = useRef(0);
  const startedRequestRef = useRef<DungeonGenerationWorkRequest | undefined>(undefined);
  const activeWorkerRef = useRef(false);
  const [state, setState] = useState<DungeonGenerationState>(() => {
    if (shouldGenerateInWorker(request)) return createPendingState(request);
    startedRequestRef.current = request;
    try {
      return runSynchronously(request);
    } catch (error) {
      return {
        ...createPendingState(request),
        status: "error",
        isWorker: false,
        progress: undefined,
        error: errorMessage(error),
      };
    }
  });

  useEffect(() => {
    if (startedRequestRef.current === request) return;
    startedRequestRef.current = request;
    const requestId = ++requestIdRef.current;
    let active = true;
    const isCurrent = (): boolean => active && requestIdRef.current === requestId;
    const onError = (error: string): void => {
      if (!isCurrent()) return;
      activeWorkerRef.current = false;
      setState((current) => ({
        ...current,
        status: "error",
        isWorker: false,
        progress: undefined,
        error,
      }));
    };

    if (!shouldGenerateInWorker(request)) {
      activeWorkerRef.current = false;
      runner.cancel();
      setState((current) => ({
        ...current,
        structure: undefined,
        status: "running",
        isWorker: false,
        progress: undefined,
        error: undefined,
      }));
      try {
        const nextState = runSynchronously(request);
        if (isCurrent()) setState(nextState);
      } catch (error) {
        onError(errorMessage(error));
      }
      return () => {
        active = false;
      };
    }

    activeWorkerRef.current = true;
    setState((current) => ({
      ...current,
      structure: undefined,
      status: "running",
      isWorker: true,
      progress: "Preparando a geração em segundo plano...",
      error: undefined,
    }));
    runner.run(request, {
      onProgress: () => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          progress: "Gerando a dungeon no Worker...",
        }));
      },
      onResult: (generation, metrics, warnings) => {
        if (!isCurrent()) return;
        activeWorkerRef.current = false;
        const nextGeneration = generation.kind === "single"
          ? generation.result
          : generation.result.levels.find(
            (level) => level.levelId === generation.result.structure.connectivity.entryLevelId,
          )?.generation ?? generation.result.levels[0]?.generation;
        if (!nextGeneration) {
          onError("O Worker não retornou nenhum mapa para a geração.");
          return;
        }
        setState({
          generation: nextGeneration,
          ...(generation.kind === "multilevel" ? { structure: generation.result } : {}),
          metrics,
          warnings,
          status: "ready",
          isWorker: false,
          hasGenerationResult: true,
        });
      },
      onError,
    });

    return () => {
      active = false;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
      activeWorkerRef.current = false;
      runner.cancel();
      if (startedRequestRef.current === request) startedRequestRef.current = undefined;
    };
  }, [request, runner]);

  const cancel = useCallback((): void => {
    if (!activeWorkerRef.current) return;
    requestIdRef.current += 1;
    activeWorkerRef.current = false;
    runner.cancel();
    setState((current) => ({
      ...current,
      status: "cancelled",
      isWorker: false,
      progress: undefined,
      error: undefined,
    }));
  }, [runner]);

  return {
    generationRun: state.generation,
    metrics: state.metrics,
    warnings: state.warnings,
    status: state.status,
    isWorker: state.isWorker,
    hasGenerationResult: state.hasGenerationResult,
    structureRun: state.structure,
    progress: state.progress,
    error: state.error,
    estimatedWork: estimateGenerationWork(request),
    workerThreshold: GENERATION_WORKER_WORK_THRESHOLD,
    cancel,
  };
}
