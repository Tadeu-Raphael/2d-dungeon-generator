import {
  assertSupportedDungeonDimensions,
  DUNGEON_GENERATOR_VERSION_V2,
  MAX_DUNGEON_ROOM_COUNT,
  MAX_DUNGEON_SEED,
  MAX_DUNGEON_TILE_COUNT,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import { createRandom, deriveRandomSeed } from "./core/random";
import { generateDungeonPipeline } from "./generationPipeline";
import type {
  DungeonGenerationPipelineRequest,
  DungeonGenerationPipelineResult,
} from "./generationPipeline";
import {
  createStableGenerationId,
  type GenerationPlan,
  type GridPosition,
  type SpatialLayoutStyle,
  type TopologyStyle,
} from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import {
  analyzeDungeonConnectivity,
  DungeonStructureValidationError,
  validateDungeonStructure,
} from "./dungeonStructureValidation";
import type {
  DungeonLevel,
  DungeonStructure,
  VerticalConnectionKind,
} from "./dungeonStructure";
import type {
  CustomDungeonProfile,
  DungeonProfileSelection,
} from "./dungeonProfiles";
import { resolveDungeonProfile } from "./customDungeonProfile";

export const MAX_DUNGEON_LEVEL_COUNT = 8;

const MAX_ROOM_COUNT_PER_LEVEL = MAX_DUNGEON_ROOM_COUNT;
const VERTICAL_CONNECTION_KINDS = new Set<VerticalConnectionKind>([
  "stairs",
  "spiral-stairs",
  "vertical-shaft",
  "elevator",
  "trapdoor",
  "drop",
  "secret-passage",
  "ramp",
  "portal",
  "other",
]);

export interface DungeonLevelGenerationConfig {
  name: string;
  verticalIndex: number;
  width: number;
  height: number;
  roomCount: number;
  topologyStyle?: TopologyStyle;
  spatialLayoutStyle?: SpatialLayoutStyle;
  profile?: DungeonProfileSelection;
  customProfile?: CustomDungeonProfile;
  isSecret?: boolean;
  isOptional?: boolean;
}

export interface DungeonStructureGenerationRequest {
  seed: number;
  profile: DungeonProfileSelection;
  customProfile?: CustomDungeonProfile;
  parameters: DungeonParameters;
  levels: readonly DungeonLevelGenerationConfig[];
  entryLevelIndex: number;
  verticalConnectionCount: number;
  allowedVerticalConnectionKinds: readonly VerticalConnectionKind[];
  requireGlobalConnectivity: boolean;
  allowVerticalCycles: boolean;
  cavesEnabled?: boolean;
  cycleCount?: number;
  spatialDensity?: number;
  varyCorridorWidths?: boolean;
}

export interface GeneratedDungeonLevel {
  levelId: string;
  generation: DungeonGenerationPipelineResult;
}

export interface DungeonStructureGenerationResult {
  structure: DungeonStructure;
  levels: readonly GeneratedDungeonLevel[];
  connectivity: ReturnType<typeof analyzeDungeonConnectivity>;
}

export function createDungeonLevelPipelineRequest(
  request: DungeonStructureGenerationRequest,
  level: DungeonLevelGenerationConfig,
): DungeonGenerationPipelineRequest {
  const profile = level.profile ?? request.profile;
  const customProfile = level.customProfile
    ?? (level.profile === undefined || level.profile === request.profile
      ? request.customProfile
      : undefined);
  return {
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile,
    ...(customProfile ? { customProfile } : {}),
    seed: deriveRandomSeed(request.seed, `multilevel-level:${level.verticalIndex}`),
    parameters: {
      ...request.parameters,
      width: level.width,
      height: level.height,
      roomCount: level.roomCount,
      entranceMode: "upper-stairs",
    },
    topologyStyle: level.topologyStyle,
    spatialLayoutStyle: level.spatialLayoutStyle,
    cycleCount: request.cycleCount,
    spatialDensity: request.spatialDensity,
    varyCorridorWidths: request.varyCorridorWidths,
    cavesEnabled: false,
  };
}

function assertValidRequest(request: DungeonStructureGenerationRequest): void {
  if (
    !Number.isSafeInteger(request.seed)
    || request.seed < 0
    || request.seed > MAX_DUNGEON_SEED
  ) {
    throw new RangeError(`The multilevel generation seed must be between 0 and ${MAX_DUNGEON_SEED}.`);
  }
  if (request.levels.length < 2 || request.levels.length > MAX_DUNGEON_LEVEL_COUNT) {
    throw new RangeError(`Multilevel generation supports 2 to ${MAX_DUNGEON_LEVEL_COUNT} levels.`);
  }
  if (
    !Number.isSafeInteger(request.entryLevelIndex)
    || request.entryLevelIndex < 0
    || request.entryLevelIndex >= request.levels.length
  ) {
    throw new RangeError("The entry level index must identify one of the configured levels.");
  }
  if (
    !Number.isSafeInteger(request.verticalConnectionCount)
    || request.verticalConnectionCount < 0
    || request.verticalConnectionCount > (request.levels.length - 1) * 2
  ) {
    throw new RangeError("The vertical connection count is outside the supported range.");
  }
  if (
    request.requireGlobalConnectivity
    && request.verticalConnectionCount < request.levels.length - 1
  ) {
    throw new RangeError("A connected multilevel dungeon needs at least one vertical connection per additional level.");
  }
  if (
    !request.allowVerticalCycles
    && request.verticalConnectionCount > request.levels.length - 1
  ) {
    throw new RangeError("The requested vertical connection count would create a cycle.");
  }
  if (
    request.verticalConnectionCount > 0
    && request.allowedVerticalConnectionKinds.length === 0
  ) {
    throw new RangeError("Select at least one allowed vertical connection type.");
  }
  const profile = resolveDungeonProfile(request.profile, request.customProfile);
  if (
    request.cavesEnabled
    || profile.cavesEnabled
    || profile.mode === "natural-cavern"
  ) {
    throw new RangeError("Multilevel generation currently requires a room-based V2 profile without caves.");
  }
  if (request.parameters.entranceMode !== "upper-stairs") {
    throw new RangeError("V2 multilevel generation currently supports only an upper-stairs entrance.");
  }

  const verticalIndices = new Set<number>();
  let previousVerticalIndex: number | undefined;
  let totalTileCount = 0;
  for (const [index, level] of request.levels.entries()) {
    if (!level.name.trim()) {
      throw new RangeError(`Level ${index + 1} needs a name.`);
    }
    if (!Number.isSafeInteger(level.verticalIndex) || verticalIndices.has(level.verticalIndex)) {
      throw new RangeError("Each level must have a unique safe-integer vertical index.");
    }
    if (previousVerticalIndex !== undefined && level.verticalIndex <= previousVerticalIndex) {
      throw new RangeError("Levels must be ordered from the lowest vertical index to the highest.");
    }
    verticalIndices.add(level.verticalIndex);
    previousVerticalIndex = level.verticalIndex;
    assertSupportedDungeonDimensions(level.width, level.height);
    if (
      !Number.isSafeInteger(level.roomCount)
      || level.roomCount < 2
      || level.roomCount > MAX_ROOM_COUNT_PER_LEVEL
    ) {
      throw new RangeError(`Each level must request between 2 and ${MAX_ROOM_COUNT_PER_LEVEL} rooms.`);
    }
    const levelProfile = level.profile ?? request.profile;
    const levelCustomProfile = level.customProfile
      ?? (level.profile === undefined || level.profile === request.profile
        ? request.customProfile
        : undefined);
    const resolvedLevelProfile = resolveDungeonProfile(levelProfile, levelCustomProfile);
    if (resolvedLevelProfile.cavesEnabled || resolvedLevelProfile.mode === "natural-cavern") {
      throw new RangeError(`Level "${level.name}" must use a room-based profile without caves.`);
    }
    totalTileCount += level.width * level.height;
  }
  if (totalTileCount > MAX_DUNGEON_TILE_COUNT) {
    throw new RangeError(
      `Multilevel generation is limited to ${MAX_DUNGEON_TILE_COUNT.toLocaleString("en-US")} tiles across all levels.`,
    );
  }
  if (request.allowedVerticalConnectionKinds.some((kind) => !VERTICAL_CONNECTION_KINDS.has(kind))) {
    throw new RangeError("One or more vertical connection types are not supported.");
  }
}

function getRoomAnchorCandidates(plan: GenerationPlan): GridPosition[] {
  const reserved = new Set([
    ...plan.transitions.map((transition) => `${transition.position.x},${transition.position.y}`),
    ...plan.features.map((feature) => `${feature.position.x},${feature.position.y}`),
  ]);
  const positions = new Map<string, GridPosition>();
  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      const position = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      const key = `${position.x},${position.y}`;
      if (!reserved.has(key)) positions.set(key, position);
    }
  }
  return [...positions.values()].sort((first, second) => first.y - second.y || first.x - second.x);
}

