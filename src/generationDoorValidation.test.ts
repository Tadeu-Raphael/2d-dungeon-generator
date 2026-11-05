import { describe, expect, it } from "vitest";
import { CORRIDOR_TILE, DOOR_TILE, WALL_TILE } from "./core/tiles";
import { DEFAULT_DUNGEON_PARAMETERS, DUNGEON_GENERATOR_VERSION_V2 } from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import type { DungeonConcept } from "./dungeonProfiles";
import { validateDoorGeometry } from "./generationDoorValidation";
import type { DoorValidationIssueCode } from "./generationDoorValidation";
import { generateDungeonPipeline } from "./generationPipeline";

const parameters: DungeonParameters = {
  ...DEFAULT_DUNGEON_PARAMETERS,
  width: 64,
  height: 48,
  roomCount: 10,
};

const PROFILES: DungeonConcept[] = [
  "military-fortress",
  "ancient-temple",
  "abandoned-mine",
  "prison",
];

type Generated = NonNullable<ReturnType<typeof generate>>;

function generate(profile: DungeonConcept, seed: number, corridorWidth: number) {
  const result = generateDungeonPipeline({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile,
    seed,
    parameters: { ...parameters, corridorWidth },
  });
  if (result.metadata.generatorVersion !== DUNGEON_GENERATOR_VERSION_V2 || !result.plan) {
    return undefined;
  }
  return { plan: result.plan, tiles: result.dungeon.tiles.map((row) => [...row]) };
}

function findDoorEndpoint(generated: Generated) {
  const edge = generated.plan.connections.find((candidate) => (
    candidate.connectionType === "door" && candidate.metadata.sourceEndpoint
  ));
  if (!edge?.metadata.sourceEndpoint) throw new Error("The fixture has no routed door connection.");
  return edge.metadata.sourceEndpoint;
}

describe("validateDoorGeometry", () => {
  it.each(PROFILES.flatMap((profile) => (
    [3, 42, 2024].flatMap((seed) => [1, 2, 3].map((corridorWidth) => ({ profile, seed, corridorWidth })))
  )))(
    "accepts $profile seed $seed with $corridorWidth-wide corridors",
    ({ profile, seed, corridorWidth }) => {
      const generated = generate(profile, seed, corridorWidth);
      if (!generated) return; // an explicit V1 fallback is reported by the pipeline, not a door fault
      expect(validateDoorGeometry(generated.plan, generated.tiles)).toEqual([]);
    },
  );

  it("keeps door variants consistent across seeds and profiles", () => {
    const seen = new Set<string>();
    for (const profile of PROFILES) {
      for (const seed of [3, 42, 2024, 9, 77]) {
        const result = generateDungeonPipeline({
          generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
          profile,
          seed,
          parameters: { ...parameters, corridorWidth: 1 },
        });
        if (result.metadata.generatorVersion !== DUNGEON_GENERATOR_VERSION_V2 || !result.plan) continue;
        for (const variant of Object.values(result.dungeon.doorVariants ?? {})) seen.add(variant);
        expect(validateDoorGeometry(result.plan, result.dungeon.tiles, result.dungeon.doorVariants)).toEqual([]);
        const repeated = generateDungeonPipeline({
          generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
          profile,
          seed,
          parameters: { ...parameters, corridorWidth: 1 },
        });
        expect(repeated.dungeon.doorVariants).toEqual(result.dungeon.doorVariants);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("generates doors on V2 maps of the corpus", () => {
    const generated = PROFILES.map((profile) => generate(profile, 42, 1)).filter(
      (entry): entry is Generated => entry !== undefined,
    );
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.some((entry) => entry.plan.transitions.some((t) => t.type === "doorway"))).toBe(true);
  });

  const expectIssue = (code: DoorValidationIssueCode, mutate: (generated: Generated) => void): void => {
    const generated = generate("military-fortress", 42, 2) ?? generate("military-fortress", 7, 2);
    if (!generated) throw new Error("The mutation fixture fell back to V1.");
    mutate(generated);
    expect(validateDoorGeometry(generated.plan, generated.tiles).map((issue) => issue.code)).toContain(code);
  };

  it("reports an opening cell that a door connection left unsealed", () => {
    expectIssue("connection-without-opening", (generated) => {
      const endpoint = findDoorEndpoint(generated);
      const cell = endpoint.openingPositions[endpoint.openingPositions.length - 1];
      generated.tiles[cell.y][cell.x] = CORRIDOR_TILE;
    });
  });

  it("reports a door tile that has no door in the plan", () => {
    expectIssue("door-orphan-tile", ({ plan, tiles }) => {
      const edge = plan.connections.find((candidate) => (
        candidate.connectionType !== "door" && !candidate.isSecret && candidate.metadata.sourceEndpoint
      ));
      if (!edge?.metadata.sourceEndpoint) throw new Error("The fixture has no plain corridor.");
      const cell = edge.metadata.sourceEndpoint.openingPositions[0];
      tiles[cell.y][cell.x] = DOOR_TILE;
    });
  });

  it("reports a door whose connection does not exist", () => {
    expectIssue("door-without-connection", ({ plan }) => {
      const transition = plan.transitions.find((candidate) => candidate.type === "doorway");
      if (!transition) throw new Error("The fixture has no door transition.");
      (transition as { connectionId?: string }).connectionId = "missing-connection";
    });
  });

  it("reports duplicated doors on the same tile", () => {
    expectIssue("door-duplicate", ({ plan }) => {
      const transition = plan.transitions.find((candidate) => candidate.type === "doorway");
      if (!transition) throw new Error("The fixture has no door transition.");
      (plan.transitions as unknown as unknown[]).push({ ...transition, id: "duplicate-door" });
    });
  });

  it("reports an opening that does not allow passage", () => {
    expectIssue("opening-impassable", (generated) => {
      const cell = findDoorEndpoint(generated).openingPositions[0];
      generated.tiles[cell.y][cell.x] = WALL_TILE;
    });
  });

  it("reports a corridor tile that breaches a room wall outside any opening", () => {
    expectIssue("wall-breach", ({ plan, tiles }) => {
      const room = plan.rooms[0];
      const floor = room.footprint.map((cell) => ({ x: room.position.x + cell.x, y: room.position.y + cell.y }));
      const floorKeys = new Set(floor.map((cell) => `${cell.x},${cell.y}`));
      const breach = floor.flatMap((cell) => [
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
      ]).find((cell) => !floorKeys.has(`${cell.x},${cell.y}`) && tiles[cell.y][cell.x] === WALL_TILE);
      if (!breach) throw new Error("The fixture room has no solid wall cell.");
      tiles[breach.y][breach.x] = CORRIDOR_TILE;
    });
  });
});
