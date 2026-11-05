import { createGenerationRandomStreams } from "./dungeon";
import type { DoorVariant, DungeonGenerationMetadata } from "./dungeon";
import { createRandom, deriveRandomSeed } from "./core/random";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type { DungeonConcept, DungeonConceptProfile } from "./dungeonProfiles";
import {
  createStableGenerationId,
} from "./generationPlan";
import type {
  ConnectionEdge,
  DungeonSector,
  GenerationPlan,
  RoomNode,
  SectorType,
  TopologyBranch,
  TopologyParameters,
  TopologyStyle,
} from "./generationPlan";

export interface TopologyGenerationOptions {
  style?: TopologyStyle;
  profile?: string;
  parameters?: Partial<TopologyParameters>;
}

export interface TopologyAccessOptions {
  unlockedLockIds?: ReadonlySet<string>;
  discoveredSecretConnectionIds?: ReadonlySet<string>;
  satisfiedRequirements?: ReadonlySet<string>;
}

export interface TopologyReachability {
  reachableRoomIds: string[];
  unreachableRoomIds: string[];
  componentCount: number;
  cycleRank: number;
}

export interface TopologyConnectivityReport {
  physical: TopologyReachability;
  playerAccess: TopologyReachability;
}

export type TopologyValidationIssueCode =
  | "topology-metadata-missing"
  | "entry-room-missing"
  | "objective-room-missing"
  | "main-path-missing"
  | "main-path-endpoints-invalid"
  | "main-path-room-missing"
  | "main-path-edge-missing"
  | "main-path-edge-unexpected"
  | "main-path-inaccessible"
  | "required-room-inaccessible"
  | "important-room-inaccessible"
  | "branch-anchor-invalid"
  | "branch-room-missing"
  | "branch-edge-missing"
  | "branch-inaccessible"
  | "cycle-edge-missing"
  | "connection-does-not-create-cycle"
  | "cycle-count-mismatch"
  | "secret-connection-invalid"
  | "physical-room-unreachable"
  | "sector-disconnected";

export interface TopologyValidationIssue {
  code: TopologyValidationIssueCode;
  path: string;
  message: string;
}

export interface TopologyValidationResult {
  valid: boolean;
  issues: TopologyValidationIssue[];
  connectivity: TopologyConnectivityReport;
}

export interface TopologyStatistics {
  roomCount: number;
  connectionCount: number;
  requiredRoomCount: number;
  mainPathLength: number;
  branchCount: number;
  deadEndCount: number;
  cycleRank: number;
  sectorCount: number;
  optionalConnectionCount: number;
  lockedConnectionCount: number;
  secretConnectionCount: number;
  blockedConnectionCount: number;
  physicallyReachableRoomCount: number;
  playerAccessibleRoomCount: number;
}

export const DEFAULT_TOPOLOGY_PARAMETERS: TopologyParameters = {
  branchCount: 2,
  additionalConnectionCount: 0,
  deadEndProbability: 0.75,
  cycleCount: 0,
  optionalPathCount: 1,
  sectorCount: 0,
  lockedConnectionCount: 0,
  secretConnectionCount: 0,
  blockedConnectionCount: 0,
};

// Defensive and civil architecture gates more passages than caves, mines and open ceremonial halls.
const DOOR_CONNECTION_RATIO_BY_PROFILE: Readonly<Record<string, number>> = {
  "military-fortress": 0.4,
  prison: 0.45,
  "arcane-laboratory": 0.3,
  catacombs: 0.3,
  "lost-civilization": 0.2,
  "ancient-temple": 0.2,
  "abandoned-mine": 0.1,
  "natural-cavern": 0,
};
const DEFAULT_DOOR_CONNECTION_RATIO = 0.2;

// Share of plain doors that are not ordinary wooden doors; the rest of each profile stays wood.
const DOOR_VARIANT_WEIGHTS_BY_PROFILE: Readonly<Record<string, Readonly<Partial<Record<DoorVariant, number>>>>> = {
  "military-fortress": { reinforced: 0.3, gate: 0.15, grate: 0.05, open: 0.05 },
  prison: { grate: 0.45, reinforced: 0.2 },
  "arcane-laboratory": { reinforced: 0.15, open: 0.15 },
  catacombs: { destroyed: 0.25, grate: 0.1, open: 0.1 },
  "lost-civilization": { destroyed: 0.3, open: 0.2, gate: 0.1 },
  "ancient-temple": { open: 0.3, gate: 0.1, destroyed: 0.1 },
  "abandoned-mine": { destroyed: 0.35, open: 0.25 },
};

function chooseDoorVariant(
  profileId: string | undefined,
  random: () => number,
): DoorVariant | undefined {
  const weights = profileId ? DOOR_VARIANT_WEIGHTS_BY_PROFILE[profileId] : undefined;
  if (!weights) return undefined;
  let roll = random();
  for (const [variant, weight] of Object.entries(weights) as Array<[DoorVariant, number]>) {
    if (roll < weight) return variant;
    roll -= weight;
  }
  return undefined;
}

function assignDoorVariants(
  connections: readonly ConnectionEdge[],
  seed: number,
  profileId: string | undefined,
): ConnectionEdge[] {
  const random = createRandom(deriveRandomSeed(seed, "door-variants"));
  return connections.map((edge) => {
    if (edge.connectionType !== "door" || edge.isSecret || edge.isBlocked || edge.isLocked) return edge;
    const variant = chooseDoorVariant(profileId, random);
    return variant ? { ...edge, metadata: { ...edge.metadata, doorVariant: variant } } : edge;
  });
}

