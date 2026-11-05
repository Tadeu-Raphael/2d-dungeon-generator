import {
  assertSupportedDungeonDimensions,
  DUNGEON_GENERATOR_VERSION_V2,
  getMaxRoomCountForGrid,
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_ROOM_COUNT,
  MAX_DUNGEON_SEED,
  MAX_DUNGEON_TILE_COUNT,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
  MIN_DUNGEON_ROOM_COUNT,
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
import { MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE } from "./dungeonStructure";
import type {
  CustomDungeonProfile,
  DungeonProfileSelection,
} from "./dungeonProfiles";
import { resolveDungeonProfile } from "./customDungeonProfile";

export const MAX_DUNGEON_LEVEL_COUNT = 8;
const MAX_LEVEL_GENERATION_ATTEMPTS = 4;
const MAX_CAVE_ANCHORS_PER_REGION = 300;

const MAX_ROOM_COUNT_PER_LEVEL = MAX_DUNGEON_ROOM_COUNT;
const MAX_VERTICAL_CONNECTIONS_PER_ROOM = (MAX_DUNGEON_LEVEL_COUNT - 1) * 2;
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
  /** Adds organic caves to this level's room layout; defaults to the request value. */
  cavesEnabled?: boolean;
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
  /** Lets non-stair connections skip levels (for example level 1 to level 4). */
  allowLongVerticalConnections?: boolean;
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

export interface LevelSizeBasis {
  width: number;
  height: number;
  roomCount: number;
}

const LEVEL_DIMENSION_VARIATION = 0.18;
const LEVEL_ROOM_COUNT_VARIATION = 0.25;

/**
 * Size of a non-main level: a deterministic pseudo-random value close to the main level so floors
 * differ without drifting far from it. The same seed and level always yield the same size.
 */
export function deriveNearbyLevelSize(
  seed: number,
  verticalIndex: number,
  main: LevelSizeBasis,
): LevelSizeBasis {
  const random = createRandom(deriveRandomSeed(seed, `level-size:${verticalIndex}`));
  const vary = (value: number, variation: number): number => (
    Math.round(value * (1 + (random() * 2 - 1) * variation))
  );
  let width = Math.min(MAX_DUNGEON_WIDTH, Math.max(MIN_DUNGEON_DIMENSION, vary(main.width, LEVEL_DIMENSION_VARIATION)));
  let height = Math.min(MAX_DUNGEON_HEIGHT, Math.max(MIN_DUNGEON_DIMENSION, vary(main.height, LEVEL_DIMENSION_VARIATION)));
  const roomCount = Math.min(
    getMaxRoomCountForGrid(width, height),
    Math.max(MIN_DUNGEON_ROOM_COUNT, vary(main.roomCount, LEVEL_ROOM_COUNT_VARIATION)),
  );
  if (width * height > MAX_DUNGEON_TILE_COUNT) {
    const scale = Math.sqrt(MAX_DUNGEON_TILE_COUNT / (width * height));
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  return { width, height, roomCount };
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
    cavesEnabled: level.cavesEnabled ?? request.cavesEnabled ?? false,
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
  const positions: GridPosition[] = [];
  for (const room of plan.rooms) {
    const centerX = room.position.x + (room.width - 1) / 2;
    const centerY = room.position.y + (room.height - 1) / 2;
    const nearestPositions: Array<{ position: GridPosition; distance: number }> = [];
    for (const cell of room.footprint) {
      const position = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      const key = `${position.x},${position.y}`;
      if (reserved.has(key)) continue;
      const distance = Math.abs(position.x - centerX) + Math.abs(position.y - centerY);
      const insertionIndex = nearestPositions.findIndex((candidate) => (
        candidate.distance > distance
        || (candidate.distance === distance
          && (candidate.position.y > position.y
            || (candidate.position.y === position.y && candidate.position.x > position.x)))
      ));
      if (insertionIndex < 0 && nearestPositions.length >= MAX_VERTICAL_CONNECTIONS_PER_ROOM) {
        continue;
      }
      nearestPositions.splice(
        insertionIndex < 0 ? nearestPositions.length : insertionIndex,
        0,
        { position, distance },
      );
      if (nearestPositions.length > MAX_VERTICAL_CONNECTIONS_PER_ROOM) nearestPositions.pop();
    }
    positions.push(...nearestPositions.map((candidate) => candidate.position));
  }
  return positions.sort((first, second) => first.y - second.y || first.x - second.x);
}

function getCaveAnchorCandidates(plan: GenerationPlan): Array<{ position: GridPosition; regionId: string }> {
  const reserved = new Set([
    ...plan.transitions.map((transition) => `${transition.position.x},${transition.position.y}`),
    ...plan.features.map((feature) => `${feature.position.x},${feature.position.y}`),
  ]);
  const candidates: Array<{ position: GridPosition; regionId: string }> = [];
  for (const region of plan.naturalRegions ?? []) {
    const cells: GridPosition[] = [];
    for (const span of region.rowSpans) {
      for (let x = span.xStart; x < span.xEnd; x += 1) {
        if (!reserved.has(`${x},${span.y}`)) cells.push({ x, y: span.y });
      }
    }
    // Keep the pool small enough for pairwise matching while still covering the whole region.
    const stride = Math.max(1, Math.ceil(cells.length / MAX_CAVE_ANCHORS_PER_REGION));
    for (let index = 0; index < cells.length; index += stride) {
      candidates.push({ position: cells[index], regionId: region.id });
    }
  }
  return candidates;
}

const BUILT_VERTICAL_KINDS: ReadonlySet<VerticalConnectionKind> = new Set([
  "stairs",
  "spiral-stairs",
  "elevator",
  "trapdoor",
]);
// Caves rarely host built structures; natural drops, shafts and ramps use them more often.
const CAVE_ANCHOR_CHANCE_BUILT = 0.08;
const CAVE_ANCHOR_CHANCE_NATURAL = 0.35;

function takeClosestAnchorPair(
  candidatesByLevel: Map<string, GridPosition[]>,
  sourceLevel: DungeonLevel,
  targetLevel: DungeonLevel,
  maximumDistance?: number,
): { sourcePosition: GridPosition; targetPosition: GridPosition } {
  const sourceCandidates = candidatesByLevel.get(sourceLevel.id) ?? [];
  const targetCandidates = candidatesByLevel.get(targetLevel.id) ?? [];
  if (sourceCandidates.length === 0 || targetCandidates.length === 0) {
    const level = sourceCandidates.length === 0 ? sourceLevel : targetLevel;
    throw new RangeError(`Level "${level.name}" has no free room tile for a vertical connection.`);
  }

  let closestDistance = Number.POSITIVE_INFINITY;
  let sourceIndex = -1;
  let targetIndex = -1;
  for (let candidateSourceIndex = 0; candidateSourceIndex < sourceCandidates.length; candidateSourceIndex += 1) {
    const source = sourceCandidates[candidateSourceIndex];
    if (!source) continue;
    for (let candidateTargetIndex = 0; candidateTargetIndex < targetCandidates.length; candidateTargetIndex += 1) {
      const target = targetCandidates[candidateTargetIndex];
      if (!target) continue;
      const distance = Math.abs(source.x - target.x) + Math.abs(source.y - target.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        sourceIndex = candidateSourceIndex;
        targetIndex = candidateTargetIndex;
      }
    }
  }
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new RangeError(`Could not align vertical connection anchors between "${sourceLevel.name}" and "${targetLevel.name}".`);
  }
  if (maximumDistance !== undefined && closestDistance > maximumDistance) {
    throw new RangeError(
      `The nearest stair anchors between "${sourceLevel.name}" and "${targetLevel.name}" are ${closestDistance} tiles apart; the maximum is ${maximumDistance}.`,
    );
  }

  const sourcePosition = sourceCandidates.splice(sourceIndex, 1)[0];
  const targetPosition = targetCandidates.splice(targetIndex, 1)[0];
  if (!sourcePosition || !targetPosition) {
    throw new RangeError(`Could not reserve matched stair anchors between "${sourceLevel.name}" and "${targetLevel.name}".`);
  }
  return { sourcePosition, targetPosition };
}

function addVerticalTransition(
  level: DungeonLevel,
  connectionId: string,
  position: GridPosition,
  connectionKind: VerticalConnectionKind,
  otherVerticalIndex: number,
  nextTransitionOrdinal: Map<string, number>,
  regionId?: string,
): DungeonLevel {
  const room = regionId
    ? undefined
    : level.plan.rooms.find((candidate) => candidate.footprint.some((cell) => (
      candidate.position.x + cell.x === position.x
      && candidate.position.y + cell.y === position.y
    )));
  if (!room && !regionId) {
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
    ...(room ? { roomId: room.id } : { regionId }),
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

function createLongConnectionPlan(
  levelCount: number,
  count: number,
  allowedKinds: readonly VerticalConnectionKind[],
  random: () => number,
): { pairs: Array<{ sourceIndex: number; targetIndex: number }>; kinds: VerticalConnectionKind[] } {
  const pickKind = (predicate: (kind: VerticalConnectionKind) => boolean): VerticalConnectionKind | undefined => {
    const options = allowedKinds.filter(predicate);
    return options[Math.floor(random() * options.length)];
  };
  const isStairKind = (kind: VerticalConnectionKind): boolean => kind === "stairs" || kind === "spiral-stairs";
  const canSkip = allowedKinds.some((kind) => !isStairKind(kind));
  const pairs: Array<{ sourceIndex: number; targetIndex: number }> = [];
  const kinds: VerticalConnectionKind[] = [];
  const addPair = (sourceIndex: number, targetIndex: number, skipping: boolean): void => {
    const kind = pickKind(skipping ? (candidate) => !isStairKind(candidate) : () => true);
    if (!kind) throw new RangeError("Could not select an allowed vertical connection type.");
    pairs.push({ sourceIndex, targetIndex });
    kinds.push(kind);
  };

  // Every new level attaches to an earlier one, sometimes far above it, so the stack stays connected.
  for (let target = 1; target < levelCount && pairs.length < count; target += 1) {
    const skipping = canSkip && target >= 2 && random() < 0.6;
    const source = skipping ? Math.floor(random() * (target - 1)) : target - 1;
    addPair(source, target, skipping);
  }
  while (pairs.length < count) {
    const first = Math.floor(random() * levelCount);
    let second = Math.floor(random() * (levelCount - 1));
    if (second >= first) second += 1;
    const sourceIndex = Math.min(first, second);
    const targetIndex = Math.max(first, second);
    const skipping = targetIndex - sourceIndex > 1;
    if (skipping && !canSkip) {
      addPair(sourceIndex, sourceIndex + 1, false);
    } else {
      addPair(sourceIndex, targetIndex, skipping);
    }
  }
  return { pairs, kinds };
}

function createConnectionPairs(
  levelCount: number,
  connectionKinds: readonly VerticalConnectionKind[],
  random: () => number,
): Array<{ sourceIndex: number; targetIndex: number }> {
  const pairs: Array<{ sourceIndex: number; targetIndex: number }> = [];
  for (let index = 0; index < Math.min(connectionKinds.length, levelCount - 1); index += 1) {
    pairs.push({ sourceIndex: index, targetIndex: index + 1 });
  }
  while (pairs.length < connectionKinds.length) {
    const kind = connectionKinds[pairs.length];
    if (kind === "stairs" || kind === "spiral-stairs") {
      const sourceIndex = Math.floor(random() * (levelCount - 1));
      pairs.push({ sourceIndex, targetIndex: sourceIndex + 1 });
      continue;
    }
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
    const basePipelineRequest = createDungeonLevelPipelineRequest(request, config);
    let generation = generateDungeonPipeline(basePipelineRequest);
    let generationAttempts = 1;
    // A level has no V1 fallback, so rare unroutable layouts are retried with derived seeds.
    while (
      (generation.metadata.generatorVersion !== DUNGEON_GENERATOR_VERSION_V2 || !generation.plan)
      && generationAttempts < MAX_LEVEL_GENERATION_ATTEMPTS
    ) {
      generation = generateDungeonPipeline({
        ...basePipelineRequest,
        seed: deriveRandomSeed(basePipelineRequest.seed, `level-retry:${generationAttempts}`),
      });
      generationAttempts += 1;
    }
    if (
      generation.metadata.generatorVersion !== DUNGEON_GENERATOR_VERSION_V2
      || !generation.plan
    ) {
      throw new Error(
        `Level "${config.name}" could not be generated by V2 after ${generationAttempts} attempts: ${generation.fallbackReason ?? "the pipeline returned no GenerationPlan."}`,
      );
    }
    const plan: GenerationPlan = {
      ...generation.plan,
      rooms: generation.plan.rooms.map((room) => ({ ...room, floorId: id })),
      transitions: generation.plan.transitions.filter((transition) => {
        if (transition.verticalConnectionId) return true;
        if (transition.type === "stairs-down") return false;
        if (transition.type === "stairs-up") {
          return index === request.entryLevelIndex && transition.metadata.role === "entry";
        }
        return true;
      }),
    };
    levels.push({
      id,
      name: config.name,
      verticalIndex: config.verticalIndex,
      plan,
      ...(config.isSecret ? { isSecret: true } : {}),
      ...(config.isOptional ? { isOptional: true } : {}),
      metadata: generationAttempts > 1 ? { generationAttempts } : {},
    });
    levelGenerations.push({
      levelId: id,
      generation: { ...generation, plan },
    });
  }

  const random = createRandom(deriveRandomSeed(request.seed, "multilevel-vertical-connections"));
  let connectionKinds: VerticalConnectionKind[];
  let connectionPairs: Array<{ sourceIndex: number; targetIndex: number }>;
  if (request.allowLongVerticalConnections) {
    const longPlan = createLongConnectionPlan(
      levels.length,
      request.verticalConnectionCount,
      request.allowedVerticalConnectionKinds,
      random,
    );
    connectionKinds = longPlan.kinds;
    connectionPairs = longPlan.pairs;
  } else {
    connectionKinds = Array.from(
      { length: request.verticalConnectionCount },
      () => {
        const kind = request.allowedVerticalConnectionKinds[
          Math.floor(random() * request.allowedVerticalConnectionKinds.length)
        ];
        if (!kind) {
          throw new RangeError("Could not select an allowed vertical connection type.");
        }
        return kind;
      },
    );
    connectionPairs = createConnectionPairs(
      levels.length,
      connectionKinds,
      random,
    );
  }
  const candidatesByLevel = new Map(levels.map((level) => [level.id, getRoomAnchorCandidates(level.plan)]));
  const caveCandidatesByLevel = new Map(levels.map((level) => {
    const caveAnchors = getCaveAnchorCandidates(level.plan);
    return [level.id, caveAnchors] as const;
  }));
  const caveRegionByPosition = new Map<string, string>();
  const caveCandidatePositions = new Map<string, GridPosition[]>();
  for (const [levelId, anchors] of caveCandidatesByLevel) {
    caveCandidatePositions.set(levelId, anchors.map((anchor) => {
      caveRegionByPosition.set(`${levelId}:${anchor.position.x},${anchor.position.y}`, anchor.regionId);
      return anchor.position;
    }));
  }
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
    const kind = connectionKinds[index];
    if (!kind) {
      throw new RangeError("Could not select an allowed vertical connection type.");
    }
    const stairKind = kind === "stairs" || kind === "spiral-stairs";
    const caveChance = BUILT_VERTICAL_KINDS.has(kind)
      ? CAVE_ANCHOR_CHANCE_BUILT
      : CAVE_ANCHOR_CHANCE_NATURAL;
    const hasCaves = (levelId: string): boolean => (caveCandidatePositions.get(levelId)?.length ?? 0) > 0;
    const hasRooms = (levelId: string): boolean => (candidatesByLevel.get(levelId)?.length ?? 0) > 0;
    // Pools are only randomized where a level really offers both; room-only levels draw nothing.
    const pickPool = (levelId: string): "rooms" | "caves" => {
      if (!hasCaves(levelId)) return "rooms";
      if (!hasRooms(levelId)) return "caves";
      return random() < caveChance ? "caves" : "rooms";
    };
    const sourcePool = pickPool(sourceLevel.id);
    const targetPool = pickPool(targetLevel.id);
    const buildPools = (sourceKind: "rooms" | "caves", targetKind: "rooms" | "caves") => new Map<string, GridPosition[]>([
      [sourceLevel.id, (sourceKind === "caves" ? caveCandidatePositions : candidatesByLevel).get(sourceLevel.id) ?? []],
      [targetLevel.id, (targetKind === "caves" ? caveCandidatePositions : candidatesByLevel).get(targetLevel.id) ?? []],
    ]);
    const maximumDistance = stairKind ? MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE : undefined;
    let usedPools: ["rooms" | "caves", "rooms" | "caves"] = [sourcePool, targetPool];
    let anchorPair: { sourcePosition: GridPosition; targetPosition: GridPosition };
    try {
      anchorPair = takeClosestAnchorPair(buildPools(sourcePool, targetPool), sourceLevel, targetLevel, maximumDistance);
    } catch (error) {
      if (sourcePool === "rooms" && targetPool === "rooms") throw error;
      // Cave anchors may be too far apart for stairs; fall back to the built rooms.
      usedPools = ["rooms", "rooms"];
      anchorPair = takeClosestAnchorPair(buildPools("rooms", "rooms"), sourceLevel, targetLevel, maximumDistance);
    }
    const { sourcePosition, targetPosition } = anchorPair;
    const sourceRegionId = usedPools[0] === "caves"
      ? caveRegionByPosition.get(`${sourceLevel.id}:${sourcePosition.x},${sourcePosition.y}`)
      : undefined;
    const targetRegionId = usedPools[1] === "caves"
      ? caveRegionByPosition.get(`${targetLevel.id}:${targetPosition.x},${targetPosition.y}`)
      : undefined;
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
      sourceRegionId,
    );
    updatedLevels[pair.targetIndex] = addVerticalTransition(
      targetLevel,
      id,
      targetPosition,
      kind,
      sourceLevel.verticalIndex,
      nextTransitionOrdinal,
      targetRegionId,
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
