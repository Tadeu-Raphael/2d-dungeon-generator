import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
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
  DOOR_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
  getNumberedCorridorTraps,
} from "./dungeon";
import type { Dungeon, NumberedCorridorTrap, Tile, TrapCategory, TrapType } from "./dungeon";
import { ROOM_TYPE_CATEGORIES } from "./roomTypes";
import type { RoomTypeCategory } from "./roomTypes";

export type MapFocusRequest =
  | { type: "room"; roomNumber: number; requestId: number; shouldFocus: boolean };

type MapTarget = { type: "room"; roomNumber: number };

type CanvasDrag =
  | {
    type: "pan";
    pointerId: number;
    originX: number;
    originY: number;
    panX: number;
    panY: number;
  }
  | {
    type: "room";
    pointerId: number;
    roomNumber: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  };

interface DungeonCanvasProps {
  dungeon: Dungeon;
  generationKey: Dungeon;
  focusRequest: MapFocusRequest | null;
  onRoomMove: (roomNumber: number, x: number, y: number) => void;
  onRoomSelect: (roomNumber: number) => void;
  onRoomMoveEnd: (roomNumber: number) => void;
  onClearSelection: () => void;
  showWater: boolean;
  showLava: boolean;
  onToggleWater: () => void;
  onToggleLava: () => void;
}

interface DungeonExportControlProps {
  dungeon: Dungeon;
}

const EXPORT_TILE_SIZE = 16;
const MAX_EXPORT_PIXELS = 16_000_000;
const RASTER_SVG_TILE_THRESHOLD = 50_000;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 64;
const TRAP_CATEGORY_COLORS: Record<TrapCategory, readonly [number, number, number]> = {
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

const TILE_COLORS: Partial<Record<Tile, readonly [number, number, number]>> = {
  0: [30, 39, 50],
  1: [209, 185, 135],
  2: [169, 130, 77],
  3: [119, 83, 52],
  4: [199, 168, 108],
  5: [141, 121, 84],
  6: [69, 82, 92],
  7: [119, 83, 52],
  8: [103, 143, 125],
  9: [118, 111, 95],
  10: [42, 127, 166],
  11: [212, 72, 35],
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

export function getTileColor(tile: Tile): readonly [number, number, number] {
  const color = TILE_COLORS[tile];
  if (color) return color;
  throw new Error(`Nenhuma cor definida para o tile ${tile}.`);
}

const CAVE_WATER_TILES = new Set<Tile>([
  CAVE_WATER_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_SPRING_TILE,
]);
const CAVE_LAVA_TILES = new Set<Tile>([
  CAVE_LAVA_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_VENT_TILE,
]);

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function getVisibleTile(tile: Tile, showWater: boolean, showLava: boolean): Tile {
  if (!showWater && tile === WATER_TILE) return 1;
  if (!showLava && tile === LAVA_TILE) return 1;
  if (!showWater && CAVE_WATER_TILES.has(tile)) return CAVE_TILE;
  if (!showLava && CAVE_LAVA_TILES.has(tile)) return CAVE_TILE;
  return tile;
}

type RoomCategoryGrid = Array<Array<RoomTypeCategory | undefined>>;

function isOpenCaveConnection(
  dungeon: Dungeon,
  roomCategories: RoomCategoryGrid,
  x: number,
  y: number,
): boolean {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([neighborX, neighborY]) => (
    roomCategories[neighborY]?.[neighborX] !== undefined
    && dungeon.tiles[neighborY]?.[neighborX] !== 0
  ));
}

function createRoomCategoryGrid(dungeon: Dungeon): RoomCategoryGrid {
  const categories: RoomCategoryGrid = Array.from(
    { length: dungeon.height },
    () => Array<RoomTypeCategory | undefined>(dungeon.width).fill(undefined),
  );
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
        ) categories[y][x] = category;
      }
    }
  }
  return categories;
}

function createDungeonTileCanvas(
  dungeon: Dungeon,
  showWater: boolean,
  showLava: boolean,
  roomCategories: RoomCategoryGrid,
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
      const category = roomCategories[y][x];
      const wallEdges = tile === 0 ? getWallEdges(dungeon.tiles, x, y) : [];
      const wallColor = wallEdges.some((edge) => edge.bordersCave)
        ? [107, 132, 108] as const
        : wallEdges.length > 0
          ? [66, 81, 95] as const
          : null;
      const [red, green, blue] = tile === 1 && category
        ? ROOM_TYPE_CATEGORIES[category].rgb
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

function getExportTileSize(dungeon: Dungeon): number {
  const tileCount = dungeon.width * dungeon.height;
  return Math.min(EXPORT_TILE_SIZE, Math.sqrt(MAX_EXPORT_PIXELS / tileCount));
}

type WallSide = "top" | "right" | "bottom" | "left";
interface WallEdge {
  side: WallSide;
  bordersCave: boolean;
}

function getWallEdges(tiles: Tile[][], x: number, y: number): WallEdge[] {
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
      bordersCave: neighbor === CAVE_TILE
        || neighbor === CAVE_BREACH_TILE
        || CAVE_WATER_TILES.has(neighbor)
        || CAVE_LAVA_TILES.has(neighbor),
    }];
  });
}

function drawTileFeature(
  features: Graphics,
  tile: Tile,
  tileX: number,
  tileY: number,
  tileSize: number,
  wallEdges: readonly WallEdge[] = [],
  openCaveConnection = false,
): void {
  if (tile === 0) {
    for (const edge of wallEdges) {
      const points: Record<WallSide, readonly [number, number, number, number]> = {
        top: [tileX, tileY, tileX + tileSize, tileY],
        right: [tileX + tileSize, tileY, tileX + tileSize, tileY + tileSize],
        bottom: [tileX, tileY + tileSize, tileX + tileSize, tileY + tileSize],
        left: [tileX, tileY, tileX, tileY + tileSize],
      };
      const [startX, startY, endX, endY] = points[edge.side];
      features
        .moveTo(startX, startY)
        .lineTo(endX, endY)
        .stroke({
          color: edge.bordersCave ? "#829c83" : "#657585",
          width: Math.max(1.2, tileSize * 0.12),
        });
    }
  } else if (tile === CAVE_TILE && openCaveConnection) {
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.5, tileSize * 0.12)
      .fill("#d8d2a3");
  } else if (tile === CAVE_BREACH_TILE) {
    features
      .rect(tileX + tileSize * 0.16, tileY + tileSize * 0.55, tileSize * 0.28, tileSize * 0.2)
      .fill("#554832")
      .stroke({ color: "#e1c48b", width: tileSize * 0.04 });
    features
      .rect(tileX + tileSize * 0.52, tileY + tileSize * 0.48, tileSize * 0.3, tileSize * 0.24)
      .fill("#806b49")
      .stroke({ color: "#ead4a6", width: tileSize * 0.04 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.3)
      .lineTo(tileX + tileSize * 0.42, tileY + tileSize * 0.24)
      .lineTo(tileX + tileSize * 0.53, tileY + tileSize * 0.35)
      .stroke({ color: "#d8c395", width: tileSize * 0.05 });
  } else if (tile === CAVE_CONNECTION_WALL_TILE) {
    const inset = tileSize * 0.12;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset * 2, tileSize - inset * 2)
      .fill("#725631")
      .stroke({ color: "#f0c574", width: tileSize * 0.08 });
    features
      .moveTo(tileX + tileSize * 0.52, tileY + tileSize * 0.2)
      .lineTo(tileX + tileSize * 0.42, tileY + tileSize * 0.42)
      .lineTo(tileX + tileSize * 0.56, tileY + tileSize * 0.56)
      .lineTo(tileX + tileSize * 0.43, tileY + tileSize * 0.8)
      .stroke({ color: "#f5d992", width: tileSize * 0.07 });
  } else if (tile === DOOR_TILE) {
    const doorX = tileX + tileSize * 0.18;
    const doorY = tileY + tileSize * 0.12;
    const doorWidth = tileSize * 0.64;
    const doorHeight = tileSize * 0.76;
    features
      .rect(doorX, doorY, doorWidth, doorHeight)
      .fill("#775334")
      .stroke({ color: "#d6aa66", width: tileSize * 0.08 });
    features
      .circle(doorX + doorWidth * 0.72, doorY + doorHeight * 0.52, tileSize * 0.06)
      .fill("#f0cf87");
  } else if (tile === SECRET_DOOR_TILE) {
    const doorX = tileX + tileSize * 0.12;
    const doorY = tileY + tileSize * 0.12;
    const doorSize = tileSize * 0.76;
    features
      .rect(doorX, doorY, doorSize, doorSize)
      .fill("#17212c")
      .stroke({ color: "#596671", width: tileSize * 0.06, alignment: 0.5 });
    features
      .moveTo(tileX + tileSize * 0.5, tileY + tileSize * 0.28)
      .lineTo(tileX + tileSize * 0.5, tileY + tileSize * 0.72)
      .stroke({ color: "#87919a", width: tileSize * 0.06 });
  } else if (tile === EXTERIOR_ENTRANCE_TILE) {
    features
      .rect(tileX + tileSize * 0.2, tileY + tileSize * 0.14, tileSize * 0.6, tileSize * 0.72)
      .fill("#775334")
      .stroke({ color: "#f0cf87", width: tileSize * 0.09 });
    features
      .moveTo(tileX + tileSize * 0.5, tileY + tileSize * 0.3)
      .lineTo(tileX + tileSize * 0.5, tileY + tileSize * 0.7)
      .stroke({ color: "#f0cf87", width: tileSize * 0.07 });
  } else if (tile === EXTERIOR_CONNECTION_TILE) {
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.5, tileSize * 0.31)
      .fill("#17212c")
      .stroke({ color: "#c5e1c7", width: tileSize * 0.1 });
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.5, tileSize * 0.12)
      .fill("#c5e1c7");
  } else if (tile === PILLAR_TILE) {
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.5, tileSize * 0.34)
      .fill("#625d50")
      .stroke({ color: "#292b2a", width: tileSize * 0.08 });
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.5, tileSize * 0.19)
      .fill("#c1b49c")
      .stroke({ color: "#e2d3b6", width: tileSize * 0.05 });
  } else if (tile === ELEVATED_FLOOR_TILE) {
    const inset = tileSize * 0.16;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset * 2, tileSize - inset * 2)
      .stroke({ color: "#f0cf87", width: tileSize * 0.07 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.38)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.38)
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.62)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.62)
      .stroke({ color: "#80643e", width: tileSize * 0.06 });
  } else if (tile === ROOM_STAIRS_TILE) {
    for (const lineY of [0.28, 0.5, 0.72]) {
      features
        .moveTo(tileX + tileSize * 0.18, tileY + tileSize * lineY)
        .lineTo(tileX + tileSize * 0.82, tileY + tileSize * lineY)
        .stroke({ color: "#17212c", width: tileSize * 0.1 });
    }
  } else if (tile === CAVE_WATERFALL_TILE) {
    features
      .rect(tileX + tileSize * 0.08, tileY + tileSize * 0.08, tileSize * 0.84, tileSize * 0.84)
      .fill("#287fa6")
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    for (const lineX of [0.32, 0.5, 0.68]) {
      features
        .moveTo(tileX + tileSize * lineX, tileY + tileSize * 0.16)
        .lineTo(tileX + tileSize * (lineX - 0.06), tileY + tileSize * 0.44)
        .lineTo(tileX + tileSize * (lineX + 0.06), tileY + tileSize * 0.7)
        .stroke({ color: "#b9eff8", width: tileSize * 0.07 });
    }
  } else if (tile === CAVE_LAVA_FALL_TILE) {
    features
      .rect(tileX + tileSize * 0.08, tileY + tileSize * 0.08, tileSize * 0.84, tileSize * 0.84)
      .fill("#d44823")
      .stroke({ color: "#ff9b45", width: tileSize * 0.06 });
    for (const lineX of [0.32, 0.5, 0.68]) {
      features
        .moveTo(tileX + tileSize * lineX, tileY + tileSize * 0.16)
        .lineTo(tileX + tileSize * (lineX - 0.06), tileY + tileSize * 0.44)
        .lineTo(tileX + tileSize * (lineX + 0.06), tileY + tileSize * 0.7)
        .stroke({ color: "#ffd27a", width: tileSize * 0.07 });
    }
  } else if (tile === CAVE_SPRING_TILE) {
    features
      .rect(tileX + tileSize * 0.08, tileY + tileSize * 0.08, tileSize * 0.84, tileSize * 0.84)
      .fill("#287fa6")
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.52, tileSize * 0.16)
      .fill("#c8f4fa")
      .stroke({ color: "#e7fcff", width: tileSize * 0.04 });
    features
      .moveTo(tileX + tileSize * 0.5, tileY + tileSize * 0.33)
      .lineTo(tileX + tileSize * 0.5, tileY + tileSize * 0.18)
      .moveTo(tileX + tileSize * 0.3, tileY + tileSize * 0.48)
      .lineTo(tileX + tileSize * 0.2, tileY + tileSize * 0.4)
      .moveTo(tileX + tileSize * 0.7, tileY + tileSize * 0.48)
      .lineTo(tileX + tileSize * 0.8, tileY + tileSize * 0.4)
      .stroke({ color: "#d9faff", width: tileSize * 0.05 });
  } else if (tile === CAVE_LAVA_VENT_TILE) {
    features
      .rect(tileX + tileSize * 0.08, tileY + tileSize * 0.08, tileSize * 0.84, tileSize * 0.84)
      .fill("#9b321c")
      .stroke({ color: "#ff9b45", width: tileSize * 0.06 });
    features
      .circle(tileX + tileSize * 0.5, tileY + tileSize * 0.52, tileSize * 0.18)
      .fill("#ffd27a")
      .stroke({ color: "#fff0b0", width: tileSize * 0.05 });
    features
      .moveTo(tileX + tileSize * 0.5, tileY + tileSize * 0.32)
      .lineTo(tileX + tileSize * 0.46, tileY + tileSize * 0.16)
      .lineTo(tileX + tileSize * 0.56, tileY + tileSize * 0.27)
      .stroke({ color: "#ffb14d", width: tileSize * 0.07 });
  } else if (tile === CAVE_WATER_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill("#287fa6")
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.38)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.38)
      .stroke({ color: "#a9e3f2", width: tileSize * 0.05 });
  } else if (tile === CAVE_LAVA_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill("#d44823")
      .stroke({ color: "#ff9b45", width: tileSize * 0.06 });
    features
      .moveTo(tileX + tileSize * 0.2, tileY + tileSize * 0.68)
      .lineTo(tileX + tileSize * 0.4, tileY + tileSize * 0.36)
      .lineTo(tileX + tileSize * 0.58, tileY + tileSize * 0.62)
      .lineTo(tileX + tileSize * 0.8, tileY + tileSize * 0.28)
      .stroke({ color: "#ffd27a", width: tileSize * 0.08 });
  } else if (tile === WATER_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill("#287fa6")
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.38)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.38)
      .stroke({ color: "#a9e3f2", width: tileSize * 0.05 });
  } else if (tile === LAVA_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill("#d44823")
      .stroke({ color: "#ff9b45", width: tileSize * 0.06 });
    features
      .moveTo(tileX + tileSize * 0.2, tileY + tileSize * 0.68)
      .lineTo(tileX + tileSize * 0.4, tileY + tileSize * 0.36)
      .lineTo(tileX + tileSize * 0.58, tileY + tileSize * 0.62)
      .lineTo(tileX + tileSize * 0.8, tileY + tileSize * 0.28)
      .stroke({ color: "#ffd27a", width: tileSize * 0.08 });
  } else if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE) {
    const inset = tileSize * 0.09;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill("#c7a86c");
    const isAscending = tile === STAIRS_UP_TILE;
    for (const lineY of [0.26, 0.42, 0.58, 0.74]) {
      features
        .moveTo(tileX + tileSize * 0.12, tileY + tileSize * lineY)
        .lineTo(tileX + tileSize * 0.5, tileY + tileSize * lineY)
        .stroke({ color: "#17212c", width: tileSize * 0.09 });
    }
    const shaftStartY = isAscending ? 0.76 : 0.24;
    const shaftEndY = isAscending ? 0.24 : 0.76;
    const arrowBaseY = isAscending ? 0.44 : 0.56;
    features
      .moveTo(tileX + tileSize * 0.76, tileY + tileSize * shaftStartY)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * shaftEndY)
      .moveTo(tileX + tileSize * 0.58, tileY + tileSize * arrowBaseY)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * shaftEndY)
      .lineTo(tileX + tileSize * 0.94, tileY + tileSize * arrowBaseY)
      .stroke({ color: "#17212c", width: tileSize * 0.1 });
  } else {
    const trapType = TRAP_TYPES.find((type) => TRAP_DEFINITIONS[type].tile === tile);
    if (trapType) drawTrapFeature(features, trapType, tileX, tileY, tileSize);
  }
}

