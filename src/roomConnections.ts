import {
  CAVE_CONNECTION_WALL_TILE,
  DOOR_TILE,
  PILLAR_TILE,
  SECRET_DOOR_TILE,
  WALL_TILE,
} from "./dungeon";
import type { Dungeon, DungeonRoom, Tile } from "./dungeon";
import type { ConnectionEdge, ConnectionType } from "./generationPlan";
import { createRoomNumberGrid } from "./rendering/dungeonTileSemantics";
import type { RoomNumberBounds } from "./rendering/dungeonTileSemantics";

export interface RoomConnectionSummary {
  roomNumber: number;
  connectionType: ConnectionType;
  isSecret: boolean;
  isLocked: boolean;
  isBlocked: boolean;
  isOptional: boolean;
}

export interface RoomConnectionPlan {
  rooms: readonly { id: string }[];
  connections: readonly Pick<
    ConnectionEdge,
    | "sourceRoomId"
    | "targetRoomId"
    | "connectionType"
    | "isSecret"
    | "isLocked"
    | "isBlocked"
    | "isOptional"
  >[];
}

type RoomConnectivityInput = Pick<Dungeon, "width" | "tiles"> & {
  roomDetails: readonly RoomNumberBounds[];
};

function createConnectionIndex(
  rooms: readonly RoomNumberBounds[],
): Map<number, RoomConnectionSummary[]> {
  return new Map(rooms.map((room) => [room.number, []]));
}

function addConnectionPair(
  index: Map<number, RoomConnectionSummary[]>,
  sourceRoomNumber: number,
  targetRoomNumber: number,
  connection: Omit<RoomConnectionSummary, "roomNumber">,
): void {
  index.get(sourceRoomNumber)?.push({ ...connection, roomNumber: targetRoomNumber });
  index.get(targetRoomNumber)?.push({ ...connection, roomNumber: sourceRoomNumber });
}

function getPlanConnectionIndex(
  rooms: readonly RoomNumberBounds[],
  plan: RoomConnectionPlan,
): Map<number, RoomConnectionSummary[]> {
  const index = createConnectionIndex(rooms);
  const roomNumberById = new Map(plan.rooms.map((room, roomIndex) => [room.id, roomIndex + 1]));

  for (const edge of plan.connections) {
    const sourceRoomNumber = roomNumberById.get(edge.sourceRoomId);
    const targetRoomNumber = roomNumberById.get(edge.targetRoomId);
    if (sourceRoomNumber === undefined || targetRoomNumber === undefined) continue;

    addConnectionPair(index, sourceRoomNumber, targetRoomNumber, {
      connectionType: edge.connectionType,
      isSecret: edge.isSecret,
      isLocked: edge.isLocked,
      isBlocked: edge.isBlocked,
      isOptional: edge.isOptional,
    });
  }

  return index;
}

function isPassableTile(tile: Tile | undefined): tile is Tile {
  return tile !== undefined
    && tile !== WALL_TILE
    && tile !== CAVE_CONNECTION_WALL_TILE
    && tile !== PILLAR_TILE;
}

function classifyRasterizedConnection(
  tiles: readonly (readonly Tile[])[],
  path: readonly number[],
  width: number,
): Pick<RoomConnectionSummary, "connectionType" | "isSecret"> {
  const hasSecretDoor = path.some((index) => (
    tiles[Math.floor(index / width)]?.[index % width] === SECRET_DOOR_TILE
  ));
  if (hasSecretDoor) return { connectionType: "secret-door", isSecret: true };

  const hasDoor = path.some((index) => (
    tiles[Math.floor(index / width)]?.[index % width] === DOOR_TILE
  ));
  return {
    connectionType: hasDoor ? "door" : "corridor",
    isSecret: false,
  };
}

function getRasterizedConnectionIndex(
  dungeon: RoomConnectivityInput,
): Map<number, RoomConnectionSummary[]> {
  const rooms = dungeon.roomDetails;
  const index = createConnectionIndex(rooms);
  if (rooms.length < 2 || dungeon.width <= 0) return index;

  const tiles = dungeon.tiles;
  const roomNumbers = createRoomNumberGrid(tiles, dungeon.width, rooms);
  const tileCount = dungeon.width * tiles.length;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const recordedPairs = new Set<string>();

  for (const room of rooms) {
    const parents = new Int32Array(tileCount);
    parents.fill(-1);
    const queue = new Int32Array(tileCount);
    let head = 0;
    let tail = 0;

    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const tile = tiles[y]?.[x];
        const tileIndex = y * dungeon.width + x;
        if (roomNumbers[tileIndex] !== room.number || !isPassableTile(tile)) continue;
        parents[tileIndex] = -2;
        queue[tail] = tileIndex;
        tail += 1;
      }
    }

    while (head < tail) {
      const currentIndex = queue[head];
      head += 1;
      const x = currentIndex % dungeon.width;
      const y = Math.floor(currentIndex / dungeon.width);

      for (const [offsetX, offsetY] of directions) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < 0
          || nextX >= dungeon.width
          || nextY < 0
          || nextY >= tiles.length
        ) continue;

        const nextIndex = nextY * dungeon.width + nextX;
        const nextTile = tiles[nextY]?.[nextX];
        if (!isPassableTile(nextTile)) continue;

        const nextRoomNumber = roomNumbers[nextIndex];
        if (nextRoomNumber !== 0 && nextRoomNumber !== room.number) {
          const pairKey = `${Math.min(room.number, nextRoomNumber)}:${Math.max(room.number, nextRoomNumber)}`;
          if (!recordedPairs.has(pairKey)) {
            recordedPairs.add(pairKey);
            const path = [nextIndex];
            let pathIndex = currentIndex;
            while (pathIndex >= 0) {
              path.push(pathIndex);
              const parent = parents[pathIndex];
              if (parent < 0) break;
              pathIndex = parent;
            }
            const rasterizedConnection = classifyRasterizedConnection(
              tiles,
              path,
              dungeon.width,
            );
            addConnectionPair(index, room.number, nextRoomNumber, {
              ...rasterizedConnection,
              isLocked: false,
              isBlocked: false,
              isOptional: false,
            });
          }
          continue;
        }

        if (parents[nextIndex] !== -1) continue;
        parents[nextIndex] = currentIndex;
        queue[tail] = nextIndex;
        tail += 1;
      }
    }
  }

  for (const connections of index.values()) {
    connections.sort((left, right) => left.roomNumber - right.roomNumber);
  }
  return index;
}

export function getRoomConnectionIndex(
  dungeon: Pick<Dungeon, "width" | "tiles"> & {
    roomDetails: readonly Pick<DungeonRoom, "number" | "x" | "y" | "width" | "height">[];
  },
  plan?: RoomConnectionPlan,
): ReadonlyMap<number, readonly RoomConnectionSummary[]> {
  const rooms: readonly RoomNumberBounds[] = dungeon.roomDetails;
  if (plan && plan.rooms.length === rooms.length) {
    return getPlanConnectionIndex(rooms, plan);
  }
  return getRasterizedConnectionIndex(dungeon);
}
