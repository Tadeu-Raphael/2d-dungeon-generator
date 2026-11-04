import {
  createGenerationRandomStreams,
  isSupportedDungeonDimensions,
} from "./dungeon";
import type { RoomGenerationBounds } from "./dungeon";
import type {
  ConnectionEdge,
  GenerationPlan,
  GridPosition,
  RoomNode,
  SpatialLayoutMetadata,
  SpatialLayoutScore,
  SpatialLayoutStyle,
} from "./generationPlan";
import { validateGenerationPlan } from "./generationPlanValidation";
import { validateDungeonTopology } from "./generationTopology";

export interface SpatialLayoutOptions {
  style?: SpatialLayoutStyle;
  minimumRoomGap?: number;
  maximumConnectionDistance?: number;
  maxIterations?: number;
  maxLayoutAttempts?: number;
  allowRoomRotation?: boolean;
  allowRoomResize?: boolean;
  importantRoomClearance?: number;
}

export type SpatialLayoutErrorCode = "invalid-topology" | "invalid-plan" | "routed-plan" | "layout-failed";

export class SpatialLayoutError extends Error {
  readonly code: SpatialLayoutErrorCode;
  readonly failedRoomIds: readonly string[];
  readonly failedConnectionIds: readonly string[];
  readonly details: readonly string[];

  constructor(
    code: SpatialLayoutErrorCode,
    message: string,
    details: readonly string[] = [],
    failedRoomIds: readonly string[] = [],
    failedConnectionIds: readonly string[] = [],
  ) {
    super(message);
    this.name = "SpatialLayoutError";
    this.code = code;
    this.details = details;
    this.failedRoomIds = failedRoomIds;
    this.failedConnectionIds = failedConnectionIds;
  }
}

interface Point {
  x: number;
  y: number;
}

interface RoomRectangle extends Point {
  width: number;
  height: number;
}

interface RoomVariant {
  width: number;
  height: number;
  footprint: readonly GridPosition[];
  rotated: boolean;
  resized: boolean;
}

interface RoomPair {
  first: RoomNode;
  second: RoomNode;
  connected: boolean;
  sameSector: boolean;
  connectionIds: readonly string[];
  connectionWidth: number;
  connectionTypes: readonly ConnectionEdge["connectionType"][];
}

interface RoomPlacement {
  room: RoomNode;
  rectangle: RoomRectangle;
  variant: RoomVariant;
}

interface PlacementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PlacementConflictCheck {
  placement: RoomPlacement;
  minimumGap: number;
}

interface PlacementScoringRelation {
  placement: RoomPlacement;
  pair: RoomPair;
}

interface PlacementAttemptResult {
  placements: RoomPlacement[];
  failedRoomIds: string[];
  minimumRoomGap: number;
}

interface ClusterGroup {
  id: string;
  roomIds: string[];
}

interface Zone extends RoomRectangle {}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_PLACEMENT_ATTEMPTS = 5;
const MAX_FORCE_ITERATIONS = 100;
const DEFAULT_FORCE_ITERATIONS = 42;
const MAX_IMPORTANT_CLEARANCE = 8;
const MAX_PLACEMENT_SEARCH_POINTS = 16_384;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function pairKey(firstId: string, secondId: string): string {
  return firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;
}

function resolveStyle(plan: GenerationPlan, requestedStyle?: SpatialLayoutStyle): SpatialLayoutStyle {
  if (requestedStyle) return requestedStyle;
  switch (plan.topology?.style) {
    case "centralized":
      return "central-hub";
    case "sectorized":
    case "hybrid":
      return "clusters";
    case "circuit":
      return "ring";
    default:
      return "axis-branches";
  }
}

function validateOptions(
  plan: GenerationPlan,
  options: SpatialLayoutOptions,
): {
  minimumRoomGap: number;
  maximumConnectionDistance: number;
  maxIterations: number;
  maxLayoutAttempts: number;
  allowRoomRotation: boolean;
  allowRoomResize: boolean;
  importantRoomClearance: number;
} {
  const corridorWidth = plan.generation.parameters.corridorWidth;
  const minimumRoomGap = options.minimumRoomGap ?? Math.max(1, corridorWidth);
  const maximumConnectionDistance = options.maximumConnectionDistance
    ?? Math.min(plan.width, plan.height) * 0.8;
  const maxIterations = options.maxIterations ?? DEFAULT_FORCE_ITERATIONS;
  const maxLayoutAttempts = options.maxLayoutAttempts ?? 3;
  const importantRoomClearance = options.importantRoomClearance ?? 2;
  if (!Number.isSafeInteger(minimumRoomGap) || minimumRoomGap < 0 || minimumRoomGap > 32) {
    throw new RangeError("minimumRoomGap must be an integer between 0 and 32.");
  }
  if (!Number.isFinite(maximumConnectionDistance) || maximumConnectionDistance <= 0) {
    throw new RangeError("maximumConnectionDistance must be a positive finite number.");
  }
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 0 || maxIterations > MAX_FORCE_ITERATIONS) {
    throw new RangeError(`maxIterations must be an integer between 0 and ${MAX_FORCE_ITERATIONS}.`);
  }
  if (
    !Number.isSafeInteger(maxLayoutAttempts)
    || maxLayoutAttempts < 1
    || maxLayoutAttempts > MAX_PLACEMENT_ATTEMPTS
  ) {
    throw new RangeError(`maxLayoutAttempts must be an integer between 1 and ${MAX_PLACEMENT_ATTEMPTS}.`);
  }
  if (
    !Number.isSafeInteger(importantRoomClearance)
    || importantRoomClearance < 0
    || importantRoomClearance > MAX_IMPORTANT_CLEARANCE
  ) {
    throw new RangeError(`importantRoomClearance must be an integer between 0 and ${MAX_IMPORTANT_CLEARANCE}.`);
  }
  return {
    minimumRoomGap,
    maximumConnectionDistance,
    maxIterations,
    maxLayoutAttempts,
    allowRoomRotation: options.allowRoomRotation ?? true,
    allowRoomResize: options.allowRoomResize ?? true,
    importantRoomClearance,
  };
}

