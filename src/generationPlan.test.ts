import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DungeonCanvas, { getTileColor } from "./DungeonCanvas";
import DungeonThreeCanvas from "./DungeonThreeCanvas";
import {
  CAVE_CONNECTION_WALL_TILE,
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DOOR_TILE,
  FLOOR_TILE,
  MAX_DUNGEON_WIDTH,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import {
  createStableGenerationId,
} from "./generationPlan";
import type { GenerationPlan, GridPosition, RoomNode } from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import {
  GenerationPlanValidationError,
  validateGenerationPlan,
} from "./generationPlanValidation";

function createFootprint(width: number, height: number): GridPosition[] {
  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => ({ x, y }))
  )).flat();
}

function createValidPlan(): GenerationPlan {
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width: 24,
    height: 20,
    roomCount: 2,
  };
  const entryRoom: RoomNode = {
    id: "room-entry",
    roomType: "exploration",
    roomRole: "entrance",
    width: 5,
    height: 5,
    position: { x: 2, y: 2 },
    shape: "rectangular",
    footprint: createFootprint(5, 5),
    sectorId: "sector-entry",
    floorId: "floor-1",
    importance: 1,
    isRequired: true,
    metadata: {},
  };
  const objectiveRoom: RoomNode = {
    id: "room-sanctum",
    roomType: "religious",
    roomRole: "objective",
    width: 5,
    height: 5,
    position: { x: 15, y: 10 },
    shape: "octagonal",
    footprint: createFootprint(5, 5),
    sectorId: "sector-ritual",
    floorId: "floor-1",
    importance: 0.9,
    isRequired: true,
    metadata: {},
  };
  const path: GridPosition[] = [
    ...Array.from({ length: 10 }, (_, index) => ({ x: index + 6, y: 4 })),
    ...Array.from({ length: 5 }, (_, index) => ({ x: 15, y: index + 5 })),
  ];
  return {
    id: "fixture-plan",
    width: parameters.width,
    height: parameters.height,
    generation: {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      seed: 24680,
      profile: "ancient-temple",
      algorithm: "bsp",
      parameters,
      settings: {},
      generatedAt: "2025-01-01T00:00:00.000Z",
    },
    rooms: [entryRoom, objectiveRoom],
    connections: [{
      id: "connection-main",
      sourceRoomId: entryRoom.id,
      targetRoomId: objectiveRoom.id,
      connectionType: "corridor",
      width: 1,
      path,
      isSecret: false,
      isLocked: false,
      isBlocked: false,
      isOptional: false,
      isMainPath: true,
      metadata: {},
    }],
    sectors: [
      {
        id: "sector-entry",
        name: "Entrada",
        roomIds: [entryRoom.id],
        sectorType: "central",
        metadata: {},
      },
      {
        id: "sector-ritual",
        name: "Núcleo ritualístico",
        roomIds: [objectiveRoom.id],
        sectorType: "ritualistic",
        metadata: {},
      },
    ],
    entryRoomId: entryRoom.id,
    exitRoomId: objectiveRoom.id,
    objectiveRoomId: objectiveRoom.id,
    intersections: [],
    transitions: [
      {
        id: "transition-door",
        type: "doorway",
        position: { x: 8, y: 4 },
        connectionId: "connection-main",
        metadata: {},
      },
      {
        id: "transition-stairs",
        type: "stairs-up",
        position: { x: 4, y: 4 },
        roomId: entryRoom.id,
        metadata: {},
      },
    ],
    features: [
      {
        id: "feature-pressure-plate",
        type: "trap",
        trapType: "pressurePlate",
        position: { x: 17, y: 12 },
        roomId: objectiveRoom.id,
        metadata: {},
      },
    ],
    metadata: {},
  };
}

function issueCodes(plan: GenerationPlan): string[] {
  return validateGenerationPlan(plan).issues.map((issue) => issue.code);
}

