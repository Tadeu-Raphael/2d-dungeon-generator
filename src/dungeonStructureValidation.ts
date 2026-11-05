import { getCorridorPathBrush } from "./generationCorridorGeometry";
import type { GenerationPlanValidationIssueCode } from "./generationPlanValidation";
import { validateGenerationPlan } from "./generationPlanValidation";
import type { DungeonLevel, DungeonStructure, VerticalConnection } from "./dungeonStructure";
import type { GenerationPlan, GridPosition } from "./generationPlan";
import { MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE } from "./dungeonStructure";

export type DungeonStructureValidationIssueCode =
  | GenerationPlanValidationIssueCode
  | "invalid-dungeon-id"
  | "invalid-dungeon-name"
  | "invalid-dungeon-seed"
  | "invalid-generation-metadata"
  | "no-levels"
  | "invalid-level-id"
  | "duplicate-level-id"
  | "invalid-level-name"
  | "invalid-level-index"
  | "duplicate-level-index"
  | "levels-not-ordered"
  | "duplicate-entity-id-across-levels"
  | "room-level-mismatch"
  | "vertical-connection-in-level-plan"
  | "invalid-connectivity-policy"
  | "entry-level-not-found"
  | "invalid-vertical-connection-id"
  | "invalid-vertical-connection"
  | "vertical-connection-level-not-found"
  | "vertical-connection-self-reference"
  | "vertical-connection-position-out-of-bounds"
  | "vertical-connection-anchor-missing"
  | "vertical-connection-marker-not-found"
  | "vertical-stairs-not-adjacent"
  | "vertical-stairs-too-far-apart"
  | "vertical-stair-marker-mismatch"
  | "unpaired-stair-transition"
  | "invalid-access-requirement"
  | "disconnected-levels";

export interface DungeonStructureValidationIssue {
  code: DungeonStructureValidationIssueCode;
  path: string;
  message: string;
}

export interface DungeonStructureValidationResult {
  valid: boolean;
  issues: DungeonStructureValidationIssue[];
}

export interface DungeonStructureConnectivityAnalysis {
  entryLevelId?: string;
  reachableLevelIds: string[];
  disconnectedLevelIds: string[];
  isolatedLevelIds: string[];
  cycleCount: number;
}

function isGridPosition(position: GridPosition): boolean {
  return Number.isSafeInteger(position.x) && Number.isSafeInteger(position.y);
}

function positionKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

const VERTICAL_CONNECTION_KINDS = new Set([
  "stairs",
  "spiral-stairs",
  "vertical-shaft",
  "elevator",
  "trapdoor",
  "drop",
  "secret-passage",
  "ramp",
  "portal",
  "other",
]);
const VERTICAL_CONNECTION_DIRECTIONS = new Set([
  "bidirectional",
  "source-to-target",
  "target-to-source",
]);

function isInsidePlan(position: GridPosition, plan: GenerationPlan): boolean {
  return isGridPosition(position)
    && position.x >= 0
    && position.y >= 0
    && position.x < plan.width
    && position.y < plan.height;
}

function collectSpatialAnchors(plan: GenerationPlan): Set<string> {
  const anchors = new Set<string>();
  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      anchors.add(positionKey({
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      }));
    }
  }
  for (const region of plan.naturalRegions ?? []) {
    for (const span of region.rowSpans) {
      for (let x = span.xStart; x < span.xEnd; x += 1) {
        anchors.add(positionKey({ x, y: span.y }));
      }
    }
  }
  for (const caveConnection of plan.caveConnections ?? []) {
    for (const position of caveConnection.path) anchors.add(positionKey(position));
  }
  for (const connection of plan.connections) {
    if (
      connection.connectionType === "vertical"
      || connection.connectionType === "blocked-passage"
      || connection.isBlocked
      || connection.path.length === 0
      || !Number.isSafeInteger(connection.width)
      || connection.width <= 0
    ) {
      continue;
    }
    for (const position of getCorridorPathBrush(connection.path, connection.width)) {
      anchors.add(positionKey(position));
    }
  }
  return anchors;
}

function registerGlobalId(
  id: string,
  path: string,
  ids: Map<string, string>,
  addIssue: (
    code: DungeonStructureValidationIssueCode,
    path: string,
    message: string,
  ) => void,
): void {
  if (!id.trim()) return;
  const firstPath = ids.get(id);
  if (firstPath) {
    addIssue(
      "duplicate-entity-id-across-levels",
      path,
      `This ID is already used at ${firstPath}.`,
    );
    return;
  }
  ids.set(id, path);
}

