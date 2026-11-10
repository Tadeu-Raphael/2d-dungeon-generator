import {
  CAVE_BREACH_TILE,
  CAVE_LAVA_TILE,
  CAVE_TILE,
  CAVE_WATER_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  SECRET_DOOR_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
  WALL_TILE,
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
import { getProceduralCartographicTextureAtlas } from "./cartographicTextures";

export interface CartographicOptions {
  showWater: boolean;
  showLava: boolean;
  /** Ink outline and wall relief around the explorable space. */
  showWalls: boolean;
  showGrid: boolean;
  roomCategories?: RoomCategoryGrid;
  /** Preferred pixels per tile; reduced automatically to respect `maxPixels`. */
  targetScale?: number;
  maxPixels?: number;
}

export interface CartographicTextureSheet {
  image: HTMLImageElement;
  width: number;
  height: number;
}

export interface CartographicImage {
  width: number;
  height: number;
  scale: number;
  data: Uint8ClampedArray;
}

export interface CartographicSpritePlacement {
  layer: "floor" | "wall";
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90;
}

export interface CartographicLiquidSpritePlacement {
  layer: "water" | "lava";
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PARCHMENT: readonly [number, number, number] = [38, 32, 25];
const PARCHMENT_SHADE: readonly [number, number, number] = [11, 12, 14];
const OUTLINE: readonly [number, number, number] = [138, 154, 166];
const OUTLINE_SHADOW: readonly [number, number, number] = [4, 6, 10];

const TRAP_TILES: ReadonlySet<Tile> = new Set(TRAP_TYPES.map((type) => TRAP_DEFINITIONS[type].tile));

const KIND_FLOOR = 0;
const KIND_WATER = 1;
const KIND_LAVA = 2;
const KIND_CAVE = 3;
const FLOOR_TEXTURE_REPEAT_TILES = 2;
const FLOOR_COLOR_OVERLAY_OPACITY = 0.18;
const FLOOR_TEXTURE_FRAME = { x: 448, y: 208, width: 32, height: 32 } as const;
const WALL_TEXTURE_FRAME = { x: 560, y: 128, width: 32, height: 32 } as const;
const WATER_TEXTURE_FRAME = { x: 64, y: 64, width: 96, height: 96 } as const;
const LAVA_TEXTURE_FRAME = { x: 64, y: 432, width: 96, height: 96 } as const;
const TEXTURE_SHEET_MIN_WIDTH = Math.max(
  FLOOR_TEXTURE_FRAME.x + FLOOR_TEXTURE_FRAME.width,
  WALL_TEXTURE_FRAME.x + WALL_TEXTURE_FRAME.width,
);
const TEXTURE_SHEET_MIN_HEIGHT = Math.max(
  FLOOR_TEXTURE_FRAME.y + FLOOR_TEXTURE_FRAME.height,
  WALL_TEXTURE_FRAME.y + WALL_TEXTURE_FRAME.height,
);

export function isCartographicTextureSheetCompatible(width: number, height: number): boolean {
  return width >= TEXTURE_SHEET_MIN_WIDTH && height >= TEXTURE_SHEET_MIN_HEIGHT;
}

const LIQUID_TEXTURE_SHEET_MIN_WIDTH = Math.max(
  WATER_TEXTURE_FRAME.x + WATER_TEXTURE_FRAME.width,
  LAVA_TEXTURE_FRAME.x + LAVA_TEXTURE_FRAME.width,
);
const LIQUID_TEXTURE_SHEET_MIN_HEIGHT = Math.max(
  WATER_TEXTURE_FRAME.y + WATER_TEXTURE_FRAME.height,
  LAVA_TEXTURE_FRAME.y + LAVA_TEXTURE_FRAME.height,
);

export function isCartographicLiquidTextureSheetCompatible(width: number, height: number): boolean {
  return width >= LIQUID_TEXTURE_SHEET_MIN_WIDTH && height >= LIQUID_TEXTURE_SHEET_MIN_HEIGHT;
}

export function isCartographicTexturedLiquidTile(tile: Tile): boolean {
  return tile === WATER_TILE
    || tile === LAVA_TILE
    || tile === CAVE_WATER_TILE
    || tile === CAVE_LAVA_TILE;
}

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

/** Floor colour, grouping and material of every tile. */
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
 * a thin luminous outline, and textured rock fading out from every wall.
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
  const textureAtlas = getProceduralCartographicTextureAtlas(scale);

  const mask = createScaledFloorMask(dungeon, scale);
  const near = blurField(mask, width, height, Math.max(1, Math.round(scale * 0.34)));
  const halo = options.showWalls
    ? blurField(mask, width, height, Math.max(2, Math.round(scale * 0.7)))
    : near;
  const data = new Uint8ClampedArray(width * height * 4);

  const gridWidth = Math.max(1, scale * 0.035);
  const edgeInk = options.showWalls;

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

      // Rock: darker near the floor, with its relief fading with distance.
      const haloValue = halo[pixel];
      const rockMix = smoothstep(0.02, 0.45, haloValue);
      let red = PARCHMENT[0] + (PARCHMENT_SHADE[0] - PARCHMENT[0]) * rockMix;
      let green = PARCHMENT[1] + (PARCHMENT_SHADE[1] - PARCHMENT[1]) * rockMix;
      let blue = PARCHMENT[2] + (PARCHMENT_SHADE[2] - PARCHMENT[2]) * rockMix;
      const paperIndex = (py & 63) * textureAtlas.paperSize + (px & 63);
      const paperGrain = textureAtlas.parchmentRelief[paperIndex];
      red += paperGrain;
      green += paperGrain * 0.84;
      blue += paperGrain * 0.62;

      const wallBand = smoothstep(0.03, 0.17, haloValue)
        * (1 - smoothstep(0.24, 0.53, nearValue));
      if (edgeInk && wallBand > 0) {
        const wallRelief = textureAtlas.wallRelief[(py % scale) * scale + (px % scale)];
        red += wallRelief * wallBand;
        green += wallRelief * wallBand * 0.92;
        blue += wallRelief * wallBand * 0.78;
      }

      if (cover > 0) {
        let tileIndex = tileY * dungeon.width + tileX;
        if (surface.group[tileIndex] < 0) tileIndex = nearestFloorTile(tileX, tileY, fx, fy);
        if (tileIndex >= 0) {
          let floorRed = surface.red[tileIndex];
          let floorGreen = surface.green[tileIndex];
          let floorBlue = surface.blue[tileIndex];
          const kind = surface.kind[tileIndex];
          const tileJitter = (hash(tileX, tileY) - 0.5) * 0.075;
          const stoneIndex = (py % scale) * scale + (px % scale);
          const stoneRelief = kind === KIND_WATER || kind === KIND_LAVA
            ? 0
            : textureAtlas.stoneRelief[stoneIndex];
          let light = 1 + tileJitter;
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

          floorRed = Math.min(255, floorRed * light + stoneRelief);
          floorGreen = Math.min(255, floorGreen * light + stoneRelief * 0.94);
          floorBlue = Math.min(255, floorBlue * light + stoneRelief * 0.82);
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

function isArchitecturalFloor(tile: Tile): boolean {
  return isFloorTile(tile)
    && tile !== CAVE_TILE
    && tile !== CAVE_BREACH_TILE
    && !CAVE_WATER_TILES.has(tile)
    && !CAVE_LAVA_TILES.has(tile);
}

function isVisibleSheetFloor(tile: Tile): boolean {
  return isFloorTile(tile)
    && tile !== DOOR_TILE
    && tile !== SECRET_DOOR_TILE
    && tile !== CAVE_TILE
    && tile !== CAVE_BREACH_TILE
    && tile !== WATER_TILE
    && tile !== LAVA_TILE
    && !CAVE_WATER_TILES.has(tile)
    && !CAVE_LAVA_TILES.has(tile);
}

function createPlacement(
  layer: CartographicSpritePlacement["layer"],
  frame: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: 0 | 90 = 0,
): CartographicSpritePlacement {
  return {
    layer,
    sourceX: frame.x,
    sourceY: frame.y,
    sourceWidth: frame.width,
    sourceHeight: frame.height,
    x,
    y,
    width,
    height,
    rotation,
  };
}

export function getCartographicSpritePlacements(
  dungeon: Dungeon,
  options: Pick<CartographicOptions, "showWater" | "showLava" | "showWalls">,
  scale: number,
): CartographicSpritePlacement[] {
  const placements: CartographicSpritePlacement[] = [];
  const visibleTiles = dungeon.tiles.map((row) => row.map(
    (tile) => getVisibleTile(tile, options.showWater, options.showLava),
  ));
  const isArchitecturalNeighbor = (x: number, y: number): boolean => {
    const tile = visibleTiles[y]?.[x];
    return tile !== undefined && isArchitecturalFloor(tile);
  };
  const diagonalCorners = [
    { x: -1, y: -1, rotation: 90 as const },
    { x: 1, y: -1, rotation: 0 as const },
    { x: 1, y: 1, rotation: 90 as const },
    { x: -1, y: 1, rotation: 0 as const },
  ];

  if (options.showWalls) {
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        if (visibleTiles[y][x] !== WALL_TILE) continue;
        const north = isArchitecturalNeighbor(x, y - 1);
        const east = isArchitecturalNeighbor(x + 1, y);
        const south = isArchitecturalNeighbor(x, y + 1);
        const west = isArchitecturalNeighbor(x - 1, y);
        const hasCardinalFloor = north || east || south || west;
        const corner = hasCardinalFloor ? undefined : diagonalCorners.find(({ x: dx, y: dy }) => (
          isArchitecturalNeighbor(x + dx, y + dy)
          && visibleTiles[y]?.[x + dx] === WALL_TILE
          && visibleTiles[y + dy]?.[x] === WALL_TILE
        ));
        if (!hasCardinalFloor && !corner) continue;
        const rotation = corner?.rotation ?? ((north || south) && !(east || west) ? 90 : 0);
        placements.push(createPlacement(
          "wall",
          WALL_TEXTURE_FRAME,
          x * scale,
          y * scale,
          scale,
          scale,
          rotation,
        ));
      }
    }
  }

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = visibleTiles[y][x];
      if (!isVisibleSheetFloor(tile)) continue;
      placements.push(createPlacement(
        "floor",
        FLOOR_TEXTURE_FRAME,
        x * scale,
        y * scale,
        scale,
        scale,
      ));
    }
  }

  return placements;
}

