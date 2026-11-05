import { DOOR_TILE, SECRET_DOOR_TILE, WALL_TILE } from "../dungeon";
import type { DoorVariant, Tile } from "../dungeon";

const MAX_WIDE_DOOR_TILES = 3;

export interface DoorwayPosition {
  x: number;
  y: number;
}

export type DoorwayAxis = "horizontal" | "vertical";

export interface DoorwayGroup {
  tile: typeof DOOR_TILE | typeof SECRET_DOOR_TILE;
  positions: readonly DoorwayPosition[];
  axis: DoorwayAxis | null;
  /** Absent for common wooden doors and secret doors. */
  variant?: DoorVariant;
}

export interface DoorwayFootprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getDoorwayGroups(
  tiles: readonly (readonly Tile[])[],
  doorVariants?: Readonly<Record<string, DoorVariant>>,
): DoorwayGroup[] {
  const width = tiles[0]?.length ?? 0;
  const visited = new Set<number>();
  const groups: DoorwayGroup[] = [];
  const variantAt = (x: number, y: number): DoorVariant | undefined => (
    tiles[y]?.[x] === DOOR_TILE ? doorVariants?.[`${x},${y}`] : undefined
  );

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      if (tile !== DOOR_TILE && tile !== SECRET_DOOR_TILE) continue;

      const startIndex = y * width + x;
      if (visited.has(startIndex)) continue;

      const variant = variantAt(x, y);
      const positions: DoorwayPosition[] = [];
      const pending = [{ x, y }];
      visited.add(startIndex);
      while (pending.length > 0) {
        const position = pending.pop()!;
        positions.push(position);
        for (const neighbor of [
          { x: position.x - 1, y: position.y },
          { x: position.x + 1, y: position.y },
          { x: position.x, y: position.y - 1 },
          { x: position.x, y: position.y + 1 },
        ]) {
          if (tiles[neighbor.y]?.[neighbor.x] !== tile) continue;
          if (variantAt(neighbor.x, neighbor.y) !== variant) continue;
          const neighborIndex = neighbor.y * width + neighbor.x;
          if (visited.has(neighborIndex)) continue;
          visited.add(neighborIndex);
          pending.push(neighbor);
        }
      }

      positions.sort((left, right) => left.y - right.y || left.x - right.x);
      const isHorizontal = positions.every((position) => position.y === positions[0].y);
      const isVertical = positions.every((position) => position.x === positions[0].x);
      const isOpen = (dx: number, dy: number) => (position: DoorwayPosition): boolean => (
        (tiles[position.y + dy]?.[position.x + dx] ?? WALL_TILE) !== WALL_TILE
      );
      // A line of doors is one wide door only when the passage runs across it; stacked doors
      // along a passage (two rooms with a short corridor between them) stay separate.
      const spansPassage = positions.length <= MAX_WIDE_DOOR_TILES && (
        (isHorizontal && positions.every(isOpen(0, -1)) && positions.every(isOpen(0, 1)))
        || (isVertical && positions.every(isOpen(-1, 0)) && positions.every(isOpen(1, 0)))
      );
      if (positions.length === 1) {
        groups.push({ tile, positions, axis: null, ...(variant ? { variant } : {}) });
      } else if (spansPassage) {
        groups.push({
          tile,
          positions,
          axis: isHorizontal ? "horizontal" : "vertical",
          ...(variant ? { variant } : {}),
        });
      } else {
        for (const position of positions) {
          groups.push({ tile, positions: [position], axis: null, ...(variant ? { variant } : {}) });
        }
      }
    }
  }

  return groups;
}