function getRoomPairs(plan: GenerationPlan): RoomPair[] {
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const connectionsByPair = new Map<string, ConnectionEdge[]>();
  for (const edge of plan.connections) {
    const source = roomsById.get(edge.sourceRoomId);
    const target = roomsById.get(edge.targetRoomId);
    if (!source || !target || (source.floorId !== target.floorId && edge.connectionType === "vertical")) {
      continue;
    }
    const key = pairKey(source.id, target.id);
    const edges = connectionsByPair.get(key) ?? [];
    edges.push(edge);
    connectionsByPair.set(key, edges);
  }
  const sectorIds = new Map(plan.rooms.map((room) => [room.id, room.sectorId]));
  const pairs: RoomPair[] = [];
  for (let firstIndex = 0; firstIndex < plan.rooms.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < plan.rooms.length; secondIndex += 1) {
      const first = plan.rooms[firstIndex];
      const second = plan.rooms[secondIndex];
      const pairConnections = connectionsByPair.get(pairKey(first.id, second.id)) ?? [];
      pairs.push({
        first,
        second,
        connected: pairConnections.length > 0,
        sameSector: first.floorId === second.floorId
          && Boolean(sectorIds.get(first.id) && sectorIds.get(first.id) === sectorIds.get(second.id)),
        connectionIds: pairConnections.map((edge) => edge.id),
        connectionWidth: pairConnections.reduce((width, edge) => Math.max(width, edge.width), 0),
        connectionTypes: [...new Set(pairConnections.map((edge) => edge.connectionType))],
      });
    }
  }
  return pairs;
}

function getRoomDegrees(plan: GenerationPlan): Map<string, number> {
  const degrees = new Map(plan.rooms.map((room) => [room.id, 0]));
  for (const edge of plan.connections) {
    if (degrees.has(edge.sourceRoomId)) {
      degrees.set(edge.sourceRoomId, (degrees.get(edge.sourceRoomId) ?? 0) + 1);
    }
    if (degrees.has(edge.targetRoomId)) {
      degrees.set(edge.targetRoomId, (degrees.get(edge.targetRoomId) ?? 0) + 1);
    }
  }
  return degrees;
}

function getRoomDepths(plan: GenerationPlan, rootRoomId: string): Map<string, number> {
  const adjacency = new Map(plan.rooms.map((room) => [room.id, [] as string[]]));
  for (const edge of plan.connections) {
    if (edge.isBlocked) continue;
    adjacency.get(edge.sourceRoomId)?.push(edge.targetRoomId);
    adjacency.get(edge.targetRoomId)?.push(edge.sourceRoomId);
  }
  const depths = new Map<string, number>([[rootRoomId, 0]]);
  const queue = [rootRoomId];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const roomId = queue[queueIndex];
    for (const neighborId of adjacency.get(roomId) ?? []) {
      if (depths.has(neighborId)) continue;
      depths.set(neighborId, (depths.get(roomId) ?? 0) + 1);
      queue.push(neighborId);
    }
  }
  return depths;
}

function chooseHubRoom(plan: GenerationPlan, degrees: ReadonlyMap<string, number>): RoomNode {
  return [...plan.rooms].sort((first, second) => (
    (degrees.get(second.id) ?? 0) - (degrees.get(first.id) ?? 0)
    || second.importance - first.importance
    || first.id.localeCompare(second.id)
  ))[0];
}

function getClusterGroups(plan: GenerationPlan): ClusterGroup[] {
  if (plan.sectors.length > 0) {
    const groups = plan.sectors
      .map((sector) => ({
        id: sector.id,
        roomIds: sector.roomIds.filter((roomId) => plan.rooms.some((room) => room.id === roomId)),
      }))
      .filter((group) => group.roomIds.length > 0);
    const assigned = new Set(groups.flatMap((group) => group.roomIds));
    const unassigned = plan.rooms.map((room) => room.id).filter((roomId) => !assigned.has(roomId));
    if (unassigned.length > 0) groups.push({ id: "unsectorized", roomIds: unassigned });
    return groups;
  }

  const groups = plan.topology?.branchPaths
    .map((branch) => ({ id: branch.id, roomIds: [...branch.roomIds] }))
    .filter((group) => group.roomIds.length > 0) ?? [];
  const assigned = new Set(groups.flatMap((group) => group.roomIds));
  const mainPath = (plan.mainPathRoomIds ?? []).filter((roomId) => !assigned.has(roomId));
  if (mainPath.length > 0) groups.unshift({ id: "main-path", roomIds: mainPath });
  const remaining = plan.rooms.map((room) => room.id).filter((roomId) => !assigned.has(roomId));
  const mainGroup = groups.find((group) => group.id === "main-path");
  if (mainGroup) mainGroup.roomIds.push(...remaining.filter((roomId) => !mainGroup.roomIds.includes(roomId)));
  else if (remaining.length > 0) groups.push({ id: "remaining", roomIds: remaining });
  return groups.length > 0 ? groups : [{ id: "all-rooms", roomIds: plan.rooms.map((room) => room.id) }];
}

function splitBspZone(zone: Zone, random: () => number): [Zone, Zone] | null {
  const splitVertically = zone.width >= zone.height;
  const dimension = splitVertically ? zone.width : zone.height;
  if (dimension < 6) return null;
  const split = clamp(Math.round(dimension * (0.4 + random() * 0.2)), 3, dimension - 3);
  if (splitVertically) {
    return [
      { x: zone.x, y: zone.y, width: split, height: zone.height },
      { x: zone.x + split, y: zone.y, width: zone.width - split, height: zone.height },
    ];
  }
  return [
    { x: zone.x, y: zone.y, width: zone.width, height: split },
    { x: zone.x, y: zone.y + split, width: zone.width, height: zone.height - split },
  ];
}

function createBspZones(
  count: number,
  width: number,
  height: number,
  random: () => number,
): Zone[] {
  const zones: Zone[] = [{ x: 2, y: 2, width: width - 4, height: height - 4 }];
  while (zones.length < count) {
    const candidateIndexes = zones
      .map((zone, index) => ({ zone, index, area: zone.width * zone.height }))
      .sort((first, second) => second.area - first.area || first.index - second.index);
    const candidate = candidateIndexes.find(({ zone }) => (
      Math.max(zone.width, zone.height) >= 6
    ));
    if (!candidate) break;
    const split = splitBspZone(candidate.zone, random);
    if (!split) break;
    zones.splice(candidate.index, 1, ...split);
  }
  return zones;
}

function assignTarget(
  targets: Map<string, Point>,
  roomId: string,
  point: Point,
): void {
  if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
    targets.set(roomId, point);
  }
}