function registerPlanIds(
  plan: GenerationPlan,
  path: string,
  ids: Map<string, string>,
  addIssue: (
    code: DungeonStructureValidationIssueCode,
    path: string,
    message: string,
  ) => void,
): void {
  registerGlobalId(plan.id, `${path}.id`, ids, addIssue);
  const groups: Array<[string, readonly { id: string }[]]> = [
    ["rooms", plan.rooms],
    ["connections", plan.connections],
    ["sectors", plan.sectors],
    ["intersections", plan.intersections],
    ["transitions", plan.transitions],
    ["naturalRegions", plan.naturalRegions ?? []],
    ["caveConnections", plan.caveConnections ?? []],
    ["features", plan.features],
  ];
  for (const [group, entities] of groups) {
    for (const [index, entity] of entities.entries()) {
      registerGlobalId(entity.id, `${path}.${group}[${index}].id`, ids, addIssue);
    }
  }
}

function isKnownVerticalKind(kind: string): boolean {
  return VERTICAL_CONNECTION_KINDS.has(kind);
}

function isKnownDirection(direction: string): boolean {
  return VERTICAL_CONNECTION_DIRECTIONS.has(direction);
}

function isStairConnection(kind: string): boolean {
  return kind === "stairs" || kind === "spiral-stairs";
}

function getReachableLevels(
  entryLevelId: string,
  levels: ReadonlyMap<string, DungeonLevel>,
  connections: readonly VerticalConnection[],
): Set<string> {
  const reachable = new Set([entryLevelId]);
  const pending = [entryLevelId];
  while (pending.length > 0) {
    const currentLevelId = pending.pop()!;
    for (const connection of connections) {
      let nextLevelId: string | undefined;
      if (
        connection.sourceLevelId === currentLevelId
        && (connection.direction === "bidirectional" || connection.direction === "source-to-target")
      ) {
        nextLevelId = connection.targetLevelId;
      } else if (
        connection.targetLevelId === currentLevelId
        && (connection.direction === "bidirectional" || connection.direction === "target-to-source")
      ) {
        nextLevelId = connection.sourceLevelId;
      }
      if (nextLevelId && levels.has(nextLevelId) && !reachable.has(nextLevelId)) {
        reachable.add(nextLevelId);
        pending.push(nextLevelId);
      }
    }
  }
  return reachable;
}

export function analyzeDungeonConnectivity(
  dungeon: DungeonStructure,
): DungeonStructureConnectivityAnalysis {
  const levelsById = new Map(dungeon.levels.map((level) => [level.id, level]));
  const entryLevelId = dungeon.connectivity.entryLevelId;
  const reachable = entryLevelId && levelsById.has(entryLevelId)
    ? getReachableLevels(entryLevelId, levelsById, dungeon.verticalConnections)
    : new Set<string>();
  const reachableLevelIds = dungeon.levels
    .filter((level) => reachable.has(level.id))
    .map((level) => level.id);
  const disconnectedLevelIds = dungeon.levels
    .filter((level) => !reachable.has(level.id))
    .map((level) => level.id);
  const adjacency = new Map(dungeon.levels.map((level) => [level.id, [] as string[]]));
  const validConnections = dungeon.verticalConnections.filter((connection) => (
    levelsById.has(connection.sourceLevelId)
    && levelsById.has(connection.targetLevelId)
  ));
  for (const connection of validConnections) {
    adjacency.get(connection.sourceLevelId)?.push(connection.targetLevelId);
    adjacency.get(connection.targetLevelId)?.push(connection.sourceLevelId);
  }
  const isolatedLevelIds = dungeon.levels.length > 1
    ? dungeon.levels
      .filter((level) => (adjacency.get(level.id)?.length ?? 0) === 0)
      .map((level) => level.id)
    : [];
  const visited = new Set<string>();
  let componentCount = 0;
  for (const level of dungeon.levels) {
    if (visited.has(level.id)) continue;
    componentCount += 1;
    const pending = [level.id];
    visited.add(level.id);
    while (pending.length > 0) {
      const currentLevelId = pending.pop();
      if (currentLevelId === undefined) continue;
      for (const nextLevelId of adjacency.get(currentLevelId) ?? []) {
        if (visited.has(nextLevelId)) continue;
        visited.add(nextLevelId);
        pending.push(nextLevelId);
      }
    }
  }
  const cycleCount = Math.max(
    0,
    validConnections.length - dungeon.levels.length + componentCount,
  );
  return {
    ...(entryLevelId ? { entryLevelId } : {}),
    reachableLevelIds,
    disconnectedLevelIds,
    isolatedLevelIds,
    cycleCount,
  };
}

