import { describe, expect, it } from "vitest";
import {
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "../dungeon";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  getVisibleTile,
} from "./dungeonTileSemantics";

describe("shared dungeon tile visibility", () => {
  it("hides water and lava without changing the other liquid layer", () => {
    expect(getVisibleTile(WATER_TILE, false, true)).toBe(FLOOR_TILE);
    expect(getVisibleTile(LAVA_TILE, false, true)).toBe(LAVA_TILE);
    expect(getVisibleTile(LAVA_TILE, true, false)).toBe(FLOOR_TILE);
    expect(getVisibleTile(WATER_TILE, true, false)).toBe(WATER_TILE);
  });

  it("maps cave liquid variants to cave floor only when their layer is hidden", () => {
    expect([...CAVE_WATER_TILES]).toEqual([
      CAVE_WATER_TILE,
      CAVE_WATERFALL_TILE,
      CAVE_SPRING_TILE,
    ]);
    expect([...CAVE_LAVA_TILES]).toEqual([
      CAVE_LAVA_TILE,
      CAVE_LAVA_FALL_TILE,
      CAVE_LAVA_VENT_TILE,
    ]);
    for (const tile of CAVE_WATER_TILES) {
      expect(getVisibleTile(tile, false, true)).toBe(CAVE_TILE);
      expect(getVisibleTile(tile, true, false)).toBe(tile);
    }
    for (const tile of CAVE_LAVA_TILES) {
      expect(getVisibleTile(tile, true, false)).toBe(CAVE_TILE);
      expect(getVisibleTile(tile, false, true)).toBe(tile);
    }
  });
});