export function getDoorwayFootprint(group: DoorwayGroup): DoorwayFootprint {
  const minX = Math.min(...group.positions.map((position) => position.x));
  const maxX = Math.max(...group.positions.map((position) => position.x));
  const minY = Math.min(...group.positions.map((position) => position.y));
  const maxY = Math.max(...group.positions.map((position) => position.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export interface DoorwayDetails {
  /** Line between the two leaves of a wide door, in tile-size units from the footprint origin. */
  seam: readonly [number, number, number, number] | null;
  /** Handles; wide doors get two, joined by the latch. */
  handles: ReadonlyArray<{ x: number; y: number }>;
  /** Bar crossing the seam between the two handles, visually joining the leaves. */
  latch: readonly [number, number, number, number] | null;
}

/**
 * Shared drawing details for 2D, SVG and 3D parity. Coordinates are relative to the footprint
 * origin and expressed in pixels for the given tile size.
 */
export function getDoorwayDetails(group: DoorwayGroup, tileSize: number): DoorwayDetails {
  const footprint = getDoorwayFootprint(group);
  const width = footprint.width * tileSize;
  const height = footprint.height * tileSize;
  const inset = Math.min(tileSize * 0.08, width * 0.08, height * 0.08);
  const isSecret = group.tile === SECRET_DOOR_TILE;
  const reach = tileSize * 0.12;

  if (group.axis === "horizontal") {
    const seam = [width / 2, inset, width / 2, height - inset] as const;
    if (isSecret) return { seam, handles: [], latch: null };
    return {
      seam,
      handles: [
        { x: width / 2 - reach, y: height / 2 },
        { x: width / 2 + reach, y: height / 2 },
      ],
      latch: [width / 2 - reach, height / 2, width / 2 + reach, height / 2],
    };
  }
  if (group.axis === "vertical") {
    const seam = [inset, height / 2, width - inset, height / 2] as const;
    if (isSecret) return { seam, handles: [], latch: null };
    return {
      seam,
      handles: [
        { x: width / 2, y: height / 2 - reach },
        { x: width / 2, y: height / 2 + reach },
      ],
      latch: [width / 2, height / 2 - reach, width / 2, height / 2 + reach],
    };
  }
  if (isSecret) return { seam: [width / 2, inset, width / 2, height - inset], handles: [], latch: null };
  return { seam: null, handles: [{ x: width * 0.72, y: height * 0.52 }], latch: null };
}

export type DoorwayPrimitive =
  | {
    kind: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "circle"; x: number; y: number; radius: number; fill: string };

interface DoorwayPalette {
  fill: string | null;
  frame: string;
}

const DOORWAY_PALETTES: Record<DoorVariant | "wood" | "secret", DoorwayPalette> = {
  wood: { fill: "#775334", frame: "#d6aa66" },
  secret: { fill: "#17212c", frame: "#596671" },
  reinforced: { fill: "#4a4f58", frame: "#aab4c0" },
  locked: { fill: "#6a4730", frame: "#e0b866" },
  gate: { fill: "#242a31", frame: "#8d98a5" },
  grate: { fill: "#1b2128", frame: "#7c8794" },
  open: { fill: null, frame: "#d6aa66" },
  destroyed: { fill: "#3a2e24", frame: "#6f5a45" },
};

/** Everything needed to draw a doorway, in pixels relative to its footprint's top-left corner. */
export function getDoorwayDrawing(group: DoorwayGroup, tileSize: number): DoorwayPrimitive[] {
  const footprint = getDoorwayFootprint(group);
  const width = footprint.width * tileSize;
  const height = footprint.height * tileSize;
  const isSecret = group.tile === SECRET_DOOR_TILE;
  const variant = isSecret ? undefined : group.variant;
  const palette = DOORWAY_PALETTES[isSecret ? "secret" : variant ?? "wood"];
  const inset = Math.min(tileSize * 0.08, width * 0.08, height * 0.08);
  const strokeWidth = Math.max(tileSize * 0.05, 0.6);
  const primitives: DoorwayPrimitive[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, lineWidth = strokeWidth): void => {
    primitives.push({ kind: "line", x1, y1, x2, y2, color, width: lineWidth });
  };
  const wide = width >= height;
  const longSide = wide ? width : height;

  if (palette.fill) primitives.push({ kind: "rect", x: 0, y: 0, width, height, fill: palette.fill });
  primitives.push({
    kind: "rect",
    x: inset,
    y: inset,
    width: width - inset * 2,
    height: height - inset * 2,
    stroke: palette.frame,
    strokeWidth: Math.max(tileSize * 0.045, 0.6),
  });

  if (variant === "gate") {
    const bars = Math.max(2, Math.round(longSide / (tileSize * 0.24)));
    for (let bar = 1; bar < bars; bar += 1) {
      const offset = (longSide * bar) / bars;
      if (wide) line(offset, inset, offset, height - inset, palette.frame, strokeWidth * 1.4);
      else line(inset, offset, width - inset, offset, palette.frame, strokeWidth * 1.4);
    }
    return primitives;
  }
  if (variant === "grate") {
    const cells = Math.max(3, Math.round(longSide / (tileSize * 0.34)));
    for (let step = 1; step < cells; step += 1) {
      line((width * step) / cells, inset, (width * step) / cells, height - inset, palette.frame, strokeWidth * 0.7);
      line(inset, (height * step) / cells, width - inset, (height * step) / cells, palette.frame, strokeWidth * 0.7);
    }
    return primitives;
  }
  if (variant === "open") {
    const post = tileSize * 0.16;
    const jambs = wide
      ? [{ x: 0, y: 0 }, { x: width - post, y: 0 }]
      : [{ x: 0, y: 0 }, { x: 0, y: height - post }];
    for (const jamb of jambs) {
      primitives.push({ kind: "rect", x: jamb.x, y: jamb.y, width: wide ? post : width, height: wide ? height : post, fill: "#8f7a58" });
    }
    // The swung-open leaf rests against one jamb.
    if (wide) line(post, height * 0.2, post, height * 0.8, "#b68d52", strokeWidth * 1.3);
    else line(width * 0.2, post, width * 0.8, post, "#b68d52", strokeWidth * 1.3);
    return primitives;
  }
  if (variant === "destroyed") {
    const crack = (fromX: number, fromY: number, toX: number, toY: number): void => {
      const midX = (fromX + toX) / 2 + tileSize * 0.08;
      const midY = (fromY + toY) / 2 - tileSize * 0.08;
      line(fromX, fromY, midX, midY, "#a88a63");
      line(midX, midY, toX, toY, "#a88a63");
    };
    crack(width * 0.15, height * 0.25, width * 0.85, height * 0.4);
    crack(width * 0.2, height * 0.7, width * 0.8, height * 0.55);
    primitives.push(
      { kind: "circle", x: width * 0.3, y: height * 0.5, radius: tileSize * 0.07, fill: "#6f5a45" },
      { kind: "circle", x: width * 0.7, y: height * 0.35, radius: tileSize * 0.05, fill: "#6f5a45" },
    );
    return primitives;
  }

  const details = getDoorwayDetails(group, tileSize);
  if (variant === "reinforced") {
    for (const fraction of [0.33, 0.67]) {
      if (wide) line(width * fraction, inset, width * fraction, height - inset, "#2e3238", strokeWidth * 1.4);
      else line(inset, height * fraction, width - inset, height * fraction, "#2e3238", strokeWidth * 1.4);
    }
    for (const [studX, studY] of [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]]) {
      primitives.push({ kind: "circle", x: width * studX, y: height * studY, radius: tileSize * 0.045, fill: "#cfd6de" });
    }
  }
  const seamColor = isSecret ? "#87919a" : variant === "reinforced" ? "#20242a" : "#4b3424";
  if (details.seam) {
    line(details.seam[0], details.seam[1], details.seam[2], details.seam[3], seamColor);
  }
  if (details.latch) {
    line(details.latch[0], details.latch[1], details.latch[2], details.latch[3], "#f0cf87", tileSize * 0.07);
  }
  for (const handle of details.handles) {
    primitives.push({
      kind: "circle",
      x: handle.x,
      y: handle.y,
      radius: tileSize * (group.positions.length > 1 ? 0.075 : 0.06),
      fill: "#f0cf87",
    });
  }
  if (variant === "locked") {
    const lockWidth = tileSize * 0.22;
    const lockHeight = tileSize * 0.18;
    primitives.push(
      {
        kind: "rect",
        x: width / 2 - lockWidth / 2,
        y: height / 2 - lockHeight / 2,
        width: lockWidth,
        height: lockHeight,
        fill: "#e0b866",
        stroke: "#3a2a18",
        strokeWidth: Math.max(tileSize * 0.025, 0.4),
      },
      { kind: "circle", x: width / 2, y: height / 2, radius: tileSize * 0.035, fill: "#3a2a18" },
    );
  }
  return primitives;
}
