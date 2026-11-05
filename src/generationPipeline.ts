import {
  CORRIDOR_TILE,
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  LAVA_TILE,
  PILLAR_TILE,
  TRAP_DEFINITIONS,
  WATER_TILE,
  assertSupportedDungeonDimensions,
  createGenerationRandomStreams,
  generateDungeonVersioned,
} from "./dungeon";
import type {
  Dungeon,
  DungeonGenerationMetadata,
  DungeonParameters,
  DungeonTrap,
  Tile,
  VersionedDungeonGeneration,
} from "./dungeon";
import { resolveDungeonGenerationAlgorithm } from "./dungeonProfiles";
import type {
  CustomDungeonProfile,
  DungeonConceptProfile,
  DungeonProfileSelection,
} from "./dungeonProfiles";
import {
  resolveDungeonProfile,
} from "./customDungeonProfile";
import {
  createStableGenerationId,
} from "./generationPlan";
import type {
  GenerationPlan,
  GridPosition,
  PlanFeature,
  PlanTransition,
  RoomNode,
  SpatialLayoutStyle,
  TopologyParameters,
  TopologyStyle,
} from "./generationPlan";
import {
  MAX_CORRIDOR_ROUTE_EXPANDED_STATES,
  routeGenerationPlanCorridors,
  CorridorRoutingError,
} from "./generationCorridorRouter";
import { generateGenerationSpatialLayout, SpatialLayoutError } from "./generationSpatialLayout";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { GenerationPlanValidationError, validateGenerationPlan } from "./generationPlanValidation";
import { validateDoorGeometry } from "./generationDoorValidation";
import { generateDungeonTopology, getDungeonTopologyStatistics } from "./generationTopology";
import { generateV2RoomRecipe } from "./generationRoomRecipe";
import { DEFAULT_TREASURE_RARITY_WEIGHTS } from "./treasures";
import {
  CavernGenerationError,
  generateHybridCavern,
  generateNaturalCavern,
} from "./generationCavern";

export interface DungeonGenerationPipelineRequest {
  generatorVersion: typeof DUNGEON_GENERATOR_VERSION_V1 | typeof DUNGEON_GENERATOR_VERSION_V2;
  profile: DungeonProfileSelection;
  customProfile?: CustomDungeonProfile;
  seed: number;
  parameters?: DungeonParameters;
  cavesEnabled?: boolean;
  topologyStyle?: TopologyStyle;
  spatialLayoutStyle?: SpatialLayoutStyle;
  cycleCount?: number;
  spatialDensity?: number;
  varyCorridorWidths?: boolean;
  collectStageTimings?: boolean;
}

export type GenerationStageName =
  | "roomRecipe"
  | "planPreparation"
  | "topology"
  | "cavern"
  | "layout"
  | "contentTransfer"
  | "routing"
  | "validation"
  | "rasterization";

export type GenerationStageTimings = Partial<Record<GenerationStageName, number>>;

export interface DungeonGenerationPipelineResult extends VersionedDungeonGeneration {
  requestedGeneratorVersion: DungeonGenerationMetadata["generatorVersion"];
  plan?: GenerationPlan;
  stageTimings?: GenerationStageTimings;
  fallbackReason?: string;
  algorithmNote?: string;
  roomCountReport?: RoomCountReport;
}

export interface RoomCountReport {
  requested: number;
  generated: number;
  minimumAcceptable: number;
  complete: boolean;
  meetsMinimum: boolean;
  recipeGenerated: number;
  recoveryAttempts: number;
  recipeCompactness: number;
  failureReason?: string;
}

interface RoomFeatureBlueprint {
  roomId: string;
  localPosition: GridPosition;
  feature: PlanFeature;
}

class V2FallbackSignal extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = "V2FallbackSignal";
    this.stage = stage;
  }
}

const SPATIAL_STYLE_ORDER: readonly SpatialLayoutStyle[] = [
  "axis-branches",
  "central-hub",
  "ring",
  "clusters",
];
const TOPOLOGY_SPATIAL_STYLE: Record<TopologyStyle, SpatialLayoutStyle> = {
  linear: "axis-branches",
  branching: "axis-branches",
  circuit: "ring",
  centralized: "central-hub",
  sectorized: "clusters",
  hybrid: "axis-branches",
};

const WALL_TILE: Tile = 0;

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

function getProfileMetadataSettings(
  resolvedProfile: ReturnType<typeof resolveDungeonProfile>,
): Record<string, string | number | boolean> {
  return resolvedProfile.customProfile
    ? {
      customProfileId: resolvedProfile.customProfile.id,
      customProfileName: resolvedProfile.customProfile.name,
      baseProfile: resolvedProfile.baseProfile,
    }
    : {};
}

