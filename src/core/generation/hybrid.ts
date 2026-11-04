import type { Tile } from "../types";
import { WALL_TILE, FLOOR_TILE, CORRIDOR_TILE, CAVE_TILE, CAVE_CONNECTION_WALL_TILE, CAVE_BREACH_TILE } from "../tiles";
import { bsGenerateBsp as generateBsp } from "./bsp";
import { createTileGrid } from "./grid";
import { generateCellular } from "./cellular";
import { generateDrunkard } from "./drunkard";
import { createRandom } from "../random";
import type { GeneratedRoom, DungeonParameters } from "../../dungeon";

export function generateHybrid(
  width: number,
  height: number,
  seed: number,
  parameters: DungeonParameters,
  includeCellular = true,
  includeDrunkard = true,
): { tiles: Tile[][]; rooms: GeneratedRoom[] } {
  const bsp = generateBsp(
    width,
    height,
    createRandom(seed),
    parameters.roomCount,
    parameters.corridorWidth,
    parameters.corridorCompactness,
    parameters.roomShapeFrequencies,
    parameters.roomSizeDistributionEnabled,
    parameters.roomSizeFrequencies,
    parameters.rectangularRoomRatioFrequencies,
  );
  const caves = includeCellular
    ? generateCellular(
      width,
      height,
      createRandom(seed ^ 0x9e3779b9),
      parameters.cellularFillPercent,
      parameters.cellularIterations,
    )
    : null;
  const paths = includeDrunkard
    ? generateDrunkard(
      width,
      height,
      createRandom(seed ^ 0x85ebca6b),
      parameters.drunkardCoveragePercent,
    )
    : null;
  const tiles = createTileGrid(width, height);
  const queue: Array<[number, number]> = [];
  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bsp.tiles[y][x] !== WALL_TILE) {
        tiles[y][x] = bsp.tiles[y][x];
        visited[y][x] = true;
        queue.push([x, y]);
      }
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    for (const [nextX, nextY] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (
        nextX < 0
        || nextY < 0
        || nextX >= width
        || nextY >= height
        || visited[nextY][nextX]
      ) continue;
      const isOpenInCellular = caves === null || caves[nextY][nextX] !== WALL_TILE;
      const isOpenInDrunkard = paths === null || paths[nextY][nextX] !== WALL_TILE;
      const touchesCorridor = [
        [nextX + 1, nextY],
        [nextX - 1, nextY],
        [nextX, nextY + 1],
        [nextX, nextY - 1],
      ].some(([corridorX, corridorY]) => bsp.tiles[corridorY]?.[corridorX] === CORRIDOR_TILE);
      if (isOpenInCellular && isOpenInDrunkard && !touchesCorridor) {
        tiles[nextY][nextX] = caves === null ? FLOOR_TILE : CAVE_TILE;
        visited[nextY][nextX] = true;
        queue.push([nextX, nextY]);
      }
    }
  }
  if (caves !== null) {
    placeCaveConnectionWalls(
      tiles,
      bsp.rooms,
      createRandom(seed ^ 0xc2b2ae35),
    );
  }
  return { tiles, rooms: bsp.rooms };
}

export function placeCaveConnectionWalls(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
): void {
  const width = tiles[0]?.length ?? 0;
  const boundaries: Array<Map<number, [number, number]>> = [];
  for (const room of rooms) {
    const boundary = new Map<number, [number, number]>();
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (tiles[y]?.[x] !== FLOOR_TILE) continue;
        for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const wallX = x + offsetX;
          const wallY = y + offsetY;
          const isOutsideRoom = (
            wallX < room.x
            || wallX >= room.x + room.width
            || wallY < room.y
            || wallY >= room.y + room.height
          );
          if (isOutsideRoom && tiles[wallY]?.[wallX] === CAVE_TILE) {
            boundary.set(wallY * width + wallX, [wallX, wallY]);
          }
        }
      }
    }
    boundaries.push(boundary);
  }

  const boundaryKeys = new Set(boundaries.flatMap((boundary) => [...boundary.keys()]));
  for (const boundary of boundaries) {
    for (const [x, y] of boundary.values()) tiles[y][x] = WALL_TILE;
  }

  const markedWalls = new Set<number>();
  for (const boundary of boundaries) {
    const candidates = [...boundary.entries()].filter(([position, [x, y]]) => (
      !markedWalls.has(position)
      && [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([caveX, caveY]) => (
        tiles[caveY]?.[caveX] === CAVE_TILE
        && !boundaryKeys.has(caveY * width + caveX)
      ))
    ));
    if (candidates.length === 0 || random() >= 0.65) continue;
    const [position, [wallX, wallY]] = candidates[Math.floor(random() * candidates.length)];
    markedWalls.add(position);
    const connectionType = random();
    tiles[wallY][wallX] = connectionType < 0.34
      ? CAVE_TILE
      : connectionType < 0.67
        ? CAVE_CONNECTION_WALL_TILE
        : CAVE_BREACH_TILE;
  }
}