function takeAnchor(
  candidatesByLevel: Map<string, GridPosition[]>,
  level: DungeonLevel,
  random: () => number,
): GridPosition {
  const candidates = candidatesByLevel.get(level.id) ?? [];
  if (candidates.length === 0) {
    throw new RangeError(`Level "${level.name}" has no free room tile for a vertical connection.`);
  }
  const candidateIndex = Math.floor(random() * candidates.length);
  const position = candidates.splice(candidateIndex, 1)[0];
  if (!position) {
    throw new RangeError(`Could not select a vertical connection position on level "${level.name}".`);
  }
  return position;
}

function addVerticalTransition(
  level: DungeonLevel,
  connectionId: string,
  position: GridPosition,
  connectionKind: VerticalConnectionKind,
  otherVerticalIndex: number,
  nextTransitionOrdinal: Map<string, number>,
): DungeonLevel {
  const room = level.plan.rooms.find((candidate) => candidate.footprint.some((cell) => (
    candidate.position.x + cell.x === position.x
    && candidate.position.y + cell.y === position.y
  )));
  if (!room) {
    throw new RangeError(`Vertical connection position on level "${level.name}" is not inside a room.`);
  }
  let ordinal = nextTransitionOrdinal.get(level.id) ?? level.plan.transitions.length;
  while (level.plan.transitions.some((existing) => (
    existing.id === createStableGenerationId(level.plan.id, "transition", ordinal)
  ))) {
    ordinal += 1;
  }
  nextTransitionOrdinal.set(level.id, ordinal + 1);
  const isStaircase = connectionKind === "stairs" || connectionKind === "spiral-stairs";
  const transitionType = isStaircase
    ? otherVerticalIndex > level.verticalIndex ? "stairs-up" as const : "stairs-down" as const
    : "vertical-connection" as const;
  const transition = {
    id: createStableGenerationId(level.plan.id, "transition", ordinal),
    type: transitionType,
    position,
    roomId: room.id,
    verticalConnectionId: connectionId,
    metadata: { connectionKind },
  };
  return {
    ...level,
    plan: {
      ...level.plan,
      transitions: [...level.plan.transitions, transition],
    },
  };
}

