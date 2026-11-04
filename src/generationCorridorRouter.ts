import {
  createGenerationRandomStreams,
  isSupportedDungeonDimensions,
} from "./dungeon";
import type {
  ConnectionEdge,
  ConnectionEndpointGeometry,
  CorridorRouteStyle,
  GenerationPlan,
  GridPosition,
  PlanIntersection,
  PlanTransition,
  RoomNode,
} from "./generationPlan";
import { createStableGenerationId } from "./generationPlan";
import {
  CORRIDOR_DIRECTIONS,
  getCorridorCrossSection,
  getCorridorPathBrush,
} from "./generationCorridorGeometry";
import { validateGenerationPlan } from "./generationPlanValidation";
import { validateDungeonTopology } from "./generationTopology";

export interface CorridorRoutingCosts {
  movement: number;
  excavateWall: number;
  turn: number;
  reuseCorridor: number;
  cycleJunction: number;
  sinuousVariation: number;
}

export interface CorridorRoutingOptions {
  costs?: Partial<CorridorRoutingCosts>;
  /** Maximum A* states expanded per connection across bounds and width attempts. */
  maxExpandedStates?: number;
  prioritizedConnectionIds?: readonly string[];
}

export type CorridorRoutingErrorCode =
  | "invalid-plan"
  | "unsupported-multilevel"
  | "no-route"
  | "search-limit";

export class CorridorRoutingError extends Error {
  readonly code: CorridorRoutingErrorCode;
  readonly connectionId?: string;
  readonly details: readonly string[];

  constructor(
    code: CorridorRoutingErrorCode,
    message: string,
    connectionId?: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = "CorridorRoutingError";
    this.code = code;
    this.connectionId = connectionId;
    this.details = details;
  }
}

export const DEFAULT_CORRIDOR_ROUTING_COSTS: Readonly<CorridorRoutingCosts> = {
  movement: 1,
  excavateWall: 1.5,
  turn: 2,
  reuseCorridor: 0.2,
  cycleJunction: 4,
  sinuousVariation: 0.16,
};

interface RoomExitCandidate {
  position: GridPosition;
  roomPosition: GridPosition;
  orientation: ConnectionEndpointGeometry["orientation"];
  direction: number;
  openingPositions: GridPosition[];
  wallPositions: GridPosition[];
  preference: number;
}

interface RoutedConnection {
  edge: ConnectionEdge;
  routeStyle: CorridorRouteStyle;
  endpointWidth: number;
  sourceExit: RoomExitCandidate;
  targetExit: RoomExitCandidate;
  path: GridPosition[];
}

interface SearchEntry {
  state: number;
  cost: number;
  priority: number;
  sequence: number;
}

interface RouteSearchResult {
  route?: {
    path: GridPosition[];
    sourceExit: RoomExitCandidate;
    targetExit: RoomExitCandidate;
  };
  reachedLimit: boolean;
  expandedStates: number;
  diagnostics?: readonly string[];
}

interface RouterSearchWorkspace {
  bestCost: Float64Array;
  previous: Int32Array;
  status: Uint32Array;
  heuristicDistance: Uint32Array;
  heuristicGeneration: Uint32Array;
  generation: number;
}

interface RouteSearchBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface BrushCheck {
  valid: boolean;
  owners: Set<string>;
}

interface RouterContext {
  plan: GenerationPlan;
  roomAt: Int32Array;
  obstacles: Uint8Array;
  corridorOwners: Map<number, Set<string>>;
  centerlineOwners: Map<number, Set<string>>;
  edgeById: ReadonlyMap<string, ConnectionEdge>;
  cycleConnectionIds: ReadonlySet<string>;
  searchWorkspace: RouterSearchWorkspace;
}

const ROUTE_ORIENTATIONS: readonly ConnectionEndpointGeometry["orientation"][] = [
  "north",
  "east",
  "south",
  "west",
];
const MAX_CORRIDOR_WIDTH = 3;
export const MAX_CORRIDOR_ROUTE_EXPANDED_STATES = 100_000;
const MAX_CORRIDOR_ROUTE_RETRY_EXPANDED_STATES = 250_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positionKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

function positionIndex(position: GridPosition, width: number): number {
  return position.y * width + position.x;
}

function positionFromIndex(index: number, width: number): GridPosition {
  return { x: index % width, y: Math.floor(index / width) };
}

function getRoomCenter(room: RoomNode): GridPosition {
  return {
    x: room.position.x + room.width / 2,
    y: room.position.y + room.height / 2,
  };
}

function getRoomAt(plan: GenerationPlan): Int32Array {
  const roomAt = new Int32Array(plan.width * plan.height).fill(-1);
  for (const [roomIndex, room] of plan.rooms.entries()) {
    for (const cell of room.footprint) {
      const position = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      roomAt[positionIndex(position, plan.width)] = roomIndex;
    }
  }
  return roomAt;
}

function getObstacles(plan: GenerationPlan, roomAt: Int32Array): Uint8Array {
  const obstacles = new Uint8Array(plan.width * plan.height);
  for (const feature of plan.features) {
    const index = positionIndex(feature.position, plan.width);
    if (roomAt[index] < 0) obstacles[index] = 1;
  }
  for (const transition of plan.transitions) {
    if (transition.type === "doorway" || transition.type === "secret-door") continue;
    const index = positionIndex(transition.position, plan.width);
    if (roomAt[index] < 0) obstacles[index] = 1;
  }
  return obstacles;
}

function assertPlanCanBeRouted(plan: GenerationPlan): void {
  if (!isSupportedDungeonDimensions(plan.width, plan.height)) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "The GenerationPlan dimensions exceed the supported per-axis or total-tile limits.",
    );
  }
  if (plan.topology?.geometryStatus !== "unrouted") {
    throw new CorridorRoutingError(
      "invalid-plan",
      "Corridors can only be routed after spatial layout and before any connection paths are routed.",
    );
  }
  if (plan.rooms.length > plan.generation.parameters.roomCount) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "The GenerationPlan contains more rooms than its configured room count.",
    );
  }
  const structuralValidation = validateGenerationPlan(plan);
  if (!structuralValidation.valid) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "The GenerationPlan must be structurally valid before corridor routing.",
      undefined,
      structuralValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    );
  }
  const topologyValidation = validateDungeonTopology(plan);
  if (!topologyValidation.valid) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "The GenerationPlan topology must be valid before corridor routing.",
      undefined,
      topologyValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    );
  }
  const verticalConnection = plan.connections.find((edge) => (
    edge.connectionType === "vertical"
    || plan.rooms.find((room) => room.id === edge.sourceRoomId)?.floorId
      !== plan.rooms.find((room) => room.id === edge.targetRoomId)?.floorId
  ));
  if (verticalConnection) {
    throw new CorridorRoutingError(
      "unsupported-multilevel",
      "Vertical connections and multiple floors are outside this routing phase.",
      verticalConnection.id,
    );
  }
}

