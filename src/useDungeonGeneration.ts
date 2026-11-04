import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  estimateGenerationWork,
  GENERATION_WORKER_WORK_THRESHOLD,
  shouldGenerateInWorker,
  withoutGenerationPlan,
} from "./generationWorkerProtocol";
import type {
  GenerationWorkerMetrics,
  UiDungeonGenerationResult,
} from "./generationWorkerProtocol";
import { GenerationWorkerRunner } from "./generationWorkerRunner";

export type DungeonGenerationStatus = "ready" | "running" | "cancelled" | "error";

interface DungeonGenerationState {
  generation: UiDungeonGenerationResult;
  metrics: GenerationWorkerMetrics;
  warnings: string[];
  status: DungeonGenerationStatus;
  isWorker: boolean;
  progress?: string;
  error?: string;
}

function runSynchronously(request: DungeonGenerationPipelineRequest): DungeonGenerationState {
  const startedAt = performance.now();
  const result = generateDungeonPipeline(request);
  const generationMs = performance.now() - startedAt;
  return {
    generation: withoutGenerationPlan(result),
    metrics: {
      generationMs,
      packagingMs: 0,
      totalMs: generationMs,
      roomCount: result.dungeon.roomDetails.length,
      tileCount: result.dungeon.width * result.dungeon.height,
    },
    warnings: [result.fallbackReason, result.algorithmNote]
      .filter((warning): warning is string => Boolean(warning)),
    status: "ready",
    isWorker: false,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDungeonGeneration(request: DungeonGenerationPipelineRequest) {
  const runner = useMemo(() => new GenerationWorkerRunner(), []);
  const requestIdRef = useRef(0);
  const startedRequestRef = useRef(request);
  const activeWorkerRef = useRef(false);
  const [state, setState] = useState<DungeonGenerationState>(() => runSynchronously(request));

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
        setState({
          generation,
          metrics,
          warnings,
          status: "ready",
          isWorker: false,
        });
      },
      onError,
    });

    return () => {
      active = false;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
      activeWorkerRef.current = false;
      runner.cancel();
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
    progress: state.progress,
    error: state.error,
    estimatedWork: estimateGenerationWork(request),
    workerThreshold: GENERATION_WORKER_WORK_THRESHOLD,
    cancel,
  };
}