function generateNaturalCavernV2Pipeline(
  request: DungeonGenerationPipelineRequest,
  parameters: DungeonParameters,
  resolvedProfile: ReturnType<typeof resolveDungeonProfile>,
  stageTimings?: GenerationStageTimings,
): DungeonGenerationPipelineResult {
  if (parameters.entranceMode !== "upper-stairs") {
    return createFallbackResult(
      request,
      "A V2 ainda não posiciona entradas externas em cavernas; foi usado o gerador V1 para preservar essa geometria.",
      "exterior-access-compatibility",
      undefined,
      stageTimings,
    );
  }

  const planId = `generation:${resolvedProfile.id}:${request.seed}`;
  let generated: ReturnType<typeof generateNaturalCavern>;
  try {
    generated = measureStage(stageTimings, "cavern", () => generateNaturalCavern(
      planId,
      parameters.width,
      parameters.height,
      parameters,
      request.seed,
    ));
  } catch (error) {
    if (!(error instanceof CavernGenerationError)) throw error;
    return createFallbackResult(
      request,
      `${error.message} Foi usado o gerador V1 do perfil.`,
      "cavern-generation",
      undefined,
      stageTimings,
    );
  }

  const effectiveParameters = cloneParameters({ ...parameters, roomCount: 0 });
  const generation: DungeonGenerationMetadata = {
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    seed: request.seed,
    profile: resolvedProfile.id,
    algorithm: "cellular",
    parameters: effectiveParameters,
    settings: {
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
      generationMode: "natural-cavern",
      requestedRoomCount: parameters.roomCount,
      generatedRoomCount: 0,
      roomCountApplicable: false,
      caveAlgorithm: "cellular-automata",
      caveRegionCount: 1,
      caveTileCount: generated.tileCount,
      cellularFillPercent: parameters.cellularFillPercent,
      cellularIterations: parameters.cellularIterations,
      ...getProfileMetadataSettings(resolvedProfile),
    },
    generatedAt: new Date().toISOString(),
  };
  const plan: GenerationPlan = {
    id: planId,
    width: parameters.width,
    height: parameters.height,
    generation,
    generationMode: "natural-cavern",
    rooms: [],
    connections: [],
    sectors: [],
    naturalRegions: [generated.region],
    entryRoomId: undefined,
    exitRoomId: undefined,
    objectiveRoomId: undefined,
    intersections: [],
    transitions: [
      {
        id: createStableGenerationId(planId, "transition", 0),
        type: "stairs-up",
        position: generated.entryPosition,
        regionId: generated.region.id,
        metadata: { role: "entry" },
      },
      {
        id: createStableGenerationId(planId, "transition", 1),
        type: "stairs-down",
        position: generated.exitPosition,
        regionId: generated.region.id,
        metadata: { role: "exit" },
      },
    ],
    features: [],
    metadata: {
      cavernTopology: {
        algorithm: "cellular-automata",
        connected: true,
        regionCount: 1,
        tileCount: generated.tileCount,
      },
    },
  };
  const validation = measureStage(
    stageTimings,
    "validation",
    () => validateGenerationPlan(plan),
  );
  if (!validation.valid) {
    return createFallbackResult(
      request,
      `A validação da caverna V2 falhou: ${validation.issues.map((issue) => issue.message).join("; ")}.`,
      "plan-validation",
      undefined,
      stageTimings,
    );
  }
  try {
    const dungeon = measureStage(
      stageTimings,
      "rasterization",
      () => generationPlanToDungeon(plan),
    );
    return {
      dungeon,
      metadata: generation,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
      plan,
      stageTimings,
      algorithmNote: "Caverna V2 gerada por Cellular Automata e representada como uma região lógica conectada.",
    };
  } catch (error) {
    if (!(error instanceof GenerationPlanValidationError)) throw error;
    return createFallbackResult(
      request,
      `A rasterização da caverna V2 falhou (${error.message}); foi usado o gerador V1 do perfil.`,
      "dungeon-conversion",
      undefined,
      stageTimings,
    );
  }
}
interface RoomCountReportContext {
  requested: number;
  minimumAcceptable: number;
  recipeGenerated: number;
  recoveryAttempts: number;
  recipeCompactness: number;
  failureReason?: string;
}

function assertSpatialDensity(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError("spatialDensity must be between 0 and 100.");
  }
}

function measureStage<T>(
  timings: GenerationStageTimings | undefined,
  stage: GenerationStageName,
  operation: () => T,
): T {
  if (!timings) return operation();
  const startedAt = globalThis.performance.now();
  try {
    return operation();
  } finally {
    timings[stage] = (timings[stage] ?? 0) + globalThis.performance.now() - startedAt;
  }
}

function applyProfileGenerationParameters(
  parameters: DungeonParameters,
  profile: DungeonConceptProfile,
): DungeonParameters {
  return {
    ...parameters,
    roomTypeDistributionEnabled: true,
    roomTypeCategoryFrequencies: parameters.roomTypeDistributionEnabled
      ? parameters.roomTypeCategoryFrequencies
      : profile.roomTypeCategoryFrequencies,
    trapCategoryWeights: parameters.trapCategoryDistributionEnabled
      ? parameters.trapCategoryWeights
      : profile.trapCategoryWeights,
    treasureCategoryWeights: parameters.treasureCategoryDistributionEnabled
      ? parameters.treasureCategoryWeights
      : profile.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityDistributionEnabled
      ? parameters.treasureRarityWeights
      : DEFAULT_TREASURE_RARITY_WEIGHTS,
  };
}

function chooseSpatialStyle(
  profile: DungeonConceptProfile,
  seed: number,
  requestedStyle?: SpatialLayoutStyle,
  topologyStyle?: TopologyStyle,
): SpatialLayoutStyle {
  if (requestedStyle) return requestedStyle;
  if (topologyStyle) return TOPOLOGY_SPATIAL_STYLE[topologyStyle];
  const weights = profile.v2Preferences.spatialLayoutWeights;
  const totalWeight = SPATIAL_STYLE_ORDER.reduce((total, style) => total + weights[style], 0);
  if (totalWeight <= 0) {
    throw new RangeError(`Profile ${profile.id} must assign a positive spatial layout weight.`);
  }
  let choice = createGenerationRandomStreams(seed).placement() * totalWeight;
  for (const style of SPATIAL_STYLE_ORDER) {
    choice -= weights[style];
    if (choice < 0) return style;
  }
  return SPATIAL_STYLE_ORDER[SPATIAL_STYLE_ORDER.length - 1];
}

function routeWithConnectionOrderRecovery(
  plan: GenerationPlan,
  maxExpandedStates: number,
): GenerationPlan {
  const prioritizedConnectionIds: string[] = [];
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return routeGenerationPlanCorridors(plan, {
        maxExpandedStates,
        prioritizedConnectionIds,
      });
    } catch (error) {
      if (
        !(error instanceof CorridorRoutingError)
        || error.code !== "no-route"
        || !error.connectionId
        || prioritizedConnectionIds.includes(error.connectionId)
      ) throw error;
      lastError = error;
      prioritizedConnectionIds.unshift(error.connectionId);
    }
  }
  throw lastError;
}

