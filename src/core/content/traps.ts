import type { Tile, PointTuple } from "../types";
import {
  CORRIDOR_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
} from "../../dungeon";
import type {
  TrapCategory,
  TrapCategoryWeights,
  TrapType,
} from "../../dungeon";
import type { DungeonTrap } from "../../dungeon";

export const MAX_ROOM_TRAPS = 3;
export const MAX_ROOM_TREASURES = 3;
export const ADDITIONAL_ROOM_ITEM_CHANCE = 0.35;

export function selectWeightedTrapType(
  trapTypes: readonly TrapType[],
  weights: TrapCategoryWeights,
  random: () => number,
): TrapType | undefined {
  const availableCategories = (["mechanical", "environmental", "magical", "capture", "deception", "motion", "biological", "combat", "complex"] as readonly TrapCategory[]).filter(
    (category) =>
      Number.isFinite(weights[category]) &&
      weights[category] > 0 &&
      trapTypes.some((type) => TRAP_DEFINITIONS[type].category === category),
  );
  const totalWeight = availableCategories.reduce(
    (total, category) => total + weights[category],
    0,
  );
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const category of availableCategories) {
    choice -= weights[category];
    if (choice < 0) {
      const categoryTypes = trapTypes.filter(
        (type) => TRAP_DEFINITIONS[type].category === category,
      );
      return categoryTypes[Math.floor(random() * categoryTypes.length)];
    }
  }
  const finalCategory = availableCategories[availableCategories.length - 1];
  const finalTypes = trapTypes.filter(
    (type) => TRAP_DEFINITIONS[type].category === finalCategory,
  );
  return finalTypes[Math.floor(random() * finalTypes.length)];
}

export function placeTraps(
  rooms: { traps: TrapType[] }[],
  random: () => number,
  weights: TrapCategoryWeights,
  chancePercent: number,
): void {
  const roomTrapTypes = TRAP_TYPES.filter(
    (type) => TRAP_DEFINITIONS[type].placement !== "corridor",
  );
  for (const room of rooms) {
    const traps: TrapType[] = [];
    if (random() < chancePercent / 100) {
      for (let index = 0; index < MAX_ROOM_TRAPS; index += 1) {
        if (index > 0 && random() >= ADDITIONAL_ROOM_ITEM_CHANCE) break;
        const availableTypes = roomTrapTypes.filter((type) =>
          !traps.includes(type),
        );
        const trapType = selectWeightedTrapType(availableTypes, weights, random);
        if (!trapType) break;
        traps.push(trapType);
      }
    }
    room.traps = traps;
  }
}

export function placeCorridorTraps(
  tiles: Tile[][],
  random: () => number,
  weights: TrapCategoryWeights,
  chancePercent: number,
): DungeonTrap[] {
  const corridorTrapTypes = TRAP_TYPES.filter(
    (type) => TRAP_DEFINITIONS[type].placement !== "room",
  );
  const traps: DungeonTrap[] = [];
  const candidates: PointTuple[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (
        tiles[y][x] === CORRIDOR_TILE ||
        tiles[y][x] === 50
      )
        candidates.push([x, y]);
    }
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex],
      candidates[index],
    ];
  }

  const trapLimit = Math.min(
    3,
    Math.max(1, Math.round(candidates.length / 80)),
  );
  for (const [x, y] of candidates) {
    if (traps.length >= trapLimit) break;
    if (random() >= chancePercent / 100) continue;
    const hasNearbyTrap = traps.some(
      (trap) => Math.abs(trap.x - x) <= 1 && Math.abs(trap.y - y) <= 1,
    );
    if (hasNearbyTrap) continue;

    const trapType = selectWeightedTrapType(
      corridorTrapTypes,
      weights,
      random,
    );
    if (!trapType) continue;
    traps.push({ type: trapType, x, y });
  }
  return traps;
}