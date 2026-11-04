import {
  CAVE_CONNECTION_WALL_TILE,
  CAVE_BREACH_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  WATER_TILE,
} from "./dungeon";
import type { Dungeon, DungeonParameters, DungeonRoom, Tile } from "./dungeon";
import { ROOM_TYPE_CATEGORIES, ROOM_TYPE_DEFINITIONS } from "./roomTypes";
import type { RoomTypeDefinition } from "./roomTypes";
import { getCorridorPathBrush } from "./generationCorridorGeometry";
import type {
  ConnectionEdge,
  GenerationPlan,
  GridPosition,
  PlanFeature,
  RoomNode,
} from "./generationPlan";
import {
  GenerationPlanValidationError,
  validateGenerationPlan,
} from "./generationPlanValidation";

const WALL_TILE: Tile = 0;

function cellKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

function getDefaultRoomTypeDefinition(roomType: RoomNode["roomType"]): RoomTypeDefinition {
  const definition = ROOM_TYPE_DEFINITIONS.find((item) => item.category === roomType);
  if (definition) return { ...definition };
  return {
    title: ROOM_TYPE_CATEGORIES[roomType].shortLabel,
    description: "",
    category: roomType,
  };
}

function getRoomGenerationBounds(room: RoomNode): DungeonRoom["generationBounds"] {
  if (room.metadata.generationBounds) {
    return {
      ...room.metadata.generationBounds,
      areaRange: { ...room.metadata.generationBounds.areaRange },
      aspectRatioRange: { ...room.metadata.generationBounds.aspectRatioRange },
    };
  }
  const aspectRatio = room.width / room.height;
  const area = room.width * room.height;
  return {
    minWidth: room.width,
    maxWidth: room.width,
    minHeight: room.height,
    maxHeight: room.height,
    areaRange: { min: area, max: area },
    aspectRatioRange: { min: aspectRatio, max: aspectRatio },
  };
}

function carvePath(
  tiles: Tile[][],
  path: readonly GridPosition[],
  width: number,
  tile: Tile,
  roomCells: ReadonlySet<string>,
): void {
  for (const position of getCorridorPathBrush(path, width)) {
    if (roomCells.has(cellKey(position))) continue;
    tiles[position.y][position.x] = tile;
  }
}

function carveIntersection(
  tiles: Tile[][],
  intersection: GenerationPlan["intersections"][number],
  roomCells: ReadonlySet<string>,
): void {
  const offset = Math.floor((intersection.width - 1) / 2);
  for (let y = 0; y < intersection.width; y += 1) {
    for (let x = 0; x < intersection.width; x += 1) {
      const position = {
        x: intersection.position.x + x - offset,
        y: intersection.position.y + y - offset,
      };
      if (!roomCells.has(cellKey(position))) {
        tiles[position.y][position.x] = CORRIDOR_TILE;
      }
    }
  }
}

function getDoorPosition(
  edge: ConnectionEdge,
  roomCells: ReadonlySet<string>,
): GridPosition | undefined {
  const passageTiles = edge.path.filter((position) => !roomCells.has(cellKey(position)));
  return passageTiles[Math.floor(passageTiles.length / 2)];
}

function placeConnection(
  tiles: Tile[][],
  edge: ConnectionEdge,
  roomCells: ReadonlySet<string>,
): void {
  if (edge.isBlocked || edge.connectionType === "blocked-passage" || edge.connectionType === "vertical") {
    return;
  }
  const tile = edge.connectionType === "open-passage" ? FLOOR_TILE : CORRIDOR_TILE;
  carvePath(tiles, edge.path, edge.width, tile, roomCells);
  const hasRoutedEndpoints = Boolean(edge.metadata.sourceEndpoint && edge.metadata.targetEndpoint);
  if (
    !hasRoutedEndpoints
    && (edge.isSecret || edge.connectionType === "door" || edge.connectionType === "secret-door")
  ) {
    const doorPosition = getDoorPosition(edge, roomCells);
    if (doorPosition) {
      tiles[doorPosition.y][doorPosition.x] = (
        edge.isSecret || edge.connectionType === "secret-door"
          ? SECRET_DOOR_TILE
          : DOOR_TILE
      );
    }
  }
}

function getFeatureTile(feature: PlanFeature): Tile {
  switch (feature.type) {
    case "trap":
      return TRAP_DEFINITIONS[feature.trapType].tile;
    case "water":
      return WATER_TILE;
    case "lava":
      return LAVA_TILE;
    case "pillar":
      return PILLAR_TILE;
  }
}

