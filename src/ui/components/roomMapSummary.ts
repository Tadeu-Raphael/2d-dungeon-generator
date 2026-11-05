import {
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  DOOR_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  WATER_TILE,
} from "../../dungeon";
import type { Dungeon, Tile } from "../../dungeon";
import type {
  DungeonLevel,
  VerticalConnection,
  VerticalConnectionKind,
} from "../../dungeonStructure";
import { createRoomNumberGrid } from "../../rendering/dungeonTileSemantics";

export interface RoomMapElement {
  id: string;
  label: string;
  detail: string;
}

export interface RoomMapSummary {
  roomAreas: ReadonlyMap<number, number>;
  elementsByRoom: ReadonlyMap<number, readonly RoomMapElement[]>;
}

export interface RoomMapStructure {
  levels: readonly Pick<DungeonLevel, "id" | "name" | "verticalIndex">[];
  verticalConnections: readonly VerticalConnection[];
}

const VERTICAL_CONNECTION_LABELS: Record<VerticalConnectionKind, string> = {
  stairs: "Escadaria",
  "spiral-stairs": "Escadaria em espiral",
  "vertical-shaft": "Poço vertical",
  elevator: "Elevador",
  trapdoor: "Alçapão",
  drop: "Desnível",
  "secret-passage": "Passagem secreta",
  ramp: "Rampa",
  portal: "Portal",
  other: "Conexão vertical",
};

const STAIR_TILES = new Set<Tile>([
  ROOM_STAIRS_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
]);

function getMapTileLabel(tile: Tile): string | undefined {
  switch (tile) {
    case DOOR_TILE:
      return "Porta";
    case SECRET_DOOR_TILE:
      return "Porta secreta";
    case EXTERIOR_ENTRANCE_TILE:
      return "Entrada do exterior";
    case EXTERIOR_CONNECTION_TILE:
      return "Acesso ao exterior";
    case STAIRS_UP_TILE:
      return "Escada para cima";
    case STAIRS_DOWN_TILE:
      return "Escada para baixo";
    case ROOM_STAIRS_TILE:
      return "Escadaria";
    case ELEVATED_FLOOR_TILE:
      return "Piso elevado";
    case PILLAR_TILE:
      return "Pilar";
    case WATER_TILE:
    case CAVE_WATER_TILE:
    case CAVE_SPRING_TILE:
    case CAVE_WATERFALL_TILE:
      return "Água";
    case LAVA_TILE:
    case CAVE_LAVA_TILE:
    case CAVE_LAVA_FALL_TILE:
    case CAVE_LAVA_VENT_TILE:
      return "Lava";
    case CAVE_BREACH_TILE:
      return "Abertura natural";
    case CAVE_CONNECTION_WALL_TILE:
      return "Parede natural";
    default:
      return undefined;
  }
}

function appendElement(
  elementsByRoom: Map<number, RoomMapElement[]>,
  roomNumber: number,
  element: RoomMapElement,
): void {
  const elements = elementsByRoom.get(roomNumber) ?? [];
  elements.push(element);
  elementsByRoom.set(roomNumber, elements);
}

