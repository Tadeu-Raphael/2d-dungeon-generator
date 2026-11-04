import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DungeonCanvas, { createDungeonSvg, getTileColor } from "./DungeonCanvas";
import DungeonThreeCanvas from "./DungeonThreeCanvas";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import { DUNGEON_CONCEPTS, DUNGEON_CONCEPT_ORDER } from "./dungeonProfiles";
import type { DungeonConcept } from "./dungeonProfiles";
import { generateDungeonPipeline } from "./generationPipeline";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import { validateGenerationPlan } from "./generationPlanValidation";
import { validateDungeonTopology } from "./generationTopology";
import {
  DUNGEON_GENERATION_V1_BASELINES,
  createDungeonV1BaselineRequest,
} from "./generationBaselines";

const parameters: DungeonParameters = {
  ...DEFAULT_DUNGEON_PARAMETERS,
  width: 64,
  height: 48,
  roomCount: 8,
};

function generate(
  profile: DungeonConcept,
  overrides: Partial<DungeonGenerationPipelineRequest> = {},
) {
  return generateDungeonPipeline({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile,
    seed: 24681357,
    parameters,
    ...overrides,
  });
}

function areDungeonTilesConnected(
  tiles: readonly (readonly number[])[],
  start: { x: number; y: number },
  target: { x: number; y: number },
): boolean {
  const width = tiles[0]?.length ?? 0;
  const startIndex = start.y * width + start.x;
  const targetIndex = target.y * width + target.x;
  const visited = new Set([startIndex]);
  const queue = [startIndex];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    if (index === targetIndex) return true;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nextX, nextY] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ]) {
      if (
        nextX < 0
        || nextY < 0
        || nextY >= tiles.length
        || nextX >= width
        || tiles[nextY][nextX] === 0
      ) continue;
      const nextIndex = nextY * width + nextX;
      if (visited.has(nextIndex)) continue;
      visited.add(nextIndex);
      queue.push(nextIndex);
    }
  }
  return false;
}

