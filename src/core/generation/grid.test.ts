import { describe, expect, it } from "vitest";
import { FLOOR_TILE, WALL_TILE } from "../tiles";
import { createTileGrid } from "./grid";

describe("createTileGrid", () => {
  it("creates a wall-filled grid with independent rows", () => {
    const grid = createTileGrid(3, 2);

    expect(grid).toEqual([
      [WALL_TILE, WALL_TILE, WALL_TILE],
      [WALL_TILE, WALL_TILE, WALL_TILE],
    ]);

    grid[0][1] = FLOOR_TILE;
    expect(grid[1][1]).toBe(WALL_TILE);
  });

  it("supports an explicit initial tile", () => {
    expect(createTileGrid(2, 1, FLOOR_TILE)).toEqual([
      [FLOOR_TILE, FLOOR_TILE],
    ]);
  });
});
