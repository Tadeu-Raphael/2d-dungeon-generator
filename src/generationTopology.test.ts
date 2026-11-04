import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type { GenerationPlan, RoomNode } from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { validateGenerationPlan } from "./generationPlanValidation";
import {
  analyzeTopologyConnectivity,
  generateDungeonTopology,
  getDungeonTopologyStatistics,
  isConnectionPlayerAccessible,
  validateDungeonTopology,
} from "./generationTopology";

function createFootprint(width: number, height: number): Array<{ x: number; y: number }> {
  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => ({ x, y }))
  )).flat();
}

function createSourcePlan(
  roomCount = 12,
  seed = 24680,
  profile = "custom",
): GenerationPlan {
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width: 64,
    height: 48,
    roomCount,
  };
  const rooms: RoomNode[] = Array.from({ length: roomCount }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      id: `room-${String(index).padStart(2, "0")}`,
      roomType: "exploration",
      roomRole: index === 0 ? "entrance" : index === roomCount - 1 ? "objective" : "secondary",
      width: 3,
      height: 3,
      position: { x: 2 + column * 12, y: 2 + row * 12 },
      shape: "rectangular",
      footprint: createFootprint(3, 3),
      floorId: "floor-1",
      importance: index === 0 || index === roomCount - 1 ? 1 : 0.4,
      isRequired: false,
      metadata: {},
    };
  });
  return {
    id: `topology-${seed}`,
    width: parameters.width,
    height: parameters.height,
    generation: {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      seed,
      profile,
      algorithm: "bsp",
      parameters,
      settings: {},
      generatedAt: "2025-01-01T00:00:00.000Z",
    },
    rooms,
    connections: [],
    sectors: [],
    entryRoomId: rooms[0].id,
    objectiveRoomId: rooms[roomCount - 1].id,
    exitRoomId: rooms[roomCount - 1].id,
    intersections: [],
    transitions: [],
    features: [],
    metadata: {},
  };
}

