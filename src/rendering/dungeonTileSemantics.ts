import {
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
} from "../dungeon";
import type { Dungeon, DungeonRoom, Tile, TrapCategory } from "../dungeon";
import { ROOM_TYPE_CATEGORIES } from "../roomTypes";
import type { RoomTypeCategory } from "../roomTypes";

type RgbColor = readonly [number, number, number];

export const DUNGEON_MAP_PALETTE = {
  background: "#10151d",
  wall: "#1a2430",
  floor: "#c6baa0",
  corridor: "#8f826b",
  corridorEdge: "#625d52",
  grid: "#667986",
  wallEdge: "#637585",
  caveEdge: "#758c78",
  water: "#3d829c",
  lava: "#b8634d",
  selected: "#d9b46c",
  hover: "#75b8c9",
} as const;

export const TRAP_CATEGORY_COLORS: Record<TrapCategory, readonly [number, number, number]> = {
  mechanical: [190, 160, 105],
  environmental: [104, 170, 123],
  magical: [164, 121, 218],
  capture: [210, 148, 87],
  deception: [194, 124, 191],
  motion: [93, 177, 201],
  biological: [117, 170, 91],
  combat: [212, 102, 79],
  complex: [222, 181, 84],
};

const ROOM_FLOOR_BASE_RGB: RgbColor = [198, 186, 160];
const ROOM_CATEGORY_TINT = 0.22;
const ROOM_FLOOR_RGB_BY_CATEGORY = new Map<RoomTypeCategory, RgbColor>();
const ROOM_FLOOR_COLOR_BY_CATEGORY = new Map<RoomTypeCategory, string>();

