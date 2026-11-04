import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import type { GenerationPlan, RoomNode, SpatialLayoutStyle } from "./generationPlan";
import { validateGenerationPlan } from "./generationPlanValidation";
import { generateDungeonTopology, validateDungeonTopology } from "./generationTopology";
import {
  SpatialLayoutError,
  generateGenerationSpatialLayout,
} from "./generationSpatialLayout";

function createFootprint(width: number, height: number): Array<{ x: number; y: number }> {
  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => ({ x, y }))
  )).flat();
}

function createSourcePlan(
  roomCount = 12,
  seed = 81023,
  width = 64,
  height = 48,
  roomWidth = 3,
  roomHeight = 3,
): GenerationPlan {
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width,
    height,
    roomCount,
  };
  const rooms: RoomNode[] = Array.from({ length: roomCount }, (_, index) => ({
    id: `layout-room-${String(index).padStart(2, "0")}`,
    roomType: "exploration",
    roomRole: index === 0 ? "entrance" : index === roomCount - 1 ? "objective" : "secondary",
    width: roomWidth,
    height: roomHeight,
    position: { x: 2 + (index % 4) * 12, y: 2 + Math.floor(index / 4) * 12 },
    shape: "rectangular",
    footprint: createFootprint(roomWidth, roomHeight),
    floorId: "floor-1",
    importance: index === 0 || index === roomCount - 1 ? 1 : 0.4,
    isRequired: false,
    metadata: {},
  }));
  return {
    id: `layout-${seed}`,
    width,
    height,
    generation: {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      seed,
      profile: "custom",
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

function createTopology(style: "linear" | "branching" | "circuit" | "centralized" | "sectorized" | "hybrid" = "branching"): GenerationPlan {
  return generateDungeonTopology(createSourcePlan(), {
    style,
    parameters: {
      branchCount: 3,
      cycleCount: style === "circuit" ? 2 : 0,
      sectorCount: style === "sectorized" ? 3 : 0,
    },
  });
}

function hasRoomOverlap(plan: GenerationPlan): boolean {
  for (let firstIndex = 0; firstIndex < plan.rooms.length; firstIndex += 1) {
    const first = plan.rooms[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < plan.rooms.length; secondIndex += 1) {
      const second = plan.rooms[secondIndex];
      if (
        first.position.x < second.position.x + second.width
        && second.position.x < first.position.x + first.width
        && first.position.y < second.position.y + second.height
        && second.position.y < first.position.y + first.height
      ) {
        return true;
      }
    }
  }
  return false;
}

describe("topology-aware spatial layout", () => {
  it("repeats room placement and metrics for the same seed and parameters", () => {
    const topology = createTopology();
    const first = generateGenerationSpatialLayout(topology, { style: "axis-branches" });
    const repeated = generateGenerationSpatialLayout(topology, { style: "axis-branches" });

    expect(first.rooms).toEqual(repeated.rooms);
    expect(first.spatialLayout).toEqual(repeated.spatialLayout);
    expect(first.generation.seed).toBe(topology.generation.seed);
    expect(first.topology).toEqual(topology.topology);
  });

  it.each([
    "axis-branches",
    "central-hub",
    "ring",
    "clusters",
  ] satisfies readonly SpatialLayoutStyle[])("places every room without overlap for %s", (style) => {
    const topology = createTopology(style === "clusters" ? "sectorized" : "branching");
    const result = generateGenerationSpatialLayout(topology, { style });

    expect(result.rooms).toHaveLength(topology.rooms.length);
    expect(hasRoomOverlap(result)).toBe(false);
    expect(result.rooms.every((room) => (
      room.position.x >= 1
      && room.position.y >= 1
      && room.position.x + room.width <= result.width - 1
      && room.position.y + room.height <= result.height - 1
    ))).toBe(true);
    expect(validateGenerationPlan(result).valid).toBe(true);
    expect(validateDungeonTopology(result).valid).toBe(true);
    expect(result.spatialLayout?.style).toBe(style);
    expect(result.spatialLayout?.metrics.roomCount).toBe(result.rooms.length);
    expect(result.spatialLayout?.metrics.score.total).toBeGreaterThan(0);
    expect(result.topology?.geometryStatus).toBe("unrouted");
    expect(result.connections.every((connection) => connection.path.length === 0)).toBe(true);
  });

  it("keeps the graph intact while spatial styles produce distinct placements", () => {
    const topology = createTopology();
    const styles: SpatialLayoutStyle[] = ["axis-branches", "central-hub", "ring", "clusters"];
    const layouts = styles.map((style) => (
      generateGenerationSpatialLayout(topology, { style })
    ));

    expect(new Set(layouts.map((layout) => (
      layout.rooms.map((room) => `${room.id}:${room.position.x},${room.position.y}`).join("|")
    ))).size).toBeGreaterThan(1);
    for (const layout of layouts) {
      expect(layout.connections).toEqual(topology.connections);
      expect(layout.mainPathRoomIds).toEqual(topology.mainPathRoomIds);
      expect(layout.sectors).toEqual(topology.sectors);
    }
  });

  it("reserves sufficient clearance for wide room connections", () => {
    const topology = createTopology("linear");
    const wideTopology = {
      ...topology,
      connections: topology.connections.map((edge) => ({ ...edge, width: 3 })),
    };
    const layout = generateGenerationSpatialLayout(wideTopology, { style: "axis-branches" });
    const edge = layout.connections[0];
    const first = layout.rooms.find((room) => room.id === edge.sourceRoomId)!;
    const second = layout.rooms.find((room) => room.id === edge.targetRoomId)!;
    const gapX = Math.max(
      0,
      first.position.x - (second.position.x + second.width),
      second.position.x - (first.position.x + first.width),
    );
    const gapY = Math.max(
      0,
      first.position.y - (second.position.y + second.height),
      second.position.y - (first.position.y + first.height),
    );

    expect(gapX >= 2 || gapY >= 2).toBe(true);
  });

  it.each([
    ["linear", "axis-branches"],
    ["branching", "axis-branches"],
    ["circuit", "ring"],
    ["centralized", "central-hub"],
    ["sectorized", "clusters"],
    ["hybrid", "clusters"],
  ] as const)("infers %s topology as %s layout", (topologyStyle, layoutStyle) => {
    const topology = createTopology(topologyStyle);
    const layout = generateGenerationSpatialLayout(topology);

    expect(layout.spatialLayout?.style).toBe(layoutStyle);
  });

  it("preserves room counts on small and maximum-size maps", () => {
    const smallTopology = generateDungeonTopology(
      createSourcePlan(6, 913, 32, 24),
      { style: "linear" },
    );
    const largeTopology = generateDungeonTopology(
      createSourcePlan(24, 914, 160, 120, 5, 5),
      { style: "sectorized", parameters: { sectorCount: 4 } },
    );
    const smallLayout = generateGenerationSpatialLayout(smallTopology, { style: "axis-branches" });
    const largeLayout = generateGenerationSpatialLayout(largeTopology, {
      style: "clusters",
      maxIterations: 24,
    });

    expect(smallLayout.rooms).toHaveLength(6);
    expect(largeLayout.rooms).toHaveLength(24);
    expect(hasRoomOverlap(smallLayout)).toBe(false);
    expect(hasRoomOverlap(largeLayout)).toBe(false);
    expect(largeLayout.spatialLayout?.metrics.connectedPairCount).toBeGreaterThan(0);
  });

  it("reports all unplaceable required rooms after bounded fallback attempts", () => {
    const oversizedSource = createSourcePlan(24, 128, 20, 20, 10, 10);
    const oversizedTopology = generateDungeonTopology(oversizedSource, {
      style: "branching",
      parameters: { branchCount: 4 },
    });

    try {
      generateGenerationSpatialLayout(oversizedTopology, { style: "clusters" });
      throw new Error("Expected an explicit room placement failure.");
    } catch (error) {
      if (!(error instanceof SpatialLayoutError)) throw error;
      expect(error.code).toBe("layout-failed");
      expect(error.failedRoomIds.length).toBeGreaterThan(0);
    }
  });

  it("uses the bounded resize fallback without losing rooms", () => {
    const topology = generateDungeonTopology(
      createSourcePlan(3, 129, 20, 20, 10, 10),
      { style: "linear" },
    );
    const layout = generateGenerationSpatialLayout(topology, { style: "axis-branches" });

    expect(layout.rooms).toHaveLength(3);
    expect(layout.spatialLayout?.fallbackUsed).toBe(true);
    expect(layout.spatialLayout?.resizedRoomIds.length).toBeGreaterThan(0);
    expect(hasRoomOverlap(layout)).toBe(false);
  });

  it("rejects layouts whose connected rooms exceed the requested distance limit", () => {
    const topology = createTopology("linear");

    try {
      generateGenerationSpatialLayout(topology, {
        style: "axis-branches",
        maximumConnectionDistance: 1,
      });
      throw new Error("Expected an explicit layout distance failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(SpatialLayoutError);
      expect(error).toMatchObject({
        code: "layout-failed",
        failedConnectionIds: expect.arrayContaining([topology.connections[0].id]),
      });
    }
  });

  it("does not reposition a plan after physical routing has started", () => {
    const topology = createTopology();
    const routedPlan = {
      ...topology,
      topology: {
        ...topology.topology!,
        geometryStatus: "routed" as const,
      },
    };

    try {
      generateGenerationSpatialLayout(routedPlan);
      throw new Error("Expected an explicit routed-plan rejection.");
    } catch (error) {
      if (!(error instanceof SpatialLayoutError)) throw error;
      expect(error.code).toBe("routed-plan");
    }
  });

  it("rejects invalid layout limits explicitly", () => {
    expect(() => generateGenerationSpatialLayout(createTopology(), { maxLayoutAttempts: 100 }))
      .toThrow(/maxLayoutAttempts must be an integer/);
  });
});