function getStyleTargets(
  plan: GenerationPlan,
  style: SpatialLayoutStyle,
  random: () => number,
): { targets: Map<string, Point>; sectorCenters: Map<string, Point> } {
  const targets = new Map<string, Point>();
  const sectorCenters = new Map<string, Point>();
  const center = { x: plan.width / 2, y: plan.height / 2 };
  const mainPath = plan.mainPathRoomIds ?? [];
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const degrees = getRoomDegrees(plan);
  const margin = 3;

  if (style === "axis-branches") {
    const axisLength = Math.max(0, plan.width - 2 * margin);
    mainPath.forEach((roomId, index) => {
      const x = mainPath.length <= 1
        ? center.x
        : margin + axisLength * index / (mainPath.length - 1);
      assignTarget(targets, roomId, { x, y: center.y });
    });
    plan.topology?.branchPaths.forEach((branch, branchIndex) => {
      const anchor = targets.get(branch.anchorRoomId) ?? center;
      const direction = branchIndex % 2 === 0 ? -1 : 1;
      const lateralOffset = Math.min(plan.height * 0.38, 4 + Math.floor(branchIndex / 2) * 5);
      branch.roomIds.forEach((roomId, depth) => {
        const sidePosition = lateralOffset + (depth + 1) * 3;
        const alongAxis = (depth + 1) * 1.5 * (branchIndex % 3 === 0 ? -1 : 1);
        assignTarget(targets, roomId, {
          x: anchor.x + alongAxis,
          y: anchor.y + direction * sidePosition,
        });
      });
    });
  } else if (style === "central-hub") {
    const hub = chooseHubRoom(plan, degrees);
    assignTarget(targets, hub.id, center);
    const depths = getRoomDepths(plan, hub.id);
    const otherRooms = [...plan.rooms]
      .filter((room) => room.id !== hub.id)
      .sort((first, second) => (
        (depths.get(first.id) ?? Number.MAX_SAFE_INTEGER)
          - (depths.get(second.id) ?? Number.MAX_SAFE_INTEGER)
        || second.importance - first.importance
        || first.id.localeCompare(second.id)
      ));
    otherRooms.forEach((room, index) => {
      const depth = depths.get(room.id) ?? 1;
      const maxDepth = Math.max(1, ...depths.values());
      const radius = Math.min(plan.width, plan.height) * (
        0.16 + 0.22 * (depth - 1) / Math.max(1, maxDepth - 1)
      );
      const angle = index * GOLDEN_ANGLE;
      assignTarget(targets, room.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    });
  } else if (style === "ring") {
    const radiusX = Math.max(4, Math.min(plan.width * 0.32, plan.width / 2 - margin));
    const radiusY = Math.max(4, Math.min(plan.height * 0.32, plan.height / 2 - margin));
    const ringRooms = mainPath.length > 0
      ? [...mainPath, ...plan.rooms.map((room) => room.id).filter((roomId) => !mainPath.includes(roomId))]
      : plan.rooms.map((room) => room.id);
    ringRooms.forEach((roomId, index) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * index / ringRooms.length;
      assignTarget(targets, roomId, {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
      });
    });
    plan.topology?.branchPaths.forEach((branch, branchIndex) => {
      const anchor = targets.get(branch.anchorRoomId) ?? center;
      branch.roomIds.forEach((roomId, depth) => {
        const anchorAngle = Math.atan2(anchor.y - center.y, anchor.x - center.x);
        const direction = branchIndex % 2 === 0 ? -1 : 1;
        const angle = anchorAngle + direction * (0.55 + depth * 0.12);
        const radius = Math.min(radiusX, radiusY) * (1.1 + depth * 0.12);
        assignTarget(targets, roomId, {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
      });
    });
  } else {
    const groups = getClusterGroups(plan);
    const zones = createBspZones(groups.length, plan.width, plan.height, random);
    groups.forEach((group, groupIndex) => {
      const zone = zones[groupIndex % zones.length];
      const groupCenter = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
      sectorCenters.set(group.id, groupCenter);
      group.roomIds.forEach((roomId, roomIndex) => {
        const radius = Math.min(plan.width, plan.height) * 0.055 * Math.sqrt(roomIndex);
        const angle = roomIndex * GOLDEN_ANGLE + groupIndex * 0.37;
        assignTarget(targets, roomId, {
          x: groupCenter.x + Math.cos(angle) * radius,
          y: groupCenter.y + Math.sin(angle) * radius,
        });
      });
    });
    for (const sector of plan.sectors) {
      const groupCenter = sectorCenters.get(sector.id);
      if (groupCenter) sectorCenters.set(sector.id, groupCenter);
    }
  }

  for (const room of plan.rooms) {
    if (!targets.has(room.id)) {
      const sector = plan.sectors.find((candidate) => (
        candidate.id === room.sectorId && sectorCenters.has(candidate.id)
      ));
      assignTarget(targets, room.id, sector ? sectorCenters.get(sector.id)! : center);
    }
    if (!roomsById.has(room.id)) assignTarget(targets, room.id, center);
  }
  return { targets, sectorCenters };
}

function getBounds(room: RoomNode): RoomGenerationBounds | undefined {
  return room.metadata.generationBounds;
}

function isWithinGenerationBounds(
  room: RoomNode,
  width: number,
  height: number,
): boolean {
  const bounds = getBounds(room);
  if (!bounds) return width >= 2 && height >= 2;
  const area = width * height;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  return (
    width >= bounds.minWidth
    && width <= bounds.maxWidth
    && height >= bounds.minHeight
    && height <= bounds.maxHeight
    && area >= bounds.areaRange.min
    && area <= bounds.areaRange.max
    && aspectRatio >= bounds.aspectRatioRange.min
    && aspectRatio <= bounds.aspectRatioRange.max
  );
}

function rotateFootprint(room: RoomNode): readonly GridPosition[] {
  return room.footprint.map((cell) => ({
    x: room.height - 1 - cell.y,
    y: cell.x,
  }));
}

function scaleFootprint(
  footprint: readonly GridPosition[],
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): readonly GridPosition[] {
  const cells = new Map<string, GridPosition>();
  for (const cell of footprint) {
    const x = Math.min(width - 1, Math.floor((cell.x + 0.5) * width / sourceWidth));
    const y = Math.min(height - 1, Math.floor((cell.y + 0.5) * height / sourceHeight));
    cells.set(`${x},${y}`, { x, y });
  }
  return [...cells.values()].sort((first, second) => first.y - second.y || first.x - second.x);
}

function createRoomVariants(room: RoomNode, allowRotation: boolean, allowResize: boolean): RoomVariant[] {
  const variants: RoomVariant[] = [{
    width: room.width,
    height: room.height,
    footprint: room.footprint,
    rotated: false,
    resized: false,
  }];
  if (allowRotation && room.metadata.rotationAllowed !== false && room.width !== room.height) {
    const rotated = {
      width: room.height,
      height: room.width,
      footprint: rotateFootprint(room),
      rotated: true,
      resized: false,
    };
    if (isWithinGenerationBounds(room, rotated.width, rotated.height)) variants.push(rotated);
  }
  if (!allowResize) return variants;

  const scaleRatios = [0.9, 0.8, 0.7, 0.6];
  const originalVariants = [...variants];
  for (const original of originalVariants) {
    for (const scale of scaleRatios) {
      const width = Math.max(2, Math.floor(original.width * scale));
      const height = Math.max(2, Math.floor(original.height * scale));
      if (
        (width === original.width && height === original.height)
        || !isWithinGenerationBounds(room, width, height)
        || variants.some((variant) => variant.width === width && variant.height === height)
      ) {
        continue;
      }
      variants.push({
        width,
        height,
        footprint: scaleFootprint(original.footprint, original.width, original.height, width, height),
        rotated: original.rotated,
        resized: true,
      });
    }
  }
  return variants;
}

function clampPoint(point: Point, plan: GenerationPlan, width: number, height: number): Point {
  return {
    x: clamp(point.x, 1 + width / 2, plan.width - 1 - width / 2),
    y: clamp(point.y, 1 + height / 2, plan.height - 1 - height / 2),
  };
}

function getRoomDiagonal(room: RoomNode): number {
  return Math.hypot(room.width, room.height);
}

function getConnectionSpacingWidth(pair: RoomPair, corridorWidth: number): number {
  const width = Math.max(corridorWidth, pair.connectionWidth);
  return pair.connectionTypes.includes("open-passage") ? Math.max(1, width * 0.75) : width;
}

function relaxTargets(
  plan: GenerationPlan,
  pairs: readonly RoomPair[],
  initialTargets: ReadonlyMap<string, Point>,
  minimumRoomGap: number,
  corridorWidth: number,
  maxIterations: number,
): Map<string, Point> {
  const points = new Map<string, Point>();
  const targets = new Map<string, Point>();
  for (const room of plan.rooms) {
    const target = clampPoint(initialTargets.get(room.id) ?? { x: plan.width / 2, y: plan.height / 2 }, plan, room.width, room.height);
    targets.set(room.id, target);
    points.set(room.id, { ...target });
  }
  if (maxIterations === 0 || plan.rooms.length < 2) return points;

  const roomIndexById = new Map(plan.rooms.map((room, index) => [room.id, index]));
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const forces = new Map(plan.rooms.map((room) => [room.id, { x: 0, y: 0 }]));
    const cooling = 1 - 0.65 * iteration / Math.max(1, maxIterations - 1);
    for (const room of plan.rooms) {
      const point = points.get(room.id)!;
      const target = targets.get(room.id)!;
      const force = forces.get(room.id)!;
      const anchorStrength = room.roomRole === "entrance" || room.roomRole === "objective" || room.roomRole === "boss"
        ? 0.11
        : 0.075;
      force.x += (target.x - point.x) * anchorStrength;
      force.y += (target.y - point.y) * anchorStrength;
    }

    for (const pair of pairs) {
      const firstPoint = points.get(pair.first.id)!;
      const secondPoint = points.get(pair.second.id)!;
      const firstForce = forces.get(pair.first.id)!;
      const secondForce = forces.get(pair.second.id)!;
      let dx = secondPoint.x - firstPoint.x;
      let dy = secondPoint.y - firstPoint.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.001) {
        const firstIndex = roomIndexById.get(pair.first.id) ?? 0;
        const secondIndex = roomIndexById.get(pair.second.id) ?? 1;
        const angle = (secondIndex - firstIndex) * GOLDEN_ANGLE;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const unitX = dx / distance;
      const unitY = dy / distance;
      const roomExtent = (
        getRoomDiagonal(pair.first) + getRoomDiagonal(pair.second)
      ) / 2;
      const pairGap = pair.connected
        ? Math.max(minimumRoomGap, pair.connectionWidth - 1)
        : minimumRoomGap;
      const requiredDistance = roomExtent + pairGap;
      if (distance < requiredDistance) {
        const strength = (requiredDistance - distance) * 0.035;
        firstForce.x -= unitX * strength;
        firstForce.y -= unitY * strength;
        secondForce.x += unitX * strength;
        secondForce.y += unitY * strength;
      }
      if (pair.connected) {
        const desiredDistance = roomExtent + pairGap + getConnectionSpacingWidth(pair, corridorWidth);
        const strength = (distance - desiredDistance) * 0.018;
        firstForce.x += unitX * strength;
        firstForce.y += unitY * strength;
        secondForce.x -= unitX * strength;
        secondForce.y -= unitY * strength;
      }
    }

    for (const room of plan.rooms) {
      const point = points.get(room.id)!;
      const force = forces.get(room.id)!;
      const next = clampPoint({
        x: point.x + force.x * cooling,
        y: point.y + force.y * cooling,
      }, plan, room.width, room.height);
      points.set(room.id, next);
    }
  }
  return points;
}

function rectanglesOverlap(first: RoomRectangle, second: RoomRectangle): boolean {
  return (
    first.x < second.x + second.width
    && second.x < first.x + first.width
    && first.y < second.y + second.height
    && second.y < first.y + first.height
  );
}

function getRectangleGaps(first: RoomRectangle, second: RoomRectangle): { x: number; y: number } {
  return {
    x: Math.max(0, first.x - (second.x + second.width), second.x - (first.x + first.width)),
    y: Math.max(0, first.y - (second.y + second.height), second.y - (first.y + first.height)),
  };
}

function getEffectiveMinimumGap(
  room: RoomNode,
  other: RoomNode,
  pair: RoomPair | undefined,
  baseGap: number,
  corridorWidth: number,
  importantRoomClearance: number,
): number {
  let minimumGap = baseGap;
  if (pair?.connected) {
    minimumGap = Math.max(minimumGap, corridorWidth - 1, pair.connectionWidth - 1);
  }
  if (pair?.sameSector && !pair.connected) minimumGap = Math.max(0, minimumGap - 1);
  if (
    room.importance >= 0.75
    || other.importance >= 0.75
    || room.roomRole === "objective"
    || room.roomRole === "boss"
    || other.roomRole === "objective"
    || other.roomRole === "boss"
  ) {
    minimumGap += Math.min(baseGap > 0 ? importantRoomClearance : 0, baseGap);
  }
  return minimumGap;
}

function doesPlacementConflict(
  candidate: RoomRectangle,
  checks: readonly PlacementConflictCheck[],
): boolean {
  for (const { placement, minimumGap } of checks) {
    const existing = placement.rectangle;
    if (rectanglesOverlap(candidate, existing)) return true;
    if (minimumGap === 0) continue;
    const gaps = getRectangleGaps(candidate, existing);
    if (gaps.x < minimumGap && gaps.y < minimumGap) return true;
  }
  return false;
}

function getPlacementOrder(
  plan: GenerationPlan,
  style: SpatialLayoutStyle,
  degrees: ReadonlyMap<string, number>,
): RoomNode[] {
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const mainPath = plan.mainPathRoomIds ?? [];
  const used = new Set<string>();
  const order: RoomNode[] = [];
  const add = (roomId: string | undefined): void => {
    const room = roomId ? roomsById.get(roomId) : undefined;
    if (!room || used.has(room.id)) return;
    used.add(room.id);
    order.push(room);
  };

  if (style === "central-hub") add(chooseHubRoom(plan, degrees).id);
  add(plan.entryRoomId);
  if (style === "ring" || style === "axis-branches") {
    mainPath.forEach(add);
  } else {
    const importantRooms = plan.rooms
      .filter((room) => room.roomRole === "objective" || room.roomRole === "boss")
      .sort((first, second) => second.importance - first.importance || first.id.localeCompare(second.id));
    importantRooms.forEach((room) => add(room.id));
    mainPath.forEach(add);
  }
  [...plan.rooms]
    .filter((room) => !used.has(room.id))
    .sort((first, second) => (
      Number(second.isRequired) - Number(first.isRequired)
      || second.importance - first.importance
      || (degrees.get(second.id) ?? 0) - (degrees.get(first.id) ?? 0)
      || second.width * second.height - first.width * first.height
      || first.id.localeCompare(second.id)
    ))
    .forEach((room) => add(room.id));
  return order;
}

function getIdealConnectionDistance(
  first: RoomNode,
  second: RoomNode,
  pair: RoomPair,
  gap: number,
  corridorWidth: number,
): number {
  const effectiveGap = Math.max(gap, pair.connectionWidth - 1);
  return (
    (getRoomDiagonal(first) + getRoomDiagonal(second)) / 2
    + effectiveGap
    + getConnectionSpacingWidth(pair, corridorWidth)
  );
}

function scoreCandidate(
  room: RoomNode,
  candidate: RoomRectangle,
  variant: RoomVariant,
  target: Point,
  sectorCenter: Point | undefined,
  existingBounds: PlacementBounds | undefined,
  relatedPlacements: readonly PlacementScoringRelation[],
  baseGap: number,
  corridorWidth: number,
  maximumConnectionDistance: number,
  random: () => number,
): number {
  const center = { x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 };
  let score = Math.hypot(center.x - target.x, center.y - target.y) * 1.4;
  if (sectorCenter) score += Math.hypot(center.x - sectorCenter.x, center.y - sectorCenter.y) * 0.2;
  let minX = candidate.x;
  let minY = candidate.y;
  let maxX = candidate.x + candidate.width;
  let maxY = candidate.y + candidate.height;
  if (existingBounds) {
    minX = Math.min(minX, existingBounds.minX);
    minY = Math.min(minY, existingBounds.minY);
    maxX = Math.max(maxX, existingBounds.maxX);
    maxY = Math.max(maxY, existingBounds.maxY);
  }
  for (const { placement, pair } of relatedPlacements) {
    const otherCenter = {
      x: placement.rectangle.x + placement.rectangle.width / 2,
      y: placement.rectangle.y + placement.rectangle.height / 2,
    };
    const distance = Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y);
    if (pair?.connected) {
      const idealDistance = getIdealConnectionDistance(
        room,
        placement.room,
        pair,
        baseGap,
        corridorWidth,
      );
      score += Math.abs(distance - idealDistance) * 0.38;
      if (distance > maximumConnectionDistance) {
        score += (distance - maximumConnectionDistance) * 4;
      }
    } else if (pair?.sameSector) {
      score += Math.max(0, distance - maximumConnectionDistance * 0.35) * 0.06;
    }
  }
  const currentBoundsArea = (maxX - minX) * (maxY - minY);
  score += currentBoundsArea * 0.008;
  if (variant.resized) score += (room.width * room.height - variant.width * variant.height) * 0.08;
  if (variant.rotated) score += 0.05;
  return score + random() * 0.02;
}

