import type { GenerationWorkerRequestMessage } from "./generationWorkerProtocol";
import type { GenerationWorkerResponseMessage } from "./generationWorkerProtocol";
import {
  createGenerationWorkerErrorMessage,
  runGenerationWorkerRequest,
} from "./generationWorkerRuntime";

self.addEventListener("message", (event: MessageEvent<GenerationWorkerRequestMessage>) => {
  const { requestId, request } = event.data;
  const progress: GenerationWorkerResponseMessage = {
    type: "progress",
    requestId,
    phase: "generating",
  };
  self.postMessage(progress);

  try {
    const { message, transferBuffers } = runGenerationWorkerRequest(requestId, request);
    self.postMessage(message, { transfer: transferBuffers });
  } catch (error) {
    self.postMessage(createGenerationWorkerErrorMessage(requestId, error));
  }
});