function makeRoomFootprintConnected(
  footprint: readonly GridPosition[],
  width: number,
  height: number,
): GridPosition[] {
  const footprintIndexes = new Set(footprint.map((position) => position.y * width + position.x));
  const connectedIndexes = new Set<number>();
  const start = footprint[0];
  if (!start) return [];
  connectedIndexes.add(start.y * width + start.x);

  const expandConnectedFootprint = (): void => {
    const queue = [...connectedIndexes];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]!;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        ...(y > 0 ? [current - width] : []),
        ...(x + 1 < width ? [current + 1] : []),
        ...(y + 1 < height ? [current + width] : []),
        ...(x > 0 ? [current - 1] : []),
      ];
      for (const neighbor of neighbors) {
        if (footprintIndexes.has(neighbor) && !connectedIndexes.has(neighbor)) {
          connectedIndexes.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  };
  expandConnectedFootprint();

  while (connectedIndexes.size < footprintIndexes.size) {
    const parents = new Int32Array(width * height);
    parents.fill(-1);
    const queue = [...connectedIndexes];
    for (const position of connectedIndexes) parents[position] = position;
    let target = -1;

    for (let head = 0; head < queue.length && target < 0; head += 1) {
      const current = queue[head]!;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        ...(y > 0 ? [current - width] : []),
        ...(x + 1 < width ? [current + 1] : []),
        ...(y + 1 < height ? [current + width] : []),
        ...(x > 0 ? [current - 1] : []),
      ];
      for (const neighbor of neighbors) {
        if (parents[neighbor] !== -1) continue;
        parents[neighbor] = current;
        if (footprintIndexes.has(neighbor) && !connectedIndexes.has(neighbor)) {
          target = neighbor;
          break;
        }
        queue.push(neighbor);
      }
    }
    if (target < 0) {
      throw new V2FallbackSignal("room-recipe", "A room footprint could not be connected within its bounds.");
    }

    for (let current = target; !connectedIndexes.has(current); current = parents[current]!) {
      connectedIndexes.add(current);
      footprintIndexes.add(current);
    }
    expandConnectedFootprint();
  }

  return [...footprintIndexes].map((index) => ({
    x: index % width,
    y: Math.floor(index / width),
  }));
}

function roomFootprintFromDungeon(dungeon: Dungeon, room: Dungeon["roomDetails"][number]): GridPosition[] {
  const footprint: GridPosition[] = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (dungeon.tiles[y]?.[x] !== undefined && dungeon.tiles[y][x] !== WALL_TILE) {
        footprint.push({ x: x - room.x, y: y - room.y });
      }
    }
  }
  if (footprint.length === 0) {
    throw new V2FallbackSignal("room-recipe", `A sala ${room.number} não contém células de piso utilizáveis.`);
  }
  return makeRoomFootprintConnected(footprint, room.width, room.height);
}

function createRoomRecipePlan(
  dungeon: Dungeon,
  generation: DungeonGenerationMetadata,
): GenerationPlan {
  if (dungeon.roomDetails.length < 2) {
    throw new V2FallbackSignal(
      "room-recipe",
      "A receita BSP não produziu salas suficientes para construir uma progressão V2.",
    );
  }

  const planId = `dungeon-v2-${generation.profile}-${generation.seed}`;
  const rooms: RoomNode[] = dungeon.roomDetails.map((room, index) => ({
    id: createStableGenerationId(planId, "room", index),
    roomType: room.roomType.category,
    roomRole: index === 0
      ? "entrance"
      : index === dungeon.roomDetails.length - 1
        ? "objective"
        : "secondary",
    width: room.width,
    height: room.height,
    position: { x: room.x, y: room.y },
    shape: room.shape,
    footprint: roomFootprintFromDungeon(dungeon, room),
    floorId: "floor-1",
    importance: index === 0 || index === dungeon.roomDetails.length - 1 ? 1 : 0.4,
    isRequired: false,
    metadata: {
      roomTypeDefinition: { ...room.roomType },
      generationBounds: room.generationBounds,
      rotationAllowed: room.shape !== "multiLevel",
      liquidFeature: room.liquidFeature,
      liquidType: room.liquidType,
      treasures: room.treasures.map((treasure) => ({ ...treasure })),
    },
  }));
  const entryRoomId = rooms[0].id;
  const objectiveRoomId = rooms[rooms.length - 1].id;

  return {
    id: planId,
    width: dungeon.width,
    height: dungeon.height,
    generation,
    rooms,
    connections: [],
    sectors: [],
    entryRoomId,
    exitRoomId: objectiveRoomId,
    objectiveRoomId,
    intersections: [],
    transitions: [],
    features: [],
    metadata: { source: "bsp-room-content-recipe" },
  };
}

function addProfileCorridorWidths(
  plan: GenerationPlan,
  varyCorridorWidths: boolean,
  corridorWidthBias: -1 | 0 | 1,
): GenerationPlan {
  const globalWidth = plan.generation.parameters.corridorWidth;
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const connections = plan.connections.map((edge) => {
    const source = roomsById.get(edge.sourceRoomId)!;
    const target = roomsById.get(edge.targetRoomId)!;
    const linksSectors = Boolean(source.sectorId && target.sectorId && source.sectorId !== target.sectorId);
    const important = edge.isMainPath
      || source.roomRole === "objective"
      || source.roomRole === "boss"
      || target.roomRole === "objective"
      || target.roomRole === "boss"
      || linksSectors;
    const narrow = edge.isSecret || edge.connectionType === "secret-door" || edge.isOptional;
    const profileWidth = globalWidth + corridorWidthBias;
    const preferredWidth = !varyCorridorWidths
      ? globalWidth
      : important
        ? Math.max(profileWidth, globalWidth + 1)
        : narrow
          ? Math.min(profileWidth, globalWidth - 1)
          : profileWidth;
    const width = Math.max(1, Math.min(3, preferredWidth));
    return {
      ...edge,
      width,
      metadata: {
        ...edge.metadata,
        widthIsFixed: !varyCorridorWidths || Boolean(edge.metadata.widthIsFixed),
        requestedWidth: width,
      },
    };
  });
  return { ...plan, connections };
}

