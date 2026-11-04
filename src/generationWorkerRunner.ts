import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  unpackGenerationResult,
} from "./generationWorkerProtocol";
import type {
  GenerationWorkerErrorMessage,
  GenerationWorkerMetrics,
  GenerationWorkerProgressMessage,
  GenerationWorkerRequestMessage,
  GenerationWorkerResponseMessage,
  UiDungeonGenerationResult,
} from "./generationWorkerProtocol";

export interface GenerationWorkerLike {
  onmessage: ((event: MessageEvent<GenerationWorkerResponseMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: GenerationWorkerRequestMessage): void;
  terminate(): void;
}

export interface GenerationWorkerCallbacks {
  onProgress(phase: GenerationWorkerProgressMessage["phase"]): void;
  onResult(
    result: UiDungeonGenerationResult,
    metrics: GenerationWorkerMetrics,
    warnings: string[],
  ): void;
  onError(message: string): void;
}

export type GenerationWorkerFactory = () => GenerationWorkerLike;

function createBrowserGenerationWorker(): GenerationWorkerLike {
  return new Worker(
    new URL("./generation.worker.ts", import.meta.url),
    { type: "module" },
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeWorkerError(message: GenerationWorkerErrorMessage): string {
  return [
    message.message,
    ...(message.details ?? []),
  ].join(" ");
}

export class GenerationWorkerRunner {
  private readonly workerFactory: GenerationWorkerFactory;
  private worker: GenerationWorkerLike | undefined;
  private nextRequestId = 0;
  private activeRequestId: number | undefined;

  constructor(workerFactory: GenerationWorkerFactory = createBrowserGenerationWorker) {
    this.workerFactory = workerFactory;
  }

  run(request: DungeonGenerationPipelineRequest, callbacks: GenerationWorkerCallbacks): number {
    this.cancel();
    const requestId = ++this.nextRequestId;
    this.activeRequestId = requestId;

    let worker: GenerationWorkerLike;
    try {
      worker = this.workerFactory();
    } catch (error) {
      this.activeRequestId = undefined;
      callbacks.onError(describeError(error));
      return requestId;
    }

    this.worker = worker;
    const isActive = (): boolean => (
      this.worker === worker && this.activeRequestId === requestId
    );
    const finish = (): void => {
      if (!isActive()) return;
      this.worker = undefined;
      this.activeRequestId = undefined;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (message: string): void => {
      if (!isActive()) return;
      finish();
      callbacks.onError(message);
    };

    worker.onmessage = (event: MessageEvent<GenerationWorkerResponseMessage>): void => {
      const message = event.data;
      if (!isActive() || message.requestId !== requestId) return;
      if (message.type === "progress") {
        callbacks.onProgress(message.phase);
        return;
      }
      if (message.type === "error") {
        fail(describeWorkerError(message));
        return;
      }

      try {
        const result = unpackGenerationResult(message.result);
        finish();
        callbacks.onResult(result, message.metrics, message.warnings);
      } catch (error) {
        fail(describeError(error));
      }
    };
    worker.onerror = (event: ErrorEvent): void => {
      event.preventDefault();
      fail(event.message || "O Worker de geração foi encerrado inesperadamente.");
    };
    worker.onmessageerror = (): void => {
      fail("Não foi possível interpretar a resposta do Worker de geração.");
    };

    try {
      worker.postMessage({ type: "generate", requestId, request });
    } catch (error) {
      fail(`Não foi possível enviar os parâmetros ao Worker: ${describeError(error)}`);
    }
    return requestId;
  }

  cancel(): void {
    const worker = this.worker;
    this.worker = undefined;
    this.activeRequestId = undefined;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }
}
