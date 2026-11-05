import { describe, expect, it } from "vitest";
import { DEFAULT_DUNGEON_PARAMETERS } from "../dungeon";
import { generateDungeonStructure } from "../dungeonStructureGeneration";
import {
  createDungeonStructureSvg,
  formatLevelLabel,
  getStructureExportTileSize,
} from "./dungeonStructureSvg";
import type { StructureSvgLevel } from "./dungeonStructureSvg";

function generate(): { levels: StructureSvgLevel[]; structure: ReturnType<typeof generateDungeonStructure>["structure"] } {
  const result = generateDungeonStructure({
    seed: 4242,
    profile: "military-fortress",
    parameters: { ...DEFAULT_DUNGEON_PARAMETERS, width: 64, height: 48, roomCount: 6, corridorWidth: 1, entranceMode: "upper-stairs" },
    levels: [-2, -1, 0].map((verticalIndex) => ({
      name: verticalIndex === 0 ? "Principal" : `Subsolo ${-verticalIndex}`,
      verticalIndex,
      width: 64,
      height: 48,
      roomCount: 5,
    })),
    entryLevelIndex: 2,
    verticalConnectionCount: 3,
    allowedVerticalConnectionKinds: ["stairs", "vertical-shaft"],
    requireGlobalConnectivity: true,
    allowVerticalCycles: true,
  });
  return {
    structure: result.structure,
    levels: result.structure.levels.map((level) => ({
      id: level.id,
      name: level.name,
      verticalIndex: level.verticalIndex,
      dungeon: result.levels.find((entry) => entry.levelId === level.id)!.generation.dungeon,
    })),
  };
}

describe("createDungeonStructureSvg", () => {
  it("puts every level on one labeled sheet, top first, with its vertical connections", () => {
    const { levels, structure } = generate();
    const sheet = createDungeonStructureSvg(levels, structure.verticalConnections, "Teste");

    for (const level of levels) expect(sheet.svg).toContain(formatLevelLabel(level));
    expect(sheet.svg.indexOf("Nível 0 · Principal")).toBeLessThan(sheet.svg.indexOf("Nível -1 · Subsolo 1"));
    expect(sheet.svg.indexOf("Nível -1 · Subsolo 1")).toBeLessThan(sheet.svg.indexOf("Nível -2 · Subsolo 2"));
    for (let index = 1; index <= structure.verticalConnections.length; index += 1) {
      expect(sheet.svg).toContain(`V${index} ·`);
    }
    expect(sheet.svg).toContain("CONEXÕES VERTICAIS");
    expect(sheet.svg.startsWith("<svg")).toBe(true);
    expect(sheet.svg.endsWith("</svg>")).toBe(true);
    expect(sheet.width).toBeGreaterThan(levels[0].dungeon.width);
    expect(sheet.height).toBeGreaterThan(levels[0].dungeon.height * 3);
  });

  it("keeps the combined sheet inside the pixel budget with one shared tile size", () => {
    const { levels } = generate();
    const tileSize = getStructureExportTileSize(levels);

    expect(tileSize).toBeGreaterThan(0);
    expect(tileSize).toBeLessThanOrEqual(16);
    expect(tileSize * tileSize * levels.reduce((sum, level) => sum + level.dungeon.width * level.dungeon.height, 0))
      .toBeLessThan(16_000_000);
  });
});