function drawTrapFeature(
  features: Graphics,
  trapType: TrapType,
  tileX: number,
  tileY: number,
  tileSize: number,
): void {
  const left = tileX + tileSize * 0.16;
  const top = tileY + tileSize * 0.16;
  const size = tileSize * 0.68;
  const centerX = tileX + tileSize * 0.5;
  const centerY = tileY + tileSize * 0.5;
  const metal = "#d1d1c5";
  const highlight = "#f0c46d";
  const danger = "#e36b48";
  const dark = "#1c2329";
  const line = (points: Array<[number, number]>, color = metal, width = 0.07) => {
    features.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) features.lineTo(x, y);
    features.stroke({ color, width: tileSize * width });
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number, color = highlight) => {
    line([[x1, y1], [x2, y2]], color);
    const arrowSize = tileSize * 0.11;
    if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
      const direction = Math.sign(x2 - x1);
      line([[x2 - direction * arrowSize, y2 - arrowSize], [x2, y2], [x2 - direction * arrowSize, y2 + arrowSize]], color);
    } else {
      const direction = Math.sign(y2 - y1);
      line([[x2 - arrowSize, y2 - direction * arrowSize], [x2, y2], [x2 + arrowSize, y2 - direction * arrowSize]], color);
    }
  };
  features
    .roundRect(left, top, size, size, tileSize * 0.07)
    .fill(dark)
    .stroke({ color: "#9b8055", width: tileSize * 0.05 });

  if (trapType === "hiddenPit") {
    features.circle(centerX, centerY, tileSize * 0.22).fill("#080c10").stroke({ color: highlight, width: tileSize * 0.07 });
    line([[centerX - tileSize * 0.2, centerY - tileSize * 0.2], [centerX + tileSize * 0.2, centerY + tileSize * 0.2]], metal, 0.045);
  } else if (trapType === "spikedPit") {
    features.circle(centerX, centerY, tileSize * 0.23).fill("#080c10").stroke({ color: danger, width: tileSize * 0.06 });
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      line([
        [centerX + Math.cos(angle) * tileSize * 0.04, centerY + Math.sin(angle) * tileSize * 0.04],
        [centerX + Math.cos(angle) * tileSize * 0.21, centerY + Math.sin(angle) * tileSize * 0.21],
      ], metal, 0.07);
    }
  } else if (trapType === "falseFloor") {
    line([[left + tileSize * 0.04, top + tileSize * 0.08], [centerX, centerY], [left + size - tileSize * 0.05, top + size - tileSize * 0.08]], highlight);
    line([[centerX, centerY], [centerX + tileSize * 0.08, centerY - tileSize * 0.18], [centerX + tileSize * 0.2, centerY - tileSize * 0.12]], danger);
    line([[centerX, centerY], [centerX - tileSize * 0.1, centerY + tileSize * 0.2]], danger);
  } else if (trapType === "wallBlades") {
    features.rect(left, top + tileSize * 0.16, tileSize * 0.11, size * 0.62).fill("#87939b");
    features.rect(left + size - tileSize * 0.11, top + tileSize * 0.16, tileSize * 0.11, size * 0.62).fill("#87939b");
    arrow(left + tileSize * 0.13, centerY, centerX - tileSize * 0.12, centerY, danger);
    arrow(left + size - tileSize * 0.13, centerY, centerX + tileSize * 0.12, centerY, danger);
  } else if (trapType === "pendulumBlade") {
    features.circle(centerX, top + tileSize * 0.08, tileSize * 0.06).fill(highlight);
    line([[centerX, top + tileSize * 0.08], [centerX + tileSize * 0.2, centerY + tileSize * 0.06]], metal);
    line([[centerX + tileSize * 0.11, centerY], [centerX + tileSize * 0.29, centerY + tileSize * 0.12], [centerX + tileSize * 0.08, centerY + tileSize * 0.14]], danger);
    line([[centerX - tileSize * 0.24, top + tileSize * 0.17], [centerX + tileSize * 0.24, top + tileSize * 0.17]], highlight, 0.045);
  } else if (trapType === "spinningBlades") {
    features.circle(centerX, centerY, tileSize * 0.08).fill(highlight);
    line([[centerX - tileSize * 0.24, centerY - tileSize * 0.24], [centerX + tileSize * 0.24, centerY + tileSize * 0.24]], metal, 0.09);
    line([[centerX - tileSize * 0.24, centerY + tileSize * 0.24], [centerX + tileSize * 0.24, centerY - tileSize * 0.24]], danger, 0.09);
  } else if (trapType === "poisonDarts") {
    for (const offsetY of [-0.18, 0, 0.18]) {
      arrow(left + tileSize * 0.1, centerY + tileSize * offsetY, left + size - tileSize * 0.08, centerY + tileSize * offsetY, "#8bd17c");
    }
  } else if (trapType === "wallArrows") {
    features.rect(left + tileSize * 0.04, centerY - tileSize * 0.12, tileSize * 0.12, tileSize * 0.24).fill("#87939b");
    arrow(left + tileSize * 0.2, centerY, left + size - tileSize * 0.08, centerY, highlight);
    line([[left + tileSize * 0.24, top + tileSize * 0.06], [left + tileSize * 0.24, top + tileSize * 0.19]], metal, 0.04);
    line([[left + tileSize * 0.24, top + size - tileSize * 0.19], [left + tileSize * 0.24, top + size - tileSize * 0.06]], metal, 0.04);
  } else if (trapType === "hiddenHarpoons") {
    line([[left + tileSize * 0.06, centerY], [centerX + tileSize * 0.13, centerY], [centerX + tileSize * 0.28, centerY - tileSize * 0.12]], metal);
    line([[centerX + tileSize * 0.13, centerY], [centerX + tileSize * 0.27, centerY + tileSize * 0.13]], danger);
    line([[left + tileSize * 0.1, centerY - tileSize * 0.12], [left + tileSize * 0.1, centerY + tileSize * 0.12]], highlight);
  } else if (trapType === "ceilingPress") {
    features.rect(left + tileSize * 0.04, top + tileSize * 0.03, size - tileSize * 0.08, tileSize * 0.18).fill("#9da4a5");
    arrow(centerX - tileSize * 0.17, centerY - tileSize * 0.05, centerX - tileSize * 0.17, centerY + tileSize * 0.24, danger);
    arrow(centerX + tileSize * 0.17, centerY - tileSize * 0.05, centerX + tileSize * 0.17, centerY + tileSize * 0.24, danger);
  } else if (trapType === "crushingWalls") {
    features.rect(left + tileSize * 0.03, top + tileSize * 0.1, tileSize * 0.13, size * 0.72).fill("#9da4a5");
    features.rect(left + size - tileSize * 0.16, top + tileSize * 0.1, tileSize * 0.13, size * 0.72).fill("#9da4a5");
    arrow(centerX - tileSize * 0.23, centerY, centerX - tileSize * 0.04, centerY, danger);
    arrow(centerX + tileSize * 0.23, centerY, centerX + tileSize * 0.04, centerY, danger);
  } else if (trapType === "guillotineDoor") {
    features.rect(left + tileSize * 0.04, top + tileSize * 0.03, size - tileSize * 0.08, tileSize * 0.13).fill("#87939b");
    line([[centerX, top + tileSize * 0.17], [centerX, centerY + tileSize * 0.15]], danger, 0.1);
    line([[centerX - tileSize * 0.18, centerY + tileSize * 0.16], [centerX, centerY + tileSize * 0.28], [centerX + tileSize * 0.18, centerY + tileSize * 0.16]], metal);
    arrow(centerX, top + tileSize * 0.18, centerX, centerY + tileSize * 0.08, highlight);
  } else if (trapType === "retractableStairs") {
    for (let index = 0; index < 3; index += 1) {
      const stepX = left + tileSize * (0.08 + index * 0.15);
      const stepY = top + tileSize * (0.58 - index * 0.15);
      line([[stepX, stepY], [stepX + tileSize * 0.14, stepY]], metal, 0.08);
    }
    arrow(centerX + tileSize * 0.1, centerY - tileSize * 0.2, centerX + tileSize * 0.1, centerY + tileSize * 0.2, danger);
  } else if (trapType === "destructibleBridge") {
    for (const offsetY of [-0.16, 0, 0.16]) {
      line([[left + tileSize * 0.04, centerY + tileSize * offsetY], [centerX - tileSize * 0.04, centerY + tileSize * offsetY]], metal);
      line([[centerX + tileSize * 0.04, centerY + tileSize * offsetY], [left + size - tileSize * 0.04, centerY + tileSize * offsetY]], metal);
    }
    line([[centerX - tileSize * 0.04, centerY - tileSize * 0.22], [centerX + tileSize * 0.06, centerY - tileSize * 0.04], [centerX - tileSize * 0.05, centerY + tileSize * 0.06], [centerX + tileSize * 0.06, centerY + tileSize * 0.22]], danger);
  } else if (trapType === "grindingGears") {
    for (const [gearX, gearY] of [[centerX - tileSize * 0.12, centerY], [centerX + tileSize * 0.12, centerY]] as const) {
      features.circle(gearX, gearY, tileSize * 0.16).stroke({ color: highlight, width: tileSize * 0.07 });
      features.circle(gearX, gearY, tileSize * 0.045).fill(metal);
    }
    line([[centerX - tileSize * 0.12, centerY - tileSize * 0.24], [centerX - tileSize * 0.12, centerY - tileSize * 0.16]], metal);
    line([[centerX + tileSize * 0.12, centerY + tileSize * 0.16], [centerX + tileSize * 0.12, centerY + tileSize * 0.24]], metal);
  } else if (trapType === "capturingChains") {
    for (const offsetX of [-0.13, 0, 0.13]) {
      features.ellipse(centerX + tileSize * offsetX, centerY, tileSize * 0.07, tileSize * 0.19).stroke({ color: highlight, width: tileSize * 0.06 });
    }
    line([[centerX - tileSize * 0.28, centerY], [centerX - tileSize * 0.2, centerY]], metal);
    line([[centerX + tileSize * 0.2, centerY], [centerX + tileSize * 0.28, centerY]], metal);
  } else if (trapType === "droppingCage") {
    features.rect(left + tileSize * 0.1, top + tileSize * 0.13, size - tileSize * 0.2, size * 0.7).stroke({ color: highlight, width: tileSize * 0.07 });
    for (const offsetX of [-0.12, 0, 0.12]) {
      line([[centerX + tileSize * offsetX, top + tileSize * 0.16], [centerX + tileSize * offsetX, top + size * 0.78]], metal, 0.045);
    }
    line([[centerX, top + tileSize * 0.02], [centerX, top + tileSize * 0.13]], danger);
  } else if (trapType === "counterweightTrapdoor") {
    features.rect(left + tileSize * 0.12, top + tileSize * 0.22, size * 0.58, size * 0.55).stroke({ color: highlight, width: tileSize * 0.07 });
    features.circle(left + size * 0.82, top + tileSize * 0.25, tileSize * 0.1).fill(danger);
    line([[left + size * 0.76, top + tileSize * 0.25], [left + size * 0.68, centerY], [centerX + tileSize * 0.08, centerY]], metal);
    arrow(centerX, centerY + tileSize * 0.06, centerX, centerY + tileSize * 0.25, danger);
  } else if (trapType === "floodedRoom") {
    features.rect(left + tileSize * 0.06, top + tileSize * 0.08, size * 0.86, size * 0.82)
      .stroke({ color: "#78c7e2", width: tileSize * 0.06 });
    for (const offsetY of [-0.12, 0, 0.12]) {
      line([
        [centerX - tileSize * 0.24, centerY + tileSize * offsetY],
        [centerX - tileSize * 0.12, centerY + tileSize * (offsetY - 0.04)],
        [centerX, centerY + tileSize * offsetY],
        [centerX + tileSize * 0.12, centerY + tileSize * (offsetY - 0.04)],
        [centerX + tileSize * 0.24, centerY + tileSize * offsetY],
      ], "#78c7e2", 0.045);
    }
  } else if (trapType === "floodedCorridor") {
    for (const offsetY of [-0.16, 0, 0.16]) {
      line([
        [left + tileSize * 0.04, centerY + tileSize * offsetY],
        [centerX - tileSize * 0.08, centerY + tileSize * (offsetY - 0.04)],
        [centerX + tileSize * 0.12, centerY + tileSize * offsetY],
        [left + size - tileSize * 0.04, centerY + tileSize * (offsetY - 0.04)],
      ], "#78c7e2", 0.05);
    }
    arrow(left + tileSize * 0.1, centerY + tileSize * 0.25, left + size - tileSize * 0.1, centerY + tileSize * 0.25, "#a9e3f2");
  } else if (trapType === "vacuumChamber") {
    features.circle(centerX, centerY, tileSize * 0.22).stroke({ color: "#b2b9e8", width: tileSize * 0.06 });
    for (const [x, y] of [[-0.24, 0], [0.24, 0], [0, -0.24], [0, 0.24]] as const) {
      arrow(centerX + tileSize * x, centerY + tileSize * y, centerX + tileSize * x * 0.55, centerY + tileSize * y * 0.55, "#b2b9e8");
    }
  } else if (trapType === "poisonGas") {
    for (const [x, y, radius] of [[-0.15, 0.1, 0.12], [0, -0.1, 0.15], [0.15, 0.1, 0.11]] as const) {
      features.circle(centerX + tileSize * x, centerY + tileSize * y, tileSize * radius).fill("#8bd17c");
    }
    for (const [x, y] of [[-0.2, -0.2], [0.18, -0.24], [0.25, 0.2]] as const) {
      features.circle(centerX + tileSize * x, centerY + tileSize * y, tileSize * 0.035).fill("#d6ef8d");
    }
  } else if (trapType === "hallucinogenicGas") {
    features.ellipse(centerX, centerY, tileSize * 0.27, tileSize * 0.17).stroke({ color: "#d7a4e8", width: tileSize * 0.06 });
    features.circle(centerX, centerY, tileSize * 0.09).fill("#a968cf");
    features.circle(centerX, centerY, tileSize * 0.035).fill("#f0c46d");
    line([[centerX - tileSize * 0.28, centerY - tileSize * 0.19], [centerX - tileSize * 0.2, centerY - tileSize * 0.27], [centerX - tileSize * 0.1, centerY - tileSize * 0.25]], "#d7a4e8", 0.05);
    line([[centerX + tileSize * 0.1, centerY + tileSize * 0.25], [centerX + tileSize * 0.22, centerY + tileSize * 0.26], [centerX + tileSize * 0.28, centerY + tileSize * 0.17]], "#d7a4e8", 0.05);
  } else if (trapType === "corrosiveCloud") {
    for (const [x, y, radius] of [[-0.16, 0.08, 0.1], [0, -0.08, 0.14], [0.16, 0.08, 0.1]] as const) {
      features.circle(centerX + tileSize * x, centerY + tileSize * y, tileSize * radius).stroke({ color: "#d0e879", width: tileSize * 0.06 });
    }
    for (const offsetX of [-0.16, 0, 0.16]) {
      line([[centerX + tileSize * offsetX, centerY + tileSize * 0.22], [centerX + tileSize * (offsetX - 0.04), centerY + tileSize * 0.3]], "#d0e879", 0.055);
    }
  } else if (trapType === "slipperyFloor") {
    line([[left + tileSize * 0.05, centerY + tileSize * 0.1], [centerX - tileSize * 0.12, centerY + tileSize * 0.1], [centerX - tileSize * 0.2, centerY - tileSize * 0.05]], "#a9e3f2", 0.07);
    line([[centerX - tileSize * 0.02, centerY - tileSize * 0.12], [centerX + tileSize * 0.12, centerY - tileSize * 0.12], [centerX + tileSize * 0.2, centerY + tileSize * 0.03]], "#a9e3f2", 0.07);
    arrow(centerX + tileSize * 0.04, centerY + tileSize * 0.22, centerX + tileSize * 0.24, centerY + tileSize * 0.22, highlight);
  } else if (trapType === "thinIceFloor") {
    features.rect(left + tileSize * 0.08, top + tileSize * 0.08, size * 0.84, size * 0.84)
      .stroke({ color: "#a9e3f2", width: tileSize * 0.05 });
    line([[centerX, top + tileSize * 0.12], [centerX - tileSize * 0.08, centerY - tileSize * 0.04], [centerX + tileSize * 0.03, centerY + tileSize * 0.05], [centerX - tileSize * 0.12, top + size * 0.86]], "#e4f8ff", 0.055);
    line([[centerX + tileSize * 0.03, centerY + tileSize * 0.05], [centerX + tileSize * 0.2, centerY + tileSize * 0.17]], "#e4f8ff", 0.05);
  } else if (trapType === "fallingRocks") {
    for (const offsetX of [-0.18, 0, 0.18]) {
      features.circle(centerX + tileSize * offsetX, top + tileSize * 0.2, tileSize * (offsetX === 0 ? 0.08 : 0.06)).fill("#b5a68e");
      arrow(centerX + tileSize * offsetX, top + tileSize * 0.32, centerX + tileSize * offsetX, centerY + tileSize * 0.2, danger);
    }
  } else if (trapType === "caveIn") {
    features.poly([
      left + tileSize * 0.04, top + size * 0.84,
      left + tileSize * 0.2, centerY + tileSize * 0.02,
      centerX - tileSize * 0.04, centerY + tileSize * 0.14,
      centerX + tileSize * 0.1, centerY - tileSize * 0.03,
      left + size - tileSize * 0.04, top + size * 0.84,
    ]).fill("#8b7967");
    line([[centerX - tileSize * 0.03, top + tileSize * 0.16], [centerX + tileSize * 0.04, centerY - tileSize * 0.03], [centerX - tileSize * 0.1, centerY + tileSize * 0.12]], danger, 0.07);
  } else if (trapType === "quicksand") {
    features.ellipse(centerX, centerY, tileSize * 0.26, tileSize * 0.17).stroke({ color: "#e1c17d", width: tileSize * 0.06 });
    features.ellipse(centerX, centerY, tileSize * 0.13, tileSize * 0.08).stroke({ color: "#d2a95b", width: tileSize * 0.05 });
    arrow(centerX, centerY - tileSize * 0.25, centerX, centerY - tileSize * 0.1, "#e1c17d");
  } else if (trapType === "undergroundCurrent") {
    for (const offsetY of [-0.16, 0, 0.16]) {
      arrow(left + tileSize * 0.08, centerY + tileSize * offsetY, left + size - tileSize * 0.08, centerY + tileSize * offsetY, "#a9e3f2");
    }
    line([[centerX - tileSize * 0.22, top + tileSize * 0.13], [centerX, top + tileSize * 0.08], [centerX + tileSize * 0.2, top + tileSize * 0.13]], "#78c7e2", 0.045);
  } else if (trapType === "overheatedChamber") {
    for (const offsetX of [-0.17, 0, 0.17]) {
      line([[centerX + tileSize * offsetX, top + size * 0.82], [centerX + tileSize * (offsetX - 0.07), centerY + tileSize * 0.1], [centerX + tileSize * (offsetX + 0.06), centerY - tileSize * 0.05], [centerX + tileSize * offsetX, top + tileSize * 0.15]], "#ff9b45", 0.075);
    }
  } else if (trapType === "freezingChamber") {
    for (const angle of [0, Math.PI / 3, Math.PI * 2 / 3]) {
      const dx = Math.cos(angle) * tileSize * 0.25;
      const dy = Math.sin(angle) * tileSize * 0.25;
      line([[centerX - dx, centerY - dy], [centerX + dx, centerY + dy]], "#bcecff", 0.055);
    }
    features.circle(centerX, centerY, tileSize * 0.04).fill("#e4f8ff");
  } else if (trapType === "electrifiedFloor") {
    features.rect(left + tileSize * 0.06, top + tileSize * 0.18, size * 0.88, size * 0.68)
      .stroke({ color: "#e9d76d", width: tileSize * 0.045 });
    line([[centerX + tileSize * 0.05, top + tileSize * 0.18], [centerX - tileSize * 0.1, centerY], [centerX + tileSize * 0.06, centerY], [centerX - tileSize * 0.04, top + size * 0.82]], "#fff29a", 0.09);
  } else if (trapType === "ceilingSpikes") {
    line([[left + tileSize * 0.04, top + tileSize * 0.17], [left + size - tileSize * 0.04, top + tileSize * 0.17]], metal, 0.06);
    for (const offsetX of [-0.18, 0, 0.18]) {
      line([[centerX + tileSize * offsetX - tileSize * 0.07, top + tileSize * 0.19], [centerX + tileSize * offsetX, centerY + tileSize * 0.02], [centerX + tileSize * offsetX + tileSize * 0.07, top + tileSize * 0.19]], danger, 0.07);
    }
    arrow(centerX, centerY + tileSize * 0.08, centerX, centerY + tileSize * 0.25, highlight);
  } else if (trapType === "lavaFloor") {
    line([[left + tileSize * 0.04, centerY - tileSize * 0.08], [left + size - tileSize * 0.04, centerY - tileSize * 0.08]], metal, 0.07);
    for (const offsetX of [-0.15, 0, 0.15]) {
      line([[centerX + tileSize * offsetX, centerY - tileSize * 0.08], [centerX + tileSize * offsetX, centerY + tileSize * 0.08]], metal, 0.045);
    }
    line([[left + tileSize * 0.05, centerY + tileSize * 0.18], [centerX - tileSize * 0.12, centerY + tileSize * 0.1], [centerX, centerY + tileSize * 0.2], [centerX + tileSize * 0.14, centerY + tileSize * 0.11], [left + size - tileSize * 0.05, centerY + tileSize * 0.18]], "#ff9b45", 0.07);
  } else if (trapType === "explosiveCrystals") {
    features.poly([
      centerX, top + tileSize * 0.12,
      centerX + tileSize * 0.1, centerY,
      centerX + tileSize * 0.04, top + size * 0.82,
      centerX - tileSize * 0.09, top + size * 0.82,
      centerX - tileSize * 0.12, centerY,
    ]).fill("#db9ce8").stroke({ color: "#f0c46d", width: tileSize * 0.035 });
    for (const [x, y] of [[-0.24, -0.2], [0.22, -0.18], [-0.23, 0.21], [0.24, 0.2]] as const) {
      line([[centerX + tileSize * x * 0.65, centerY + tileSize * y * 0.65], [centerX + tileSize * x, centerY + tileSize * y]], "#f0c46d", 0.055);
    }
  } else {
    const category = TRAP_DEFINITIONS[trapType].category;
    const color = `rgb(${TRAP_CATEGORY_COLORS[category].join(",")})`;
    if (category === "magical") {
      features.circle(centerX, centerY, tileSize * 0.23).stroke({ color, width: tileSize * 0.055 });
      line([[centerX, top + tileSize * 0.12], [centerX + tileSize * 0.08, centerY], [centerX, top + size * 0.88], [centerX - tileSize * 0.08, centerY], [centerX, top + tileSize * 0.12]], color, 0.055);
    } else if (category === "capture") {
      for (const offset of [-0.18, 0, 0.18]) {
        line([[centerX + tileSize * offset, top + tileSize * 0.16], [centerX + tileSize * offset, top + size * 0.84]], color, 0.045);
        line([[left + tileSize * 0.1, centerY + tileSize * offset], [left + size - tileSize * 0.1, centerY + tileSize * offset]], color, 0.045);
      }
    } else if (category === "deception") {
      features.ellipse(centerX, centerY, tileSize * 0.25, tileSize * 0.15).stroke({ color, width: tileSize * 0.055 });
      features.circle(centerX, centerY, tileSize * 0.07).fill(color);
    } else if (category === "motion") {
      features.circle(centerX, centerY, tileSize * 0.06).fill(color);
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        line([
          [centerX + Math.cos(angle) * tileSize * 0.12, centerY + Math.sin(angle) * tileSize * 0.12],
          [centerX + Math.cos(angle) * tileSize * 0.26, centerY + Math.sin(angle) * tileSize * 0.26],
        ], color, 0.055);
      }
    } else if (category === "biological") {
      line([[centerX, top + tileSize * 0.82], [centerX, top + tileSize * 0.18]], color, 0.065);
      line([[centerX, centerY], [centerX - tileSize * 0.19, centerY - tileSize * 0.14]], color, 0.055);
      line([[centerX, centerY + tileSize * 0.09], [centerX + tileSize * 0.19, centerY - tileSize * 0.06]], color, 0.055);
    } else if (category === "combat") {
      line([[centerX - tileSize * 0.2, centerY - tileSize * 0.2], [centerX + tileSize * 0.2, centerY + tileSize * 0.2]], color, 0.09);
      line([[centerX - tileSize * 0.2, centerY + tileSize * 0.2], [centerX + tileSize * 0.2, centerY - tileSize * 0.2]], color, 0.09);
    } else if (category === "complex") {
      features.circle(centerX, centerY, tileSize * 0.2).stroke({ color, width: tileSize * 0.05 });
      features.circle(centerX, centerY, tileSize * 0.07).fill(color);
      line([[centerX - tileSize * 0.27, centerY], [centerX + tileSize * 0.27, centerY]], color, 0.04);
    } else {
      features.poly([
        centerX, top + tileSize * 0.16,
        centerX + tileSize * 0.22, centerY,
        centerX, top + size * 0.84,
        centerX - tileSize * 0.22, centerY,
      ]).fill(color);
    }
  }
}

