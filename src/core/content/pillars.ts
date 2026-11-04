import type { Tile, PointTuple } from "../types";
import { FLOOR_TILE, PILLAR_TILE } from "../tiles";
import type { GeneratedRoom } from "../../dungeon";

export function placeSymmetricPillars(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
): void {
  for (const room of rooms) {
    const hasColumns = room.shape === "columns";
    const isSquareRoom =
      room.shape === "square" ||
      (room.shape === "rectangular" && room.width === room.height);
    if (
      !hasColumns &&
      ((!isSquareRoom && room.shape !== "round") || room.width < 7 || room.height < 7)
    )
      continue;
    if (!hasColumns && random() >= 0.1) continue;
    if (hasColumns && (room.width < 3 || room.height < 3)) continue;

    const centerX = room.x + Math.floor(room.width / 2);
    const centerY = room.y + Math.floor(room.height / 2);
    if (hasColumns && (room.width < 5 || room.height < 5)) {
      const pillarX = room.x + Math.floor(room.width / 4);
      const pillarY = room.y + Math.floor(room.height / 4);
      if (tiles[pillarY][pillarX] === FLOOR_TILE)
        tiles[pillarY][pillarX] = PILLAR_TILE;
      continue;
    }
    const offsetX = Math.max(hasColumns ? 1 : 2, Math.floor(room.width / 4));
    const offsetY = Math.max(hasColumns ? 1 : 2, Math.floor(room.height / 4));
    const positions: PointTuple[] = [
      [centerX - offsetX, centerY - offsetY],
      [centerX + offsetX, centerY - offsetY],
      [centerX - offsetX, centerY + offsetY],
      [centerX + offsetX, centerY + offsetY],
    ];
    if (positions.some(([x, y]) => tiles[y][x] !== FLOOR_TILE)) continue;
    for (const [x, y] of positions) tiles[y][x] = PILLAR_TILE;
  }
}