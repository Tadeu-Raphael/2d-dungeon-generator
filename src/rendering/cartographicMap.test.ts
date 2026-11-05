import { describe, expect, it } from "vitest";
import { CORRIDOR_TILE, FLOOR_TILE, WALL_TILE } from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";
import { computeContourSegments } from "./cartographicField";
import { getCartographicScale, renderCartographicImage } from "./cartographicMap";

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