const STYLE_DEFAULTS: Record<TopologyStyle, Partial<TopologyParameters>> = {
  linear: { branchCount: 1, deadEndProbability: 0.85 },
  branching: { branchCount: 3, deadEndProbability: 0.8 },
  circuit: { branchCount: 0, cycleCount: 2, deadEndProbability: 1 },
  centralized: { branchCount: 3, deadEndProbability: 0.85 },
  sectorized: { branchCount: 3, sectorCount: 3, deadEndProbability: 0.8 },
  hybrid: { branchCount: 3, cycleCount: 1, sectorCount: 2, deadEndProbability: 0.7 },
};

const SECTOR_TYPE_BY_PROFILE: Partial<Record<DungeonConcept, SectorType>> = {
  "military-fortress": "military",
  "ancient-temple": "ritualistic",
  catacombs: "subterranean",
  "abandoned-mine": "industrial",
  "arcane-laboratory": "ritualistic",
  "natural-cavern": "subterranean",
  prison: "military",
  "lost-civilization": "central",
};

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function addDefaultDoorConnections(
  connections: readonly ConnectionEdge[],
  random: () => number,
  profileId: string | undefined,
): ConnectionEdge[] {
  const doorRatio = (profileId ? DOOR_CONNECTION_RATIO_BY_PROFILE[profileId] : undefined)
    ?? DEFAULT_DOOR_CONNECTION_RATIO;
  const existingDoorCount = connections.filter((edge) => (
    edge.connectionType === "door" && !edge.isLocked && !edge.isSecret
  )).length;
  const eligibleConnections = connections.filter((edge) => (
    !edge.isBlocked
    && edge.connectionType === "corridor"
    && !edge.isSecret
    && !edge.isLocked
  ));
  const eligibleDoorCount = existingDoorCount + eligibleConnections.length;
  const targetDoorCount = eligibleDoorCount > 0 && doorRatio > 0
    ? Math.max(1, Math.ceil(eligibleDoorCount * doorRatio))
    : 0;
  const additionalDoorCount = Math.min(
    eligibleConnections.length,
    Math.max(0, targetDoorCount - existingDoorCount),
  );
  if (additionalDoorCount === 0) return connections.map((edge) => edge);

  const selectedDoorIds = new Set(
    shuffle(eligibleConnections, random)
      .slice(0, additionalDoorCount)
      .map((edge) => edge.id),
  );
  return connections.map((edge) => (
    selectedDoorIds.has(edge.id)
      ? { ...edge, connectionType: "door" }
      : edge
  ));
}

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function resolveTopologyParameters(
  style: TopologyStyle,
  profile: DungeonConceptProfile | undefined,
  options: TopologyGenerationOptions,
  roomCount: number,
): TopologyParameters {
  const parameters = {
    ...DEFAULT_TOPOLOGY_PARAMETERS,
    ...STYLE_DEFAULTS[style],
    ...profile?.topology.parameters,
    ...options.parameters,
  };
  for (const [name, value] of Object.entries(parameters)) {
    if (name === "deadEndProbability") {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError("deadEndProbability must be between 0 and 1.");
      }
    } else {
      assertCount(value, name);
    }
  }

  const sectorCount = Math.min(parameters.sectorCount, roomCount);
  const availableCycleCount = Math.max(0, roomCount * (roomCount - 1) / 2 - Math.max(0, roomCount - 1));
  const requestedCycleCount = parameters.cycleCount + parameters.additionalConnectionCount;
  const requestedAccessLinks = parameters.lockedConnectionCount
    + parameters.secretConnectionCount
    + parameters.blockedConnectionCount;
  const explicitlyRequestedAccessLinks = (options.parameters?.lockedConnectionCount ?? 0)
    + (options.parameters?.secretConnectionCount ?? 0)
    + (options.parameters?.blockedConnectionCount ?? 0);
  if (
    (options.parameters?.cycleCount !== undefined
      || options.parameters?.additionalConnectionCount !== undefined)
    && requestedCycleCount > availableCycleCount
  ) {
    throw new RangeError("The requested cycle count exceeds the number of possible room connections.");
  }
  if (explicitlyRequestedAccessLinks > availableCycleCount) {
    throw new RangeError("The requested locked, secret, and blocked connections exceed the available cycles.");
  }

  const targetExtraCount = Math.min(
    availableCycleCount,
    Math.max(requestedCycleCount, requestedAccessLinks),
  );
  let remainingAccessLinks = targetExtraCount;
  const secretConnectionCount = Math.min(parameters.secretConnectionCount, remainingAccessLinks);
  remainingAccessLinks -= secretConnectionCount;
  const lockedConnectionCount = Math.min(parameters.lockedConnectionCount, remainingAccessLinks);
  remainingAccessLinks -= lockedConnectionCount;
  const blockedConnectionCount = Math.min(parameters.blockedConnectionCount, remainingAccessLinks);

  return {
    ...parameters,
    branchCount: Math.min(parameters.branchCount, Math.max(0, roomCount - 2)),
    sectorCount,
    cycleCount: Math.min(parameters.cycleCount, targetExtraCount),
    additionalConnectionCount: Math.min(
      parameters.additionalConnectionCount,
      Math.max(0, targetExtraCount - Math.min(parameters.cycleCount, targetExtraCount)),
    ),
    secretConnectionCount,
    lockedConnectionCount,
    blockedConnectionCount,
  };
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function selectProfile(
  plan: GenerationPlan,
  options: TopologyGenerationOptions,
): { id: string | undefined; profile: DungeonConceptProfile | undefined } {
  const profileId = options.profile ?? plan.generation.profile;
  if (!profileId || !hasOwn(DUNGEON_CONCEPTS, profileId)) {
    return { id: profileId, profile: undefined };
  }
  const profile = DUNGEON_CONCEPTS[profileId as DungeonConcept];
  return { id: profile.id, profile };
}

interface SectorAssignment {
  sectors: DungeonSector[];
  roomSectorIds: Map<string, string>;
  groups: RoomNode[][];
}

