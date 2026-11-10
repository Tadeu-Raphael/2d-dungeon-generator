import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
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
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
  getNumberedCorridorTraps,
} from "../dungeon";
import type { Dungeon, Tile, TrapType } from "../dungeon";
import { ROOM_TYPE_CATEGORIES } from "../roomTypes";
import {
  TRAP_CATEGORY_COLORS,
  createRoomCategoryGrid,
  createRoomNumberGrid,
  DUNGEON_MAP_PALETTE,
  getRoomConnectionTiles,
  getVisibleTile,
  isOpenCaveConnection,
} from "./dungeonTileSemantics";
import type { WallEdge, WallSide } from "./dungeonTileSemantics";
import {
  createCartographicCanvas,
  isCartographicLiquidTextureSheetCompatible,
  isCartographicTexturedLiquidTile,
  isCartographicTextureSheetCompatible,
} from "./cartographicMap";
import type { CartographicTextureSheet } from "./cartographicMap";
import { getDoorwayDrawing, getDoorwayFootprint, getDoorwayGroups } from "./doorwayLayout";
import type { DoorwayGroup } from "./doorwayLayout";
import type { MapFocusRequest } from "./types";

export { getTileColor } from "./dungeonTileSemantics";
export { createDungeonSvg } from "./dungeonSvg";
export type { MapFocusRequest } from "./types";

const CARTOGRAPHIC_TEXTURE_SHEET_URL = new URL("./assets/dungeon-texture-sheet.jpg", import.meta.url).href;
const LIQUID_TEXTURE_ATLAS_URL = new URL("./assets/water-lava-texture-atlas.png", import.meta.url).href;

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

interface MapLabelPosition {
  container: Container;
  tileX: number;
  tileY: number;
  roomNumber?: number;
}

interface MapPointerCoordinates {
  x: number;
  y: number;
}

interface DungeonCanvasProps {
  dungeon: Dungeon;
  generationKey: Dungeon;
  focusRequest: MapFocusRequest | null;
  selectedRoomNumber?: number;
  hoveredRoomNumber?: number;
  onRoomMove: (roomNumber: number, x: number, y: number) => void;
  onRoomSelect: (roomNumber: number) => void;
  onRoomMoveEnd: (roomNumber: number) => void;
  onClearSelection: () => void;
  showWater: boolean;
  showLava: boolean;
  onToggleWater: () => void;
  onToggleLava: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 64;
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
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
          color: edge.bordersCave ? DUNGEON_MAP_PALETTE.caveEdge : DUNGEON_MAP_PALETTE.wallEdge,
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
      .fill(DUNGEON_MAP_PALETTE.water)
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
      .fill(DUNGEON_MAP_PALETTE.lava)
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
      .fill(DUNGEON_MAP_PALETTE.water)
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
      .fill(DUNGEON_MAP_PALETTE.water)
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.38)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.38)
      .stroke({ color: "#a9e3f2", width: tileSize * 0.05 });
  } else if (tile === CAVE_LAVA_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill(DUNGEON_MAP_PALETTE.lava)
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
      .fill(DUNGEON_MAP_PALETTE.water)
      .stroke({ color: "#78c7e2", width: tileSize * 0.05 });
    features
      .moveTo(tileX + tileSize * 0.24, tileY + tileSize * 0.38)
      .lineTo(tileX + tileSize * 0.76, tileY + tileSize * 0.38)
      .stroke({ color: "#a9e3f2", width: tileSize * 0.05 });
  } else if (tile === LAVA_TILE) {
    const inset = tileSize * 0.08;
    features
      .rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset)
      .fill(DUNGEON_MAP_PALETTE.lava)
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

