import {
  CAVE_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  SECRET_DOOR_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
} from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";
import { blurField, createScaledFloorMask, isFloorTile } from "./cartographicField";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  createRoomCategoryGrid,
  getRoomCategory,
  getRoomFloorRgb,
  getTileColor,
  getVisibleTile,
  isOpenCaveConnection,
} from "./dungeonTileSemantics";
import type { RoomCategoryGrid } from "./dungeonTileSemantics";

export interface CartographicOptions {
  showWater: boolean;
  showLava: boolean;
  /** Ink outline and rock hatching around the explorable space. */
  showWalls: boolean;
  showGrid: boolean;
  roomCategories?: RoomCategoryGrid;
  /** Preferred pixels per tile; reduced automatically to respect `maxPixels`. */
  targetScale?: number;
  maxPixels?: number;
}

export interface CartographicImage {
  width: number;
  height: number;
  scale: number;
  data: Uint8ClampedArray;
}

const ROCK: readonly [number, number, number] = [14, 19, 27];
const ROCK_NEAR: readonly [number, number, number] = [8, 11, 17];
const HATCH: readonly [number, number, number] = [84, 102, 120];
const OUTLINE: readonly [number, number, number] = [138, 154, 166];
const OUTLINE_SHADOW: readonly [number, number, number] = [4, 6, 10];
const SEAM: readonly [number, number, number] = [60, 50, 40];

const TRAP_TILES: ReadonlySet<Tile> = new Set(TRAP_TYPES.map((type) => TRAP_DEFINITIONS[type].tile));

const KIND_FLOOR = 0;
const KIND_WATER = 1;
const KIND_LAVA = 2;
const KIND_CAVE = 3;

export function getCartographicScale(
  width: number,
  height: number,
  targetScale = 28,
  maxPixels = 6_000_000,
): number {
  const budgetScale = Math.floor(Math.sqrt(maxPixels / Math.max(1, width * height)));
  return Math.max(3, Math.min(targetScale, budgetScale));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

interface TileSurface {
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  group: Int16Array;
  kind: Uint8Array;
}

/** Floor colour, grouping (for seams between rooms and corridors) and material of every tile. */
function createTileSurface(
  dungeon: Dungeon,
  roomCategories: RoomCategoryGrid,
  showWater: boolean,
  showLava: boolean,
): TileSurface {
  const count = dungeon.width * dungeon.height;
  const surface: TileSurface = {
    red: new Uint8Array(count),
    green: new Uint8Array(count),
    blue: new Uint8Array(count),
    group: new Int16Array(count).fill(-1),
    kind: new Uint8Array(count),
  };
  const categoryIds = new Map<string, number>();
  const corridorColor = getTileColor(CORRIDOR_TILE);

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const source = dungeon.tiles[y][x];
      if (!isFloorTile(source)) continue;
      const tile = getVisibleTile(source, showWater, showLava);
      const index = y * dungeon.width + x;
      const category = getRoomCategory(roomCategories, dungeon.width, x, y);
      let color: readonly [number, number, number];
      let group: number;
      let kind = KIND_FLOOR;

      if (tile === CORRIDOR_TILE || tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
        color = corridorColor;
        group = 1000;
      } else if (tile === FLOOR_TILE || tile === PILLAR_TILE || TRAP_TILES.has(tile)) {
        color = category ? getRoomFloorRgb(category) : tile === FLOOR_TILE ? getTileColor(FLOOR_TILE) : corridorColor;
        if (!category) {
          group = 1000;
        } else {
          if (!categoryIds.has(category)) categoryIds.set(category, categoryIds.size + 1);
          group = categoryIds.get(category)!;
        }
      } else if (tile === CAVE_TILE) {
        color = isOpenCaveConnection(dungeon, roomCategories, x, y) ? [135, 154, 112] : getTileColor(CAVE_TILE);
        group = 1001;
        kind = KIND_CAVE;
      } else {
        color = getTileColor(tile);
        group = 1002 + tile;
        if (tile === WATER_TILE || CAVE_WATER_TILES.has(tile)) kind = KIND_WATER;
        else if (tile === LAVA_TILE || CAVE_LAVA_TILES.has(tile)) kind = KIND_LAVA;
      }
      surface.red[index] = color[0];
      surface.green[index] = color[1];
      surface.blue[index] = color[2];
      surface.group[index] = group;
      surface.kind[index] = kind;
    }
  }
  return surface;
}

