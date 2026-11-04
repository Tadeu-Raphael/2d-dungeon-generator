import {
  CAVE_CONNECTION_WALL_TILE,
  CORRIDOR_TILE,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  DOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  assertSupportedDungeonDimensions,
  MAX_DUNGEON_SEED,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  generateDungeonVersioned,
} from "./dungeon";
import type {
  Dungeon,
  DungeonGeneratorVersion,
  DungeonGenerationMetadata,
  VersionedDungeonGeneration,
} from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type { DungeonConcept } from "./dungeonProfiles";
import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineResult } from "./generationPipeline";
import {
  DUNGEON_GENERATION_V1_BASELINES,
  createDungeonV1BaselineRequest,
} from "./generationBaselines";
import type { DungeonGenerationBaseline } from "./generationBaselines";
import { getCorridorPathBrush } from "./generationCorridorGeometry";
import type { GenerationPlan, GridPosition, SpatialLayoutStyle, TopologyStyle } from "./generationPlan";
import {
  analyzeTopologyConnectivity,
  getDungeonTopologyStatistics,
  isConnectionPlayerAccessible,
  validateDungeonTopology,
} from "./generationTopology";
import { validateGenerationPlan } from "./generationPlanValidation";
import { generationPlanToDungeon } from "./generationPlanToDungeon";

export interface GenerationBenchmarkOptions {
  baselines?: readonly DungeonGenerationBaseline[];
  versions?: readonly DungeonGeneratorVersion[];
  topologyStyle?: TopologyStyle;
  spatialLayoutStyle?: SpatialLayoutStyle;
  corridorWidth?: number;
  varyCorridorWidths?: boolean;
}

export interface GenerationBenchmarkMetrics {
  roomCount: number;
  connectionCount: number | null;
  averageCorridorLength: number | null;
  branchCount: number | null;
  cycleCount: number | null;
  deadEndCount: number | null;
  isolatedRoomCount: number;
  connectedRoomCount: number;
  corridorTileCount: number;
  occupiedTileCount: number;
  roomTileCount: number;
  occupiedAreaPercent: number;
  compactness: number;
  averageNearestRoomDistance: number;
  spatialSpreadPercent: number;
}

export interface GenerationBenchmarkRun {
  baselineId: string;
  seed: number;
  requestedVersion: DungeonGeneratorVersion;
  effectiveVersion?: DungeonGeneratorVersion;
  profile: string;
  algorithm?: string;
  topologyStyle?: TopologyStyle;
  spatialLayoutStyle?: SpatialLayoutStyle;
  elapsedMs?: number;
  rasterizationMs?: number;
  fallbackReason?: string;
  unsupportedReason?: string;
  dungeon?: Dungeon;
  plan?: GenerationPlan;
  metadata?: DungeonGenerationMetadata;
  metrics?: GenerationBenchmarkMetrics;
  audit?: GenerationConsistencyAudit;
}

export interface GenerationConsistencyAudit {
  planValid: boolean;
  topologyValid: boolean;
  physicalConnectivityMatchesTiles: boolean;
  playerAccessibilityMatchesTiles: boolean;
  roomCountMatchesTiles: boolean;
  routeTilesMissing: GridPosition[];
  unmodeledCorridorTiles: GridPosition[];
  invalidDoorTransitions: GridPosition[];
  physicalGraphOnlyRoomIds: string[];
  physicalTilesOnlyRoomIds: string[];
  playerGraphOnlyRoomIds: string[];
  playerTilesOnlyRoomIds: string[];
  issues: string[];
}

const WALL_TILE = 0;

function isDungeonConcept(profile: string): profile is DungeonConcept {
  return Object.prototype.hasOwnProperty.call(DUNGEON_CONCEPTS, profile);
}

function positionIndex(position: GridPosition, width: number): number {
  return position.y * width + position.x;
}

function isTileWalkable(tile: number): boolean {
  return tile !== WALL_TILE
    && tile !== CAVE_CONNECTION_WALL_TILE
    && tile !== PILLAR_TILE;
}