export function getCartographicLiquidSpritePlacements(
  dungeon: Dungeon,
  options: Pick<CartographicOptions, "showWater" | "showLava">,
  scale: number,
): CartographicLiquidSpritePlacement[] {
  const placements: CartographicLiquidSpritePlacement[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = getVisibleTile(dungeon.tiles[y][x], options.showWater, options.showLava);
      let layer: CartographicLiquidSpritePlacement["layer"] | null = null;
      let frame: typeof WATER_TEXTURE_FRAME | typeof LAVA_TEXTURE_FRAME | null = null;
      if (tile === WATER_TILE || tile === CAVE_WATER_TILE) {
        layer = "water";
        frame = WATER_TEXTURE_FRAME;
      } else if (tile === LAVA_TILE || tile === CAVE_LAVA_TILE) {
        layer = "lava";
        frame = LAVA_TEXTURE_FRAME;
      }
      if (!frame || !layer) continue;
      placements.push({
        layer,
        sourceX: frame.x,
        sourceY: frame.y,
        sourceWidth: frame.width,
        sourceHeight: frame.height,
        x: x * scale,
        y: y * scale,
        width: scale,
        height: scale,
      });
    }
  }
  return placements;
}

function drawCartographicSpriteSheet(
  context: CanvasRenderingContext2D,
  dungeon: Dungeon,
  options: CartographicOptions,
  textureSheet: CartographicTextureSheet,
  scale: number,
): void {
  if (!isCartographicTextureSheetCompatible(textureSheet.width, textureSheet.height)) {
    throw new Error("A folha de texturas cartográficas tem dimensões incompatíveis.");
  }
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const floorSurface = createTileSurface(
    dungeon,
    options.roomCategories ?? createRoomCategoryGrid(dungeon),
    options.showWater,
    options.showLava,
  );
  for (const placement of getCartographicSpritePlacements(dungeon, options, scale)) {
    context.save();
    if (placement.layer === "floor") {
      const repeatSize = scale * FLOOR_TEXTURE_REPEAT_TILES;
      const patternX = Math.floor(placement.x / repeatSize) * repeatSize;
      const patternY = Math.floor(placement.y / repeatSize) * repeatSize;
      context.beginPath();
      context.rect(placement.x, placement.y, placement.width, placement.height);
      context.clip();
      context.drawImage(
        textureSheet.image,
        placement.sourceX,
        placement.sourceY,
        placement.sourceWidth,
        placement.sourceHeight,
        patternX,
        patternY,
        repeatSize,
        repeatSize,
      );
      const tileIndex = Math.floor(placement.y / scale) * dungeon.width
        + Math.floor(placement.x / scale);
      context.globalAlpha = FLOOR_COLOR_OVERLAY_OPACITY;
      context.fillStyle = `rgb(${floorSurface.red[tileIndex]}, ${floorSurface.green[tileIndex]}, ${floorSurface.blue[tileIndex]})`;
      context.fillRect(placement.x, placement.y, placement.width, placement.height);
    } else if (placement.rotation === 90) {
      context.translate(
        placement.x + placement.width / 2,
        placement.y + placement.height / 2,
      );
      context.rotate(Math.PI / 2);
      context.drawImage(
        textureSheet.image,
        placement.sourceX,
        placement.sourceY,
        placement.sourceWidth,
        placement.sourceHeight,
        -placement.height / 2,
        -placement.width / 2,
        placement.height,
        placement.width,
      );
    } else {
      context.drawImage(
        textureSheet.image,
        placement.sourceX,
        placement.sourceY,
        placement.sourceWidth,
        placement.sourceHeight,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
      );
    }
    context.restore();
  }
  context.restore();
}