function drawDoorwayFeatures(
  features: Graphics,
  groups: readonly DoorwayGroup[],
  tileSize: number,
): void {
  for (const group of groups) {
    const footprint = getDoorwayFootprint(group);
    const originX = footprint.x * tileSize;
    const originY = footprint.y * tileSize;
    for (const primitive of getDoorwayDrawing(group, tileSize)) {
      if (primitive.kind === "rect") {
        const rect = features.rect(
          originX + primitive.x,
          originY + primitive.y,
          primitive.width,
          primitive.height,
        );
        if (primitive.fill) rect.fill(primitive.fill);
        if (primitive.stroke) {
          rect.stroke({ color: primitive.stroke, width: primitive.strokeWidth ?? tileSize * 0.04 });
        }
      } else if (primitive.kind === "line") {
        features
          .moveTo(originX + primitive.x1, originY + primitive.y1)
          .lineTo(originX + primitive.x2, originY + primitive.y2)
          .stroke({ color: primitive.color, width: primitive.width, cap: "round" });
      } else {
        features
          .circle(originX + primitive.x, originY + primitive.y, primitive.radius)
          .fill(primitive.fill);
      }
    }
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

function DungeonCanvas({
  dungeon,
  generationKey,
  focusRequest,
  selectedRoomNumber,
  hoveredRoomNumber: hoveredGuideRoomNumber,
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
  const [textureSheet, setTextureSheet] = useState<CartographicTextureSheet | null>(null);
  const [liquidTextureSheet, setLiquidTextureSheet] = useState<CartographicTextureSheet | null>(null);
  const roomCategories = useMemo(() => createRoomCategoryGrid(dungeon), [dungeon]);
  const hasTexturedLiquid = useMemo(
    () => dungeon.tiles.some((row) => row.some(isCartographicTexturedLiquidTile)),
    [dungeon],
  );
  const doorwayGroups = useMemo(() => getDoorwayGroups(dungeon.tiles, dungeon.doorVariants), [dungeon]);
  const roomNumbers = useMemo(
    () => createRoomNumberGrid(dungeon.tiles, dungeon.width, dungeon.roomDetails),
    [dungeon],
  );
  const connectionTiles = useMemo(
    () => selectedRoomNumber === undefined
      ? new Set<number>()
      : getRoomConnectionTiles(
        dungeon.tiles,
        dungeon.width,
        dungeon.roomDetails,
        roomNumbers,
        selectedRoomNumber,
      ),
    [dungeon, roomNumbers, selectedRoomNumber],
  );
  const [showGrid, setShowGrid] = useState(true);
  const [showWalls, setShowWalls] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      if (!isCartographicTextureSheetCompatible(image.naturalWidth, image.naturalHeight)) {
        console.error(
          `A folha de texturas do mapa tem dimensões incompatíveis: ${image.naturalWidth}×${image.naturalHeight}.`,
        );
        return;
      }
      setTextureSheet({ image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (error) => {
      if (!cancelled) console.error("Não foi possível carregar a folha de texturas do mapa.", error);
    };
    image.src = CARTOGRAPHIC_TEXTURE_SHEET_URL;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  useEffect(() => {
    if (!hasTexturedLiquid) {
      setLiquidTextureSheet(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      if (!isCartographicLiquidTextureSheetCompatible(image.naturalWidth, image.naturalHeight)) {
        console.error(
          `O atlas de água e lava tem dimensões incompatíveis: ${image.naturalWidth}×${image.naturalHeight}.`,
        );
        return;
      }
      setLiquidTextureSheet({ image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (error) => {
      if (!cancelled) console.error("Não foi possível carregar o atlas de texturas de água e lava.", error);
    };
    image.src = LIQUID_TEXTURE_ATLAS_URL;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [hasTexturedLiquid]);

  const rasterizedMap = useMemo(
    () => createCartographicCanvas(dungeon, {
      showWater,
      showLava,
      showWalls,
      showGrid: false,
      roomCategories,
    }, textureSheet ?? undefined, liquidTextureSheet ?? undefined),
    [dungeon, liquidTextureSheet, roomCategories, showLava, showWalls, showWater, textureSheet],
  );
  const [zoom, setZoom] = useState(1);
  const [moveMode, setMoveMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoveredMapTarget, setHoveredMapTarget] = useState<MapTarget | null>(null);
  const [pointerCoordinates, setPointerCoordinates] = useState<MapPointerCoordinates | null>(null);
  const pointerClientPositionRef = useRef<{ x: number; y: number } | null>(null);
  const updatePointerReadoutRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const suppressClickRef = useRef(false);
  const dragRef = useRef<CanvasDrag | null>(null);
  const mapRef = useRef<Container | null>(null);
  const labelPositionsRef = useRef<MapLabelPosition[]>([]);
  const connectionGraphicsRef = useRef<Graphics | null>(null);
  const roomHighlightFillGraphicsRef = useRef<Graphics | null>(null);
  const roomHighlightGraphicsRef = useRef<Graphics | null>(null);
  const hoverRoomHighlightGraphicsRef = useRef<Graphics | null>(null);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const renderedTileSizeRef = useRef(0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const applyViewportRef = useRef<() => void>(() => {});
  const updateHighlightsRef = useRef<() => void>(() => {});
  const panRef = useRef({ x: 0, y: 0 });
  const updatePan = (nextPan: { x: number; y: number }): void => {
    panRef.current = nextPan;
    applyViewportRef.current();
  };
  const changeZoomAtPoint = (clientX: number, clientY: number, factor: number): void => {
    const currentZoom = zoomRef.current;
    const nextZoom = clampZoom(currentZoom * factor);
    const host = hostRef.current;
    if (nextZoom === currentZoom || !host || !app?.renderer) return;

    const screen = app.screen;
    const tileSize = Math.min(
      17,
      (screen.width - 48) / dungeon.width,
      (screen.height - 48) / dungeon.height,
    );
    if (tileSize <= 0) return;

    const mapWidth = tileSize * dungeon.width;
    const mapHeight = tileSize * dungeon.height;
    const panLimitX = Math.max(0, (mapWidth * currentZoom - screen.width) / 2 + tileSize);
    const panLimitY = Math.max(0, (mapHeight * currentZoom - screen.height) / 2 + tileSize);
    const currentPanX = Math.max(-panLimitX, Math.min(panRef.current.x, panLimitX));
    const currentPanY = Math.max(-panLimitY, Math.min(panRef.current.y, panLimitY));
    const mapX = Math.floor((screen.width - mapWidth * currentZoom) / 2 + currentPanX);
    const mapY = Math.floor((screen.height - mapHeight * currentZoom) / 2 + currentPanY);
    const bounds = host.getBoundingClientRect();
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;
    const tileX = (pointX - mapX) / (tileSize * currentZoom);
    const tileY = (pointY - mapY) / (tileSize * currentZoom);
    panRef.current = {
      x: pointX - tileX * tileSize * nextZoom - (screen.width - mapWidth * nextZoom) / 2,
      y: pointY - tileY * tileSize * nextZoom - (screen.height - mapHeight * nextZoom) / 2,
    };
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    if (nextZoom <= 1) onClearSelection();
    const pointerPosition = pointerClientPositionRef.current;
    if (pointerPosition) {
      updatePointerReadoutRef.current(pointerPosition.x, pointerPosition.y);
    }
  };
  const changeZoomAtPointRef = useRef(changeZoomAtPoint);
  changeZoomAtPointRef.current = changeZoomAtPoint;
  const changeZoomAtCenter = (factor: number): void => {
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    changeZoomAtPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
  };
  const resetView = (): void => {
    onClearSelection();
    zoomRef.current = 1;
    setZoom(1);
    updatePan({ x: 0, y: 0 });
    const pointerPosition = pointerClientPositionRef.current;
    if (pointerPosition) {
      updatePointerReadoutRef.current(pointerPosition.x, pointerPosition.y);
    }
  };
  const mapHoveredRoomNumber = hoveredMapTarget?.type === "room"
    ? hoveredMapTarget.roomNumber
    : undefined;
  const hoveredRoomNumber = hoveredGuideRoomNumber ?? mapHoveredRoomNumber;
  const hoveredRoom = mapHoveredRoomNumber === undefined
    ? undefined
    : dungeon.roomDetails.find((room) => room.number === mapHoveredRoomNumber);

  updateHighlightsRef.current = () => {
    const connectionGraphics = connectionGraphicsRef.current;
    const roomHighlightFillGraphics = roomHighlightFillGraphicsRef.current;
    const roomHighlightGraphics = roomHighlightGraphicsRef.current;
    const hoverRoomHighlightGraphics = hoverRoomHighlightGraphicsRef.current;
    const tileSize = renderedTileSizeRef.current;
    if (
      !connectionGraphics
      || !roomHighlightFillGraphics
      || !roomHighlightGraphics
      || !hoverRoomHighlightGraphics
      || connectionGraphics.destroyed
      || roomHighlightFillGraphics.destroyed
      || roomHighlightGraphics.destroyed
      || hoverRoomHighlightGraphics.destroyed
      || tileSize <= 0
    ) return;

    connectionGraphics.clear();
    roomHighlightFillGraphics.clear();
    roomHighlightGraphics.clear();
    hoverRoomHighlightGraphics.clear();
    if (selectedRoomNumber !== undefined && connectionTiles.size > 0) {
      let hasConnectionSegments = false;
      for (const index of connectionTiles) {
        const x = index % dungeon.width;
        const y = Math.floor(index / dungeon.width);
        const centerX = (x + 0.5) * tileSize;
        const centerY = (y + 0.5) * tileSize;
        for (const [offsetX, offsetY] of [[1, 0], [0, 1]] as const) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX >= dungeon.width || nextY >= dungeon.height) continue;
          if (!connectionTiles.has(nextY * dungeon.width + nextX)) continue;
          connectionGraphics
            .moveTo(centerX, centerY)
            .lineTo((nextX + 0.5) * tileSize, (nextY + 0.5) * tileSize);
          hasConnectionSegments = true;
        }
      }
      if (hasConnectionSegments) {
        connectionGraphics.stroke({
          color: DUNGEON_MAP_PALETTE.selected,
          alpha: 0.62,
          width: tileSize * 0.2,
          cap: "round",
          join: "round",
        });
      }
    }

    const drawRoomHighlight = (
      fillGraphics: Graphics | null,
      outlineGraphics: Graphics,
      roomNumber: number,
      color: string,
      fillAlpha: number,
      outlineWidth: number,
    ) => {
      const room = dungeon.roomDetails.find((candidate) => candidate.number === roomNumber);
      if (!room) return;
      const drawOutlinePath = () => {
        for (let y = room.y; y < room.y + room.height; y += 1) {
          for (let x = room.x; x < room.x + room.width; x += 1) {
            const index = y * dungeon.width + x;
            if (roomNumbers[index] !== roomNumber) continue;
            const left = x * tileSize;
            const top = y * tileSize;
            const edges = [
              { index: index - dungeon.width, boundary: y === 0, x1: left, y1: top, x2: left + tileSize, y2: top },
              { index: index + 1, boundary: x === dungeon.width - 1, x1: left + tileSize, y1: top, x2: left + tileSize, y2: top + tileSize },
              { index: index + dungeon.width, boundary: y === dungeon.height - 1, x1: left, y1: top + tileSize, x2: left + tileSize, y2: top + tileSize },
              { index: index - 1, boundary: x === 0, x1: left, y1: top, x2: left, y2: top + tileSize },
            ];
            for (const edge of edges) {
              if (edge.boundary || roomNumbers[edge.index] !== roomNumber) {
                outlineGraphics.moveTo(edge.x1, edge.y1).lineTo(edge.x2, edge.y2);
              }
            }
          }
        }
      };

      for (let y = room.y; y < room.y + room.height; y += 1) {
        for (let x = room.x; x < room.x + room.width; x += 1) {
          const index = y * dungeon.width + x;
          if (roomNumbers[index] !== roomNumber) continue;
          const left = x * tileSize;
          const top = y * tileSize;
          if (fillGraphics && fillAlpha > 0) {
            fillGraphics
              .rect(left + tileSize * 0.04, top + tileSize * 0.04, tileSize * 0.92, tileSize * 0.92)
              .fill({ color, alpha: fillAlpha });
          }
        }
      }

      const zoom = Math.max(zoomRef.current, 0.01);
      drawOutlinePath();
      outlineGraphics.stroke({
        color: DUNGEON_MAP_PALETTE.background,
        alpha: 0.96,
        width: (outlineWidth + 3) / zoom,
        cap: "round",
        join: "round",
      });
      drawOutlinePath();
      outlineGraphics.stroke({
        color,
        alpha: 1,
        width: outlineWidth / zoom,
        cap: "round",
        join: "round",
      });
    };

    if (selectedRoomNumber !== undefined) {
      drawRoomHighlight(
        roomHighlightFillGraphics,
        roomHighlightGraphics,
        selectedRoomNumber,
        DUNGEON_MAP_PALETTE.selected,
        0.46,
        3.8,
      );
    }
    if (hoveredRoomNumber !== undefined && hoveredRoomNumber !== selectedRoomNumber) {
      drawRoomHighlight(
        null,
        hoverRoomHighlightGraphics,
        hoveredRoomNumber,
        DUNGEON_MAP_PALETTE.hover,
        0,
        3.4,
      );
    }

    const displayedTileSize = tileSize * zoomRef.current;
    for (const labelPosition of labelPositionsRef.current) {
      labelPosition.container.visible = labelPosition.roomNumber === undefined
        ? displayedTileSize >= 6
        : displayedTileSize >= 3.5
          || labelPosition.roomNumber === selectedRoomNumber
          || labelPosition.roomNumber === hoveredRoomNumber;
    }
  };

  useEffect(() => {
    zoomRef.current = 1;
    pointerClientPositionRef.current = null;
    setHoveredMapTarget(null);
    setPointerCoordinates(null);
    updatePan({ x: 0, y: 0 });
    setZoom(1);
  }, [generationKey]);

  useEffect(() => {
    if (!app?.renderer || !focusRequest?.shouldFocus) return;
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
    zoomRef.current = focusZoom;
    setZoom(focusZoom);
    updatePan({
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
        background: DUNGEON_MAP_PALETTE.background,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
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
      connectionGraphicsRef.current = null;
      roomHighlightFillGraphicsRef.current = null;
      roomHighlightGraphicsRef.current = null;
      hoverRoomHighlightGraphicsRef.current = null;
      renderedTileSizeRef.current = 0;
      for (const child of stage.removeChildren()) {
        child.destroy({ children: true, texture: true, textureSource: true });
      }
      mapRef.current = null;
      labelPositionsRef.current = [];
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
      const showFeatures = tileSize * zoom >= 2.5;
      renderedTileSizeRef.current = tileSize;

      const grid = new Graphics();
      const features = new Graphics();
      const connectionHighlights = new Graphics();
      const roomHighlightFill = new Graphics();
      const roomHighlights = new Graphics();
      const hoverRoomHighlights = new Graphics();
      connectionGraphicsRef.current = connectionHighlights;
      roomHighlightFillGraphicsRef.current = roomHighlightFill;
      roomHighlightGraphicsRef.current = roomHighlights;
      hoverRoomHighlightGraphicsRef.current = hoverRoomHighlights;
      const sprite = Sprite.from(rasterizedMap, true);
      sprite.width = mapWidth;
      sprite.height = mapHeight;
      map.addChild(sprite);
      drawDoorwayFeatures(features, doorwayGroups, tileSize);
      map.addChild(roomHighlightFill);
      map.addChild(grid);
      map.addChild(connectionHighlights);
      if (showFeatures) map.addChild(features);
      map.addChild(roomHighlights);
      map.addChild(hoverRoomHighlights);

      const updateRasterFeatures = (mapX: number, mapY: number) => {
        features.clear();
        drawDoorwayFeatures(features, doorwayGroups, tileSize);
        if (!showFeatures) return;
        const displayedTileSize = tileSize * zoom;
        const firstVisibleX = Math.max(0, Math.floor(-mapX / displayedTileSize) - 1);
        const lastVisibleX = Math.min(
          dungeon.width,
          Math.ceil((app.screen.width - mapX) / displayedTileSize) + 1,
        );
        const firstVisibleY = Math.max(0, Math.floor(-mapY / displayedTileSize) - 1);
        const lastVisibleY = Math.min(
          dungeon.height,
          Math.ceil((app.screen.height - mapY) / displayedTileSize) + 1,
        );
        for (let y = firstVisibleY; y < lastVisibleY; y += 1) {
          for (let x = firstVisibleX; x < lastVisibleX; x += 1) {
            const tile = getVisibleTile(dungeon.tiles[y][x], showWater, showLava);
            if (liquidTextureSheet && isCartographicTexturedLiquidTile(tile)) continue;
            drawTileFeature(
              features,
              tile,
              x * tileSize,
              y * tileSize,
              tileSize,
              [],
              tile === CAVE_TILE && isOpenCaveConnection(dungeon, roomCategories, x, y),
            );
          }
        }
      };
      const updateGrid = (mapX: number, mapY: number) => {
        grid.clear();
        const displayedTileSize = tileSize * zoom;
        if (!showGrid || displayedTileSize < 3) return;

        const firstVisibleX = Math.max(0, Math.floor(-mapX / displayedTileSize) - 1);
        const lastVisibleX = Math.min(
          dungeon.width,
          Math.ceil((app.screen.width - mapX) / displayedTileSize) + 1,
        );
        const firstVisibleY = Math.max(0, Math.floor(-mapY / displayedTileSize) - 1);
        const lastVisibleY = Math.min(
          dungeon.height,
          Math.ceil((app.screen.height - mapY) / displayedTileSize) + 1,
        );
        const alpha = displayedTileSize < 6 ? 0.08 : displayedTileSize < 14 ? 0.12 : 0.18;
        const pixelRatio = app.renderer.resolution;
        const snapGridCoordinate = (coordinate: number) => (
          (Math.round(coordinate * pixelRatio - 0.5) + 0.5) / pixelRatio
        );
        const firstGridY = snapGridCoordinate(mapY + firstVisibleY * displayedTileSize) - mapY;
        const lastGridY = snapGridCoordinate(mapY + lastVisibleY * displayedTileSize) - mapY;
        const firstGridX = snapGridCoordinate(mapX + firstVisibleX * displayedTileSize) - mapX;
        const lastGridX = snapGridCoordinate(mapX + lastVisibleX * displayedTileSize) - mapX;

        for (let x = firstVisibleX; x <= lastVisibleX; x += 1) {
          const lineX = snapGridCoordinate(mapX + x * displayedTileSize) - mapX;
          grid.moveTo(lineX, firstGridY).lineTo(lineX, lastGridY);
        }
        for (let y = firstVisibleY; y <= lastVisibleY; y += 1) {
          const lineY = snapGridCoordinate(mapY + y * displayedTileSize) - mapY;
          grid.moveTo(firstGridX, lineY).lineTo(lastGridX, lineY);
        }
        grid.stroke({
          color: DUNGEON_MAP_PALETTE.grid,
          alpha,
          width: 1 / pixelRatio,
        });
      };
      const labelPositions: MapLabelPosition[] = [];
      for (const room of dungeon.roomDetails) {
        const displayedTileSize = tileSize * zoom;
        const badgeWidth = Math.max(12, Math.min(20, displayedTileSize * 1.1));
        const badgeHeight = Math.max(11, Math.min(16, displayedTileSize * 0.95));
        const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
        const badge = new Graphics()
          .roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight / 2)
          .fill({ color: DUNGEON_MAP_PALETTE.wall, alpha: 0.94 })
          .stroke({ color: category.color, alpha: 0.9, width: 0.9 });

        const label = new Text({
          text: room.number.toString().padStart(2, "0"),
          resolution: Math.max(2, window.devicePixelRatio || 1),
          style: {
            fontFamily: "DM Mono",
            fontSize: Math.min(9, Math.max(6, displayedTileSize * 0.48)),
            fontWeight: "600",
            fill: "#f0e9dc",
            align: "center",
          },
        });
        label.anchor.set(0.5);
        const labelContainer = new Container();
        labelContainer.addChild(badge, label);
        roomLabels.addChild(labelContainer);
        labelPositions.push({
          container: labelContainer,
          tileX: room.x + room.width / 2,
          tileY: room.y + room.height / 2,
          roomNumber: room.number,
        });
      }
      for (const trap of getNumberedCorridorTraps(dungeon)) {
        const displayedTileSize = tileSize * zoom;
        const badgeWidth = Math.max(14, Math.min(20, displayedTileSize * 0.9));
        const badgeHeight = Math.max(12, Math.min(16, displayedTileSize * 0.85));
        const badge = new Graphics()
          .roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight * 0.25)
          .fill("#8e4032")
          .stroke({ color: "#f0a36f", width: Math.max(1, displayedTileSize * 0.06) });

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
        const labelContainer = new Container();
        labelContainer.addChild(badge, label);
        roomLabels.addChild(labelContainer);
        labelPositions.push({
          container: labelContainer,
          tileX: trap.x + 0.5,
          tileY: trap.y + 0.5,
        });
      }
      mapRef.current = map;
      labelPositionsRef.current = labelPositions;
      applyViewportRef.current = () => {
        const renderer = app.renderer;
        if (!renderer) return;
        const screen = renderer.screen;
        const currentTileSize = Math.min(
          17,
          (screen.width - 48) / dungeon.width,
          (screen.height - 48) / dungeon.height,
        );
        if (currentTileSize <= 0) return;

        const mapWidth = currentTileSize * dungeon.width;
        const mapHeight = currentTileSize * dungeon.height;
        const panLimitX = Math.max(0, (mapWidth * zoom - screen.width) / 2 + currentTileSize);
        const panLimitY = Math.max(0, (mapHeight * zoom - screen.height) / 2 + currentTileSize);
        const panX = Math.max(-panLimitX, Math.min(panRef.current.x, panLimitX));
        const panY = Math.max(-panLimitY, Math.min(panRef.current.y, panLimitY));
        const mapX = Math.floor((screen.width - mapWidth * zoom) / 2 + panX);
        const mapY = Math.floor((screen.height - mapHeight * zoom) / 2 + panY);
        map.scale.set(zoom);
        grid.scale.set(1 / zoom);
        map.position.set(mapX, mapY);
        for (const labelPosition of labelPositions) {
          labelPosition.container.position.set(
            mapX + labelPosition.tileX * currentTileSize * zoom,
            mapY + labelPosition.tileY * currentTileSize * zoom,
          );
        }
        updateGrid(mapX, mapY);
        updateRasterFeatures(mapX, mapY);
      };
      applyViewportRef.current();
      stage.addChild(map, roomLabels);
      updateHighlightsRef.current();
    };

    const resizeAndDraw = () => {
      const currentHost = hostRef.current;
      const renderer = app.renderer;
      if (currentHost && renderer && currentHost.clientWidth > 0 && currentHost.clientHeight > 0) {
        renderer.resize(currentHost.clientWidth, currentHost.clientHeight);
      }
      draw();
    };

    resizeAndDraw();
    const resizeObserver = new ResizeObserver(resizeAndDraw);
    if (hostRef.current) resizeObserver.observe(hostRef.current);
    return () => resizeObserver.disconnect();
  }, [
    app,
    dungeon,
    liquidTextureSheet,
    rasterizedMap,
    roomCategories,
    showGrid,
    showLava,
    showWalls,
    showWater,
    zoom,
  ]);

  useEffect(() => {
    updateHighlightsRef.current();
  }, [connectionTiles, dungeon, hoveredRoomNumber, selectedRoomNumber]);

  useEffect(() => {
    const graphics = hoverRoomHighlightGraphicsRef.current;
    if (!graphics) return;
    if (hoveredRoomNumber === undefined || hoveredRoomNumber === selectedRoomNumber) {
      graphics.alpha = 1;
      return;
    }

    graphics.alpha = 0;
    const startTime = performance.now();
    const animate = (time: number) => {
      const currentGraphics = hoverRoomHighlightGraphicsRef.current;
      if (!currentGraphics || currentGraphics.destroyed) return;
      currentGraphics.alpha = Math.min(1, (time - startTime) / 180);
      if (currentGraphics.alpha < 1) {
        hoverAnimationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        hoverAnimationFrameRef.current = null;
      }
    };
    hoverAnimationFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (hoverAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverAnimationFrameRef.current);
        hoverAnimationFrameRef.current = null;
      }
    };
  }, [app, hoveredRoomNumber, selectedRoomNumber]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".map-controls")) return;
      event.preventDefault();
      changeZoomAtPointRef.current(
        event.clientX,
        event.clientY,
        event.deltaY < 0 ? 1.1 : 1 / 1.1,
      );
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, []);

  const getMapPositionAtPointer = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const host = hostRef.current;
    if (!host || !app?.renderer) return null;
    const tileSize = Math.min(
      17,
      (app.screen.width - 48) / dungeon.width,
      (app.screen.height - 48) / dungeon.height,
    );
    if (tileSize <= 0) return null;

    const mapWidth = tileSize * dungeon.width;
    const mapHeight = tileSize * dungeon.height;
    const currentZoom = zoomRef.current;
    const panLimitX = Math.max(0, (mapWidth * currentZoom - app.screen.width) / 2 + tileSize);
    const panLimitY = Math.max(0, (mapHeight * currentZoom - app.screen.height) / 2 + tileSize);
    const panX = Math.max(-panLimitX, Math.min(panRef.current.x, panLimitX));
    const panY = Math.max(-panLimitY, Math.min(panRef.current.y, panLimitY));
    const mapX = Math.floor((app.screen.width - mapWidth * currentZoom) / 2 + panX);
    const mapY = Math.floor((app.screen.height - mapHeight * currentZoom) / 2 + panY);
    const bounds = host.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - mapX) / (tileSize * currentZoom),
      y: (clientY - bounds.top - mapY) / (tileSize * currentZoom),
    };
  };

  const getTargetAtPosition = (position: { x: number; y: number }): MapTarget | null => {
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

  const getTargetAtPointer = (clientX: number, clientY: number): MapTarget | null => {
    const position = getMapPositionAtPointer(clientX, clientY);
    return position ? getTargetAtPosition(position) : null;
  };

  const updatePointerReadout = (clientX: number, clientY: number): void => {
    pointerClientPositionRef.current = { x: clientX, y: clientY };
    const position = getMapPositionAtPointer(clientX, clientY);
    if (!position) {
      setHoveredMapTarget(null);
      setPointerCoordinates(null);
      return;
    }

    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    if (x < 0 || x >= dungeon.width || y < 0 || y >= dungeon.height
      || dungeon.tiles[y]?.[x] === undefined) {
      setHoveredMapTarget(null);
      setPointerCoordinates(null);
      return;
    }

    const target = getTargetAtPosition(position);
    setHoveredMapTarget((current) => (
      current?.roomNumber === target?.roomNumber ? current : target
    ));
    setPointerCoordinates((current) => (
      current?.x === x && current.y === y ? current : { x, y }
    ));
  };
  updatePointerReadoutRef.current = updatePointerReadout;

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
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (drag.type === "pan") {
        updatePan({
          x: drag.panX + event.clientX - drag.originX,
          y: drag.panY + event.clientY - drag.originY,
        });
        updatePointerReadout(event.clientX, event.clientY);
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
      pointerClientPositionRef.current = { x: event.clientX, y: event.clientY };
      setHoveredMapTarget(null);
      setPointerCoordinates(null);
      return;
    }
    updatePointerReadout(event.clientX, event.clientY);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key.toLowerCase();
    if (key === "+" || key === "=") {
      event.preventDefault();
      changeZoomAtCenter(1.25);
    } else if (key === "-") {
      event.preventDefault();
      changeZoomAtCenter(1 / 1.25);
    } else if (key === "0" || key === "home") {
      event.preventDefault();
      resetView();
    } else if (key === "g") {
      setShowGrid((visible) => !visible);
    } else if (key === "w") {
      setShowWalls((visible) => !visible);
    } else if (zoom > 1 && key.startsWith("arrow")) {
      event.preventDefault();
      const step = 72;
      updatePan({
        x: panRef.current.x + (key === "arrowleft" ? -step : key === "arrowright" ? step : 0),
        y: panRef.current.y + (key === "arrowup" ? -step : key === "arrowdown" ? step : 0),
      });
      const pointerPosition = pointerClientPositionRef.current;
      if (pointerPosition) {
        updatePointerReadoutRef.current(pointerPosition.x, pointerPosition.y);
      }
    }
  };

  return (
    <div
      className={`canvas-host${zoom > 1 ? " canvas-zoomed" : ""}${moveMode ? " canvas-move-mode" : ""}${dragging ? " canvas-dragging" : ""}${hoveredMapTarget && !dragging ? " canvas-room-hover" : ""}`}
      ref={hostRef}
      role="region"
      tabIndex={0}
      aria-label="Mapa da masmorra. Use mais ou menos para zoom, 0 ou Home para ajustar, as setas para mover, G para alternar a grade e W para alternar contornos."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        pointerClientPositionRef.current = null;
        setHoveredMapTarget(null);
        setPointerCoordinates(null);
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {!app && <div className="canvas-loading">Preparando mapa...</div>}
      <div className="map-controls">
        <details className="map-layer-menu">
          <summary className="map-control-button map-layer-menu-toggle" title="Configurar camadas visíveis">
            Camadas <span aria-hidden="true">⌄</span>
          </summary>
          <div className="map-layer-menu-popover" role="group" aria-label="Camadas do mapa">
            <button
              className="map-control-button map-layer-toggle liquid-toggle water-toggle"
              type="button"
              aria-label={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
              aria-pressed={showWater}
              title={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
              onClick={onToggleWater}
            >
              <i aria-hidden="true" /> Água
            </button>
            <button
              className="map-control-button map-layer-toggle liquid-toggle lava-toggle"
              type="button"
              aria-label={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
              aria-pressed={showLava}
              title={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
              onClick={onToggleLava}
            >
              <i aria-hidden="true" /> Lava
            </button>
            <button
              className="map-control-button map-layer-toggle"
              type="button"
              aria-label={`${showGrid ? "Ocultar" : "Mostrar"} grade do mapa`}
              aria-pressed={showGrid}
              title={`${showGrid ? "Ocultar" : "Mostrar"} grade do mapa (G)`}
              onClick={() => setShowGrid((visible) => !visible)}
            >
              <i className="map-layer-swatch map-grid-swatch" aria-hidden="true" /> Grade
            </button>
            <button
              className="map-control-button map-layer-toggle"
              type="button"
              aria-label={`${showWalls ? "Ocultar" : "Mostrar"} contornos de parede`}
              aria-pressed={showWalls}
              title={`${showWalls ? "Ocultar" : "Mostrar"} contornos de parede (W)`}
              onClick={() => setShowWalls((visible) => !visible)}
            >
              <i className="map-layer-swatch map-wall-swatch" aria-hidden="true" /> Contornos
            </button>
          </div>
        </details>
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
            onClick={() => changeZoomAtCenter(1 / 1.25)}
          >
            −
          </button>
          <span className="zoom-level" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            className="map-control-button zoom-button"
            type="button"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
            onClick={() => changeZoomAtCenter(1.25)}
          >
            +
          </button>
          <button
            className="map-control-button fit-button"
            type="button"
            aria-label="Ajustar mapa à tela"
            title="Ajustar mapa à tela"
            onClick={resetView}
          >
            Ajustar
          </button>
        </div>
      </div>
      {pointerCoordinates && (
        <div className="map-pointer-readout">
          <span className="map-pointer-coordinate-label">COORDENADAS</span>
          <strong>
            X {String(pointerCoordinates.x + 1).padStart(2, "0")}
            <span aria-hidden="true"> · </span>
            Y {String(pointerCoordinates.y + 1).padStart(2, "0")}
          </strong>
          {hoveredRoom && (
            <div className="map-pointer-room">
              <span>
                SALA {String(hoveredRoom.number).padStart(2, "0")}
                <span aria-hidden="true"> · </span>
                {ROOM_TYPE_CATEGORIES[hoveredRoom.roomType.category].shortLabel}
              </span>
              <small>
                {hoveredRoom.width} × {hoveredRoom.height} tiles
                <span aria-hidden="true"> · </span>
                {hoveredRoom.traps.length} arm.
                <span aria-hidden="true"> · </span>
                {hoveredRoom.treasures.length} tes.
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(DungeonCanvas);
