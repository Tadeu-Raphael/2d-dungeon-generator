import type { Tile, PointTuple } from "../types";
import { CORRIDOR_TILE, DOOR_TILE, SECRET_DOOR_TILE } from "../tiles";
import type { GeneratedRoom, Rect } from "../../dungeon";
import { TRAP_DEFINITIONS, TRAP_TYPES } from "../../dungeon";

const DOORWAY_ROOM_SURFACE_TILES = new Set<Tile>([
  1,
  4,
  5,
  48,
  49,
  10,
  11,
  ...TRAP_TYPES
    .filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor")
    .map((type) => TRAP_DEFINITIONS[type].tile),
]);

export function findDoorwayCandidates(
  tiles: Tile[][],
  room: Rect,
  doorwayWidth: number,
): PointTuple[][] {
  const candidates = new Map<string, PointTuple[]>();
  const minY = Math.max(1, room.y - 1);
  const maxY = Math.min(tiles.length - 1, room.y + room.height + 1);
  const minX = Math.max(1, room.x - 1);
  const maxX = Math.min(tiles[0].length - 1, room.x + room.width + 1);

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (tiles[y][x] !== CORRIDOR_TILE) continue;
      for (const [towardX, towardY] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const crossX = towardX === 0 ? 1 : 0;
        const crossY = towardY === 0 ? 1 : 0;
        for (let offset = 1 - doorwayWidth; offset <= 0; offset += 1) {
          const group = Array.from({ length: doorwayWidth }, (_, index): PointTuple => [
            x + crossX * (offset + index),
            y + crossY * (offset + index),
          ]);
          const groupSet = new Set(group.map(([groupX, groupY]) => `${groupX},${groupY}`));
          const completesEntrance = group.every(([groupX, groupY]) => {
            const roomX = groupX + towardX;
            const roomY = groupY + towardY;
            const corridorX = groupX - towardX;
            const corridorY = groupY - towardY;
            const isOutsideRoom = towardX === 1
              ? groupX < room.x
              : towardX === -1
                ? groupX >= room.x + room.width
                : towardY === 1
                  ? groupY < room.y
                  : groupY >= room.y + room.height;
            const touchesRoom = roomX >= room.x
              && roomX < room.x + room.width
              && roomY >= room.y
              && roomY < room.y + room.height
              && DOORWAY_ROOM_SURFACE_TILES.has(tiles[roomY][roomX]);
            return isOutsideRoom && touchesRoom && tiles[corridorY]?.[corridorX] === CORRIDOR_TILE;
          });
          if (!completesEntrance) continue;

          const hasSideOpening = group.some(([groupX, groupY]) => (
            [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
          ).some(([deltaX, deltaY]) => {
            if (
              (deltaX === towardX && deltaY === towardY) ||
              (deltaX === -towardX && deltaY === -towardY)
            ) return false;
            const nextX = groupX + deltaX;
            const nextY = groupY + deltaY;
            if (groupSet.has(`${nextX},${nextY}`)) return false;
            const sideTile = tiles[nextY]?.[nextX] ?? 0;
            return sideTile !== 0 && sideTile !== 51;
          }));
          if (hasSideOpening) continue;

          const key = group.map(([groupX, groupY]) => `${groupX},${groupY}`).sort().join("|");
          candidates.set(key, group);
        }
      }
    }
  }
  return [...candidates.values()];
}

export function hasNearbyDoor(tiles: Tile[][], group: PointTuple[]): boolean {
  return group.some(([x, y]) => {
    for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
      for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) continue;
        const neighbor = tiles[y + deltaY]?.[x + deltaX];
        if (neighbor === 3 || neighbor === SECRET_DOOR_TILE) return true;
      }
    }
    return false;
  });
}

export function placeDoors(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
  corridorWidth: number,
  doubleDoorsEnabled: boolean,
  forceDoorRoomIndexes: ReadonlySet<number> = new Set(),
): void {
  const doorwayWidth = corridorWidth === 2 && !doubleDoorsEnabled ? 0 : corridorWidth;
  if (doorwayWidth === 0) return;

  for (let index = 1; index < rooms.length; index += 1) {
    if (random() >= 0.8 && !forceDoorRoomIndexes.has(index)) continue;
    const candidates = findDoorwayCandidates(tiles, rooms[index], doorwayWidth)
      .filter((group) => !hasNearbyDoor(tiles, group));
    if (candidates.length === 0) continue;
    const group = candidates[Math.floor(random() * candidates.length)];
    const doorTile = random() < 0.2 ? SECRET_DOOR_TILE : DOOR_TILE;
    for (const [x, y] of group) tiles[y][x] = doorTile;
  }
}

export function removeInvalidDoors(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  corridorWidth: number,
  doubleDoorsEnabled: boolean,
): void {
  const doorwayWidth = corridorWidth === 2 && !doubleDoorsEnabled ? 0 : corridorWidth;
  const originalTiles = new Map<number, Tile>();
  const doorGroups: PointTuple[][] = [];
  const visited = new Set<number>();

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
        const position = y * tiles[y].length + x;
        originalTiles.set(position, tile);
        tiles[y][x] = CORRIDOR_TILE;
      }
    }
  }

  for (const [position, tile] of originalTiles) {
    if (visited.has(position)) continue;
    const group: PointTuple[] = [];
    const queue = [position];
    visited.add(position);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const x = current % tiles[0].length;
      const y = Math.floor(current / tiles[0].length);
      group.push([x, y]);
      for (const [nextX, nextY] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const nextPosition = nextY * tiles[0].length + nextX;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= tiles[0].length ||
          nextY >= tiles.length ||
          visited.has(nextPosition) ||
          originalTiles.get(nextPosition) !== tile
        ) continue;
        visited.add(nextPosition);
        queue.push(nextPosition);
      }
    }
    doorGroups.push(group);
  }

  const validDoorwayKeys = new Set<string>();
  if (doorwayWidth > 0) {
    for (const room of rooms) {
      for (const group of findDoorwayCandidates(tiles, room, doorwayWidth)) {
        validDoorwayKeys.add(group.map(([x, y]) => `${x},${y}`).sort().join("|"));
      }
    }
  }

  for (const group of doorGroups) {
    const key = group.map(([x, y]) => `${x},${y}`).sort().join("|");
    const isCompleteDoorway = group.length === doorwayWidth && validDoorwayKeys.has(key);
    for (const [x, y] of group) {
      const position = y * tiles[0].length + x;
      const originalTile = originalTiles.get(position);
      tiles[y][x] = isCompleteDoorway && originalTile !== undefined ? originalTile : 0;
    }
  }
}