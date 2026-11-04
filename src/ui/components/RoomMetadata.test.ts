import { describe, expect, it } from "vitest";
import { DEFAULT_DUNGEON_PARAMETERS, generateDungeonV1 } from "../../dungeon";
import { createRoomMetadataFields, roomMetadataSections } from "./RoomMetadata";

describe("room metadata", () => {
  it("provides every structural, operational, and narrative field for generated rooms", () => {
    const seed = 814_205;
    const dungeon = generateDungeonV1("bsp", seed, {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 64,
      height: 48,
      roomCount: 6,
    });
    const room = dungeon.roomDetails[0];
    expect(room).toBeDefined();
    if (!room) throw new Error("The generated dungeon did not contain a room.");

    const fields = createRoomMetadataFields(
      room,
      room.roomType.title,
      seed,
      dungeon,
      room.roomType.description,
    );
    const properties = new Set(fields.map((field) => field.property));

    expect(roomMetadataSections.every((section) => (
      section.properties.every((property) => properties.has(property))
    ))).toBe(true);
    expect(fields.find((field) => field.property === "id")?.value)
      .toBe(`room-${seed}-${room.number.toString().padStart(2, "0")}`);
  });
});
