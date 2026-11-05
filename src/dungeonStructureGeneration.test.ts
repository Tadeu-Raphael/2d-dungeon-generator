import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V2,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
} from "./dungeon";
import {
  createDungeonLevelPipelineRequest,
  deriveNearbyLevelSize,
  generateDungeonStructure,
} from "./dungeonStructureGeneration";
import type {
  DungeonLevelGenerationConfig,
  DungeonStructureGenerationRequest,
} from "./dungeonStructureGeneration";
import {
  MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE,
} from "./dungeonStructure";
import type { DungeonStructure } from "./dungeonStructure";
import type { CustomDungeonProfile } from "./dungeonProfiles";
import {
  analyzeDungeonConnectivity,
  validateDungeonStructure,
} from "./dungeonStructureValidation";

function createLevels(): DungeonLevelGenerationConfig[] {
  return [
    {
      name: "Subsolo",
      verticalIndex: -1,
      width: 64,
      height: 48,
      roomCount: 6,
      topologyStyle: "linear",
      spatialLayoutStyle: "axis-branches",
    },
    {
      name: "Nível principal",
      verticalIndex: 0,
      width: 60,
      height: 52,
      roomCount: 5,
      topologyStyle: "branching",
      spatialLayoutStyle: "clusters",
    },
  ];
}

function createRequest(
  overrides: Partial<DungeonStructureGenerationRequest> = {},
): DungeonStructureGenerationRequest {
  return {
    seed: 83002,
    profile: "military-fortress",
    parameters: {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 64,
      height: 48,
      roomCount: 6,
      corridorWidth: 1,
      entranceMode: "upper-stairs",
    },
    levels: createLevels(),
    entryLevelIndex: 1,
    verticalConnectionCount: 1,
    allowedVerticalConnectionKinds: ["stairs"],
    requireGlobalConnectivity: true,
    allowVerticalCycles: false,
    ...overrides,
  };
}

function expectStairConnectionsArePaired(structure: DungeonStructure): void {
  for (const connection of structure.verticalConnections) {
    if (connection.kind !== "stairs" && connection.kind !== "spiral-stairs") continue;
    const sourceLevelIndex = structure.levels.findIndex(
      (level) => level.id === connection.sourceLevelId,
    );
    const targetLevelIndex = structure.levels.findIndex(
      (level) => level.id === connection.targetLevelId,
    );
    expect(Math.abs(sourceLevelIndex - targetLevelIndex)).toBe(1);
    expect(
      Math.abs(connection.sourcePosition.x - connection.targetPosition.x)
      + Math.abs(connection.sourcePosition.y - connection.targetPosition.y),
    ).toBeLessThanOrEqual(MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE);

    const sourceLevel = structure.levels[sourceLevelIndex];
    const targetLevel = structure.levels[targetLevelIndex];
    expect(sourceLevel).toBeDefined();
    expect(targetLevel).toBeDefined();
    const lowerLevel = sourceLevel!.verticalIndex < targetLevel!.verticalIndex
      ? sourceLevel!
      : targetLevel!;
    const upperLevel = sourceLevel!.verticalIndex > targetLevel!.verticalIndex
      ? sourceLevel!
      : targetLevel!;
    const lowerPosition = lowerLevel.id === connection.sourceLevelId
      ? connection.sourcePosition
      : connection.targetPosition;
    const upperPosition = upperLevel.id === connection.sourceLevelId
      ? connection.sourcePosition
      : connection.targetPosition;

    expect(lowerLevel.plan.transitions.some((transition) => (
      transition.verticalConnectionId === connection.id
      && transition.type === "stairs-up"
      && transition.position.x === lowerPosition.x
      && transition.position.y === lowerPosition.y
    ))).toBe(true);
    expect(upperLevel.plan.transitions.some((transition) => (
      transition.verticalConnectionId === connection.id
      && transition.type === "stairs-down"
      && transition.position.x === upperPosition.x
      && transition.position.y === upperPosition.y
    ))).toBe(true);
  }

  for (const level of structure.levels) {
    for (const transition of level.plan.transitions) {
      if (transition.type !== "stairs-down") continue;
      expect(structure.verticalConnections.some((connection) => (
        connection.id === transition.verticalConnectionId
        && (connection.kind === "stairs" || connection.kind === "spiral-stairs")
      ))).toBe(true);
    }
  }
}