function createTrapSvgFeature(trapType: TrapType, tileX: number, tileY: number, tileSize: number): string {
  const [red, green, blue] = getTileColor(TRAP_DEFINITIONS[trapType].tile);
  const glyphs: Partial<Record<TrapType, string>> = {
    hiddenPit: '<circle cx=".5" cy=".5" r=".22" fill="#080c10" stroke="#f0c46d" stroke-width=".07"/><path d="M.36 .36L.64 .64" stroke="#d1d1c5" stroke-width=".045"/>',
    spikedPit: '<circle cx=".5" cy=".5" r=".23" fill="#080c10" stroke="#e36b48" stroke-width=".06"/><path d="M.5 .5V.27M.5 .5V.73M.5 .5H.27M.5 .5H.73" stroke="#d1d1c5" stroke-width=".07"/>',
    falseFloor: '<path d="M.22 .24L.5 .5L.77 .76M.5 .5L.62 .31L.76 .37M.5 .5L.42 .76" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    wallBlades: '<path d="M.24 .5H.43M.76 .5H.57" stroke="#e36b48" stroke-width=".08"/><path d="M.37 .43L.45 .5L.37 .57M.63 .43L.55 .5L.63 .57" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    pendulumBlade: '<path d="M.5 .22L.67 .53" stroke="#d1d1c5" stroke-width=".07"/><circle cx=".5" cy=".2" r=".06" fill="#f0c46d"/><path d="M.58 .49L.76 .59L.56 .64Z" fill="#e36b48"/>',
    spinningBlades: '<circle cx=".5" cy=".5" r=".08" fill="#f0c46d"/><path d="M.29 .29L.71 .71M.29 .71L.71 .29" stroke="#d1d1c5" stroke-width=".09"/>',
    poisonDarts: '<path d="M.25 .34H.72M.25 .5H.72M.25 .66H.72M.63 .27L.72 .34L.63 .41M.63 .43L.72 .5L.63 .57M.63 .59L.72 .66L.63 .73" fill="none" stroke="#8bd17c" stroke-width=".06"/>',
    wallArrows: '<path d="M.25 .5H.72M.63 .41L.72 .5L.63 .59" fill="none" stroke="#f0c46d" stroke-width=".08"/><rect x=".18" y=".39" width=".08" height=".22" fill="#87939b"/>',
    hiddenHarpoons: '<path d="M.22 .5H.62L.77 .37M.62 .5L.75 .63M.25 .36V.64" fill="none" stroke="#d1d1c5" stroke-width=".07"/>',
    ceilingPress: '<rect x=".24" y=".2" width=".52" height=".15" fill="#9da4a5"/><path d="M.39 .42V.7M.61 .42V.7M.34 .62L.39 .7L.44 .62M.56 .62L.61 .7L.66 .62" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    crushingWalls: '<rect x=".22" y=".28" width=".13" height=".44" fill="#9da4a5"/><rect x=".65" y=".28" width=".13" height=".44" fill="#9da4a5"/><path d="M.4 .5H.49M.6 .5H.51M.44 .44L.5 .5L.44 .56M.56 .44L.5 .5L.56 .56" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    guillotineDoor: '<path d="M.28 .24H.72M.5 .25V.57M.38 .58L.5 .73L.62 .58" fill="none" stroke="#d1d1c5" stroke-width=".08"/><path d="M.5 .31V.51M.45 .45L.5 .51L.55 .45" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    retractableStairs: '<path d="M.25 .65H.39V.55H.52V.45H.65M.72 .3V.66M.66 .58L.72 .66L.78 .58" fill="none" stroke="#f0c46d" stroke-width=".07"/>',
    destructibleBridge: '<path d="M.22 .34H.45M.55 .34H.78M.22 .5H.45M.55 .5H.78M.22 .66H.45M.55 .66H.78M.46 .29L.55 .45L.47 .54L.56 .72" fill="none" stroke="#d1d1c5" stroke-width=".06"/><path d="M.46 .29L.55 .45L.47 .54L.56 .72" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    grindingGears: '<circle cx=".4" cy=".5" r=".16" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".62" cy=".5" r=".16" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".4" cy=".5" r=".04" fill="#d1d1c5"/><circle cx=".62" cy=".5" r=".04" fill="#d1d1c5"/><path d="M.4 .28V.34M.4 .66V.72M.62 .28V.34M.62 .66V.72" stroke="#d1d1c5" stroke-width=".06"/>',
    capturingChains: '<ellipse cx=".34" cy=".5" rx=".07" ry=".19" fill="none" stroke="#f0c46d" stroke-width=".06"/><ellipse cx=".5" cy=".5" rx=".07" ry=".19" fill="none" stroke="#d1d1c5" stroke-width=".06"/><ellipse cx=".66" cy=".5" rx=".07" ry=".19" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    droppingCage: '<path d="M.28 .34H.72V.72H.28ZM.5 .2V.34M.37 .36V.7M.5 .36V.7M.63 .36V.7" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    counterweightTrapdoor: '<rect x=".29" y=".37" width=".34" height=".34" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".72" cy=".31" r=".09" fill="#e36b48"/><path d="M.68 .37L.59 .5H.5M.5 .51V.64M.45 .59L.5 .65L.55 .59" fill="none" stroke="#d1d1c5" stroke-width=".06"/>',
    floodedRoom: '<rect x=".23" y=".22" width=".54" height=".56" fill="none" stroke="#78c7e2" stroke-width=".06"/><path d="M.28 .47Q.36 .4 .44 .47T.6 .47T.76 .47M.28 .61Q.36 .54 .44 .61T.6 .61T.76 .61" fill="none" stroke="#a9e3f2" stroke-width=".06"/>',
    floodedCorridor: '<path d="M.23 .36Q.31 .29 .39 .36T.55 .36T.71 .36M.23 .5Q.31 .43 .39 .5T.55 .5T.71 .5M.23 .64Q.31 .57 .39 .64T.55 .64T.71 .64M.3 .76H.7M.63 .69L.7 .76L.63 .83" fill="none" stroke="#78c7e2" stroke-width=".06"/>',
    vacuumChamber: '<circle cx=".5" cy=".5" r=".2" fill="none" stroke="#b2b9e8" stroke-width=".06"/><path d="M.23 .5H.39M.77 .5H.61M.5 .23V.39M.5 .77V.61M.34 .45L.39 .5L.34 .55M.66 .45L.61 .5L.66 .55M.45 .34L.5 .39L.55 .34M.45 .66L.5 .61L.55 .66" fill="none" stroke="#b2b9e8" stroke-width=".05"/>',
    poisonGas: '<circle cx=".35" cy=".56" r=".13" fill="#8bd17c"/><circle cx=".5" cy=".42" r=".17" fill="#8bd17c"/><circle cx=".66" cy=".56" r=".12" fill="#8bd17c"/><circle cx=".32" cy=".29" r=".035" fill="#d6ef8d"/><circle cx=".7" cy=".3" r=".04" fill="#d6ef8d"/>',
    hallucinogenicGas: '<path d="M.22 .5Q.5 .2 .78 .5Q.5 .8 .22 .5Z" fill="none" stroke="#d7a4e8" stroke-width=".06"/><circle cx=".5" cy=".5" r=".11" fill="#a968cf"/><circle cx=".5" cy=".5" r=".04" fill="#f0c46d"/><path d="M.29 .28Q.42 .18 .53 .25M.49 .74Q.62 .82 .73 .7" fill="none" stroke="#d7a4e8" stroke-width=".05"/>',
    corrosiveCloud: '<circle cx=".35" cy=".5" r=".12" fill="none" stroke="#d0e879" stroke-width=".06"/><circle cx=".5" cy=".42" r=".16" fill="none" stroke="#d0e879" stroke-width=".06"/><circle cx=".66" cy=".5" r=".11" fill="none" stroke="#d0e879" stroke-width=".06"/><path d="M.35 .66L.31 .74M.5 .64L.46 .75M.65 .65L.61 .74" stroke="#d0e879" stroke-width=".06"/>',
    slipperyFloor: '<path d="M.22 .4H.4L.34 .33M.78 .58H.6L.66 .65M.28 .72H.7M.62 .66L.7 .72L.62 .78" fill="none" stroke="#a9e3f2" stroke-width=".07"/>',
    thinIceFloor: '<rect x=".23" y=".23" width=".54" height=".54" fill="none" stroke="#a9e3f2" stroke-width=".05"/><path d="M.51 .24L.44 .45L.54 .51L.39 .75M.53 .51L.72 .62" fill="none" stroke="#e4f8ff" stroke-width=".06"/>',
    fallingRocks: '<circle cx=".33" cy=".27" r=".07" fill="#b5a68e"/><circle cx=".5" cy=".23" r=".09" fill="#b5a68e"/><circle cx=".68" cy=".28" r=".06" fill="#b5a68e"/><path d="M.33 .38V.69M.5 .37V.72M.68 .38V.66M.28 .63L.33 .7L.38 .63M.45 .66L.5 .73L.55 .66M.63 .6L.68 .67L.73 .6" fill="none" stroke="#e36b48" stroke-width=".06"/>',
    caveIn: '<path d="M.22 .72L.36 .48L.47 .58L.58 .36L.78 .72Z" fill="#8b7967" stroke="#d1d1c5" stroke-width=".04"/><path d="M.49 .27L.55 .39L.46 .49L.53 .56" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    quicksand: '<ellipse cx=".5" cy=".52" rx=".26" ry=".17" fill="none" stroke="#e1c17d" stroke-width=".06"/><ellipse cx=".5" cy=".52" rx=".14" ry=".08" fill="none" stroke="#d2a95b" stroke-width=".05"/><path d="M.5 .22V.39M.45 .33L.5 .39L.55 .33" fill="none" stroke="#e1c17d" stroke-width=".06"/>',
    undergroundCurrent: '<path d="M.22 .35H.76M.68 .28L.76 .35L.68 .42M.22 .5H.76M.68 .43L.76 .5L.68 .57M.22 .65H.76M.68 .58L.76 .65L.68 .72" fill="none" stroke="#a9e3f2" stroke-width=".06"/>',
    overheatedChamber: '<path d="M.32 .76L.39 .58L.44 .65L.5 .37L.56 .55L.62 .46L.68 .76M.42 .76L.47 .65L.5 .7L.54 .61L.59 .76" fill="none" stroke="#ff9b45" stroke-width=".07"/>',
    freezingChamber: '<path d="M.5 .23V.77M.27 .37L.73 .63M.27 .63L.73 .37M.43 .3L.5 .37L.57 .3M.43 .7L.5 .63L.57 .7M.3 .43L.37 .37L.36 .29M.7 .57L.63 .63L.64 .71M.3 .57L.37 .63L.36 .71M.7 .43L.63 .37L.64 .29" fill="none" stroke="#bcecff" stroke-width=".05"/>',
    electrifiedFloor: '<rect x=".23" y=".28" width=".54" height=".44" fill="none" stroke="#e9d76d" stroke-width=".05"/><path d="M.55 .28L.42 .49H.53L.45 .72L.65 .45H.54Z" fill="#fff29a" stroke="#fff29a" stroke-width=".04"/>',
    ceilingSpikes: '<path d="M.23 .28H.77M.31 .29L.39 .55L.47 .29M.46 .29L.54 .55L.62 .29M.61 .29L.69 .55L.77 .29M.5 .61V.78M.45 .72L.5 .78L.55 .72" fill="none" stroke="#e36b48" stroke-width=".06"/>',
    lavaFloor: '<path d="M.22 .35H.78M.32 .35V.55M.5 .35V.55M.68 .35V.55M.22 .64Q.31 .55 .4 .64T.58 .64T.76 .64M.22 .75Q.31 .66 .4 .75T.58 .75T.76 .75" fill="none" stroke="#ff9b45" stroke-width=".06"/>',
    explosiveCrystals: '<path d="M.5 .23L.61 .45L.56 .72L.43 .72L.38 .45ZM.3 .38L.38 .47L.34 .62L.26 .61ZM.7 .37L.75 .47L.7 .62L.62 .53Z" fill="#db9ce8" stroke="#f0c46d" stroke-width=".045"/><path d="M.22 .22L.29 .29M.71 .22L.78 .29M.2 .75L.27 .69M.73 .69L.8 .75" stroke="#f0c46d" stroke-width=".055"/>',
  };
  const category = TRAP_DEFINITIONS[trapType].category;
  const color = `rgb(${TRAP_CATEGORY_COLORS[category].join(",")})`;
  const categoryGlyphs: Record<TrapCategory, string> = {
    mechanical: '<path d="M.5 .27V.73M.27 .5H.73M.34 .34L.66 .66M.34 .66L.66 .34" stroke="CURRENT" stroke-width=".06"/>',
    environmental: '<path d="M.5 .76V.27M.5 .48L.34 .34M.5 .57L.67 .41" fill="none" stroke="CURRENT" stroke-width=".07"/>',
    magical: '<circle cx=".5" cy=".5" r=".22" fill="none" stroke="CURRENT" stroke-width=".05"/><path d="M.5 .26L.57 .44L.75 .5L.57 .56L.5 .74L.43 .56L.25 .5L.43 .44Z" fill="none" stroke="CURRENT" stroke-width=".05"/>',
    capture: '<path d="M.32 .25V.75M.5 .25V.75M.68 .25V.75M.25 .35H.75M.25 .5H.75M.25 .65H.75" stroke="CURRENT" stroke-width=".045"/>',
    deception: '<path d="M.22 .5Q.5 .22 .78 .5Q.5 .78 .22 .5Z" fill="none" stroke="CURRENT" stroke-width=".055"/><circle cx=".5" cy=".5" r=".08" fill="CURRENT"/>',
    motion: '<circle cx=".5" cy=".5" r=".06" fill="CURRENT"/><path d="M.5 .22V.36M.5 .64V.78M.22 .5H.36M.64 .5H.78" stroke="CURRENT" stroke-width=".06"/>',
    biological: '<path d="M.5 .76V.25M.5 .48L.3 .31M.5 .58L.7 .4" fill="none" stroke="CURRENT" stroke-width=".07"/>',
    combat: '<path d="M.3 .3L.7 .7M.3 .7L.7 .3" stroke="CURRENT" stroke-width=".09"/>',
    complex: '<circle cx=".5" cy=".5" r=".22" fill="none" stroke="CURRENT" stroke-width=".05"/><circle cx=".5" cy=".5" r=".07" fill="CURRENT"/><path d="M.5 .2V.28M.5 .72V.8M.2 .5H.28M.72 .5H.8" stroke="CURRENT" stroke-width=".05"/>',
  };
  const glyph = glyphs[trapType] ?? categoryGlyphs[category].replace(/CURRENT/g, color);
  return `<g transform="translate(${tileX} ${tileY}) scale(${tileSize})" stroke-linecap="round" stroke-linejoin="round"><rect width="1" height="1" fill="rgb(${red},${green},${blue})"/><rect x=".16" y=".16" width=".68" height=".68" rx=".07" fill="#1c2329" stroke="#9b8055" stroke-width=".05"/>${glyph}</g>`;
}