function buildPlacementAttempt(
  plan: GenerationPlan,
  style: SpatialLayoutStyle,
  targetCenters: ReadonlyMap<string, Point>,
  sectorCenters: ReadonlyMap<string, Point>,
  pairByKey: ReadonlyMap<string, RoomPair>,
  baseGap: number,
  maximumConnectionDistance: number,
  importantRoomClearance: number,
  allowRotation: boolean,
  allowResize: boolean,
  random: () => number,
): PlacementAttemptResult {
  const corridorWidth = plan.generation.parameters.corridorWidth;
  const degrees = getRoomDegrees(plan);
  const order = getPlacementOrder(plan, style, degrees);
  const placements: RoomPlacement[] = [];
  const failedRoomIds: string[] = [];
  const sectorCenterByRoomId = new Map<string, Point>();
  for (const sector of plan.sectors) {
    const center = sectorCenters.get(sector.id);
    if (center) sector.roomIds.forEach((roomId) => sectorCenterByRoomId.set(roomId, center));
  }
  const groupCenters = [...sectorCenters.entries()];
  if (plan.sectors.length === 0 && groupCenters.length > 0) {
    const groups = getClusterGroups(plan);
    groups.forEach((group, index) => {
      const center = sectorCenters.get(group.id);
      if (center) group.roomIds.forEach((roomId) => sectorCenterByRoomId.set(roomId, center));
      else if (groupCenters[index]) {
        group.roomIds.forEach((roomId) => sectorCenterByRoomId.set(roomId, groupCenters[index][1]));
      }
    });
  }

  for (const room of order) {
    const variants = createRoomVariants(room, allowRotation, allowResize);
    let existingBounds: PlacementBounds | undefined;
    const conflictChecks: PlacementConflictCheck[] = [];
    const relatedPlacements: PlacementScoringRelation[] = [];
    for (const placement of placements) {
      const { rectangle } = placement;
      if (existingBounds) {
        existingBounds.minX = Math.min(existingBounds.minX, rectangle.x);
        existingBounds.minY = Math.min(existingBounds.minY, rectangle.y);
        existingBounds.maxX = Math.max(existingBounds.maxX, rectangle.x + rectangle.width);
        existingBounds.maxY = Math.max(existingBounds.maxY, rectangle.y + rectangle.height);
      } else {
        existingBounds = {
          minX: rectangle.x,
          minY: rectangle.y,
          maxX: rectangle.x + rectangle.width,
          maxY: rectangle.y + rectangle.height,
        };
      }

      const pair = pairByKey.get(pairKey(room.id, placement.room.id));
      conflictChecks.push({
        placement,
        minimumGap: getEffectiveMinimumGap(
          room,
          placement.room,
          pair,
          baseGap,
          corridorWidth,
          importantRoomClearance,
        ),
      });
      if (pair?.connected || pair?.sameSector) relatedPlacements.push({ placement, pair });
    }
    let bestPlacement: RoomPlacement | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    const placementStep = plan.width * plan.height <= 160 * 120
      ? 1
      : Math.max(1, Math.ceil(Math.sqrt(
        plan.width * plan.height / MAX_PLACEMENT_SEARCH_POINTS,
      )));
    const target = targetCenters.get(room.id) ?? { x: plan.width / 2, y: plan.height / 2 };
    for (const variant of variants) {
      const maxX = plan.width - variant.width - 1;
      const maxY = plan.height - variant.height - 1;
      if (maxX < 1 || maxY < 1) continue;
      const targetX = clamp(Math.round(target.x - variant.width / 2), 1, maxX);
      const targetY = clamp(Math.round(target.y - variant.height / 2), 1, maxY);
      const targetOffset = Math.max(
        Math.abs(targetX + variant.width / 2 - target.x),
        Math.abs(targetY + variant.height / 2 - target.y),
      );
      const maxRadius = Math.max(
        targetX - 1,
        maxX - targetX,
        targetY - 1,
        maxY - targetY,
      );
      const maxRing = Math.ceil(maxRadius / placementStep);
      const visited = new Set<number>();
      let variantBestPlacement: RoomPlacement | undefined;
      let variantBestScore = Number.POSITIVE_INFINITY;
      const evaluateCandidate = (x: number, y: number): void => {
        const candidateX = clamp(x, 1, maxX);
        const candidateY = clamp(y, 1, maxY);
        const candidateIndex = candidateY * (maxX + 1) + candidateX;
        if (visited.has(candidateIndex)) return;
        visited.add(candidateIndex);
        const rectangle = {
          x: candidateX,
          y: candidateY,
          width: variant.width,
          height: variant.height,
        };
        if (doesPlacementConflict(rectangle, conflictChecks)) return;
        const score = scoreCandidate(
          room,
          rectangle,
          variant,
          target,
          sectorCenterByRoomId.get(room.id),
          existingBounds,
          relatedPlacements,
          baseGap,
          corridorWidth,
          maximumConnectionDistance,
          random,
        );
        if (score < variantBestScore) {
          variantBestScore = score;
          variantBestPlacement = { room, rectangle, variant };
        }
        if (score < bestScore) {
          bestScore = score;
          bestPlacement = { room, rectangle, variant };
        }
      };

      if (placementStep === 1) {
        for (let radius = 0; radius <= maxRadius; radius += 1) {
          const minY = Math.max(1, targetY - radius);
          const maxRingY = Math.min(maxY, targetY + radius);
          const minX = Math.max(1, targetX - radius);
          const maxRingX = Math.min(maxX, targetX + radius);
          for (let y = minY; y <= maxRingY; y += 1) {
            for (let x = minX; x <= maxRingX; x += 1) {
              if (Math.max(Math.abs(x - targetX), Math.abs(y - targetY)) !== radius) continue;
              evaluateCandidate(x, y);
            }
          }
          if (bestPlacement && 1.4 * Math.max(0, radius + 1 - targetOffset) >= bestScore) break;
        }
      } else {
        for (let ring = 0; ring <= maxRing; ring += 1) {
          const radius = ring * placementStep;
          for (let offset = -radius; offset <= radius; offset += placementStep) {
            evaluateCandidate(targetX - radius, targetY + offset);
            evaluateCandidate(targetX + radius, targetY + offset);
            if (offset !== -radius && offset !== radius) {
              evaluateCandidate(targetX + offset, targetY - radius);
              evaluateCandidate(targetX + offset, targetY + radius);
            }
          }
          if (
            variantBestPlacement
            && 1.4 * Math.max(0, radius + placementStep - targetOffset) >= variantBestScore
          ) break;
        }
      }

      if (variantBestPlacement && placementStep > 1) {
        const coarsePlacement = variantBestPlacement.rectangle;
        for (
          let y = Math.max(1, coarsePlacement.y - placementStep);
          y <= Math.min(maxY, coarsePlacement.y + placementStep);
          y += 1
        ) {
          for (
            let x = Math.max(1, coarsePlacement.x - placementStep);
            x <= Math.min(maxX, coarsePlacement.x + placementStep);
            x += 1
          ) {
            evaluateCandidate(x, y);
          }
        }
      }
      if (variantBestScore < bestScore) {
        bestScore = variantBestScore;
        bestPlacement = variantBestPlacement;
      }
    }
    if (!bestPlacement) {
      failedRoomIds.push(room.id);
      break;
    }
    placements.push(bestPlacement);
  }

  if (failedRoomIds.length > 0) {
    const failedIndex = order.findIndex((room) => room.id === failedRoomIds[0]);
    failedRoomIds.push(...order.slice(failedIndex + 1).map((room) => room.id));
  }
  return { placements, failedRoomIds, minimumRoomGap: baseGap };
}

