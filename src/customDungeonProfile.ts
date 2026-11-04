import { DUNGEON_CONCEPTS } from "./dungeonProfiles";
import type {
  CustomDungeonProfile,
  DungeonConcept,
  DungeonConceptProfile,
  DungeonProfileSelection,
} from "./dungeonProfiles";
import type { Algorithm } from "./dungeon";
import type { SpatialLayoutStyle, TopologyParameters, TopologyStyle } from "./generationPlan";

const ALGORITHMS: readonly Algorithm[] = [
  "bsp",
  "cellular",
  "drunkard",
  "hybrid",
  "bsp-cellular",
  "bsp-drunkard",
];
const TOPOLOGY_STYLES: readonly TopologyStyle[] = [
  "linear",
  "branching",
  "circuit",
  "centralized",
  "sectorized",
  "hybrid",
];
const SPATIAL_STYLES: readonly SpatialLayoutStyle[] = [
  "axis-branches",
  "central-hub",
  "ring",
  "clusters",
];
const TOPOLOGY_PARAMETER_KEYS: readonly (keyof TopologyParameters)[] = [
  "branchCount",
  "additionalConnectionCount",
  "deadEndProbability",
  "cycleCount",
  "optionalPathCount",
  "sectorCount",
  "lockedConnectionCount",
  "secretConnectionCount",
  "blockedConnectionCount",
];
const ROOM_SIZE_BIASES = ["compact", "balanced", "monumental"] as const;
const PROFILE_KEYS = [
  "id",
  "name",
  "baseProfile",
  "description",
  "generationDescription",
  "algorithm",
  "mode",
  "cavesEnabled",
  "roomTypeCategoryFrequencies",
  "trapCategoryWeights",
  "treasureCategoryWeights",
  "topology",
  "v2Preferences",
] as const;

export interface CustomDungeonProfileValidation {
  valid: boolean;
  errors: string[];
  profile?: CustomDungeonProfile;
}

export interface ResolvedDungeonProfile {
  id: string;
  baseProfile: DungeonConcept;
  profile: DungeonConceptProfile;
  mode: "rooms" | "natural-cavern";
  cavesEnabled: boolean;
  customProfile?: CustomDungeonProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isOption(value: unknown, options: readonly string[]): boolean {
  return typeof value === "string" && options.some((option) => option === value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${path}.${key}: unsupported property.`);
  }
}

function isDungeonConcept(value: unknown): value is DungeonConcept {
  return typeof value === "string" && hasOwn(DUNGEON_CONCEPTS, value);
}

function validateWeightMap(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object of numeric weights.`);
    return;
  }
  hasOnlyKeys(value, allowedKeys, path, errors);
  for (const [key, weight] of Object.entries(value)) {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 100) {
      errors.push(`${path}.${key}: expected a finite number between 0 and 100.`);
    }
  }
}

function hasPositiveEffectiveWeight(base: object, overrides: unknown): boolean {
  const weights = isRecord(overrides) ? { ...base, ...overrides } : base;
  return Object.values(weights).some((weight) => (
    typeof weight === "number" && Number.isFinite(weight) && weight > 0
  ));
}

function validateTopology(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("topology: expected an object.");
    return;
  }
  hasOnlyKeys(value, ["style", "parameters"], "topology", errors);
  if (hasOwn(value, "style") && !isOption(value.style, TOPOLOGY_STYLES)) {
    errors.push(`topology.style: unsupported style "${String(value.style)}".`);
  }
  if (!hasOwn(value, "parameters")) return;
  if (!isRecord(value.parameters)) {
    errors.push("topology.parameters: expected an object.");
    return;
  }
  hasOnlyKeys(value.parameters, TOPOLOGY_PARAMETER_KEYS, "topology.parameters", errors);
  for (const [key, parameter] of Object.entries(value.parameters)) {
    if (key === "deadEndProbability") {
      if (typeof parameter !== "number" || !Number.isFinite(parameter) || parameter < 0 || parameter > 1) {
        errors.push("topology.parameters.deadEndProbability: expected a number between 0 and 1.");
      }
    } else if (typeof parameter !== "number" || !Number.isSafeInteger(parameter) || parameter < 0) {
      errors.push(`topology.parameters.${key}: expected a non-negative safe integer.`);
    }
  }
}