function findRoomAnchors(
  dungeon: Dungeon,
  plan?: GenerationPlan,
): Map<string, GridPosition> {
  const anchors = new Map<string, GridPosition>();
  const rooms = plan?.rooms;
  dungeon.roomDetails.forEach((room, index) => {
    const node = rooms?.[index];
    const roomId = node?.id ?? `room-${index + 1}`;
    const cells = node
      ? node.footprint.map((cell) => ({
        x: node.position.x + cell.x,
        y: node.position.y + cell.y,
      }))
      : Array.from({ length: room.height }, (_, y) => (
        Array.from({ length: room.width }, (_, x) => ({ x: room.x + x, y: room.y + y }))
      )).flat();
    const anchor = cells.find((position) => (
      isTileWalkable(dungeon.tiles[position.y]?.[position.x] ?? WALL_TILE)
    ));
    if (anchor) anchors.set(roomId, anchor);
  });
  return anchors;
}

function floodTiles(
  dungeon: Dungeon,
  start: GridPosition | undefined,
  blockedPositions: ReadonlySet<number> = new Set(),
): Uint8Array {
  const visited = new Uint8Array(dungeon.width * dungeon.height);
  if (
    !start
    || start.x < 0
    || start.y < 0
    || start.x >= dungeon.width
    || start.y >= dungeon.height
    || blockedPositions.has(positionIndex(start, dungeon.width))
    || !isTileWalkable(dungeon.tiles[start.y]?.[start.x] ?? WALL_TILE)
  ) return visited;
  const queue = new Int32Array(visited.length);
  let tail = 0;
  const startIndex = positionIndex(start, dungeon.width);
  visited[startIndex] = 1;
  queue[tail] = startIndex;
  tail += 1;
  const visit = (nextIndex: number) => {
    if (
      nextIndex < 0
      || visited[nextIndex]
      || blockedPositions.has(nextIndex)
    ) return;
    const nextX = nextIndex % dungeon.width;
    const nextY = Math.floor(nextIndex / dungeon.width);
    if (!isTileWalkable(dungeon.tiles[nextY][nextX])) return;
    visited[nextIndex] = 1;
    queue[tail] = nextIndex;
    tail += 1;
  };
  for (let head = 0; head < tail; head += 1) {
    const currentIndex = queue[head];
    const x = currentIndex % dungeon.width;
    const y = Math.floor(currentIndex / dungeon.width);
    if (y > 0) visit(currentIndex - dungeon.width);
    if (x + 1 < dungeon.width) visit(currentIndex + 1);
    if (y + 1 < dungeon.height) visit(currentIndex + dungeon.width);
    if (x > 0) visit(currentIndex - 1);
  }
  return visited;
}

function getRoomIdsAtTiles(
  anchors: ReadonlyMap<string, GridPosition>,
  visited: Uint8Array,
  width: number,
): Set<string> {
  return new Set([...anchors].flatMap(([roomId, position]) => (
    visited[positionIndex(position, width)] ? [roomId] : []
  )));
}

function difference(
  first: ReadonlySet<string>,
  second: ReadonlySet<string>,
): string[] {
  return [...first].filter((value) => !second.has(value)).sort();
}

function getTransitionTile(type: string): number | undefined {
  const transitionTiles: Record<string, number> = {
    doorway: DOOR_TILE,
    "secret-door": SECRET_DOOR_TILE,
    "stairs-up": STAIRS_UP_TILE,
    "stairs-down": STAIRS_DOWN_TILE,
    "room-stairs": ROOM_STAIRS_TILE,
    "exterior-entrance": EXTERIOR_ENTRANCE_TILE,
    "exterior-connection": EXTERIOR_CONNECTION_TILE,
  };
  return transitionTiles[type];
}

