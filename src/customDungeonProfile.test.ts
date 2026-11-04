import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V2,
} from "./dungeon";
import {
  CustomDungeonProfileValidationError,
  resolveDungeonProfile,
  validateCustomDungeonProfile,
} from "./customDungeonProfile";
import type { CustomDungeonProfile } from "./dungeonProfiles";
import { generateDungeonPipeline } from "./generationPipeline";
import { validateGenerationPlan } from "./generationPlanValidation";

const customFortress: CustomDungeonProfile = {
  id: "custom-sector-fortress",
  name: "Fortaleza setorizada",
  baseProfile: "military-fortress",
  description: "Fortificação com topologia e conteúdo ajustados.",
  topology: {
    style: "circuit",
    parameters: { cycleCount: 2 },
  },
  v2Preferences: {
    spatialLayoutWeights: { ring: 100 },
    roomSizeBias: "balanced",
    defaultDensity: 58,
    corridorWidthBias: 0,
  },
  roomTypeCategoryFrequencies: { combat: 100 },
};

function generateCustom(
  profile: CustomDungeonProfile,
  overrides: Partial<Parameters<typeof generateDungeonPipeline>[0]> = {},
) {
  return generateDungeonPipeline({
    generatorVersion: DUNGEON_GENERATOR_VERSION_V2,
    profile: "custom",
    customProfile: profile,
    seed: 891234,
    parameters: {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 72,
      height: 56,
      roomCount: 8,
      corridorWidth: 1,
    },
    ...overrides,
  });
}

describe("custom dungeon profile validation and V2 integration", () => {
  it("validates optional fields and inherits omitted preferences from the base profile", () => {
    const validation = validateCustomDungeonProfile({
      id: "custom-basic",
      name: "Custom básico",
      baseProfile: "military-fortress",
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(resolveDungeonProfile("custom", validation.profile).profile).toMatchObject({
      id: "military-fortress",
      name: "Custom básico",
      topology: { style: "sectorized" },
      v2Preferences: { roomSizeBias: "compact" },
    });
  });

  it("rejects unknown, invalid, and incomplete properties with actionable paths", () => {
    const invalid = validateCustomDungeonProfile({
      id: "Invalid Profile",
      name: "",
      baseProfile: "not-registered",
      topology: {
        style: "spiral",
        parameters: { unknownCycle: 2 },
      },
      v2Preferences: {
        defaultDensity: 150,
      },
      roomCount: 8,
      unknown: true,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      "customProfile.unknown: unsupported property.",
      "id: use a lowercase, hyphen-separated identifier of at most 64 characters.",
      "name: provide a non-empty name of at most 80 characters.",
      "baseProfile: unsupported registered profile \"not-registered\".",
      "topology.style: unsupported style \"spiral\".",
      "topology.parameters.unknownCycle: unsupported property.",
      "v2Preferences.defaultDensity: expected a number between 0 and 100.",
      "customProfile.roomCount: unsupported property.",
    ]));
    expect(() => resolveDungeonProfile("custom")).toThrow(CustomDungeonProfileValidationError);
  });

  it("applies custom content, topology, spatial preferences, and remains deterministic", () => {
    const first = generateCustom(customFortress);
    const second = generateCustom(customFortress);

    expect(first.metadata.generatorVersion, first.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(first.metadata.profile).toBe(customFortress.id);
    expect(first.metadata.settings).toMatchObject({
      customProfileId: customFortress.id,
      customProfileName: customFortress.name,
      baseProfile: customFortress.baseProfile,
    });
    expect(first.metadata.parameters.roomTypeCategoryFrequencies.combat).toBe(100);
    expect(first.plan?.topology?.style).toBe("circuit");
    expect(first.plan?.spatialLayout?.style).toBe("ring");
    expect(first.plan?.topology?.cycleConnectionIds).toHaveLength(2);
    expect(first.dungeon.tiles).toEqual(second.dungeon.tiles);
    expect(first.plan?.rooms.map((room) => room.id)).toEqual(second.plan?.rooms.map((room) => room.id));
    expect(validateGenerationPlan(first.plan!).valid).toBe(true);
    expect(first.fallbackReason).toBeUndefined();
  });

  it("generates custom natural and hybrid cavern profiles in V2", () => {
    const naturalProfile: CustomDungeonProfile = {
      id: "custom-natural-cavern",
      name: "Caverna calcária",
      baseProfile: "natural-cavern",
      mode: "natural-cavern",
    };
    const natural = generateCustom(naturalProfile);
    expect(natural.metadata.generatorVersion, natural.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(natural.metadata.profile).toBe(naturalProfile.id);
    expect(natural.plan?.generationMode).toBe("natural-cavern");
    expect(natural.plan?.rooms).toHaveLength(0);
    expect(natural.fallbackReason).toBeUndefined();

    const hybridProfile: CustomDungeonProfile = {
      id: "custom-hybrid-cavern",
      name: "Fortaleza em caverna",
      baseProfile: "military-fortress",
      cavesEnabled: true,
    };
    const hybrid = generateCustom(hybridProfile);
    expect(hybrid.metadata.generatorVersion, hybrid.fallbackReason).toBe(DUNGEON_GENERATOR_VERSION_V2);
    expect(hybrid.plan?.naturalRegions).toHaveLength(1);
    expect(hybrid.plan?.caveConnections).toHaveLength(1);
    expect(validateGenerationPlan(hybrid.plan!).valid).toBe(true);
    expect(hybrid.fallbackReason).toBeUndefined();
  });

  it("rejects a custom cavern mode that declares an incompatible algorithm", () => {
    const validation = validateCustomDungeonProfile({
      id: "invalid-natural-cavern",
      name: "Caverna inválida",
      baseProfile: "natural-cavern",
      mode: "natural-cavern",
      algorithm: "bsp",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('mode "natural-cavern" requires the cellular algorithm.');
    expect(() => generateCustom({
      id: "invalid-natural-cavern",
      name: "Caverna inválida",
      baseProfile: "natural-cavern",
      mode: "natural-cavern",
      algorithm: "bsp",
    })).toThrow(/requires the cellular algorithm/);
  });
});
