import { describe, expect, it } from "vitest";
import { DOOR_TILE, FLOOR_TILE, SECRET_DOOR_TILE, WALL_TILE } from "../dungeon";
import type { Tile } from "../dungeon";
import { getDoorwayDetails, getDoorwayDrawing, getDoorwayFootprint, getDoorwayGroups } from "./doorwayLayout";

function createTiles(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () => Array(width).fill(FLOOR_TILE));
}

describe("getDoorwayGroups", () => {
  it.each([
    { width: 2 },
    { width: 3 },
  ])("groups a horizontal $width-tile opening into one grid-aligned doorway", ({ width }) => {
    const tiles = createTiles(width + 2, 5);
    for (let x = 1; x <= width; x += 1) tiles[2][x] = DOOR_TILE;

    const groups = getDoorwayGroups(tiles);

    expect(groups).toHaveLength(1);
    expect(groups[0].axis).toBe("horizontal");
    expect(getDoorwayFootprint(groups[0])).toEqual({
      x: 1,
      y: 2,
      width,
      height: 1,
    });
  });

  it("groups a vertical opening and keeps diagonal and different-type doors separate", () => {
    const tiles = createTiles(5, 5);
    tiles[1][2] = DOOR_TILE;
    tiles[2][2] = DOOR_TILE;
    tiles[3][3] = DOOR_TILE;
    tiles[1][4] = SECRET_DOOR_TILE;

    const groups = getDoorwayGroups(tiles);

    expect(groups).toHaveLength(3);
    expect(groups[0].axis).toBe("vertical");
    expect(getDoorwayFootprint(groups[0])).toEqual({
      x: 2,
      y: 1,
      width: 1,
      height: 2,
    });
    expect(groups.slice(1).every((group) => group.positions.length === 1)).toBe(true);
  });

  it("keeps stacked doors along a passage separate from a wide door across it", () => {
    const tiles = createTiles(5, 6);
    for (let y = 0; y < 6; y += 1) {
      tiles[y][0] = WALL_TILE;
      tiles[y][2] = WALL_TILE;
      tiles[y][4] = WALL_TILE;
    }
    tiles[2][1] = DOOR_TILE;
    tiles[3][1] = DOOR_TILE;

    const groups = getDoorwayGroups(tiles);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.positions.length === 1)).toBe(true);
  });

  it("joins the leaves of vertical and horizontal double doors with handles and a latch", () => {
    const vertical = createTiles(5, 5);
    vertical[1][2] = DOOR_TILE;
    vertical[2][2] = DOOR_TILE;
    const horizontal = createTiles(5, 5);
    horizontal[2][1] = DOOR_TILE;
    horizontal[2][2] = DOOR_TILE;

    for (const tiles of [vertical, horizontal]) {
      const [group] = getDoorwayGroups(tiles);
      const details = getDoorwayDetails(group, 10);
      expect(details.handles).toHaveLength(2);
      expect(details.latch).not.toBeNull();
      expect(details.seam).not.toBeNull();
      const [x1, y1, x2, y2] = details.latch!;
      expect(details.handles[0]).toEqual({ x: x1, y: y1 });
      expect(details.handles[1]).toEqual({ x: x2, y: y2 });
    }
  });

  it("splits neighbouring doors of different variants and draws each variant differently", () => {
    const tiles = createTiles(5, 5);
    tiles[2][1] = DOOR_TILE;
    tiles[2][2] = DOOR_TILE;
    const groups = getDoorwayGroups(tiles, { "1,2": "gate", "2,2": "grate" });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.variant).sort()).toEqual(["gate", "grate"]);
    const signature = (variant: "gate" | "grate" | "open" | "destroyed" | "reinforced" | "locked") => {
      const [group] = getDoorwayGroups(createTiles(5, 5).map((row, y) => row.map((tile, x) => (
        x === 2 && y === 2 ? DOOR_TILE : tile
      ))), { "2,2": variant });
      return JSON.stringify(getDoorwayDrawing(group, 16));
    };
    const variants = ["gate", "grate", "open", "destroyed", "reinforced", "locked"] as const;
    expect(new Set(variants.map(signature)).size).toBe(variants.length);
  });

  it("keeps an irregular connected cluster from becoming one oversized doorway", () => {
    const tiles = createTiles(4, 4);
    tiles[1][1] = DOOR_TILE;
    tiles[1][2] = DOOR_TILE;
    tiles[2][1] = DOOR_TILE;

    const groups = getDoorwayGroups(tiles);

    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.positions.length === 1)).toBe(true);
  });
});