export function auditGenerationConsistency(
  plan: GenerationPlan,
  dungeon: Dungeon,
): GenerationConsistencyAudit {
  const planValidation = validateGenerationPlan(plan);
  const topologyValidation = validateDungeonTopology(plan);
  const issues: string[] = [
    ...planValidation.issues.map((issue) => `${issue.code}: ${issue.message}`),
    ...topologyValidation.issues.map((issue) => `${issue.code}: ${issue.message}`),
  ];
  if (dungeon.width !== plan.width || dungeon.height !== plan.height) {
    issues.push("Dungeon tile dimensions differ from the GenerationPlan dimensions.");
  }
  if (
    dungeon.tiles.length !== dungeon.height
    || dungeon.tiles.some((row) => row.length !== dungeon.width)
  ) {
    issues.push("Dungeon.tiles does not match the declared map dimensions.");
  }

  const anchors = findRoomAnchors(dungeon, plan);
  const entryAnchor = anchors.get(plan.entryRoomId ?? "");
  const physicalConnections = plan.connections.filter((edge) => (
    !edge.isBlocked
    && edge.connectionType !== "blocked-passage"
    && edge.connectionType !== "vertical"
  ));
  const physicalGraph = analyzeTopologyConnectivity({
    ...plan,
    connections: physicalConnections,
  }).physical;
  const playerGraph = analyzeTopologyConnectivity(plan).playerAccess;
  const physicalTiles = getRoomIdsAtTiles(
    anchors,
    floodTiles(dungeon, entryAnchor),
    dungeon.width,
  );

  const inaccessibleDoorPositions = new Set<number>();
  for (const edge of plan.connections) {
    if (isConnectionPlayerAccessible(edge, {})) continue;
    for (const transition of plan.transitions) {
      if (transition.connectionId === edge.id) {
        inaccessibleDoorPositions.add(positionIndex(transition.position, dungeon.width));
      }
    }
  }
  const playerTiles = getRoomIdsAtTiles(
    anchors,
    floodTiles(dungeon, entryAnchor, inaccessibleDoorPositions),
    dungeon.width,
  );
  const physicalGraphRoomIds = new Set(physicalGraph.reachableRoomIds);
  const playerGraphRoomIds = new Set(playerGraph.reachableRoomIds);
  const physicalGraphOnlyRoomIds = difference(physicalGraphRoomIds, physicalTiles);
  const physicalTilesOnlyRoomIds = difference(physicalTiles, physicalGraphRoomIds);
  const playerGraphOnlyRoomIds = difference(playerGraphRoomIds, playerTiles);
  const playerTilesOnlyRoomIds = difference(playerTiles, playerGraphRoomIds);

  const roomCells = new Set<number>();
  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      roomCells.add(positionIndex({
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      }, dungeon.width));
    }
  }
  const expectedCorridorCells = new Set<number>();
  const routeTilesMissing: GridPosition[] = [];
  for (const edge of physicalConnections) {
    if (edge.path.length === 0 || edge.connectionType === "vertical") continue;
    for (const position of getCorridorPathBrush(edge.path, edge.width)) {
      const key = positionIndex(position, dungeon.width);
      expectedCorridorCells.add(key);
      if (roomCells.has(key)) continue;
      const tile = dungeon.tiles[position.y]?.[position.x] ?? WALL_TILE;
      if (!isTileWalkable(tile)) routeTilesMissing.push(position);
    }
  }
  for (const intersection of plan.intersections) {
    const offset = Math.floor((intersection.width - 1) / 2);
    for (let y = 0; y < intersection.width; y += 1) {
      for (let x = 0; x < intersection.width; x += 1) {
        expectedCorridorCells.add(positionIndex({
          x: intersection.position.x + x - offset,
          y: intersection.position.y + y - offset,
        }, dungeon.width));
      }
    }
  }
  const unmodeledCorridorTiles: GridPosition[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const index = y * dungeon.width + x;
      if (
        dungeon.tiles[y][x] === CORRIDOR_TILE
        && !roomCells.has(index)
        && !expectedCorridorCells.has(index)
      ) {
        unmodeledCorridorTiles.push({ x, y });
      }
    }
  }
  const invalidDoorTransitions = plan.transitions.flatMap((transition) => {
    const expectedTile = getTransitionTile(transition.type);
    if (expectedTile === undefined || dungeon.tiles[transition.position.y]?.[transition.position.x] === expectedTile) {
      return [];
    }
    return [transition.position];
  });
  if (dungeon.roomDetails.length !== plan.rooms.length) {
    issues.push("Dungeon room count differs from the GenerationPlan room count.");
  }
  if (routeTilesMissing.length > 0) {
    issues.push(`${routeTilesMissing.length} routed corridor brush tiles are not walkable in Dungeon.tiles.`);
  }
  if (unmodeledCorridorTiles.length > 0) {
    issues.push(`${unmodeledCorridorTiles.length} corridor tiles are not represented by a route or junction.`);
  }
  if (invalidDoorTransitions.length > 0) {
    issues.push(`${invalidDoorTransitions.length} transitions do not match their Dungeon tile representation.`);
  }
  if (physicalGraphOnlyRoomIds.length > 0 || physicalTilesOnlyRoomIds.length > 0) {
    issues.push("The carved GenerationPlan graph and physical Dungeon.tiles BFS reach different rooms.");
  }
  if (playerGraphOnlyRoomIds.length > 0 || playerTilesOnlyRoomIds.length > 0) {
    issues.push("The player-accessible GenerationPlan graph and Dungeon.tiles BFS reach different rooms.");
  }

  return {
    planValid: planValidation.valid,
    topologyValid: topologyValidation.valid,
    physicalConnectivityMatchesTiles:
      physicalGraphOnlyRoomIds.length === 0 && physicalTilesOnlyRoomIds.length === 0,
    playerAccessibilityMatchesTiles:
      playerGraphOnlyRoomIds.length === 0 && playerTilesOnlyRoomIds.length === 0,
    roomCountMatchesTiles: dungeon.roomDetails.length === plan.rooms.length,
    routeTilesMissing,
    unmodeledCorridorTiles,
    invalidDoorTransitions,
    physicalGraphOnlyRoomIds,
    physicalTilesOnlyRoomIds,
    playerGraphOnlyRoomIds,
    playerTilesOnlyRoomIds,
    issues,
  };
}