function collectRoomFeatureBlueprints(
  sourcePlan: GenerationPlan,
  dungeon: Dungeon,
): RoomFeatureBlueprint[] {
  const blueprints: RoomFeatureBlueprint[] = [];
  let featureOrdinal = 0;

  for (const [roomIndex, room] of sourcePlan.rooms.entries()) {
    const sourceDetails = dungeon.roomDetails[roomIndex];
    const occupied = new Set<string>();
    const localFootprint = new Set(room.footprint.map((cell) => `${cell.x},${cell.y}`));
    const roomFeatures: Array<{
      type: "pillar" | "water" | "lava";
      position: GridPosition;
    }> = [];
    for (let y = 0; y < sourceDetails.height; y += 1) {
      for (let x = 0; x < sourceDetails.width; x += 1) {
        const position = { x: sourceDetails.x + x, y: sourceDetails.y + y };
        const tile = dungeon.tiles[position.y]?.[position.x];
        if (tile === PILLAR_TILE) roomFeatures.push({ type: "pillar", position });
        else if (tile === WATER_TILE) roomFeatures.push({ type: "water", position });
        else if (tile === LAVA_TILE) roomFeatures.push({ type: "lava", position });
      }
    }
    for (const candidate of roomFeatures) {
      const localPosition = {
        x: candidate.position.x - sourceDetails.x,
        y: candidate.position.y - sourceDetails.y,
      };
      const key = `${localPosition.x},${localPosition.y}`;
      if (!localFootprint.has(key)) continue;
      occupied.add(key);
      blueprints.push({
        roomId: room.id,
        localPosition,
        feature: {
          id: createStableGenerationId(sourcePlan.id, "feature", featureOrdinal++),
          type: candidate.type,
          position: candidate.position,
          roomId: room.id,
          metadata: { source: "room-content" },
        },
      });
    }

    for (const trapType of sourceDetails.traps) {
      const trapTile = TRAP_DEFINITIONS[trapType].tile;
      let trapPosition: GridPosition | undefined;
      for (const cell of room.footprint) {
        const candidate = {
          x: sourceDetails.x + cell.x,
          y: sourceDetails.y + cell.y,
        };
        const key = `${cell.x},${cell.y}`;
        if (!occupied.has(key) && dungeon.tiles[candidate.y]?.[candidate.x] === trapTile) {
          trapPosition = candidate;
          occupied.add(key);
          break;
        }
      }
      if (!trapPosition) {
        const availableCell = room.footprint
          .filter((cell) => !occupied.has(`${cell.x},${cell.y}`))
          .sort((left, right) => (
            Math.abs(left.x - room.width / 2) + Math.abs(left.y - room.height / 2)
            - Math.abs(right.x - room.width / 2) - Math.abs(right.y - room.height / 2)
            || left.y - right.y
            || left.x - right.x
          ))[0];
        if (!availableCell) {
          throw new V2FallbackSignal(
            "room-content",
            `Não foi possível preservar as armadilhas da sala ${sourceDetails.number}.`,
          );
        }
        trapPosition = {
          x: sourceDetails.x + availableCell.x,
          y: sourceDetails.y + availableCell.y,
        };
        occupied.add(`${availableCell.x},${availableCell.y}`);
      }
      blueprints.push({
        roomId: room.id,
        localPosition: {
          x: trapPosition.x - sourceDetails.x,
          y: trapPosition.y - sourceDetails.y,
        },
        feature: {
          id: createStableGenerationId(sourcePlan.id, "feature", featureOrdinal++),
          type: "trap",
          trapType,
          position: trapPosition,
          roomId: room.id,
          metadata: { source: "room-content" },
        },
      });
    }
  }
  return blueprints;
}

function fitLocalFeaturePosition(
  localPosition: GridPosition,
  sourceRoom: RoomNode,
  targetRoom: RoomNode,
  rotate: boolean,
  occupied: ReadonlySet<string>,
): GridPosition {
  const rotatedPosition = rotate
    ? { x: sourceRoom.height - 1 - localPosition.y, y: localPosition.x }
    : localPosition;
  const rotatedWidth = rotate ? sourceRoom.height : sourceRoom.width;
  const rotatedHeight = rotate ? sourceRoom.width : sourceRoom.height;
  const targetX = Math.max(
    0,
    Math.min(
      targetRoom.width - 1,
      Math.round(rotatedPosition.x * (targetRoom.width - 1) / Math.max(1, rotatedWidth - 1)),
    ),
  );
  const targetY = Math.max(
    0,
    Math.min(
      targetRoom.height - 1,
      Math.round(rotatedPosition.y * (targetRoom.height - 1) / Math.max(1, rotatedHeight - 1)),
    ),
  );
  const candidates = [...targetRoom.footprint].sort((left, right) => (
    (Math.abs(left.x - targetX) + Math.abs(left.y - targetY))
    - (Math.abs(right.x - targetX) + Math.abs(right.y - targetY))
    || left.y - right.y
    || left.x - right.x
  ));
  const selected = candidates.find((candidate) => !occupied.has(`${candidate.x},${candidate.y}`));
  if (!selected) {
    throw new V2FallbackSignal(
      "room-content",
      `Não há uma célula livre para preservar o conteúdo da sala ${sourceRoom.id}.`,
    );
  }
  return selected;
}

