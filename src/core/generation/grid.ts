import type { Tile } from "../types";
import { WALL_TILE } from "../tiles";

export function createTileGrid(
  width: number,
  height: number,
  tile: Tile = WALL_TILE,
): Tile[][] {
  return Array.from({ length: height }, () => Array<Tile>(width).fill(tile));
}