/**
 * Software "shader" that paints the dungeon like a hand-inked map: rounded, softly shaded floors,
 * a thin luminous outline, and cross-hatched rock fading out from every wall.
 */
export function renderCartographicImage(
  dungeon: Dungeon,
  options: CartographicOptions,
): CartographicImage {
  const scale = getCartographicScale(
    dungeon.width,
    dungeon.height,
    options.targetScale,
    options.maxPixels,
  );
  const width = dungeon.width * scale;
  const height = dungeon.height * scale;
  const roomCategories = options.roomCategories ?? createRoomCategoryGrid(dungeon);
  const surface = createTileSurface(dungeon, roomCategories, options.showWater, options.showLava);

  const mask = createScaledFloorMask(dungeon, scale);
  const near = blurField(mask, width, height, Math.max(1, Math.round(scale * 0.34)));
  const halo = options.showWalls
    ? blurField(mask, width, height, Math.max(2, Math.round(scale * 0.7)))
    : near;
  const data = new Uint8ClampedArray(width * height * 4);

  const hatchPeriod = Math.max(4, scale * 0.2);
  const gridWidth = Math.max(1, scale * 0.035);
  const seamWidth = Math.max(1, scale * 0.05);
  const edgeInk = options.showWalls;

  const isSeam = (neighbourX: number, neighbourY: number, group: number): boolean => {
    if (neighbourX < 0 || neighbourY < 0 || neighbourX >= dungeon.width || neighbourY >= dungeon.height) return false;
    const neighbourGroup = surface.group[neighbourY * dungeon.width + neighbourX];
    return neighbourGroup >= 0 && neighbourGroup !== group;
  };

  const nearestFloorTile = (tileX: number, tileY: number, fx: number, fy: number): number => {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const candidateX = tileX + dx;
        const candidateY = tileY + dy;
        if (candidateX < 0 || candidateY < 0 || candidateX >= dungeon.width || candidateY >= dungeon.height) continue;
        const candidate = candidateY * dungeon.width + candidateX;
        if (surface.group[candidate] < 0) continue;
        const gapX = Math.max(dx - fx, fx - (dx + 1), 0);
        const gapY = Math.max(dy - fy, fy - (dy + 1), 0);
        const distance = gapX * gapX + gapY * gapY;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  };

  for (let py = 0; py < height; py += 1) {
    const tileY = Math.floor(py / scale);
    const fy = py / scale - tileY;
    for (let px = 0; px < width; px += 1) {
      const pixel = py * width + px;
      const tileX = Math.floor(px / scale);
      const fx = px / scale - tileX;
      const nearValue = near[pixel];
      const cover = smoothstep(0.44, 0.56, nearValue);

      // Rock: darker near the floor, with hatching that fades with distance.
      const haloValue = halo[pixel];
      const rockMix = smoothstep(0.02, 0.45, haloValue);
      let red = ROCK[0] + (ROCK_NEAR[0] - ROCK[0]) * rockMix;
      let green = ROCK[1] + (ROCK_NEAR[1] - ROCK[1]) * rockMix;
      let blue = ROCK[2] + (ROCK_NEAR[2] - ROCK[2]) * rockMix;
      const grain = (hash(px >> 1, py >> 1) - 0.5) * 3;
      red += grain;
      green += grain;
      blue += grain;

      if (edgeInk && cover < 1) {
        const zone = smoothstep(0.03, 0.22, haloValue) * (1 - smoothstep(0.5, 0.75, haloValue));
        const diagonal = ((px + py) / hatchPeriod) % 1;
        const crossing = ((px - py) / hatchPeriod + 8) % 1;
        const line1 = diagonal < 0.16 ? 1 : 0;
        const line2 = haloValue > 0.3 && crossing < 0.12 ? 1 : 0;
        const strength = zone * Math.max(line1, line2 * 0.8) * 0.85;
        red += (HATCH[0] - red) * strength;
        green += (HATCH[1] - green) * strength;
        blue += (HATCH[2] - blue) * strength;
      }

      if (cover > 0) {
        let tileIndex = tileY * dungeon.width + tileX;
        if (surface.group[tileIndex] < 0) tileIndex = nearestFloorTile(tileX, tileY, fx, fy);
        if (tileIndex >= 0) {
          let floorRed = surface.red[tileIndex];
          let floorGreen = surface.green[tileIndex];
          let floorBlue = surface.blue[tileIndex];
          const kind = surface.kind[tileIndex];
          const tileJitter = (hash(tileX, tileY) - 0.5) * 0.045;
          const pixelGrain = (hash(px, py) - 0.5) * 0.03;
          let light = 1 + tileJitter + pixelGrain;
          // Soft bevel: floors darken toward their rounded edge, and a broad light pools mid-map.
          light *= 0.68 + 0.32 * smoothstep(0.5, 0.9, nearValue);
          const centreX = px / width - 0.5;
          const centreY = py / height - 0.5;
          light *= 1.06 - 0.28 * (centreX * centreX + centreY * centreY);

          if (kind === KIND_WATER) {
            light += 0.07 * Math.sin((px * 0.9 + py * 0.5) / (scale * 0.18));
          } else if (kind === KIND_LAVA) {
            light += 0.1 * Math.sin((px * 0.6 - py * 0.8) / (scale * 0.2)) + 0.08;
            floorGreen += 14;
          } else if (kind === KIND_CAVE) {
            light += (hash(px >> 2, py >> 2) - 0.5) * 0.12;
          }

          const here = surface.group[tileIndex];
          let seam = 0;
          if (fx * scale < seamWidth && isSeam(tileX - 1, tileY, here)) seam = 1;
          else if ((1 - fx) * scale < seamWidth && isSeam(tileX + 1, tileY, here)) seam = 1;
          if (fy * scale < seamWidth && isSeam(tileX, tileY - 1, here)) seam = 1;
          else if ((1 - fy) * scale < seamWidth && isSeam(tileX, tileY + 1, here)) seam = 1;

          floorRed = Math.min(255, floorRed * light);
          floorGreen = Math.min(255, floorGreen * light);
          floorBlue = Math.min(255, floorBlue * light);

          if (seam) {
            floorRed += (SEAM[0] - floorRed) * 0.45;
            floorGreen += (SEAM[1] - floorGreen) * 0.45;
            floorBlue += (SEAM[2] - floorBlue) * 0.45;
          }
          if (options.showGrid && (fx * scale < gridWidth || fy * scale < gridWidth)) {
            floorRed *= 0.93;
            floorGreen *= 0.93;
            floorBlue *= 0.95;
          }

          red += (floorRed - red) * cover;
          green += (floorGreen - green) * cover;
          blue += (floorBlue - blue) * cover;
        }
      }

      if (edgeInk) {
        // A bright hairline just outside the floor and a dark shadow line hugging it.
        const line = smoothstep(0.33, 0.39, nearValue) * (1 - smoothstep(0.46, 0.53, nearValue));
        const shadow = smoothstep(0.18, 0.3, nearValue) * (1 - smoothstep(0.33, 0.39, nearValue));
        red += (OUTLINE_SHADOW[0] - red) * shadow * 0.8;
        green += (OUTLINE_SHADOW[1] - green) * shadow * 0.8;
        blue += (OUTLINE_SHADOW[2] - blue) * shadow * 0.8;
        red += (OUTLINE[0] - red) * line * 0.9;
        green += (OUTLINE[1] - green) * line * 0.9;
        blue += (OUTLINE[2] - blue) * line * 0.9;
      }

      const offset = pixel * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  return { width, height, scale, data };
}

export function createCartographicCanvas(
  dungeon: Dungeon,
  options: CartographicOptions,
): HTMLCanvasElement {
  const image = renderCartographicImage(dungeon, options);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível renderizar o mapa cartográfico.");
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}
