import { describe, expect, it } from "vitest";
import {
  CAVE_CONNECTION_WALL_TILE,
  CAVE_TILE,
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V2,
  DUNGEON_GENERATOR_VERSION_V1,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  WALL_TILE,
} from "./dungeon";
import type { Dungeon } from "./dungeon";
import { getTileColor } from "./DungeonCanvas";
import { generateDungeonPipeline } from "./generationPipeline";
import type { GenerationPlan, GridPosition } from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { validateGenerationPlan } from "./generationPlanValidation";

function generateNaturalCavern(options: {
  seed: number;
  width?: number;
  height?: number;
  fillPercent?: number;
  iterations?: number;
}) {
  const parameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width: options.width ?? 64,
    height: options.height ?? 48,
    cellularFillPercent: options.fillPercent ?? 52,
    cellularIterations: options.iterations ?? 5,
  };
  return generateDungeonPipeline({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile: "natural-cavern",
    seed: options.seed,
    parameters,
  });
}

function reachableTiles(dungeon: Dungeon, start: GridPosition): Set<number> {
  const visited = new Uint8Array(dungeon.width * dungeon.height);
  const queue = new Int32Array(visited.length);
  const startIndex = start.y * dungeon.width + start.x;
  let head = 0;
  let tail = 0;
  visited[startIndex] = 1;
  queue[tail++] = startIndex;
  while (head < tail) {
    const index = queue[head++];
    const x = index % dungeon.width;
    const y = Math.floor(index / dungeon.width);
    for (const [nextX, nextY] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ]) {
      if (
        nextX < 0
        || nextY < 0
        || nextX >= dungeon.width
        || nextY >= dungeon.height
      ) continue;
      const next = nextY * dungeon.width + nextX;
      if (visited[next]) continue;
      const tile = dungeon.tiles[nextY][nextX];
      if (tile === WALL_TILE || tile === CAVE_CONNECTION_WALL_TILE) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  return new Set(Array.from({ length: tail }, (_, index) => queue[index]!));
}

function caveCellCount(plan: GenerationPlan): number {
  return (plan.naturalRegions ?? []).reduce(
    (total, region) => total + region.rowSpans.reduce(
      (regionTotal, span) => regionTotal + span.xEnd - span.xStart,
      0,
    ),
    0,
  );
}

describe("V2 organic cavern generation", () => {
  it("generates a connected room-free cavern plan that adapts to Dungeon.tiles", () => {
    const result = generateNaturalCavern({ seed: 24681357 });
    const plan = result.plan;
    expect(result.metadata.generatorVersion, result.fallbackReason)
      .toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.fallbackReason).toBeUndefined();
    expect(plan?.generationMode).toBe("natural-cavern");
    expect(plan?.generation.algorithm).toBe("cellular");
    expect(plan?.rooms).toHaveLength(0);
    expect(plan?.naturalRegions).toHaveLength(1);
    expect(plan && validateGenerationPlan(plan).valid).toBe(true);
    expect(result.dungeon.roomDetails).toHaveLength(0);
    expect(result.dungeon.tiles.flat().filter((tile) => tile === CAVE_TILE).length)
      .toBeGreaterThan(100);
    expect(getTileColor(CAVE_TILE)).not.toBe(getTileColor(WALL_TILE));

    const region = plan!.naturalRegions![0]!;
    const minX = Math.min(...region.rowSpans.map((span) => span.xStart));
    const maxX = Math.max(...region.rowSpans.map((span) => span.xEnd - 1));
    const minY = Math.min(...region.rowSpans.map((span) => span.y));
    const maxY = Math.max(...region.rowSpans.map((span) => span.y));
    expect(caveCellCount(plan!)).toBeLessThan((maxX - minX + 1) * (maxY - minY + 1));
    const firstSpan = region.rowSpans[0]!;
    const visited = reachableTiles(result.dungeon, { x: firstSpan.xStart, y: firstSpan.y });
    for (const span of region.rowSpans) {
      for (let x = span.xStart; x < span.xEnd; x += 1) {
        expect(visited.has(span.y * result.dungeon.width + x)).toBe(true);
      }
    }
    expect(generationPlanToDungeon(plan!)).toEqual(result.dungeon);
    expect(result.dungeon.tiles.flat().some((tile) => tile === STAIRS_UP_TILE)).toBe(true);
    expect(result.dungeon.tiles.flat().some((tile) => tile === STAIRS_DOWN_TILE)).toBe(true);
  });

  it("is deterministic across seeds and responds to density and irregularity", () => {
    for (const seed of [17, 3812, 97531000]) {
      const first = generateNaturalCavern({ seed, width: 40, height: 32 });
      const second = generateNaturalCavern({ seed, width: 40, height: 32 });
      expect(second.dungeon.tiles).toEqual(first.dungeon.tiles);
      expect(first.fallbackReason).toBeUndefined();
      expect(first.plan && validateGenerationPlan(first.plan).valid).toBe(true);
    }

    const sparse = generateNaturalCavern({ seed: 421, fillPercent: 40, iterations: 3 });
    const dense = generateNaturalCavern({ seed: 421, fillPercent: 62, iterations: 7 });
    expect(caveCellCount(sparse.plan!)).not.toBe(caveCellCount(dense.plan!));
  });

  it("handles larger maps while keeping one connected organic component", () => {
    const result = generateNaturalCavern({
      seed: 80213,
      width: 240,
      height: 180,
      fillPercent: 55,
      iterations: 5,
    });
    expect(result.metadata.generatorVersion, result.fallbackReason)
      .toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.plan && validateGenerationPlan(result.plan).valid).toBe(true);
    expect(result.plan?.naturalRegions).toHaveLength(1);
    expect(result.dungeon.floorCount).toBeGreaterThan(240 * 180 * 0.1);
  });

  it("rejects disconnected natural region spans during plan validation", () => {
    const plan = generateNaturalCavern({ seed: 1919 }).plan!;
    const region = plan.naturalRegions![0]!;
    const disconnectedPlan: GenerationPlan = {
      ...plan,
      naturalRegions: [{
        ...region,
        rowSpans: [
          { y: 2, xStart: 2, xEnd: 4 },
          { y: 6, xStart: 8, xEnd: 10 },
        ],
      }],
    };
    expect(validateGenerationPlan(disconnectedPlan).issues)
      .toContainEqual(expect.objectContaining({ code: "disconnected-natural-region" }));
  });

  it("adds a connected cellular cavern to a constructed V2 map", () => {
    const parameters = {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 96,
      height: 72,
      roomCount: 8,
      cellularFillPercent: 52,
      cellularIterations: 5,
    };
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "military-fortress",
      seed: 77531,
      parameters,
      cavesEnabled: true,
    });
    const plan = result.plan;
    expect(result.metadata.generatorVersion, result.fallbackReason)
      .toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(result.fallbackReason).toBeUndefined();
    expect(plan?.naturalRegions).toHaveLength(1);
    expect(plan?.caveConnections).toHaveLength(1);
    expect(plan && validateGenerationPlan(plan).valid).toBe(true);
    expect(result.dungeon.roomDetails).toHaveLength(parameters.roomCount);

    const region = plan!.naturalRegions![0]!;
    const firstSpan = region.rowSpans[0]!;
    const start = { x: firstSpan.xStart, y: firstSpan.y };
    const visited = reachableTiles(result.dungeon, start);
    for (const span of region.rowSpans) {
      for (let x = span.xStart; x < span.xEnd; x += 1) {
        expect(visited.has(span.y * result.dungeon.width + x)).toBe(true);
      }
    }
    const caveConnection = plan!.caveConnections![0]!;
    expect(caveConnection.regionId).toBe(region.id);
    const firstTunnelTile = caveConnection.path[0]!;
    expect(region.rowSpans.some((span) => (
      span.y === firstTunnelTile.y
      && firstTunnelTile.x >= span.xStart
      && firstTunnelTile.x < span.xEnd
    ))).toBe(true);
    expect(result.dungeon.tiles[firstTunnelTile.y][firstTunnelTile.x])
      .toBe(CAVE_TILE);
    expect(caveConnection.target.position).toBeDefined();
    expect(visited.has(
      caveConnection.target.position.y * result.dungeon.width
      + caveConnection.target.position.x,
    )).toBe(true);
    expect(caveCellCount(plan!)).toBeGreaterThan(4);
    const converted = generationPlanToDungeon(plan!);
    expect(converted.width).toBe(result.dungeon.width);
    expect(converted.height).toBe(result.dungeon.height);

    const disconnectedPlan: GenerationPlan = { ...plan!, caveConnections: [] };
    expect(validateGenerationPlan(disconnectedPlan).issues)
      .toContainEqual(expect.objectContaining({ code: "natural-region-unconnected" }));
    const invalidTargetPlan: GenerationPlan = {
      ...plan!,
      caveConnections: [{
        ...caveConnection,
        target: { ...caveConnection.target, id: "missing-target" },
      }],
    };
    expect(validateGenerationPlan(invalidTargetPlan).issues)
      .toContainEqual(expect.objectContaining({ code: "cave-connection-target-not-found" }));
  });

  it("reports unusable cavern parameters instead of producing an invalid silent result", () => {
    const result = generateDungeonPipeline({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
      profile: "natural-cavern",
      seed: 12,
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        cellularIterations: 13,
      },
    });
    expect(result.fallbackReason).toMatch(/12 iterações/);
    expect(result.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
    expect(result.dungeon.tiles.length).toBe(DEFAULT_DUNGEON_PARAMETERS.height);
  });

  it("keeps every cavern span inside the rendered map bounds", () => {
    const result = generateNaturalCavern({ seed: 8021, width: 36, height: 24 });
    const plan = result.plan!;
    const region = plan.naturalRegions![0]!;
    expect(region.rowSpans.every((span) => (
      span.y > 0
      && span.y < plan.height - 1
      && span.xStart > 0
      && span.xEnd <= plan.width - 1
    ))).toBe(true);
    expect(result.dungeon.tiles.flat().some((tile) => tile === CAVE_TILE)).toBe(true);
  });
});