function validateV2Preferences(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("v2Preferences: expected an object.");
    return;
  }
  hasOnlyKeys(
    value,
    ["spatialLayoutWeights", "roomSizeBias", "defaultDensity", "corridorWidthBias"],
    "v2Preferences",
    errors,
  );
  if (hasOwn(value, "spatialLayoutWeights")) {
    validateWeightMap(
      value.spatialLayoutWeights,
      SPATIAL_STYLES,
      "v2Preferences.spatialLayoutWeights",
      errors,
    );
  }
  if (
    hasOwn(value, "roomSizeBias")
    && !isOption(value.roomSizeBias, ROOM_SIZE_BIASES)
  ) {
    errors.push("v2Preferences.roomSizeBias: expected compact, balanced, or monumental.");
  }
  if (hasOwn(value, "defaultDensity")) {
    const density = value.defaultDensity;
    if (typeof density !== "number" || !Number.isFinite(density) || density < 0 || density > 100) {
      errors.push("v2Preferences.defaultDensity: expected a number between 0 and 100.");
    }
  }
  if (hasOwn(value, "corridorWidthBias")) {
    const bias = value.corridorWidthBias;
    if (bias !== -1 && bias !== 0 && bias !== 1) {
      errors.push("v2Preferences.corridorWidthBias: expected -1, 0, or 1.");
    }
  }
}

function isCustomDungeonProfile(
  value: unknown,
  errors: string[],
): value is CustomDungeonProfile {
  if (!isRecord(value)) {
    errors.push("customProfile: expected an object.");
    return false;
  }
  hasOnlyKeys(value, PROFILE_KEYS, "customProfile", errors);

  if (typeof value.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) || value.id.length > 64) {
    errors.push("id: use a lowercase, hyphen-separated identifier of at most 64 characters.");
  }
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80) {
    errors.push("name: provide a non-empty name of at most 80 characters.");
  }
  if (!isDungeonConcept(value.baseProfile)) {
    errors.push(`baseProfile: unsupported registered profile "${String(value.baseProfile)}".`);
  }
  if (hasOwn(value, "description") && (typeof value.description !== "string" || value.description.length > 300)) {
    errors.push("description: expected a string of at most 300 characters.");
  }
  if (
    hasOwn(value, "generationDescription")
    && (typeof value.generationDescription !== "string" || value.generationDescription.length > 300)
  ) {
    errors.push("generationDescription: expected a string of at most 300 characters.");
  }
  if (hasOwn(value, "algorithm") && !isOption(value.algorithm, ALGORITHMS)) {
    errors.push(`algorithm: unsupported algorithm "${String(value.algorithm)}".`);
  }
  if (hasOwn(value, "mode") && value.mode !== "rooms" && value.mode !== "natural-cavern") {
    errors.push('mode: expected "rooms" or "natural-cavern".');
  }
  if (hasOwn(value, "cavesEnabled") && typeof value.cavesEnabled !== "boolean") {
    errors.push("cavesEnabled: expected a boolean.");
  }

  const categories = DUNGEON_CONCEPTS["military-fortress"];
  if (hasOwn(value, "roomTypeCategoryFrequencies")) {
    validateWeightMap(
      value.roomTypeCategoryFrequencies,
      Object.keys(categories.roomTypeCategoryFrequencies),
      "roomTypeCategoryFrequencies",
      errors,
    );
  }
  if (hasOwn(value, "trapCategoryWeights")) {
    validateWeightMap(
      value.trapCategoryWeights,
      Object.keys(categories.trapCategoryWeights),
      "trapCategoryWeights",
      errors,
    );
  }
  if (hasOwn(value, "treasureCategoryWeights")) {
    validateWeightMap(
      value.treasureCategoryWeights,
      Object.keys(categories.treasureCategoryWeights),
      "treasureCategoryWeights",
      errors,
    );
  }
  if (hasOwn(value, "topology")) validateTopology(value.topology, errors);
  if (hasOwn(value, "v2Preferences")) validateV2Preferences(value.v2Preferences, errors);

  if (
    isDungeonConcept(value.baseProfile)
    && (value.mode === "natural-cavern" || (!hasOwn(value, "mode") && value.baseProfile === "natural-cavern"))
    && (value.algorithm ?? DUNGEON_CONCEPTS[value.baseProfile].algorithm) !== "cellular"
  ) {
    errors.push('mode "natural-cavern" requires the cellular algorithm.');
  }
  if (isDungeonConcept(value.baseProfile)) {
    const base = DUNGEON_CONCEPTS[value.baseProfile];
    const preferences = isRecord(value.v2Preferences) ? value.v2Preferences : undefined;
    if (!hasPositiveEffectiveWeight(
      base.v2Preferences.spatialLayoutWeights,
      preferences?.spatialLayoutWeights,
    )) {
      errors.push("v2Preferences.spatialLayoutWeights: at least one effective style weight must be positive.");
    }
    if (!hasPositiveEffectiveWeight(base.roomTypeCategoryFrequencies, value.roomTypeCategoryFrequencies)) {
      errors.push("roomTypeCategoryFrequencies: at least one effective category weight must be positive.");
    }
    if (!hasPositiveEffectiveWeight(base.trapCategoryWeights, value.trapCategoryWeights)) {
      errors.push("trapCategoryWeights: at least one effective category weight must be positive.");
    }
    if (!hasPositiveEffectiveWeight(base.treasureCategoryWeights, value.treasureCategoryWeights)) {
      errors.push("treasureCategoryWeights: at least one effective category weight must be positive.");
    }
  }

  return errors.length === 0;
}

