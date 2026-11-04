import type { Dungeon } from "./dungeon";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import type { DungeonStructure } from "./dungeonStructure";
import { DungeonStructureValidationError, validateDungeonStructure } from "./dungeonStructureValidation";

export function dungeonStructureToDungeon(
  structure: DungeonStructure,
  levelId?: string,
): Dungeon {
  const validation = validateDungeonStructure(structure);
  if (!validation.valid) {
    throw new DungeonStructureValidationError(validation.issues);
  }

  if (levelId === undefined && structure.levels.length !== 1) {
    throw new RangeError("A level ID is required to adapt a multilevel dungeon to the single-level Dungeon format.");
  }
  const level = levelId === undefined
    ? structure.levels[0]
    : structure.levels.find((candidate) => candidate.id === levelId);
  if (!level) {
    throw new RangeError(`Dungeon level "${levelId}" does not exist.`);
  }
  return generationPlanToDungeon(level.plan);
}
