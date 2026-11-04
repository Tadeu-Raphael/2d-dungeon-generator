import { createHash } from "node:crypto";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DungeonCanvas, { getTileColor } from "./DungeonCanvas";
import DungeonThreeCanvas from "./DungeonThreeCanvas";
import {
  CAVE_CONNECTION_WALL_TILE,
  DUNGEON_GENERATOR_VERSION_V1,
  createGenerationRandomStreams,
  generateDungeonV1,
  generateDungeonVersioned,
} from "./dungeon";
import type { Dungeon, Tile } from "./dungeon";
import {
  DUNGEON_CONCEPTS,
  getDungeonGenerationAlgorithm,
  resolveDungeonGenerationAlgorithm,
} from "./dungeonProfiles";
import { generateDungeonV1BaselineCollection } from "./generationBaselines";

const baselineRuns = generateDungeonV1BaselineCollection();

function fingerprint(dungeon: Dungeon): string {
  return createHash("sha256").update(JSON.stringify(dungeon)).digest("hex");
}

function walkableTile(tile: Tile): boolean {
  return tile !== 0 && tile !== CAVE_CONNECTION_WALL_TILE;
}

function assertCoreConnected(dungeon: Dungeon): void {
  const walkable = new Set<number>();
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (walkableTile(dungeon.tiles[y][x])) walkable.add(y * dungeon.width + x);
    }
  }

  const roomAnchors = dungeon.roomDetails.map((room) => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const position = y * dungeon.width + x;
        if (walkable.has(position)) return position;
      }
    }
    throw new Error(`Room ${room.number} has no walkable tile.`);
  });
  const requiredTiles = roomAnchors.length > 0 ? roomAnchors : [...walkable];
  const firstTile = requiredTiles[0];
  if (firstTile === undefined) throw new Error("Dungeon has no walkable tiles.");

  const visited = new Set<number>([firstTile]);
  const queue = [firstTile];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const position = queue[cursor];
    const x = position % dungeon.width;
    const y = Math.floor(position / dungeon.width);
    for (const [nextX, nextY] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nextX < 0 || nextY < 0 || nextX >= dungeon.width || nextY >= dungeon.height) continue;
      const nextPosition = nextY * dungeon.width + nextX;
      if (walkable.has(nextPosition) && !visited.has(nextPosition)) {
        visited.add(nextPosition);
        queue.push(nextPosition);
      }
    }
  }

  if (roomAnchors.length === 0) {
    expect(visited.size).toBe(walkable.size);
  } else {
    expect(roomAnchors.every((anchor) => visited.has(anchor))).toBe(true);
  }
}

function expectRoomsDoNotOverlap(dungeon: Dungeon): void {
  for (let index = 0; index < dungeon.roomDetails.length; index += 1) {
    const room = dungeon.roomDetails[index];
    for (const otherRoom of dungeon.roomDetails.slice(index + 1)) {
      const overlaps = room.x < otherRoom.x + otherRoom.width
        && room.x + room.width > otherRoom.x
        && room.y < otherRoom.y + otherRoom.height
        && room.y + room.height > otherRoom.y;
      expect(overlaps).toBe(false);
    }
  }
}