function chooseRoomTransitionPosition(
  room: RoomNode,
  occupied: ReadonlySet<string>,
): GridPosition {
  const centerX = (room.width - 1) / 2;
  const centerY = (room.height - 1) / 2;
  const cell = [...room.footprint]
    .filter((position) => !occupied.has(`${room.position.x + position.x},${room.position.y + position.y}`))
    .sort((left, right) => (
      (Math.hypot(left.x - centerX, left.y - centerY))
      - (Math.hypot(right.x - centerX, right.y - centerY))
      || left.y - right.y
      || left.x - right.x
    ))[0];
  if (!cell) {
    throw new V2FallbackSignal("transitions", `Não há espaço para uma transição na sala ${room.id}.`);
  }
  return { x: room.position.x + cell.x, y: room.position.y + cell.y };
}

function transferRoomContent(
  sourcePlan: GenerationPlan,
  spatialPlan: GenerationPlan,
  blueprints: readonly RoomFeatureBlueprint[],
  entranceMode: DungeonParameters["entranceMode"],
): GenerationPlan {
  const sourceRooms = new Map(sourcePlan.rooms.map((room) => [room.id, room]));
  const targetRooms = new Map(spatialPlan.rooms.map((room) => [room.id, room]));
  const rotatedRoomIds = new Set(spatialPlan.spatialLayout?.rotatedRoomIds ?? []);
  const occupiedByRoom = new Map<string, Set<string>>();
  const features: PlanFeature[] = blueprints.map((blueprint) => {
    const sourceRoom = sourceRooms.get(blueprint.roomId)!;
    const targetRoom = targetRooms.get(blueprint.roomId)!;
    const occupied = occupiedByRoom.get(blueprint.roomId) ?? new Set<string>();
    const localPosition = fitLocalFeaturePosition(
      blueprint.localPosition,
      sourceRoom,
      targetRoom,
      rotatedRoomIds.has(blueprint.roomId),
      occupied,
    );
    occupied.add(`${localPosition.x},${localPosition.y}`);
    occupiedByRoom.set(blueprint.roomId, occupied);
    return {
      ...blueprint.feature,
      position: {
        x: targetRoom.position.x + localPosition.x,
        y: targetRoom.position.y + localPosition.y,
      },
    };
  });

  const entryRoom = targetRooms.get(spatialPlan.entryRoomId!)!;
  const objectiveRoom = targetRooms.get(spatialPlan.objectiveRoomId!)!;
  const occupiedPositions = new Set(
    features.map((feature) => `${feature.position.x},${feature.position.y}`),
  );
  const entranceType: PlanTransition["type"] = entranceMode === "upper-stairs"
    ? "stairs-up"
    : entranceMode;
  const entrancePosition = chooseRoomTransitionPosition(entryRoom, occupiedPositions);
  occupiedPositions.add(`${entrancePosition.x},${entrancePosition.y}`);
  const exitPosition = chooseRoomTransitionPosition(objectiveRoom, occupiedPositions);
  const transitions: PlanTransition[] = [
    {
      id: createStableGenerationId(spatialPlan.id, "transition", 0),
      type: entranceType,
      position: entrancePosition,
      roomId: entryRoom.id,
      metadata: { role: "entry" },
    },
    {
      id: createStableGenerationId(spatialPlan.id, "transition", 1),
      type: "stairs-down",
      position: exitPosition,
      roomId: objectiveRoom.id,
      metadata: { role: "exit" },
    },
  ];

  return { ...spatialPlan, features, transitions };
}

function relocateCorridorTraps(
  sourceDungeon: Dungeon,
  dungeon: Dungeon,
  seed: number,
): Dungeon {
  const candidates: GridPosition[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = dungeon.tiles[y][x];
      if (tile !== CORRIDOR_TILE) continue;
      candidates.push({ x, y });
    }
  }
  const random = createGenerationRandomStreams(seed).content;
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  const traps: DungeonTrap[] = [];
  for (const sourceTrap of sourceDungeon.traps) {
    const candidateIndex = candidates.findIndex((candidate) => (
      traps.every((trap) => Math.abs(trap.x - candidate.x) > 1 || Math.abs(trap.y - candidate.y) > 1)
    ));
    if (candidateIndex < 0) {
      throw new V2FallbackSignal(
        "corridor-content",
        "Não foi possível reposicionar todas as armadilhas dos corredores V1 no mapa V2.",
      );
    }
    const [position] = candidates.splice(candidateIndex, 1);
    traps.push({ type: sourceTrap.type, ...position });
  }
  return { ...dungeon, traps };
}