function collectMetrics(dungeon: Dungeon, plan?: GenerationPlan): GenerationBenchmarkMetrics {
  const topology = plan ? getDungeonTopologyStatistics(plan) : undefined;
  const roomCount = dungeon.roomDetails.length;
  const roomRects = dungeon.roomDetails.map((room) => ({
    minX: room.x,
    minY: room.y,
    maxX: room.x + room.width,
    maxY: room.y + room.height,
    centerX: room.centerX,
    centerY: room.centerY,
  }));
  const roomArea = roomRects.reduce((total, room) => (
    total + Math.max(0, room.maxX - room.minX) * Math.max(0, room.maxY - room.minY)
  ), 0);
  const roomBounds = roomRects.length === 0 ? undefined : {
    minX: Math.min(...roomRects.map((room) => room.minX)),
    minY: Math.min(...roomRects.map((room) => room.minY)),
    maxX: Math.max(...roomRects.map((room) => room.maxX)),
    maxY: Math.max(...roomRects.map((room) => room.maxY)),
  };
  const roomBoundsArea = roomBounds
    ? Math.max(1, (roomBounds.maxX - roomBounds.minX) * (roomBounds.maxY - roomBounds.minY))
    : 1;
  const nearestDistances = roomRects.map((room, index) => {
    if (roomRects.length < 2) return 0;
    return Math.min(...roomRects.flatMap((other, otherIndex) => (
      index === otherIndex ? [] : [Math.hypot(room.centerX - other.centerX, room.centerY - other.centerY)]
    )));
  });
  let occupiedTileCount = 0;
  for (const row of dungeon.tiles) {
    for (const tile of row) {
      if (tile !== WALL_TILE && tile !== CAVE_CONNECTION_WALL_TILE) occupiedTileCount += 1;
    }
  }
  const roomTileCount = roomRects.reduce((total, room) => {
    let area = 0;
    for (let y = room.minY; y < room.maxY; y += 1) {
      for (let x = room.minX; x < room.maxX; x += 1) {
        if (dungeon.tiles[y]?.[x] !== undefined && dungeon.tiles[y][x] !== WALL_TILE) area += 1;
      }
    }
    return total + area;
  }, 0);
  const anchors = findRoomAnchors(dungeon, plan);
  const startRoomId = plan?.entryRoomId ?? anchors.keys().next().value;
  const reachableTiles = floodTiles(dungeon, startRoomId ? anchors.get(startRoomId) : undefined);
  const connectedRoomCount = getRoomIdsAtTiles(anchors, reachableTiles, dungeon.width).size;
  const corridorLengths = plan?.connections
    .filter((edge) => (
      !edge.isBlocked
      && edge.connectionType !== "blocked-passage"
      && edge.connectionType !== "vertical"
      && edge.path.length > 0
    ))
    .map((edge) => Math.max(0, edge.path.length - 1)) ?? [];
  const layoutBoundsArea = roomBoundsArea;
  return {
    roomCount,
    connectionCount: topology?.connectionCount ?? null,
    averageCorridorLength: corridorLengths.length > 0
      ? corridorLengths.reduce((total, length) => total + length, 0) / corridorLengths.length
      : null,
    branchCount: topology?.branchCount ?? null,
    cycleCount: topology?.cycleRank ?? null,
    deadEndCount: topology?.deadEndCount ?? null,
    isolatedRoomCount: Math.max(0, roomCount - connectedRoomCount),
    connectedRoomCount,
    corridorTileCount: dungeon.tiles.reduce(
      (total, row) => total + row.filter((tile) => tile === CORRIDOR_TILE).length,
      0,
    ),
    occupiedTileCount,
    roomTileCount,
    occupiedAreaPercent: occupiedTileCount / Math.max(1, dungeon.width * dungeon.height) * 100,
    compactness: roomArea / layoutBoundsArea,
    averageNearestRoomDistance: nearestDistances.length > 0
      ? nearestDistances.reduce((total, distance) => total + distance, 0) / nearestDistances.length
      : 0,
    spatialSpreadPercent: roomBoundsArea / Math.max(1, dungeon.width * dungeon.height) * 100,
  };
}

