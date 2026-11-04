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

export type ConnectionType =
  | "corridor"
  | "open-passage"
  | "door"
  | "secret-door"
  | "blocked-passage"
  | "vertical";

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
  metadata: Readonly<Record<string, unknown>>;
}

export type PlanTransitionType =
  | "doorway"
  | "secret-door"
  | "stairs-up"
  | "stairs-down"
  | "room-stairs"
  | "exterior-entrance"
  | "exterior-connection"
  | "cave-breach";

export interface PlanTransition {
  id: string;
  type: PlanTransitionType;
  position: GridPosition;
  roomId?: string;
  connectionId?: string;
  metadata: Readonly<Record<string, unknown>>;
}

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
  intersections: readonly PlanIntersection[];
  transitions: readonly PlanTransition[];
  features: readonly PlanFeature[];
  metadata: Readonly<Record<string, unknown>>;
}

export type GenerationEntityKind =
  | "room"
  | "connection"
  | "branch"
  | "sector"
  | "intersection"
  | "transition"
  | "feature";

export function createStableGenerationId(
  planId: string,
  entityKind: GenerationEntityKind,
  ordinal: number,
): string {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    throw new RangeError("A GenerationPlan ID is required to create stable entity IDs.");
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError("A stable entity ID ordinal must be a non-negative safe integer.");
  }
  return `${normalizedPlanId}:${entityKind}:${String(ordinal).padStart(4, "0")}`;
}
