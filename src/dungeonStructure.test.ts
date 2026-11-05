import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V2,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import {
  createStableGenerationId,
} from "./generationPlan";
import type { GenerationPlan, GridPosition, PlanTransition, RoomNode } from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import {
  dungeonStructureToDungeon,
} from "./dungeonStructureToDungeon";
import type {
  DungeonLevel,
  DungeonStructure,
  VerticalConnection,
} from "./dungeonStructure";
import { MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE } from "./dungeonStructure";
import { validateDungeonStructure } from "./dungeonStructureValidation";

function createFootprint(width: number, height: number): GridPosition[] {
  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => ({ x, y }))
  )).flat();
}

function createLevelPlan(
  levelId: string,
  width = 24,
  height = 20,
  seed = 24680,
): GenerationPlan {
  const planId = `${levelId}:plan`;
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width,
    height,
    roomCount: 2,
  };
  const entryRoomId = createStableGenerationId(planId, "room", 0);
  const objectiveRoomId = createStableGenerationId(planId, "room", 1);
  const entrySectorId = createStableGenerationId(planId, "sector", 0);
  const objectiveSectorId = createStableGenerationId(planId, "sector", 1);
  const mainConnectionId = createStableGenerationId(planId, "connection", 0);
  const entryRoom: RoomNode = {
    id: entryRoomId,
    roomType: "exploration",
    roomRole: "entrance",
    width: 5,
    height: 5,
    position: { x: 2, y: 2 },
    shape: "rectangular",
    footprint: createFootprint(5, 5),
    sectorId: entrySectorId,
    floorId: levelId,
    importance: 1,
    isRequired: true,
    metadata: {},
  };
  const objectiveRoom: RoomNode = {
    id: objectiveRoomId,
    roomType: "religious",
    roomRole: "objective",
    width: 5,
    height: 5,
    position: { x: 15, y: 10 },
    shape: "rectangular",
    footprint: createFootprint(5, 5),
    sectorId: objectiveSectorId,
    floorId: levelId,
    importance: 0.9,
    isRequired: true,
    metadata: {},
  };
  const path: GridPosition[] = [
    ...Array.from({ length: 10 }, (_, index) => ({ x: index + 6, y: 4 })),
    ...Array.from({ length: 5 }, (_, index) => ({ x: 15, y: index + 5 })),
  ];

  return {
    id: planId,
    width,
    height,
    generation: {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      seed,
      profile: "ancient-temple",
      algorithm: "bsp",
      parameters,
      settings: {},
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    rooms: [entryRoom, objectiveRoom],
    connections: [{
      id: mainConnectionId,
      sourceRoomId: entryRoomId,
      targetRoomId: objectiveRoomId,
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
        id: entrySectorId,
        name: "Entrada",
        roomIds: [entryRoomId],
        sectorType: "central",
        metadata: {},
      },
      {
        id: objectiveSectorId,
        name: "Núcleo",
        roomIds: [objectiveRoomId],
        sectorType: "ritualistic",
        metadata: {},
      },
    ],
    entryRoomId,
    exitRoomId: objectiveRoomId,
    objectiveRoomId,
    intersections: [],
    transitions: [
      {
        id: createStableGenerationId(planId, "transition", 0),
        type: "doorway",
        position: { x: 8, y: 4 },
        connectionId: mainConnectionId,
        metadata: {},
      },
      {
        id: createStableGenerationId(planId, "transition", 1),
        type: "stairs-up",
        position: { x: 4, y: 4 },
        roomId: entryRoomId,
        metadata: { role: "entry" },
      },
    ],
    features: [],
    metadata: {},
  };
}

function createLevel(
  dungeonId: string,
  ordinal: number,
  name: string,
  verticalIndex: number,
  width = 24,
  height = 20,
): DungeonLevel {
  const id = createStableGenerationId(dungeonId, "level", ordinal);
  return {
    id,
    name,
    verticalIndex,
    plan: createLevelPlan(id, width, height, 24680 + ordinal),
    metadata: {},
  };
}

