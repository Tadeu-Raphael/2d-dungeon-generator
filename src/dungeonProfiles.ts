import type { Algorithm, TrapCategoryWeights } from "./dungeon";
import type { RoomTypeCategoryFrequencies } from "./roomTypes";
import type { TreasureCategoryWeights } from "./treasures";

export type DungeonConcept =
  | "military-fortress"
  | "ancient-temple"
  | "catacombs"
  | "abandoned-mine"
  | "arcane-laboratory"
  | "natural-cavern"
  | "prison"
  | "lost-civilization";

export interface DungeonConceptProfile {
  id: DungeonConcept;
  name: string;
  description: string;
  algorithm: Algorithm;
  generationDescription: string;
  roomTypeCategoryFrequencies: RoomTypeCategoryFrequencies;
  trapCategoryWeights: TrapCategoryWeights;
  treasureCategoryWeights: TreasureCategoryWeights;
}

export function getDungeonGenerationAlgorithm(
  profileAlgorithm: Algorithm,
  cavesEnabled: boolean,
): Algorithm {
  if (profileAlgorithm === "cellular") return profileAlgorithm;
  return cavesEnabled ? "bsp-cellular" : "bsp";
}

export const DUNGEON_CONCEPTS: Record<DungeonConcept, DungeonConceptProfile> = {
  "military-fortress": {
    id: "military-fortress",
    name: "Fortaleza militar",
    description: "Guarnições, arsenais e postos de defesa.",
    algorithm: "bsp",
    generationDescription: "Salas e corredores defensivos; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 8,
      combat: 27,
      habitation: 12,
      logistics: 20,
      religious: 2,
      arcane: 1,
      funerary: 2,
      natural: 1,
      puzzle: 5,
      treasure: 6,
      special: 16,
    },
    trapCategoryWeights: {
      mechanical: 6, environmental: 3, magical: 1, capture: 3, deception: 1,
      motion: 7, biological: 1, combat: 7, complex: 2,
    },
    treasureCategoryWeights: {
      monetary: 17, equipment: 20, consumables: 8, magical: 3, relics: 10,
      documents: 12, materials: 10, creatureTrophies: 12, cursed: 3, secret: 5,
    },
  },
  "ancient-temple": {
    id: "ancient-temple",
    name: "Templo antigo",
    description: "Santuários, rituais e câmaras enigmáticas.",
    algorithm: "bsp-cellular",
    generationDescription: "Salas cerimoniais com cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 12,
      combat: 4,
      habitation: 5,
      logistics: 5,
      religious: 32,
      arcane: 8,
      funerary: 10,
      natural: 4,
      puzzle: 8,
      treasure: 5,
      special: 7,
    },
    trapCategoryWeights: {
      mechanical: 2, environmental: 2, magical: 7, capture: 3, deception: 6,
      motion: 2, biological: 1, combat: 2, complex: 7,
    },
    treasureCategoryWeights: {
      monetary: 10, equipment: 5, consumables: 8, magical: 13, relics: 18,
      documents: 16, materials: 8, creatureTrophies: 7, cursed: 10, secret: 5,
    },
  },
  catacombs: {
    id: "catacombs",
    name: "Catacumbas",
    description: "Criptas, ossuários e câmaras funerárias.",
    algorithm: "bsp-drunkard",
    generationDescription: "Salas conectadas por túneis; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 10,
      combat: 8,
      habitation: 3,
      logistics: 3,
      religious: 8,
      arcane: 2,
      funerary: 38,
      natural: 4,
      puzzle: 8,
      treasure: 8,
      special: 8,
    },
    trapCategoryWeights: {
      mechanical: 2, environmental: 4, magical: 3, capture: 5, deception: 3,
      motion: 4, biological: 6, combat: 3, complex: 4,
    },
    treasureCategoryWeights: {
      monetary: 10, equipment: 4, consumables: 5, magical: 7, relics: 22,
      documents: 18, materials: 7, creatureTrophies: 12, cursed: 10, secret: 5,
    },
  },
  "abandoned-mine": {
    id: "abandoned-mine",
    name: "Mina abandonada",
    description: "Galerias, depósitos e áreas instáveis.",
    algorithm: "bsp-drunkard",
    generationDescription: "Salas ligadas por túneis escavados; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 14,
      combat: 9,
      habitation: 3,
      logistics: 25,
      religious: 1,
      arcane: 3,
      funerary: 4,
      natural: 27,
      puzzle: 4,
      treasure: 6,
      special: 4,
    },
    trapCategoryWeights: {
      mechanical: 5, environmental: 7, magical: 1, capture: 3, deception: 1,
      motion: 6, biological: 4, combat: 2, complex: 3,
    },
    treasureCategoryWeights: {
      monetary: 10, equipment: 7, consumables: 10, magical: 3, relics: 8,
      documents: 8, materials: 35, creatureTrophies: 10, cursed: 4, secret: 5,
    },
  },
  "arcane-laboratory": {
    id: "arcane-laboratory",
    name: "Laboratório arcano",
    description: "Pesquisa, contenção e experimentos mágicos.",
    algorithm: "hybrid",
    generationDescription: "Salas e trilhas escavadas; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 8,
      combat: 8,
      habitation: 5,
      logistics: 7,
      religious: 10,
      arcane: 33,
      funerary: 3,
      natural: 2,
      puzzle: 9,
      treasure: 5,
      special: 10,
    },
    trapCategoryWeights: {
      mechanical: 2, environmental: 2, magical: 8, capture: 3, deception: 4,
      motion: 3, biological: 2, combat: 4, complex: 7,
    },
    treasureCategoryWeights: {
      monetary: 6, equipment: 6, consumables: 17, magical: 27, relics: 7,
      documents: 13, materials: 12, creatureTrophies: 3, cursed: 4, secret: 5,
    },
  },
  "natural-cavern": {
    id: "natural-cavern",
    name: "Caverna natural",
    description: "Formações naturais, água e vida subterrânea.",
    algorithm: "cellular",
    generationDescription: "Caverna orgânica sem salas estruturadas",
    roomTypeCategoryFrequencies: {
      exploration: 12,
      combat: 12,
      habitation: 4,
      logistics: 3,
      religious: 1,
      arcane: 3,
      funerary: 5,
      natural: 45,
      puzzle: 5,
      treasure: 3,
      special: 7,
    },
    trapCategoryWeights: {
      mechanical: 1, environmental: 6, magical: 2, capture: 3, deception: 2,
      motion: 4, biological: 9, combat: 4, complex: 2,
    },
    treasureCategoryWeights: {
      monetary: 7, equipment: 4, consumables: 8, magical: 4, relics: 7,
      documents: 4, materials: 39, creatureTrophies: 18, cursed: 4, secret: 5,
    },
  },
  prison: {
    id: "prison",
    name: "Prisão",
    description: "Celas, interrogatórios e vigilância.",
    algorithm: "bsp",
    generationDescription: "Setores de celas e corredores vigiados; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 10,
      combat: 16,
      habitation: 22,
      logistics: 9,
      religious: 2,
      arcane: 2,
      funerary: 8,
      natural: 1,
      puzzle: 12,
      treasure: 5,
      special: 13,
    },
    trapCategoryWeights: {
      mechanical: 6, environmental: 1, magical: 2, capture: 9, deception: 4,
      motion: 8, biological: 1, combat: 5, complex: 4,
    },
    treasureCategoryWeights: {
      monetary: 8, equipment: 14, consumables: 9, magical: 4, relics: 8,
      documents: 32, materials: 4, creatureTrophies: 8, cursed: 8, secret: 5,
    },
  },
  "lost-civilization": {
    id: "lost-civilization",
    name: "Ruínas de uma civilização perdida",
    description: "Vestígios, monumentos e espaços esquecidos.",
    algorithm: "hybrid",
    generationDescription: "Salas em meio a áreas em ruínas; cavernas opcionais",
    roomTypeCategoryFrequencies: {
      exploration: 10,
      combat: 8,
      habitation: 6,
      logistics: 10,
      religious: 12,
      arcane: 10,
      funerary: 12,
      natural: 12,
      puzzle: 10,
      treasure: 8,
      special: 2,
    },
    trapCategoryWeights: {
      mechanical: 3, environmental: 4, magical: 5, capture: 3, deception: 5,
      motion: 3, biological: 3, combat: 4, complex: 7,
    },
    treasureCategoryWeights: {
      monetary: 8, equipment: 6, consumables: 5, magical: 13, relics: 23,
      documents: 18, materials: 12, creatureTrophies: 5, cursed: 5, secret: 5,
    },
  },
};

export const DUNGEON_CONCEPT_ORDER: readonly DungeonConcept[] = [
  "military-fortress",
  "ancient-temple",
  "catacombs",
  "abandoned-mine",
  "arcane-laboratory",
  "natural-cavern",
  "prison",
  "lost-civilization",
];