function createFallbackResult(
  request: DungeonGenerationPipelineRequest,
  reason: string,
  stage: string,
  roomCountContext?: RoomCountReportContext,
  stageTimings?: GenerationStageTimings,
): DungeonGenerationPipelineResult {
  const resolvedProfile = resolveDungeonProfile(request.profile, request.customProfile);
  const profile = resolvedProfile.profile;
  const cavesEnabled = Boolean(
    request.cavesEnabled
    || resolvedProfile.cavesEnabled
    || resolvedProfile.mode === "natural-cavern",
  );
  const algorithm = resolveDungeonGenerationAlgorithm(profile.algorithm, cavesEnabled);
  const fallback = generateDungeonVersioned({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
    algorithm: algorithm.algorithm,
    seed: request.seed,
    profile: resolvedProfile.id,
    parameters: request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
    settings: {
      cavesEnabled,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
      fallbackStage: stage,
      fallbackReason: reason,
      profileAlgorithm: profile.algorithm,
      ...getProfileMetadataSettings(resolvedProfile),
      ...(roomCountContext ? {
        requestedRoomCount: roomCountContext.requested,
        minimumAcceptableRoomCount: roomCountContext.minimumAcceptable,
        roomRecipeRoomCount: roomCountContext.recipeGenerated,
        roomRecipeAttempts: roomCountContext.recoveryAttempts,
        roomRecipeCompactness: roomCountContext.recipeCompactness,
        incompleteGenerationReason: roomCountContext.failureReason ?? reason,
      } : {}),
    },
  });
  const roomCountReport: RoomCountReport | undefined = roomCountContext
    ? {
      requested: roomCountContext.requested,
      generated: fallback.dungeon.roomDetails.length,
      minimumAcceptable: roomCountContext.minimumAcceptable,
      complete: fallback.dungeon.roomDetails.length === roomCountContext.requested,
      meetsMinimum: fallback.dungeon.roomDetails.length >= roomCountContext.minimumAcceptable,
      recipeGenerated: roomCountContext.recipeGenerated,
      recoveryAttempts: roomCountContext.recoveryAttempts,
      recipeCompactness: roomCountContext.recipeCompactness,
      failureReason: roomCountContext.failureReason ?? reason,
    }
    : undefined;
  const metadata = roomCountReport
    ? {
      ...fallback.metadata,
      settings: {
        ...fallback.metadata.settings,
        generatedRoomCount: roomCountReport.generated,
        roomCountComplete: roomCountReport.complete,
      },
    }
    : fallback.metadata;
  return {
    ...fallback,
    metadata,
    requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
    fallbackReason: reason,
    ...(stageTimings ? { stageTimings } : {}),
    ...(roomCountReport ? { roomCountReport } : {}),
  };
}

function generateDungeonV1Pipeline(
  request: DungeonGenerationPipelineRequest,
  resolvedProfile: ReturnType<typeof resolveDungeonProfile>,
): DungeonGenerationPipelineResult {
  const profile = resolvedProfile.profile;
  const cavesEnabled = Boolean(
    request.cavesEnabled
    || resolvedProfile.cavesEnabled
    || resolvedProfile.mode === "natural-cavern",
  );
  const resolution = resolveDungeonGenerationAlgorithm(profile.algorithm, cavesEnabled);
  const result = generateDungeonVersioned({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
    algorithm: resolution.algorithm,
    seed: request.seed,
    profile: resolvedProfile.id,
    parameters: request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
    settings: {
      cavesEnabled,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V1,
      profileAlgorithm: profile.algorithm,
      ...getProfileMetadataSettings(resolvedProfile),
      ...(resolution.fallbackReason ? { algorithmFallbackReason: resolution.fallbackReason } : {}),
    },
  });
  return {
    ...result,
    requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V1,
    ...(resolution.fallbackReason ? { fallbackReason: resolution.fallbackReason } : {}),
  };
}