function makePlannedRooms(placements: readonly RoomPlacement[]): RoomNode[] {
  return placements.map(({ room, rectangle, variant }) => {
    const metadata = Object.fromEntries(
      Object.entries(room.metadata).filter(([key]) => (
        key !== "layoutRotation" && key !== "layoutResizedFrom"
      )),
    );
    return {
      ...room,
      width: variant.width,
      height: variant.height,
      position: { x: rectangle.x, y: rectangle.y },
      footprint: variant.footprint,
      metadata: {
        ...metadata,
        ...(variant.rotated ? { layoutRotation: 90 } : {}),
        ...(variant.resized ? { layoutResizedFrom: { width: room.width, height: room.height } } : {}),
      },
    };
  });
}

function getMinimumGap(rooms: readonly RoomNode[]): number {
  let minimumGap = Number.POSITIVE_INFINITY;
  for (let firstIndex = 0; firstIndex < rooms.length; firstIndex += 1) {
    const first = rooms[firstIndex];
    const firstRect = { ...first.position, width: first.width, height: first.height };
    for (let secondIndex = firstIndex + 1; secondIndex < rooms.length; secondIndex += 1) {
      const second = rooms[secondIndex];
      const secondRect = { ...second.position, width: second.width, height: second.height };
      const gaps = getRectangleGaps(firstRect, secondRect);
      minimumGap = Math.min(minimumGap, Math.max(gaps.x, gaps.y));
    }
  }
  return Number.isFinite(minimumGap) ? minimumGap : 0;
}