function validateOptions(
  plan: GenerationPlan,
  options: CorridorRoutingOptions,
): { costs: CorridorRoutingCosts; maxExpandedStates: number } {
  const costs = { ...DEFAULT_CORRIDOR_ROUTING_COSTS, ...options.costs };
  for (const [name, value] of Object.entries(costs)) {
    if (!Number.isFinite(value) || value < 0 || (name === "movement" && value === 0)) {
      throw new RangeError(`${name} routing cost must be a non-negative finite number and movement must be positive.`);
    }
  }
  const maximumStateCount = plan.width * plan.height * CORRIDOR_DIRECTIONS.length;
  const maxExpandedStates = options.maxExpandedStates
    ?? Math.min(maximumStateCount, MAX_CORRIDOR_ROUTE_EXPANDED_STATES);
  if (
    !Number.isSafeInteger(maxExpandedStates)
    || maxExpandedStates < 1
    || maxExpandedStates > MAX_CORRIDOR_ROUTE_EXPANDED_STATES
  ) {
    throw new RangeError(
      `maxExpandedStates must be a positive safe integer no greater than ${MAX_CORRIDOR_ROUTE_EXPANDED_STATES}.`,
    );
  }
  return { costs, maxExpandedStates: Math.min(maxExpandedStates, maximumStateCount) };
}

function getConnectionWidth(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  routeStyle: CorridorRouteStyle,
): number {
  const globalWidth = clamp(
    Math.round(plan.generation.parameters.corridorWidth),
    1,
    MAX_CORRIDOR_WIDTH,
  );
  if (edge.metadata.widthIsFixed || edge.width > 1) {
    if (edge.width > MAX_CORRIDOR_WIDTH) {
      throw new CorridorRoutingError(
        "invalid-plan",
        `Connection ${edge.id} requests a corridor wider than the supported ${MAX_CORRIDOR_WIDTH} tiles.`,
        edge.id,
      );
    }
    return edge.width;
  }
  const source = plan.rooms.find((room) => room.id === edge.sourceRoomId)!;
  const target = plan.rooms.find((room) => room.id === edge.targetRoomId)!;
  const isSecret = edge.isSecret || edge.connectionType === "secret-door";
  const isNarrow = isSecret || edge.isOptional;
  const isImportant = edge.isMainPath
    || source.roomRole === "objective"
    || source.roomRole === "boss"
    || target.roomRole === "objective"
    || target.roomRole === "boss";
  const linksSectors = Boolean(source.sectorId && target.sectorId && source.sectorId !== target.sectorId);
  let width = globalWidth;
  if (isNarrow) width = Math.max(1, globalWidth - 1);
  else if (isImportant || linksSectors) width = Math.min(MAX_CORRIDOR_WIDTH, globalWidth + 1);
  if (routeStyle === "transition") width = Math.min(MAX_CORRIDOR_WIDTH, width + 1);
  return width;
}

function chooseRouteStyle(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  random: () => number,
): CorridorRouteStyle {
  if (edge.metadata.routeStyle) return edge.metadata.routeStyle;
  const source = plan.rooms.find((room) => room.id === edge.sourceRoomId)!;
  const target = plan.rooms.find((room) => room.id === edge.targetRoomId)!;
  const profile = plan.topology?.profile;
  const secret = edge.isSecret || edge.connectionType === "secret-door";
  const linksSectors = Boolean(source.sectorId && target.sectorId && source.sectorId !== target.sectorId);
  if (secret) return "sinuous";
  if (linksSectors && !edge.isMainPath) return "transition";
  if (profile === "natural-cavern" || profile === "abandoned-mine") return "sinuous";
  if (profile === "military-fortress" || profile === "prison") return "angular";
  if (profile === "ancient-temple") return edge.isMainPath ? "straight" : "transition";
  if (profile === "arcane-laboratory") return edge.isMainPath ? "angular" : "sinuous";
  if (profile === "catacombs") return edge.isMainPath ? "angular" : "sinuous";
  if (profile === "lost-civilization") return edge.isMainPath ? "straight" : "angular";
  if (edge.isOptional) return random() < 0.75 ? "sinuous" : "angular";
  switch (plan.topology?.style) {
    case "circuit":
      return edge.isMainPath ? "straight" : random() < 0.5 ? "angular" : "sinuous";
    case "centralized":
      return edge.isMainPath ? "straight" : random() < 0.2 ? "sinuous" : "angular";
    case "sectorized":
      return edge.isMainPath ? "angular" : "transition";
    case "hybrid":
      return random() < 0.5 ? "angular" : "sinuous";
    case "branching":
      return edge.isMainPath ? "straight" : random() < 0.55 ? "angular" : "sinuous";
    default:
      return edge.isMainPath ? "straight" : "angular";
  }
}

function getEndpointPreference(
  position: GridPosition,
  orientation: number,
  room: RoomNode,
  target: RoomNode,
): number {
  const sourceCenter = getRoomCenter(room);
  const targetCenter = getRoomCenter(target);
  const targetDelta = {
    x: targetCenter.x - sourceCenter.x,
    y: targetCenter.y - sourceCenter.y,
  };
  const length = Math.max(1, Math.hypot(targetDelta.x, targetDelta.y));
  const direction = CORRIDOR_DIRECTIONS[orientation];
  const alignment = (direction.dx * targetDelta.x + direction.dy * targetDelta.y) / length;
  return (
    Math.abs(position.x - targetCenter.x)
    + Math.abs(position.y - targetCenter.y)
    + (1 - alignment) * 2
  );
}