describe("multilevel dungeon generation", () => {
  it("generates two V2 levels with matching vertical endpoints and global reachability", () => {
    const result = generateDungeonStructure(createRequest());
    const validation = validateDungeonStructure(result.structure);
    const connection = result.structure.verticalConnections[0];
    expect(result.structure.levels).toHaveLength(2);
    expect(result.levels).toHaveLength(2);
    expect(result.levels.every(
      ({ generation }) => generation.metadata.generatorVersion === DUNGEON_GENERATOR_VERSION_V2,
    )).toBe(true);
    expect(validation.valid).toBe(true);
    expect(result.connectivity.reachableLevelIds).toHaveLength(2);
    expect(connection).toBeDefined();
    expectStairConnectionsArePaired(result.structure);

    for (const [levelId, position] of [
      [connection!.sourceLevelId, connection!.sourcePosition],
      [connection!.targetLevelId, connection!.targetPosition],
    ] as const) {
      const level = result.structure.levels.find((candidate) => candidate.id === levelId);
      expect(level?.plan.transitions.some((transition) => (
        transition.verticalConnectionId === connection!.id
        && transition.position.x === position.x
        && transition.position.y === position.y
      ))).toBe(true);
      const generated = result.levels.find((candidate) => candidate.levelId === levelId);
      const verticalIndex = level?.verticalIndex ?? 0;
      const targetLevel = result.structure.levels.find(
        (candidate) => candidate.id === (levelId === connection!.sourceLevelId
          ? connection!.targetLevelId
          : connection!.sourceLevelId),
      );
      const expectedTile = (targetLevel?.verticalIndex ?? verticalIndex) > verticalIndex
        ? STAIRS_UP_TILE
        : STAIRS_DOWN_TILE;
      expect(generated?.generation.dungeon.tiles[position.y]?.[position.x]).toBe(expectedTile);
    }
  });

  it("supports three differently sized levels, distinct topologies, and vertical cycles", () => {
    const levels = [
      ...createLevels(),
      {
        name: "Torre",
        verticalIndex: 1,
        width: 56,
        height: 44,
        roomCount: 4,
        topologyStyle: "circuit" as const,
        spatialLayoutStyle: "ring" as const,
      },
    ];
    const result = generateDungeonStructure(createRequest({
      levels,
      entryLevelIndex: 1,
      verticalConnectionCount: 3,
      allowVerticalCycles: true,
    }));

    expect(result.structure.levels.map((level) => [
      level.plan.width,
      level.plan.height,
      level.plan.topology?.style,
    ])).toEqual([
      [64, 48, "linear"],
      [60, 52, "branching"],
      [56, 44, "circuit"],
    ]);
    expect(result.connectivity.reachableLevelIds).toHaveLength(3);
    expect(result.connectivity.cycleCount).toBe(1);
    expect(result.structure.verticalConnections).toHaveLength(3);
  });

  it("audits five vertical levels with mixed elevations, secrets, and global connectivity", () => {
    const request = createRequest({
      seed: 94105,
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 80,
        height: 56,
        roomCount: 6,
        corridorWidth: 1,
        entranceMode: "upper-stairs",
      },
      levels: [
        {
          name: "Galerias secretas",
          verticalIndex: -3,
          width: 60,
          height: 44,
          roomCount: 4,
          topologyStyle: "linear",
          spatialLayoutStyle: "axis-branches",
          isSecret: true,
        },
        {
          name: "Cripta inferior",
          verticalIndex: -2,
          width: 64,
          height: 48,
          roomCount: 5,
          topologyStyle: "branching",
          spatialLayoutStyle: "clusters",
        },
        {
          name: "Nível principal",
          verticalIndex: 0,
          width: 80,
          height: 56,
          roomCount: 6,
          topologyStyle: "sectorized",
          spatialLayoutStyle: "clusters",
        },
        {
          name: "Torre",
          verticalIndex: 1,
          width: 56,
          height: 44,
          roomCount: 4,
          topologyStyle: "circuit",
          spatialLayoutStyle: "ring",
        },
        {
          name: "Observatório",
          verticalIndex: 3,
          width: 72,
          height: 52,
          roomCount: 5,
          topologyStyle: "centralized",
          spatialLayoutStyle: "central-hub",
          isOptional: true,
        },
      ],
      entryLevelIndex: 2,
      verticalConnectionCount: 6,
      allowedVerticalConnectionKinds: ["stairs", "elevator", "secret-passage"],
      requireGlobalConnectivity: true,
      allowVerticalCycles: true,
    });
    const startedAt = globalThis.performance.now();
    const first = generateDungeonStructure(request);
    const generationMs = globalThis.performance.now() - startedAt;
    const second = generateDungeonStructure(request);
    const validation = validateDungeonStructure(first.structure);
    const generatedRoomCount = first.levels.reduce(
      (total, level) => total + level.generation.dungeon.roomDetails.length,
      0,
    );

    console.log("Five-level audit:", JSON.stringify({
      seed: request.seed,
      levelCount: first.structure.levels.length,
      dimensions: first.structure.levels.map((level) => `${level.plan.width}×${level.plan.height}`),
      requestedRooms: request.levels.reduce((total, level) => total + level.roomCount, 0),
      generatedRooms: generatedRoomCount,
      verticalConnections: first.structure.verticalConnections.length,
      reachableLevels: first.connectivity.reachableLevelIds.length,
      isolatedLevels: first.connectivity.disconnectedLevelIds.length,
      cycles: first.connectivity.cycleCount,
      invalidConnections: validation.issues.length,
      generationMs: generationMs.toFixed(2),
      deterministic: JSON.stringify(first.structure.verticalConnections)
        === JSON.stringify(second.structure.verticalConnections),
    }));

    expect(first.structure.levels).toHaveLength(5);
    expect(first.structure.verticalConnections).toHaveLength(6);
    expect(generatedRoomCount).toBe(24);
    expect(first.connectivity.reachableLevelIds).toHaveLength(5);
    expect(first.connectivity.disconnectedLevelIds).toHaveLength(0);
    expect(first.connectivity.cycleCount).toBeGreaterThan(0);
    expect(validation.valid).toBe(true);
    expect(first.structure.verticalConnections).toEqual(second.structure.verticalConnections);
    expect(first.levels.map(({ generation }) => generation.dungeon))
      .toEqual(second.levels.map(({ generation }) => generation.dungeon));
    expectStairConnectionsArePaired(first.structure);
  });

  it("supports multiple vertical connections between the same pair of levels", () => {
    const result = generateDungeonStructure(createRequest({
      verticalConnectionCount: 2,
      allowedVerticalConnectionKinds: ["stairs", "elevator"],
      allowVerticalCycles: true,
    }));
    const [first, second] = result.structure.verticalConnections;

    expect(result.structure.verticalConnections).toHaveLength(2);
    expect(first?.sourceLevelId).toBe(second?.sourceLevelId);
    expect(first?.targetLevelId).toBe(second?.targetLevelId);
    expect(first?.sourcePosition).not.toEqual(second?.sourcePosition);
    expect(first?.targetPosition).not.toEqual(second?.targetPosition);
    expect(result.connectivity.cycleCount).toBe(1);
    expect(result.connectivity.reachableLevelIds).toHaveLength(2);
  });

  it("uses a custom profile globally and allows a different custom profile per level", () => {
    const mainProfile: CustomDungeonProfile = {
      id: "custom-main-level",
      name: "Nível defensivo",
      baseProfile: "military-fortress",
      topology: { style: "sectorized" },
    };
    const upperProfile: CustomDungeonProfile = {
      id: "custom-upper-level",
      name: "Torre ritual",
      baseProfile: "ancient-temple",
      topology: { style: "circuit" },
    };
    const levels = createLevels().map((level, index) => ({
      ...level,
      topologyStyle: undefined,
      spatialLayoutStyle: undefined,
      ...(index === 1
        ? { profile: "custom" as const, customProfile: upperProfile }
        : {}),
    }));
    const result = generateDungeonStructure(createRequest({
      profile: "custom",
      customProfile: mainProfile,
      levels,
    }));

    expect(result.structure.settings.profile).toBe(mainProfile.id);
    expect(result.levels.map(({ generation }) => generation.metadata.profile)).toEqual([
      mainProfile.id,
      upperProfile.id,
    ]);
    expect(result.structure.levels.map((level) => level.plan.topology?.style)).toEqual([
      "sectorized",
      "circuit",
    ]);
    expect(result.connectivity.reachableLevelIds).toHaveLength(2);
  });

  it("reports isolated levels when global connectivity is optional", () => {
    const result = generateDungeonStructure(createRequest({
      levels: [
        ...createLevels(),
        {
          name: "Área secreta",
          verticalIndex: 1,
          width: 52,
          height: 44,
          roomCount: 4,
          topologyStyle: "centralized",
          spatialLayoutStyle: "central-hub",
          isSecret: true,
        },
      ],
      entryLevelIndex: 2,
      verticalConnectionCount: 1,
      requireGlobalConnectivity: false,
    }));
    const connectivity = analyzeDungeonConnectivity(result.structure);

    expect(validateDungeonStructure(result.structure).valid).toBe(true);
    expect(connectivity.reachableLevelIds).toEqual([result.structure.levels[2]?.id]);
    expect(connectivity.disconnectedLevelIds).toEqual([
      result.structure.levels[0]?.id,
      result.structure.levels[1]?.id,
    ]);
    expect(connectivity.isolatedLevelIds).toEqual([result.structure.levels[2]?.id]);
  });

  it("is deterministic and derives stable independent seeds by vertical index", () => {
    const request = createRequest();
    const first = generateDungeonStructure(request);
    const second = generateDungeonStructure(request);
    const firstLevelRequest = createDungeonLevelPipelineRequest(request, request.levels[0]!);
    const changedOtherLevelRequest = createDungeonLevelPipelineRequest({
      ...request,
      levels: [
        request.levels[0]!,
        { ...request.levels[1]!, width: 80, roomCount: 7 },
      ],
    }, request.levels[0]!);

    expect(first.levels.map(({ generation }) => generation.dungeon))
      .toEqual(second.levels.map(({ generation }) => generation.dungeon));
    expect(first.structure.verticalConnections).toEqual(second.structure.verticalConnections);
    expect(firstLevelRequest.seed).toBe(changedOtherLevelRequest.seed);
    expect(firstLevelRequest.seed).not.toBe(request.seed);
  });

  it("rejects insufficient links and tile budgets", () => {
    expect(() => generateDungeonStructure(createRequest({
      verticalConnectionCount: 0,
    }))).toThrow(/at least one vertical connection per additional level/);
    expect(() => generateDungeonStructure(createRequest({
      levels: createLevels().map((level) => ({ ...level, width: 1_000, height: 600 })),
    }))).toThrow(/area must not exceed|tiles across all levels/);
  });

  it("can link non-adjacent levels when long vertical connections are allowed", () => {
    const levels = [-2, -1, 0, 1].map((verticalIndex) => ({
      name: `Nível ${verticalIndex}`,
      verticalIndex,
      width: 64,
      height: 48,
      roomCount: 5,
    }));
    let skipping = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const result = generateDungeonStructure(createRequest({
        seed,
        levels,
        entryLevelIndex: 3,
        verticalConnectionCount: 3,
        allowedVerticalConnectionKinds: ["vertical-shaft", "elevator", "stairs"],
        allowLongVerticalConnections: true,
      }));
      expect(validateDungeonStructure(result.structure).valid).toBe(true);
      expect(result.connectivity.disconnectedLevelIds).toHaveLength(0);
      const indexOf = (id: string) => result.structure.levels.findIndex((level) => level.id === id);
      for (const connection of result.structure.verticalConnections) {
        const distance = Math.abs(indexOf(connection.sourceLevelId) - indexOf(connection.targetLevelId));
        if (distance > 1) {
          skipping += 1;
          expect(["stairs", "spiral-stairs"]).not.toContain(connection.kind);
        }
      }
    }
    expect(skipping).toBeGreaterThan(0);
  });

  it("keeps stairs between adjacent levels even when long connections are allowed", () => {
    const result = generateDungeonStructure(createRequest({
      allowLongVerticalConnections: true,
      allowedVerticalConnectionKinds: ["stairs"],
    }));
    expectStairConnectionsArePaired(result.structure);
  });

  it("generates cave levels and anchors some vertical connections in caves", () => {
    let caveAnchors = 0;
    for (const seed of [31, 32, 33, 34, 35, 36, 37, 38]) {
      const result = generateDungeonStructure(createRequest({
        seed,
        cavesEnabled: true,
        verticalConnectionCount: 2,
        allowVerticalCycles: true,
        allowedVerticalConnectionKinds: ["vertical-shaft", "drop", "ramp"],
      }));
      expect(validateDungeonStructure(result.structure).valid).toBe(true);
      for (const level of result.structure.levels) {
        expect(level.plan.naturalRegions?.length ?? 0).toBeGreaterThan(0);
        caveAnchors += level.plan.transitions.filter((transition) => (
          transition.verticalConnectionId && transition.regionId
        )).length;
      }
    }
    expect(caveAnchors).toBeGreaterThan(0);
  });

  it("supports a natural cavern as a level of a multilevel dungeon", () => {
    const result = generateDungeonStructure(createRequest({
      levels: [
        { ...createLevels()[0]!, profile: "natural-cavern" },
        createLevels()[1]!,
      ],
      allowedVerticalConnectionKinds: ["vertical-shaft", "ramp"],
    }));
    const cavernLevel = result.structure.levels[0]!;
    expect(cavernLevel.plan.rooms).toHaveLength(0);
    expect(validateDungeonStructure(result.structure).valid).toBe(true);
    expect(cavernLevel.plan.transitions.some((transition) => (
      transition.verticalConnectionId && transition.regionId
    ))).toBe(true);
    expect(result.connectivity.disconnectedLevelIds).toHaveLength(0);
  });

  it("derives deterministic level sizes close to the main level", () => {
    const main = { width: 100, height: 80, roomCount: 16 };
    const first = deriveNearbyLevelSize(77, -1, main);

    expect(deriveNearbyLevelSize(77, -1, main)).toEqual(first);
    expect(Math.abs(first.width - main.width)).toBeLessThanOrEqual(main.width * 0.19);
    expect(Math.abs(first.height - main.height)).toBeLessThanOrEqual(main.height * 0.19);
    expect(Math.abs(first.roomCount - main.roomCount)).toBeLessThanOrEqual(main.roomCount * 0.26 + 1);
    const sizes = [-3, -2, -1, 1, 2].map((index) => deriveNearbyLevelSize(77, index, main));
    expect(new Set(sizes.map((size) => `${size.width}x${size.height}x${size.roomCount}`)).size).toBeGreaterThan(1);
  });
});
