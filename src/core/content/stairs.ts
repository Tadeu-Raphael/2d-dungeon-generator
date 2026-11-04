import type { Tile, PointTuple } from "../types";
import type { EntranceMode, GeneratedRoom, Rect } from "../../dungeon";

export function roomCenter(room: Rect): [number, number] {
  return [Math.floor(room.x + room.width / 2), Math.floor(room.y + room.height / 2)];
}

export function findRoomStairPosition(
  tiles: Tile[][],
  room: Rect,
  random: () => number,
): PointTuple | undefined {
  const candidates: PointTuple[] = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (tiles[y][x] === 1) candidates.push([x, y]);
    }
  }
  if (candidates.length === 0) return undefined;

  const [centerX, centerY] = roomCenter(room);
  const distances = candidates.map(([x, y]) => Math.abs(x - centerX) + Math.abs(y - centerY));
  const maximumDistance = Math.max(...distances);
  const edgeCandidates = candidates.filter((_, index) => distances[index] === maximumDistance);
  return edgeCandidates[Math.floor(random() * edgeCandidates.length)];
}

export function isStraightCorridorTile(tiles: Tile[][], x: number, y: number, corridorWidth: number): boolean {
  if (tiles[y]?.[x] !== 2) return false;
  const width = Math.max(1, Math.min(3, Math.floor(corridorWidth)));
  const offsets = Array.from(
    { length: width },
    (_, index) => index - Math.floor((width - 1) / 2),
  );
  const hasStraightRun = (horizontal: boolean): boolean => {
    const position = horizontal ? y : x;
    for (const offset of offsets) {
      const center = position - offset;
      const lanePositions = offsets.map((laneOffset) => center + laneOffset);
      if (!lanePositions.includes(position)) continue;
      const hasForwardAndBackwardNeighbors = lanePositions.every((lanePosition) => (
        horizontal
          ? tiles[lanePosition]?.[x - 1] === 2 && tiles[lanePosition]?.[x + 1] === 2
          : tiles[y - 1]?.[lanePosition] === 2 && tiles[y + 1]?.[lanePosition] === 2
      ));
      if (!hasForwardAndBackwardNeighbors) continue;

      const minimumLane = Math.min(...lanePositions);
      const maximumLane = Math.max(...lanePositions);
      const hasCrossing = horizontal
        ? Array.from({ length: 3 }, (_, index) => x + index - 1).some((laneX) => (
          tiles[minimumLane - 1]?.[laneX] === 2
          || tiles[maximumLane + 1]?.[laneX] === 2
        ))
        : Array.from({ length: 3 }, (_, index) => y + index - 1).some((laneY) => (
          tiles[laneY]?.[minimumLane - 1] === 2
          || tiles[laneY]?.[maximumLane + 1] === 2
        ));
      if (!hasCrossing) return true;
    }
    return false;
  };
  return hasStraightRun(true) || hasStraightRun(false);
}

export function findFarthestOpenPoint(
  tiles: Tile[][],
  origin: PointTuple | undefined,
  random: () => number,
  corridorWidth: number,
): PointTuple | undefined {
  const candidates: PointTuple[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === 1 || isStraightCorridorTile(tiles, x, y, corridorWidth)) {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return undefined;
  if (!origin) return candidates[Math.floor(random() * candidates.length)];

  let farthestDistance = -1;
  let farthestCandidates: PointTuple[] = [];
  for (const point of candidates) {
    if (point[0] === origin[0] && point[1] === origin[1]) continue;
    const distance = Math.abs(point[0] - origin[0]) + Math.abs(point[1] - origin[1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestCandidates = [point];
    } else if (distance === farthestDistance) {
      farthestCandidates.push(point);
    }
  }
  if (farthestCandidates.length === 0) return undefined;
  return farthestCandidates[Math.floor(random() * farthestCandidates.length)];
}

export function findCorridorStairPosition(
  tiles: Tile[][],
  excluded: PointTuple | undefined,
  random: () => number,
  corridorWidth: number,
): PointTuple | undefined {
  const candidates: PointTuple[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (
        isStraightCorridorTile(tiles, x, y, corridorWidth)
        && (excluded === undefined || x !== excluded[0] || y !== excluded[1])
      ) {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)];
}

export function findStairPosition(
  tiles: Tile[][],
  room: GeneratedRoom | undefined,
  excluded: PointTuple | undefined,
  random: () => number,
  corridorWidth: number,
): PointTuple | undefined {
  if (random() < 0.35) {
    const corridorPosition = findCorridorStairPosition(tiles, excluded, random, corridorWidth);
    if (corridorPosition) return corridorPosition;
  }

  const roomPosition = room ? findRoomStairPosition(tiles, room, random) : undefined;
  if (roomPosition && (excluded === undefined || roomPosition[0] !== excluded[0] || roomPosition[1] !== excluded[1])) {
    return roomPosition;
  }
  return findFarthestOpenPoint(tiles, excluded, random, corridorWidth);
}

export function carveExteriorAccess(
  tiles: Tile[][],
  room: GeneratedRoom,
  accessTile: Tile,
): void {
  const width = tiles[0].length;
  const height = tiles.length;
  const routes: Array<{ distance: number; x: number; y: number; dx: number; dy: number }> = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (tiles[y][x] !== 1) continue;
      routes.push(
        { distance: x, x, y, dx: -1, dy: 0 },
        { distance: width - 1 - x, x, y, dx: 1, dy: 0 },
        { distance: y, x, y, dx: 0, dy: -1 },
        { distance: height - 1 - y, x, y, dx: 0, dy: 1 },
      );
    }
  }
  if (routes.length === 0) return;
  routes.sort((first, second) => first.distance - second.distance);
  const route = routes[0];
  let x = route.x;
  let y = route.y;

  while (x >= 0 && x < width && y >= 0 && y < height) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
      tiles[y][x] = accessTile;
      return;
    }
    if (tiles[y][x] === 0) tiles[y][x] = 2;
    x += route.dx;
    y += route.dy;
  }
}

export function placeStairs(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
  entranceMode: EntranceMode,
  corridorWidth: number,
): void {
  let upstairs = entranceMode === "upper-stairs" && rooms[0]
    ? findRoomStairPosition(tiles, rooms[0], random)
    : findStairPosition(tiles, rooms[0], undefined, random, corridorWidth);
  let downstairs = findStairPosition(
    tiles,
    rooms.length > 1 ? rooms[rooms.length - 1] : undefined,
    upstairs,
    random,
    corridorWidth,
  );

  const usesExteriorAccess = rooms.length > 0 && entranceMode !== "upper-stairs";
  if (usesExteriorAccess) {
    const accessTile = entranceMode === "exterior-entrance"
      ? 7
      : 8;
    carveExteriorAccess(tiles, rooms[0], accessTile);
  } else {
    if (!upstairs) upstairs = findFarthestOpenPoint(tiles, undefined, random, corridorWidth);
    if (upstairs) tiles[upstairs[1]][upstairs[0]] = 4;
  }
  if (!downstairs) downstairs = findFarthestOpenPoint(tiles, upstairs, random, corridorWidth);
  if (upstairs && downstairs && upstairs[0] === downstairs[0] && upstairs[1] === downstairs[1]) {
    downstairs = findFarthestOpenPoint(tiles, upstairs, random, corridorWidth);
  }

  if (downstairs) tiles[downstairs[1]][downstairs[0]] = 5;
}