function generateDungeonV2Pipeline(
  request: DungeonGenerationPipelineRequest,
  resolvedProfile: ReturnType<typeof resolveDungeonProfile>,
): DungeonGenerationPipelineResult {
  const profile = resolvedProfile.profile;
  const cavesEnabled = Boolean(
    request.cavesEnabled
    || resolvedProfile.cavesEnabled
    || resolvedProfile.mode === "natural-cavern",
  );
  const parameters = request.parameters ?? DEFAULT_DUNGEON_PARAMETERS;
  const stageTimings = request.collectStageTimings ? {} : undefined;
  assertSupportedDungeonDimensions(parameters.width, parameters.height);
  if (resolvedProfile.mode === "natural-cavern") {
    return generateNaturalCavernV2Pipeline(request, parameters, resolvedProfile, stageTimings);
  }

  if (parameters.entranceMode !== "upper-stairs") {
    return createFallbackResult(
      request,
      "A V2 ainda não roteia entradas externas até o limite do mapa; foi usado o gerador V1 para preservar essa geometria.",
      "exterior-access-compatibility",
    );
  }

  if (request.spatialDensity !== undefined) assertSpatialDensity(request.spatialDensity);
  const roomRecipe = measureStage(
    stageTimings,
    "roomRecipe",
    () => generateV2RoomRecipe(
      { profile: resolvedProfile.baseProfile, seed: request.seed },
      parameters,
      profile,
    ),
  );
  const roomCountContext: RoomCountReportContext = {
    requested: parameters.roomCount,
    minimumAcceptable: 2,
    recipeGenerated: roomRecipe.roomCount,
    recoveryAttempts: roomRecipe.recoveryAttempts,
    recipeCompactness: roomRecipe.recipeCompactness,
  };
  const minimumRoomCount = Math.max(parameters.roomCount, roomCountContext.minimumAcceptable);
  if (roomRecipe.roomCount < minimumRoomCount) {
    const countFailureReason = roomRecipe.roomCount < parameters.roomCount
      ? `A receita BSP gerou no máximo ${roomRecipe.roomCount} de ${parameters.roomCount} salas solicitadas após ${roomRecipe.recoveryAttempts} tentativas limitadas;`
      : `A V2 precisa de pelo menos ${roomCountContext.minimumAcceptable} salas para formar uma progressão;`;
    const reason = `${countFailureReason} a quantidade mínima aceitável é ${roomCountContext.minimumAcceptable}.`;
    return createFallbackResult(
      request,
      `${reason} Foi usado o gerador V1 do perfil.`,
      "room-recipe-capacity",
      { ...roomCountContext, failureReason: reason },
    );
  }
  const v1RoomRecipe = {
    dungeon: roomRecipe.dungeon,
    metadata: roomRecipe.generation,
  };
  const profileAlgorithmNote = profile.algorithm === "bsp"
    ? undefined
    : `O perfil declara ${profile.algorithm} no V1. No V2, o BSP é usado somente como receita de salas e conteúdo; topologia, layout e corredores vêm do GenerationPlan.`;
  const style = chooseSpatialStyle(
    profile,
    request.seed,
    request.spatialLayoutStyle,
    request.topologyStyle,
  );
  const density = request.spatialDensity ?? profile.v2Preferences.defaultDensity;
  let sourcePlan: GenerationPlan;
  let roomFeatures: RoomFeatureBlueprint[];
  try {
    const preparedPlan = measureStage(stageTimings, "planPreparation", () => {
      const plan = createRoomRecipePlan(v1RoomRecipe.dungeon, {
        ...v1RoomRecipe.metadata,
        generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
        profile: resolvedProfile.id,
        algorithm: "bsp",
        settings: {
          requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
          profileAlgorithm: profile.algorithm,
          roomRecipeAlgorithm: "bsp",
          topologyStyle: request.topologyStyle ?? profile.topology.style,
          spatialLayoutStyle: style,
          spatialDensity: density,
          varyCorridorWidths: request.varyCorridorWidths ?? true,
          ...(request.cycleCount !== undefined ? { cycleCount: request.cycleCount } : {}),
          ...(profileAlgorithmNote ? { algorithmNote: profileAlgorithmNote } : {}),
          ...getProfileMetadataSettings(resolvedProfile),
        },
      });
      return {
        plan,
        features: collectRoomFeatureBlueprints(plan, v1RoomRecipe.dungeon),
      };
    });
    sourcePlan = preparedPlan.plan;
    roomFeatures = preparedPlan.features;
  } catch (error) {
    if (error instanceof V2FallbackSignal) {
      return createFallbackResult(
        request,
        `${error.message} Foi usado o gerador V1 do perfil.`,
        error.stage,
        roomCountContext,
      );
    }
    throw error;
  }
  const topologyParameters: Partial<TopologyParameters> = {
    ...resolvedProfile.customProfile?.topology?.parameters,
  };
  if (request.cycleCount !== undefined) {
    topologyParameters.cycleCount = request.cycleCount;
    topologyParameters.additionalConnectionCount = 0;
  }
  const topologyWithWidths = measureStage(
    stageTimings,
    "topology",
    () => addProfileCorridorWidths(
      generateDungeonTopology(sourcePlan, {
        profile: resolvedProfile.baseProfile,
        style: request.topologyStyle ?? profile.topology.style,
        parameters: topologyParameters,
      }),
      request.varyCorridorWidths ?? true,
      profile.v2Preferences.corridorWidthBias,
    ),
  );

  const layoutStyles = request.spatialLayoutStyle
    ? [style]
    : [style, ...SPATIAL_STYLE_ORDER.filter((candidate) => candidate !== style)];
  const maxExpandedStates = Math.min(
    parameters.width * parameters.height * 4,
    MAX_CORRIDOR_ROUTE_EXPANDED_STATES,
  );
  let routedPlan: GenerationPlan | undefined;
  let lastSpatialError: SpatialLayoutError | undefined;
  let lastContentSignal: V2FallbackSignal | undefined;
  let lastRouteError: CorridorRoutingError | GenerationPlanValidationError | undefined;
  let attemptedLayoutCount = 0;

  for (const layoutStyle of layoutStyles) {
    attemptedLayoutCount += 1;
    const layoutInput: GenerationPlan = {
      ...topologyWithWidths,
      generation: {
        ...topologyWithWidths.generation,
        settings: {
          ...topologyWithWidths.generation.settings,
          spatialLayoutStyle: layoutStyle,
        },
      },
    };
    let spatialPlan: GenerationPlan;
    try {
      spatialPlan = measureStage(stageTimings, "layout", () => (
        generateGenerationSpatialLayout(layoutInput, {
          style: layoutStyle,
          minimumRoomGap: Math.round(((100 - density) / 100) * 10),
          maximumConnectionDistance: Math.hypot(parameters.width, parameters.height) * 0.75,
        })
      ));
    } catch (error) {
      if (error instanceof SpatialLayoutError) {
        lastSpatialError = error;
        continue;
      }
      throw error;
    }

    let positionedPlan: GenerationPlan;
    try {
      positionedPlan = measureStage(
        stageTimings,
        "contentTransfer",
        () => transferRoomContent(
          sourcePlan,
          spatialPlan,
          roomFeatures,
          parameters.entranceMode,
        ),
      );
    } catch (error) {
      if (error instanceof V2FallbackSignal) {
        lastContentSignal = error;
        continue;
      }
      throw error;
    }

    try {
      routedPlan = measureStage(
        stageTimings,
        "routing",
        () => routeWithConnectionOrderRecovery(positionedPlan, maxExpandedStates),
      );
      break;
    } catch (error) {
      if (error instanceof CorridorRoutingError || error instanceof GenerationPlanValidationError) {
        lastRouteError = error;
        if (error instanceof CorridorRoutingError && error.code === "search-limit") break;
        continue;
      }
      throw error;
    }
  }

  if (!routedPlan) {
    if (lastRouteError) {
      const details = lastRouteError instanceof CorridorRoutingError
        ? lastRouteError.details.join("; ")
        : lastRouteError.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      return createFallbackResult(
        request,
        `O roteamento ou a validação geométrica V2 falhou após ${attemptedLayoutCount} de ${layoutStyles.length} layouts (${lastRouteError.message}${details ? ` ${details}` : ""}); foi usado o gerador V1 do perfil.`,
        "corridor-routing",
        roomCountContext,
        stageTimings,
      );
    }
    if (lastContentSignal) {
      return createFallbackResult(
        request,
        `${lastContentSignal.message} Foi usado o gerador V1 do perfil.`,
        lastContentSignal.stage,
        roomCountContext,
      );
    }
    if (lastSpatialError) {
      return createFallbackResult(
        request,
        `O posicionamento V2 não encontrou um layout válido (${lastSpatialError.message}); foi usado o gerador V1 do perfil.`,
        "spatial-layout",
        roomCountContext,
      );
    }
    throw new Error("V2 layout did not produce a routed plan or a failure reason.");
  }
  if (cavesEnabled) {
    try {
      const generatedCavern = measureStage(
        stageTimings,
        "cavern",
        () => generateHybridCavern(routedPlan!, request.seed),
      );
      routedPlan = {
        ...routedPlan,
        generationMode: "rooms",
        naturalRegions: [
          ...(routedPlan.naturalRegions ?? []),
          generatedCavern.region,
        ],
        caveConnections: [
          ...(routedPlan.caveConnections ?? []),
          generatedCavern.connection,
        ],
        generation: {
          ...routedPlan.generation,
          settings: {
            ...routedPlan.generation.settings,
            cavesEnabled: true,
            caveAlgorithm: "cellular-automata",
            caveRegionCount: 1,
            caveTileCount: generatedCavern.tileCount,
          },
        },
        metadata: {
          ...routedPlan.metadata,
          cavernTopology: {
            algorithm: "cellular-automata",
            connected: true,
            regionCount: 1,
            tileCount: generatedCavern.tileCount,
            linkedTo: generatedCavern.connection.target,
          },
        },
      };
    } catch (error) {
      if (!(error instanceof CavernGenerationError)) throw error;
      return createFallbackResult(
        request,
        `${error.message} Foi usado o gerador V1 do perfil.`,
        "cavern-generation",
        roomCountContext,
        stageTimings,
      );
    }
  }
  const validation = measureStage(
    stageTimings,
    "validation",
    () => validateGenerationPlan(routedPlan),
  );
  if (!validation.valid) {
    return createFallbackResult(
      request,
      `A validação final do GenerationPlan V2 falhou: ${validation.issues.map((issue) => issue.message).join("; ")}.`,
      "plan-validation",
      roomCountContext,
    );
  }
  const stats = getDungeonTopologyStatistics(routedPlan);
  const generatedAt = routedPlan.generation.generatedAt;
  const routedMetadata: DungeonGenerationMetadata = {
    ...routedPlan.generation,
    profile: resolvedProfile.id,
    settings: {
      ...routedPlan.generation.settings,
      ...getProfileMetadataSettings(resolvedProfile),
      roomCount: routedPlan.rooms.length,
      connectionCount: routedPlan.connections.length,
      branchCount: stats.branchCount,
      cycleRank: stats.cycleRank,
      sectorCount: routedPlan.sectors.length,
      mainPathLength: routedPlan.mainPathRoomIds?.length ?? 0,
      corridorLength: routedPlan.corridorRouting?.totalPathLength ?? 0,
      layoutScore: routedPlan.spatialLayout?.metrics.score.total ?? 0,
      requestedRoomCount: parameters.roomCount,
      generatedRoomCount: routedPlan.rooms.length,
      minimumAcceptableRoomCount: roomCountContext.minimumAcceptable,
      roomCountComplete: routedPlan.rooms.length === parameters.roomCount,
      roomRecipeRoomCount: roomRecipe.roomCount,
      roomRecipeAttempts: roomRecipe.recoveryAttempts,
      roomRecipeCompactness: roomRecipe.recipeCompactness,
      ...(profileAlgorithmNote ? { algorithmNote: profileAlgorithmNote } : {}),
    },
    generatedAt,
  };
  const completePlan = { ...routedPlan, generation: routedMetadata };

  try {
    const converted = measureStage(
      stageTimings,
      "rasterization",
      () => generationPlanToDungeon(completePlan),
    );
    const dungeon = relocateCorridorTraps(v1RoomRecipe.dungeon, converted, request.seed);
    const doorIssues = measureStage(
      stageTimings,
      "validation",
      () => validateDoorGeometry(completePlan, dungeon.tiles, dungeon.doorVariants),
    );
    if (doorIssues.length > 0) {
      return createFallbackResult(
        request,
        `A validação de portas e aberturas V2 falhou (${doorIssues.slice(0, 3).map((issue) => issue.message).join("; ")}${doorIssues.length > 3 ? `; +${doorIssues.length - 3}` : ""}); foi usado o gerador V1 do perfil.`,
        "door-validation",
        roomCountContext,
      );
    }
    return {
      dungeon,
      metadata: routedMetadata,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
      plan: completePlan,
      ...(stageTimings ? { stageTimings } : {}),
      roomCountReport: {
        requested: parameters.roomCount,
        generated: routedPlan.rooms.length,
        minimumAcceptable: roomCountContext.minimumAcceptable,
        complete: routedPlan.rooms.length === parameters.roomCount,
        meetsMinimum: routedPlan.rooms.length >= roomCountContext.minimumAcceptable,
        recipeGenerated: roomRecipe.roomCount,
        recoveryAttempts: roomRecipe.recoveryAttempts,
        recipeCompactness: roomRecipe.recipeCompactness,
      },
      ...(profileAlgorithmNote ? { algorithmNote: profileAlgorithmNote } : {}),
    };
  } catch (error) {
    if (error instanceof GenerationPlanValidationError || error instanceof V2FallbackSignal) {
      return createFallbackResult(
        request,
        `A conversão ou preservação de conteúdo V2 falhou (${error.message}); foi usado o gerador V1 do perfil.`,
        error instanceof V2FallbackSignal ? error.stage : "dungeon-conversion",
        roomCountContext,
      );
    }
    throw error;
  }
}

export function generateDungeonPipeline(
  request: DungeonGenerationPipelineRequest,
): DungeonGenerationPipelineResult {
  const resolvedProfile = resolveDungeonProfile(request.profile, request.customProfile);
  const normalizedRequest = {
    ...request,
    parameters: applyProfileGenerationParameters(
      request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
      resolvedProfile.profile,
    ),
  };
  return normalizedRequest.generatorVersion === DUNGEON_GENERATOR_VERSION_V2
    ? generateDungeonV2Pipeline(normalizedRequest, resolvedProfile)
    : generateDungeonV1Pipeline(normalizedRequest, resolvedProfile);
}