describe("legacy V1 generation baselines", () => {
  for (const { baseline, request, generation } of baselineRuns) {
    describe(baseline.id, () => {
      it("reproduces the frozen map for the same version, seed, and parameters", () => {
        const legacyDungeon = generateDungeonV1(
          request.algorithm,
          request.seed,
          request.parameters,
        );
        const repeatedGeneration = generateDungeonVersioned(request);

        expect(generation.dungeon).toEqual(legacyDungeon);
        expect(repeatedGeneration.dungeon).toEqual(legacyDungeon);
        expect(fingerprint(legacyDungeon)).toBe(baseline.expectedFingerprint);
      });

      it("records complete generation metadata without changing the Dungeon contract", () => {
        expect(generation.metadata.generatorVersion).toBe(DUNGEON_GENERATOR_VERSION_V1);
        expect(generation.metadata.seed).toBe(baseline.seed);
        expect(generation.metadata.profile).toBe(baseline.profile);
        expect(generation.metadata.algorithm).toBe(baseline.algorithm);
        expect(generation.metadata.parameters).toEqual(request.parameters);
        expect(generation.metadata.settings).toEqual(request.settings);
        expect(Number.isNaN(Date.parse(generation.metadata.generatedAt))).toBe(false);
        expect(generation.dungeon.tiles).toBeInstanceOf(Array);
      });

      it("preserves dimensions, tile matrix integrity, and room counts", () => {
        const { dungeon } = generation;
        expect(dungeon.width).toBe(request.parameters?.width);
        expect(dungeon.height).toBe(request.parameters?.height);
        expect(dungeon.tiles).toHaveLength(dungeon.height);
        expect(dungeon.tiles.every((row) => row.length === dungeon.width)).toBe(true);
        expect(dungeon.tiles.flat().every(
          (tile) => Number.isInteger(tile) && tile >= 0 && tile <= 160,
        )).toBe(true);
        expect(dungeon.rooms).toBe(dungeon.roomDetails.length);
        expect(dungeon.rooms).toBe(baseline.expectedRoomCount);
      });

      it("keeps all rooms reachable and connected corridor-only maps traversable", () => {
        assertCoreConnected(generation.dungeon);
      });

      it("does not overlap room bounds", () => {
        expectRoomsDoNotOverlap(generation.dungeon);
      });

      it("remains consumable by both map renderers", () => {
        const commonProps = {
          dungeon: generation.dungeon,
          generationKey: generation.dungeon,
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
        for (const tile of new Set(generation.dungeon.tiles.flat())) {
          expect(() => getTileColor(tile)).not.toThrow();
        }
      });
    });
  }
});

describe("V1 profile algorithm routing", () => {
  const expectedAlgorithms = {
    "military-fortress": ["bsp", "bsp-cellular"],
    "ancient-temple": ["bsp-cellular", "bsp-cellular"],
    catacombs: ["bsp-drunkard", "hybrid"],
    "abandoned-mine": ["bsp-drunkard", "hybrid"],
    "arcane-laboratory": ["hybrid", "hybrid"],
    "natural-cavern": ["cellular", "cellular"],
    prison: ["bsp", "bsp-cellular"],
    "lost-civilization": ["hybrid", "hybrid"],
  } as const;

  for (const [profileId, profile] of Object.entries(DUNGEON_CONCEPTS)) {
    it(`respects the declared ${profile.id} algorithm`, () => {
      const [withoutCaves, withCaves] = expectedAlgorithms[profileId as keyof typeof expectedAlgorithms];
      expect(getDungeonGenerationAlgorithm(profile.algorithm, false)).toBe(withoutCaves);
      expect(getDungeonGenerationAlgorithm(profile.algorithm, true)).toBe(withCaves);
    });
  }

  it("reports the V1 fallback when pure Drunkard's Walk is combined with caves", () => {
    const resolution = resolveDungeonGenerationAlgorithm("drunkard", true);
    expect(resolution.algorithm).toBe("hybrid");
    expect(resolution.fallbackReason).toMatch(/híbrido/);
  });
});

describe("independent generation random streams", () => {
  it("repeats each named stream independently of calls to other streams", () => {
    const first = createGenerationRandomStreams(987654321);
    const second = createGenerationRandomStreams(987654321);
    const untouchedCorridor = createGenerationRandomStreams(987654321).corridors();
    for (let index = 0; index < 25; index += 1) first.topology();

    expect(first.corridors()).toBe(untouchedCorridor);
    expect(second.topology()).toBe(createGenerationRandomStreams(987654321).topology());
    expect(first.placement()).toBe(createGenerationRandomStreams(987654321).placement());
  });
});