export function createRoomMapSummary(
  dungeon: Dungeon,
  structure?: RoomMapStructure,
  selectedLevelId?: string,
): RoomMapSummary {
  if (dungeon.width <= 0) {
    return { roomAreas: new Map(), elementsByRoom: new Map() };
  }

  const roomNumbers = createRoomNumberGrid(
    dungeon.tiles,
    dungeon.width,
    dungeon.roomDetails,
  );
  const roomAreas = new Map<number, number>();
  const elementsByRoom = new Map<number, RoomMapElement[]>();
  const verticalElementsByTile = new Map<number, RoomMapElement[]>();
  const groupedTilesByRoom = new Map<number, Map<string, { x: number; y: number }[]>>();
  const levelsById = new Map(structure?.levels.map((level) => [level.id, level]));
  const selectedLevel = selectedLevelId ? levelsById.get(selectedLevelId) : undefined;

  if (selectedLevel && structure) {
    for (const connection of structure.verticalConnections) {
      const isSource = connection.sourceLevelId === selectedLevel.id;
      const isTarget = connection.targetLevelId === selectedLevel.id;
      if (!isSource && !isTarget) continue;

      const position = isSource ? connection.sourcePosition : connection.targetPosition;
      if (
        position.x < 0
        || position.x >= dungeon.width
        || position.y < 0
        || position.y >= dungeon.height
      ) continue;

      const tileIndex = position.y * dungeon.width + position.x;
      const otherLevelId = isSource ? connection.targetLevelId : connection.sourceLevelId;
      const otherLevel = levelsById.get(otherLevelId);
      const markerTile = dungeon.tiles[position.y]?.[position.x];
      const expectedMarkerTile = connection.kind === "stairs" || connection.kind === "spiral-stairs"
        ? otherLevel && otherLevel.verticalIndex > selectedLevel.verticalIndex
          ? STAIRS_UP_TILE
          : STAIRS_DOWN_TILE
        : ROOM_STAIRS_TILE;
      if (markerTile !== expectedMarkerTile) continue;

      const roomNumber = roomNumbers[tileIndex];
      if (roomNumber === 0) continue;

      const verticalDirection = otherLevel
        ? otherLevel.verticalIndex > selectedLevel.verticalIndex
          ? "para cima"
          : otherLevel.verticalIndex < selectedLevel.verticalIndex
            ? "para baixo"
            : "entre níveis"
        : "";
      const canTravelToOther = connection.direction === "bidirectional"
        || (isSource && connection.direction === "source-to-target")
        || (isTarget && connection.direction === "target-to-source");
      const accessDirection = connection.direction === "bidirectional"
        ? "Ida e volta"
        : canTravelToOther
          ? `Somente para ${otherLevel?.name ?? otherLevelId}`
          : `Somente a partir de ${otherLevel?.name ?? otherLevelId}`;
      const label = [
        VERTICAL_CONNECTION_LABELS[connection.kind],
        verticalDirection,
      ].filter(Boolean).join(" ");
      const element = {
        id: `vertical-${connection.id}`,
        label,
        detail: `${otherLevel?.name ?? otherLevelId} · ${accessDirection} · Tile ${position.x}, ${position.y}`,
      };
      const tileElements = verticalElementsByTile.get(tileIndex) ?? [];
      tileElements.push(element);
      verticalElementsByTile.set(tileIndex, tileElements);
    }
  }

  for (let tileIndex = 0; tileIndex < roomNumbers.length; tileIndex += 1) {
    const roomNumber = roomNumbers[tileIndex];
    if (roomNumber === 0) continue;

    const x = tileIndex % dungeon.width;
    const y = Math.floor(tileIndex / dungeon.width);
    const tile = dungeon.tiles[y]?.[x];
    if (tile === undefined) continue;

    if (tile !== CAVE_CONNECTION_WALL_TILE && tile !== PILLAR_TILE) {
      roomAreas.set(roomNumber, (roomAreas.get(roomNumber) ?? 0) + 1);
    }

    const verticalElements = verticalElementsByTile.get(tileIndex);
    if (verticalElements) {
      for (const element of verticalElements) {
        appendElement(elementsByRoom, roomNumber, element);
      }
      continue;
    }

    const label = getMapTileLabel(tile);
    if (!label) continue;
    if (STAIR_TILES.has(tile)) {
      appendElement(elementsByRoom, roomNumber, {
        id: `tile-${tileIndex}`,
        label,
        detail: `Tile ${x}, ${y}`,
      });
      continue;
    }

    const roomGroups = groupedTilesByRoom.get(roomNumber) ?? new Map();
    const positions = roomGroups.get(label) ?? [];
    positions.push({ x, y });
    roomGroups.set(label, positions);
    groupedTilesByRoom.set(roomNumber, roomGroups);
  }

  for (const [roomNumber, groups] of groupedTilesByRoom) {
    for (const [label, positions] of groups) {
      const listedPositions = positions.slice(0, 4)
        .map(({ x, y }) => `${x}, ${y}`)
        .join(" · ");
      const remainingPositionCount = positions.length - 4;
      const detail = positions.length === 1
        ? `Tile ${listedPositions}`
        : `${positions.length} tiles · ${listedPositions}${remainingPositionCount > 0
          ? ` · +${remainingPositionCount}`
          : ""}`;
      appendElement(elementsByRoom, roomNumber, {
        id: `tiles-${label}`,
        label: positions.length === 1 ? label : `${label} · ${positions.length}`,
        detail,
      });
    }
  }

  return { roomAreas, elementsByRoom };
}