describe("GenerationPlan", () => {
  it("creates deterministic IDs scoped to a plan and entity kind", () => {
    expect(createStableGenerationId("fixture-plan", "room", 7))
      .toBe("fixture-plan:room:0007");
    expect(createStableGenerationId("fixture-plan", "room", 7))
      .toBe(createStableGenerationId("fixture-plan", "room", 7));
    expect(() => createStableGenerationId("fixture-plan", "room", -1)).toThrow(RangeError);
  });

  it("keeps structural room roles separate from thematic room categories", () => {
    const plan = createValidPlan();
    expect(plan.rooms[1].roomRole).toBe("objective");
    expect(plan.rooms[1].roomType).toBe("religious");
    expect(validateGenerationPlan(plan).valid).toBe(true);
  });

  it("accepts a structurally valid plan with explicit geometry", () => {
    expect(validateGenerationPlan(createValidPlan())).toEqual({ valid: true, issues: [] });
  });

  it("rejects a room footprint with disconnected floor regions", () => {
    const plan = createValidPlan();
    const disconnectedObjective = {
      ...plan.rooms[1],
      footprint: [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 4, y: 4 },
      ],
    };

    expect(issueCodes({ ...plan, rooms: [plan.rooms[0], disconnectedObjective] }))
      .toContain("invalid-room-footprint");
  });

  it("rejects a plan whose room count differs from the requested count", () => {
    const plan = createValidPlan();
    const incompletePlan = {
      ...plan,
      generation: {
        ...plan.generation,
        parameters: { ...plan.generation.parameters, roomCount: 6 },
      },
    };

    expect(issueCodes(incompletePlan)).toContain("room-count-mismatch");
    expect(() => generationPlanToDungeon(incompletePlan)).toThrow(GenerationPlanValidationError);
  });

  it("allows distinct parallel paths between the same rooms", () => {
    const plan = createValidPlan();
    const alternativePath = [
      ...Array.from({ length: 9 }, (_, index) => ({ x: index + 6, y: 5 })),
      ...Array.from({ length: 5 }, (_, index) => ({ x: 14, y: index + 6 })),
      { x: 15, y: 10 },
    ];
    const alternativeConnection = {
      ...plan.connections[0],
      id: "connection-alternative",
      path: alternativePath,
      isMainPath: false,
      isOptional: true,
    };
    const result = validateGenerationPlan({
      ...plan,
      connections: [...plan.connections, alternativeConnection],
    });

    expect(result.valid).toBe(true);
  });

  it("allows explicitly marked parallel copies of a connection", () => {
    const plan = createValidPlan();
    const parallelConnection = {
      ...plan.connections[0],
      id: "connection-parallel",
      metadata: { allowParallel: true },
    };

    expect(validateGenerationPlan({
      ...plan,
      connections: [...plan.connections, parallelConnection],
    }).valid).toBe(true);
  });

  it("reports duplicated room IDs", () => {
    const plan = createValidPlan();
    const duplicateRoom = { ...plan.rooms[1], id: plan.rooms[0].id };
    expect(issueCodes({ ...plan, rooms: [plan.rooms[0], duplicateRoom] }))
      .toContain("duplicate-entity-id");
  });

  it("reports missing connection endpoints and duplicate edges", () => {
    const plan = createValidPlan();
    const missingRoomEdge = {
      ...plan.connections[0],
      targetRoomId: "missing-room",
    };
    expect(issueCodes({ ...plan, connections: [missingRoomEdge] }))
      .toContain("connection-room-not-found");

    const duplicateEdge = { ...plan.connections[0], id: "connection-copy" };
    expect(issueCodes({ ...plan, connections: [...plan.connections, duplicateEdge] }))
      .toContain("duplicate-connection");
  });

  it("reports invalid dimensions, overlapping footprints, and invalid sectors", () => {
    const plan = createValidPlan();
    const invalidDimensions = {
      ...plan.rooms[0],
      width: 0,
    };
    expect(issueCodes({ ...plan, rooms: [invalidDimensions, plan.rooms[1]] }))
      .toContain("invalid-room-dimensions");

    const borderRoom = {
      ...plan.rooms[0],
      position: { x: 0, y: 2 },
    };
    expect(issueCodes({ ...plan, rooms: [borderRoom, plan.rooms[1]] }))
      .toContain("invalid-room-position");

    const overlappingRoom = {
      ...plan.rooms[1],
      position: { x: 6, y: 4 },
    };
    expect(issueCodes({ ...plan, rooms: [plan.rooms[0], overlappingRoom] }))
      .toContain("overlapping-room-footprints");

    const invalidSectorRoom = {
      ...plan.rooms[1],
      sectorId: "missing-sector",
    };
    expect(issueCodes({ ...plan, rooms: [plan.rooms[0], invalidSectorRoom] }))
      .toContain("invalid-sector-reference");
  });

  it("rejects plans whose dimensions exceed the shared map budget", () => {
    const plan = createValidPlan();
    const width = MAX_DUNGEON_WIDTH + 1;
    const oversizedPlan = {
      ...plan,
      width,
      generation: {
        ...plan.generation,
        parameters: { ...plan.generation.parameters, width },
      },
    };

    expect(issueCodes(oversizedPlan)).toContain("invalid-plan-dimensions");
  });

  it("requires paths for geometric connections and links for required rooms", () => {
    const plan = createValidPlan();
    const missingPathConnection = { ...plan.connections[0], path: [] };
    expect(issueCodes({ ...plan, connections: [missingPathConnection] }))
      .toContain("connection-path-required");
    expect(issueCodes({ ...plan, connections: [] }))
      .toContain("required-room-unconnected");
  });

  it("converts a plan into the legacy Dungeon contract for the existing renderers", () => {
    const plan = createValidPlan();
    const dungeon = generationPlanToDungeon(plan);

    expect(dungeon.width).toBe(plan.width);
    expect(dungeon.height).toBe(plan.height);
    expect(dungeon.tiles).toHaveLength(plan.height);
    expect(dungeon.tiles.every((row) => row.length === plan.width)).toBe(true);
    expect(dungeon.tiles[3][3]).toBe(FLOOR_TILE);
    expect(dungeon.tiles[4][8]).toBe(DOOR_TILE);
    expect(dungeon.tiles[4][10]).toBe(2);
    expect(dungeon.tiles[4][4]).toBe(STAIRS_UP_TILE);
    expect(dungeon.tiles[12][17]).toBe(TRAP_DEFINITIONS.pressurePlate.tile);
    expect(dungeon.roomDetails[1].roomType.category).toBe("religious");
    expect(dungeon.roomDetails[1].shape).toBe("octagonal");
    expect(dungeon.traps).toEqual([{ type: "pressurePlate", x: 17, y: 12 }]);
    expect(dungeon.floorCount).toBe(
      dungeon.tiles.flat().filter(
        (tile) => tile !== 0 && tile !== CAVE_CONNECTION_WALL_TILE,
      ).length,
    );

    const commonProps = {
      dungeon,
      generationKey: dungeon,
      focusRequest: null,
      onRoomSelect: () => undefined,
      onClearSelection: () => undefined,
      showWater: true,
      showLava: true,
      onToggleWater: () => undefined,
      onToggleLava: () => undefined,
    };
    const twoDimensional = createElement(DungeonCanvas, {
      ...commonProps,
      onRoomMove: () => undefined,
      onRoomMoveEnd: () => undefined,
    });
    const threeDimensional = createElement(DungeonThreeCanvas, {
      ...commonProps,
      onBackTo2D: () => undefined,
    });
    expect(twoDimensional.type).toBe(DungeonCanvas);
    expect(threeDimensional.type).toBe(DungeonThreeCanvas);
    for (const tile of new Set(dungeon.tiles.flat())) {
      expect(() => getTileColor(tile)).not.toThrow();
    }
  });

  it("rejects vertical connections that the single-floor Dungeon cannot represent", () => {
    const plan = createValidPlan();
    const verticalPlan: GenerationPlan = {
      ...plan,
      rooms: plan.rooms.map((room) => (
        room.id === plan.exitRoomId ? { ...room, floorId: "floor-2" } : room
      )),
      connections: plan.connections.map((edge) => ({
        ...edge,
        connectionType: "vertical",
      })),
    };

    expect(() => generationPlanToDungeon(verticalPlan))
      .toThrow(/vertical connection .*single-floor Dungeon representation/i);
  });

  it("rejects invalid plans with structured validation details", () => {
    const plan = createValidPlan();
    const invalidPlan = {
      ...plan,
      connections: [],
    };

    try {
      generationPlanToDungeon(invalidPlan);
      throw new Error("Expected invalid GenerationPlan to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationPlanValidationError);
      if (!(error instanceof GenerationPlanValidationError)) throw error;
      expect(error.issues.map((issue) => issue.code)).toContain("required-room-unconnected");
    }
  });
});