function assignSectors(
  plan: GenerationPlan,
  rooms: readonly RoomNode[],
  sectorCount: number,
  entryRoomId: string,
  objectiveRoomId: string,
  profileId: string | undefined,
  random: () => number,
): SectorAssignment {
  if (sectorCount === 0) {
    return { sectors: [], roomSectorIds: new Map(), groups: [] };
  }

  const groups = Array.from({ length: sectorCount }, () => [] as RoomNode[]);
  const entryRoom = rooms.find((room) => room.id === entryRoomId);
  const objectiveRoom = rooms.find((room) => room.id === objectiveRoomId);
  if (entryRoom) groups[0].push(entryRoom);
  if (objectiveRoom && objectiveRoom.id !== entryRoomId) {
    groups[sectorCount - 1].push(objectiveRoom);
  }

  const assignedIds = new Set([entryRoomId, objectiveRoomId]);
  const remainingRooms = shuffle(
    rooms.filter((room) => !assignedIds.has(room.id)),
    random,
  );
  for (const room of remainingRooms) {
    let targetGroup = 0;
    for (let index = 1; index < groups.length; index += 1) {
      if (groups[index].length < groups[targetGroup].length) targetGroup = index;
    }
    groups[targetGroup].push(room);
  }

  const roomSectorIds = new Map<string, string>();
  const sectorType = profileId && hasOwn(SECTOR_TYPE_BY_PROFILE, profileId)
    ? SECTOR_TYPE_BY_PROFILE[profileId as DungeonConcept] ?? "custom"
    : "custom";
  const sectors = groups.map((group, index) => {
    const id = createStableGenerationId(plan.id, "sector", index);
    for (const room of group) roomSectorIds.set(room.id, id);
    return {
      id,
      name: `Setor ${index + 1}`,
      roomIds: group.map((room) => room.id),
      sectorType,
      metadata: { profile: profileId ?? "custom" },
    };
  });
  return { sectors, roomSectorIds, groups };
}

function validateSourceRooms(plan: GenerationPlan): void {
  if (plan.rooms.length === 0) {
    throw new RangeError("Topology generation requires at least one room.");
  }
  const roomIds = new Set<string>();
  for (const room of plan.rooms) {
    if (!room.id.trim() || roomIds.has(room.id)) {
      throw new RangeError("Topology generation requires unique, non-empty room IDs.");
    }
    if (
      !Number.isSafeInteger(room.width)
      || !Number.isSafeInteger(room.height)
      || room.width < 1
      || room.height < 1
      || !Number.isSafeInteger(room.position.x)
      || !Number.isSafeInteger(room.position.y)
      || room.footprint.length === 0
    ) {
      throw new RangeError(`Room ${room.id} must have valid dimensions and a supplied footprint.`);
    }
    roomIds.add(room.id);
  }
}

function validateEndpoints(
  plan: GenerationPlan,
  entryRoomId: string,
  objectiveRoomId: string,
): void {
  const roomIds = new Set(plan.rooms.map((room) => room.id));
  if (!roomIds.has(entryRoomId) || !roomIds.has(objectiveRoomId)) {
    throw new RangeError("Topology entry and objective IDs must reference rooms in the plan.");
  }
  if (plan.rooms.length > 1 && entryRoomId === objectiveRoomId) {
    throw new RangeError("The entry and objective must be different rooms when the plan has multiple rooms.");
  }
}

function partitionBranchRooms(
  rooms: readonly RoomNode[],
  branchCount: number,
): RoomNode[][] {
  if (rooms.length === 0 || branchCount === 0) return [];
  const count = Math.min(branchCount, rooms.length);
  const groups = Array.from({ length: count }, () => [] as RoomNode[]);
  rooms.forEach((room, index) => groups[index % count].push(room));
  return groups;
}

function makeRoomRoles(
  rooms: readonly RoomNode[],
  mainPathRoomIds: readonly string[],
  branchPaths: readonly TopologyBranch[],
  entryRoomId: string,
  objectiveRoomId: string,
  hubRoomId: string | undefined,
  sectorGatewayIds: ReadonlySet<string>,
  secretRoomIds: ReadonlySet<string>,
): RoomNode[] {
  const mainPath = new Set(mainPathRoomIds);
  const branchRoles = new Map<string, "optional" | "secondary">();
  for (const branch of branchPaths) {
    for (const roomId of branch.roomIds) {
      branchRoles.set(roomId, branch.isOptional ? "optional" : "secondary");
    }
  }
  return rooms.map((room) => {
    let roomRole: RoomNode["roomRole"] = branchRoles.get(room.id) ?? "secondary";
    if (secretRoomIds.has(room.id) && !mainPath.has(room.id)) {
      roomRole = "secret";
    } else if (room.id === entryRoomId) {
      roomRole = "entrance";
    } else if (room.id === objectiveRoomId) {
      roomRole = room.roomRole === "boss" ? "boss" : "objective";
    } else if (room.roomRole === "boss") {
      roomRole = "boss";
    } else if (mainPath.has(room.id)) {
      roomRole = room.id === hubRoomId
        ? "main"
        : sectorGatewayIds.has(room.id)
          ? "connector"
          : "main";
    }
    const isRequired = mainPath.has(room.id)
      || room.id === entryRoomId
      || room.id === objectiveRoomId;
    return {
      ...room,
      roomRole,
      isRequired,
    };
  });
}

function connectionPairKey(sourceRoomId: string, targetRoomId: string): string {
  return [sourceRoomId, targetRoomId].sort().join("|");
}