describe("seeded dungeon topology", () => {
  it.each([
    "linear",
    "branching",
    "circuit",
    "centralized",
    "sectorized",
    "hybrid",
  ] as const)("generates a valid %s graph without changing physical room placement", (style) => {
    const sourcePlan = createSourcePlan();
    const topology = generateDungeonTopology(sourcePlan, {
      style,
      parameters: {
        branchCount: style === "circuit" ? 0 : 3,
        cycleCount: style === "circuit" ? 2 : style === "hybrid" ? 1 : 0,
        sectorCount: style === "sectorized" ? 3 : 0,
        deadEndProbability: 1,
      },
    });

    expect(topology.topology?.style).toBe(style);
    expect(topology.topology?.geometryStatus).toBe("unrouted");
    expect(topology.mainPathRoomIds?.[0]).toBe(topology.entryRoomId);
    expect(topology.mainPathRoomIds?.[topology.mainPathRoomIds.length - 1])
      .toBe(topology.objectiveRoomId);
    expect(topology.rooms.map((room) => ({
      id: room.id,
      position: room.position,
      footprint: room.footprint,
      width: room.width,
      height: room.height,
    }))).toEqual(sourcePlan.rooms.map((room) => ({
      id: room.id,
      position: room.position,
      footprint: room.footprint,
      width: room.width,
      height: room.height,
    })));
    expect(validateDungeonTopology(topology).valid).toBe(true);
    expect(() => generationPlanToDungeon(topology)).toThrow(/must be physically routed/);
  });

  it("repeats the logical graph for the same seed and isolates it from thematic content changes", () => {
    const sourcePlan = createSourcePlan(12, 7319);
    const first = generateDungeonTopology(sourcePlan, { style: "hybrid" });
    const repeated = generateDungeonTopology(sourcePlan, { style: "hybrid" });
    const changedContentPlan = {
      ...sourcePlan,
      rooms: sourcePlan.rooms.map((room) => ({ ...room, roomType: "arcane" as const })),
    };
    const changedContent = generateDungeonTopology(changedContentPlan, { style: "hybrid" });

    expect(first.connections).toEqual(repeated.connections);
    expect(first.topology).toEqual(repeated.topology);
    expect(first.mainPathRoomIds).toEqual(repeated.mainPathRoomIds);
    expect(first.sectors).toEqual(repeated.sectors);
    expect(first.connections).toEqual(changedContent.connections);
    expect(first.topology).toEqual(changedContent.topology);
    expect(first.mainPathRoomIds).toEqual(changedContent.mainPathRoomIds);
    expect(first.rooms.map((room) => room.roomType))
      .toEqual(sourcePlan.rooms.map((room) => room.roomType));
  });

  it("accepts unrouted topology geometry while keeping physical conversion explicitly unavailable", () => {
    const topology = generateDungeonTopology(createSourcePlan(), { style: "branching" });

    expect(validateGenerationPlan(topology).valid).toBe(true);
    expect(topology.connections.every((edge) => edge.path.length === 0)).toBe(true);
    expect(topology.rooms[0].position).toEqual({ x: 2, y: 2 });
  });

  it("supports a single-room entry and objective without inventing a self-connection", () => {
    const sourcePlan = createSourcePlan(1);
    const topology = generateDungeonTopology(sourcePlan, { style: "sectorized" });

    expect(topology.mainPathRoomIds).toEqual([topology.entryRoomId]);
    expect(topology.connections).toEqual([]);
    expect(validateGenerationPlan(topology).valid).toBe(true);
    expect(validateDungeonTopology(topology).valid).toBe(true);
  });

  it("creates the requested number of intentional cycles and records graph statistics", () => {
    const topology = generateDungeonTopology(createSourcePlan(10, 87), {
      style: "circuit",
      parameters: { cycleCount: 3, additionalConnectionCount: 1, deadEndProbability: 1 },
    });
    const statistics = getDungeonTopologyStatistics(topology);

    expect(statistics.cycleRank).toBe(4);
    expect(topology.topology?.cycleConnectionIds).toHaveLength(4);
    expect(statistics.connectionCount).toBe(13);
    expect(statistics.mainPathLength).toBe(10);
    expect(statistics.physicallyReachableRoomCount).toBe(10);
    expect(statistics.playerAccessibleRoomCount).toBe(10);
    expect(validateDungeonTopology(topology).valid).toBe(true);
  });

  it("builds controlled dead-end branches when loops are disabled", () => {
    const topology = generateDungeonTopology(createSourcePlan(12, 5678), {
      style: "branching",
      parameters: {
        branchCount: 3,
        optionalPathCount: 2,
        deadEndProbability: 1,
        cycleCount: 0,
        additionalConnectionCount: 0,
      },
    });
    const statistics = getDungeonTopologyStatistics(topology);

    expect(statistics.branchCount).toBe(3);
    expect(statistics.cycleRank).toBe(0);
    expect(statistics.mainPathLength).toBe(8);
    expect(statistics.connectionCount).toBe(11);
    expect(topology.topology?.branchPaths.every((branch) => branch.isDeadEnd)).toBe(true);
    expect(topology.topology?.branchPaths.filter((branch) => branch.isOptional)).toHaveLength(2);
    expect(topology.rooms.find((room) => room.id === topology.entryRoomId)?.roomRole)
      .toBe("entrance");
    expect(topology.rooms.find((room) => room.id === topology.objectiveRoomId)?.roomRole)
      .toBe("objective");
    expect(validateDungeonTopology(topology).valid).toBe(true);
  });

  it("uses dead-end probability to close branches into alternate routes", () => {
    const topology = generateDungeonTopology(createSourcePlan(12, 4321), {
      style: "branching",
      parameters: {
        branchCount: 3,
        deadEndProbability: 0,
        cycleCount: 0,
        additionalConnectionCount: 0,
      },
    });

    expect(topology.topology?.branchPaths.every((branch) => !branch.isDeadEnd)).toBe(true);
    expect(getDungeonTopologyStatistics(topology).cycleRank).toBeGreaterThan(0);
    expect(validateDungeonTopology(topology).valid).toBe(true);
  });

  it("keeps all required progress reachable and excludes blocked paths from player access", () => {
    const topology = generateDungeonTopology(createSourcePlan(8, 991), {
      style: "linear",
      parameters: {
        branchCount: 0,
        cycleCount: 0,
        additionalConnectionCount: 0,
        deadEndProbability: 1,
      },
    });
    const blockedEdgeId = topology.connections.find((edge) => edge.isMainPath)?.id;
    if (!blockedEdgeId) throw new Error("Expected the linear topology to include a main-path edge.");
    const blockedTopology = {
      ...topology,
      connections: topology.connections.map((edge) => (
        edge.id === blockedEdgeId
          ? { ...edge, connectionType: "blocked-passage" as const, isBlocked: true }
          : edge
      )),
    };
    const report = analyzeTopologyConnectivity(blockedTopology);
    const validation = validateDungeonTopology(blockedTopology);

    expect(report.physical.reachableRoomIds).toHaveLength(8);
    expect(report.playerAccess.unreachableRoomIds.length).toBeGreaterThan(0);
    expect(validation.issues.map((issue) => issue.code)).toContain("main-path-inaccessible");
    expect(validation.issues.map((issue) => issue.code)).toContain("required-room-inaccessible");
  });

  it("honors lock IDs, discovered secrets, and future access requirements", () => {
    const topology = generateDungeonTopology(createSourcePlan(5), { style: "circuit" });
    const lastConnection = topology.connections[topology.connections.length - 1];
    if (!lastConnection) throw new Error("Expected the circuit to include an optional connection.");
    const edge = {
      ...lastConnection,
      isLocked: true,
      isSecret: true,
      metadata: { lockId: "vault-lock", accessRequirements: ["ritual-complete"] },
    };

    expect(isConnectionPlayerAccessible(edge, {})).toBe(false);
    expect(isConnectionPlayerAccessible({
      ...edge,
      isSecret: false,
      connectionType: "secret-door",
    }, {})).toBe(false);
    expect(isConnectionPlayerAccessible(edge, {
      unlockedLockIds: new Set(["vault-lock"]),
      discoveredSecretConnectionIds: new Set([edge.id]),
    })).toBe(false);
    expect(isConnectionPlayerAccessible(edge, {
      unlockedLockIds: new Set(["vault-lock"]),
      discoveredSecretConnectionIds: new Set([edge.id]),
      satisfiedRequirements: new Set(["ritual-complete"]),
    })).toBe(true);
  });

  it("validates a circuit rather than trusting its recorded cycle list", () => {
    const topology = generateDungeonTopology(createSourcePlan(8), {
      style: "circuit",
      parameters: { cycleCount: 2 },
    });
    const forgedMetadata = {
      ...topology,
      topology: {
        ...topology.topology!,
        cycleConnectionIds: [],
      },
    };

    expect(validateDungeonTopology(forgedMetadata).issues.map((issue) => issue.code))
      .toContain("cycle-count-mismatch");
  });

  it("uses each concept's topology affinity without changing generation metadata", () => {
    for (const profile of Object.values(DUNGEON_CONCEPTS)) {
      const sourcePlan = createSourcePlan(12, 13579, profile.id);
      const topology = generateDungeonTopology(sourcePlan);

      expect(topology.topology?.profile).toBe(profile.id);
      expect(topology.topology?.style).toBe(profile.topology.style);
      expect(validateDungeonTopology(topology).valid).toBe(true);
      expect(topology.generation).toEqual(sourcePlan.generation);
    }
  });

  it("reports generated access-control statistics without changing room tiles", () => {
    const topology = generateDungeonTopology(createSourcePlan(10, 119), {
      style: "hybrid",
      parameters: {
        branchCount: 2,
        sectorCount: 2,
        cycleCount: 3,
        secretConnectionCount: 1,
        lockedConnectionCount: 1,
        blockedConnectionCount: 1,
        deadEndProbability: 1,
      },
    });
    const statistics = getDungeonTopologyStatistics(topology);

    expect(statistics.secretConnectionCount).toBe(1);
    expect(statistics.lockedConnectionCount).toBe(1);
    expect(statistics.blockedConnectionCount).toBe(1);
    expect(statistics.sectorCount).toBe(2);
    expect(statistics.connectionCount).toBe(statistics.roomCount - 1 + statistics.cycleRank);
    expect(statistics.playerAccessibleRoomCount).toBe(statistics.roomCount);
    expect(validateDungeonTopology(topology).valid).toBe(true);
  });
});
