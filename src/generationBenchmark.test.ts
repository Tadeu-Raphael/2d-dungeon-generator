import { createHash } from "node:crypto";
import { memoryUsage } from "node:process";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_SEED,
  MAX_DUNGEON_TILE_COUNT,
  MAX_DUNGEON_WIDTH,
  generateDungeonVersioned,
} from "./dungeon";
import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import {
  DUNGEON_GENERATION_V1_BASELINES,
  createDungeonV1BaselineRequest,
  generateDungeonV1BaselineCollection,
} from "./generationBaselines";
import {
  auditGenerationConsistency,
  createCustomBenchmarkBaselines,
  createGenerationBenchmarkGalleryHtml,
  renderDungeonBenchmarkSvg,
  runGenerationBenchmark,
} from "./generationBenchmark";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { validateGenerationPlan } from "./generationPlanValidation";
import type { GenerationBenchmarkRun } from "./generationBenchmark";
import type { TopologyStyle } from "./generationPlan";

function getBaseline(id: string) {
  const baseline = DUNGEON_GENERATION_V1_BASELINES.find((item) => item.id === id);
  if (!baseline) throw new Error(`Unknown generation baseline: ${id}`);
  return baseline;
}

function getRun(runs: readonly GenerationBenchmarkRun[], id: string, version: string) {
  const run = runs.find((item) => (
    item.baselineId === id && item.requestedVersion === version
  ));
  if (!run) throw new Error(`Missing benchmark result ${id}/${version}`);
  return run;
}

function graphSignature(run: GenerationBenchmarkRun): string {
  const plan = run.plan;
  if (!plan) return "no-plan";
  const edges = plan.connections
    .map((edge) => [edge.sourceRoomId, edge.targetRoomId].sort().join("|"))
    .sort();
  return [
    edges.join(","),
    plan.mainPathRoomIds?.join(",") ?? "",
    plan.topology?.branchPaths.map((branch) => branch.roomIds.join(",")).join(";") ?? "",
    plan.topology?.cycleConnectionIds.length ?? 0,
    plan.sectors.map((sector) => sector.roomIds.join(",")).join(";"),
  ].join("::");
}