describe("GenerationPlan application pipeline", () => {
  it("recovers all six rooms for the frozen small-fortress seed with bounded attempts", () => {
    const baseline = DUNGEON_GENERATION_V1_BASELINES.find((item) => item.id === "small-fortress-bsp");
    if (!baseline) throw new Error("Missing the frozen small-fortress baseline.");
    const baselineRequest = createDungeonV1BaselineRequest(baseline);
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "military-fortress",
      seed: baseline.seed,
      parameters: baselineRequest.parameters,
    });

    expect(result.metadata.generatorVersion, result.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.plan?.rooms).toHaveLength(6);
    expect(result.dungeon.roomDetails).toHaveLength(6);
    expect(result.roomCountReport).toMatchObject({
      requested: 6,
      generated: 6,
      minimumAcceptable: 2,
      complete: true,
      meetsMinimum: true,
      recipeGenerated: 6,
      recoveryAttempts: expect.any(Number),
      recipeCompactness: expect.any(Number),
    });
    expect(result.roomCountReport?.recoveryAttempts).toBeLessThanOrEqual(5);
    expect(result.metadata.settings).toMatchObject({
      requestedRoomCount: 6,
      generatedRoomCount: 6,
      minimumAcceptableRoomCount: 2,
      roomCountComplete: true,
    });
    expect(validateGenerationPlan(result.plan!).valid).toBe(true);
  });

  it.each([2, 4, 6])("preserves a %i-room request on a 32×24 map", (roomCount) => {
    const baseline = DUNGEON_GENERATION_V1_BASELINES.find((item) => item.id === "small-fortress-bsp");
    if (!baseline) throw new Error("Missing the frozen small-fortress baseline.");
    const baselineRequest = createDungeonV1BaselineRequest(baseline);
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "military-fortress",
      seed: baseline.seed,
      parameters: {
        ...baselineRequest.parameters!,
        roomCount,
      },
    });

    expect(result.roomCountReport?.requested, result.fallbackReason).toBe(roomCount);
    expect(result.roomCountReport?.generated, result.fallbackReason).toBe(roomCount);
    expect(result.roomCountReport?.complete, result.fallbackReason).toBe(true);
    expect(result.dungeon.roomDetails).toHaveLength(roomCount);
    if (result.plan) {
      expect(result.plan.rooms).toHaveLength(roomCount);
      expect(validateGenerationPlan(result.plan).valid).toBe(true);
    }
  });

  it("reports bounded capacity failure when a small map cannot fit the requested rooms", () => {
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "military-fortress",
      seed: 11001,
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 20,
        height: 20,
        roomCount: 24,
      },
    });

    expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.fallbackReason).toMatch(/24 salas solicitadas/);
    expect(result.roomCountReport).toMatchObject({
      requested: 24,
      minimumAcceptable: 2,
      complete: false,
      meetsMinimum: expect.any(Boolean),
      recoveryAttempts: 5,
    });
    expect(result.roomCountReport?.recipeGenerated).toBeLessThan(24);
    expect(result.roomCountReport?.generated).toBe(result.dungeon.roomDetails.length);
    expect(result.roomCountReport?.failureReason).toContain("quantidade mínima aceitável");
    expect(result.metadata.settings).toMatchObject({
      requestedRoomCount: 24,
      generatedRoomCount: result.dungeon.roomDetails.length,
      roomRecipeRoomCount: result.roomCountReport?.recipeGenerated,
      minimumAcceptableRoomCount: 2,
      roomCountComplete: false,
    });
  });

  it.each([
    "linear",
    "branching",
    "circuit",
    "centralized",
    "sectorized",
    "hybrid",
  ] as const)("preserves all requested rooms with %s topology", (topologyStyle) => {
    const baseline = DUNGEON_GENERATION_V1_BASELINES.find((item) => item.id === "medium-temple-bsp-cellular");
    if (!baseline) throw new Error("Missing the frozen temple baseline.");
    const baselineRequest = createDungeonV1BaselineRequest(baseline);
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "ancient-temple",
      seed: baseline.seed,
      parameters: {
        ...baselineRequest.parameters!,
        width: 96,
        height: 72,
      },
      topologyStyle,
    });

    expect(result.metadata.generatorVersion, result.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.plan?.topology?.style).toBe(topologyStyle);
    expect(result.roomCountReport).toMatchObject({
      requested: 12,
      generated: 12,
      complete: true,
    });
    expect(result.dungeon.roomDetails).toHaveLength(12);
  });

  it("integrates every profile while preserving the explicit natural-cavern fallback", () => {
    for (const [index, profile] of DUNGEON_CONCEPT_ORDER.entries()) {
      const result = generate(profile, { seed: 97531000 + index });
      expect(result.metadata.parameters.roomTypeDistributionEnabled).toBe(true);
      expect(result.metadata.parameters.roomTypeCategoryFrequencies)
        .toEqual(DUNGEON_CONCEPTS[profile].roomTypeCategoryFrequencies);
      expect(result.metadata.parameters.trapCategoryWeights)
        .toEqual(DUNGEON_CONCEPTS[profile].trapCategoryWeights);
      expect(result.metadata.parameters.treasureCategoryWeights)
        .toEqual(DUNGEON_CONCEPTS[profile].treasureCategoryWeights);
      if (profile === "natural-cavern") {
        expect(result.requestedGeneratorVersion).toBe(DUNGEON_GENERATOR_VERSION_V2);
        expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
        expect(result.plan).toBeUndefined();
        expect(result.fallbackReason).toMatch(/Caverna natural/);
        continue;
      }

      expect(result.metadata.generatorVersion, `${profile}: ${result.fallbackReason ?? "no fallback reason"}`)
        .toBe(DUNGEON_GENERATOR_VERSION_V2);
      expect(result.plan, `${profile}: ${result.fallbackReason ?? "missing GenerationPlan"}`).toBeDefined();
      expect(result.metadata.parameters.roomSizeDistributionEnabled).toBe(true);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.plan?.rooms).toHaveLength(result.dungeon.roomDetails.length);
      expect(result.plan?.mainPathRoomIds?.length).toBeGreaterThanOrEqual(2);
      expect(result.plan?.rooms.some((room) => room.roomRole === "entrance")).toBe(true);
      expect(result.plan?.rooms.some((room) => room.roomRole === "objective")).toBe(true);
      expect(validateGenerationPlan(result.plan!).valid).toBe(true);
      expect(validateDungeonTopology(result.plan!).valid).toBe(true);
      const entryTransition = result.plan?.transitions.find((transition) => transition.metadata.role === "entry");
      const exitTransition = result.plan?.transitions.find((transition) => transition.metadata.role === "exit");
      expect(entryTransition).toBeDefined();
      expect(exitTransition).toBeDefined();
      expect(areDungeonTilesConnected(
        result.dungeon.tiles,
        entryTransition!.position,
        exitTransition!.position,
      )).toBe(true);
      expect(result.dungeon.tiles).toHaveLength(result.dungeon.height);
      expect(result.dungeon.tiles.every((row) => row.length === result.dungeon.width)).toBe(true);
      for (const tile of new Set(result.dungeon.tiles.flat())) {
        expect(() => getTileColor(tile)).not.toThrow();
      }
    }
  });

  it("keeps the Dungeon contract for PixiJS and Three.js and creates exportable SVG/PNG source", () => {
    const result = generate("military-fortress");
    const commonProps = {
      dungeon: result.dungeon,
      generationKey: result.dungeon,
      focusRequest: null,
      onRoomSelect: () => undefined,
      onClearSelection: () => undefined,
      showWater: true,
      showLava: true,
      onToggleWater: () => undefined,
      onToggleLava: () => undefined,
    };

    expect(createElement(DungeonCanvas, {
      ...commonProps,
      onRoomMove: () => undefined,
      onRoomMoveEnd: () => undefined,
    }).type).toBe(DungeonCanvas);
    expect(createElement(DungeonThreeCanvas, {
      ...commonProps,
      onBackTo2D: () => undefined,
    }).type).toBe(DungeonThreeCanvas);
    expect(result.dungeon.tiles.flat().every((tile) => getTileColor(tile).length === 3)).toBe(true);
    const svg = createDungeonSvg(result.dungeon);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<title>Mapa de masmorra</title>");
    expect(svg).toContain("#a9824d");
  });

  it("repeats V2 graph and tile output for the same seed", () => {
    const first = generate("ancient-temple");
    const second = generate("ancient-temple");

    expect(first.plan?.connections).toEqual(second.plan?.connections);
    expect(first.plan?.rooms).toEqual(second.plan?.rooms);
    expect(first.dungeon.tiles).toEqual(second.dungeon.tiles);
    expect(first.metadata.settings.cycleRank).toBe(second.metadata.settings.cycleRank);
  });

  it("applies topology, spatial-style, cycle and corridor-width overrides", () => {
    const result = generate("prison", {
      topologyStyle: "circuit",
      spatialLayoutStyle: "ring",
      cycleCount: 2,
      varyCorridorWidths: false,
    });

    expect(result.plan?.topology?.style, result.fallbackReason).toBe("circuit");
    expect(result.plan?.spatialLayout?.style).toBe("ring");
    expect(result.plan?.topology?.cycleConnectionIds.length).toBe(2);
    expect(result.plan?.connections.every((edge) => edge.width === parameters.corridorWidth)).toBe(true);
    const varied = generate("military-fortress", { varyCorridorWidths: true });
    expect(new Set(varied.plan?.connections.map((edge) => edge.width)).size).toBeGreaterThan(1);
  });

  it("keeps V1 as an available versioned generation path", () => {
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      profile: "military-fortress",
      seed: 24681357,
      parameters,
    });

    expect(result.requestedGeneratorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.dungeon.roomDetails.length).toBeGreaterThan(0);
    expect(result.plan).toBeUndefined();
  });

  it("reports a visible V1 fallback when cavern features are requested in V2", () => {
    const result = generate("military-fortress", { cavesEnabled: true });

    expect(result.requestedGeneratorVersion).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.fallbackReason).toMatch(/cavernas híbridas/i);
  });

  it("preserves exterior entrances through an explicit V1 fallback", () => {
    const result = generate("military-fortress", {
      parameters: { ...parameters, entranceMode: "exterior-entrance" },
    });

    expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.fallbackReason).toMatch(/entradas externas/);
    expect(result.metadata.settings.fallbackStage).toBe("exterior-access-compatibility");
  });
});
