/**
 * Smooth floor fields shared by the cartographic 2D renderer and the 3D wall builder. A tile mask is
 * upsampled and blurred, so the resulting 0..1 field has rounded corners and organic contours
 * instead of the staircase edges of the raw tile grid.
 */
import { CAVE_CONNECTION_WALL_TILE, WALL_TILE } from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";

export function isFloorTile(tile: Tile | undefined): boolean {
  return tile !== undefined && tile !== WALL_TILE && tile !== CAVE_CONNECTION_WALL_TILE;
}

/** Nearest-neighbour upsample of the floor mask: 1 on floors, 0 on rock. */
export function createScaledFloorMask(
  dungeon: Dungeon,
  scale: number,
  isFloor: (tile: Tile | undefined) => boolean = isFloorTile,
): Float32Array {
  const width = dungeon.width * scale;
  const height = dungeon.height * scale;
  const mask = new Float32Array(width * height);
  for (let tileY = 0; tileY < dungeon.height; tileY += 1) {
    const row = dungeon.tiles[tileY];
    for (let tileX = 0; tileX < dungeon.width; tileX += 1) {
      if (!isFloor(row[tileX])) continue;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        const start = (tileY * scale + offsetY) * width + tileX * scale;
        mask.fill(1, start, start + scale);
      }
    }
  }
  return mask;
}

function blurHorizontal(source: Float32Array, target: Float32Array, width: number, height: number, radius: number): void {
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x += 1) sum += source[row + x];
    for (let x = 0; x < width; x += 1) {
      target[row + x] = sum / window;
      const incoming = x + radius + 1;
      const outgoing = x - radius;
      if (incoming < width) sum += source[row + incoming];
      if (outgoing >= 0) sum -= source[row + outgoing];
    }
  }
}

function blurVertical(source: Float32Array, target: Float32Array, width: number, height: number, radius: number): void {
  const window = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y += 1) sum += source[y * width + x];
    for (let y = 0; y < height; y += 1) {
      target[y * width + x] = sum / window;
      const incoming = y + radius + 1;
      const outgoing = y - radius;
      if (incoming < height) sum += source[incoming * width + x];
      if (outgoing >= 0) sum -= source[outgoing * width + x];
    }
  }
}

/** Three box-blur passes per axis approximate a Gaussian; the result is a new array. */
export function blurField(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 3,
): Float32Array {
  let current = Float32Array.from(source);
  const scratch = new Float32Array(source.length);
  if (radius < 1) return current;
  for (let pass = 0; pass < passes; pass += 1) {
    blurHorizontal(current, scratch, width, height, radius);
    blurVertical(scratch, current, width, height, radius);
  }
  return current;
}

export interface WallSegment {
  /** Endpoints in tile units. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Marching squares over the blurred floor field. Each returned segment lies on the contour where the
 * field crosses the threshold, so walls follow rounded corners and cave outlines.
 */
export function computeContourSegments(
  dungeon: Dungeon,
  samplesPerTile = 4,
  blurTiles = 0.3,
  threshold = 0.5,
  isFloor: (tile: Tile | undefined) => boolean = isFloorTile,
): WallSegment[] {
  const width = dungeon.width * samplesPerTile;
  const height = dungeon.height * samplesPerTile;
  const mask = createScaledFloorMask(dungeon, samplesPerTile, isFloor);
  const field = blurField(mask, width, height, Math.max(1, Math.round(blurTiles * samplesPerTile)));
  const segments: WallSegment[] = [];
  const at = (x: number, y: number): number => (
    x < 0 || y < 0 || x >= width || y >= height ? 0 : field[y * width + x]
  );
  const lerp = (a: number, b: number): number => (
    a === b ? 0.5 : (threshold - a) / (b - a)
  );

  for (let y = -1; y < height; y += 1) {
    for (let x = -1; x < width; x += 1) {
      const topLeft = at(x, y);
      const topRight = at(x + 1, y);
      const bottomRight = at(x + 1, y + 1);
      const bottomLeft = at(x, y + 1);
      const code = (topLeft >= threshold ? 8 : 0)
        | (topRight >= threshold ? 4 : 0)
        | (bottomRight >= threshold ? 2 : 0)
        | (bottomLeft >= threshold ? 1 : 0);
      if (code === 0 || code === 15) continue;
      // Edge points in sample space (pixel centres sit at +0.5).
      const top = { x: x + lerp(topLeft, topRight) + 0.5, y: y + 0.5 };
      const right = { x: x + 1.5, y: y + lerp(topRight, bottomRight) + 0.5 };
      const bottom = { x: x + lerp(bottomLeft, bottomRight) + 0.5, y: y + 1.5 };
      const left = { x: x + 0.5, y: y + lerp(topLeft, bottomLeft) + 0.5 };
      const pairs: Array<[typeof top, typeof top]> = [];
      switch (code) {
        case 1: case 14: pairs.push([left, bottom]); break;
        case 2: case 13: pairs.push([bottom, right]); break;
        case 3: case 12: pairs.push([left, right]); break;
        case 4: case 11: pairs.push([top, right]); break;
        case 6: case 9: pairs.push([top, bottom]); break;
        case 7: case 8: pairs.push([top, left]); break;
        case 5: pairs.push([top, left], [bottom, right]); break;
        case 10: pairs.push([top, right], [left, bottom]); break;
        default: break;
      }
      for (const [from, to] of pairs) {
        segments.push({
          x1: from.x / samplesPerTile,
          y1: from.y / samplesPerTile,
          x2: to.x / samplesPerTile,
          y2: to.y / samplesPerTile,
        });
      }
    }
  }
  return segments;
}