export function validateCustomDungeonProfile(input: unknown): CustomDungeonProfileValidation {
  const errors: string[] = [];
  const valid = isCustomDungeonProfile(input, errors);
  return valid
    ? { valid: true, errors, profile: input }
    : { valid: false, errors };
}

export class CustomDungeonProfileValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid custom dungeon profile: ${issues.join("; ")}`);
    this.name = "CustomDungeonProfileValidationError";
    this.issues = issues;
  }
}

export function resolveDungeonProfile(
  selection: DungeonProfileSelection,
  customProfileInput?: unknown,
): ResolvedDungeonProfile {
  if (selection !== "custom") {
    if (!isDungeonConcept(selection)) {
      throw new CustomDungeonProfileValidationError([`Unsupported profile "${String(selection)}".`]);
    }
    if (customProfileInput !== undefined) {
      throw new CustomDungeonProfileValidationError([
        "customProfile can only be supplied when profile is set to custom.",
      ]);
    }
    const profile = DUNGEON_CONCEPTS[selection];
    return {
      id: selection,
      baseProfile: selection,
      profile,
      mode: selection === "natural-cavern" ? "natural-cavern" : "rooms",
      cavesEnabled: false,
    };
  }

  const validation = validateCustomDungeonProfile(customProfileInput);
  if (!validation.valid || !validation.profile) {
    throw new CustomDungeonProfileValidationError(
      validation.errors.length > 0 ? validation.errors : ["A customProfile object is required."],
    );
  }
  const customProfile = validation.profile;
  const baseProfile = customProfile.baseProfile;
  const base = DUNGEON_CONCEPTS[baseProfile];
  const profile: DungeonConceptProfile = {
    ...base,
    name: customProfile.name,
    description: customProfile.description ?? base.description,
    generationDescription: customProfile.generationDescription ?? base.generationDescription,
    algorithm: customProfile.algorithm ?? base.algorithm,
    roomTypeCategoryFrequencies: {
      ...base.roomTypeCategoryFrequencies,
      ...customProfile.roomTypeCategoryFrequencies,
    },
    trapCategoryWeights: {
      ...base.trapCategoryWeights,
      ...customProfile.trapCategoryWeights,
    },
    treasureCategoryWeights: {
      ...base.treasureCategoryWeights,
      ...customProfile.treasureCategoryWeights,
    },
    topology: {
      style: customProfile.topology?.style ?? base.topology.style,
      parameters: {
        ...base.topology.parameters,
        ...customProfile.topology?.parameters,
      },
    },
    v2Preferences: {
      spatialLayoutWeights: {
        ...base.v2Preferences.spatialLayoutWeights,
        ...customProfile.v2Preferences?.spatialLayoutWeights,
      },
      roomSizeBias: customProfile.v2Preferences?.roomSizeBias ?? base.v2Preferences.roomSizeBias,
      defaultDensity: customProfile.v2Preferences?.defaultDensity ?? base.v2Preferences.defaultDensity,
      corridorWidthBias: customProfile.v2Preferences?.corridorWidthBias ?? base.v2Preferences.corridorWidthBias,
    },
  };
  return {
    id: customProfile.id,
    baseProfile,
    profile,
    mode: customProfile.mode ?? (baseProfile === "natural-cavern" ? "natural-cavern" : "rooms"),
    cavesEnabled: customProfile.cavesEnabled ?? false,
    customProfile,
  };
}
