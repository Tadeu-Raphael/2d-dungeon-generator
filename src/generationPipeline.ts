import {
  CORRIDOR_TILE,
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  LAVA_TILE,
  PILLAR_TILE,
  TRAP_DEFINITIONS,
  WATER_TILE,
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
import { DUNGEON_CONCEPTS, resolveDungeonGenerationAlgorithm } from "./dungeonProfiles";
import type { DungeonConcept } from "./dungeonProfiles";
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
  TopologyStyle,
} from "./generationPlan";
import { routeGenerationPlanCorridors, CorridorRoutingError } from "./generationCorridorRouter";
import { generateGenerationSpatialLayout, SpatialLayoutError } from "./generationSpatialLayout";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { GenerationPlanValidationError, validateGenerationPlan } from "./generationPlanValidation";
import { generateDungeonTopology, getDungeonTopologyStatistics } from "./generationTopology";
import { generateV2RoomRecipe } from "./generationRoomRecipe";
import { DEFAULT_TREASURE_RARITY_WEIGHTS } from "./treasures";

export interface DungeonGenerationPipelineRequest {
  generatorVersion: typeof DUNGEON_GENERATOR_VERSION_V1 | typeof DUNGEON_GENERATOR_VERSION_V2;
  profile: DungeonConcept;
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
  profile: DungeonConcept,
): DungeonParameters {
  const conceptProfile = DUNGEON_CONCEPTS[profile];
  return {
    ...parameters,
    roomTypeDistributionEnabled: true,
    roomTypeCategoryFrequencies: parameters.roomTypeDistributionEnabled
      ? parameters.roomTypeCategoryFrequencies
      : conceptProfile.roomTypeCategoryFrequencies,
    trapCategoryWeights: parameters.trapCategoryDistributionEnabled
      ? parameters.trapCategoryWeights
      : conceptProfile.trapCategoryWeights,
    treasureCategoryWeights: parameters.treasureCategoryDistributionEnabled
      ? parameters.treasureCategoryWeights
      : conceptProfile.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityDistributionEnabled
      ? parameters.treasureRarityWeights
      : DEFAULT_TREASURE_RARITY_WEIGHTS,
  };
}

