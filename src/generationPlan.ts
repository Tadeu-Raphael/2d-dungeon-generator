import type {
  DungeonGenerationMetadata,
  LiquidFeature,
  LiquidType,
  RoomGenerationBounds,
  RoomShape,
  TrapType,
} from "./dungeon";
import type { DungeonTreasure } from "./treasures";
import type { RoomTypeCategory, RoomTypeDefinition } from "./roomTypes";

export interface GridPosition {
  x: number;
  y: number;
}

export type RoomRole =
  | "entrance"
  | "main"
  | "objective"
  | "boss"
  | "secondary"
  | "connector"
  | "secret"
  | "optional";

export type TopologyStyle =
  | "linear"
  | "branching"
  | "circuit"
  | "centralized"
  | "sectorized"
  | "hybrid";

export interface TopologyParameters {
  branchCount: number;
  additionalConnectionCount: number;
  deadEndProbability: number;
  cycleCount: number;
  optionalPathCount: number;
  sectorCount: number;
  lockedConnectionCount: number;
  secretConnectionCount: number;
  blockedConnectionCount: number;
}

export interface TopologyBranch {
  id: string;
  anchorRoomId: string;
  roomIds: readonly string[];
  connectionIds: readonly string[];
  isOptional: boolean;
  isDeadEnd: boolean;
}

export interface GenerationTopologyMetadata {
  version: "topology-v1";
  style: TopologyStyle;
  profile?: string;
  geometryStatus: "unrouted" | "routed";
  branchPaths: readonly TopologyBranch[];
  cycleConnectionIds: readonly string[];
  parameters: TopologyParameters;
}

export type SpatialLayoutStyle = "axis-branches" | "central-hub" | "ring" | "clusters";

export interface SpatialLayoutScore {
  overlapAvoidance: number;
  distanceCoherence: number;
  compactness: number;
  spatialDistribution: number;
  topologyPreservation: number;
  styleFit: number;
  corridorClearance: number;
  sectorGrouping: number;
  total: number;
}

export interface SpatialLayoutMetrics {
  roomCount: number;
  totalRoomArea: number;
  mapArea: number;
  roomAreaUtilization: number;
  layoutBoundsArea: number;
  boundsUtilization: number;
  spatialCoverage: number;
  minimumRoomGap: number;
  averageRoomGap: number;
  averageConnectionDistance: number;
  maxConnectionDistance: number;
  connectedPairCount: number;
  connectionsWithinDistanceLimit: number;
  sectorCompactness: number;
  score: SpatialLayoutScore;
}

export interface SpatialLayoutMetadata {
  version: "layout-v1";
  style: SpatialLayoutStyle;
  metrics: SpatialLayoutMetrics;
  attempts: number;
  minimumRoomGap: number;
  fallbackUsed: boolean;
  rotatedRoomIds: readonly string[];
  resizedRoomIds: readonly string[];
  distanceLimitViolations: readonly string[];
}

export type ConnectionType =
  | "corridor"
  | "open-passage"
  | "door"
  | "secret-door"
  | "blocked-passage"
  | "vertical";

export type CorridorRouteStyle = "straight" | "angular" | "sinuous" | "transition";

export type ConnectionOrientation = "north" | "east" | "south" | "west";

export interface ConnectionEndpointGeometry {
  roomId: string;
  position: GridPosition;
  roomPosition: GridPosition;
  orientation: ConnectionOrientation;
  width: number;
  openingPositions: readonly GridPosition[];
  wallPositions: readonly GridPosition[];
}

export type SectorType =
  | "residential"
  | "military"
  | "ritualistic"
  | "industrial"
  | "subterranean"
  | "central"
  | "custom";

export interface RoomNodeMetadata extends Readonly<Record<string, unknown>> {
  roomTypeDefinition?: RoomTypeDefinition;
  generationBounds?: RoomGenerationBounds;
  rotationAllowed?: boolean;
  liquidFeature?: LiquidFeature;
  liquidType?: LiquidType;
  treasures?: readonly DungeonTreasure[];
}

export interface RoomNode {
  id: string;
  roomType: RoomTypeCategory;
  roomRole: RoomRole;
  width: number;
  height: number;
  position: GridPosition;
  shape: RoomShape;
  footprint: readonly GridPosition[];
  sectorId?: string;
  floorId: string;
  importance: number;
  isRequired: boolean;
  metadata: RoomNodeMetadata;
}