function createRoomDetails(plan: GenerationPlan): DungeonRoom[] {
  const roomTraps = new Map<string, PlanFeature[]>();
  for (const feature of plan.features) {
    if (feature.type === "trap" && feature.roomId) {
      const traps = roomTraps.get(feature.roomId) ?? [];
      traps.push(feature);
      roomTraps.set(feature.roomId, traps);
    }
  }

  return plan.rooms.map((room, index) => {
    const roomTypeDefinition = room.metadata.roomTypeDefinition
      ? { ...room.metadata.roomTypeDefinition }
      : getDefaultRoomTypeDefinition(room.roomType);
    const traps = roomTraps.get(room.id) ?? [];
    return {
      number: index + 1,
      x: room.position.x,
      y: room.position.y,
      width: room.width,
      height: room.height,
      centerX: room.position.x + room.width / 2,
      centerY: room.position.y + room.height / 2,
      shape: room.shape,
      generationBounds: getRoomGenerationBounds(room),
      roomType: roomTypeDefinition,
      liquidFeature: room.metadata.liquidFeature,
      liquidType: room.metadata.liquidType,
      traps: traps.map((feature) => {
        if (feature.type !== "trap") {
          throw new Error("Non-trap feature was unexpectedly assigned to a room trap list.");
        }
        return feature.trapType;
      }),
      treasures: [...(room.metadata.treasures ?? [])],
    };
  });
}

function cloneParameters(parameters: DungeonParameters): DungeonParameters {
  return {
    ...parameters,
    roomSizeFrequencies: { ...parameters.roomSizeFrequencies },
    roomShapeFrequencies: { ...parameters.roomShapeFrequencies },
    rectangularRoomRatioFrequencies: { ...parameters.rectangularRoomRatioFrequencies },
    roomTypeCategoryFrequencies: { ...parameters.roomTypeCategoryFrequencies },
    trapCategoryWeights: { ...parameters.trapCategoryWeights },
    treasureCategoryWeights: { ...parameters.treasureCategoryWeights },
    treasureRarityWeights: { ...parameters.treasureRarityWeights },
  };
}

export function generationPlanToDungeon(plan: GenerationPlan): Dungeon {
  if (plan.topology?.geometryStatus === "unrouted") {
    throw new Error("A topology-only GenerationPlan must be physically routed before conversion to Dungeon.");
  }
  const validation = validateGenerationPlan(plan);
  if (!validation.valid) {
    throw new GenerationPlanValidationError(validation.issues);
  }

  const tiles = Array.from(
    { length: plan.height },
    () => Array<Tile>(plan.width).fill(WALL_TILE),
  );
  const roomCells = new Set<string>();
  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      const position = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      roomCells.add(cellKey(position));
      tiles[position.y][position.x] = FLOOR_TILE;
    }
  }

  for (const edge of plan.connections) {
    placeConnection(tiles, edge, roomCells);
  }
  for (const intersection of plan.intersections) {
    carveIntersection(tiles, intersection, roomCells);
  }
  for (const transition of plan.transitions) {
    const transitionTiles: Record<typeof transition.type, Tile> = {
      doorway: DOOR_TILE,
      "secret-door": SECRET_DOOR_TILE,
      "stairs-up": STAIRS_UP_TILE,
      "stairs-down": STAIRS_DOWN_TILE,
      "room-stairs": ROOM_STAIRS_TILE,
      "exterior-entrance": EXTERIOR_ENTRANCE_TILE,
      "exterior-connection": EXTERIOR_CONNECTION_TILE,
      "cave-breach": CAVE_BREACH_TILE,
    };
    tiles[transition.position.y][transition.position.x] = transitionTiles[transition.type];
  }
  const traps = plan.features
    .filter((feature) => feature.type === "trap")
    .map((feature) => ({
      type: feature.trapType,
      x: feature.position.x,
      y: feature.position.y,
    }));
  for (const feature of plan.features) {
    tiles[feature.position.y][feature.position.x] = getFeatureTile(feature);
  }

  const roomDetails = createRoomDetails(plan);
  const parameters = cloneParameters(plan.generation.parameters);
  const floorCount = tiles.reduce(
    (total, row) => total + row.filter(
      (tile) => tile !== WALL_TILE && tile !== CAVE_CONNECTION_WALL_TILE,
    ).length,
    0,
  );
  return {
    width: plan.width,
    height: plan.height,
    tiles,
    rooms: roomDetails.length,
    roomDetails,
    traps,
    treasureCategoryWeights: { ...parameters.treasureCategoryWeights },
    treasureRarityWeights: { ...parameters.treasureRarityWeights },
    treasureChancePercent: parameters.treasureChancePercent,
    treasureConsumablesEnabled: parameters.treasureConsumablesEnabled,
    floorCount,
    seed: plan.generation.seed,
    algorithm: plan.generation.algorithm,
    corridorWidth: parameters.corridorWidth,
    doubleDoorsEnabled: parameters.doubleDoorsEnabled,
    trapCategoryWeights: { ...parameters.trapCategoryWeights },
    roomTrapChancePercent: parameters.roomTrapChancePercent,
    corridorTrapChancePercent: parameters.corridorTrapChancePercent,
  };
}