for (const category of Object.keys(ROOM_TYPE_CATEGORIES) as RoomTypeCategory[]) {
  const [red, green, blue] = ROOM_TYPE_CATEGORIES[category].rgb;
  const roomFloorRgb: RgbColor = [
    Math.round(ROOM_FLOOR_BASE_RGB[0] * (1 - ROOM_CATEGORY_TINT) + red * ROOM_CATEGORY_TINT),
    Math.round(ROOM_FLOOR_BASE_RGB[1] * (1 - ROOM_CATEGORY_TINT) + green * ROOM_CATEGORY_TINT),
    Math.round(ROOM_FLOOR_BASE_RGB[2] * (1 - ROOM_CATEGORY_TINT) + blue * ROOM_CATEGORY_TINT),
  ];
  ROOM_FLOOR_RGB_BY_CATEGORY.set(category, roomFloorRgb);
  ROOM_FLOOR_COLOR_BY_CATEGORY.set(
    category,
    `#${roomFloorRgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
  );
}

export function getRoomFloorRgb(category?: RoomTypeCategory): RgbColor {
  return (category && ROOM_FLOOR_RGB_BY_CATEGORY.get(category)) || ROOM_FLOOR_BASE_RGB;
}

export function getRoomFloorColor(category?: RoomTypeCategory): string {
  return (category && ROOM_FLOOR_COLOR_BY_CATEGORY.get(category)) || DUNGEON_MAP_PALETTE.floor;
}

const TILE_COLORS: Partial<Record<Tile, readonly [number, number, number]>> = {
  0: [26, 36, 48],
  1: ROOM_FLOOR_BASE_RGB,
  2: [143, 130, 107],
  3: [119, 83, 52],
  4: [199, 168, 108],
  5: [141, 121, 84],
  6: [69, 82, 92],
  7: [119, 83, 52],
  8: [103, 143, 125],
  9: [118, 111, 95],
  10: [61, 130, 156],
  11: [184, 99, 77],
  12: [50, 48, 47],
  13: [112, 48, 38],
  14: [157, 121, 71],
  15: [151, 164, 170],
  16: [181, 133, 71],
  17: [127, 117, 153],
  18: [93, 150, 90],
  19: [169, 135, 80],
  20: [117, 125, 131],
  21: [119, 111, 101],
  22: [139, 94, 82],
  23: [108, 121, 136],
  24: [163, 142, 104],
  25: [102, 132, 133],
  26: [183, 142, 62],
  27: [135, 124, 104],
  28: [146, 151, 154],
  29: [126, 100, 82],
  30: [28, 118, 157],
  31: [35, 145, 178],
  32: [100, 111, 143],
  33: [103, 151, 74],
  34: [143, 102, 177],
  35: [151, 176, 75],
  36: [88, 153, 177],
  37: [117, 190, 218],
  38: [139, 124, 107],
  39: [110, 93, 79],
  40: [180, 143, 75],
  41: [39, 144, 171],
  42: [220, 91, 38],
  43: [122, 181, 227],
  44: [210, 192, 68],
  45: [184, 155, 108],
  46: [204, 62, 27],
  47: [204, 126, 70],
  48: [213, 184, 130],
  49: [169, 130, 77],
  50: [76, 105, 83],
  51: [191, 143, 73],
  52: [153, 128, 88],
  53: [40, 127, 166],
  54: [212, 72, 35],
  55: [45, 145, 185],
  56: [230, 83, 24],
  57: [54, 151, 192],
  58: [196, 59, 28],
};

for (const trapType of TRAP_TYPES) {
  const definition = TRAP_DEFINITIONS[trapType];
  if (definition.tile >= 59) {
    TILE_COLORS[definition.tile] = TRAP_CATEGORY_COLORS[definition.category];
  }
}

export const CAVE_WATER_TILES: ReadonlySet<Tile> = new Set([
  CAVE_WATER_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_SPRING_TILE,
]);

export const CAVE_LAVA_TILES: ReadonlySet<Tile> = new Set([
  CAVE_LAVA_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_VENT_TILE,
]);

export type RoomCategoryGrid = ReadonlyMap<number, RoomTypeCategory>;
export type RoomNumberBounds = Pick<DungeonRoom, "number" | "x" | "y" | "width" | "height">;
export type WallSide = "top" | "right" | "bottom" | "left";

export interface WallEdge {
  side: WallSide;
  bordersCave: boolean;
}

export function getTileColor(tile: Tile): readonly [number, number, number] {
  const color = TILE_COLORS[tile];
  if (color) return color;
  throw new Error(`Nenhuma cor definida para o tile ${tile}.`);
}

export function getVisibleTile(tile: Tile, showWater: boolean, showLava: boolean): Tile {
  if (!showWater && tile === WATER_TILE) return FLOOR_TILE;
  if (!showLava && tile === LAVA_TILE) return FLOOR_TILE;
  if (!showWater && CAVE_WATER_TILES.has(tile)) return CAVE_TILE;
  if (!showLava && CAVE_LAVA_TILES.has(tile)) return CAVE_TILE;
  return tile;
}

export function getRoomCategory(
  roomCategories: RoomCategoryGrid,
  width: number,
  x: number,
  y: number,
): RoomTypeCategory | undefined {
  return roomCategories.get(y * width + x);
}

export function isOpenCaveConnection(
  dungeon: Dungeon,
  roomCategories: RoomCategoryGrid,
  x: number,
  y: number,
): boolean {
  return (
    (x + 1 < dungeon.width
      && roomCategories.has(y * dungeon.width + x + 1)
      && dungeon.tiles[y]?.[x + 1] !== 0)
    || (x > 0
      && roomCategories.has(y * dungeon.width + x - 1)
      && dungeon.tiles[y]?.[x - 1] !== 0)
    || (y + 1 < dungeon.height
      && roomCategories.has((y + 1) * dungeon.width + x)
      && dungeon.tiles[y + 1]?.[x] !== 0)
    || (y > 0
      && roomCategories.has((y - 1) * dungeon.width + x)
      && dungeon.tiles[y - 1]?.[x] !== 0)
  );
}

export function createRoomCategoryGrid(dungeon: Dungeon): RoomCategoryGrid {
  const categories = new Map<number, RoomTypeCategory>();
  for (const room of dungeon.roomDetails) {
    const category = room.roomType.category;
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const tile = dungeon.tiles[y]?.[x];
        if (
          tile !== undefined
          && tile !== 0
          && tile !== CAVE_TILE
          && tile !== CAVE_CONNECTION_WALL_TILE
          && tile !== CAVE_BREACH_TILE
          && !CAVE_WATER_TILES.has(tile)
          && !CAVE_LAVA_TILES.has(tile)
        ) categories.set(y * dungeon.width + x, category);
      }
    }
  }
  return categories;
}

export function createRoomNumberGrid(
  tiles: readonly (readonly Tile[])[],
  width: number,
  rooms: readonly RoomNumberBounds[],
): Uint32Array {
  const roomNumbers = new Uint32Array(width * tiles.length);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const tile = tiles[y]?.[x];
        if (tile !== undefined && tile !== 0) roomNumbers[y * width + x] = room.number;
      }
    }
  }
  return roomNumbers;
}

export function getRoomConnectionTiles(
  tiles: readonly (readonly Tile[])[],
  width: number,
  rooms: readonly RoomNumberBounds[],
  roomNumbers: Uint32Array,
  selectedRoomNumber: number,
): ReadonlySet<number> {
  const selectedRoom = rooms.find((room) => room.number === selectedRoomNumber);
  if (!selectedRoom || rooms.length < 2) return new Set();

  const height = tiles.length;
  const tileCount = width * height;
  const parents = new Int32Array(tileCount);
  parents.fill(-1);
  const queue = new Int32Array(tileCount);
  let head = 0;
  let tail = 0;

  for (let y = selectedRoom.y; y < selectedRoom.y + selectedRoom.height; y += 1) {
    for (let x = selectedRoom.x; x < selectedRoom.x + selectedRoom.width; x += 1) {
      const index = y * width + x;
      const tile = tiles[y]?.[x];
      if (roomNumbers[index] === selectedRoomNumber && tile !== undefined && tile !== 0
        && tile !== CAVE_CONNECTION_WALL_TILE && tile !== PILLAR_TILE) {
        parents[index] = -2;
        queue[tail] = index;
        tail += 1;
      }
    }
  }

  const foundRooms = new Set<number>();
  const connectionTiles = new Set<number>();
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const targetRoomCount = rooms.length - 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const roomNumber = roomNumbers[index];

    if (roomNumber !== 0 && roomNumber !== selectedRoomNumber) {
      if (!foundRooms.has(roomNumber)) {
        foundRooms.add(roomNumber);
        let pathIndex = index;
        while (pathIndex >= 0) {
          if (roomNumbers[pathIndex] === 0) connectionTiles.add(pathIndex);
          const parent = parents[pathIndex];
          if (parent < 0) break;
          pathIndex = parent;
        }
      }
      if (foundRooms.size === targetRoomCount) break;
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    for (const [offsetX, offsetY] of directions) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const nextIndex = nextY * width + nextX;
      if (parents[nextIndex] !== -1) continue;
      const nextTile = tiles[nextY]?.[nextX];
      if (
        nextTile === undefined
        || nextTile === 0
        || nextTile === CAVE_CONNECTION_WALL_TILE
        || nextTile === PILLAR_TILE
      ) continue;
      parents[nextIndex] = index;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }

  return connectionTiles;
}

function isWallEdgeNeighbor(tile: Tile): boolean {
  return tile !== 0 && tile !== CAVE_CONNECTION_WALL_TILE && tile !== PILLAR_TILE;
}

function isCaveEdgeNeighbor(tile: Tile): boolean {
  return tile === CAVE_TILE
    || tile === CAVE_BREACH_TILE
    || CAVE_WATER_TILES.has(tile)
    || CAVE_LAVA_TILES.has(tile);
}

function getRasterWallColor(tiles: Tile[][], x: number, y: number): readonly [number, number, number] | null {
  const top = tiles[y - 1]?.[x] ?? 0;
  const right = tiles[y]?.[x + 1] ?? 0;
  const bottom = tiles[y + 1]?.[x] ?? 0;
  const left = tiles[y]?.[x - 1] ?? 0;
  if (
    isCaveEdgeNeighbor(top)
    || isCaveEdgeNeighbor(right)
    || isCaveEdgeNeighbor(bottom)
    || isCaveEdgeNeighbor(left)
  ) return [117, 140, 120];
  if (
    isWallEdgeNeighbor(top)
    || isWallEdgeNeighbor(right)
    || isWallEdgeNeighbor(bottom)
    || isWallEdgeNeighbor(left)
  ) return [99, 117, 133];
  return null;
}

export function getWallEdges(tiles: Tile[][], x: number, y: number): WallEdge[] {
  const directions: Array<{ side: WallSide; x: number; y: number }> = [
    { side: "top", x, y: y - 1 },
    { side: "right", x: x + 1, y },
    { side: "bottom", x, y: y + 1 },
    { side: "left", x: x - 1, y },
  ];
  return directions.flatMap(({ side, x: neighborX, y: neighborY }) => {
    const neighbor = tiles[neighborY]?.[neighborX] ?? 0;
    if (
      neighbor === 0
      || neighbor === CAVE_CONNECTION_WALL_TILE
      || neighbor === PILLAR_TILE
    ) return [];
    return [{
      side,
      bordersCave: isCaveEdgeNeighbor(neighbor),
    }];
  });
}

export function createDungeonTileCanvas(
  dungeon: Dungeon,
  showWater: boolean,
  showLava: boolean,
  roomCategories: RoomCategoryGrid,
  showWalls = true,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dungeon.width;
  canvas.height = dungeon.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível rasterizar o mapa.");

  const image = context.createImageData(dungeon.width, dungeon.height);
  let pixelIndex = 0;
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = getVisibleTile(dungeon.tiles[y][x], showWater, showLava);
      const category = getRoomCategory(roomCategories, dungeon.width, x, y);
      const wallColor = tile === 0 && showWalls ? getRasterWallColor(dungeon.tiles, x, y) : null;
      const [red, green, blue] = tile === FLOOR_TILE && category
        ? getRoomFloorRgb(category)
        : tile === CAVE_TILE && isOpenCaveConnection(dungeon, roomCategories, x, y)
          ? [135, 154, 112] as const
          : wallColor ?? getTileColor(tile);
      image.data[pixelIndex] = red;
      image.data[pixelIndex + 1] = green;
      image.data[pixelIndex + 2] = blue;
      image.data[pixelIndex + 3] = 255;
      pixelIndex += 4;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