function drawCartographicLiquidTextureSheet(
  context: CanvasRenderingContext2D,
  dungeon: Dungeon,
  options: CartographicOptions,
  textureSheet: CartographicTextureSheet,
  scale: number,
): void {
  if (!isCartographicLiquidTextureSheetCompatible(textureSheet.width, textureSheet.height)) {
    throw new Error("A folha de texturas de água e lava tem dimensões incompatíveis.");
  }
  context.save();
  context.imageSmoothingEnabled = false;
  const placements = getCartographicLiquidSpritePlacements(dungeon, options, scale);
  for (const layer of ["water", "lava"] as const) {
    const layerPlacements = placements.filter((placement) => placement.layer === layer);
    if (layerPlacements.length === 0) continue;

    const frame = layerPlacements[0];
    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = frame.sourceWidth;
    patternCanvas.height = frame.sourceHeight;
    const patternContext = patternCanvas.getContext("2d");
    if (!patternContext) throw new Error("Não foi possível preparar a textura de líquido.");
    patternContext.imageSmoothingEnabled = false;
    patternContext.drawImage(
      textureSheet.image,
      frame.sourceX,
      frame.sourceY,
      frame.sourceWidth,
      frame.sourceHeight,
      0,
      0,
      frame.sourceWidth,
      frame.sourceHeight,
    );
    const pattern = context.createPattern(patternCanvas, "repeat");
    if (!pattern) throw new Error("Não foi possível criar o padrão de textura de líquido.");

    context.save();
    context.beginPath();
    for (const placement of layerPlacements) {
      context.rect(placement.x, placement.y, placement.width, placement.height);
    }
    context.clip();
    context.fillStyle = pattern;
    context.fillRect(0, 0, dungeon.width * scale, dungeon.height * scale);
    context.restore();
  }
  context.restore();
}

export function createCartographicCanvas(
  dungeon: Dungeon,
  options: CartographicOptions,
  textureSheet?: CartographicTextureSheet,
  liquidTextureSheet?: CartographicTextureSheet,
): HTMLCanvasElement {
  const image = renderCartographicImage(dungeon, options);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível renderizar o mapa cartográfico.");
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  if (textureSheet) drawCartographicSpriteSheet(context, dungeon, options, textureSheet, image.scale);
  if (liquidTextureSheet) {
    drawCartographicLiquidTextureSheet(context, dungeon, options, liquidTextureSheet, image.scale);
  }
  return canvas;
}