function createConnectionPairs(
  levelCount: number,
  connectionCount: number,
  random: () => number,
): Array<{ sourceIndex: number; targetIndex: number }> {
  const pairs: Array<{ sourceIndex: number; targetIndex: number }> = [];
  for (let index = 0; index < Math.min(connectionCount, levelCount - 1); index += 1) {
    pairs.push({ sourceIndex: index, targetIndex: index + 1 });
  }
  while (pairs.length < connectionCount) {
    let sourceIndex = Math.floor(random() * levelCount);
    let targetIndex = Math.floor(random() * (levelCount - 1));
    if (targetIndex >= sourceIndex) targetIndex += 1;
    if (targetIndex < sourceIndex) [sourceIndex, targetIndex] = [targetIndex, sourceIndex];
    pairs.push({ sourceIndex, targetIndex });
  }
  return pairs;
}

export function generateDungeonStructure(
  request: DungeonStructureGenerationRequest,
): DungeonStructureGenerationResult {
  assertValidRequest(request);
  const dungeonId = `dungeon:${request.seed}`;
  const structureId = dungeonId;
  const levelConfigs = [...request.levels];
  const levels: DungeonLevel[] = [];
  const levelGenerations: GeneratedDungeonLevel[] = [];

  for (const [index, config] of levelConfigs.entries()) {
    const id = createStableGenerationId(structureId, "level", index);
    const pipelineRequest = createDungeonLevelPipelineRequest(request, config);
    const generation = generateDungeonPipeline(pipelineRequest);
    if (
      generation.metadata.generatorVersion !== DUNGEON_GENERATOR_VERSION_V2
      || !generation.plan
    ) {
      throw new Error(
        `Level "${config.name}" could not be generated by V2: ${generation.fallbackReason ?? "the pipeline returned no GenerationPlan."}`,
      );
    }
    const plan: GenerationPlan = {
      ...generation.plan,
      rooms: generation.plan.rooms.map((room) => ({ ...room, floorId: id })),
    };
    levels.push({
      id,
      name: config.name,
      verticalIndex: config.verticalIndex,
      plan,
      ...(config.isSecret ? { isSecret: true } : {}),
      ...(config.isOptional ? { isOptional: true } : {}),
      metadata: {},
    });
    levelGenerations.push({
      levelId: id,
      generation: { ...generation, plan },
    });
  }

  const random = createRandom(deriveRandomSeed(request.seed, "multilevel-vertical-connections"));
  const connectionPairs = createConnectionPairs(
    levels.length,
    request.verticalConnectionCount,
    random,
  );
  const candidatesByLevel = new Map(levels.map((level) => [level.id, getRoomAnchorCandidates(level.plan)]));
  const nextTransitionOrdinal = new Map(
    levels.map((level) => [level.id, level.plan.transitions.length]),
  );
  const verticalConnections = [];
  const updatedLevels = [...levels];
  const updatedGenerations = [...levelGenerations];

  for (const [index, pair] of connectionPairs.entries()) {
    const sourceLevel = updatedLevels[pair.sourceIndex];
    const targetLevel = updatedLevels[pair.targetIndex];
    if (!sourceLevel || !targetLevel) {
      throw new RangeError("A vertical connection references an unavailable generated level.");
    }
    const sourcePosition = takeAnchor(candidatesByLevel, sourceLevel, random);
    const targetPosition = takeAnchor(candidatesByLevel, targetLevel, random);
    const kind = request.allowedVerticalConnectionKinds[
      Math.floor(random() * request.allowedVerticalConnectionKinds.length)
    ];
    if (!kind) {
      throw new RangeError("Could not select an allowed vertical connection type.");
    }
    const id = createStableGenerationId(structureId, "vertical-connection", index);
    verticalConnections.push({
      id,
      sourceLevelId: sourceLevel.id,
      targetLevelId: targetLevel.id,
      sourcePosition,
      targetPosition,
      kind,
      direction: "bidirectional" as const,
      metadata: {},
    });
    updatedLevels[pair.sourceIndex] = addVerticalTransition(
      sourceLevel,
      id,
      sourcePosition,
      kind,
      targetLevel.verticalIndex,
      nextTransitionOrdinal,
    );
    updatedLevels[pair.targetIndex] = addVerticalTransition(
      targetLevel,
      id,
      targetPosition,
      kind,
      sourceLevel.verticalIndex,
      nextTransitionOrdinal,
    );
  }

  for (const [index, level] of updatedLevels.entries()) {
    const levelGeneration = updatedGenerations[index];
    if (!levelGeneration) {
      throw new RangeError(`Generated level result ${index} is missing.`);
    }
    const dungeon = generationPlanToDungeon(level.plan);
    updatedGenerations[index] = {
      ...levelGeneration,
      generation: {
        ...levelGeneration.generation,
        plan: level.plan,
        dungeon,
      },
    };
  }

  const entryLevel = updatedLevels[request.entryLevelIndex];
  if (!entryLevel) throw new RangeError("The configured entry level was not generated.");
  const generatedAt = updatedGenerations[0]?.generation.metadata.generatedAt ?? new Date().toISOString();
  const structure: DungeonStructure = {
    id: structureId,
    name: `Dungeon ${request.seed}`,
    generation: {
      seed: request.seed,
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      generatedAt,
    },
    settings: {
      profile: resolveDungeonProfile(request.profile, request.customProfile).id,
      levelCount: updatedLevels.length,
      verticalConnectionCount: verticalConnections.length,
      requireGlobalConnectivity: request.requireGlobalConnectivity,
      allowVerticalCycles: request.allowVerticalCycles,
    },
    connectivity: {
      requireGlobalConnectivity: request.requireGlobalConnectivity,
      entryLevelId: entryLevel.id,
    },
    levels: updatedLevels,
    verticalConnections,
    metadata: {},
  };
  const validation = validateDungeonStructure(structure);
  if (!validation.valid) {
    throw new DungeonStructureValidationError(validation.issues);
  }
  return {
    structure,
    levels: updatedGenerations,
    connectivity: analyzeDungeonConnectivity(structure),
  };
}
