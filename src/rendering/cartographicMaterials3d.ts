import * as THREE from "three";

const TEXTURE_SIZE = 64;

export interface CartographicTextureSet3D {
  floor: THREE.DataTexture;
  floorBump: THREE.DataTexture;
  wall: THREE.DataTexture;
  wallBump: THREE.DataTexture;
  wood: THREE.DataTexture;
  woodBump: THREE.DataTexture;
  metal: THREE.DataTexture;
  metalBump: THREE.DataTexture;
  water: THREE.DataTexture;
  waterBump: THREE.DataTexture;
  lava: THREE.DataTexture;
  lavaBump: THREE.DataTexture;
  parchment: THREE.DataTexture;
}

interface TexturePixels {
  floor: Uint8Array;
  floorBump: Uint8Array;
  wall: Uint8Array;
  wallBump: Uint8Array;
  wood: Uint8Array;
  woodBump: Uint8Array;
  metal: Uint8Array;
  metalBump: Uint8Array;
  water: Uint8Array;
  waterBump: Uint8Array;
  lava: Uint8Array;
  lavaBump: Uint8Array;
  parchment: Uint8Array;
}

let cachedPixels: TexturePixels | undefined;

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul((x + seed) | 0, 374761393) ^ Math.imul((y - seed) | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampByte(value: number): number {
  return Math.round(THREE.MathUtils.clamp(value, 0, 255));
}

function createRgbaPixels(sample: (x: number, y: number) => number): Uint8Array {
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const value = clampByte(sample(x, y));
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function createStonePixels(seed: number, groutStrength: number): Uint8Array {
  return createRgbaPixels((x, y) => {
    const row = Math.floor(y / 32);
    const offsetX = row % 2 === 1 ? 16 : 0;
    const localX = ((x + offsetX) % 32) / 32;
    const localY = (y % 32) / 32;
    const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
    const grout = 1 - smoothstep(0.025, 0.085, edge);
    const bevel = 1 - smoothstep(0.025, 0.16, Math.min(localX, localY));
    const slabX = Math.floor((x + offsetX) / 32);
    const slabY = Math.floor(y / 32);
    const slabTone = (hash(slabX, slabY, seed) - 0.5) * 10;
    const grain = (hash(x >> 2, y >> 2, seed + 17) - 0.5) * 18;
    const fleck = hash(x + 97, y + 131, seed) > 0.993 ? -18 : 0;
    return 241 + slabTone + grain + bevel * 5 - grout * groutStrength + fleck;
  });
}

function createStoneBumpPixels(seed: number, groutStrength: number): Uint8Array {
  return createRgbaPixels((x, y) => {
    const row = Math.floor(y / 32);
    const offsetX = row % 2 === 1 ? 16 : 0;
    const localX = ((x + offsetX) % 32) / 32;
    const localY = (y % 32) / 32;
    const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
    const grout = 1 - smoothstep(0.02, 0.08, edge);
    const grain = (hash(x >> 1, y >> 1, seed + 29) - 0.5) * 26;
    const chisel = hash(x + 53, y + 19, seed) > 0.985 ? -22 : 0;
    return 138 + grain - grout * groutStrength + chisel;
  });
}

function createWoodPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const plankX = x % 22;
    const seam = 1 - smoothstep(0.5, 2.5, Math.min(plankX, 22 - plankX));
    const grain = Math.sin(y * 0.42 + Math.sin(x * 0.12) * 1.7) * 7;
    const growthRings = Math.sin(y * 0.17 + x * 0.08) * 3;
    const noise = (hash(x >> 1, y >> 2, 41) - 0.5) * 12;
    const knotDistance = Math.hypot((x % 29) - 14, (y % 37) - 18);
    const knot = Math.abs(knotDistance - 3.2) < 0.8 ? -24 : 0;
    return 244 + grain + growthRings + noise - seam * 36 + knot;
  });
}

function createWoodBumpPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const plankX = x % 22;
    const seam = 1 - smoothstep(0.5, 2.5, Math.min(plankX, 22 - plankX));
    const grain = Math.sin(y * 0.42 + Math.sin(x * 0.12) * 1.7) * 18;
    const noise = (hash(x >> 1, y >> 1, 53) - 0.5) * 24;
    return 136 + grain + noise - seam * 58;
  });
}

function createMetalPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const grain = (hash(x >> 1, y >> 1, 61) - 0.5) * 15;
    const scratch = ((x + y * 2) % 19 === 0 && hash(x, y, 67) > 0.42) ? -38 : 0;
    const rivet = x % 24 < 2 && y % 24 < 2 ? -24 : 0;
    return 244 + grain + scratch + rivet;
  });
}

function createMetalBumpPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const grain = (hash(x >> 1, y >> 1, 71) - 0.5) * 30;
    const scratch = ((x + y * 2) % 19 === 0 && hash(x, y, 73) > 0.42) ? -64 : 0;
    const rivet = x % 24 < 2 && y % 24 < 2 ? -40 : 0;
    return 136 + grain + scratch + rivet;
  });
}

function createWaterPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const wave = Math.sin((x + Math.sin(y * 0.15) * 5) * 0.28)
      + Math.sin((y + Math.sin(x * 0.13) * 4) * 0.24);
    const highlight = Math.max(0, 1 - Math.abs(wave - 1.1) * 4);
    const noise = (hash(x >> 1, y >> 1, 79) - 0.5) * 8;
    return 218 + highlight * 30 + noise;
  });
}

function createWaterBumpPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const wave = Math.sin((x + Math.sin(y * 0.15) * 5) * 0.28)
      + Math.sin((y + Math.sin(x * 0.13) * 4) * 0.24);
    return 132 + wave * 28 + (hash(x, y, 83) - 0.5) * 8;
  });
}

function createLavaPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const field = Math.sin(x * 0.19 + Math.sin(y * 0.11) * 1.8)
      * Math.sin(y * 0.21 + Math.cos(x * 0.12) * 1.4);
    const crack = 1 - smoothstep(0.07, 0.19, Math.abs(field));
    const noise = (hash(x >> 1, y >> 1, 89) - 0.5) * 12;
    return 126 + noise + crack * 126;
  });
}

function createLavaBumpPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const field = Math.sin(x * 0.19 + Math.sin(y * 0.11) * 1.8)
      * Math.sin(y * 0.21 + Math.cos(x * 0.12) * 1.4);
    const crack = 1 - smoothstep(0.07, 0.19, Math.abs(field));
    return 118 + (hash(x, y, 97) - 0.5) * 28 + crack * 74;
  });
}

function createParchmentPixels(): Uint8Array {
  return createRgbaPixels((x, y) => {
    const fiber = (y + Math.floor(x / 8) * 5) % 29 === 0 ? -12 : 0;
    const grain = (hash(x >> 1, y >> 1, 101) - 0.5) * 14;
    const speckle = hash(x + 211, y + 307, 103) > 0.996 ? -34 : 0;
    return 242 + fiber + grain + speckle;
  });
}

function getTexturePixels(): TexturePixels {
  if (!cachedPixels) {
    cachedPixels = {
      floor: createStonePixels(11, 24),
      floorBump: createStoneBumpPixels(13, 66),
      wall: createStonePixels(23, 38),
      wallBump: createStoneBumpPixels(29, 90),
      wood: createWoodPixels(),
      woodBump: createWoodBumpPixels(),
      metal: createMetalPixels(),
      metalBump: createMetalBumpPixels(),
      water: createWaterPixels(),
      waterBump: createWaterBumpPixels(),
      lava: createLavaPixels(),
      lavaBump: createLavaBumpPixels(),
      parchment: createParchmentPixels(),
    };
  }
  return cachedPixels;
}

function createTexture(data: Uint8Array, colorTexture = false): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (colorTexture) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createCartographicTextureSet3D(): CartographicTextureSet3D {
  const pixels = getTexturePixels();
  return {
    floor: createTexture(pixels.floor, true),
    floorBump: createTexture(pixels.floorBump),
    wall: createTexture(pixels.wall, true),
    wallBump: createTexture(pixels.wallBump),
    wood: createTexture(pixels.wood, true),
    woodBump: createTexture(pixels.woodBump),
    metal: createTexture(pixels.metal, true),
    metalBump: createTexture(pixels.metalBump),
    water: createTexture(pixels.water, true),
    waterBump: createTexture(pixels.waterBump),
    lava: createTexture(pixels.lava, true),
    lavaBump: createTexture(pixels.lavaBump),
    parchment: createTexture(pixels.parchment, true),
  };
}
