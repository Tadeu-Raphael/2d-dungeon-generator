import type { DungeonGeneratorVersion } from "./dungeon";
import type { GenerationPlan, GridPosition } from "./generationPlan";

export type VerticalConnectionKind =
  | "stairs"
  | "spiral-stairs"
  | "vertical-shaft"
  | "elevator"
  | "trapdoor"
  | "drop"
  | "secret-passage"
  | "ramp"
  | "portal"
  | "other";

export type VerticalConnectionDirection =
  | "bidirectional"
  | "source-to-target"
  | "target-to-source";

export interface DungeonStructureGeneration {
  seed: number;
  generatorVersion: DungeonGeneratorVersion;
  generatedAt: string;
}

export interface DungeonConnectivityPolicy {
  requireGlobalConnectivity: boolean;
  entryLevelId?: string;
}

export interface DungeonLevel {
  id: string;
  name: string;
  /** Lower indices are deeper; levels are stored in ascending index order. */
  verticalIndex: number;
  plan: GenerationPlan;
  isSecret?: boolean;
  isOptional?: boolean;
  metadata: Readonly<Record<string, unknown>>;
}

export interface VerticalConnection {
  id: string;
  sourceLevelId: string;
  targetLevelId: string;
  sourcePosition: GridPosition;
  targetPosition: GridPosition;
  kind: VerticalConnectionKind;
  direction: VerticalConnectionDirection;
  accessRequirements?: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
}

export interface DungeonStructure {
  id: string;
  name: string;
  generation: DungeonStructureGeneration;
  settings: Readonly<Record<string, string | number | boolean>>;
  connectivity: DungeonConnectivityPolicy;
  levels: readonly DungeonLevel[];
  verticalConnections: readonly VerticalConnection[];
  metadata: Readonly<Record<string, unknown>>;
}