function getSpatialLayoutMetrics(
  plan: GenerationPlan,
  style: SpatialLayoutStyle,
  targetCenters: ReadonlyMap<string, Point>,
  maximumConnectionDistance: number,
  pairs: readonly RoomPair[],
): SpatialLayoutMetadata["metrics"] {
  const rooms = plan.rooms;
  const totalRoomArea = rooms.reduce((total, room) => total + room.width * room.height, 0);
  const minX = Math.min(...rooms.map((room) => room.position.x));
  const minY = Math.min(...rooms.map((room) => room.position.y));
  const maxX = Math.max(...rooms.map((room) => room.position.x + room.width));
  const maxY = Math.max(...rooms.map((room) => room.position.y + room.height));
  const layoutBoundsArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const mapArea = plan.width * plan.height;
  const spatialCoverage = layoutBoundsArea / mapArea;
  const connectedPairs = pairs.filter((pair) => pair.connected);
  const connectionDistances = connectedPairs.map((pair) => {
    const first = rooms.find((room) => room.id === pair.first.id)!;
    const second = rooms.find((room) => room.id === pair.second.id)!;
    return Math.hypot(
      first.position.x + first.width / 2 - second.position.x - second.width / 2,
      first.position.y + first.height / 2 - second.position.y - second.height / 2,
    );
  });
  const withinLimit = connectionDistances.filter((distance) => distance <= maximumConnectionDistance).length;
  const gaps: number[] = [];
  for (let firstIndex = 0; firstIndex < rooms.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < rooms.length; secondIndex += 1) {
      const first = rooms[firstIndex];
      const second = rooms[secondIndex];
      const rectangleGaps = getRectangleGaps(
        { ...first.position, width: first.width, height: first.height },
        { ...second.position, width: second.width, height: second.height },
      );
      gaps.push(rectangleGaps.x + rectangleGaps.y);
    }
  }
  const targetFit = rooms.length === 0
    ? 1
    : rooms.reduce((total, room) => {
      const target = targetCenters.get(room.id) ?? { x: plan.width / 2, y: plan.height / 2 };
      const actual = { x: room.position.x + room.width / 2, y: room.position.y + room.height / 2 };
      return total + Math.hypot(actual.x - target.x, actual.y - target.y);
    }, 0) / rooms.length;
  const targetCoverageByStyle: Record<SpatialLayoutStyle, number> = {
    "axis-branches": 0.42,
    "central-hub": 0.34,
    ring: 0.4,
    clusters: 0.3,
  };
  const roomGroups = plan.sectors.length > 0
    ? plan.sectors.map((sector) => ({ roomIds: sector.roomIds }))
    : style === "clusters"
      ? getClusterGroups(plan)
      : [];
  const sectorRoomGroups = roomGroups
    .map((group) => group.roomIds.map((roomId) => rooms.find((room) => room.id === roomId))
      .filter((room): room is RoomNode => Boolean(room)))
    .filter((group) => group.length > 1);
  const sectorCenterDistances = sectorRoomGroups.flatMap((group) => {
    const center = {
      x: group.reduce((total, room) => total + room.position.x + room.width / 2, 0) / group.length,
      y: group.reduce((total, room) => total + room.position.y + room.height / 2, 0) / group.length,
    };
    return group.map((room) => Math.hypot(room.position.x + room.width / 2 - center.x, room.position.y + room.height / 2 - center.y));
  });
  const diagonal = Math.hypot(plan.width, plan.height);
  const distanceCoherence = connectionDistances.length === 0
    ? 1
    : clamp(1 - connectionDistances.reduce((total, distance) => total + distance, 0)
      / connectionDistances.length / Math.max(1, maximumConnectionDistance * 1.5), 0, 1);
  const sectorCompactness = sectorCenterDistances.length === 0
    ? 1
    : clamp(1 - sectorCenterDistances.reduce((total, distance) => total + distance, 0)
      / sectorCenterDistances.length / Math.max(1, diagonal * 0.35), 0, 1);
  const score: SpatialLayoutScore = {
    overlapAvoidance: 1,
    distanceCoherence,
    compactness: clamp(1 - Math.abs(totalRoomArea / layoutBoundsArea - 0.32), 0, 1),
    spatialDistribution: clamp(1 - Math.abs(spatialCoverage - targetCoverageByStyle[style]), 0, 1),
    topologyPreservation: connectedPairs.length === 0 ? 1 : withinLimit / connectedPairs.length,
    styleFit: clamp(1 - targetFit / Math.max(1, diagonal * 0.28), 0, 1),
    corridorClearance: connectedPairs.length === 0
      ? 1
      : connectedPairs.filter((pair) => {
        const first = rooms.find((room) => room.id === pair.first.id)!;
        const second = rooms.find((room) => room.id === pair.second.id)!;
        const rectangleGaps = getRectangleGaps(
          { ...first.position, width: first.width, height: first.height },
          { ...second.position, width: second.width, height: second.height },
        );
        return rectangleGaps.x + rectangleGaps.y >= Math.max(0, plan.generation.parameters.corridorWidth - 1);
      }).length / connectedPairs.length,
    sectorGrouping: sectorCompactness,
    total: 0,
  };
  score.total = (
    score.overlapAvoidance * 0.2
    + score.distanceCoherence * 0.16
    + score.compactness * 0.08
    + score.spatialDistribution * 0.12
    + score.topologyPreservation * 0.18
    + score.styleFit * 0.12
    + score.corridorClearance * 0.08
    + score.sectorGrouping * 0.06
  );
  return {
    roomCount: rooms.length,
    totalRoomArea,
    mapArea,
    roomAreaUtilization: totalRoomArea / mapArea,
    layoutBoundsArea,
    boundsUtilization: totalRoomArea / layoutBoundsArea,
    spatialCoverage,
    minimumRoomGap: getMinimumGap(rooms),
    averageRoomGap: gaps.length > 0 ? gaps.reduce((total, gap) => total + gap, 0) / gaps.length : 0,
    averageConnectionDistance: connectionDistances.length > 0
      ? connectionDistances.reduce((total, distance) => total + distance, 0) / connectionDistances.length
      : 0,
    maxConnectionDistance: connectionDistances.length > 0 ? Math.max(...connectionDistances) : 0,
    connectedPairCount: connectedPairs.length,
    connectionsWithinDistanceLimit: withinLimit,
    sectorCompactness,
    score,
  };
}