function generateBaselineRun(
  baseline: DungeonGenerationBaseline,
  version: DungeonGeneratorVersion,
  options: GenerationBenchmarkOptions,
): GenerationBenchmarkRun {
  if (version === DUNGEON_GENERATOR_VERSION_V2 && !isDungeonConcept(baseline.profile)) {
    return {
      baselineId: baseline.id,
      seed: baseline.seed,
      requestedVersion: version,
      profile: baseline.profile,
      unsupportedReason: "The V2 pipeline requires one of the eight registered dungeon profiles; this Phase 1 case uses the custom profile.",
    };
  }

  const baseRequest = createDungeonV1BaselineRequest(baseline);
  const parameters = {
    ...baseRequest.parameters!,
    ...(options.corridorWidth !== undefined ? { corridorWidth: options.corridorWidth } : {}),
  };
  const startedAt = globalThis.performance.now();
  let generation: VersionedDungeonGeneration;
  let plan: GenerationPlan | undefined;
  let fallbackReason: string | undefined;
  if (version === DUNGEON_GENERATOR_VERSION_V1) {
    generation = generateDungeonVersioned({
      ...baseRequest,
      parameters,
    });
  } else {
    const result: DungeonGenerationPipelineResult = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: baseline.profile as DungeonConcept,
      seed: baseline.seed,
      parameters,
      topologyStyle: options.topologyStyle,
      spatialLayoutStyle: options.spatialLayoutStyle,
      varyCorridorWidths: options.varyCorridorWidths,
    });
    generation = result;
    plan = result.plan;
    fallbackReason = result.fallbackReason;
  }
  const elapsedMs = globalThis.performance.now() - startedAt;
  let rasterizationMs: number | undefined;
  if (plan) {
    const rasterizationStartedAt = globalThis.performance.now();
    const rasterizedDungeon = generationPlanToDungeon(plan);
    rasterizationMs = globalThis.performance.now() - rasterizationStartedAt;
    if (
      rasterizedDungeon.width !== generation.dungeon.width
      || rasterizedDungeon.height !== generation.dungeon.height
      || rasterizedDungeon.rooms !== generation.dungeon.rooms
    ) {
      throw new Error("Benchmark rasterization did not preserve the generated dungeon dimensions and room count.");
    }
  }
  const audit = plan ? auditGenerationConsistency(plan, generation.dungeon) : undefined;
  return {
    baselineId: baseline.id,
    seed: baseline.seed,
    requestedVersion: version,
    effectiveVersion: generation.metadata.generatorVersion,
    profile: baseline.profile,
    algorithm: generation.metadata.algorithm,
    topologyStyle: plan?.topology?.style,
    spatialLayoutStyle: plan?.spatialLayout?.style,
    elapsedMs,
    rasterizationMs,
    fallbackReason,
    dungeon: generation.dungeon,
    plan,
    metadata: generation.metadata,
    metrics: collectMetrics(generation.dungeon, plan),
    audit,
  };
}

