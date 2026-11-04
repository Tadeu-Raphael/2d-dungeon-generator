import type { Tile } from "../types";
import { FLOOR_TILE, WALL_TILE } from "../tiles";
import { createTileGrid } from "./grid";

export function generateDrunkard(
  width: number,
  height: number,
  random: () => number,
  coveragePercent: number,
): Tile[][] {
  const tiles = createTileGrid(width, height);
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);
  const targetFloorCount = Math.floor(width * height * coveragePercent / 100);
  let floorCount = 0;

  for (let step = 0; step < width * height * 30 && floorCount < targetFloorCount; step += 1) {
    if (tiles[y][x] === WALL_TILE) {
      tiles[y][x] = FLOOR_TILE;
      floorCount += 1;
    }
    const direction = Math.floor(random() * 4);
    if (direction === 0) x += 1;
    else if (direction === 1) x -= 1;
    else if (direction === 2) y += 1;
    else y -= 1;
    x = Math.max(1, Math.min(width - 2, x));
    y = Math.max(1, Math.min(height - 2, y));
  }

  return tiles;
}