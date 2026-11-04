import type { Tile, PointTuple } from "../types";
import {
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "../tiles";
import type {
  DungeonRoom,
  LiquidFeature,
  LiquidType,
} from "../../dungeon";

export type CaveLiquidFormation = "pool" | "stream" | "waterfall" | "spring";

export function getLiquidPattern(
  room: DungeonRoom,
  liquidFeature: LiquidFeature,
  random: () => number,
): PointTuple[] {
  const centerX = room.x + Math.floor(room.width / 2);
  const centerY = room.y + Math.floor(room.height / 2);
  if (liquidFeature === "well") return [[centerX, centerY]];
  if (liquidFeature === "fountain") {
    return [
      [centerX - 1, centerY - 1],
      [centerX, centerY - 1],
      [centerX + 1, centerY - 1],
      [centerX - 1, centerY],
      [centerX + 1, centerY],
      [centerX - 1, centerY + 1],
      [centerX, centerY + 1],
      [centerX + 1, centerY + 1],
    ];
  }
  if (liquidFeature === "stream") {
    if (random() < 0.5) {
      return Array.from(
        { length: room.width - 2 },
        (_, index): PointTuple => [room.x + index + 1, centerY],
      );
    }
    return Array.from(
      { length: room.height - 2 },
      (_, index): PointTuple => [centerX, room.y + index + 1],
    );
  }

  const radiusX = Math.min(3, Math.max(2, Math.floor(room.width / 5)));
  const radiusY = Math.min(2, Math.max(1, Math.floor(room.height / 5)));
  const pond: PointTuple[] = [];
  for (let offsetY = -radiusY; offsetY <= radiusY; offsetY += 1) {
    for (let offsetX = -radiusX; offsetX <= radiusX; offsetX += 1) {
      if (
        (offsetX * offsetX) / (radiusX * radiusX) +
          (offsetY * offsetY) / (radiusY * radiusY) <=
        1
      ) {
        pond.push([centerX + offsetX, centerY + offsetY]);
      }
    }
  }
  return pond;
}

export function placeLiquidFeatures(
  tiles: Tile[][],
  rooms: DungeonRoom[],
  random: () => number,
): void {
  const liquidFeatures: LiquidFeature[] = ["fountain", "stream", "well", "pond"];
  for (const room of rooms) {
    if (room.width < 7 || room.height < 7 || random() >= 0.15) continue;
    const liquidFeature =
      liquidFeatures[Math.floor(random() * liquidFeatures.length)];
    const liquidType: LiquidType = random() < 0.2 ? "lava" : "water";
    const pattern = getLiquidPattern(room, liquidFeature, random);
    if (pattern.some(([x, y]) => tiles[y]?.[x] !== FLOOR_TILE)) continue;
    const liquidTile = liquidType === "lava" ? LAVA_TILE : WATER_TILE;
    for (const [x, y] of pattern) tiles[y][x] = liquidTile;
    room.liquidFeature = liquidFeature;
    room.liquidType = liquidType;
  }
}

export function getCaveRegions(tiles: Tile[][]): PointTuple[][] {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const visited = Array.from({ length: height }, () =>
    Array<boolean>(width).fill(false),
  );
  const regions: PointTuple[][] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[y][x] !== 50 || visited[y][x]) continue;
      const region: PointTuple[] = [];
      const queue: PointTuple[] = [[x, y]];
      visited[y][x] = true;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentX, currentY] = queue[cursor];
        region.push([currentX, currentY]);
        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ]) {
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= width ||
            nextY >= height ||
            visited[nextY][nextX] ||
            tiles[nextY][nextX] !== 50
          )
            continue;
          visited[nextY][nextX] = true;
          queue.push([nextX, nextY]);
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

export function getCaveInteriorCells(
  tiles: Tile[][],
  region: PointTuple[],
): PointTuple[] {
  return region.filter(([x, y]) => {
    let caveNeighborCount = 0;
    for (const [neighborX, neighborY] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const neighbor = tiles[neighborY]?.[neighborX];
      if (neighbor === 50) {
        caveNeighborCount += 1;
      } else if (neighbor !== undefined && neighbor !== 0) {
        return false;
      }
    }
    return caveNeighborCount >= 2;
  });
}