function analyzeReachability(
  plan: GenerationPlan,
  entryRoomId: string | undefined,
  includeConnection: (edge: ConnectionEdge) => boolean,
): TopologyReachability {
  const roomIds = plan.rooms.map((room) => room.id);
  const adjacency = new Map(roomIds.map((roomId) => [roomId, [] as string[]]));
  const edges = plan.connections.filter(includeConnection);
  for (const edge of edges) {
    adjacency.get(edge.sourceRoomId)?.push(edge.targetRoomId);
    adjacency.get(edge.targetRoomId)?.push(edge.sourceRoomId);
  }

  const reachable = new Set<string>();
  if (entryRoomId && adjacency.has(entryRoomId)) {
    const queue = [entryRoomId];
    reachable.add(entryRoomId);
    for (let head = 0; head < queue.length; head += 1) {
      const currentRoomId = queue[head];
      for (const neighbor of adjacency.get(currentRoomId) ?? []) {
        if (reachable.has(neighbor)) continue;
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const allVisited = new Set<string>();
  let componentCount = 0;
  for (const roomId of roomIds) {
    if (allVisited.has(roomId)) continue;
    componentCount += 1;
    const queue = [roomId];
    allVisited.add(roomId);
    for (let head = 0; head < queue.length; head += 1) {
      for (const neighbor of adjacency.get(queue[head]) ?? []) {
        if (allVisited.has(neighbor)) continue;
        allVisited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  const totalComponents = roomIds.length === 0 ? 0 : componentCount;
  return {
    reachableRoomIds: roomIds.filter((roomId) => reachable.has(roomId)),
    unreachableRoomIds: roomIds.filter((roomId) => !reachable.has(roomId)),
    componentCount: totalComponents,
    cycleRank: Math.max(0, edges.length - roomIds.length + totalComponents),
  };
}

export function isConnectionPlayerAccessible(
  edge: ConnectionEdge,
  options: TopologyAccessOptions,
): boolean {
  if (edge.isBlocked || edge.connectionType === "blocked-passage") return false;
  if (edge.isLocked && (!edge.metadata.lockId || !options.unlockedLockIds?.has(edge.metadata.lockId))) {
    return false;
  }
  if (
    (edge.isSecret || edge.connectionType === "secret-door")
    && !options.discoveredSecretConnectionIds?.has(edge.id)
  ) return false;
  return (edge.metadata.accessRequirements ?? []).every((requirement) => (
    options.satisfiedRequirements?.has(requirement) ?? false
  ));
}

export function analyzeTopologyConnectivity(
  plan: GenerationPlan,
  accessOptions: TopologyAccessOptions = {},
): TopologyConnectivityReport {
  return {
    physical: analyzeReachability(plan, plan.entryRoomId, () => true),
    playerAccess: analyzeReachability(
      plan,
      plan.entryRoomId,
      (edge) => isConnectionPlayerAccessible(edge, accessOptions),
    ),
  };
}

function roomsAreConnectedWithoutEdge(
  plan: GenerationPlan,
  edge: ConnectionEdge,
): boolean {
  const queue = [edge.sourceRoomId];
  const visited = new Set(queue);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === edge.targetRoomId) return true;
    for (const candidate of plan.connections) {
      if (candidate.id === edge.id) continue;
      const neighbor = candidate.sourceRoomId === current
        ? candidate.targetRoomId
        : candidate.targetRoomId === current
          ? candidate.sourceRoomId
          : undefined;
      if (!neighbor || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return false;
}

function edgeConnectsRooms(edge: ConnectionEdge, firstRoomId: string, secondRoomId: string): boolean {
  return (
    edge.sourceRoomId === firstRoomId && edge.targetRoomId === secondRoomId
  ) || (
    edge.sourceRoomId === secondRoomId && edge.targetRoomId === firstRoomId
  );
}

export function validateDungeonTopology(
  plan: GenerationPlan,
  accessOptions: TopologyAccessOptions = {},
): TopologyValidationResult {
  const issues: TopologyValidationIssue[] = [];
  const addIssue = (
    code: TopologyValidationIssueCode,
    path: string,
    message: string,
  ): void => {
    issues.push({ code, path, message });
  };
  const topology = plan.topology;
  const roomIds = new Set(plan.rooms.map((room) => room.id));
  const connectionsById = new Map(plan.connections.map((edge) => [edge.id, edge]));
  const connectivity = analyzeTopologyConnectivity(plan, accessOptions);
  const physicallyReachable = new Set(connectivity.physical.reachableRoomIds);
  const playerReachable = new Set(connectivity.playerAccess.reachableRoomIds);

  if (!topology) {
    addIssue("topology-metadata-missing", "topology", "The GenerationPlan has no topology metadata.");
  }
  if (!plan.entryRoomId || !roomIds.has(plan.entryRoomId)) {
    addIssue("entry-room-missing", "entryRoomId", "The topology needs a valid entry room.");
  }
  const objectiveRoomId = plan.objectiveRoomId ?? plan.exitRoomId;
  if (!objectiveRoomId || !roomIds.has(objectiveRoomId)) {
    addIssue("objective-room-missing", "objectiveRoomId", "The topology needs a valid objective or exit room.");
  }
  if (!plan.mainPathRoomIds || plan.mainPathRoomIds.length === 0) {
    addIssue("main-path-missing", "mainPathRoomIds", "The main path must be stored explicitly.");
  } else {
    const mainPath = plan.mainPathRoomIds;
    if (
      mainPath[0] !== plan.entryRoomId
      || mainPath[mainPath.length - 1] !== objectiveRoomId
    ) {
      addIssue(
        "main-path-endpoints-invalid",
        "mainPathRoomIds",
        "The main path must start at the entry and end at the objective or exit.",
      );
    }
    for (const roomId of mainPath) {
      if (!roomIds.has(roomId)) {
        addIssue(
          "main-path-room-missing",
          "mainPathRoomIds",
          `Main path room ${roomId} does not exist.`,
        );
      }
    }
    for (let index = 1; index < mainPath.length; index += 1) {
      const sourceRoomId = mainPath[index - 1];
      const targetRoomId = mainPath[index];
      const edge = plan.connections.find((candidate) => (
        candidate.isMainPath && edgeConnectsRooms(candidate, sourceRoomId, targetRoomId)
      ));
      if (!edge) {
        addIssue(
          "main-path-edge-missing",
          `mainPathRoomIds[${index}]`,
          `No main-path connection links ${sourceRoomId} to ${targetRoomId}.`,
        );
      } else if (!isConnectionPlayerAccessible(edge, accessOptions)) {
        addIssue(
          "main-path-inaccessible",
          `connections.${edge.id}`,
          "Blocked, locked, undiscovered-secret, or unmet access conditions interrupt the main path.",
        );
      }
    }
    const mainPathPairs = new Set(
      Array.from({ length: Math.max(0, mainPath.length - 1) }, (_, index) => (
        connectionPairKey(mainPath[index], mainPath[index + 1])
      )),
    );
    for (const edge of plan.connections.filter((candidate) => candidate.isMainPath)) {
      if (!mainPathPairs.has(connectionPairKey(edge.sourceRoomId, edge.targetRoomId))) {
        addIssue(
          "main-path-edge-unexpected",
          `connections.${edge.id}`,
          "A connection marked as main path must join consecutive rooms in mainPathRoomIds.",
        );
      }
    }
  }

  for (const room of plan.rooms) {
    if (room.isRequired && !playerReachable.has(room.id)) {
      addIssue(
        "required-room-inaccessible",
        `rooms.${room.id}`,
        `Required room ${room.id} is not reachable with current access conditions.`,
      );
    } else if (
      (
        room.roomRole === "entrance"
        || room.roomRole === "main"
        || room.roomRole === "objective"
        || room.roomRole === "boss"
        || room.roomRole === "connector"
      )
      && !playerReachable.has(room.id)
    ) {
      addIssue(
        "important-room-inaccessible",
        `rooms.${room.id}`,
        `Important room ${room.id} is not reachable from the entry.`,
      );
    }
    if (topology && !physicallyReachable.has(room.id)) {
      addIssue(
        "physical-room-unreachable",
        `rooms.${room.id}`,
        `Room ${room.id} has no physical graph route from the entry.`,
      );
    }
  }

  if (topology) {
    for (const [branchIndex, branch] of topology.branchPaths.entries()) {
      if (!roomIds.has(branch.anchorRoomId) || !plan.mainPathRoomIds?.includes(branch.anchorRoomId)) {
        addIssue(
          "branch-anchor-invalid",
          `topology.branchPaths[${branchIndex}].anchorRoomId`,
          "Each branch must start from a room on the main path.",
        );
      }
      let previousRoomId = branch.anchorRoomId;
      for (let index = 0; index < branch.roomIds.length; index += 1) {
        const roomId = branch.roomIds[index];
        if (!roomIds.has(roomId)) {
          addIssue(
            "branch-room-missing",
            `topology.branchPaths[${branchIndex}].roomIds[${index}]`,
            `Branch room ${roomId} does not exist.`,
          );
        }
        const connectionId = branch.connectionIds[index];
        const edge = connectionId ? connectionsById.get(connectionId) : undefined;
        if (!edge || !edgeConnectsRooms(edge, previousRoomId, roomId)) {
          addIssue(
            "branch-edge-missing",
            `topology.branchPaths[${branchIndex}].connectionIds[${index}]`,
            `A branch edge must link ${previousRoomId} to ${roomId}.`,
          );
        }
        previousRoomId = roomId;
      }
      for (const roomId of branch.roomIds) {
        if (!physicallyReachable.has(roomId)) {
          addIssue(
            "branch-inaccessible",
            `topology.branchPaths[${branchIndex}]`,
            `Branch room ${roomId} is disconnected from the physical graph.`,
          );
        }
      }
    }

    for (const [index, connectionId] of topology.cycleConnectionIds.entries()) {
      const edge = connectionsById.get(connectionId);
      if (!edge) {
        addIssue(
          "cycle-edge-missing",
          `topology.cycleConnectionIds[${index}]`,
          `Cycle connection ${connectionId} does not exist.`,
        );
      } else if (!roomsAreConnectedWithoutEdge(plan, edge)) {
        addIssue(
          "connection-does-not-create-cycle",
          `connections.${connectionId}`,
          "The designated cycle connection does not close an existing route.",
        );
      }
    }
    if (connectivity.physical.cycleRank !== topology.cycleConnectionIds.length) {
      addIssue(
        "cycle-count-mismatch",
        "topology.cycleConnectionIds",
        `The graph cycle rank is ${connectivity.physical.cycleRank}, but ${topology.cycleConnectionIds.length} cycle links are recorded.`,
      );
    }

    for (const edge of plan.connections) {
      if (!edge.isSecret && edge.connectionType !== "secret-door") continue;
      if (
        !roomIds.has(edge.sourceRoomId)
        || !roomIds.has(edge.targetRoomId)
        || edge.sourceRoomId === edge.targetRoomId
        || edge.isMainPath
      ) {
        addIssue(
          "secret-connection-invalid",
          `connections.${edge.id}`,
          "Secret connections must join two different rooms and stay off the required main path.",
        );
      }
    }
  }

  if (connectivity.physical.componentCount > 1) {
    for (const roomId of connectivity.physical.unreachableRoomIds) {
      addIssue(
        "sector-disconnected",
        `rooms.${roomId}`,
        `Room ${roomId} is in a physically disconnected component.`,
      );
    }
  }

  return { valid: issues.length === 0, issues, connectivity };
}

export function getDungeonTopologyStatistics(
  plan: GenerationPlan,
  accessOptions: TopologyAccessOptions = {},
): TopologyStatistics {
  const connectivity = analyzeTopologyConnectivity(plan, accessOptions);
  const degree = new Map(plan.rooms.map((room) => [room.id, 0]));
  for (const edge of plan.connections) {
    degree.set(edge.sourceRoomId, (degree.get(edge.sourceRoomId) ?? 0) + 1);
    degree.set(edge.targetRoomId, (degree.get(edge.targetRoomId) ?? 0) + 1);
  }
  return {
    roomCount: plan.rooms.length,
    connectionCount: plan.connections.length,
    requiredRoomCount: plan.rooms.filter((room) => room.isRequired).length,
    mainPathLength: plan.mainPathRoomIds?.length ?? 0,
    branchCount: plan.topology?.branchPaths.length ?? 0,
    deadEndCount: [...degree.values()].filter((roomDegree) => roomDegree === 1).length,
    cycleRank: connectivity.physical.cycleRank,
    sectorCount: plan.sectors.length,
    optionalConnectionCount: plan.connections.filter((edge) => edge.isOptional).length,
    lockedConnectionCount: plan.connections.filter((edge) => edge.isLocked).length,
    secretConnectionCount: plan.connections.filter((edge) => (
      edge.isSecret || edge.connectionType === "secret-door"
    )).length,
    blockedConnectionCount: plan.connections.filter((edge) => (
      edge.isBlocked || edge.connectionType === "blocked-passage"
    )).length,
    physicallyReachableRoomCount: connectivity.physical.reachableRoomIds.length,
    playerAccessibleRoomCount: connectivity.playerAccess.reachableRoomIds.length,
  };
}

export function generateDungeonTopology(
  sourcePlan: GenerationPlan,
  options: TopologyGenerationOptions = {},
): GenerationPlan {
  validateSourceRooms(sourcePlan);
  const { id: profileId, profile } = selectProfile(sourcePlan, options);
  const style = options.style ?? profile?.topology.style ?? "branching";
  const random = createGenerationRandomStreams(sourcePlan.generation.seed).topology;
  const randomRooms = shuffle(sourcePlan.rooms, random);
  const entryRoomId = sourcePlan.entryRoomId
    ?? sourcePlan.rooms.find((room) => room.roomRole === "entrance")?.id
    ?? randomRooms[0].id;
  const objectiveRoomId = sourcePlan.objectiveRoomId
    ?? sourcePlan.exitRoomId
    ?? sourcePlan.rooms.find((room) => (
      room.id !== entryRoomId && (room.roomRole === "objective" || room.roomRole === "boss")
    ))?.id
    ?? randomRooms.find((room) => room.id !== entryRoomId)?.id
    ?? entryRoomId;
  validateEndpoints(sourcePlan, entryRoomId, objectiveRoomId);

  const selectedParameters = resolveTopologyParameters(style, profile, options, sourcePlan.rooms.length);
  const sectorCount = style === "sectorized" && selectedParameters.sectorCount === 0
    ? Math.min(sourcePlan.rooms.length, Math.max(2, Math.min(3, sourcePlan.rooms.length)))
    : selectedParameters.sectorCount;
  const parameters = { ...selectedParameters, sectorCount };
  const sectorAssignment = assignSectors(
    sourcePlan,
    sourcePlan.rooms,
    sectorCount,
    entryRoomId,
    objectiveRoomId,
    profileId,
    random,
  );
  const explicitRequiredIds = new Set(
    sourcePlan.rooms
      .filter((room) => (
        room.isRequired
        || room.roomRole === "entrance"
        || room.roomRole === "main"
        || room.roomRole === "objective"
        || room.roomRole === "boss"
        || room.roomRole === "connector"
      ))
      .map((room) => room.id),
  );
  const sourceRoomsById = new Map(sourcePlan.rooms.map((room) => [room.id, room]));
  const hubRoomId = style === "centralized" || style === "hybrid"
    ? randomRooms.find((room) => (
      room.id !== entryRoomId
      && room.id !== objectiveRoomId
      && !explicitRequiredIds.has(room.id)
    ))?.id
      ?? randomRooms.find((room) => room.id !== entryRoomId && room.id !== objectiveRoomId)?.id
    : undefined;

  let mainPathRoomIds: string[];
  let branchGroups: Array<{ anchorRoomId: string; rooms: RoomNode[] }>;
  const sectorGatewayIds = new Set<string>();
  if (style === "sectorized" && sectorAssignment.groups.length > 0) {
    const gatewaysBySector = sectorAssignment.groups.map((group, groupIndex) => {
      const requiredRooms = group.filter((room) => explicitRequiredIds.has(room.id));
      const preferredGateway = groupIndex === 0
        ? group.find((room) => room.id === entryRoomId)
        : groupIndex === sectorAssignment.groups.length - 1
          ? group.find((room) => room.id === objectiveRoomId)
          : undefined;
      const gateway = preferredGateway
        ?? requiredRooms[0]
        ?? shuffle(group, random)[0];
      if (!gateway) return [] as string[];
      const gateways = [
        gateway,
        ...requiredRooms.filter((room) => room.id !== gateway.id),
      ].map((room) => room.id);
      gateways.forEach((roomId) => sectorGatewayIds.add(roomId));
      return gateways;
    });
    const orderedGateways = gatewaysBySector.flat();
    mainPathRoomIds = [
      entryRoomId,
      ...orderedGateways.filter((roomId) => roomId !== entryRoomId && roomId !== objectiveRoomId),
      ...(objectiveRoomId === entryRoomId ? [] : [objectiveRoomId]),
    ];
    branchGroups = sectorAssignment.groups.flatMap((group, groupIndex) => {
      const gatewayIds = new Set(gatewaysBySector[groupIndex]);
      const gatewayRoomId = gatewaysBySector[groupIndex][0];
      if (!gatewayRoomId) return [];
      const branchRooms = group.filter((room) => !gatewayIds.has(room.id));
      return branchRooms.length > 0
        ? [{ anchorRoomId: gatewayRoomId, rooms: branchRooms }]
        : [];
    });
  } else if (style === "centralized") {
    const requiredMiddleRooms = randomRooms.filter((room) => (
      room.id !== entryRoomId
      && room.id !== objectiveRoomId
      && explicitRequiredIds.has(room.id)
    ));
    const middlePathRoomIds = [
      ...(hubRoomId && !explicitRequiredIds.has(hubRoomId) ? [hubRoomId] : []),
      ...requiredMiddleRooms.map((room) => room.id),
    ];
    mainPathRoomIds = [
      entryRoomId,
      ...middlePathRoomIds,
      ...(objectiveRoomId === entryRoomId ? [] : [objectiveRoomId]),
    ];
    const mainPath = new Set(mainPathRoomIds);
    const branchRooms = randomRooms.filter((room) => !mainPath.has(room.id));
    branchGroups = partitionBranchRooms(branchRooms, Math.max(1, parameters.branchCount))
      .map((rooms) => ({ anchorRoomId: hubRoomId ?? entryRoomId, rooms }));
  } else {
    const middleRooms = randomRooms.filter((room) => (
      room.id !== entryRoomId && room.id !== objectiveRoomId
    ));
    const requiredMiddleRooms = middleRooms.filter((room) => (
      explicitRequiredIds.has(room.id) || room.id === hubRoomId
    ));
    const optionalMiddleRooms = middleRooms.filter((room) => (
      !explicitRequiredIds.has(room.id) && room.id !== hubRoomId
    ));
    const branchFraction = style === "linear"
      ? 0.15
      : style === "branching"
        ? 0.4
        : style === "hybrid"
          ? 0.35
          : style === "circuit"
            ? 0
            : 0;
    const branchRoomCount = parameters.branchCount === 0
      ? 0
      : Math.min(
        optionalMiddleRooms.length,
        Math.max(parameters.branchCount, Math.ceil(optionalMiddleRooms.length * branchFraction)),
      );
    const branchRooms = optionalMiddleRooms.slice(0, branchRoomCount);
    const branchRoomIds = new Set(branchRooms.map((room) => room.id));
    const spineMiddleRooms = [
      ...requiredMiddleRooms,
      ...optionalMiddleRooms.filter((room) => !branchRoomIds.has(room.id)),
    ];
    mainPathRoomIds = [
      entryRoomId,
      ...spineMiddleRooms.map((room) => room.id),
      ...(objectiveRoomId === entryRoomId ? [] : [objectiveRoomId]),
    ];
    if (objectiveRoomId === entryRoomId && mainPathRoomIds.length === 0) {
      mainPathRoomIds = [entryRoomId];
    }
    const branchGroupsPartition = partitionBranchRooms(branchRooms, parameters.branchCount);
    branchGroups = branchGroupsPartition.map((rooms) => ({
      anchorRoomId: hubRoomId
        && mainPathRoomIds.includes(hubRoomId)
        && random() < 0.7
          ? hubRoomId
          : mainPathRoomIds[Math.floor(random() * mainPathRoomIds.length)],
      rooms,
    }));
  }

  for (const requiredRoomId of explicitRequiredIds) {
    if (!mainPathRoomIds.includes(requiredRoomId)) {
      const insertAt = Math.max(1, mainPathRoomIds.length - 1);
      mainPathRoomIds.splice(insertAt, 0, requiredRoomId);
    }
  }
  if (mainPathRoomIds.length === 1 && objectiveRoomId !== entryRoomId) {
    mainPathRoomIds.push(objectiveRoomId);
  }

  const connections: ConnectionEdge[] = [];
  const connectionPairs = new Set<string>();
  const cycleConnectionIds: string[] = [];
  let connectionOrdinal = 0;
  const addConnection = (
    sourceRoomId: string,
    targetRoomId: string,
    flags: Partial<Pick<ConnectionEdge, "isSecret" | "isLocked" | "isBlocked" | "isOptional" | "isMainPath" | "connectionType">> = {},
    metadata: ConnectionEdge["metadata"] = {},
    isCycle = false,
  ): ConnectionEdge | undefined => {
    const pair = connectionPairKey(sourceRoomId, targetRoomId);
    if (sourceRoomId === targetRoomId || connectionPairs.has(pair)) return undefined;
    connectionPairs.add(pair);
    const id = createStableGenerationId(sourcePlan.id, "connection", connectionOrdinal);
    connectionOrdinal += 1;
    const edge: ConnectionEdge = {
      id,
      sourceRoomId,
      targetRoomId,
      connectionType: flags.connectionType ?? "corridor",
      width: 1,
      path: [],
      isSecret: flags.isSecret ?? false,
      isLocked: flags.isLocked ?? false,
      isBlocked: flags.isBlocked ?? false,
      isOptional: flags.isOptional ?? false,
      isMainPath: flags.isMainPath ?? false,
      metadata,
    };
    connections.push(edge);
    if (isCycle) cycleConnectionIds.push(edge.id);
    return edge;
  };

  for (let index = 1; index < mainPathRoomIds.length; index += 1) {
    addConnection(
      mainPathRoomIds[index - 1],
      mainPathRoomIds[index],
      { isMainPath: true },
    );
  }

  const branches: TopologyBranch[] = [];
  const branchRoomIds = new Set<string>();
  for (const [branchIndex, group] of branchGroups.entries()) {
    const anchorRoomId = group.anchorRoomId;
    const rooms = group.rooms.filter((room) => (
      !mainPathRoomIds.includes(room.id) && !branchRoomIds.has(room.id)
    ));
    if (rooms.length === 0 || !mainPathRoomIds.includes(anchorRoomId)) continue;
    const branchConnectionIds: string[] = [];
    let previousRoomId = anchorRoomId;
    for (const room of rooms) {
      const edge = addConnection(previousRoomId, room.id, {
        isOptional: branchIndex < parameters.optionalPathCount,
      });
      if (!edge) continue;
      branchConnectionIds.push(edge.id);
      branchRoomIds.add(room.id);
      previousRoomId = room.id;
    }
    if (branchConnectionIds.length > 0) {
      branches.push({
        id: createStableGenerationId(sourcePlan.id, "branch", branchIndex),
        anchorRoomId,
        roomIds: rooms.map((room) => room.id),
        connectionIds: branchConnectionIds,
        isOptional: branchIndex < parameters.optionalPathCount,
        isDeadEnd: true,
      });
    }
  }

  const loopProbability = 1 - parameters.deadEndProbability;
  const targetExtraCycles = Math.max(
    parameters.cycleCount + parameters.additionalConnectionCount,
    parameters.lockedConnectionCount
      + parameters.secretConnectionCount
      + parameters.blockedConnectionCount,
  );
  for (const branch of branches) {
    if (
      random() >= loopProbability
      || mainPathRoomIds.length < 3
    ) continue;
    const alternateAnchors = mainPathRoomIds.filter((roomId) => roomId !== branch.anchorRoomId);
    const alternateAnchor = alternateAnchors[Math.floor(random() * alternateAnchors.length)];
    const leafRoomId = branch.roomIds[branch.roomIds.length - 1];
    const edge = addConnection(leafRoomId, alternateAnchor, { isOptional: true }, {}, true);
    if (edge) {
      const branchIndex = branches.indexOf(branch);
      branches[branchIndex] = { ...branch, isDeadEnd: false };
    }
  }

  const roomIds = randomRooms.map((room) => room.id);
  const possibleExtraPairs: Array<[string, string]> = [];
  for (let first = 0; first < roomIds.length; first += 1) {
    for (let second = first + 1; second < roomIds.length; second += 1) {
      if (!connectionPairs.has(connectionPairKey(roomIds[first], roomIds[second]))) {
        possibleExtraPairs.push([roomIds[first], roomIds[second]]);
      }
    }
  }
  const extraPairs = shuffle(possibleExtraPairs, random);
  while (cycleConnectionIds.length < targetExtraCycles && extraPairs.length > 0) {
    const [sourceRoomId, targetRoomId] = extraPairs.pop()!;
    addConnection(sourceRoomId, targetRoomId, { isOptional: true }, {}, true);
  }

  const accessConnectionIds = cycleConnectionIds.slice(
    0,
    parameters.secretConnectionCount
      + parameters.lockedConnectionCount
      + parameters.blockedConnectionCount,
  );
  const secretConnectionIds = new Set(
    accessConnectionIds.slice(0, parameters.secretConnectionCount),
  );
  const lockedStart = parameters.secretConnectionCount;
  const lockedConnectionIds = new Set(
    accessConnectionIds.slice(lockedStart, lockedStart + parameters.lockedConnectionCount),
  );
  const blockedStart = lockedStart + parameters.lockedConnectionCount;
  const blockedConnectionIds = new Set(
    accessConnectionIds.slice(blockedStart, blockedStart + parameters.blockedConnectionCount),
  );
  const secretRoomIds = new Set<string>();
  for (const edge of connections) {
    if (secretConnectionIds.has(edge.id)) {
      const targetRoom = sourceRoomsById.get(edge.targetRoomId);
      const sourceRoom = sourceRoomsById.get(edge.sourceRoomId);
      const candidate = targetRoom && !targetRoom.isRequired
        ? targetRoom
        : sourceRoom && !sourceRoom.isRequired
          ? sourceRoom
          : undefined;
      if (candidate) secretRoomIds.add(candidate.id);
    }
  }
  const finalizedConnections = connections.map((edge) => {
    if (secretConnectionIds.has(edge.id)) {
      return {
        ...edge,
        connectionType: "secret-door" as const,
        isSecret: true,
      };
    }
    if (lockedConnectionIds.has(edge.id)) {
      return {
        ...edge,
        connectionType: "door" as const,
        isLocked: true,
        metadata: {
          ...edge.metadata,
          lockId: `${edge.id}:lock`,
        },
      };
    }
    if (blockedConnectionIds.has(edge.id)) {
      return {
        ...edge,
        connectionType: "blocked-passage" as const,
        isBlocked: true,
      };
    }
    return edge;
  });
  const connectionsWithDoors = assignDoorVariants(
    addDefaultDoorConnections(finalizedConnections, random, profileId),
    sourcePlan.generation.seed,
    profileId,
  );

  for (const [branchIndex, branch] of branches.entries()) {
    const leafRoomId = branch.roomIds[branch.roomIds.length - 1];
    const leafDegree = finalizedConnections.filter((edge) => (
      edge.sourceRoomId === leafRoomId || edge.targetRoomId === leafRoomId
    )).length;
    branches[branchIndex] = { ...branch, isDeadEnd: leafDegree === 1 };
  }

  const finalRooms = makeRoomRoles(
    sourcePlan.rooms,
    mainPathRoomIds,
    branches,
    entryRoomId,
    objectiveRoomId,
    hubRoomId,
    sectorGatewayIds,
    secretRoomIds,
  ).map((room) => ({
    ...room,
    sectorId: sectorAssignment.roomSectorIds.get(room.id),
  }));
  const finalSectors = sectorAssignment.sectors;
  const topology = {
    version: "topology-v1" as const,
    style,
    profile: profileId,
    geometryStatus: "unrouted" as const,
    branchPaths: branches,
    cycleConnectionIds,
    parameters,
  };
  const generation: DungeonGenerationMetadata = {
    ...sourcePlan.generation,
    profile: profileId ?? sourcePlan.generation.profile,
    parameters: {
      ...sourcePlan.generation.parameters,
      width: sourcePlan.width,
      height: sourcePlan.height,
    },
  };

  return {
    ...sourcePlan,
    generation,
    rooms: finalRooms,
    connections: connectionsWithDoors,
    sectors: finalSectors,
    entryRoomId,
    exitRoomId: objectiveRoomId,
    objectiveRoomId,
    mainPathRoomIds,
    topology,
    intersections: [],
    transitions: sourcePlan.transitions.filter((transition) => (
      !transition.connectionId
      && transition.type !== "doorway"
      && transition.type !== "secret-door"
    )),
  };
}