function createCaveLiquidSvgFeature(tile: Tile, tileX: number, tileY: number, tileSize: number): string {
  const isWater = CAVE_WATER_TILES.has(tile);
  const fill = isWater ? "#287fa6" : "#d44823";
  const border = isWater ? "#78c7e2" : "#ff9b45";
  const mark = tile === CAVE_WATERFALL_TILE || tile === CAVE_LAVA_FALL_TILE
    ? `<path d="M.32 .16L.26 .44L.38 .7M.5 .16L.44 .44L.56 .7M.68 .16L.62 .44L.74 .7" fill="none" stroke="${isWater ? "#b9eff8" : "#ffd27a"}" stroke-width=".07"/>`
    : tile === CAVE_SPRING_TILE || tile === CAVE_LAVA_VENT_TILE
      ? `<circle cx=".5" cy=".52" r=".17" fill="${isWater ? "#c8f4fa" : "#ffd27a"}" stroke="#fff0b0" stroke-width=".05"/><path d="M.5 .32V.16M.3 .45L.2 .37M.7 .45L.8 .37" fill="none" stroke="${isWater ? "#d9faff" : "#ffb14d"}" stroke-width=".05"/>`
      : tile === CAVE_WATER_TILE
        ? `<path d="M.24 .38H.76M.3 .62Q.4 .54 .5 .62T.7 .62" fill="none" stroke="#a9e3f2" stroke-width=".05"/>`
        : `<path d="M.2 .68L.4 .36L.58 .62L.8 .28" fill="none" stroke="#ffd27a" stroke-width=".08"/>`;
  return `<g transform="translate(${tileX} ${tileY}) scale(${tileSize})" stroke-linecap="round" stroke-linejoin="round"><rect x=".08" y=".08" width=".84" height=".84" fill="${fill}" stroke="${border}" stroke-width=".05"/>${mark}</g>`;
}

