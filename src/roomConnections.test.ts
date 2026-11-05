import { describe, expect, it } from "vitest";
import {
  DOOR_TILE,
  FLOOR_TILE,
  SECRET_DOOR_TILE,
  WALL_TILE,
} from "./dungeon";
import type { Tile } from "./dungeon";
import { getRoomConnectionIndex } from "./roomConnections";
import type { RoomConnectionPlan } from "./roomConnections";
import type { RoomNumberBounds } from "./rendering/dungeonTileSemantics";

function createDungeon(tiles: Tile[][], roomDetails: RoomNumberBounds[]) {
  return { width: tiles[0]?.length ?? 0, tiles, roomDetails };
}

describe("room connection index", () => {
  it("uses explicit plan edges and preserves their connection properties", () => {
    const dungeon = createDungeon(
      [[FLOOR_TILE, FLOOR_TILE, FLOOR_TILE, FLOOR_TILE, FLOOR_TILE]],
      [
        { number: 1, x: 0, y: 0, width: 1, height: 1 },
        { number: 2, x: 4, y: 0, width: 1, height: 1 },
      ],
    );
    const plan: RoomConnectionPlan = {
      rooms: [{ id: "entrance" }, { id: "vault" }],
      connections: [{
        sourceRoomId: "entrance",
        targetRoomId: "vault",
        connectionType: "secret-door",
        isSecret: true,
        isLocked: true,
        isBlocked: false,
        isOptional: true,
      }],
    };

    const connections = getRoomConnectionIndex(dungeon, plan);

    expect(connections.get(1)).toEqual([{
      roomNumber: 2,
      connectionType: "secret-door",
      isSecret: true,
      isLocked: true,
      isBlocked: false,
      isOptional: true,
    }]);
    expect(connections.get(2)?.[0].roomNumber).toBe(1);
  });

  it("derives direct door connections from the rasterized map", () => {
    const dungeon = createDungeon(
      [[FLOOR_TILE, FLOOR_TILE, DOOR_TILE, FLOOR_TILE, FLOOR_TILE]],
      [
        { number: 1, x: 0, y: 0, width: 1, height: 1 },
        { number: 2, x: 4, y: 0, width: 1, height: 1 },
      ],
    );

    const connections = getRoomConnectionIndex(dungeon);

    expect(connections.get(1)).toEqual([{
      roomNumber: 2,
      connectionType: "door",
      isSecret: false,
      isLocked: false,
      isBlocked: false,
      isOptional: false,
    }]);
    expect(connections.get(2)?.[0].roomNumber).toBe(1);
  });

  it("identifies secret doors and does not cross intervening rooms", () => {
    const secretDoorDungeon = createDungeon(
      [[FLOOR_TILE, FLOOR_TILE, SECRET_DOOR_TILE, FLOOR_TILE, FLOOR_TILE]],
      [
        { number: 1, x: 0, y: 0, width: 1, height: 1 },
        { number: 2, x: 4, y: 0, width: 1, height: 1 },
      ],
    );
    expect(getRoomConnectionIndex(secretDoorDungeon).get(1)?.[0].connectionType)
      .toBe("secret-door");

    const threeRoomDungeon = createDungeon(
      [[FLOOR_TILE, FLOOR_TILE, FLOOR_TILE, FLOOR_TILE, FLOOR_TILE]],
      [
        { number: 1, x: 0, y: 0, width: 1, height: 1 },
        { number: 2, x: 2, y: 0, width: 1, height: 1 },
        { number: 3, x: 4, y: 0, width: 1, height: 1 },
      ],
    );
    expect(getRoomConnectionIndex(threeRoomDungeon).get(1)?.map((item) => item.roomNumber))
      .toEqual([2]);
  });

  it("does not infer connections across walls", () => {
    const dungeon = createDungeon(
      [[FLOOR_TILE, WALL_TILE, FLOOR_TILE, WALL_TILE, FLOOR_TILE]],
      [
        { number: 1, x: 0, y: 0, width: 1, height: 1 },
        { number: 2, x: 4, y: 0, width: 1, height: 1 },
      ],
    );

    expect(getRoomConnectionIndex(dungeon).get(1)).toEqual([]);
  });
});
