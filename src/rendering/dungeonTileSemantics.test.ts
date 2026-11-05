import { describe, expect, it } from "vitest";
import {
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  WATER_TILE,
} from "../dungeon";
import type { Tile } from "../dungeon";
import { ROOM_TYPE_CATEGORIES } from "../roomTypes";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  createRoomNumberGrid,
  getRoomConnectionTiles,
  getRoomFloorColor,
  getRoomFloorRgb,
  getVisibleTile,
} from "./dungeonTileSemantics";
import type { RoomNumberBounds } from "./dungeonTileSemantics";

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

describe("2D map room presentation", () => {
  it("uses muted category tints over a warm floor base", () => {
    expect(getRoomFloorRgb()).toEqual([198, 186, 160]);
    expect(getRoomFloorRgb("combat")).not.toEqual(ROOM_TYPE_CATEGORIES.combat.rgb);
    expect(getRoomFloorColor("combat")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("highlights corridor paths from a selected room without entering other rooms", () => {
    const tiles: Tile[][] = [
      [1, 1, 2, 2, 2, 1, 1],
      [1, 1, 0, 0, 2, 1, 1],
      [0, 0, 0, 0, 0, 0, 0],
    ];
    const rooms: RoomNumberBounds[] = [
      { number: 1, x: 0, y: 0, width: 2, height: 2 },
      { number: 2, x: 5, y: 0, width: 2, height: 2 },
    ];
    const roomNumbers = createRoomNumberGrid(tiles, 7, rooms);

    expect([...getRoomConnectionTiles(tiles, 7, rooms, roomNumbers, 1)].sort((a, b) => a - b))
      .toEqual([2, 3, 4]);
  });

  it("does not route highlighted connections through walls or pillars", () => {
    const rooms: RoomNumberBounds[] = [
      { number: 1, x: 0, y: 0, width: 1, height: 1 },
      { number: 2, x: 4, y: 0, width: 1, height: 1 },
    ];
    const blockingTiles: Tile[] = [0, CAVE_CONNECTION_WALL_TILE, PILLAR_TILE];
    for (const blockingTile of blockingTiles) {
      const tiles: Tile[][] = [[1, 2, blockingTile, 2, 1]];
      const roomNumbers = createRoomNumberGrid(tiles, 5, rooms);
      expect(getRoomConnectionTiles(tiles, 5, rooms, roomNumbers, 1).size).toBe(0);
    }
  });
});