function getRoomExits(
  plan: GenerationPlan,
  room: RoomNode,
  targetRoom: RoomNode,
  width: number,
  roomAt: Int32Array,
  obstacles: Uint8Array,
): RoomExitCandidate[] {
  const boundaryLines = new Map<string, Map<number, { outside: GridPosition; inside: GridPosition }>>();
  for (const cell of room.footprint) {
    const inside = {
      x: room.position.x + cell.x,
      y: room.position.y + cell.y,
    };
    for (let directionIndex = 0; directionIndex < CORRIDOR_DIRECTIONS.length; directionIndex += 1) {
      const direction = CORRIDOR_DIRECTIONS[directionIndex];
      const outside = { x: inside.x + direction.dx, y: inside.y + direction.dy };
      if (
        outside.x <= 0
        || outside.y <= 0
        || outside.x >= plan.width - 1
        || outside.y >= plan.height - 1
      ) continue;
      const index = positionIndex(outside, plan.width);
      if (roomAt[index] !== -1 || obstacles[index]) continue;
      const line = direction.dx === 0 ? outside.y : outside.x;
      const offset = direction.dx === 0 ? outside.x : outside.y;
      const lineKey = `${directionIndex}:${line}`;
      const positions = boundaryLines.get(lineKey) ?? new Map<number, { outside: GridPosition; inside: GridPosition }>();
      positions.set(offset, { outside, inside });
      boundaryLines.set(lineKey, positions);
    }
  }

  const exits: RoomExitCandidate[] = [];
  for (const [lineKey, positions] of boundaryLines) {
    const directionIndex = Number(lineKey.split(":")[0]);
    const direction = CORRIDOR_DIRECTIONS[directionIndex];
    const offsets = [...positions.keys()].sort((first, second) => first - second);
    let run: number[] = [];
    const addRunWindows = (): void => {
      for (let start = 0; start + width <= run.length; start += 1) {
        const segment = run.slice(start, start + width).map((offset) => positions.get(offset)!);
        const centerIndex = Math.floor((width - 1) / 2);
        const center = segment[centerIndex];
        const openingPositions = segment.map((cell) => cell.outside);
        const wallPositions = segment.map((cell) => cell.inside);
        const crossSection = getCorridorCrossSection(center.outside, direction, width);
        const expected = new Set(openingPositions.map(positionKey));
        if (
          crossSection.length !== expected.size
          || crossSection.some((position) => !expected.has(positionKey(position)))
        ) {
          continue;
        }
        if (openingPositions.some((position) => (
          obstacles[positionIndex(position, plan.width)]
          || roomAt[positionIndex(position, plan.width)] !== -1
        ))) continue;
        exits.push({
          position: center.outside,
          roomPosition: center.inside,
          orientation: ROUTE_ORIENTATIONS[directionIndex],
          direction: directionIndex,
          openingPositions,
          wallPositions,
          preference: getEndpointPreference(center.outside, directionIndex, room, targetRoom),
        });
      }
    };
    for (const offset of offsets) {
      if (run.length > 0 && offset !== run[run.length - 1] + 1) {
        addRunWindows();
        run = [];
      }
      run.push(offset);
    }
    addRunWindows();
  }
  return exits.sort((first, second) => (
    first.preference - second.preference
    || first.direction - second.direction
    || first.position.y - second.position.y
    || first.position.x - second.position.x
  ));
}

function getAllEdgesShareRoom(edge: ConnectionEdge, otherEdge: ConnectionEdge): boolean {
  return (
    edge.sourceRoomId === otherEdge.sourceRoomId
    || edge.sourceRoomId === otherEdge.targetRoomId
    || edge.targetRoomId === otherEdge.sourceRoomId
    || edge.targetRoomId === otherEdge.targetRoomId
  );
}

function isAllowedCorridorContact(
  edge: ConnectionEdge,
  ownerId: string,
  edgeById: ReadonlyMap<string, ConnectionEdge>,
  cycleConnectionIds: ReadonlySet<string>,
): boolean {
  const otherEdge = edgeById.get(ownerId);
  return Boolean(
    otherEdge
    && (getAllEdgesShareRoom(edge, otherEdge) || cycleConnectionIds.has(edge.id)),
  );
}

function inspectBrush(
  position: GridPosition,
  directionIndex: number,
  width: number,
  edge: ConnectionEdge,
  context: RouterContext,
): BrushCheck {
  const brushPositions = CORRIDOR_DIRECTIONS[directionIndex]
    ? getCrossSection(position, directionIndex, width)
    : [];
  const owners = new Set<string>();
  for (const brushPosition of brushPositions) {
    if (
      brushPosition.x <= 0
      || brushPosition.y <= 0
      || brushPosition.x >= context.plan.width - 1
      || brushPosition.y >= context.plan.height - 1
    ) return { valid: false, owners };
    const index = positionIndex(brushPosition, context.plan.width);
    if (context.roomAt[index] !== -1 || context.obstacles[index]) {
      return { valid: false, owners };
    }
    for (const ownerId of context.corridorOwners.get(index) ?? []) {
      if (ownerId === edge.id) continue;
      if (!isAllowedCorridorContact(edge, ownerId, context.edgeById, context.cycleConnectionIds)) {
        return { valid: false, owners };
      }
      owners.add(ownerId);
    }
    for (const direction of CORRIDOR_DIRECTIONS) {
      const adjacent = { x: brushPosition.x + direction.dx, y: brushPosition.y + direction.dy };
      const adjacentIndex = positionIndex(adjacent, context.plan.width);
      for (const ownerId of context.corridorOwners.get(adjacentIndex) ?? []) {
        if (ownerId === edge.id) continue;
        if (!isAllowedCorridorContact(edge, ownerId, context.edgeById, context.cycleConnectionIds)) {
          return { valid: false, owners };
        }
        owners.add(ownerId);
      }
    }
  }
  return { valid: true, owners };
}

function getCrossSection(position: GridPosition, directionIndex: number, width: number): GridPosition[] {
  const direction = CORRIDOR_DIRECTIONS[directionIndex];
  const tangentX = direction.dy === 0 ? 0 : 1;
  const tangentY = direction.dx === 0 ? 0 : 1;
  const halfWidth = Math.floor((width - 1) / 2);
  return Array.from({ length: width }, (_, index) => {
    const shift = index - halfWidth;
    return {
      x: position.x + tangentX * shift,
      y: position.y + tangentY * shift,
    };
  });
}

function getDistanceToTargetExits(
  position: GridPosition,
  exits: readonly RoomExitCandidate[],
): number {
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const exit of exits) {
    minimumDistance = Math.min(
      minimumDistance,
      Math.abs(position.x - exit.position.x) + Math.abs(position.y - exit.position.y),
    );
  }
  return minimumDistance;
}

