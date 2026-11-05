import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DOOR_TILE,
  DUNGEON_GENERATOR_VERSION_V2,
  STAIRS_DOWN_TILE,
} from "../../dungeon";
import { DUNGEON_CONCEPT_ORDER } from "../../dungeonProfiles";
import { generateDungeonPipeline } from "../../generationPipeline";
import { createRoomMapSummary } from "./roomMapSummary";

describe("room map summary", () => {
  it("reports internal map elements and resolves connected stair destinations", () => {
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: DUNGEON_CONCEPT_ORDER[0],
      seed: 18342,
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 64,
        height: 48,
        roomCount: 6,
      },
    });
    const { dungeon } = result;
    const room = dungeon.roomDetails[0];
    expect(room).toBeDefined();
    if (!room) return;

    const stairPosition = { x: room.x + 1, y: room.y + 1 };
    const doorPosition = { x: room.x + 2, y: room.y + 1 };
    dungeon.tiles[stairPosition.y][stairPosition.x] = STAIRS_DOWN_TILE;
    dungeon.tiles[doorPosition.y][doorPosition.x] = DOOR_TILE;

    const summary = createRoomMapSummary(
      dungeon,
      {
        levels: [
          { id: "lower", name: "Subsolo", verticalIndex: -1 },
          { id: "upper", name: "Nível principal", verticalIndex: 0 },
        ],
        verticalConnections: [{
          id: "stairs-main",
          sourceLevelId: "upper",
          targetLevelId: "lower",
          sourcePosition: stairPosition,
          targetPosition: { x: stairPosition.x - 1, y: stairPosition.y },
          kind: "stairs",
          direction: "bidirectional",
          metadata: {},
        }],
      },
      "upper",
    );
    const elements = summary.elementsByRoom.get(room.number) ?? [];

    expect(elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Escadaria para baixo",
        detail: expect.stringContaining("Subsolo"),
      }),
      expect.objectContaining({
        label: "Porta",
        detail: `Tile ${doorPosition.x}, ${doorPosition.y}`,
      }),
    ]));
    expect(summary.roomAreas.get(room.number)).toBeGreaterThan(0);
  });
});