describe("generation benchmark and dual connectivity audit", () => {
  it("compares the frozen Phase 1 seeds without changing V1 results", () => {
    const runs = runGenerationBenchmark();
    const legacy = generateDungeonV1BaselineCollection();

    expect(runs).toHaveLength(DUNGEON_GENERATION_V1_BASELINES.length * 2);
    for (const baselineRun of legacy) {
      const v1 = getRun(runs, baselineRun.baseline.id, DUNGEON_GENERATOR_VERSION_V1);
      expect(v1.dungeon).toEqual(baselineRun.generation.dungeon);
      expect(v1.metrics?.roomCount).toBe(baselineRun.baseline.expectedRoomCount);
      expect(v1.metrics?.isolatedRoomCount).toBe(0);
      expect(Number.isFinite(v1.elapsedMs)).toBe(true);

      const v2 = getRun(runs, baselineRun.baseline.id, DUNGEON_GENERATOR_VERSION_V2);
      if (baselineRun.baseline.profile === "custom") {
        expect(v2.unsupportedReason).toMatch(/custom profile/i);
        continue;
      }
      if (baselineRun.baseline.profile === "natural-cavern") {
        expect(v2.effectiveVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
        expect(v2.fallbackReason).toMatch(/Caverna natural/);
        continue;
      }
      if (baselineRun.baseline.id === "small-fortress-bsp") {
        expect(v2.effectiveVersion, v2.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
        expect(v2.plan?.rooms).toHaveLength(6);
        expect(v2.metadata?.settings).toMatchObject({
          requestedRoomCount: 6,
          generatedRoomCount: 6,
          roomCountComplete: true,
        });
      }
      expect(v2.metrics?.isolatedRoomCount, `${baselineRun.baseline.id}: ${v2.fallbackReason ?? ""}`).toBe(0);
      if (v2.plan) {
        expect(v2.audit?.issues, v2.baselineId).toEqual([]);
        expect(v2.audit?.physicalConnectivityMatchesTiles).toBe(true);
        expect(v2.audit?.playerAccessibilityMatchesTiles).toBe(true);
      }
    }

    const summary = runs.map((run) => ({
      baseline: run.baselineId,
      version: run.requestedVersion,
      effective: run.effectiveVersion ?? "unsupported",
      profile: run.profile,
      rooms: run.metrics?.roomCount ?? "—",
      connections: run.metrics?.connectionCount ?? "—",
      branches: run.metrics?.branchCount ?? "—",
      cycles: run.metrics?.cycleCount ?? "—",
      deadEnds: run.metrics?.deadEndCount ?? "—",
      corridorTiles: run.metrics?.corridorTileCount ?? "—",
      averageLength: run.metrics?.averageCorridorLength?.toFixed(2) ?? "—",
      isolated: run.metrics?.isolatedRoomCount ?? "—",
      occupiedArea: run.metrics?.occupiedAreaPercent.toFixed(1) ?? "—",
      compactness: run.metrics?.compactness.toFixed(2) ?? "—",
      elapsedMs: run.elapsedMs?.toFixed(2) ?? "—",
      fallback: run.fallbackReason ?? run.unsupportedReason ?? "",
    }));
    console.log("Phase 1 V1/V2 benchmark:", JSON.stringify(summary));
  });

  it("reproduces V2 topology, room placement, routes, and final tiles for fixed inputs", () => {
    const baseline = getBaseline("medium-temple-bsp-cellular");
    const first = getRun(runGenerationBenchmark({
      baselines: [baseline],
      versions: [DUNGEON_GENERATOR_VERSION_V2],
    }), baseline.id, DUNGEON_GENERATOR_VERSION_V2);
    const repeated = getRun(runGenerationBenchmark({
      baselines: [baseline],
      versions: [DUNGEON_GENERATOR_VERSION_V2],
    }), baseline.id, DUNGEON_GENERATOR_VERSION_V2);

    expect(first.plan?.rooms).toEqual(repeated.plan?.rooms);
    expect(first.plan?.connections).toEqual(repeated.plan?.connections);
    expect(first.plan?.topology).toEqual(repeated.plan?.topology);
    expect(first.plan?.spatialLayout).toEqual(repeated.plan?.spatialLayout);
    expect(first.dungeon?.tiles).toEqual(repeated.dungeon?.tiles);
  });

  it("matches graph and tile access for locked, blocked, and secret connections", () => {
    const baseline = getBaseline("large-catacombs-bsp-drunkard");
    const run = getRun(runGenerationBenchmark({
      baselines: [baseline],
      versions: [DUNGEON_GENERATOR_VERSION_V2],
    }), baseline.id, DUNGEON_GENERATOR_VERSION_V2);
    if (!run.plan || !run.dungeon) throw new Error(run.fallbackReason ?? "Expected a routed V2 plan.");
    const cycleConnectionId = run.plan.topology?.cycleConnectionIds[0];
    const optionalEdge = run.plan.connections.find((edge) => edge.id === cycleConnectionId);
    if (!optionalEdge || optionalEdge.isMainPath) {
      throw new Error("Expected a non-main-path connection recorded as a cycle.");
    }

    const lockedPlan = {
      ...run.plan,
      connections: run.plan.connections.map((edge) => (
        edge.id === optionalEdge.id
          ? {
            ...edge,
            isLocked: true,
            metadata: { ...edge.metadata, lockId: "benchmark-lock" },
          }
          : edge
      )),
    };
    const lockedAudit = auditGenerationConsistency(lockedPlan, run.dungeon);
    expect(lockedAudit.issues).toEqual([]);
    expect(lockedAudit.playerAccessibilityMatchesTiles).toBe(true);

    const blockedPlan = {
      ...run.plan,
      connections: run.plan.connections.map((edge) => (
        edge.id === optionalEdge.id
          ? { ...edge, connectionType: "blocked-passage" as const, isBlocked: true }
          : edge
      )),
    };
    const blockedAudit = auditGenerationConsistency(
      blockedPlan,
      generationPlanToDungeon(blockedPlan),
    );
    expect(blockedAudit.issues).toEqual([]);
    expect(blockedAudit.physicalConnectivityMatchesTiles).toBe(true);
    expect(blockedAudit.playerAccessibilityMatchesTiles).toBe(true);

    const secretPlan = {
      ...run.plan,
      connections: run.plan.connections.map((edge) => (
        edge.id === optionalEdge.id
          ? { ...edge, connectionType: "secret-door" as const, isSecret: true }
          : edge
      )),
      transitions: run.plan.transitions.map((transition) => (
        transition.connectionId === optionalEdge.id && transition.type === "doorway"
          ? { ...transition, type: "secret-door" as const }
          : transition
      )),
    };
    const secretAudit = auditGenerationConsistency(
      secretPlan,
      generationPlanToDungeon(secretPlan),
    );
    expect(secretAudit.issues).toEqual([]);
    expect(secretAudit.playerAccessibilityMatchesTiles).toBe(true);
  });

  it("produces different logical graphs for the six requested topology styles", () => {
    const reference = getBaseline("medium-temple-bsp-cellular");
    const baseline = {
      ...reference,
      parameters: { ...reference.parameters, width: 96, height: 72 },
    };
    const styles: TopologyStyle[] = [
      "linear",
      "branching",
      "circuit",
      "centralized",
      "sectorized",
      "hybrid",
    ];
    const runs = styles.map((style) => getRun(runGenerationBenchmark({
      baselines: [baseline],
      versions: [DUNGEON_GENERATOR_VERSION_V2],
      topologyStyle: style,
    }), baseline.id, DUNGEON_GENERATOR_VERSION_V2));
    const signatures = new Set(runs.map(graphSignature));

    expect(
      runs.every((run, index) => run.plan?.topology?.style === styles[index]),
      JSON.stringify(runs.map((run) => ({
        effective: run.effectiveVersion,
        style: run.plan?.topology?.style,
        fallback: run.fallbackReason,
      }))),
    ).toBe(true);
    expect(runs.every((run) => run.audit?.issues.length === 0)).toBe(true);
    expect(signatures.size).toBeGreaterThanOrEqual(5);
  });

  it("validates the minimum, representative, and maximum supported room/map scales", () => {
    const cases = [
      { width: 20, height: 20, roomCount: 2 },
      { width: 32, height: 24, roomCount: 6 },
      { width: 64, height: 48, roomCount: 12 },
      { width: 96, height: 72, roomCount: 18 },
      { width: 160, height: 120, roomCount: 24 },
    ];
    const baselines = cases.flatMap((size, index) => createCustomBenchmarkBaselines({
      profile: "military-fortress",
      firstSeed: 81000 + index,
      seedCount: 1,
      ...size,
      corridorWidth: 1,
    }));
    const runs = runGenerationBenchmark({ baselines, collectStageTimings: true });
    const maximumV2 = getRun(
      runs,
      "custom-military-fortress-81004",
      DUNGEON_GENERATOR_VERSION_V2,
    );
    expect(maximumV2.effectiveVersion, maximumV2.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(maximumV2.plan?.rooms).toHaveLength(24);
    expect(maximumV2.metadata?.settings).toMatchObject({
      requestedRoomCount: 24,
      generatedRoomCount: 24,
      roomCountComplete: true,
    });
    const recoveredSmallMap = getRun(
      runs,
      "custom-military-fortress-81001",
      DUNGEON_GENERATOR_VERSION_V2,
    );
    expect(recoveredSmallMap.effectiveVersion, recoveredSmallMap.fallbackReason)
      .toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(recoveredSmallMap.metadata?.settings.roomRecipeAttempts).toBeGreaterThan(1);

    for (const run of runs) {
      expect(Number.isFinite(run.elapsedMs)).toBe(true);
      expect(run.dungeon?.width).toBe(run.metadata?.parameters.width);
      expect(run.dungeon?.height).toBe(run.metadata?.parameters.height);
      expect(run.dungeon?.tiles).toHaveLength(run.dungeon?.height ?? 0);
      expect(run.dungeon?.tiles.every((row) => row.length === run.dungeon?.width)).toBe(true);
      expect(run.metrics?.isolatedRoomCount, run.fallbackReason).toBe(0);
      if (run.plan) expect(run.audit?.issues, run.baselineId).toEqual([]);
    }
    console.log("Scale benchmark:", JSON.stringify(runs.map((run) => ({
      baseline: run.baselineId,
      version: run.requestedVersion,
      effective: run.effectiveVersion,
      rooms: run.metrics?.roomCount,
      elapsedMs: run.elapsedMs?.toFixed(2),
      stagesMs: Object.fromEntries(
        Object.entries(run.stageTimings ?? {}).map(([stage, elapsed]) => [
          stage,
          elapsed?.toFixed(2),
        ]),
      ),
      fallback: Boolean(run.fallbackReason),
    }))));
  });

  it("benchmarks large V2 maps with graph, tile, and rasterization checks", () => {
    const cases = [
      { width: 160, height: 120, roomCount: 6, seed: 83001 },
      { width: 250, height: 250, roomCount: 8, seed: 83002 },
      { width: 400, height: 300, roomCount: 12, seed: 83003 },
      { width: 500, height: 500, roomCount: 16, seed: 83004 },
    ];
    expect(MAX_DUNGEON_WIDTH).toBe(1_000);
    expect(MAX_DUNGEON_HEIGHT).toBe(1_000);
    expect(MAX_DUNGEON_TILE_COUNT).toBe(250_000);
    expect(() => createCustomBenchmarkBaselines({
      profile: "military-fortress",
      firstSeed: 83006,
      seedCount: 1,
      width: MAX_DUNGEON_WIDTH + 1,
      height: 250,
      roomCount: 8,
      corridorWidth: 1,
    })).toThrow(/width must not exceed 1000/i);
    expect(() => createCustomBenchmarkBaselines({
      profile: "military-fortress",
      firstSeed: 83005,
      seedCount: 1,
      width: 1_000,
      height: 1_000,
      roomCount: 24,
      corridorWidth: 1,
    })).toThrow(/area must not exceed 250000/i);
    expect(() => generateDungeonVersioned({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      algorithm: "bsp",
      seed: 83005,
      profile: "military-fortress",
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 1_000,
        height: 1_000,
        roomCount: 24,
      },
    })).toThrow(/area must not exceed 250000/i);

    for (const requested of cases) {
      const [baseline] = createCustomBenchmarkBaselines({
        profile: "military-fortress",
        firstSeed: requested.seed,
        seedCount: 1,
        width: requested.width,
        height: requested.height,
        roomCount: requested.roomCount,
        corridorWidth: 1,
      });
      const heapBeforeBytes = memoryUsage().heapUsed;
      const [run] = runGenerationBenchmark({
        baselines: [baseline],
        versions: [DUNGEON_GENERATOR_VERSION_V2],
        collectStageTimings: true,
      });
      const heapDeltaBytes = memoryUsage().heapUsed - heapBeforeBytes;
      if (!run.plan || !run.dungeon) {
        throw new Error(run.fallbackReason ?? "Expected a routed V2 plan and dungeon.");
      }
      const validationStartedAt = globalThis.performance.now();
      const planValidation = validateGenerationPlan(run.plan);
      const validationMs = globalThis.performance.now() - validationStartedAt;
      const svgStartedAt = globalThis.performance.now();
      const benchmarkSvg = renderDungeonBenchmarkSvg(
        run.dungeon,
        `${run.profile}, seed ${run.seed}, ${run.requestedVersion}`,
      );
      const svgSerializationMs = globalThis.performance.now() - svgStartedAt;
      const stageTimingsMs = Object.fromEntries(
        Object.entries(run.stageTimings ?? {}).map(([stage, elapsed]) => [
          stage,
          elapsed?.toFixed(2),
        ]),
      );
      console.log("Large-map benchmark:", JSON.stringify({
        size: `${requested.width}×${requested.height}`,
        rooms: run.metrics?.roomCount,
        connections: run.metrics?.connectionCount,
        generationMs: run.elapsedMs?.toFixed(2),
        stagesMs: stageTimingsMs,
        validationMs: validationMs.toFixed(2),
        rasterizationMs: run.rasterizationMs?.toFixed(2),
        svgSerializationMs: svgSerializationMs.toFixed(2),
        heapDeltaBytes,
        routeFailures: run.audit?.issues.length,
        fallback: Boolean(run.fallbackReason),
      }));
      expect(planValidation.valid).toBe(true);
      expect(benchmarkSvg.length).toBeGreaterThan(0);
      expect(Number.isFinite(heapDeltaBytes)).toBe(true);
      expect(run.effectiveVersion, run.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
      expect(run.dungeon).toMatchObject({
        width: requested.width,
        height: requested.height,
        rooms: requested.roomCount,
      });
      expect(run.plan?.rooms).toHaveLength(requested.roomCount);
      expect(run.metrics?.connectionCount).toBeGreaterThan(0);
      expect(run.elapsedMs).toEqual(expect.any(Number));
      expect(run.rasterizationMs).toEqual(expect.any(Number));
      expect(run.stageTimings).toMatchObject({
        roomRecipe: expect.any(Number),
        planPreparation: expect.any(Number),
        topology: expect.any(Number),
        layout: expect.any(Number),
        contentTransfer: expect.any(Number),
        routing: expect.any(Number),
        validation: expect.any(Number),
        rasterization: expect.any(Number),
      });
      expect(run.audit).toMatchObject({
        planValid: true,
        topologyValid: true,
        physicalConnectivityMatchesTiles: true,
        playerAccessibilityMatchesTiles: true,
        roomCountMatchesTiles: true,
        routeTilesMissing: [],
        unmodeledCorridorTiles: [],
        invalidDoorTransitions: [],
        physicalGraphOnlyRoomIds: [],
        physicalTilesOnlyRoomIds: [],
        playerGraphOnlyRoomIds: [],
        playerTilesOnlyRoomIds: [],
        issues: [],
      });
    }

    const legacy = generateDungeonVersioned({
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      algorithm: "bsp",
      seed: 83007,
      profile: "military-fortress",
      parameters: {
        ...DEFAULT_DUNGEON_PARAMETERS,
        width: 250,
        height: 250,
        roomCount: 8,
      },
    });
    expect(legacy.dungeon).toMatchObject({ width: 250, height: 250, rooms: 8 });
  }, 120_000);

  it("covers every profile, corridor width, and baseline V2 accessibility", () => {
    const profiles = Object.keys(DUNGEON_CONCEPTS) as Array<keyof typeof DUNGEON_CONCEPTS>;
    const profileCases = profiles.flatMap((profile, index) => createCustomBenchmarkBaselines({
      profile,
      firstSeed: 92000 + index,
      seedCount: 1,
      width: 64,
      height: 48,
      roomCount: 12,
      corridorWidth: 1,
    }));
    const profileRuns = runGenerationBenchmark({
      baselines: profileCases,
      versions: [DUNGEON_GENERATOR_VERSION_V2],
    });

    expect(profileRuns).toHaveLength(profiles.length);
    for (const run of profileRuns) {
      expect(run.metrics?.isolatedRoomCount, run.fallbackReason).toBe(0);
      if (run.profile === "natural-cavern") {
        expect(run.effectiveVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
        expect(run.fallbackReason).toMatch(/Caverna natural/);
        continue;
      }
      expect(run.effectiveVersion, run.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
      expect(run.plan, run.fallbackReason).toBeDefined();
      expect(run.audit?.issues, run.profile).toEqual([]);
    }

    const reference = getBaseline("medium-temple-bsp-cellular");
    const baseline = {
      ...reference,
      parameters: { ...reference.parameters, width: 96, height: 72 },
    };
    for (const width of [1, 2, 3]) {
      const run = getRun(runGenerationBenchmark({
        baselines: [baseline],
        versions: [DUNGEON_GENERATOR_VERSION_V2],
        corridorWidth: width,
        varyCorridorWidths: false,
      }), baseline.id, DUNGEON_GENERATOR_VERSION_V2);
      expect(run.plan?.connections.every((edge) => edge.width === width), run.fallbackReason).toBe(true);
      expect(run.audit?.issues, run.fallbackReason).toEqual([]);
    }
  });

  it("renders a safe, inspectable HTML map gallery for baseline comparisons", () => {
    const baseline = getBaseline("small-fortress-bsp");
    const runs = runGenerationBenchmark({
      baselines: [baseline],
      versions: [DUNGEON_GENERATOR_VERSION_V1, DUNGEON_GENERATOR_VERSION_V2],
    });
    const gallery = createGenerationBenchmarkGalleryHtml(runs);
    const dungeon = runs[0].dungeon;
    if (!dungeon) throw new Error("The V1 benchmark did not produce a dungeon.");
    const svg = renderDungeonBenchmarkSvg(dungeon, `<seed ${baseline.seed}>`);

    expect(gallery).toContain("small-fortress-bsp");
    expect(gallery).toContain("seed");
    expect(gallery).toContain("<svg");
    expect(svg).toContain("&lt;seed");
    expect(svg).not.toContain("<seed");
  });

  it("keeps the original Phase 1 fingerprints and accepts bounded benchmark inputs", () => {
    for (const { baseline, request, generation } of generateDungeonV1BaselineCollection()) {
      const current = generateDungeonVersioned(createDungeonV1BaselineRequest(baseline));
      expect(current.dungeon).toEqual(generation.dungeon);
      expect(createHash("sha256").update(JSON.stringify(current.dungeon)).digest("hex"))
        .toBe(baseline.expectedFingerprint);
      expect(request.parameters?.width).toBe(baseline.parameters.width);
    }
    expect(() => createCustomBenchmarkBaselines({
      profile: "military-fortress",
      firstSeed: -1,
      seedCount: 1,
      width: 32,
      height: 24,
      roomCount: 6,
      corridorWidth: 1,
    })).toThrow(RangeError);
    expect(() => createCustomBenchmarkBaselines({
      profile: "military-fortress",
      firstSeed: MAX_DUNGEON_SEED,
      seedCount: 2,
      width: 32,
      height: 24,
      roomCount: 6,
      corridorWidth: 1,
    })).toThrow(RangeError);
  });
});