function getRouteSearchBounds(
  plan: GenerationPlan,
  sourceExits: readonly RoomExitCandidate[],
  targetExits: readonly RoomExitCandidate[],
  margin: number,
): RouteSearchBounds {
  let minX = plan.width - 2;
  let minY = plan.height - 2;
  let maxX = 1;
  let maxY = 1;
  for (const exit of [...sourceExits, ...targetExits]) {
    minX = Math.min(minX, exit.position.x);
    minY = Math.min(minY, exit.position.y);
    maxX = Math.max(maxX, exit.position.x);
    maxY = Math.max(maxY, exit.position.y);
  }
  return {
    minX: Math.max(1, minX - margin),
    minY: Math.max(1, minY - margin),
    maxX: Math.min(plan.width - 2, maxX + margin),
    maxY: Math.min(plan.height - 2, maxY + margin),
  };
}

function compareSearchEntries(first: SearchEntry, second: SearchEntry): number {
  return first.priority - second.priority
    || first.cost - second.cost
    || first.sequence - second.sequence;
}

class MinHeap {
  private readonly values: SearchEntry[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: SearchEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareSearchEntries(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): SearchEntry | undefined {
    if (this.values.length === 0) return undefined;
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.values.length
        && compareSearchEntries(this.values[child + 1], this.values[child]) < 0
      ) child += 1;
      if (compareSearchEntries(last, this.values[child]) <= 0) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function getTurnCost(style: CorridorRouteStyle, costs: CorridorRoutingCosts): number {
  const multiplier: Record<CorridorRouteStyle, number> = {
    straight: 2.2,
    angular: 0.9,
    sinuous: 0.35,
    transition: 0.8,
  };
  return costs.turn * multiplier[style];
}

function getSinuousBias(
  position: GridPosition,
  source: RoomNode,
  target: RoomNode,
  style: CorridorRouteStyle,
  seed: number,
  costs: CorridorRoutingCosts,
): number {
  if (style !== "sinuous") return 0;
  const sourceCenter = getRoomCenter(source);
  const targetCenter = getRoomCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  const progress = clamp(
    ((position.x - sourceCenter.x) * dx + (position.y - sourceCenter.y) * dy) / lengthSquared,
    0,
    1,
  );
  const lateral = ((position.x - sourceCenter.x) * -dy + (position.y - sourceCenter.y) * dx)
    / Math.sqrt(lengthSquared);
  let routeHash = seed | 0;
  for (const character of `${source.id}|${target.id}`) {
    routeHash = Math.imul(routeHash ^ character.charCodeAt(0), 16777619);
  }
  const sign = (routeHash >>> 31) === 0 ? -1 : 1;
  const amplitude = Math.min(4, Math.max(1.5, Math.sqrt(lengthSquared) * 0.08));
  const desiredLateral = Math.sin(progress * Math.PI) * amplitude * sign;
  return Math.abs(lateral - desiredLateral) * costs.sinuousVariation;
}

function reconstructPath(
  state: number,
  previous: Int32Array,
  width: number,
): { path: GridPosition[]; sourceExitIndex: number } {
  const path: GridPosition[] = [];
  let current = state;
  let sourceExitIndex = -1;
  while (true) {
    path.push(positionFromIndex(Math.floor(current / CORRIDOR_DIRECTIONS.length), width));
    const parent = previous[current];
    if (parent <= -2) {
      sourceExitIndex = -parent - 2;
      break;
    }
    if (parent < 0) {
      throw new Error("A corridor route state is missing its predecessor.");
    }
    current = parent;
  }
  return { path: path.reverse(), sourceExitIndex };
}

function searchRoute(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  routeStyle: CorridorRouteStyle,
  width: number,
  sourceRoom: RoomNode,
  targetRoom: RoomNode,
  sourceExits: readonly RoomExitCandidate[],
  targetExits: readonly RoomExitCandidate[],
  context: RouterContext,
  bounds: RouteSearchBounds,
  costs: CorridorRoutingCosts,
  maxExpandedStates: number,
): RouteSearchResult {
  if (sourceExits.length === 0 || targetExits.length === 0) {
    return { reachedLimit: false, expandedStates: 0 };
  }
  const workspace = context.searchWorkspace;
  const { bestCost, previous, status } = workspace;
  if (workspace.generation >= 0x7fffffff) {
    status.fill(0);
    workspace.heuristicGeneration.fill(0);
    workspace.generation = 1;
  } else {
    workspace.generation += 1;
  }
  const searchGeneration = workspace.generation;
  const getCachedHeuristicDistance = (position: GridPosition): number => {
    const cellIndex = positionIndex(position, plan.width);
    if (workspace.heuristicGeneration[cellIndex] !== searchGeneration) {
      workspace.heuristicGeneration[cellIndex] = searchGeneration;
      workspace.heuristicDistance[cellIndex] = getDistanceToTargetExits(position, targetExits);
    }
    return workspace.heuristicDistance[cellIndex];
  };
  const openStatus = workspace.generation * 2;
  const closedStatus = openStatus + 1;
  const targetExitByState = new Map<number, number>();
  const open = new MinHeap();
  let sequence = 0;
  const minimumStepCost = costs.movement + (
    context.corridorOwners.size === 0
      ? costs.excavateWall
      : Math.min(costs.excavateWall, costs.reuseCorridor)
  );

for (const [exitIndex, exit] of sourceExits.entries()) {
    const stamp = inspectBrush(exit.position, exit.direction, width, edge, context);
    if (!stamp.valid) continue;
    const cellIndex = positionIndex(exit.position, plan.width);
    const state = cellIndex * CORRIDOR_DIRECTIONS.length + exit.direction;
    const routeCost = exit.preference * 0.04
      + costs.movement
      + (stamp.owners.size > 0 ? costs.reuseCorridor : costs.excavateWall);
    if (
      status[state] === closedStatus
      || routeCost >= (status[state] === openStatus ? bestCost[state] : Number.POSITIVE_INFINITY)
    ) {
      continue;
    }
    status[state] = openStatus;
    bestCost[state] = routeCost;
    previous[state] = -2 - exitIndex;
    const heuristicDistance = getCachedHeuristicDistance(exit.position);
    open.push({
      state,
      cost: routeCost,
      priority: routeCost + heuristicDistance * minimumStepCost,
      sequence,
    });
    sequence += 1;
  }

  for (const [exitIndex, exit] of targetExits.entries()) {
    const approachDirection = (exit.direction + 2) % CORRIDOR_DIRECTIONS.length;
    const cellIndex = positionIndex(exit.position, plan.width);
    const state = cellIndex * CORRIDOR_DIRECTIONS.length + approachDirection;
    const currentExit = targetExitByState.get(state);
    if (currentExit === undefined || exit.preference < targetExits[currentExit].preference) {
      targetExitByState.set(state, exitIndex);
    }
  }

  let expandedStates = 0;
  while (open.size > 0) {
    const entry = open.pop()!;
    if (status[entry.state] !== openStatus || entry.cost > bestCost[entry.state] + 1e-9) continue;
    if (expandedStates >= maxExpandedStates) {
      return {
        reachedLimit: true,
        expandedStates,
        diagnostics: [
          `A* expanded ${expandedStates} states inside ${bounds.minX},${bounds.minY}–${bounds.maxX},${bounds.maxY}.`,
        ],
      };
    }
    status[entry.state] = closedStatus;
    expandedStates += 1;
    const targetExitIndex = targetExitByState.get(entry.state);
    if (targetExitIndex !== undefined) {
      const reconstructed = reconstructPath(entry.state, previous, plan.width);
      const sourceExit = sourceExits[reconstructed.sourceExitIndex];
      if (!sourceExit) throw new Error("A corridor route resolved to an unknown source exit.");
      return {
        route: {
          path: reconstructed.path,
          sourceExit,
          targetExit: targetExits[targetExitIndex],
        },
        reachedLimit: false,
        expandedStates,
      };
    }

    const cellIndex = Math.floor(entry.state / CORRIDOR_DIRECTIONS.length);
    const current = positionFromIndex(cellIndex, plan.width);
    const incomingDirection = entry.state % CORRIDOR_DIRECTIONS.length;
    for (let directionIndex = 0; directionIndex < CORRIDOR_DIRECTIONS.length; directionIndex += 1) {
      if (previous[entry.state] <= -2 && directionIndex !== incomingDirection) continue;
      if ((directionIndex + 2) % CORRIDOR_DIRECTIONS.length === incomingDirection) continue;
      const direction = CORRIDOR_DIRECTIONS[directionIndex];
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      if (
        next.x < bounds.minX
        || next.y < bounds.minY
        || next.x > bounds.maxX
        || next.y > bounds.maxY
      ) continue;

      const turn = directionIndex !== incomingDirection;
      if (turn && !inspectBrush(current, directionIndex, width, edge, context).valid) continue;
      const nextStamp = inspectBrush(next, directionIndex, width, edge, context);
      if (!nextStamp.valid) continue;
      const nextCellIndex = positionIndex(next, plan.width);
      const nextState = nextCellIndex * CORRIDOR_DIRECTIONS.length + directionIndex;
      if (status[nextState] === closedStatus) continue;
      const existingPenalty = nextStamp.owners.size === 0
        ? costs.excavateWall
        : costs.reuseCorridor + (
          [...nextStamp.owners].some((ownerId) => (
            !getAllEdgesShareRoom(edge, context.edgeById.get(ownerId)!)
          ))
            ? costs.cycleJunction
            : 0
        );
      const turnPenalty = turn ? getTurnCost(routeStyle, costs) : 0;
      const bias = getSinuousBias(next, sourceRoom, targetRoom, routeStyle, plan.generation.seed, costs);
      const targetExitIndexForNext = targetExitByState.get(nextState);
      const destinationPreference = targetExitIndexForNext === undefined
        ? 0
        : targetExits[targetExitIndexForNext].preference * 0.04;
      const nextCost = entry.cost
        + costs.movement
        + existingPenalty
        + turnPenalty
        + bias
        + destinationPreference;
      if (
        status[nextState] === openStatus
        && nextCost >= bestCost[nextState]
      ) continue;
      status[nextState] = openStatus;
      bestCost[nextState] = nextCost;
      previous[nextState] = entry.state;
      const heuristicDistance = getCachedHeuristicDistance(next);
      open.push({
        state: nextState,
        cost: nextCost,
        priority: nextCost + heuristicDistance * minimumStepCost,
        sequence,
      });
      sequence += 1;
    }
  }
return {
  reachedLimit: false,
  expandedStates,
  diagnostics: [
    `A* exhausted ${expandedStates} states inside ${bounds.minX},${bounds.minY}–${bounds.maxX},${bounds.maxY}.`,
  ],
};
}

function searchRouteWithExpandingBounds(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  routeStyle: CorridorRouteStyle,
  width: number,
  sourceRoom: RoomNode,
  targetRoom: RoomNode,
  sourceExits: readonly RoomExitCandidate[],
  targetExits: readonly RoomExitCandidate[],
  context: RouterContext,
  costs: CorridorRoutingCosts,
  maxExpandedStates: number,
): RouteSearchResult {
  if (sourceExits.length === 0 || targetExits.length === 0) {
    return { reachedLimit: false, expandedStates: 0 };
  }
  // Retry with progressively wider bounds so local routes avoid scanning distant empty tiles.
  let margin = 12;
  let expandedStates = 0;
  const diagnostics: string[] = [];
  while (true) {
    const bounds = getRouteSearchBounds(plan, sourceExits, targetExits, margin);
    const remainingStateBudget = maxExpandedStates - expandedStates;
    if (remainingStateBudget <= 0) {
      return {
        reachedLimit: true,
        expandedStates,
        diagnostics: [
          ...diagnostics,
          `A* reached its ${maxExpandedStates}-state connection budget across expanding bounds.`,
        ],
      };
    }
    const result = searchRoute(
      plan,
      edge,
      routeStyle,
      width,
      sourceRoom,
      targetRoom,
      sourceExits,
      targetExits,
      context,
      bounds,
      costs,
      remainingStateBudget,
    );
    expandedStates += result.expandedStates;
    diagnostics.push(...(result.diagnostics ?? []));
    if (
      result.route
      || result.reachedLimit
      || (
        bounds.minX === 1
        && bounds.minY === 1
        && bounds.maxX === plan.width - 2
        && bounds.maxY === plan.height - 2
      )
    ) return { ...result, expandedStates, diagnostics };
    margin = Math.min(Math.max(plan.width, plan.height), margin * 2);
  }
}

function resolveConnectionOrder(
  plan: GenerationPlan,
  prioritizedConnectionIds: readonly string[] = [],
): ConnectionEdge[] {
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const priorityById = new Map(prioritizedConnectionIds.map((id, index) => [id, index]));
  return [...plan.connections].sort((first, second) => {
    const firstPriority = priorityById.get(first.id) ?? Number.POSITIVE_INFINITY;
    const secondPriority = priorityById.get(second.id) ?? Number.POSITIVE_INFINITY;
    if (firstPriority !== secondPriority) return firstPriority - secondPriority;
    const firstSource = roomsById.get(first.sourceRoomId);
    const firstTarget = roomsById.get(first.targetRoomId);
    const secondSource = roomsById.get(second.sourceRoomId);
    const secondTarget = roomsById.get(second.targetRoomId);
    const firstImportance = Math.max(firstSource?.importance ?? 0, firstTarget?.importance ?? 0);
    const secondImportance = Math.max(secondSource?.importance ?? 0, secondTarget?.importance ?? 0);
    return (
      Number(second.isMainPath) - Number(first.isMainPath)
      || Number(first.isOptional) - Number(second.isOptional)
      || secondImportance - firstImportance
      || first.id.localeCompare(second.id)
    );
  });
}

function buildEndpointGeometry(
  room: RoomNode,
  exit: RoomExitCandidate,
  width: number,
): ConnectionEndpointGeometry {
  return {
    roomId: room.id,
    position: exit.position,
    roomPosition: exit.roomPosition,
    orientation: exit.orientation,
    width,
    openingPositions: exit.openingPositions,
    wallPositions: exit.wallPositions,
  };
}

function addOwner(map: Map<number, Set<string>>, index: number, edgeId: string): void {
  const owners = map.get(index) ?? new Set<string>();
  owners.add(edgeId);
  map.set(index, owners);
}

function getContactIntersections(
  plan: GenerationPlan,
  routed: RoutedConnection,
  context: RouterContext,
  nextIntersectionOrdinal: { value: number },
): PlanIntersection[] {
  const brushCells = getCorridorPathBrush(routed.path, routed.endpointWidth);
  const contacts = new Map<number, Set<string>>();
  for (const position of brushCells) {
    const index = positionIndex(position, plan.width);
    const owners = new Set(context.corridorOwners.get(index) ?? []);
    for (const direction of CORRIDOR_DIRECTIONS) {
      const adjacent = { x: position.x + direction.dx, y: position.y + direction.dy };
      for (const ownerId of context.corridorOwners.get(positionIndex(adjacent, plan.width)) ?? []) {
        owners.add(ownerId);
      }
    }
    owners.delete(routed.edge.id);
    if (owners.size > 0) contacts.set(index, owners);
  }

  const pending = new Set(contacts.keys());
  const newIntersections: PlanIntersection[] = [];
  while (pending.size > 0) {
    const firstIndex = Math.min(...pending);
    pending.delete(firstIndex);
    const component = [firstIndex];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const position = positionFromIndex(component[cursor], plan.width);
      for (const direction of CORRIDOR_DIRECTIONS) {
        const neighbor = { x: position.x + direction.dx, y: position.y + direction.dy };
        const neighborIndex = positionIndex(neighbor, plan.width);
        if (!pending.delete(neighborIndex)) continue;
        component.push(neighborIndex);
      }
    }
    const contactConnectionIds = new Set<string>([routed.edge.id]);
    for (const index of component) {
      for (const ownerId of contacts.get(index) ?? []) contactConnectionIds.add(ownerId);
    }

    const currentCenterline = new Set(
      routed.path.map((position) => positionIndex(position, plan.width)),
    );
    const contactWithMostDirections = component
      .map((index) => {
        const position = positionFromIndex(index, plan.width);
        const directions = CORRIDOR_DIRECTIONS.filter((direction) => {
          const neighbor = { x: position.x + direction.dx, y: position.y + direction.dy };
          const neighborIndex = positionIndex(neighbor, plan.width);
          return currentCenterline.has(neighborIndex)
            || (context.centerlineOwners.get(neighborIndex) ?? new Set())
              .size > 0;
        }).length;
        return { index, directions };
      })
      .sort((first, second) => second.directions - first.directions || first.index - second.index)[0];
    const position = positionFromIndex(contactWithMostDirections.index, plan.width);
    const kind: PlanIntersection["kind"] = contactWithMostDirections.directions >= 4
      ? "cross"
      : contactWithMostDirections.directions >= 3
        ? "t-junction"
        : "merge";
    const width = Math.max(
      3,
      routed.endpointWidth,
      ...[...contactConnectionIds].map((id) => context.edgeById.get(id)?.width ?? 1),
    );
    const left = position.x - Math.floor((width - 1) / 2);
    const top = position.y - Math.floor((width - 1) / 2);
    const right = position.x + Math.ceil((width - 1) / 2);
    const bottom = position.y + Math.ceil((width - 1) / 2);
    const connectionIds = [...contactConnectionIds].filter((connectionId) => {
      const edge = context.edgeById.get(connectionId);
      const path = connectionId === routed.edge.id ? routed.path : edge?.path ?? [];
      const pathWidth = connectionId === routed.edge.id ? routed.endpointWidth : edge?.width ?? 1;
      return getCorridorPathBrush(path, pathWidth).some((cell) => (
        cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= bottom
      ));
    });
    if (connectionIds.length < 2) continue;
    newIntersections.push({
      id: createStableGenerationId(plan.id, "intersection", nextIntersectionOrdinal.value),
      position,
      width,
      connectionIds: connectionIds.sort(),
      kind,
      metadata: {},
    });
    nextIntersectionOrdinal.value += 1;
  }
  return newIntersections;
}

function canPlaceVestibule(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  endpoint: ConnectionEndpointGeometry,
  context: RouterContext,
): boolean {
  const half = 1;
  const allowedRoomIds = new Set([edge.sourceRoomId, edge.targetRoomId]);
  for (let y = endpoint.position.y - half; y <= endpoint.position.y + half; y += 1) {
    for (let x = endpoint.position.x - half; x <= endpoint.position.x + half; x += 1) {
      if (x <= 0 || y <= 0 || x >= plan.width - 1 || y >= plan.height - 1) return false;
      const index = y * plan.width + x;
      const roomIndex = context.roomAt[index];
      if (roomIndex >= 0 && !allowedRoomIds.has(plan.rooms[roomIndex].id)) return false;
      if (context.obstacles[index]) return false;
      for (const ownerId of context.corridorOwners.get(index) ?? []) {
        if (!isAllowedCorridorContact(edge, ownerId, context.edgeById, context.cycleConnectionIds)) {
          return false;
        }
      }
    }
  }
  return true;
}

function createDoorTransitions(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  sourceEndpoint: ConnectionEndpointGeometry,
  targetEndpoint: ConnectionEndpointGeometry,
  transitionIdOrdinal: { value: number },
  existingIds: Set<string>,
): PlanTransition[] {
  if (
    edge.isBlocked
    || edge.connectionType === "blocked-passage"
    || (!edge.isSecret && edge.connectionType !== "door" && edge.connectionType !== "secret-door")
  ) return [];
  const type: PlanTransition["type"] = (
    edge.isSecret || edge.connectionType === "secret-door"
  )
    ? "secret-door"
    : "doorway";
  const transitions: PlanTransition[] = [];
  for (const [side, endpoint] of [
    ["source", sourceEndpoint],
    ["target", targetEndpoint],
  ] as const) {
    const openingPositions = endpoint.width === 2
      && !plan.generation.parameters.doubleDoorsEnabled
      ? [endpoint.openingPositions[Math.floor((endpoint.width - 1) / 2)]]
      : endpoint.openingPositions;
    for (const [openingIndex, position] of openingPositions.entries()) {
      let id = createStableGenerationId(plan.id, "transition", transitionIdOrdinal.value);
      while (existingIds.has(id)) {
        transitionIdOrdinal.value += 1;
        id = createStableGenerationId(plan.id, "transition", transitionIdOrdinal.value);
      }
      existingIds.add(id);
      transitions.push({
        id,
        type,
        position,
        roomId: endpoint.roomId,
        connectionId: edge.id,
        metadata: {
          orientation: endpoint.orientation,
          width: endpoint.width,
          side,
          openingIndex,
          locked: edge.isLocked,
        },
      });
      transitionIdOrdinal.value += 1;
    }
  }
  return transitions;
}

function createVestibules(
  plan: GenerationPlan,
  edge: ConnectionEdge,
  sourceEndpoint: ConnectionEndpointGeometry,
  targetEndpoint: ConnectionEndpointGeometry,
  context: RouterContext,
  nextIntersectionOrdinal: { value: number },
): PlanIntersection[] {
  if (edge.metadata.routeStyle !== "transition") return [];
  const vestibules: PlanIntersection[] = [];
  for (const [side, endpoint] of [
    ["source", sourceEndpoint],
    ["target", targetEndpoint],
  ] as const) {
    if (!canPlaceVestibule(plan, edge, endpoint, context)) continue;
    vestibules.push({
      id: createStableGenerationId(plan.id, "intersection", nextIntersectionOrdinal.value),
      position: endpoint.position,
      width: 3,
      connectionIds: [edge.id],
      kind: "vestibule",
      metadata: { side, orientation: endpoint.orientation },
    });
    nextIntersectionOrdinal.value += 1;
  }
  return vestibules;
}

function validateRouterResult(plan: GenerationPlan): void {
  const validation = validateGenerationPlan(plan);
  if (!validation.valid) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "Corridor routing produced an invalid GenerationPlan.",
      undefined,
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    );
  }
}

