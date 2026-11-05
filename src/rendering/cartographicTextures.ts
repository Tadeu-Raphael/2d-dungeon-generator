export interface ProceduralCartographicTextureAtlas {
  readonly tileSize: number;
  readonly paperSize: number;
  readonly stoneRelief: Int8Array;
  readonly wallRelief: Int8Array;
  readonly parchmentRelief: Int8Array;
}

const PAPER_TEXTURE_SIZE = 64;
const MAX_CACHED_SCALES = 32;
const textureCache = new Map<number, ProceduralCartographicTextureAtlas>();

function hash(x: number, y: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createStoneRelief(size: number): Int8Array {
  const relief = new Int8Array(size * size);
  const slabsPerAxis = size >= 16 ? 2 : 1;
  const slabSize = size / slabsPerAxis;

  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / slabSize);
    const offsetX = row % 2 === 1 ? slabSize / 2 : 0;
    for (let x = 0; x < size; x += 1) {
      const localX = ((x + offsetX) % slabSize) / slabSize;
      const localY = (y % slabSize) / slabSize;
      const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
      const mortar = 1 - smoothstep(0.025, 0.09, edge);
      const upperBevel = 1 - smoothstep(0.02, 0.12, Math.min(localX, localY));
      const lowerBevel = 1 - smoothstep(0.02, 0.12, Math.min(1 - localX, 1 - localY));
      const grain = (hash(x >> 1, y >> 1) - 0.5) * 9;
      const fleck = hash(x + 97, y + 131) > 0.993 ? -7 : 0;
      relief[y * size + x] = Math.round(
        grain + fleck - mortar * 15 + upperBevel * 6 - lowerBevel * 8,
      );
    }
  }
  return relief;
}

function createWallRelief(size: number): Int8Array {
  const relief = new Int8Array(size * size);
  const blocksPerAxis = size >= 12 ? 2 : 1;
  const blockSize = size / blocksPerAxis;

  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / blockSize);
    const offsetX = row % 2 === 1 ? blockSize / 2 : 0;
    for (let x = 0; x < size; x += 1) {
      const localX = ((x + offsetX) % blockSize) / blockSize;
      const localY = (y % blockSize) / blockSize;
      const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
      const mortar = 1 - smoothstep(0.02, 0.075, edge);
      const cut = ((x + y * 2) % Math.max(3, Math.round(size * 0.18))) < 1;
      const grain = (hash(x >> 1, y >> 1) - 0.5) * 7;
      const chisel = cut && hash(row, Math.floor((x + offsetX) / blockSize)) > 0.42 ? 5 : 0;
      relief[y * size + x] = Math.round(grain + chisel - mortar * 18);
    }
  }
  return relief;
}

function createParchmentRelief(): Int8Array {
  const relief = new Int8Array(PAPER_TEXTURE_SIZE * PAPER_TEXTURE_SIZE);
  for (let y = 0; y < PAPER_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < PAPER_TEXTURE_SIZE; x += 1) {
      const fiberRow = (y + Math.floor(x / 16) * 7) % 37;
      const fiber = fiberRow === 0 && hash(x >> 4, y >> 4) > 0.28 ? 9 : 0;
      const speckle = hash(x + 211, y + 307) > 0.996 ? -11 : 0;
      const grain = (hash(x >> 1, y >> 1) - 0.5) * 3;
      relief[y * PAPER_TEXTURE_SIZE + x] = Math.round(fiber + speckle + grain);
    }
  }
  return relief;
}

export function getProceduralCartographicTextureAtlas(
  tileSize: number,
): ProceduralCartographicTextureAtlas {
  const size = Math.max(1, Math.floor(tileSize));
  const cached = textureCache.get(size);
  if (cached) return cached;

  const atlas: ProceduralCartographicTextureAtlas = {
    tileSize: size,
    paperSize: PAPER_TEXTURE_SIZE,
    stoneRelief: createStoneRelief(size),
    wallRelief: createWallRelief(size),
    parchmentRelief: createParchmentRelief(),
  };
  if (textureCache.size >= MAX_CACHED_SCALES) {
    const oldestScale = textureCache.keys().next().value;
    if (oldestScale !== undefined) textureCache.delete(oldestScale);
  }
  textureCache.set(size, atlas);
  return atlas;
}
