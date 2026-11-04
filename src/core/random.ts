import type { GenerationRandomStreamName, GenerationRandomStreams } from "./types";

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveRandomStreamSeed(
  seed: number,
  streamName: GenerationRandomStreamName,
): number {
  let hash = (seed >>> 0) ^ 0x811c9dc5;
  for (let index = 0; index < streamName.length; index += 1) {
    hash ^= streamName.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createGenerationRandomStreams(
  seed: number,
): GenerationRandomStreams {
  return {
    topology: createRandom(deriveRandomStreamSeed(seed, "topology")),
    placement: createRandom(deriveRandomStreamSeed(seed, "placement")),
    corridors: createRandom(deriveRandomStreamSeed(seed, "corridors")),
    content: createRandom(deriveRandomStreamSeed(seed, "content")),
    decoration: createRandom(deriveRandomStreamSeed(seed, "decoration")),
  };
}