export function getCaveFormationPattern(
  tiles: Tile[][],
  candidates: PointTuple[],
  start: PointTuple,
  formation: CaveLiquidFormation,
  random: () => number,
): PointTuple[] {
  const width = tiles[0]?.length ?? 0;
  const candidatePositions = new Set(candidates.map(([x, y]) => y * width + x));
  const isCandidate = (x: number, y: number) =>
    candidatePositions.has(y * width + x) && tiles[y]?.[x] === 50;
  const [startX, startY] = start;

  if (formation === "pool") {
    const radiusX = 1 + Math.floor(random() * 3);
    const radiusY = 1 + Math.floor(random() * 2);
    const pond: PointTuple[] = [];
    for (let offsetY = -radiusY; offsetY <= radiusY; offsetY += 1) {
      for (let offsetX = -radiusX; offsetX <= radiusX; offsetX += 1) {
        if (
          (offsetX * offsetX) / (radiusX * radiusX) +
            (offsetY * offsetY) / (radiusY * radiusY) <=
          1
        ) {
          if (isCandidate(startX + offsetX, startY + offsetY))
            pond.push([startX + offsetX, startY + offsetY]);
        }
      }
    }
    return pond.length >= 3 ? pond : [];
  }

  if (formation === "stream") {
    const stream: PointTuple[] = [start];
    const visited = new Set<number>([startY * width + startX]);
    const targetLength = 5 + Math.floor(random() * 7);
    while (stream.length < targetLength) {
      const [x, y] = stream[stream.length - 1];
      const next = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].filter(
        ([nextX, nextY]) =>
          isCandidate(nextX, nextY) && !visited.has(nextY * width + nextX),
      );
      if (next.length === 0) break;
      const [nextX, nextY] = next[Math.floor(random() * next.length)];
      stream.push([nextX, nextY]);
      visited.add(nextY * width + nextX);
    }
    return stream.length >= 4 ? stream : [];
  }

  if (formation === "waterfall") {
    const length = 2 + Math.floor(random() * 3);
    const direction = random() < 0.5 ? 1 : -1;
    const waterfall = Array.from({ length }, (_, index): PointTuple => [
      startX,
      startY + index * direction,
    ]);
    return waterfall.every(([x, y]) => isCandidate(x, y)) ? waterfall : [];
  }

  const spring = [start];
  const sources = [
    [startX + 1, startY],
    [startX - 1, startY],
    [startX, startY + 1],
    [startX, startY - 1],
  ].filter(([x, y]) => isCandidate(x, y));
  while (spring.length < 4 && sources.length > 0) {
    const [x, y] = sources.splice(
      Math.floor(random() * sources.length),
      1,
    )[0];
    spring.push([x, y]);
  }
  return spring;
}

export function placeCaveLiquidFeatures(
  tiles: Tile[][],
  random: () => number,
): void {
  for (const region of getCaveRegions(tiles)) {
    if (region.length < 12 || random() >= 0.65) continue;
    const candidates = getCaveInteriorCells(tiles, region);
    const featureCount = Math.min(
      3,
      Math.max(1, Math.floor(candidates.length / 180) + 1),
    );
    for (let index = 0; index < featureCount; index += 1) {
      const available = candidates.filter(
        ([x, y]) => tiles[y][x] === 50,
      );
      if (available.length === 0) break;
      const formation = (["pool", "stream", "waterfall", "spring"] as const)[
        Math.floor(random() * 4)
      ];
      let pattern: PointTuple[] = [];
      for (let attempt = 0; attempt < 12 && pattern.length === 0; attempt += 1) {
        const start = available[Math.floor(random() * available.length)];
        pattern = getCaveFormationPattern(
          tiles,
          available,
          start,
          formation,
          random,
        );
      }
      if (pattern.length === 0) continue;

      const isLava = random() < 0.2;
      const liquidTile = isLava ? CAVE_LAVA_TILE : CAVE_WATER_TILE;
      const formationTile =
        formation === "waterfall"
          ? isLava
            ? CAVE_LAVA_FALL_TILE
            : CAVE_WATERFALL_TILE
          : formation === "spring"
            ? isLava
              ? CAVE_LAVA_VENT_TILE
              : CAVE_SPRING_TILE
            : liquidTile;
      for (const [patternIndex, [x, y]] of pattern.entries()) {
        tiles[y][x] =
          formation === "spring" && patternIndex === 0
            ? formationTile
            : formation === "waterfall"
              ? formationTile
              : liquidTile;
      }
    }
  }
}