export function createCustomBenchmarkBaselines(options: {
  profile: DungeonConcept;
  firstSeed: number;
  seedCount: number;
  width: number;
  height: number;
  roomCount: number;
  corridorWidth: number;
}): DungeonGenerationBaseline[] {
  if (!Number.isSafeInteger(options.firstSeed) || options.firstSeed < 0) {
    throw new RangeError("Benchmark seeds must be non-negative safe integers.");
  }
  if (!Number.isSafeInteger(options.seedCount) || options.seedCount < 1 || options.seedCount > 24) {
    throw new RangeError("Benchmark seed count must be between 1 and 24.");
  }
  if (options.firstSeed > MAX_DUNGEON_SEED - options.seedCount + 1) {
    throw new RangeError(`Benchmark seeds must not exceed ${MAX_DUNGEON_SEED}.`);
  }
  assertSupportedDungeonDimensions(options.width, options.height);
  if (!Number.isSafeInteger(options.roomCount) || options.roomCount < 1 || options.roomCount > 24) {
    throw new RangeError("Benchmark room count must be between 1 and 24.");
  }
  if (!Number.isSafeInteger(options.corridorWidth) || options.corridorWidth < 1 || options.corridorWidth > 3) {
    throw new RangeError("Benchmark corridor width must be between 1 and 3.");
  }
  const profile = DUNGEON_CONCEPTS[options.profile];
  return Array.from({ length: options.seedCount }, (_, index) => ({
    id: `custom-${options.profile}-${options.firstSeed + index}`,
    scale: options.width >= 120 ? "large" : options.width >= 64 ? "medium" : "small",
    profile: options.profile,
    algorithm: profile.algorithm,
    seed: options.firstSeed + index,
    parameters: {
      width: options.width,
      height: options.height,
      roomCount: options.roomCount,
    },
    expectedRoomCount: 0,
    expectedFingerprint: "",
  }));
}

export function runGenerationBenchmark(
  options: GenerationBenchmarkOptions = {},
): GenerationBenchmarkRun[] {
  const baselines = options.baselines ?? DUNGEON_GENERATION_V1_BASELINES;
  const versions = options.versions ?? [
    DUNGEON_GENERATOR_VERSION_V1,
    DUNGEON_GENERATOR_VERSION_V2,
  ];
  return baselines.flatMap((baseline) => (
    versions.map((version) => generateBaselineRun(baseline, version, options))
  ));
}