export function routeGenerationPlanCorridors(
  sourcePlan: GenerationPlan,
  options: CorridorRoutingOptions = {},
): GenerationPlan {
  assertPlanCanBeRouted(sourcePlan);
  const { costs, maxExpandedStates } = validateOptions(sourcePlan, options);
  const corridorRandom = createGenerationRandomStreams(sourcePlan.generation.seed).corridors;
  const roomAt = getRoomAt(sourcePlan);
  const obstacles = getObstacles(sourcePlan, roomAt);
  const edgeById = new Map(sourcePlan.connections.map((edge) => [edge.id, edge]));
  const cycleConnectionIds = new Set(sourcePlan.topology?.cycleConnectionIds ?? []);
  const searchStateCount = sourcePlan.width * sourcePlan.height * CORRIDOR_DIRECTIONS.length;
  const context: RouterContext = {
    plan: sourcePlan,
    roomAt,
    obstacles,
    corridorOwners: new Map(),
    centerlineOwners: new Map(),
    edgeById,
    cycleConnectionIds,
    searchWorkspace: {
      bestCost: new Float64Array(searchStateCount),
      previous: new Int32Array(searchStateCount),
      status: new Uint32Array(searchStateCount),
      heuristicDistance: new Uint32Array(sourcePlan.width * sourcePlan.height),
      heuristicGeneration: new Uint32Array(sourcePlan.width * sourcePlan.height),
      generation: 0,
    },
  };
  for (const intersection of sourcePlan.intersections) {
    const index = positionIndex(intersection.position, sourcePlan.width);
    for (const edgeId of intersection.connectionIds) {
      addOwner(context.corridorOwners, index, edgeId);
      addOwner(context.centerlineOwners, index, edgeId);
    }
  }

  const roomsById = new Map(sourcePlan.rooms.map((room) => [room.id, room]));
  const routedById = new Map<string, RoutedConnection>();
  const intersections = [...sourcePlan.intersections];
  const newTransitions: PlanTransition[] = [];
  const existingTransitionIds = new Set(sourcePlan.transitions.map((transition) => transition.id));
  const transitionIdOrdinal = { value: sourcePlan.transitions.length };
  const intersectionIdOrdinal = { value: sourcePlan.intersections.length };
  let sharedPathCellCount = 0;
  let totalPathLength = 0;
  let vestibuleCount = 0;
  let doorCount = 0;

  for (const originalEdge of resolveConnectionOrder(sourcePlan, options.prioritizedConnectionIds)) {
    const sourceRoom = roomsById.get(originalEdge.sourceRoomId)!;
    const targetRoom = roomsById.get(originalEdge.targetRoomId)!;
    const routeStyle = chooseRouteStyle(sourcePlan, originalEdge, corridorRandom);
    const requestedWidth = getConnectionWidth(sourcePlan, originalEdge, routeStyle);
    const minimumWidth = originalEdge.metadata.widthIsFixed ? requestedWidth : 1;
    let routed: RoutedConnection | undefined;
    let edgeSearchLimitHit = false;
    let connectionExpandedStates = 0;
    let connectionExpansionBudget = maxExpandedStates;
    const attemptedWidths: number[] = [];
    const exitDiagnostics: string[] = [];

    for (let width = requestedWidth; width >= minimumWidth; width -= 1) {
      const remainingStateBudget = connectionExpansionBudget - connectionExpandedStates;
      if (remainingStateBudget <= 0) {
        edgeSearchLimitHit = true;
        exitDiagnostics.push(
          `A* reached its ${connectionExpansionBudget}-state connection budget before width ${width}.`,
        );
        break;
      }
      attemptedWidths.push(width);
      const sourceExits = getRoomExits(
        sourcePlan,
        sourceRoom,
        targetRoom,
        width,
        roomAt,
        obstacles,
      );
      const targetExits = getRoomExits(
        sourcePlan,
        targetRoom,
        sourceRoom,
        width,
        roomAt,
        obstacles,
      );
      let search = searchRouteWithExpandingBounds(
        sourcePlan,
        originalEdge,
        routeStyle,
        width,
        sourceRoom,
        targetRoom,
        sourceExits,
        targetExits,
        context,
        costs,
        remainingStateBudget,
      );
      if (search.reachedLimit) {
        const initialSearch = search;
        const retryStateLimit = Math.min(
          Math.ceil(maxExpandedStates * 4),
          MAX_CORRIDOR_ROUTE_RETRY_EXPANDED_STATES,
        );
        connectionExpansionBudget += retryStateLimit;
        const retry = searchRouteWithExpandingBounds(
          sourcePlan,
          originalEdge,
          routeStyle,
          width,
          sourceRoom,
          targetRoom,
          sourceExits,
          targetExits,
          context,
          costs,
          retryStateLimit,
        );
        search = {
          ...retry,
          expandedStates: initialSearch.expandedStates + retry.expandedStates,
          diagnostics: [
            ...(initialSearch.diagnostics ?? []),
            ...(retry.diagnostics ?? []),
          ],
        };
      }
      connectionExpandedStates += search.expandedStates;
      exitDiagnostics.push(
        `width ${width}: ${sourceExits.length} source exits, ${targetExits.length} target exits${search.reachedLimit ? ", state limit reached after one bounded retry" : ""}`,
        ...(search.diagnostics ?? []),
      );
      edgeSearchLimitHit ||= search.reachedLimit;
      if (search.reachedLimit) break;
      if (!search.route) continue;
      routed = {
        edge: {
          ...originalEdge,
          width,
          path: search.route.path,
          metadata: {
            ...originalEdge.metadata,
            ...(width !== requestedWidth ? { requestedWidth } : {}),
            routeStyle,
            sourceEndpoint: buildEndpointGeometry(sourceRoom, search.route.sourceExit, width),
            targetEndpoint: buildEndpointGeometry(targetRoom, search.route.targetExit, width),
          },
        },
        routeStyle,
        endpointWidth: width,
        sourceExit: search.route.sourceExit,
        targetExit: search.route.targetExit,
        path: search.route.path,
      };
      break;
    }
    if (!routed) {
      throw new CorridorRoutingError(
        edgeSearchLimitHit ? "search-limit" : "no-route",
        edgeSearchLimitHit
          ? `The A* connection expansion limit of ${connectionExpansionBudget} total states was reached while routing ${originalEdge.id}.`
          : `No obstacle-free corridor path was found for ${originalEdge.id}.`,
        originalEdge.id,
        [
          `Source room ${sourceRoom.id} at ${sourceRoom.position.x},${sourceRoom.position.y}; target room ${targetRoom.id} at ${targetRoom.position.x},${targetRoom.position.y}.`,
          `Requested width: ${requestedWidth}.`,
          `Attempted widths: ${attemptedWidths.join(", ")}.`,
          `A* expanded ${connectionExpandedStates} of ${connectionExpansionBudget} allowed states for this connection.`,
          ...exitDiagnostics,
        ],
      );
    }

    const sourceEndpoint = routed.edge.metadata.sourceEndpoint!;
    const targetEndpoint = routed.edge.metadata.targetEndpoint!;
    edgeById.set(routed.edge.id, routed.edge);
    const updatedContext: RouterContext = { ...context, edgeById };
    const contacts = getContactIntersections(
      sourcePlan,
      routed,
      updatedContext,
      intersectionIdOrdinal,
    );
    intersections.push(...contacts);
    const vestibules = createVestibules(
      sourcePlan,
      routed.edge,
      sourceEndpoint,
      targetEndpoint,
      context,
      intersectionIdOrdinal,
    );
    intersections.push(...vestibules);
    vestibuleCount += vestibules.length;

    const routeIsTraversable = !routed.edge.isBlocked
      && routed.edge.connectionType !== "blocked-passage";
    const brushCells = getCorridorPathBrush(routed.path, routed.endpointWidth);
    if (routeIsTraversable) {
      const uniqueBrushCells = new Set(brushCells.map((position) => positionIndex(position, sourcePlan.width)));
      for (const index of uniqueBrushCells) {
        if (context.corridorOwners.has(index)) sharedPathCellCount += 1;
        addOwner(context.corridorOwners, index, routed.edge.id);
      }
      for (const position of routed.path) {
        addOwner(context.centerlineOwners, positionIndex(position, sourcePlan.width), routed.edge.id);
      }
    }
    routedById.set(routed.edge.id, routed);
    totalPathLength += Math.max(0, routed.path.length - 1);
    const transitions = createDoorTransitions(
      sourcePlan,
      routed.edge,
      sourceEndpoint,
      targetEndpoint,
      transitionIdOrdinal,
      existingTransitionIds,
    );
    newTransitions.push(...transitions);
    doorCount += transitions.length;
  }

  const intersectionIdsByConnection = new Map<string, string[]>();
  for (const intersection of intersections) {
    for (const connectionId of intersection.connectionIds) {
      const ids = intersectionIdsByConnection.get(connectionId) ?? [];
      ids.push(intersection.id);
      intersectionIdsByConnection.set(connectionId, ids);
    }
  }
  const connections = sourcePlan.connections.map((originalEdge) => {
    const routed = routedById.get(originalEdge.id)!;
    const intersectionIds = [
      ...new Set([
        ...(originalEdge.metadata.intersectionIds ?? []),
        ...(intersectionIdsByConnection.get(originalEdge.id) ?? []),
      ]),
    ];
    return {
      ...routed.edge,
      metadata: {
        ...routed.edge.metadata,
        intersectionIds,
      },
    };
  });
  const routedPlan: GenerationPlan = {
    ...sourcePlan,
    connections,
    intersections,
    transitions: [
      ...sourcePlan.transitions.filter((transition) => (
        !transition.connectionId
        || !routedById.has(transition.connectionId)
        || (transition.type !== "doorway" && transition.type !== "secret-door")
      )),
      ...newTransitions,
    ],
    topology: {
      ...sourcePlan.topology!,
      geometryStatus: "routed",
    },
    corridorRouting: {
      version: "corridor-routing-v1",
      routedConnectionCount: routedById.size,
      totalPathLength,
      sharedPathCellCount,
      junctionCount: intersections.filter((intersection) => intersection.kind !== "vestibule").length,
      vestibuleCount,
      doorCount,
    },
  };
  validateRouterResult(routedPlan);
  return routedPlan;
}