export interface ConnectionEdgeMetadata extends Readonly<Record<string, unknown>> {
  allowParallel?: boolean;
  accessRequirements?: readonly string[];
  lockId?: string;
  widthIsFixed?: boolean;
  requestedWidth?: number;
  routeStyle?: CorridorRouteStyle;
  sourceEndpoint?: ConnectionEndpointGeometry;
  targetEndpoint?: ConnectionEndpointGeometry;
  intersectionIds?: readonly string[];
}

export interface ConnectionEdge {
  id: string;
  sourceRoomId: string;
  targetRoomId: string;
  connectionType: ConnectionType;
  width: number;
  path: readonly GridPosition[];
  isSecret: boolean;
  isLocked: boolean;
  isBlocked: boolean;
  isOptional: boolean;
  isMainPath: boolean;
  metadata: ConnectionEdgeMetadata;
}

export interface DungeonSector {
  id: string;
  name: string;
  roomIds: readonly string[];
  sectorType: SectorType;
  metadata: Readonly<Record<string, unknown>>;
}

export interface PlanIntersection {
  id: string;
  position: GridPosition;
  width: number;
  connectionIds: readonly string[];
  kind?: "t-junction" | "cross" | "merge" | "vestibule";
  metadata: Readonly<Record<string, unknown>>;
}

export interface CorridorRoutingMetadata {
  version: "corridor-routing-v1";
  routedConnectionCount: number;
  totalPathLength: number;
  sharedPathCellCount: number;
  junctionCount: number;
  vestibuleCount: number;
  doorCount: number;
}

export type PlanTransitionType =
  | "doorway"
  | "secret-door"
  | "stairs-up"
  | "stairs-down"
  | "room-stairs"
  | "vertical-connection"
  | "exterior-entrance"
  | "exterior-connection"
  | "cave-breach";

export interface PlanTransition {
  id: string;
  type: PlanTransitionType;
  position: GridPosition;
  roomId?: string;
  regionId?: string;
  connectionId?: string;
  verticalConnectionId?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface NaturalRegionRowSpan {
  y: number;
  xStart: number;
  xEnd: number;
}

export interface NaturalRegion {
  id: string;
  type: "cavern";
  rowSpans: readonly NaturalRegionRowSpan[];
  metadata: Readonly<Record<string, unknown>>;
}

export interface CaveConnectionTarget {
  type: "room" | "connection";
  id: string;
  position: GridPosition;
}

export interface CaveConnection {
  id: string;
  regionId: string;
  target: CaveConnectionTarget;
  path: readonly GridPosition[];
  metadata: Readonly<Record<string, unknown>>;
}

export type GenerationPlanMode = "rooms" | "natural-cavern";

export type PlanFeature =
  | {
    id: string;
    type: "trap";
    trapType: TrapType;
    position: GridPosition;
    roomId?: string;
    metadata: Readonly<Record<string, unknown>>;
  }
  | {
    id: string;
    type: "water" | "lava" | "pillar";
    position: GridPosition;
    roomId?: string;
    metadata: Readonly<Record<string, unknown>>;
  };

export interface GenerationPlan {
  id: string;
  width: number;
  height: number;
  generation: DungeonGenerationMetadata;
  rooms: readonly RoomNode[];
  connections: readonly ConnectionEdge[];
  sectors: readonly DungeonSector[];
  entryRoomId?: string;
  exitRoomId?: string;
  objectiveRoomId?: string;
  mainPathRoomIds?: readonly string[];
  topology?: GenerationTopologyMetadata;
  spatialLayout?: SpatialLayoutMetadata;
  corridorRouting?: CorridorRoutingMetadata;
  generationMode?: GenerationPlanMode;
  naturalRegions?: readonly NaturalRegion[];
  caveConnections?: readonly CaveConnection[];
  intersections: readonly PlanIntersection[];
  transitions: readonly PlanTransition[];
  features: readonly PlanFeature[];
  metadata: Readonly<Record<string, unknown>>;
}

export type GenerationEntityKind =
  | "level"
  | "room"
  | "connection"
  | "vertical-connection"
  | "branch"
  | "sector"
  | "intersection"
  | "transition"
  | "natural-region"
  | "cave-connection"
  | "feature";

export function createStableGenerationId(
  scopeId: string,
  entityKind: GenerationEntityKind,
  ordinal: number,
): string {
  const normalizedScopeId = scopeId.trim();
  if (!normalizedScopeId) {
    throw new RangeError("A stable ID scope is required to create entity IDs.");
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError("A stable entity ID ordinal must be a non-negative safe integer.");
  }
  return `${normalizedScopeId}:${entityKind}:${String(ordinal).padStart(4, "0")}`;
}