function createCorridorTrapNumberSvgLabel(
  trap: NumberedCorridorTrap,
  tileSize: number,
): string {
  const centerX = (trap.x + 0.5) * tileSize;
  const centerY = (trap.y + 0.5) * tileSize;
  const badgeWidth = Math.max(14, Math.min(20, tileSize * 0.9));
  const badgeHeight = Math.max(12, Math.min(16, tileSize * 0.85));
  return [
    `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight * 0.25}" fill="#8e4032" stroke="#f0a36f" stroke-width="${Math.max(1, tileSize * 0.06)}"/>`,
    `<text x="${centerX}" y="${centerY}" fill="#fff1df" font-family="DM Mono, monospace" font-size="${Math.min(9, Math.max(7, tileSize * 0.5))}" font-weight="600" text-anchor="middle" dominant-baseline="central">${trap.number.toString().padStart(2, "0")}</text>`,
  ].join("");
}

export function createDungeonSvg(dungeon: Dungeon): string {
  const tileSize = getExportTileSize(dungeon);
  const inset = Math.max(1, tileSize * 0.09);
  const width = dungeon.width * tileSize;
  const height = dungeon.height * tileSize;
  const roomCategories = createRoomCategoryGrid(dungeon);

  if (dungeon.width * dungeon.height > RASTER_SVG_TILE_THRESHOLD) {
    const tileImage = createDungeonTileCanvas(dungeon, true, true, roomCategories).toDataURL("image/png");
    const roomLabels = tileSize >= 8
      ? dungeon.roomDetails.map((room) => {
        const centerX = (room.x + room.width / 2) * tileSize;
        const centerY = (room.y + room.height / 2) * tileSize;
        const badgeWidth = Math.min(20, tileSize * 1.5);
        const badgeHeight = Math.min(16, tileSize * 1.4);
        const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
        return [
          `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${category.color}"/>`,
          `<text x="${centerX}" y="${centerY}" fill="#10141b" font-family="DM Mono, monospace" font-size="${Math.min(9, tileSize * 0.75)}" text-anchor="middle" dominant-baseline="central">${room.number.toString().padStart(2, "0")}</text>`,
        ].join("");
      }).join("")
      : "";
    const corridorTrapLabels = tileSize >= 8
      ? getNumberedCorridorTraps(dungeon).map((trap) => createCorridorTrapNumberSvgLabel(trap, tileSize)).join("")
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Mapa de masmorra</title><image width="${width}" height="${height}" href="${tileImage}" image-rendering="pixelated"/>${roomLabels}${corridorTrapLabels}</svg>`;
  }

  const elements = [`<rect width="${width}" height="${height}" fill="#0b1017"/>`];

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = dungeon.tiles[y][x];
      const tileX = x * tileSize;
      const tileY = y * tileSize;
      const category = roomCategories[y][x];
      const roomFloorColor = category ? ROOM_TYPE_CATEGORIES[category].color : "#d1b987";
      const rect = (rx: number, ry: number, rw: number, rh: number, fill: string, extra = "") =>
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" ${extra}/>`;

      if (tile === 0) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#17212c"));
      } else if (tile === 2) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#a9824d"));
      } else if (tile === DOOR_TILE) {
        const doorX = tileX + tileSize * 0.18;
        const doorY = tileY + tileSize * 0.12;
        const doorWidth = tileSize * 0.64;
        const doorHeight = tileSize * 0.76;
        elements.push(rect(
          doorX,
          doorY,
          doorWidth,
          doorHeight,
          "#775334",
          `stroke="#d6aa66" stroke-width="${Math.max(0.7, tileSize * 0.08)}"`,
        ));
        elements.push(`<circle cx="${doorX + doorWidth * 0.72}" cy="${doorY + doorHeight * 0.52}" r="${Math.max(0.7, tileSize * 0.06)}" fill="#f0cf87"/>`);
      } else if (tile === SECRET_DOOR_TILE) {
        const doorX = tileX + tileSize * 0.12;
        const doorY = tileY + tileSize * 0.12;
        const doorSize = tileSize * 0.76;
        elements.push(rect(
          doorX,
          doorY,
          doorSize,
          doorSize,
          "#17212c",
          `stroke="#596671" stroke-width="${Math.max(0.7, tileSize * 0.06)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.5} ${tileY + tileSize * 0.28} V ${tileY + tileSize * 0.72}" stroke="#87919a" stroke-width="${Math.max(0.7, tileSize * 0.06)}"/>`);
      } else if (tile === EXTERIOR_ENTRANCE_TILE) {
        elements.push(rect(
          tileX + tileSize * 0.2,
          tileY + tileSize * 0.14,
          tileSize * 0.6,
          tileSize * 0.72,
          "#775334",
          `stroke="#f0cf87" stroke-width="${Math.max(0.8, tileSize * 0.09)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.5} ${tileY + tileSize * 0.3} V ${tileY + tileSize * 0.7}" stroke="#f0cf87" stroke-width="${Math.max(0.7, tileSize * 0.07)}"/>`);
      } else if (tile === EXTERIOR_CONNECTION_TILE) {
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.31}" fill="#17212c" stroke="#c5e1c7" stroke-width="${Math.max(0.8, tileSize * 0.1)}"/>`);
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.12}" fill="#c5e1c7"/>`);
      } else if (tile === PILLAR_TILE) {
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.34}" fill="#625d50" stroke="#292b2a" stroke-width="${Math.max(0.8, tileSize * 0.08)}"/>`);
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.19}" fill="#c1b49c" stroke="#e2d3b6" stroke-width="${Math.max(0.6, tileSize * 0.05)}"/>`);
      } else if (tile === ELEVATED_FLOOR_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, category ? roomFloorColor : "#d5b882"));
        elements.push(rect(
          tileX + tileSize * 0.16,
          tileY + tileSize * 0.16,
          tileSize * 0.68,
          tileSize * 0.68,
          "none",
          `stroke="#f0cf87" stroke-width="${Math.max(0.6, tileSize * 0.07)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.38} H ${tileX + tileSize * 0.76} M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.62} H ${tileX + tileSize * 0.76}" fill="none" stroke="#80643e" stroke-width="${Math.max(0.6, tileSize * 0.06)}"/>`);
      } else if (tile === ROOM_STAIRS_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#a9824d"));
        elements.push(`<path d="M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.28} H ${tileX + tileSize * 0.82} M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.5} H ${tileX + tileSize * 0.82} M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.72} H ${tileX + tileSize * 0.82}" stroke="#17212c" stroke-width="${Math.max(0.7, tileSize * 0.1)}"/>`);
      } else if (tile === CAVE_TILE) {
        const fill = isOpenCaveConnection(dungeon, roomCategories, x, y) ? "#879a70" : "#4c6953";
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, fill));
      } else if (tile === CAVE_CONNECTION_WALL_TILE) {
        elements.push(rect(
          tileX + tileSize * 0.12,
          tileY + tileSize * 0.12,
          tileSize * 0.76,
          tileSize * 0.76,
          "#725631",
          `stroke="#f0c574" stroke-width="${Math.max(0.8, tileSize * 0.08)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.52} ${tileY + tileSize * 0.2} L ${tileX + tileSize * 0.42} ${tileY + tileSize * 0.42} L ${tileX + tileSize * 0.56} ${tileY + tileSize * 0.56} L ${tileX + tileSize * 0.43} ${tileY + tileSize * 0.8}" fill="none" stroke="#f5d992" stroke-width="${Math.max(0.7, tileSize * 0.07)}"/>`);
      } else if (tile === CAVE_BREACH_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#998058"));
        elements.push(`<path d="M ${tileX + tileSize * 0.16} ${tileY + tileSize * 0.7}L ${tileX + tileSize * 0.26} ${tileY + tileSize * 0.55}L ${tileX + tileSize * 0.44} ${tileY + tileSize * 0.75}L ${tileX + tileSize * 0.52} ${tileY + tileSize * 0.48}L ${tileX + tileSize * 0.82} ${tileY + tileSize * 0.72}" fill="#806b49" stroke="#ead4a6" stroke-width="${Math.max(0.6, tileSize * 0.04)}"/>`);
      } else if (CAVE_WATER_TILES.has(tile) || CAVE_LAVA_TILES.has(tile)) {
        elements.push(createCaveLiquidSvgFeature(tile, tileX, tileY, tileSize));
      } else if (tile === WATER_TILE) {
        const waterInset = tileSize * 0.08;
        elements.push(rect(
          tileX + waterInset,
          tileY + waterInset,
          tileSize - waterInset,
          tileSize - waterInset,
          "#287fa6",
          `stroke="#78c7e2" stroke-width="${Math.max(0.6, tileSize * 0.05)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.38} H ${tileX + tileSize * 0.76}" stroke="#a9e3f2" stroke-width="${Math.max(0.6, tileSize * 0.05)}"/>`);
      } else if (tile === LAVA_TILE) {
        const lavaInset = tileSize * 0.08;
        elements.push(rect(
          tileX + lavaInset,
          tileY + lavaInset,
          tileSize - lavaInset,
          tileSize - lavaInset,
          "#d44823",
          `stroke="#ff9b45" stroke-width="${Math.max(0.6, tileSize * 0.06)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.2} ${tileY + tileSize * 0.68} L ${tileX + tileSize * 0.4} ${tileY + tileSize * 0.36} L ${tileX + tileSize * 0.58} ${tileY + tileSize * 0.62} L ${tileX + tileSize * 0.8} ${tileY + tileSize * 0.28}" fill="none" stroke="#ffd27a" stroke-width="${Math.max(0.6, tileSize * 0.08)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE) {
        elements.push(rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset, "#c7a86c"));
        const isAscending = tile === STAIRS_UP_TILE;
        const treads = [0.26, 0.42, 0.58, 0.74]
          .map((lineY) => `M ${tileX + tileSize * 0.12} ${tileY + tileSize * lineY} H ${tileX + tileSize * 0.5}`)
          .join(" ");
        const shaftStartY = isAscending ? 0.76 : 0.24;
        const shaftEndY = isAscending ? 0.24 : 0.76;
        const arrowBaseY = isAscending ? 0.44 : 0.56;
        const arrow = `M ${tileX + tileSize * 0.76} ${tileY + tileSize * shaftStartY} V ${tileY + tileSize * shaftEndY} M ${tileX + tileSize * 0.58} ${tileY + tileSize * arrowBaseY} L ${tileX + tileSize * 0.76} ${tileY + tileSize * shaftEndY} L ${tileX + tileSize * 0.94} ${tileY + tileSize * arrowBaseY}`;
        elements.push(
          `<path d="${treads} ${arrow}" fill="none" stroke="#17212c" stroke-width="${Math.max(0.8, tileSize * 0.1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      } else {
        const trapType = TRAP_TYPES.find((type) => TRAP_DEFINITIONS[type].tile === tile);
        if (trapType) {
          elements.push(createTrapSvgFeature(trapType, tileX, tileY, tileSize));
        } else {
          elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, roomFloorColor));
        }
      }
    }
  }

  for (const room of dungeon.roomDetails) {
    const centerX = (room.x + room.width / 2) * tileSize;
    const centerY = (room.y + room.height / 2) * tileSize;
    const badgeWidth = Math.max(14, Math.min(20, tileSize * 1.1));
    const badgeHeight = Math.max(12, Math.min(16, tileSize * 0.95));
    const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
    elements.push(
      `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${category.color}"/>`,
    );
    elements.push(
      `<text x="${centerX}" y="${centerY}" fill="#10141b" font-family="DM Mono, monospace" font-size="8" text-anchor="middle" dominant-baseline="central">${room.number.toString().padStart(2, "0")}</text>`,
    );
  }
  for (const trap of getNumberedCorridorTraps(dungeon)) {
    elements.push(createCorridorTrapNumberSvgLabel(trap, tileSize));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Mapa de masmorra</title>${elements.join("")}</svg>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DungeonExportControl({ dungeon }: DungeonExportControlProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const exportDungeon = async (format: "svg" | "png") => {
    const filename = `masmorra-${dungeon.width}x${dungeon.height}`;
    try {
      const svgBlob = new Blob([createDungeonSvg(dungeon)], {
        type: "image/svg+xml;charset=utf-8",
      });
      if (format === "svg") {
        downloadBlob(svgBlob, `${filename}.svg`);
      } else {
        const imageUrl = URL.createObjectURL(svgBlob);
        try {
          const image = new Image();
          image.src = imageUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          const tileSize = getExportTileSize(dungeon);
          canvas.width = Math.ceil(dungeon.width * tileSize);
          canvas.height = Math.ceil(dungeon.height * tileSize);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a imagem PNG.");
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0);
          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Não foi possível gerar a imagem PNG."));
            }, "image/png");
          });
          downloadBlob(pngBlob, `${filename}.png`);
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      }
      setExportStatus(`${format.toUpperCase()} exportado.`);
      setExportMenuOpen(false);
    } catch (error) {
      console.error(`Não foi possível exportar o mapa em ${format.toUpperCase()}.`, error);
      setExportStatus(`Falha ao exportar ${format.toUpperCase()}.`);
    }
  };

  return (
    <div className="map-export">
      <button
        className="map-control-button export-trigger"
        type="button"
        aria-expanded={exportMenuOpen}
        aria-haspopup="menu"
        onClick={() => setExportMenuOpen((open) => !open)}
      >
        Exportar <span aria-hidden="true">⌄</span>
      </button>
      {exportMenuOpen && (
        <div className="export-menu" role="menu" aria-label="Formato de exportação">
          <button type="button" role="menuitem" onClick={() => void exportDungeon("svg")}>
            Baixar SVG
          </button>
          <button type="button" role="menuitem" onClick={() => void exportDungeon("png")}>
            Baixar PNG
          </button>
        </div>
      )}
      {exportStatus && !exportMenuOpen && <span className="export-status" role="status">{exportStatus}</span>}
    </div>
  );
}

