import { describe, expect, it } from "vitest";
import {
  CAVE_BREACH_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  WALL_TILE,
  WATER_TILE,
} from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";
import { computeContourSegments } from "./cartographicField";
import { getProceduralCartographicTextureAtlas } from "./cartographicTextures";
import {
  getCartographicScale,
  getCartographicLiquidSpritePlacements,
  getCartographicSpritePlacements,
  isCartographicLiquidTextureSheetCompatible,
  isCartographicTextureSheetCompatible,
  renderCartographicImage,
} from "./cartographicMap";

function createDungeon(width: number, height: number, floors: ReadonlyArray<[number, number, Tile?]>): Dungeon {
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => WALL_TILE as Tile));
  for (const [x, y, tile] of floors) tiles[y][x] = tile ?? FLOOR_TILE;
  return { width, height, tiles, roomDetails: [], rooms: [] } as unknown as Dungeon;
}

function squareRoom(): Dungeon {
  const floors: Array<[number, number]> = [];
  for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) floors.push([x, y]);
  return createDungeon(10, 10, floors);
}

const OPTIONS = { showWater: true, showLava: true, showWalls: true, showGrid: false, targetScale: 8 };

describe("cartographic renderer", () => {
  it("respects the pixel budget when choosing a scale", () => {
    expect(getCartographicScale(100, 100, 28, 6_000_000)).toBeLessThanOrEqual(28);
    expect(getCartographicScale(1000, 1000, 28, 6_000_000)).toBe(3);
    expect(getCartographicScale(10, 10, 20, 1_000_000)).toBe(20);
  });

  it("validates the selected texture crops against the supplied sheet size", () => {
    expect(isCartographicTextureSheetCompatible(592, 240)).toBe(true);
    expect(isCartographicTextureSheetCompatible(591, 768)).toBe(false);
    expect(isCartographicTextureSheetCompatible(1122, 768)).toBe(true);
    expect(isCartographicLiquidTextureSheetCompatible(160, 528)).toBe(true);
    expect(isCartographicLiquidTextureSheetCompatible(159, 528)).toBe(false);
    expect(isCartographicLiquidTextureSheetCompatible(160, 527)).toBe(false);
  });

  it("is deterministic and sized from the tile grid", () => {
    const dungeon = squareRoom();
    const first = renderCartographicImage(dungeon, OPTIONS);
    const second = renderCartographicImage(dungeon, OPTIONS);
    expect(first.width).toBe(dungeon.width * first.scale);
    expect(first.height).toBe(dungeon.height * first.scale);
    expect(first.data.length).toBe(first.width * first.height * 4);
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true);
  });

  it("paints floors lighter than the surrounding rock", () => {
    const dungeon = squareRoom();
    const image = renderCartographicImage(dungeon, OPTIONS);
    const luminance = (tileX: number, tileY: number): number => {
      const px = Math.floor((tileX + 0.5) * image.scale);
      const py = Math.floor((tileY + 0.5) * image.scale);
      const offset = (py * image.width + px) * 4;
      return image.data[offset] + image.data[offset + 1] + image.data[offset + 2];
    };
    expect(luminance(5, 5)).toBeGreaterThan(luminance(0, 0) + 150);
  });

  it("distinguishes corridors from room floors", () => {
    const dungeon = createDungeon(8, 4, [[1, 1], [2, 1], [3, 1, CORRIDOR_TILE], [4, 1, CORRIDOR_TILE]]);
    const image = renderCartographicImage(dungeon, OPTIONS);
    const pixel = (tileX: number): string => {
      const offset = (Math.floor(1.5 * image.scale) * image.width + Math.floor((tileX + 0.5) * image.scale)) * 4;
      return `${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`;
    };
    expect(pixel(1)).not.toBe(pixel(4));
  });

  it("uses only the clean floor and brick crops on matching architectural tiles", () => {
    const dungeon = createDungeon(7, 7, [
      [3, 2, FLOOR_TILE],
      [2, 3, FLOOR_TILE],
      [3, 3, DOOR_TILE],
      [4, 3, WATER_TILE],
      [3, 4, CORRIDOR_TILE],
      [4, 4, LAVA_TILE],
    ]);
    const placements = getCartographicSpritePlacements(dungeon, OPTIONS, 8);
    const floorSprites = placements.filter((placement) => placement.layer === "floor");
    const wallSprite = placements.find(
      (placement) => placement.layer === "wall" && placement.x === 1 * 8 && placement.y === 3 * 8,
    );

    expect(floorSprites).toHaveLength(3);
    expect(new Set(floorSprites.map((placement) => `${placement.sourceX},${placement.sourceY}`)))
      .toEqual(new Set(["448,208"]));
    expect(wallSprite).toMatchObject({
      sourceX: 560,
      sourceY: 128,
      sourceWidth: 32,
      sourceHeight: 32,
      width: 8,
      height: 8,
    });
    expect(placements.every((placement) => placement.layer === "floor" || placement.layer === "wall")).toBe(true);
  });

  it("does not use embedded room art in door openings", () => {
    const horizontal = createDungeon(8, 7, [
      [3, 2, FLOOR_TILE],
      [4, 2, FLOOR_TILE],
      [3, 4, FLOOR_TILE],
      [4, 4, FLOOR_TILE],
      [3, 3, DOOR_TILE],
      [4, 3, DOOR_TILE],
    ]);
    const horizontalPlacements = getCartographicSpritePlacements(horizontal, OPTIONS, 8);
    expect(horizontalPlacements.some((placement) => (
      placement.x === 3 * 8 && placement.y === 3 * 8
    ) || (
      placement.x === 4 * 8 && placement.y === 3 * 8
    ))).toBe(false);

    const vertical = createDungeon(7, 8, [
      [2, 3, FLOOR_TILE],
      [4, 3, FLOOR_TILE],
      [2, 4, FLOOR_TILE],
      [4, 4, FLOOR_TILE],
      [3, 3, DOOR_TILE],
      [3, 4, DOOR_TILE],
    ]);
    const verticalPlacements = getCartographicSpritePlacements(vertical, OPTIONS, 8);
    expect(verticalPlacements.some((placement) => (
      placement.x === 3 * 8 && placement.y === 3 * 8
    ) || (
      placement.x === 3 * 8 && placement.y === 4 * 8
    ))).toBe(false);
  });

  it("does not texture caves or wall cells that do not border architectural floors", () => {
    const dungeon = createDungeon(5, 5, [
      [2, 2, FLOOR_TILE],
      [3, 2, CAVE_TILE],
      [2, 3, CAVE_BREACH_TILE],
    ]);
    const placements = getCartographicSpritePlacements(dungeon, OPTIONS, 8);
    const floorSprites = placements.filter((placement) => placement.layer === "floor");

    expect(floorSprites.map((placement) => `${placement.x / 8},${placement.y / 8}`)).toEqual(["2,2"]);
    expect(placements.some((placement) => placement.layer === "wall" && placement.x === 0 && placement.y === 0))
      .toBe(false);
    expect(placements.some((placement) => placement.layer === "wall" && placement.x === 4 * 8 && placement.y === 2 * 8))
      .toBe(false);
  });

  it("rotates wall tiles into diagonal room corners without changing the dungeon grid", () => {
    const dungeon = createDungeon(5, 5, [[2, 2, FLOOR_TILE]]);
    const cornerPlacements = getCartographicSpritePlacements(dungeon, OPTIONS, 8)
      .filter((placement) => placement.layer === "wall")
      .filter((placement) => (
        (placement.x === 1 * 8 || placement.x === 3 * 8)
        && (placement.y === 1 * 8 || placement.y === 3 * 8)
      ));

    expect(cornerPlacements.map(({ x, y, rotation }) => [x / 8, y / 8, rotation])).toEqual([
      [1, 1, 90],
      [3, 1, 0],
      [1, 3, 0],
      [3, 3, 90],
    ]);
    expect(dungeon.tiles[2][2]).toBe(FLOOR_TILE);
    expect(dungeon.tiles[1][1]).toBe(WALL_TILE);
  });

  it("uses the liquid atlas only for matching water and lava tiles and respects visibility toggles", () => {
    const dungeon = createDungeon(8, 3, [
      [1, 1, WATER_TILE],
      [2, 1, CAVE_WATER_TILE],
      [3, 1, LAVA_TILE],
      [4, 1, CAVE_LAVA_TILE],
      [5, 1, CAVE_WATERFALL_TILE],
      [6, 1, CAVE_LAVA_FALL_TILE],
    ]);
    const placements = getCartographicLiquidSpritePlacements(dungeon, OPTIONS, 8);

    expect(placements.map(({ layer, x, y, sourceX, sourceY }) => [
      layer,
      x / 8,
      y / 8,
      sourceX,
      sourceY,
    ])).toEqual([
      ["water", 1, 1, 64, 64],
      ["water", 2, 1, 64, 64],
      ["lava", 3, 1, 64, 432],
      ["lava", 4, 1, 64, 432],
    ]);
    expect(getCartographicLiquidSpritePlacements(
      dungeon,
      { ...OPTIONS, showWater: false },
      8,
    ).map(({ layer }) => layer)).toEqual(["lava", "lava"]);
    expect(getCartographicLiquidSpritePlacements(
      dungeon,
      { ...OPTIONS, showLava: false },
      8,
    ).map(({ layer }) => layer)).toEqual(["water", "water"]);
  });

  it("adds cached stone relief and fibrous paper variation to the map", () => {
    const textureAtlas = getProceduralCartographicTextureAtlas(16);
    const floors: Array<[number, number]> = [];
    for (let y = 1; y < 5; y += 1) {
      for (let x = 1; x < 5; x += 1) floors.push([x, y]);
    }
    const image = renderCartographicImage(
      createDungeon(6, 6, floors),
      { ...OPTIONS, targetScale: 16 },
    );
    const pixelColors = (tileX: number, tileY: number): Set<string> => {
      const colors = new Set<string>();
      for (let py = tileY * image.scale; py < (tileY + 1) * image.scale; py += 1) {
        for (let px = tileX * image.scale; px < (tileX + 1) * image.scale; px += 1) {
          const offset = (py * image.width + px) * 4;
          colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
        }
      }
      return colors;
    };

    expect(getProceduralCartographicTextureAtlas(16)).toBe(textureAtlas);
    expect(new Set(textureAtlas.stoneRelief).size).toBeGreaterThan(8);
    expect(new Set(textureAtlas.wallRelief).size).toBeGreaterThan(8);
    expect(new Set(textureAtlas.parchmentRelief).size).toBeGreaterThan(3);
    expect(pixelColors(2, 2).size).toBeGreaterThan(8);
    expect(pixelColors(0, 0).size).toBeGreaterThan(3);
  });

  it("limits wall block relief and outlines to the wall layer", () => {
    const dungeon = squareRoom();
    const textured = renderCartographicImage(dungeon, OPTIONS);
    const plain = renderCartographicImage(dungeon, { ...OPTIONS, showWalls: false });
    const x = Math.floor(2.1 * textured.scale);
    const y = Math.floor(4.5 * textured.scale);
    const offset = (y * textured.width + x) * 4;
    expect(textured.data.slice(offset, offset + 3)).not.toEqual(plain.data.slice(offset, offset + 3));
  });
});