function chooseSpatialStyle(
  profile: DungeonConcept,
  seed: number,
  requestedStyle?: SpatialLayoutStyle,
  topologyStyle?: TopologyStyle,
): SpatialLayoutStyle {
  if (requestedStyle) return requestedStyle;
  if (topologyStyle) return TOPOLOGY_SPATIAL_STYLE[topologyStyle];
  const weights = DUNGEON_CONCEPTS[profile].v2Preferences.spatialLayoutWeights;
  const totalWeight = SPATIAL_STYLE_ORDER.reduce((total, style) => total + weights[style], 0);
  if (totalWeight <= 0) {
    throw new RangeError(`Profile ${profile} must assign a positive spatial layout weight.`);
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
  return footprint;
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
): GenerationPlan {
  const profile = DUNGEON_CONCEPTS[plan.generation.profile as DungeonConcept];
  const bias = profile.v2Preferences.corridorWidthBias;
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
    const profileWidth = globalWidth + bias;
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
): DungeonGenerationPipelineResult {
  const profile = DUNGEON_CONCEPTS[request.profile];
  const cavesEnabled = Boolean(request.cavesEnabled || request.profile === "natural-cavern");
  const algorithm = resolveDungeonGenerationAlgorithm(profile.algorithm, cavesEnabled);
  const fallback = generateDungeonVersioned({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
    algorithm: algorithm.algorithm,
    seed: request.seed,
    profile: request.profile,
    parameters: request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
    settings: {
      cavesEnabled,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V2,
      fallbackStage: stage,
      fallbackReason: reason,
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
    ...(roomCountReport ? { roomCountReport } : {}),
  };
}

function generateDungeonV1Pipeline(
  request: DungeonGenerationPipelineRequest,
): DungeonGenerationPipelineResult {
  const profile = DUNGEON_CONCEPTS[request.profile];
  const cavesEnabled = Boolean(request.cavesEnabled || request.profile === "natural-cavern");
  const resolution = resolveDungeonGenerationAlgorithm(profile.algorithm, cavesEnabled);
  const result = generateDungeonVersioned({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
    algorithm: resolution.algorithm,
    seed: request.seed,
    profile: request.profile,
    parameters: request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
    settings: {
      cavesEnabled,
      requestedGeneratorVersion: DUNGEON_GENERATOR_VERSION_V1,
      profileAlgorithm: profile.algorithm,
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
): DungeonGenerationPipelineResult {
  const profile = DUNGEON_CONCEPTS[request.profile];
  const cavesEnabled = Boolean(request.cavesEnabled || request.profile === "natural-cavern");
  if (request.profile === "natural-cavern") {
    return createFallbackResult(
      request,
      "O perfil Caverna natural usa Cellular Automata sem salas estruturadas; a versão V2 requer um grafo de salas. Foi mantida a geração celular V1.",
      "profile-compatibility",
    );
  }
  if (cavesEnabled) {
    return createFallbackResult(
      request,
      "Cavernas híbridas ainda não são representadas pelo GenerationPlan V2; foi usado o algoritmo V1 do perfil para preservar esse recurso.",
      "cave-compatibility",
    );
  }

  const parameters = request.parameters ?? DEFAULT_DUNGEON_PARAMETERS;
  if (parameters.entranceMode !== "upper-stairs") {
    return createFallbackResult(
      request,
      "A V2 ainda não roteia entradas externas até o limite do mapa; foi usado o gerador V1 para preservar essa geometria.",
      "exterior-access-compatibility",
    );
  }

  if (request.spatialDensity !== undefined) assertSpatialDensity(request.spatialDensity);
  const stageTimings = request.collectStageTimings ? {} : undefined;
  const roomRecipe = measureStage(
    stageTimings,
    "roomRecipe",
    () => generateV2RoomRecipe(request, parameters, profile),
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
    request.profile,
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
        profile: request.profile,
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
  const topologyWithWidths = measureStage(
    stageTimings,
    "topology",
    () => addProfileCorridorWidths(
      generateDungeonTopology(sourcePlan, {
        profile: request.profile,
        style: request.topologyStyle,
        parameters: request.cycleCount === undefined
          ? undefined
          : { cycleCount: request.cycleCount, additionalConnectionCount: 0 },
      }),
      request.varyCorridorWidths ?? true,
    ),
  );

  const layoutStyles = request.spatialLayoutStyle
    ? [style]
    : [style, ...SPATIAL_STYLE_ORDER.filter((candidate) => candidate !== style)];
  const maxExpandedStates = parameters.width * parameters.height * 4;
  let routedPlan: GenerationPlan | undefined;
  let lastSpatialError: SpatialLayoutError | undefined;
  let lastContentSignal: V2FallbackSignal | undefined;
  let lastRouteError: CorridorRoutingError | GenerationPlanValidationError | undefined;

  for (const layoutStyle of layoutStyles) {
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
        `O roteamento ou a validação geométrica V2 falhou em ${layoutStyles.length} layouts (${lastRouteError.message}${details ? ` ${details}` : ""}); foi usado o gerador V1 do perfil.`,
        "corridor-routing",
        roomCountContext,
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
    settings: {
      ...routedPlan.generation.settings,
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
  const normalizedRequest = {
    ...request,
    parameters: applyProfileGenerationParameters(
      request.parameters ?? DEFAULT_DUNGEON_PARAMETERS,
      request.profile,
    ),
  };
  return normalizedRequest.generatorVersion === DUNGEON_GENERATOR_VERSION_V2
    ? generateDungeonV2Pipeline(normalizedRequest)
    : generateDungeonV1Pipeline(normalizedRequest);
}