function getDistanceLimitViolations(
  plan: GenerationPlan,
  maximumConnectionDistance: number,
): { connectionIds: string[]; roomIds: string[] } {
  const roomsById = new Map(plan.rooms.map((room) => [room.id, room]));
  const connectionIds: string[] = [];
  const roomIds = new Set<string>();
  for (const edge of plan.connections) {
    const source = roomsById.get(edge.sourceRoomId);
    const target = roomsById.get(edge.targetRoomId);
    if (!source || !target) continue;
    if (source.floorId !== target.floorId && edge.connectionType === "vertical") continue;
    const distance = Math.hypot(
      source.position.x + source.width / 2 - target.position.x - target.width / 2,
      source.position.y + source.height / 2 - target.position.y - target.height / 2,
    );
    if (distance > maximumConnectionDistance) {
      connectionIds.push(edge.id);
      roomIds.add(source.id);
      roomIds.add(target.id);
    }
  }
  return { connectionIds, roomIds: [...roomIds] };
}

function createGapAttempts(
  requestedGap: number,
  corridorWidth: number,
  maxLayoutAttempts: number,
): number[] {
  const minimumConnectedGap = Math.max(0, corridorWidth - 1);
  const gaps = [
    requestedGap,
    Math.min(requestedGap, minimumConnectedGap),
    0,
  ];
  while (gaps.length < maxLayoutAttempts) gaps.push(0);
  return gaps.slice(0, maxLayoutAttempts);
}