export default function DungeonCanvas({
  dungeon,
  generationKey,
  focusRequest,
  onRoomMove,
  onRoomSelect,
  onRoomMoveEnd,
  onClearSelection,
  showWater,
  showLava,
  onToggleWater,
  onToggleLava,
}: DungeonCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);
  const roomCategories = useMemo(() => createRoomCategoryGrid(dungeon), [dungeon]);
  const rasterizedMap = useMemo(
    () => createDungeonTileCanvas(dungeon, showWater, showLava, roomCategories),
    [dungeon, roomCategories, showLava, showWater],
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [moveMode, setMoveMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoveredMapTarget, setHoveredMapTarget] = useState<MapTarget | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<CanvasDrag | null>(null);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [generationKey]);

  useEffect(() => {
    if (!app) return;
    if (!focusRequest) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    if (!focusRequest.shouldFocus) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const room = dungeon.roomDetails.find((candidate) => candidate.number === focusRequest.roomNumber);
    if (!room) return;
    const tileSize = Math.min(
      17,
      (app.screen.width - 48) / dungeon.width,
      (app.screen.height - 48) / dungeon.height,
    );
    if (tileSize <= 0) return;

    const targetX = room.x + room.width / 2;
    const targetY = room.y + room.height / 2;
    const targetWidth = room.width;
    const targetHeight = room.height;
    const focusZoom = clampZoom(Math.min(
      8,
      app.screen.width / ((targetWidth + 2) * tileSize),
      app.screen.height / ((targetHeight + 2) * tileSize),
    ));
    setZoom(focusZoom);
    setPan({
      x: (dungeon.width * tileSize / 2 - targetX * tileSize) * focusZoom,
      y: (dungeon.height * tileSize / 2 - targetY * tileSize) * focusZoom,
    });
  }, [app, generationKey, focusRequest]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const application = new Application();

    void application
      .init({
        background: "#0b1017",
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: host,
      })
      .then(() => {
        if (disposed) {
          application.destroy({ removeView: true }, { children: true });
          return;
        }
        application.canvas.className = "dungeon-canvas";
        host.appendChild(application.canvas);
        setApp(application);
      })
      .catch((error: unknown) => {
        console.error("Não foi possível inicializar a visualização PixiJS.", error);
      });

    return () => {
      disposed = true;
      if (application.renderer) {
        application.destroy({ removeView: true }, { children: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!app) return;

    const draw = () => {
      const stage = app.stage;
      if (!app.renderer || !stage) return;
      for (const child of stage.removeChildren()) {
        child.destroy({ children: true, texture: true, textureSource: true });
      }
      const map = new Container();
      const roomLabels = new Container();
      const tileSize = Math.min(
        17,
        (app.screen.width - 48) / dungeon.width,
        (app.screen.height - 48) / dungeon.height,
      );
      if (tileSize <= 0) return;

      const mapWidth = tileSize * dungeon.width;
      const mapHeight = tileSize * dungeon.height;
      const useRasterBase = tileSize < 2.5;
      const showFeatures = tileSize * zoom >= 2.5;
      map.scale.set(zoom);
      const panLimitX = Math.max(0, (mapWidth * zoom - app.screen.width) / 2 + tileSize);
      const panLimitY = Math.max(0, (mapHeight * zoom - app.screen.height) / 2 + tileSize);
      const panX = Math.max(-panLimitX, Math.min(pan.x, panLimitX));
      const panY = Math.max(-panLimitY, Math.min(pan.y, panLimitY));
      map.x = Math.floor((app.screen.width - mapWidth * zoom) / 2 + panX);
      map.y = Math.floor((app.screen.height - mapHeight * zoom) / 2 + panY);

      const walls = new Graphics();
      const floors = new Graphics();
      const corridors = new Graphics();
      const features = new Graphics();
      if (useRasterBase) {
        const sprite = Sprite.from(rasterizedMap, true);
        sprite.width = mapWidth;
        sprite.height = mapHeight;
        map.addChild(sprite);
      }
      for (let y = 0; y < dungeon.height; y += 1) {
        for (let x = 0; x < dungeon.width; x += 1) {
          const tile = getVisibleTile(dungeon.tiles[y][x], showWater, showLava);
          const tileX = x * tileSize;
          const tileY = y * tileSize;
          const category = roomCategories[y][x];
          const roomFloorColor = category ? ROOM_TYPE_CATEGORIES[category].color : "#d1b987";
          if (useRasterBase) {
            if (showFeatures) {
              drawTileFeature(
                features,
                tile,
                tileX,
                tileY,
                tileSize,
                tile === 0 ? getWallEdges(dungeon.tiles, x, y) : [],
                tile === CAVE_TILE && isOpenCaveConnection(dungeon, roomCategories, x, y),
              );
            }
            continue;
          }
          const inset = Math.max(1, tileSize * 0.09);
          if (tile === 0) {
            walls.rect(tileX, tileY, tileSize - inset, tileSize - inset).fill("#202d39");
            if (showFeatures) {
              drawTileFeature(features, tile, tileX, tileY, tileSize, getWallEdges(dungeon.tiles, x, y));
            }
          } else if (tile === 2) {
            corridors
              .rect(tileX, tileY, tileSize - inset, tileSize - inset)
              .fill("#a9824d");
          } else if (tile === 1) {
            floors.rect(tileX, tileY, tileSize - inset, tileSize - inset).fill(roomFloorColor);
          } else if (tile === ELEVATED_FLOOR_TILE) {
            floors.rect(tileX, tileY, tileSize - inset, tileSize - inset).fill(category ? roomFloorColor : "#d5b882");
            if (showFeatures) drawTileFeature(features, tile, tileX, tileY, tileSize);
          } else if (tile === ROOM_STAIRS_TILE) {
            floors.rect(tileX, tileY, tileSize - inset, tileSize - inset).fill("#a9824d");
            if (showFeatures) drawTileFeature(features, tile, tileX, tileY, tileSize);
          } else if (tile === CAVE_BREACH_TILE) {
            floors.rect(tileX, tileY, tileSize - inset, tileSize - inset).fill("#998058");
            if (showFeatures) drawTileFeature(features, tile, tileX, tileY, tileSize);
          } else if (tile === CAVE_TILE) {
            floors
              .rect(tileX, tileY, tileSize - inset, tileSize - inset)
              .fill(isOpenCaveConnection(dungeon, roomCategories, x, y) ? "#879a70" : "#4c6953");
            if (showFeatures && isOpenCaveConnection(dungeon, roomCategories, x, y)) {
              drawTileFeature(features, tile, tileX, tileY, tileSize, [], true);
            }
          } else {
            drawTileFeature(features, tile, tileX, tileY, tileSize);
          }
        }
      }
      if (!useRasterBase) map.addChild(walls, floors, corridors);
      if (showFeatures) map.addChild(features);
      for (const room of dungeon.roomDetails) {
        const centerX = map.x + (room.x + room.width / 2) * tileSize * zoom;
        const centerY = map.y + (room.y + room.height / 2) * tileSize * zoom;
        const displayedTileSize = tileSize * zoom;
        const badgeWidth = Math.max(14, Math.min(20, displayedTileSize * 1.1));
        const badgeHeight = Math.max(12, Math.min(16, displayedTileSize * 0.95));
        const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
        const badge = new Graphics()
          .roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight / 2)
          .fill(category.color);
        badge.position.set(centerX, centerY);

        const label = new Text({
          text: room.number.toString().padStart(2, "0"),
          resolution: Math.max(2, window.devicePixelRatio || 1),
          style: {
            fontFamily: "DM Mono",
            fontSize: Math.min(9, Math.max(7, displayedTileSize * 0.5)),
            fontWeight: "500",
            fill: "#10141b",
            align: "center",
          },
        });
        label.anchor.set(0.5);
        label.position.set(centerX, centerY);
        roomLabels.addChild(badge, label);
      }
      for (const trap of getNumberedCorridorTraps(dungeon)) {
        const displayedTileSize = tileSize * zoom;
        const centerX = map.x + (trap.x + 0.5) * displayedTileSize;
        const centerY = map.y + (trap.y + 0.5) * displayedTileSize;
        const badgeWidth = Math.max(14, Math.min(20, displayedTileSize * 0.9));
        const badgeHeight = Math.max(12, Math.min(16, displayedTileSize * 0.85));
        const badge = new Graphics()
          .roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight * 0.25)
          .fill("#8e4032")
          .stroke({ color: "#f0a36f", width: Math.max(1, displayedTileSize * 0.06) });
        badge.position.set(centerX, centerY);

        const label = new Text({
          text: trap.number.toString().padStart(2, "0"),
          resolution: Math.max(2, window.devicePixelRatio || 1),
          style: {
            fontFamily: "DM Mono",
            fontSize: Math.min(9, Math.max(7, displayedTileSize * 0.5)),
            fontWeight: "600",
            fill: "#fff1df",
            align: "center",
          },
        });
        label.anchor.set(0.5);
        label.position.set(centerX, centerY);
        roomLabels.addChild(badge, label);
      }
      stage.addChild(map, roomLabels);
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    if (hostRef.current) resizeObserver.observe(hostRef.current);
    return () => resizeObserver.disconnect();
  }, [app, dungeon, pan, rasterizedMap, roomCategories, showLava, showWater, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".map-controls")) return;
      event.preventDefault();
      setZoom((current) => {
        const nextZoom = clampZoom(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
        if (nextZoom <= 1) onClearSelection();
        return nextZoom;
      });
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [onClearSelection]);

  const getMapPositionAtPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const host = hostRef.current;
    if (!host || !app) return null;
    const tileSize = Math.min(
      17,
      (app.screen.width - 48) / dungeon.width,
      (app.screen.height - 48) / dungeon.height,
    );
    if (tileSize <= 0) return null;

    const mapWidth = tileSize * dungeon.width;
    const mapHeight = tileSize * dungeon.height;
    const panLimitX = Math.max(0, (mapWidth * zoom - app.screen.width) / 2 + tileSize);
    const panLimitY = Math.max(0, (mapHeight * zoom - app.screen.height) / 2 + tileSize);
    const panX = Math.max(-panLimitX, Math.min(pan.x, panLimitX));
    const panY = Math.max(-panLimitY, Math.min(pan.y, panLimitY));
    const mapX = Math.floor((app.screen.width - mapWidth * zoom) / 2 + panX);
    const mapY = Math.floor((app.screen.height - mapHeight * zoom) / 2 + panY);
    const bounds = host.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - mapX) / (tileSize * zoom),
      y: (clientY - bounds.top - mapY) / (tileSize * zoom),
    };
  };

  const getTargetAtPointer = (clientX: number, clientY: number): MapTarget | null => {
    const position = getMapPositionAtPointer(clientX, clientY);
    if (!position) return null;
    const tileX = Math.floor(position.x);
    const tileY = Math.floor(position.y);
    const tile = dungeon.tiles[tileY]?.[tileX];
    if (tile === undefined) return null;
    const room = dungeon.roomDetails.find((candidate) => (
      tileX >= candidate.x
      && tileX < candidate.x + candidate.width
      && tileY >= candidate.y
      && tileY < candidate.y + candidate.height
    ));
    return room ? { type: "room", roomNumber: room.number } : null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(".map-controls")) return;
    suppressClickRef.current = false;
    const position = getMapPositionAtPointer(event.clientX, event.clientY);
    const room = position && dungeon.roomDetails.find((candidate) => (
      position.x >= candidate.x
      && position.x < candidate.x + candidate.width
      && position.y >= candidate.y
      && position.y < candidate.y + candidate.height
    ));
    if (moveMode && room && position) {
      dragRef.current = {
        type: "room",
        pointerId: event.pointerId,
        roomNumber: room.number,
        offsetX: position.x - room.x,
        offsetY: position.y - room.y,
        lastX: room.x,
        lastY: room.y,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      setHoveredMapTarget({ type: "room", roomNumber: room.number });
      return;
    }
    if (moveMode) return;
    if (zoom <= 1) return;
    dragRef.current = {
      type: "pan",
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.type === "pan") {
        setPan({
          x: drag.panX + event.clientX - drag.originX,
          y: drag.panY + event.clientY - drag.originY,
        });
      } else {
        const position = getMapPositionAtPointer(event.clientX, event.clientY);
        if (!position) return;
        const nextX = Math.round(position.x - drag.offsetX);
        const nextY = Math.round(position.y - drag.offsetY);
        if (nextX !== drag.lastX || nextY !== drag.lastY) {
          onRoomMove(drag.roomNumber, nextX, nextY);
          drag.lastX = nextX;
          drag.lastY = nextY;
          drag.moved = true;
        }
        setHoveredMapTarget({ type: "room", roomNumber: drag.roomNumber });
      }
      return;
    }
    if (event.target instanceof Element && event.target.closest(".map-controls")) {
      setHoveredMapTarget(null);
      return;
    }
    setHoveredMapTarget(getTargetAtPointer(event.clientX, event.clientY));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.type === "room"
      ? drag.moved
      : Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 5;
    dragRef.current = null;
    setDragging(false);
    if (drag.type === "room" && drag.moved) onRoomMoveEnd(drag.roomNumber);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (moveMode) return;
    if (event.target instanceof Element && event.target.closest(".map-controls")) return;
    const target = getTargetAtPointer(event.clientX, event.clientY);
    if (target?.type === "room") onRoomSelect(target.roomNumber);
  };

  return (
    <div
      className={`canvas-host${zoom > 1 ? " canvas-zoomed" : ""}${moveMode ? " canvas-move-mode" : ""}${dragging ? " canvas-dragging" : ""}${hoveredMapTarget && !dragging ? " canvas-room-hover" : ""}`}
      ref={hostRef}
      aria-label="Visualização da masmorra gerada"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseLeave={() => setHoveredMapTarget(null)}
      onClick={handleClick}
    >
      {!app && <div className="canvas-loading">Preparando mapa...</div>}
      <div className="map-controls">
        <div className="map-layer-controls" role="group" aria-label="Camadas de líquidos">
          <button
            className="map-control-button liquid-toggle water-toggle"
            type="button"
            aria-label={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
            aria-pressed={showWater}
            title={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
            onClick={onToggleWater}
          >
            <i aria-hidden="true" /> Água
          </button>
          <button
            className="map-control-button liquid-toggle lava-toggle"
            type="button"
            aria-label={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
            aria-pressed={showLava}
            title={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
            onClick={onToggleLava}
          >
            <i aria-hidden="true" /> Lava
          </button>
        </div>
        <div className="map-mode-controls" role="group" aria-label="Modo de interação com salas">
          <button
            className="map-control-button move-mode-toggle"
            type="button"
            aria-label={`${moveMode ? "Desativar" : "Ativar"} modo mover salas`}
            aria-pressed={moveMode}
            title={moveMode ? "Desativar modo mover salas" : "Ativar modo mover salas"}
            onClick={() => setMoveMode((active) => !active)}
          >
            Mover
          </button>
        </div>
        <div className="map-zoom-controls" role="group" aria-label="Zoom do mapa">
          <button
            className="map-control-button zoom-button"
            type="button"
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
            onClick={() => setZoom((current) => {
              const nextZoom = clampZoom(current / 1.25);
              if (nextZoom <= 1) onClearSelection();
              return nextZoom;
            })}
          >
            −
          </button>
          <span className="zoom-level" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            className="map-control-button zoom-button"
            type="button"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
            onClick={() => setZoom((current) => clampZoom(current * 1.25))}
          >
            +
          </button>
          <button
            className="map-control-button fit-button"
            type="button"
            aria-label="Ajustar mapa à tela"
            title="Ajustar mapa à tela"
            onClick={() => {
              onClearSelection();
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Ajustar
          </button>
        </div>
      </div>
    </div>
  );
}