describe("contour segments", () => {
  it("surrounds an isolated room with a closed ring around its footprint", () => {
    const segments = computeContourSegments(squareRoom());
    expect(segments.length).toBeGreaterThan(16);
    for (const segment of segments) {
      for (const [x, y] of [[segment.x1, segment.y1], [segment.x2, segment.y2]]) {
        expect(x).toBeGreaterThan(2.5);
        expect(x).toBeLessThan(7.5);
        expect(y).toBeGreaterThan(2.5);
        expect(y).toBeLessThan(7.5);
      }
    }
    const key = (x: number, y: number): string => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    const degree = new Map<string, number>();
    for (const segment of segments) {
      for (const point of [key(segment.x1, segment.y1), key(segment.x2, segment.y2)]) {
        degree.set(point, (degree.get(point) ?? 0) + 1);
      }
    }
    expect([...degree.values()].every((count) => count === 2)).toBe(true);
  });

  it("rounds the corners of the room", () => {
    const corners = computeContourSegments(squareRoom()).flatMap((segment) => [
      [segment.x1, segment.y1],
      [segment.x2, segment.y2],
    ]);
    const nearestToCorner = Math.min(...corners.map(([x, y]) => Math.hypot(x - 3, y - 3)));
    expect(nearestToCorner).toBeGreaterThan(0.1);
  });

  it("returns nothing for a fully solid map", () => {
    expect(computeContourSegments(createDungeon(6, 6, []))).toEqual([]);
  });
});