function validateInputPlan(plan: GenerationPlan): void {
  if (!isSupportedDungeonDimensions(plan.width, plan.height)) {
    throw new SpatialLayoutError(
      "invalid-plan",
      "The GenerationPlan dimensions exceed the supported per-axis or total-tile limits.",
    );
  }
  if (plan.topology?.geometryStatus !== "unrouted") {
    throw new SpatialLayoutError(
      "routed-plan",
      "Spatial layout can only reposition a topology plan before connection paths are routed.",
    );
  }
  const topologyValidation = validateDungeonTopology(plan);
  if (!topologyValidation.valid) {
    throw new SpatialLayoutError(
      "invalid-topology",
      "The GenerationPlan topology must be valid before spatial layout.",
      topologyValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      topologyValidation.connectivity.physical.unreachableRoomIds,
    );
  }
  for (const room of plan.rooms) {
    if (
      !Number.isSafeInteger(room.width)
      || !Number.isSafeInteger(room.height)
      || room.width < 2
      || room.height < 2
      || room.footprint.length === 0
      || room.footprint.some((cell) => (
        !Number.isSafeInteger(cell.x)
        || !Number.isSafeInteger(cell.y)
        || cell.x < 0
        || cell.y < 0
        || cell.x >= room.width
        || cell.y >= room.height
      ))
    ) {
      throw new SpatialLayoutError(
        "invalid-plan",
        `Room ${room.id} has invalid dimensions or a footprint outside its local bounds.`,
        [],
        [room.id],
      );
    }
  }
}

export function generateGenerationSpatialLayout(
  sourcePlan: GenerationPlan,
  options: SpatialLayoutOptions = {},
): GenerationPlan {
  validateInputPlan(sourcePlan);
  const validatedOptions = validateOptions(sourcePlan, options);
  const style = resolveStyle(sourcePlan, options.style);
  const random = createGenerationRandomStreams(sourcePlan.generation.seed).placement;
  const pairs = getRoomPairs(sourcePlan);
  const pairByKey = new Map(pairs.map((pair) => [pairKey(pair.first.id, pair.second.id), pair]));
  const { targets: styleTargets, sectorCenters } = getStyleTargets(sourcePlan, style, random);
  const corridorWidth = sourcePlan.generation.parameters.corridorWidth;
  const gapAttempts = createGapAttempts(
    validatedOptions.minimumRoomGap,
    corridorWidth,
    validatedOptions.maxLayoutAttempts,
  );
  let attemptResult: PlacementAttemptResult | undefined;
  let attemptsUsed = 0;

  for (const [attemptIndex, minimumRoomGap] of gapAttempts.entries()) {
    attemptsUsed = attemptIndex + 1;
    const attemptTargets = relaxTargets(
      sourcePlan,
      pairs,
      styleTargets,
      minimumRoomGap,
      corridorWidth,
      validatedOptions.maxIterations,
    );
    const allowResize = validatedOptions.allowRoomResize && attemptIndex >= 2;
    attemptResult = buildPlacementAttempt(
      sourcePlan,
      style,
      attemptTargets,
      sectorCenters,
      pairByKey,
      minimumRoomGap,
      validatedOptions.maximumConnectionDistance,
      validatedOptions.importantRoomClearance,
      validatedOptions.allowRoomRotation,
      allowResize,
      random,
    );
    if (attemptResult.failedRoomIds.length === 0) break;
  }

  if (!attemptResult || attemptResult.failedRoomIds.length > 0) {
    throw new SpatialLayoutError(
      "layout-failed",
      "Could not position every room within the dungeon bounds after bounded fallback attempts.",
      [
        `Attempted minimum room gaps: ${gapAttempts.join(", ")}.`,
        ...(attemptResult ? [`Placed ${attemptResult.placements.length} of ${sourcePlan.rooms.length} rooms.`] : []),
      ],
      attemptResult?.failedRoomIds ?? sourcePlan.rooms.map((room) => room.id),
    );
  }

  const placedRooms = makePlannedRooms(attemptResult.placements);
  const arrangedPlan: GenerationPlan = {
    ...sourcePlan,
    rooms: placedRooms,
  };
  const distanceLimitViolations = getDistanceLimitViolations(
    arrangedPlan,
    validatedOptions.maximumConnectionDistance,
  );
  if (distanceLimitViolations.connectionIds.length > 0) {
    throw new SpatialLayoutError(
      "layout-failed",
      "Could not keep every connected room pair within maximumConnectionDistance.",
      [`Maximum connection distance: ${validatedOptions.maximumConnectionDistance}.`],
      distanceLimitViolations.roomIds,
      distanceLimitViolations.connectionIds,
    );
  }

  const metrics = getSpatialLayoutMetrics(
    arrangedPlan,
    style,
    styleTargets,
    validatedOptions.maximumConnectionDistance,
    pairs,
  );
  const rotatedRoomIds = attemptResult.placements
    .filter((placement) => placement.variant.rotated)
    .map((placement) => placement.room.id);
  const resizedRoomIds = attemptResult.placements
    .filter((placement) => placement.variant.resized)
    .map((placement) => placement.room.id);
  const spatialLayout: SpatialLayoutMetadata = {
    version: "layout-v1",
    style,
    metrics,
    attempts: attemptsUsed,
    minimumRoomGap: attemptResult.minimumRoomGap,
    fallbackUsed: attemptResult.minimumRoomGap !== validatedOptions.minimumRoomGap || resizedRoomIds.length > 0,
    rotatedRoomIds,
    resizedRoomIds,
    distanceLimitViolations: [],
  };
  const result: GenerationPlan = { ...arrangedPlan, spatialLayout };
  const structuralValidation = validateGenerationPlan(result);
  if (!structuralValidation.valid) {
    throw new SpatialLayoutError(
      "invalid-plan",
      "Spatial layout produced a structurally invalid GenerationPlan.",
      structuralValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    );
  }
  return result;
}