function createVerticalConnection(
  dungeonId: string,
  ordinal: number,
  source: DungeonLevel,
  target: DungeonLevel,
  overrides: Partial<VerticalConnection> = {},
): VerticalConnection {
  return {
    id: createStableGenerationId(dungeonId, "vertical-connection", ordinal),
    sourceLevelId: source.id,
    targetLevelId: target.id,
    sourcePosition: { x: 4, y: 4 },
    targetPosition: { x: 4, y: 4 },
    kind: "stairs",
    direction: "bidirectional",
    metadata: {},
    ...overrides,
  };
}

function createStructure(
  levels: readonly DungeonLevel[],
  verticalConnections: readonly VerticalConnection[] = [],
  requireGlobalConnectivity = false,
  entryLevelId = levels[0]?.id,
): DungeonStructure {
  const levelsWithConnectionMarkers = levels.map((level) => {
    const transitions = [...level.plan.transitions];
    for (const connection of verticalConnections) {
      const sourceLevel = levels.find((candidate) => candidate.id === connection.sourceLevelId);
      const targetLevel = levels.find((candidate) => candidate.id === connection.targetLevelId);
      const isStairConnection = connection.kind === "stairs" || connection.kind === "spiral-stairs";
      const markerTypeFor = (otherVerticalIndex: number | undefined): PlanTransition["type"] => (
        isStairConnection && otherVerticalIndex !== undefined
          ? otherVerticalIndex > level.verticalIndex ? "stairs-up" : "stairs-down"
          : "vertical-connection"
      );
      const endpoints: Array<{
        id: string;
        position: GridPosition;
        kind: VerticalConnection["kind"];
        type: PlanTransition["type"];
      }> = [];
      if (connection.sourceLevelId === level.id) {
        endpoints.push({
          id: connection.id,
          position: connection.sourcePosition,
          kind: connection.kind,
          type: markerTypeFor(targetLevel?.verticalIndex),
        });
      }
      if (connection.targetLevelId === level.id) {
        endpoints.push({
          id: connection.id,
          position: connection.targetPosition,
          kind: connection.kind,
          type: markerTypeFor(sourceLevel?.verticalIndex),
        });
      }
      for (const endpoint of endpoints) {
        const room = level.plan.rooms.find((candidate) => candidate.footprint.some((cell) => (
          candidate.position.x + cell.x === endpoint.position.x
          && candidate.position.y + cell.y === endpoint.position.y
        )));
        if (!room) continue;
        const transitionIndex = transitions.findIndex((transition) => (
          transition.position.x === endpoint.position.x
          && transition.position.y === endpoint.position.y
        ));
        const existing = transitionIndex >= 0 ? transitions[transitionIndex] : undefined;
        const marker: PlanTransition = {
          ...(existing ?? {
            id: createStableGenerationId(level.plan.id, "transition", transitions.length),
            type: endpoint.type,
            position: endpoint.position,
            metadata: {},
          }),
          type: endpoint.type,
          position: endpoint.position,
          roomId: room.id,
          verticalConnectionId: endpoint.id,
          metadata: { ...(existing?.metadata ?? {}), kind: endpoint.kind },
        };
        if (transitionIndex >= 0) transitions[transitionIndex] = marker;
        else transitions.push(marker);
      }
    }
    return { ...level, plan: { ...level.plan, transitions } };
  });
  return {
    id: "fixture-dungeon",
    name: "Fortaleza de teste",
    generation: {
      seed: 24680,
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    settings: { difficulty: "normal" },
    connectivity: { requireGlobalConnectivity, entryLevelId },
    levels: levelsWithConnectionMarkers,
    verticalConnections,
    metadata: {},
  };
}

function issueCodes(structure: DungeonStructure): string[] {
  return validateDungeonStructure(structure).issues.map((issue) => issue.code);
}

describe("DungeonStructure", () => {
  it("uses stable IDs for levels and vertical connections", () => {
    expect(createStableGenerationId("fixture-dungeon", "level", 0))
      .toBe("fixture-dungeon:level:0000");
    expect(createStableGenerationId("fixture-dungeon", "vertical-connection", 2))
      .toBe("fixture-dungeon:vertical-connection:0002");
    expect(createStableGenerationId("fixture-dungeon", "vertical-connection", 2))
      .toBe(createStableGenerationId("fixture-dungeon", "vertical-connection", 2));
  });

  it("accepts a single level and preserves the existing GenerationPlan adapter result", () => {
    const level = createLevel("fixture-dungeon", 0, "Principal", 0);
    const structure = createStructure([level], [], true, level.id);

    expect(validateDungeonStructure(structure)).toEqual({ valid: true, issues: [] });
    expect(dungeonStructureToDungeon(structure)).toEqual(generationPlanToDungeon(level.plan));
  });

  it("accepts two connected levels with different dimensions", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1, 24, 20);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0, 30, 24);
    const connection = createVerticalConnection("fixture-dungeon", 0, ground, basement);
    const structure = createStructure([basement, ground], [connection], true, ground.id);

    expect(validateDungeonStructure(structure)).toEqual({ valid: true, issues: [] });
    expect(basement.plan.width).not.toBe(ground.plan.width);
    expect(dungeonStructureToDungeon(structure, ground.id).width).toBe(30);
  });

  it("accepts several levels and multiple connections between the same levels", () => {
    const deep = createLevel("fixture-dungeon", 0, "Cripta profunda", -2);
    const basement = createLevel("fixture-dungeon", 1, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 2, "Principal", 0);
    const connections = [
      createVerticalConnection("fixture-dungeon", 0, ground, basement),
      createVerticalConnection("fixture-dungeon", 1, ground, basement, {
        kind: "elevator",
        sourcePosition: { x: 5, y: 5 },
        targetPosition: { x: 5, y: 5 },
        accessRequirements: ["power-restored"],
      }),
      createVerticalConnection("fixture-dungeon", 2, basement, deep, {
        kind: "spiral-stairs",
        sourcePosition: { x: 5, y: 4 },
        targetPosition: { x: 5, y: 4 },
      }),
    ];
    const structure = createStructure([deep, basement, ground], connections, true, ground.id);

    expect(validateDungeonStructure(structure)).toEqual({ valid: true, issues: [] });
  });

  it("rejects stair connections that skip an intermediate level", () => {
    const deep = createLevel("fixture-dungeon", 0, "Cripta profunda", -2);
    const basement = createLevel("fixture-dungeon", 1, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 2, "Principal", 0);
    const connection = createVerticalConnection("fixture-dungeon", 0, deep, ground);

    expect(issueCodes(createStructure([deep, basement, ground], [connection])))
      .toContain("vertical-stairs-not-adjacent");
  });

  it("rejects stair landings that are too far apart", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);
    const connection = createVerticalConnection("fixture-dungeon", 0, ground, basement, {
      targetPosition: { x: 17, y: 12 },
    });
    const distance = Math.abs(connection.sourcePosition.x - connection.targetPosition.x)
      + Math.abs(connection.sourcePosition.y - connection.targetPosition.y);

    expect(distance).toBeGreaterThan(MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE);
    expect(issueCodes(createStructure([basement, ground], [connection])))
      .toContain("vertical-stairs-too-far-apart");
  });

  it("rejects a down staircase with no paired vertical connection", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);
    const unpairedStairsDown: PlanTransition = {
      id: createStableGenerationId(basement.plan.id, "transition", 2),
      type: "stairs-down",
      position: { x: 17, y: 12 },
      roomId: basement.plan.rooms[1]?.id,
      metadata: { role: "exit" },
    };
    const basementWithUnpairedStairs = {
      ...basement,
      plan: {
        ...basement.plan,
        transitions: [...basement.plan.transitions, unpairedStairsDown],
      },
    };

    expect(issueCodes(createStructure([basementWithUnpairedStairs, ground], [], false, ground.id)))
      .toContain("unpaired-stair-transition");
  });

  it("rejects duplicated level and vertical-connection IDs", () => {
    const first = createLevel("fixture-dungeon", 0, "Principal", 0);
    const second = createLevel("fixture-dungeon", 1, "Subsolo", 1);
    const duplicateLevel = { ...second, id: first.id };
    const connection = createVerticalConnection("fixture-dungeon", 0, first, second);
    const duplicateConnection = { ...connection };

    expect(issueCodes(createStructure([first, duplicateLevel], [connection, duplicateConnection])))
      .toEqual(expect.arrayContaining(["duplicate-level-id", "invalid-vertical-connection"]));
  });

  it("rejects duplicate room IDs across level plans", () => {
    const first = createLevel("fixture-dungeon", 0, "Principal", 0);
    const second = createLevel("fixture-dungeon", 1, "Subsolo", 1);
    const duplicatedRoomPlan = {
      ...second.plan,
      rooms: second.plan.rooms.map((room, index) => (
        index === 0 ? { ...room, id: first.plan.rooms[0].id } : room
      )),
    };

    expect(issueCodes(createStructure([first, { ...second, plan: duplicatedRoomPlan }])))
      .toContain("duplicate-entity-id-across-levels");
  });

  it("rejects connections that reference missing levels or the same level twice", () => {
    const level = createLevel("fixture-dungeon", 0, "Principal", 0);
    const missingLevel = createVerticalConnection("fixture-dungeon", 0, level, level, {
      targetLevelId: "missing-level",
    });
    const selfReference = createVerticalConnection("fixture-dungeon", 1, level, level);

    expect(issueCodes(createStructure([level], [missingLevel, selfReference])))
      .toEqual(expect.arrayContaining([
        "vertical-connection-level-not-found",
        "vertical-connection-self-reference",
      ]));
  });

  it("rejects vertical connection positions outside level bounds", () => {
    const first = createLevel("fixture-dungeon", 0, "Principal", 0);
    const second = createLevel("fixture-dungeon", 1, "Subsolo", 1);
    const connection = createVerticalConnection("fixture-dungeon", 0, first, second, {
      sourcePosition: { x: first.plan.width, y: 4 },
    });

    expect(issueCodes(createStructure([first, second], [connection])))
      .toContain("vertical-connection-position-out-of-bounds");
  });

  it("rejects vertical endpoints that do not match walkable level geometry", () => {
    const first = createLevel("fixture-dungeon", 0, "Principal", 0);
    const second = createLevel("fixture-dungeon", 1, "Subsolo", 1);
    const connection = createVerticalConnection("fixture-dungeon", 0, first, second, {
      sourcePosition: { x: 10, y: 15 },
    });

    expect(issueCodes(createStructure([first, second], [connection])))
      .toContain("vertical-connection-anchor-missing");
  });

  it("rejects levels stored outside their ordered vertical indices", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);

    expect(issueCodes(createStructure([ground, basement])))
      .toContain("levels-not-ordered");
  });

  it("requires every level to be reachable from the configured entry when requested", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);

    expect(issueCodes(createStructure([basement, ground], [], true, ground.id)))
      .toContain("disconnected-levels");
  });

  it("respects one-way vertical connection direction in global reachability", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);
    const connection = createVerticalConnection("fixture-dungeon", 0, basement, ground, {
      direction: "source-to-target",
    });

    expect(issueCodes(createStructure([basement, ground], [connection], true, ground.id)))
      .toContain("disconnected-levels");
  });

  it("rejects a vertical edge embedded in a level's horizontal graph", () => {
    const level = createLevel("fixture-dungeon", 0, "Principal", 0);
    const verticalPlan: GenerationPlan = {
      ...level.plan,
      connections: level.plan.connections.map((connection) => ({
        ...connection,
        connectionType: "vertical",
      })),
    };

    expect(issueCodes(createStructure([{ ...level, plan: verticalPlan }])))
      .toContain("vertical-connection-in-level-plan");
  });

  it("rejects rooms that claim a different level than their owning plan", () => {
    const level = createLevel("fixture-dungeon", 0, "Principal", 0);
    const mismatchedPlan: GenerationPlan = {
      ...level.plan,
      rooms: level.plan.rooms.map((room, index) => (
        index === 0 ? { ...room, floorId: "another-level" } : room
      )),
    };

    expect(issueCodes(createStructure([{ ...level, plan: mismatchedPlan }])))
      .toContain("room-level-mismatch");
  });

  it("requires explicit level selection when adapting a multilevel dungeon to Dungeon.tiles", () => {
    const basement = createLevel("fixture-dungeon", 0, "Subsolo", -1);
    const ground = createLevel("fixture-dungeon", 1, "Principal", 0);
    const structure = createStructure(
      [basement, ground],
      [createVerticalConnection("fixture-dungeon", 0, ground, basement)],
      true,
      ground.id,
    );

    expect(() => dungeonStructureToDungeon(structure))
      .toThrow(/level ID is required/i);
    expect(dungeonStructureToDungeon(structure, basement.id).height).toBe(basement.plan.height);
  });
});