export function validateDungeonStructure(
  dungeon: DungeonStructure,
): DungeonStructureValidationResult {
  const issues: DungeonStructureValidationIssue[] = [];
  const addIssue = (
    code: DungeonStructureValidationIssueCode,
    path: string,
    message: string,
  ): void => {
    issues.push({ code, path, message });
  };
  const ids = new Map<string, string>();

  if (!dungeon.id.trim()) {
    addIssue("invalid-dungeon-id", "id", "Dungeon structure IDs cannot be empty.");
  } else {
    registerGlobalId(dungeon.id, "id", ids, addIssue);
  }
  if (!dungeon.name.trim()) {
    addIssue("invalid-dungeon-name", "name", "Dungeon structures need a name.");
  }
  if (!Number.isSafeInteger(dungeon.generation.seed)) {
    addIssue("invalid-dungeon-seed", "generation.seed", "Dungeon seeds must be safe integers.");
  }
  if (!dungeon.generation.generatedAt.trim()) {
    addIssue(
      "invalid-generation-metadata",
      "generation.generatedAt",
      "Dungeon generation metadata needs a generatedAt value.",
    );
  }
  if (dungeon.levels.length === 0) {
    addIssue("no-levels", "levels", "A dungeon structure must contain at least one level.");
  }

  const levelsById = new Map<string, DungeonLevel>();
  const anchorsByLevelId = new Map<string, Set<string>>();
  const levelIndices = new Set<number>();
  let previousVerticalIndex: number | undefined;
  for (const [index, level] of dungeon.levels.entries()) {
    const levelPath = `levels[${index}]`;
    if (!level.id.trim()) {
      addIssue("invalid-level-id", `${levelPath}.id`, "Level IDs cannot be empty.");
    } else {
      const firstLevel = levelsById.get(level.id);
      if (firstLevel) {
        addIssue(
          "duplicate-level-id",
          `${levelPath}.id`,
          `Level ID ${level.id} is already in use.`,
        );
      } else {
        levelsById.set(level.id, level);
      }
      registerGlobalId(level.id, `${levelPath}.id`, ids, addIssue);
    }
    if (!level.name.trim()) {
      addIssue("invalid-level-name", `${levelPath}.name`, "Levels need a name.");
    }
    if (!Number.isSafeInteger(level.verticalIndex)) {
      addIssue(
        "invalid-level-index",
        `${levelPath}.verticalIndex`,
        "Level vertical indices must be safe integers.",
      );
    } else {
      if (levelIndices.has(level.verticalIndex)) {
        addIssue(
          "duplicate-level-index",
          `${levelPath}.verticalIndex`,
          `Vertical index ${level.verticalIndex} is already in use.`,
        );
      }
      levelIndices.add(level.verticalIndex);
      if (previousVerticalIndex !== undefined && level.verticalIndex < previousVerticalIndex) {
        addIssue(
          "levels-not-ordered",
          `${levelPath}.verticalIndex`,
          "Levels must be ordered from the lowest vertical index to the highest.",
        );
      }
      previousVerticalIndex = level.verticalIndex;
    }

    registerPlanIds(level.plan, `${levelPath}.plan`, ids, addIssue);
    const planValidation = validateGenerationPlan(level.plan);
    for (const issue of planValidation.issues) {
      addIssue(issue.code, `${levelPath}.plan.${issue.path}`, issue.message);
    }
    for (const [roomIndex, room] of level.plan.rooms.entries()) {
      if (room.floorId !== level.id) {
        addIssue(
          "room-level-mismatch",
          `${levelPath}.plan.rooms[${roomIndex}].floorId`,
          `Room ${room.id} must belong to level ${level.id}.`,
        );
      }
    }
    for (const [connectionIndex, connection] of level.plan.connections.entries()) {
      if (connection.connectionType === "vertical") {
        addIssue(
          "vertical-connection-in-level-plan",
          `${levelPath}.plan.connections[${connectionIndex}]`,
          "Vertical links belong to DungeonStructure.verticalConnections, not a level's horizontal graph.",
        );
      }
    }
    anchorsByLevelId.set(level.id, collectSpatialAnchors(level.plan));
  }

  if (dungeon.connectivity.requireGlobalConnectivity && !dungeon.connectivity.entryLevelId) {
    addIssue(
      "invalid-connectivity-policy",
      "connectivity.entryLevelId",
      "Global connectivity validation requires an entryLevelId.",
    );
  }
  if (
    dungeon.connectivity.entryLevelId
    && !levelsById.has(dungeon.connectivity.entryLevelId)
  ) {
    addIssue(
      "entry-level-not-found",
      "connectivity.entryLevelId",
      `Entry level ${dungeon.connectivity.entryLevelId} does not exist.`,
    );
  }

  const connectionIds = new Set<string>();
  for (const [index, connection] of dungeon.verticalConnections.entries()) {
    const connectionPath = `verticalConnections[${index}]`;
    if (!connection.id.trim()) {
      addIssue(
        "invalid-vertical-connection-id",
        `${connectionPath}.id`,
        "Vertical connection IDs cannot be empty.",
      );
    } else {
      if (connectionIds.has(connection.id)) {
        addIssue(
          "invalid-vertical-connection",
          `${connectionPath}.id`,
          `Vertical connection ID ${connection.id} is duplicated.`,
        );
      }
      connectionIds.add(connection.id);
      registerGlobalId(connection.id, `${connectionPath}.id`, ids, addIssue);
    }
    if (!isKnownVerticalKind(connection.kind) || !isKnownDirection(connection.direction)) {
      addIssue(
        "invalid-vertical-connection",
        connectionPath,
        "Vertical connections need a supported kind and direction.",
      );
    }
    const sourceLevel = levelsById.get(connection.sourceLevelId);
    const targetLevel = levelsById.get(connection.targetLevelId);
    if (!sourceLevel || !targetLevel) {
      addIssue(
        "vertical-connection-level-not-found",
        connectionPath,
        "Both endpoint levels must exist in the dungeon structure.",
      );
    } else if (sourceLevel.id === targetLevel.id) {
      addIssue(
        "vertical-connection-self-reference",
        connectionPath,
        "A vertical connection must link two distinct levels.",
      );
    }
    if (sourceLevel) {
      if (!isInsidePlan(connection.sourcePosition, sourceLevel.plan)) {
        addIssue(
          "vertical-connection-position-out-of-bounds",
          `${connectionPath}.sourcePosition`,
          `Source position is outside level ${sourceLevel.id}.`,
        );
      } else if (!anchorsByLevelId.get(sourceLevel.id)?.has(positionKey(connection.sourcePosition))) {
        addIssue(
          "vertical-connection-anchor-missing",
          `${connectionPath}.sourcePosition`,
          `Source position does not touch walkable geometry on level ${sourceLevel.id}.`,
        );
      }
      if (!sourceLevel.plan.transitions.some((transition) => (
        transition.verticalConnectionId === connection.id
        && transition.position.x === connection.sourcePosition.x
        && transition.position.y === connection.sourcePosition.y
      ))) {
        addIssue(
          "vertical-connection-marker-not-found",
          `${connectionPath}.sourcePosition`,
          `No transition on level ${sourceLevel.id} represents vertical connection ${connection.id}.`,
        );
      }
    }
    if (targetLevel) {
      if (!isInsidePlan(connection.targetPosition, targetLevel.plan)) {
        addIssue(
          "vertical-connection-position-out-of-bounds",
          `${connectionPath}.targetPosition`,
          `Target position is outside level ${targetLevel.id}.`,
        );
      } else if (!anchorsByLevelId.get(targetLevel.id)?.has(positionKey(connection.targetPosition))) {
        addIssue(
          "vertical-connection-anchor-missing",
          `${connectionPath}.targetPosition`,
          `Target position does not touch walkable geometry on level ${targetLevel.id}.`,
        );
      }
      if (!targetLevel.plan.transitions.some((transition) => (
        transition.verticalConnectionId === connection.id
        && transition.position.x === connection.targetPosition.x
        && transition.position.y === connection.targetPosition.y
      ))) {
        addIssue(
          "vertical-connection-marker-not-found",
          `${connectionPath}.targetPosition`,
          `No transition on level ${targetLevel.id} represents vertical connection ${connection.id}.`,
        );
      }
    }
    if (isStairConnection(connection.kind) && sourceLevel && targetLevel) {
      const sourceLevelIndex = dungeon.levels.indexOf(sourceLevel);
      const targetLevelIndex = dungeon.levels.indexOf(targetLevel);
      if (Math.abs(sourceLevelIndex - targetLevelIndex) !== 1) {
        addIssue(
          "vertical-stairs-not-adjacent",
          connectionPath,
          "Stair connections must link immediately adjacent levels.",
        );
      }

      const sourceShouldAscend = sourceLevel.verticalIndex < targetLevel.verticalIndex;
      const expectedSourceType = sourceShouldAscend ? "stairs-up" : "stairs-down";
      const expectedTargetType = sourceShouldAscend ? "stairs-down" : "stairs-up";
      const sourceTransition = sourceLevel.plan.transitions.find((transition) => (
        transition.verticalConnectionId === connection.id
        && transition.position.x === connection.sourcePosition.x
        && transition.position.y === connection.sourcePosition.y
      ));
      const targetTransition = targetLevel.plan.transitions.find((transition) => (
        transition.verticalConnectionId === connection.id
        && transition.position.x === connection.targetPosition.x
        && transition.position.y === connection.targetPosition.y
      ));
      if (
        (sourceTransition && sourceTransition.type !== expectedSourceType)
        || (targetTransition && targetTransition.type !== expectedTargetType)
      ) {
        addIssue(
          "vertical-stair-marker-mismatch",
          connectionPath,
          "A vertical stair link must pair a downward marker with an upward marker on the lower level.",
        );
      }
      if (
        isGridPosition(connection.sourcePosition)
        && isGridPosition(connection.targetPosition)
      ) {
        const distance = Math.abs(connection.sourcePosition.x - connection.targetPosition.x)
          + Math.abs(connection.sourcePosition.y - connection.targetPosition.y);
        if (distance > MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE) {
          addIssue(
            "vertical-stairs-too-far-apart",
            connectionPath,
            `Stair endpoints must be within ${MAX_VERTICAL_STAIR_ALIGNMENT_DISTANCE} tiles of each other.`,
          );
        }
      }
    }
    for (const [requirementIndex, requirement] of (connection.accessRequirements ?? []).entries()) {
      if (!requirement.trim()) {
        addIssue(
          "invalid-access-requirement",
          `${connectionPath}.accessRequirements[${requirementIndex}]`,
          "Access requirements cannot be empty.",
        );
      }
    }
  }

  for (const [levelIndex, level] of dungeon.levels.entries()) {
    for (const [transitionIndex, transition] of level.plan.transitions.entries()) {
      if (transition.verticalConnectionId && !connectionIds.has(transition.verticalConnectionId)) {
        addIssue(
          "vertical-connection-marker-not-found",
          `levels[${levelIndex}].plan.transitions[${transitionIndex}].verticalConnectionId`,
          `Vertical connection ${transition.verticalConnectionId} does not exist in the dungeon structure.`,
        );
      }
      if (
        dungeon.levels.length > 1
        && (transition.type === "stairs-up" || transition.type === "stairs-down")
      ) {
        const connection = dungeon.verticalConnections.find(
          (candidate) => candidate.id === transition.verticalConnectionId,
        );
        const isExternalEntry = transition.type === "stairs-up"
          && transition.metadata.role === "entry"
          && !transition.verticalConnectionId;
        if (!connection && !isExternalEntry) {
          addIssue(
            "unpaired-stair-transition",
            `levels[${levelIndex}].plan.transitions[${transitionIndex}]`,
            "Every stair in a multilevel dungeon must connect to another level, except the dungeon entry.",
          );
        } else if (connection && !isStairConnection(connection.kind)) {
          addIssue(
            "vertical-stair-marker-mismatch",
            `levels[${levelIndex}].plan.transitions[${transitionIndex}]`,
            "Stair markers can only belong to stair or spiral-stair connections.",
          );
        }
      }
    }
  }

  if (dungeon.connectivity.requireGlobalConnectivity && dungeon.connectivity.entryLevelId) {
    const connectivity = analyzeDungeonConnectivity(dungeon);
    if (connectivity.disconnectedLevelIds.length > 0) {
      addIssue(
        "disconnected-levels",
        "levels",
        `Levels are not reachable from ${dungeon.connectivity.entryLevelId}: ${connectivity.disconnectedLevelIds.join(", ")}.`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

export class DungeonStructureValidationError extends Error {
  readonly issues: readonly DungeonStructureValidationIssue[];

  constructor(issues: readonly DungeonStructureValidationIssue[]) {
    const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    super(`Invalid DungeonStructure: ${details}`);
    this.name = "DungeonStructureValidationError";
    this.issues = [...issues];
  }
}
