import type { Tile } from "../types";
import { FLOOR_TILE, WALL_TILE } from "../tiles";

export function createGrid(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () => Array<Tile>(width).fill(WALL_TILE));
}

export function generateCellular(
  width: number,
  height: number,
  random: () => number,
  fillPercent: number,
  iterations: number,
): Tile[][] {
  let tiles = createGrid(width, height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      tiles[y][x] = random() < fillPercent / 100 ? FLOOR_TILE : WALL_TILE;
    }
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = createGrid(width, height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if ((offsetX !== 0 || offsetY !== 0) && tiles[y + offsetY][x + offsetX] !== WALL_TILE) {
              neighbors += 1;
            }
          }
        }
        const survives = tiles[y][x] === FLOOR_TILE && neighbors >= 4;
        const isBorn = tiles[y][x] === WALL_TILE && neighbors >= 5;
        next[y][x] = survives || isBorn ? FLOOR_TILE : WALL_TILE;
      }
    }
    tiles = next;
  }

  const mainCave = largestFloorRegion(tiles);
  const connected = createGrid(width, height);
  for (const [x, y] of mainCave) connected[y][x] = FLOOR_TILE;
  return connected;
}

function largestFloorRegion(tiles: Tile[][]): Array<[number, number]> {
  const height = tiles.length;
  const width = tiles[0].length;
  const visited = createGrid(width, height);
  let largest: Array<[number, number]> = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (tiles[y][x] === WALL_TILE || visited[y][x] === FLOOR_TILE) continue;
      const region: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      visited[y][x] = FLOOR_TILE;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentX, currentY] = queue[cursor];
        region.push([currentX, currentY]);
        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ]) {
          if (tiles[nextY][nextX] !== WALL_TILE && visited[nextY][nextX] !== FLOOR_TILE) {
            visited[nextY][nextX] = FLOOR_TILE;
            queue.push([nextX, nextY]);
          }
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }
  return largest;
}