function tileColor(tile: number): string {
  if (tile === FLOOR_TILE) return "#ded2bc";
  if (tile === CORRIDOR_TILE) return "#a9824d";
  if (tile === DOOR_TILE) return "#e7b66c";
  if (tile === SECRET_DOOR_TILE) return "#b59aff";
  if (tile === PILLAR_TILE) return "#768092";
  if (tile === 10 || tile === 53 || tile === 55) return "#4d9dcb";
  if (tile === 11 || tile === 54 || tile === 56 || tile === 58) return "#e16b43";
  if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE || tile === ROOM_STAIRS_TILE) return "#74c7a6";
  if (tile === EXTERIOR_ENTRANCE_TILE || tile === EXTERIOR_CONNECTION_TILE) return "#e8d178";
  if (tile === 0 || tile === CAVE_CONNECTION_WALL_TILE) return "#15191f";
  return tile === 1 ? "#ded2bc" : "#c86b61";
}

export function renderDungeonBenchmarkSvg(dungeon: Dungeon, label: string): string {
  const cells: string[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = dungeon.tiles[y][x];
      if (tile === WALL_TILE || tile === CAVE_CONNECTION_WALL_TILE) continue;
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${tileColor(tile)}"/>`);
    }
  }
  const escapedLabel = label.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dungeon.width} ${dungeon.height}" role="img" aria-label="${escapedLabel}"><rect width="${dungeon.width}" height="${dungeon.height}" fill="#15191f"/>${cells.join("")}</svg>`;
}

function formatMetric(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function createGenerationBenchmarkGalleryHtml(runs: readonly GenerationBenchmarkRun[]): string {
  const rows = runs.map((run) => {
    const metrics = run.metrics;
    const map = run.dungeon
      ? renderDungeonBenchmarkSvg(run.dungeon, `${run.profile}, seed ${run.seed}, ${run.requestedVersion}`)
      : "";
    const fallback = run.fallbackReason
      ? `<p class="notice">${escapeHtml(run.fallbackReason)}</p>`
      : run.unsupportedReason
        ? `<p class="notice">${escapeHtml(run.unsupportedReason)}</p>`
        : "";
    const status = run.unsupportedReason
      ? "Indisponível"
      : run.fallbackReason
        ? `${run.requestedVersion.toUpperCase()} → ${run.effectiveVersion?.toUpperCase()}`
        : run.effectiveVersion?.toUpperCase() ?? "—";
    return `<article class="card"><header><strong>${escapeHtml(run.baselineId)}</strong><span>${status}</span></header>${map}<dl><dt>Seed / perfil</dt><dd>${run.seed} / ${escapeHtml(run.profile)}</dd><dt>Salas / conexões</dt><dd>${metrics?.roomCount ?? "—"} / ${metrics?.connectionCount ?? "—"}</dd><dt>Ramos / ciclos / folhas</dt><dd>${metrics?.branchCount ?? "—"} / ${metrics?.cycleCount ?? "—"} / ${metrics?.deadEndCount ?? "—"}</dd><dt>Corredor médio</dt><dd>${formatMetric(metrics?.averageCorridorLength)}</dd><dt>Isoladas / área ocupada</dt><dd>${metrics?.isolatedRoomCount ?? "—"} / ${metrics ? `${formatMetric(metrics.occupiedAreaPercent)}%` : "—"}</dd><dt>Compactação / distância NN</dt><dd>${formatMetric(metrics?.compactness, 2)} / ${formatMetric(metrics?.averageNearestRoomDistance)}</dd><dt>Geração</dt><dd>${formatMetric(run.elapsedMs, 2)} ms</dd><dt>Rasterização V2</dt><dd>${formatMetric(run.rasterizationMs, 2)} ms</dd></dl>${fallback}</article>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Benchmark de geração procedural</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#11151b;color:#e8e1d5;font:14px/1.5 system-ui,sans-serif}h1{font-size:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{padding:14px;border:1px solid #39414d;border-radius:10px;background:#1a2029}.card header{display:flex;justify-content:space-between;gap:8px;margin-bottom:12px}.card svg{display:block;width:100%;max-height:300px;image-rendering:pixelated;background:#15191f}.card dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px}.card dt{color:#aaa}.card dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.notice{color:#e7b66c;font-size:12px}</style><h1>Benchmark de geração procedural</h1><p>${runs.length} resultados; as métricas topológicas são indisponíveis para o grafo legado V1.</p><main class="grid">${rows}</main></html>`;
}
