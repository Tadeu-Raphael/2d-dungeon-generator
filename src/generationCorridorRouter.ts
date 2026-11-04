import {
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
  createGenerationRandomStreams,
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
  maxExpandedStates?: number;
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
}

const ROUTE_ORIENTATIONS: readonly ConnectionEndpointGeometry["orientation"][] = [
  "north",
  "east",
  "south",
  "west",
];
const MAX_CORRIDOR_WIDTH = 3;
const MAX_ROUTING_TILE_COUNT = MAX_DUNGEON_WIDTH * MAX_DUNGEON_HEIGHT;

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
  if (
    !Number.isSafeInteger(plan.width)
    || !Number.isSafeInteger(plan.height)
    || plan.width < MIN_DUNGEON_DIMENSION
    || plan.height < MIN_DUNGEON_DIMENSION
    || plan.width > MAX_DUNGEON_WIDTH
    || plan.height > MAX_DUNGEON_HEIGHT
  ) {
    throw new CorridorRoutingError(
      "invalid-plan",
      "The GenerationPlan dimensions are outside the supported dungeon bounds.",
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
  const maxExpandedStates = options.maxExpandedStates ?? maximumStateCount;
  if (
    !Number.isSafeInteger(maxExpandedStates)
    || maxExpandedStates < 1
    || maxExpandedStates > MAX_ROUTING_TILE_COUNT * CORRIDOR_DIRECTIONS.length
  ) {
    throw new RangeError("maxExpandedStates must be a positive safe integer within the supported map state limit.");
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

function createDistanceField(
  plan: GenerationPlan,
  exits: readonly RoomExitCandidate[],
): Int32Array {
  const distance = new Int32Array(plan.width * plan.height).fill(-1);
  const queue = new Int32Array(distance.length);
  let tail = 0;
  for (const exit of exits) {
    const index = positionIndex(exit.position, plan.width);
    if (distance[index] >= 0) continue;
    distance[index] = 0;
    queue[tail] = index;
    tail += 1;
  }
  for (let head = 0; head < tail; head += 1) {
    const current = positionFromIndex(queue[head], plan.width);
    const nextDistance = distance[queue[head]] + 1;
    for (const direction of CORRIDOR_DIRECTIONS) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      if (
        next.x <= 0
        || next.y <= 0
        || next.x >= plan.width - 1
        || next.y >= plan.height - 1
      ) continue;
      const nextIndex = positionIndex(next, plan.width);
      if (distance[nextIndex] >= 0) continue;
      distance[nextIndex] = nextDistance;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }
  return distance;
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
): GridPosition[] {
  const path: GridPosition[] = [];
  for (let current = state; current >= 0; current = previous[current]) {
    path.push(positionFromIndex(Math.floor(current / CORRIDOR_DIRECTIONS.length), width));
    if (previous[current] < 0) break;
  }
  return path.reverse();
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
  costs: CorridorRoutingCosts,
  maxExpandedStates: number,
): RouteSearchResult {
  if (sourceExits.length === 0 || targetExits.length === 0) {
    return { reachedLimit: false };
  }
  const stateCount = plan.width * plan.height * CORRIDOR_DIRECTIONS.length;
  const distancesToTarget = createDistanceField(plan, targetExits);
  const bestCost = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(stateCount).fill(-1);
  const startExitByState = new Int32Array(stateCount).fill(-1);
  const targetExitByState = new Int32Array(stateCount).fill(-1);
  const closed = new Uint8Array(stateCount);
  const open = new MinHeap();
  let sequence = 0;
  const minMovementCost = costs.movement;

  for (const [exitIndex, exit] of sourceExits.entries()) {
    const stamp = inspectBrush(exit.position, exit.direction, width, edge, context);
    if (!stamp.valid) continue;
    const cellIndex = positionIndex(exit.position, plan.width);
    const state = cellIndex * CORRIDOR_DIRECTIONS.length + exit.direction;
    const routeCost = exit.preference * 0.04
      + costs.movement
      + (stamp.owners.size > 0 ? costs.reuseCorridor : costs.excavateWall);
    if (routeCost >= bestCost[state]) continue;
    bestCost[state] = routeCost;
    startExitByState[state] = exitIndex;
    const heuristicDistance = distancesToTarget[cellIndex];
    open.push({
      state,
      cost: routeCost,
      priority: routeCost + Math.max(0, heuristicDistance) * minMovementCost,
      sequence,
    });
    sequence += 1;
  }

  for (const [exitIndex, exit] of targetExits.entries()) {
    const approachDirection = (exit.direction + 2) % CORRIDOR_DIRECTIONS.length;
    const cellIndex = positionIndex(exit.position, plan.width);
    const state = cellIndex * CORRIDOR_DIRECTIONS.length + approachDirection;
    const currentExit = targetExitByState[state];
    if (currentExit < 0 || exit.preference < targetExits[currentExit].preference) {
      targetExitByState[state] = exitIndex;
    }
  }

  let expandedStates = 0;
  while (open.size > 0) {
    if (expandedStates >= maxExpandedStates) return { reachedLimit: true };
    const entry = open.pop()!;
    if (closed[entry.state] || entry.cost > bestCost[entry.state] + 1e-9) continue;
    closed[entry.state] = 1;
    expandedStates += 1;
    const targetExitIndex = targetExitByState[entry.state];
    if (targetExitIndex >= 0) {
      const sourceExit = sourceExits[startExitByState[entry.state]];
      return {
        route: {
          path: reconstructPath(entry.state, previous, plan.width),
          sourceExit,
          targetExit: targetExits[targetExitIndex],
        },
        reachedLimit: false,
      };
    }

    const cellIndex = Math.floor(entry.state / CORRIDOR_DIRECTIONS.length);
    const current = positionFromIndex(cellIndex, plan.width);
    const incomingDirection = entry.state % CORRIDOR_DIRECTIONS.length;
    for (let directionIndex = 0; directionIndex < CORRIDOR_DIRECTIONS.length; directionIndex += 1) {
      if (previous[entry.state] < 0 && directionIndex !== incomingDirection) continue;
      if ((directionIndex + 2) % CORRIDOR_DIRECTIONS.length === incomingDirection) continue;
      const direction = CORRIDOR_DIRECTIONS[directionIndex];
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      if (
        next.x <= 0
        || next.y <= 0
        || next.x >= plan.width - 1
        || next.y >= plan.height - 1
      ) continue;

      const turn = directionIndex !== incomingDirection;
      if (turn && !inspectBrush(current, directionIndex, width, edge, context).valid) continue;
      const nextStamp = inspectBrush(next, directionIndex, width, edge, context);
      if (!nextStamp.valid) continue;
      const nextCellIndex = positionIndex(next, plan.width);
      const nextState = nextCellIndex * CORRIDOR_DIRECTIONS.length + directionIndex;
      if (closed[nextState]) continue;
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
      const targetExitIndexForNext = targetExitByState[nextState];
      const destinationPreference = targetExitIndexForNext >= 0
        ? targetExits[targetExitIndexForNext].preference * 0.04
        : 0;
      const nextCost = entry.cost
        + costs.movement
        + existingPenalty
        + turnPenalty
        + bias
        + destinationPreference;
      if (nextCost >= bestCost[nextState]) continue;
      bestCost[nextState] = nextCost;
      previous[nextState] = entry.state;
      startExitByState[nextState] = startExitByState[entry.state];
      const heuristicDistance = distancesToTarget[nextCellIndex];
      open.push({
        state: nextState,
        cost: nextCost,
        priority: nextCost + Math.max(0, heuristicDistance) * minMovementCost,
        sequence,
      });
      sequence += 1;
    }
  }
  return { reachedLimit: false };
}

function resolveConnectionOrder(plan: GenerationPlan): ConnectionEdge[] {
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  return [...plan.connections].sort((first, second) => {
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
  intersections: PlanIntersection[],
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
    const connectionIds = new Set<string>([routed.edge.id]);
    for (const index of component) {
      for (const ownerId of contacts.get(index) ?? []) connectionIds.add(ownerId);
    }
    if (connectionIds.size < 2) continue;

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
      ...[...connectionIds].map((id) => context.edgeById.get(id)?.width ?? 1),
    );
    const nearbyIntersection = [...intersections, ...newIntersections].find((intersection) => (
      Math.abs(intersection.position.x - position.x) <= 1
      && Math.abs(intersection.position.y - position.y) <= 1
      && intersection.kind !== "vestibule"
    ));
    if (nearbyIntersection) {
      const updated: PlanIntersection = {
        ...nearbyIntersection,
        width: Math.max(nearbyIntersection.width, width),
        connectionIds: [...new Set([...nearbyIntersection.connectionIds, ...connectionIds])],
        kind: kind === "cross" || nearbyIntersection.kind === "cross"
          ? "cross"
          : kind === "t-junction" || nearbyIntersection.kind === "t-junction"
            ? "t-junction"
            : "merge",
      };
      const newIndex = newIntersections.findIndex((intersection) => intersection.id === nearbyIntersection.id);
      if (newIndex >= 0) newIntersections[newIndex] = updated;
      else {
        const existingIndex = intersections.findIndex((intersection) => intersection.id === nearbyIntersection.id);
        if (existingIndex >= 0) intersections[existingIndex] = updated;
      }
      continue;
    }
    newIntersections.push({
      id: createStableGenerationId(plan.id, "intersection", nextIntersectionOrdinal.value),
      position,
      width,
      connectionIds: [...connectionIds].sort(),
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
  const context: RouterContext = {
    plan: sourcePlan,
    roomAt,
    obstacles,
    corridorOwners: new Map(),
    centerlineOwners: new Map(),
    edgeById,
    cycleConnectionIds,
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

  for (const originalEdge of resolveConnectionOrder(sourcePlan)) {
    const sourceRoom = roomsById.get(originalEdge.sourceRoomId)!;
    const targetRoom = roomsById.get(originalEdge.targetRoomId)!;
    const routeStyle = chooseRouteStyle(sourcePlan, originalEdge, corridorRandom);
    const requestedWidth = getConnectionWidth(sourcePlan, originalEdge, routeStyle);
    let routed: RoutedConnection | undefined;
    let edgeSearchLimitHit = false;

    for (let width = requestedWidth; width >= 1; width -= 1) {
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
      const search = searchRoute(
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
        maxExpandedStates,
      );
      edgeSearchLimitHit ||= search.reachedLimit;
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
          ? `The A* state limit was reached while routing ${originalEdge.id}.`
          : `No obstacle-free corridor path was found for ${originalEdge.id}.`,
        originalEdge.id,
        [
          `Requested width: ${requestedWidth}.`,
          `Attempted widths: ${Array.from({ length: requestedWidth }, (_, index) => requestedWidth - index).join(", ")}.`,
        ],
      );
    }

    const sourceEndpoint = routed.edge.metadata.sourceEndpoint!;
    const targetEndpoint = routed.edge.metadata.targetEndpoint!;
    const updatedContext: RouterContext = { ...context, edgeById };
    const contacts = getContactIntersections(
      sourcePlan,
      routed,
      updatedContext,
      intersections,
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
