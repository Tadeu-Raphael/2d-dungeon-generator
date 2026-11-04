import { getRoomTypeDefinitions } from "./roomTypes";
import type { RoomTypeCategoryFrequencies, RoomTypeDefinition } from "./roomTypes";
import {
  DEFAULT_TREASURE_CATEGORY_WEIGHTS,
  DEFAULT_TREASURE_RARITY_WEIGHTS,
  getRoomTreasureChance,
  TREASURE_CATALOG,
  TREASURE_CATEGORY_ORDER,
  TREASURE_RARITY_ORDER,
} from "./treasures";
import type {
  DungeonTreasure,
  TreasureCategory,
  TreasureCategoryWeights,
  TreasureDefinition,
  TreasureRarity,
  TreasureRarityWeights,
  TreasureType,
} from "./treasures";

import type {
  Tile,
  Rect,
  RoomGenerationBounds,
} from "./core/types";
import {
  DEFAULT_DUNGEON_DIMENSIONS,
} from "./core/generation/roomOptions";
import type {
  RectangularRoomRatioFrequencies,
  RoomShape,
  RoomShapeFrequencies,
  RoomSizeFrequencies,
} from "./core/generation/roomOptions";
import {
  WALL_TILE,
  FLOOR_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  STAIRS_UP_TILE,
  STAIRS_DOWN_TILE,
  SECRET_DOOR_TILE,
  EXTERIOR_ENTRANCE_TILE,
  EXTERIOR_CONNECTION_TILE,
  PILLAR_TILE,
  WATER_TILE,
  LAVA_TILE,
  ELEVATED_FLOOR_TILE,
  ROOM_STAIRS_TILE,
  CAVE_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_BREACH_TILE,
  CAVE_WATER_TILE,
  CAVE_LAVA_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_SPRING_TILE,
  CAVE_LAVA_VENT_TILE,
} from "./core/tiles";
import { createRandom } from "./core/random";

export type {
  Tile,
  GenerationRandomStreamName,
  GenerationRandomStreams,
  Rect,
  NumericRange,
  RoomGenerationBounds,
  RoomDimensionChoice,
} from "./core/types";

export type {
  RectangularRoomRatioDefinition,
  RectangularRoomRatioFrequencies,
  RectangularRoomRatioKey,
  RoomShape,
  RoomShapeDefinition,
  RoomShapeFrequencies,
  RoomSizeCategoryDefinition,
  RoomSizeCategoryKey,
  RoomSizeFrequencies,
} from "./core/generation/roomOptions";

export {
  RECTANGULAR_ROOM_RATIO_DEFINITIONS,
  ROOM_SHAPE_DEFINITIONS,
  ROOM_SIZE_CATEGORIES,
} from "./core/generation/roomOptions";

export {
  DEFAULT_TREASURE_CATEGORY_WEIGHTS,
  DEFAULT_TREASURE_RARITY_WEIGHTS,
  getRoomTreasureChance,
  TREASURE_CATALOG,
  TREASURE_CATEGORY_ORDER,
  TREASURE_RARITY_ORDER,
} from "./treasures";

export type {
  DungeonTreasure,
  TreasureCategory,
  TreasureCategoryWeights,
  TreasureDefinition,
  TreasureRarity,
  TreasureRarityWeights,
  TreasureType,
} from "./treasures";

export type {
  RoomTypeCategory,
  RoomTypeCategoryFrequencies,
  RoomTypeDefinition,
} from "./roomTypes";

export {
  WALL_TILE,
  FLOOR_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  STAIRS_UP_TILE,
  STAIRS_DOWN_TILE,
  SECRET_DOOR_TILE,
  EXTERIOR_ENTRANCE_TILE,
  EXTERIOR_CONNECTION_TILE,
  PILLAR_TILE,
  WATER_TILE,
  LAVA_TILE,
  ELEVATED_FLOOR_TILE,
  ROOM_STAIRS_TILE,
  CAVE_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_BREACH_TILE,
  CAVE_WATER_TILE,
  CAVE_LAVA_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_SPRING_TILE,
  CAVE_LAVA_VENT_TILE,
};

export {
  createRandom,
  deriveRandomStreamSeed,
  createGenerationRandomStreams,
} from "./core/random";

import { bsGenerateBsp as generateBsp } from "./core/generation/bsp";
import { bsRoomCenter as roomCenter } from "./core/generation/bsp";
import { generateHybrid, placeCaveConnectionWalls } from "./core/generation/hybrid";
import { generateCellular } from "./core/generation/cellular";
import { generateDrunkard } from "./core/generation/drunkard";

export {
  bsGenerateBsp as generateBsp,
} from "./core/generation/bsp";

export {
  generateHybrid,
} from "./core/generation/hybrid";

export type Algorithm =
  | "bsp"
  | "cellular"
  | "drunkard"
  | "hybrid"
  | "bsp-cellular"
  | "bsp-drunkard";
export const DUNGEON_GENERATOR_VERSION_V1 = "v1" as const;
export const DUNGEON_GENERATOR_VERSION_V2 = "v2" as const;
export type DungeonGeneratorVersion =
  | typeof DUNGEON_GENERATOR_VERSION_V1
  | typeof DUNGEON_GENERATOR_VERSION_V2;

export type EntranceMode = "upper-stairs" | "exterior-entrance" | "exterior-connection";
export type LiquidFeature = "fountain" | "stream" | "well" | "pond";
export type LiquidType = "water" | "lava";
export type TrapCategory =
  | "mechanical"
  | "environmental"
  | "magical"
  | "capture"
  | "deception"
  | "motion"
  | "biological"
  | "combat"
  | "complex";
export const TRAP_CATEGORY_ORDER: readonly TrapCategory[] = [
  "mechanical",
  "environmental",
  "magical",
  "capture",
  "deception",
  "motion",
  "biological",
  "combat",
  "complex",
];
export type TrapCategoryWeights = Record<TrapCategory, number>;
export const DEFAULT_TRAP_CATEGORY_WEIGHTS: TrapCategoryWeights = {
  mechanical: 1,
  environmental: 1,
  magical: 1,
  capture: 1,
  deception: 1,
  motion: 1,
  biological: 1,
  combat: 1,
  complex: 1,
};
export const TRAP_CATEGORY_LABELS: Record<TrapCategory, string> = {
  mechanical: "MecÃ¢nicas",
  environmental: "Ambientais",
  magical: "MÃ¡gicas",
  capture: "Captura e contenÃ§Ã£o",
  deception: "PercepÃ§Ã£o e engano",
  motion: "Sonoras e de movimento",
  biological: "BiolÃ³gicas",
  combat: "Combate",
  complex: "Complexas e encadeadas",
};
export type TrapType =
  | "hiddenPit"
  | "spikedPit"
  | "falseFloor"
  | "wallBlades"
  | "pendulumBlade"
  | "spinningBlades"
  | "poisonDarts"
  | "wallArrows"
  | "hiddenHarpoons"
  | "ceilingPress"
  | "crushingWalls"
  | "guillotineDoor"
  | "retractableStairs"
  | "destructibleBridge"
  | "grindingGears"
  | "capturingChains"
  | "droppingCage"
  | "counterweightTrapdoor"
  | "floodedRoom"
  | "floodedCorridor"
  | "vacuumChamber"
  | "poisonGas"
  | "hallucinogenicGas"
  | "corrosiveCloud"
  | "slipperyFloor"
  | "thinIceFloor"
  | "fallingRocks"
  | "caveIn"
  | "quicksand"
  | "undergroundCurrent"
  | "overheatedChamber"
  | "freezingChamber"
  | "electrifiedFloor"
  | "ceilingSpikes"
  | "lavaFloor"
  | "explosiveCrystals"
  | "explosiveRune"
  | "protectiveGlyph"
  | "forcedTeleport"
  | "prisonTeleport"
  | "antimagicField"
  | "slowField"
  | "gravityField"
  | "weaknessCurse"
  | "agingCurse"
  | "energyDrain"
  | "petrification"
  | "forcedTransformation"
  | "dimensionalPrison"
  | "unstablePortal"
  | "dangerIllusion"
  | "duplicateIllusion"
  | "magicalSilence"
  | "inversionField"
  | "memoryDrain"
  | "cursedMark"
  | "suspendedNet"
  | "ankleNoose"
  | "hiddenManacles"
  | "constrictingRoots"
  | "compactingSand"
  | "trappingGelatin"
  | "silkCocoon"
  | "magicalCage"
  | "thornWall"
  | "spectralChains"
  | "sealedRoom"
  | "sealingSarcophagus"
  | "mimicChest"
  | "illusoryDoor"
  | "illusoryWall"
  | "endlessCorridor"
  | "loopRoom"
  | "illusoryFloor"
  | "cursedTreasure"
  | "hiddenAlarm"
  | "falseSound"
  | "watchingStatues"
  | "deceptiveMirror"
  | "falseSigns"
  | "falseSafeZone"
  | "poisonedKey"
  | "deceptiveSwitch"
  | "weightSensitiveFloor"
  | "pressurePlate"
  | "motionSensor"
  | "heatSensor"
  | "magicSensor"
  | "alarmBell"
  | "creakingFloor"
  | "acousticTrigger"
  | "resonantCrystals"
  | "awakenedGuardian"
  | "collapsingPassage"
  | "proximityDoor"
  | "carnivorousPlant"
  | "toxicSpores"
  | "explosiveFungus"
  | "constrictingVines"
  | "insectNest"
  | "invisibleWeb"
  | "parasiticLarvae"
  | "defensiveHive"
  | "predatorAttractant"
  | "explosiveEgg"
  | "unstableBurrow"
  | "controllingParasite"
  | "firingTowers"
  | "launcherStatues"
  | "movingPillars"
  | "movingPlatforms"
  | "dividingWalls"
  | "summoningZone"
  | "empowermentTotem"
  | "regenerationTotem"
  | "repulsionField"
  | "attractionField"
  | "fragmentedFloor"
  | "reinforcements"
  | "sealedArena"
  | "hostileLight"
  | "resourceDrain"
  | "timedBladeCorridor"
  | "pressureChamber"
  | "electrifiedFloodChamber"
  | "movingMaze"
  | "mirrorChamber"
  | "sequencePlates"
  | "lightBridge"
  | "mechanicalClock"
  | "sacrificeChamber"
  | "deadlyBalance"
  | "twoRoomTrap"
  | "runeSequence"
  | "advancingSpikes"
  | "dismantlingRoom"
  | "defensiveVault"
  | "adaptiveTrap";

const CAVE_LIQUID_TILES = new Set<Tile>([
  CAVE_WATER_TILE,
  CAVE_LAVA_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_SPRING_TILE,
  CAVE_LAVA_VENT_TILE,
]);

function isCaveLiquidTile(tile: Tile): boolean {
  return CAVE_LIQUID_TILES.has(tile);
}
export const TRAP_TYPES: TrapType[] = [
  "hiddenPit",
  "spikedPit",
  "falseFloor",
  "wallBlades",
  "pendulumBlade",
  "spinningBlades",
  "poisonDarts",
  "wallArrows",
  "hiddenHarpoons",
  "ceilingPress",
  "crushingWalls",
  "guillotineDoor",
  "retractableStairs",
  "destructibleBridge",
  "grindingGears",
  "capturingChains",
  "droppingCage",
  "counterweightTrapdoor",
  "floodedRoom",
  "floodedCorridor",
  "vacuumChamber",
  "poisonGas",
  "hallucinogenicGas",
  "corrosiveCloud",
  "slipperyFloor",
  "thinIceFloor",
  "fallingRocks",
  "caveIn",
  "quicksand",
  "undergroundCurrent",
  "overheatedChamber",
  "freezingChamber",
  "electrifiedFloor",
  "ceilingSpikes",
  "lavaFloor",
  "explosiveCrystals",
  "explosiveRune",
  "protectiveGlyph",
  "forcedTeleport",
  "prisonTeleport",
  "antimagicField",
  "slowField",
  "gravityField",
  "weaknessCurse",
  "agingCurse",
  "energyDrain",
  "petrification",
  "forcedTransformation",
  "dimensionalPrison",
  "unstablePortal",
  "dangerIllusion",
  "duplicateIllusion",
  "magicalSilence",
  "inversionField",
  "memoryDrain",
  "cursedMark",
  "suspendedNet",
  "ankleNoose",
  "hiddenManacles",
  "constrictingRoots",
  "compactingSand",
  "trappingGelatin",
  "silkCocoon",
  "magicalCage",
  "thornWall",
  "spectralChains",
  "sealedRoom",
  "sealingSarcophagus",
  "mimicChest",
  "illusoryDoor",
  "illusoryWall",
  "endlessCorridor",
  "loopRoom",
  "illusoryFloor",
  "cursedTreasure",
  "hiddenAlarm",
  "falseSound",
  "watchingStatues",
  "deceptiveMirror",
  "falseSigns",
  "falseSafeZone",
  "poisonedKey",
  "deceptiveSwitch",
  "weightSensitiveFloor",
  "pressurePlate",
  "motionSensor",
  "heatSensor",
  "magicSensor",
  "alarmBell",
  "creakingFloor",
  "acousticTrigger",
  "resonantCrystals",
  "awakenedGuardian",
  "collapsingPassage",
  "proximityDoor",
  "carnivorousPlant",
  "toxicSpores",
  "explosiveFungus",
  "constrictingVines",
  "insectNest",
  "invisibleWeb",
  "parasiticLarvae",
  "defensiveHive",
  "predatorAttractant",
  "explosiveEgg",
  "unstableBurrow",
  "controllingParasite",
  "firingTowers",
  "launcherStatues",
  "movingPillars",
  "movingPlatforms",
  "dividingWalls",
  "summoningZone",
  "empowermentTotem",
  "regenerationTotem",
  "repulsionField",
  "attractionField",
  "fragmentedFloor",
  "reinforcements",
  "sealedArena",
  "hostileLight",
  "resourceDrain",
  "timedBladeCorridor",
  "pressureChamber",
  "electrifiedFloodChamber",
  "movingMaze",
  "mirrorChamber",
  "sequencePlates",
  "lightBridge",
  "mechanicalClock",
  "sacrificeChamber",
  "deadlyBalance",
  "twoRoomTrap",
  "runeSequence",
  "advancingSpikes",
  "dismantlingRoom",
  "defensiveVault",
  "adaptiveTrap",
];
type TrapPlacement = "room" | "corridor";
export const TRAP_DEFINITIONS: Record<TrapType, {
  tile: Tile;
  label: string;
  description: string;
  category: TrapCategory;
  placement?: TrapPlacement;
}> = {
  hiddenPit: { tile: 12, label: "Fosso oculto", description: "Uma seÃ§Ã£o do chÃ£o se abre, fazendo a vÃ­tima cair.", category: "mechanical" },
  spikedPit: { tile: 13, label: "Fosso com estacas", description: "Uma queda em um buraco repleto de estacas.", category: "mechanical" },
  falseFloor: { tile: 14, label: "Piso falso", description: "O chÃ£o cede sob o peso de quem passa.", category: "mechanical" },
  wallBlades: { tile: 15, label: "LÃ¢minas nas paredes", description: "LÃ¢minas saem de aberturas laterais.", category: "mechanical" },
  pendulumBlade: { tile: 16, label: "PÃªndulo cortante", description: "Uma lÃ¢mina balanÃ§a pelo corredor.", category: "mechanical" },
  spinningBlades: { tile: 17, label: "LÃ¢minas giratÃ³rias", description: "Discos afiados emergem do chÃ£o ou das paredes.", category: "mechanical" },
  poisonDarts: { tile: 18, label: "Dardos envenenados", description: "Dardos sÃ£o disparados de pequenas aberturas.", category: "mechanical" },
  wallArrows: { tile: 19, label: "Flechas nas paredes", description: "Um mecanismo dispara flechas ao detectar alguÃ©m.", category: "mechanical" },
  hiddenHarpoons: { tile: 20, label: "ArpÃµes ocultos", description: "Ganchos sÃ£o lanÃ§ados contra intrusos.", category: "mechanical" },
  ceilingPress: { tile: 21, label: "Prensa de teto", description: "O teto desce, esmagando quem estiver embaixo.", category: "mechanical" },
  crushingWalls: { tile: 22, label: "Paredes esmagadoras", description: "Duas paredes se aproximam atÃ© comprimirem o espaÃ§o.", category: "mechanical" },
  guillotineDoor: { tile: 23, label: "Porta guilhotina", description: "Uma lÃ¢mina cai quando alguÃ©m atravessa uma passagem.", category: "mechanical" },
  retractableStairs: { tile: 24, label: "Escada retrÃ¡til", description: "Degraus desaparecem ou se soltam sob os pÃ©s.", category: "mechanical" },
  destructibleBridge: { tile: 25, label: "Ponte destrutÃ­vel", description: "A estrutura desaba quando alguÃ©m a atravessa.", category: "mechanical" },
  grindingGears: { tile: 26, label: "Engrenagens trituradoras", description: "Um piso cede e arrasta a vÃ­tima para um mecanismo.", category: "mechanical" },
  capturingChains: { tile: 27, label: "Correntes capturadoras", description: "Correntes prendem braÃ§os, pernas ou o corpo inteiro.", category: "capture" },
  droppingCage: { tile: 28, label: "Gaiola suspensa", description: "Uma estrutura cai sobre o alvo, aprisionando-o.", category: "capture" },
  counterweightTrapdoor: { tile: 29, label: "AlÃ§apÃ£o com contrapeso", description: "A vÃ­tima Ã© deslocada para outra parte da dungeon.", category: "mechanical" },
  floodedRoom: { tile: 30, label: "Sala inundÃ¡vel", description: "Ãgua comeÃ§a a preencher uma sala fechada.", category: "environmental", placement: "room" },
  floodedCorridor: { tile: 31, label: "Corredor inundado", description: "O nÃ­vel da Ã¡gua sobe enquanto os personagens avanÃ§am.", category: "environmental", placement: "corridor" },
  vacuumChamber: { tile: 32, label: "CÃ¢mara de vÃ¡cuo", description: "Uma sala mÃ¡gica ou artificial remove o ar respirÃ¡vel.", category: "magical", placement: "room" },
  poisonGas: { tile: 33, label: "GÃ¡s venenoso", description: "Uma substÃ¢ncia tÃ³xica Ã© liberada no ambiente.", category: "environmental" },
  hallucinogenicGas: { tile: 34, label: "GÃ¡s alucinÃ³geno", description: "Os personagens passam a perceber ilusÃµes.", category: "magical" },
  corrosiveCloud: { tile: 35, label: "Nuvem corrosiva", description: "Uma nÃ©voa danifica criaturas e equipamentos.", category: "environmental" },
  slipperyFloor: { tile: 36, label: "ChÃ£o escorregadio", description: "Ã“leo, gelo ou limo dificulta a movimentaÃ§Ã£o.", category: "environmental" },
  thinIceFloor: { tile: 37, label: "Piso de gelo fino", description: "O chÃ£o quebra sob determinado peso.", category: "environmental" },
  fallingRocks: { tile: 38, label: "Chuva de pedras", description: "Rochas caem do teto apÃ³s o acionamento.", category: "environmental" },
  caveIn: { tile: 39, label: "Desmoronamento", description: "Uma seÃ§Ã£o do teto ou da parede desaba.", category: "environmental" },
  quicksand: { tile: 40, label: "Areia movediÃ§a", description: "O terreno cede e comeÃ§a a engolir quem pisa nele.", category: "environmental" },
  undergroundCurrent: { tile: 41, label: "Correnteza subterrÃ¢nea", description: "A Ã¡gua arrasta personagens para uma passagem perigosa.", category: "environmental", placement: "corridor" },
  overheatedChamber: { tile: 42, label: "CÃ¢mara superaquecida", description: "A temperatura sobe atÃ© tornar a permanÃªncia perigosa.", category: "environmental", placement: "room" },
  freezingChamber: { tile: 43, label: "CÃ¢mara congelante", description: "O ambiente provoca frio extremo.", category: "environmental", placement: "room" },
  electrifiedFloor: { tile: 44, label: "Piso eletrificado", description: "Uma superfÃ­cie metÃ¡lica transmite descargas mÃ¡gicas ou elÃ©tricas.", category: "environmental" },
  ceilingSpikes: { tile: 45, label: "Espinhos no teto", description: "Uma queda ou mudanÃ§a de pressÃ£o faz espinhos despencarem.", category: "mechanical" },
  lavaFloor: { tile: 46, label: "ChÃ£o de lava", description: "Uma ponte ou plataforma se move sobre lava.", category: "environmental", placement: "corridor" },
  explosiveCrystals: { tile: 47, label: "Cristais explosivos", description: "Cristais reagem Ã  presenÃ§a, ao som ou ao contato.", category: "environmental" },
  explosiveRune: { tile: 59, label: "Runa explosiva", description: "Uma inscriÃ§Ã£o libera uma explosÃ£o ao ser ativada.", category: "magical" },
  protectiveGlyph: { tile: 60, label: "Glifo de proteÃ§Ã£o", description: "Uma marca mÃ¡gica ataca intrusos que se aproximam.", category: "magical" },
  forcedTeleport: { tile: 61, label: "Teletransporte forÃ§ado", description: "A vÃ­tima Ã© transportada magicamente para outro local.", category: "magical" },
  prisonTeleport: { tile: 62, label: "Teletransporte para uma prisÃ£o", description: "O alvo Ã© enviado para uma cela distante.", category: "magical", placement: "room" },
  antimagicField: { tile: 63, label: "Campo antimagia", description: "A magia deixa de funcionar dentro de uma Ã¡rea.", category: "magical", placement: "room" },
  slowField: { tile: 64, label: "Campo de lentidÃ£o", description: "Os movimentos ficam extremamente lentos.", category: "magical", placement: "room" },
  gravityField: { tile: 65, label: "Campo gravitacional", description: "A gravidade aumenta, diminui ou muda de direÃ§Ã£o.", category: "magical", placement: "room" },
  weaknessCurse: { tile: 66, label: "MaldiÃ§Ã£o de fraqueza", description: "A vÃ­tima sofre uma penalidade temporÃ¡ria.", category: "magical" },
  agingCurse: { tile: 67, label: "MaldiÃ§Ã£o de envelhecimento", description: "O alvo envelhece magicamente.", category: "magical" },
  energyDrain: { tile: 68, label: "Roubo de energia", description: "A armadilha drena energia vital ou mÃ¡gica.", category: "magical" },
  petrification: { tile: 69, label: "PetrificaÃ§Ã£o", description: "A vÃ­tima comeÃ§a a se transformar em pedra.", category: "magical" },
  forcedTransformation: { tile: 70, label: "TransformaÃ§Ã£o forÃ§ada", description: "O personagem assume outra forma contra a vontade.", category: "magical" },
  dimensionalPrison: { tile: 71, label: "Aprisionamento dimensional", description: "A vÃ­tima fica presa em uma dimensÃ£o isolada.", category: "magical", placement: "room" },
  unstablePortal: { tile: 72, label: "Portal instÃ¡vel", description: "Uma passagem transporta o personagem para um destino imprevisÃ­vel.", category: "magical", placement: "room" },
  dangerIllusion: { tile: 73, label: "IlusÃ£o de perigo", description: "Uma ameaÃ§a ilusÃ³ria parece real para quem a vÃª.", category: "magical" },
  duplicateIllusion: { tile: 74, label: "DuplicaÃ§Ã£o ilusÃ³ria", description: "CÃ³pias ilusÃ³rias de inimigos ou aliados confundem a vÃ­tima.", category: "magical" },
  magicalSilence: { tile: 75, label: "SilÃªncio mÃ¡gico", description: "Sons deixam de existir dentro de determinada Ã¡rea.", category: "magical", placement: "room" },
  inversionField: { tile: 76, label: "Campo de inversÃ£o", description: "Controles, direÃ§Ãµes ou percepÃ§Ãµes sÃ£o invertidos magicamente.", category: "magical", placement: "room" },
  memoryDrain: { tile: 77, label: "Drenagem de memÃ³ria", description: "A vÃ­tima perde lembranÃ§as temporariamente.", category: "magical" },
  cursedMark: { tile: 78, label: "Marca amaldiÃ§oada", description: "A vÃ­tima Ã© marcada e passa a ser perseguida por uma entidade.", category: "magical" },
  suspendedNet: { tile: 79, label: "Rede suspensa", description: "Uma rede cai sobre os personagens e os captura.", category: "capture" },
  ankleNoose: { tile: 80, label: "LaÃ§o no tornozelo", description: "Um mecanismo prende e suspende a vÃ­tima pelo tornozelo.", category: "capture", placement: "corridor" },
  hiddenManacles: { tile: 81, label: "Algemas ocultas", description: "Dispositivos prendem os membros ao chÃ£o ou Ã  parede.", category: "capture", placement: "room" },
  constrictingRoots: { tile: 82, label: "RaÃ­zes constritoras", description: "Plantas ou raÃ­zes agarram e imobilizam os invasores.", category: "capture" },
  compactingSand: { tile: 83, label: "Areia compactante", description: "Uma camada de material endurece e prende quem pisa nela.", category: "capture" },
  trappingGelatin: { tile: 84, label: "Gelatina aprisionadora", description: "Uma substÃ¢ncia envolve e imobiliza a vÃ­tima.", category: "capture" },
  silkCocoon: { tile: 85, label: "Casulo de seda", description: "Uma criatura ou mecanismo envolve o alvo em um casulo.", category: "capture" },
  magicalCage: { tile: 86, label: "Jaula mÃ¡gica", description: "Uma barreira invisÃ­vel impede a saÃ­da da Ã¡rea.", category: "capture", placement: "room" },
  thornWall: { tile: 87, label: "Parede de espinhos", description: "Espinhos surgem ao redor e limitam a movimentaÃ§Ã£o.", category: "capture" },
  spectralChains: { tile: 88, label: "Correntes espectrais", description: "Correntes sobrenaturais prendem o espÃ­rito ou o corpo.", category: "capture" },
  sealedRoom: { tile: 89, label: "Sala sem saÃ­da", description: "Portas e passagens se fecham atÃ© que um mecanismo seja resolvido.", category: "capture", placement: "room" },
  sealingSarcophagus: { tile: 90, label: "SarcÃ³fago selante", description: "Um caixÃ£o ou compartimento se fecha sobre quem o abre.", category: "capture", placement: "room" },
  mimicChest: { tile: 91, label: "BaÃº mimÃ©tico", description: "O suposto baÃº Ã©, na verdade, uma criatura.", category: "deception", placement: "room" },
  illusoryDoor: { tile: 92, label: "Porta ilusÃ³ria", description: "Uma passagem aparentemente real nÃ£o existe.", category: "deception", placement: "corridor" },
  illusoryWall: { tile: 93, label: "Parede ilusÃ³ria", description: "Uma parede esconde uma passagem ou cria um caminho falso.", category: "deception", placement: "corridor" },
  endlessCorridor: { tile: 94, label: "Corredor infinito", description: "A vÃ­tima acredita avanÃ§ar, mas permanece na mesma Ã¡rea.", category: "deception", placement: "corridor" },
  loopRoom: { tile: 95, label: "Sala em loop", description: "Uma porta leva repetidamente ao mesmo ambiente.", category: "deception", placement: "room" },
  illusoryFloor: { tile: 96, label: "Piso ilusÃ³rio", description: "Uma superfÃ­cie aparentemente sÃ³lida esconde um abismo.", category: "deception" },
  cursedTreasure: { tile: 97, label: "Tesouro amaldiÃ§oado", description: "Um objeto valioso desencadeia uma maldiÃ§Ã£o quando removido.", category: "deception", placement: "room" },
  hiddenAlarm: { tile: 98, label: "Alarme oculto", description: "O mecanismo alerta os habitantes sem causar dano direto.", category: "deception" },
  falseSound: { tile: 99, label: "Som falso", description: "RuÃ­dos simulam monstros, passos ou pedidos de socorro.", category: "deception" },
  watchingStatues: { tile: 100, label: "EstÃ¡tuas observadoras", description: "EstÃ¡tuas acompanham os movimentos e acionam mecanismos.", category: "deception", placement: "room" },
  deceptiveMirror: { tile: 101, label: "Espelho enganoso", description: "O reflexo mostra uma realidade diferente.", category: "deception", placement: "room" },
  falseSigns: { tile: 102, label: "Placas falsas", description: "SÃ­mbolos ou inscriÃ§Ãµes fornecem instruÃ§Ãµes enganosas.", category: "deception" },
  falseSafeZone: { tile: 103, label: "Falsa zona segura", description: "Uma Ã¡rea aparentemente protegida ativa um mecanismo quando o grupo relaxa.", category: "deception", placement: "room" },
  poisonedKey: { tile: 104, label: "Chave envenenada", description: "Uma chave aparentemente normal libera uma substÃ¢ncia nociva ao ser usada.", category: "deception", placement: "room" },
  deceptiveSwitch: { tile: 105, label: "Interruptor enganoso", description: "Um botÃ£o desativa uma armadilha, mas ativa outra.", category: "deception", placement: "room" },
  weightSensitiveFloor: { tile: 106, label: "Piso sensÃ­vel ao peso", description: "O piso Ã© ativado quando recebe determinado peso.", category: "motion" },
  pressurePlate: { tile: 107, label: "Placa sensÃ­vel Ã  pressÃ£o", description: "A pressÃ£o exercida sobre a superfÃ­cie dispara um mecanismo.", category: "motion" },
  motionSensor: { tile: 108, label: "Sensor de movimento", description: "O mecanismo detecta criaturas que se movimentam na Ã¡rea.", category: "motion" },
  heatSensor: { tile: 109, label: "Sensor de calor", description: "O mecanismo reage Ã  presenÃ§a de corpos quentes.", category: "motion" },
  magicSensor: { tile: 110, label: "Sensor mÃ¡gico", description: "O mecanismo detecta o uso ou a presenÃ§a de magia.", category: "motion" },
  alarmBell: { tile: 111, label: "Sino de alarme", description: "Um sino emite um som que alerta os habitantes.", category: "motion" },
  creakingFloor: { tile: 112, label: "Piso que range", description: "O ruÃ­do do piso denuncia a posiÃ§Ã£o de quem passa.", category: "motion" },
  acousticTrigger: { tile: 113, label: "Armadilha acÃºstica", description: "Um som especÃ­fico desencadeia outro mecanismo.", category: "motion" },
  resonantCrystals: { tile: 114, label: "Cristais ressonantes", description: "Cristais vibram ou explodem quando expostos a certas frequÃªncias.", category: "motion" },
  awakenedGuardian: { tile: 115, label: "GuardiÃ£o despertado", description: "RuÃ­do excessivo ativa construtos ou criaturas adormecidas.", category: "motion", placement: "room" },
  collapsingPassage: { tile: 116, label: "Passagem que desaba", description: "VibraÃ§Ãµes intensas fazem o teto desmoronar.", category: "motion", placement: "corridor" },
  proximityDoor: { tile: 117, label: "Porta sensÃ­vel Ã  proximidade", description: "A aproximaÃ§Ã£o de alguÃ©m dispara um mecanismo.", category: "motion", placement: "corridor" },
  carnivorousPlant: { tile: 118, label: "Planta carnÃ­vora", description: "Uma planta captura quem se aproxima.", category: "biological" },
  toxicSpores: { tile: 119, label: "Esporos tÃ³xicos", description: "Uma nuvem de esporos causa efeitos nocivos.", category: "biological" },
  explosiveFungus: { tile: 120, label: "Fungo explosivo", description: "O fungo libera uma explosÃ£o quando perturbado.", category: "biological" },
  constrictingVines: { tile: 121, label: "CipÃ³s constritores", description: "CipÃ³s agarram e imobilizam personagens.", category: "biological" },
  insectNest: { tile: 122, label: "Ninho de insetos", description: "Uma Ã¡rea perturbada libera insetos agressivos.", category: "biological" },
  invisibleWeb: { tile: 123, label: "Teia invisÃ­vel", description: "Uma teia prende e denuncia a localizaÃ§Ã£o de intrusos.", category: "biological" },
  parasiticLarvae: { tile: 124, label: "Larvas parasitas", description: "Organismos aderem ao corpo e provocam efeitos progressivos.", category: "biological" },
  defensiveHive: { tile: 125, label: "Colmeia defensiva", description: "Uma colÃ´nia ataca quem atravessa seu territÃ³rio.", category: "biological" },
  predatorAttractant: { tile: 126, label: "Sangue atraente", description: "Uma substÃ¢ncia desperta ou atrai predadores.", category: "biological" },
  explosiveEgg: { tile: 127, label: "Ovo explosivo", description: "Um organismo reage violentamente ao toque.", category: "biological" },
  unstableBurrow: { tile: 128, label: "Toca instÃ¡vel", description: "O terreno cede e libera criaturas subterrÃ¢neas.", category: "biological" },
  controllingParasite: { tile: 129, label: "Parasita controlador", description: "Uma criatura tenta assumir o controle de seu hospedeiro.", category: "biological" },
  firingTowers: { tile: 130, label: "Torres de disparo", description: "Estruturas atacam automaticamente quem entra na Ã¡rea.", category: "combat", placement: "room" },
  launcherStatues: { tile: 131, label: "EstÃ¡tuas lanÃ§adoras", description: "EstÃ¡tuas disparam projÃ©teis em intervalos regulares.", category: "combat", placement: "room" },
  movingPillars: { tile: 132, label: "Pilares mÃ³veis", description: "Pilares alteram o caminho e podem dividir o grupo.", category: "combat", placement: "room" },
  movingPlatforms: { tile: 133, label: "Plataformas mÃ³veis", description: "O chÃ£o se desloca e dificulta o combate.", category: "combat", placement: "room" },
  dividingWalls: { tile: 134, label: "Paredes divisÃ³rias", description: "Barreiras se erguem e separam os personagens.", category: "combat", placement: "room" },
  summoningZone: { tile: 135, label: "Zona de invocaÃ§Ã£o", description: "Um cÃ­rculo invoca criaturas hostis.", category: "combat", placement: "room" },
  empowermentTotem: { tile: 136, label: "Totem de fortalecimento", description: "Inimigos prÃ³ximos recebem bÃ´nus enquanto o totem existir.", category: "combat", placement: "room" },
  regenerationTotem: { tile: 137, label: "Totem de regeneraÃ§Ã£o", description: "Criaturas recuperam vida dentro da Ã¡rea do totem.", category: "combat", placement: "room" },
  repulsionField: { tile: 138, label: "Campo de repulsÃ£o", description: "Personagens sÃ£o empurrados para longe de um ponto.", category: "combat", placement: "room" },
  attractionField: { tile: 139, label: "Campo de atraÃ§Ã£o", description: "Criaturas sÃ£o puxadas para uma regiÃ£o perigosa.", category: "combat", placement: "room" },
  fragmentedFloor: { tile: 140, label: "ChÃ£o fragmentado", description: "A Ã¡rea se divide progressivamente durante o combate.", category: "combat" },
  reinforcements: { tile: 141, label: "Armadilha de reforÃ§os", description: "O acionamento abre passagens para inimigos adicionais.", category: "combat" },
  sealedArena: { tile: 142, label: "Arena selada", description: "As saÃ­das se fecham quando o combate comeÃ§a.", category: "combat", placement: "room" },
  hostileLight: { tile: 143, label: "IluminaÃ§Ã£o hostil", description: "A luz prejudica determinados tipos de criaturas ou personagens.", category: "combat", placement: "room" },
  resourceDrain: { tile: 144, label: "Armadilha de recursos", description: "O mecanismo consome mana, muniÃ§Ã£o ou outro recurso do grupo.", category: "combat" },
  timedBladeCorridor: { tile: 145, label: "Corredor de lÃ¢minas temporizadas", description: "LÃ¢minas avanÃ§am e recuam em intervalos regulares.", category: "complex", placement: "corridor" },
  pressureChamber: { tile: 146, label: "Sala de pressÃ£o crescente", description: "A pressÃ£o aumenta atÃ© que um mecanismo seja desativado.", category: "complex", placement: "room" },
  electrifiedFloodChamber: { tile: 147, label: "CÃ¢mara de Ã¡gua e eletricidade", description: "A sala se inunda enquanto descargas elÃ©tricas sÃ£o ativadas.", category: "complex", placement: "room" },
  movingMaze: { tile: 148, label: "Labirinto mÃ³vel", description: "Paredes mudam de posiÃ§Ã£o periodicamente.", category: "complex", placement: "room" },
  mirrorChamber: { tile: 149, label: "Sala de espelhos", description: "Reflexos direcionam raios mÃ¡gicos para diferentes pontos.", category: "complex", placement: "room" },
  sequencePlates: { tile: 150, label: "SequÃªncia de placas", description: "O grupo precisa pisar nas placas na ordem correta.", category: "complex", placement: "room" },
  lightBridge: { tile: 151, label: "Ponte de luz", description: "Plataformas aparecem apenas quando iluminadas corretamente.", category: "complex", placement: "room" },
  mechanicalClock: { tile: 152, label: "RelÃ³gio mecÃ¢nico", description: "Engrenagens, plataformas e portas se movem segundo um ciclo.", category: "complex", placement: "room" },
  sacrificeChamber: { tile: 153, label: "CÃ¢mara de sacrifÃ­cio", description: "Um mecanismo exige um custo para liberar a saÃ­da.", category: "complex", placement: "room" },
  deadlyBalance: { tile: 154, label: "BalanÃ§a mortal", description: "A distribuiÃ§Ã£o de peso determina o destino do grupo.", category: "complex", placement: "room" },
  twoRoomTrap: { tile: 155, label: "Armadilha de duas salas", description: "Um mecanismo precisa ser operado enquanto alguÃ©m atravessa outra sala.", category: "complex", placement: "room" },
  runeSequence: { tile: 156, label: "SequÃªncia de runas", description: "SÃ­mbolos precisam ser ativados em uma ordem determinada.", category: "complex", placement: "room" },
  advancingSpikes: { tile: 157, label: "CÃ¢mara de espinhos progressivos", description: "Espinhos avanÃ§am gradualmente e criam um limite de tempo.", category: "complex", placement: "room" },
  dismantlingRoom: { tile: 158, label: "Sala que se desmonta", description: "O ambiente perde partes de sua estrutura a cada rodada.", category: "complex", placement: "room" },
  defensiveVault: { tile: 159, label: "Cofre defensivo", description: "Abrir o tesouro desencadeia vÃ¡rias etapas de proteÃ§Ã£o.", category: "complex", placement: "room" },
  adaptiveTrap: { tile: 160, label: "Armadilha adaptativa", description: "O mecanismo modifica seu comportamento apÃ³s cada tentativa.", category: "complex" },
};
export const MIN_DUNGEON_DIMENSION = 20;
export const MAX_DUNGEON_WIDTH = 1_000;
export const MAX_DUNGEON_HEIGHT = 1_000;
export const MAX_DUNGEON_TILE_COUNT = 250_000;
export const MAX_DUNGEON_ROOM_COUNT = 24;
export const MAX_DUNGEON_SEED = 4_294_967_295;

export function getDungeonDimensionError(width: number, height: number): string | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return "Dungeon width and height must be safe integer tile counts.";
  }
  if (width < MIN_DUNGEON_DIMENSION || height < MIN_DUNGEON_DIMENSION) {
    return `Dungeon width and height must be at least ${MIN_DUNGEON_DIMENSION} tiles.`;
  }
  if (width > MAX_DUNGEON_WIDTH) {
    return `Dungeon width must not exceed ${MAX_DUNGEON_WIDTH} tiles.`;
  }
  if (height > MAX_DUNGEON_HEIGHT) {
    return `Dungeon height must not exceed ${MAX_DUNGEON_HEIGHT} tiles.`;
  }
  if (width * height > MAX_DUNGEON_TILE_COUNT) {
    return `Dungeon area must not exceed ${MAX_DUNGEON_TILE_COUNT} tiles.`;
  }
  return undefined;
}

export function isSupportedDungeonDimensions(width: number, height: number): boolean {
  return getDungeonDimensionError(width, height) === undefined;
}

export function assertSupportedDungeonDimensions(width: number, height: number): void {
  const error = getDungeonDimensionError(width, height);
  if (error) throw new RangeError(error);
}

export interface Dungeon {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: number;
  roomDetails: DungeonRoom[];
  traps: DungeonTrap[];
  treasureCategoryWeights: TreasureCategoryWeights;
  treasureRarityWeights: TreasureRarityWeights;
  treasureChancePercent: number;
  treasureConsumablesEnabled: boolean;
  floorCount: number;
  seed: number;
  algorithm: Algorithm;
  corridorWidth: number;
  doubleDoorsEnabled: boolean;
  trapCategoryWeights: TrapCategoryWeights;
  roomTrapChancePercent: number;
  corridorTrapChancePercent: number;
}

export interface DungeonTrap {
  type: TrapType;
  x: number;
  y: number;
}

export interface RoomPosition {
  x: number;
  y: number;
}

export interface DungeonParameters {
  width: number;
  height: number;
  roomCount: number;
  corridorWidth: number;
  corridorCompactness: number;
  doubleDoorsEnabled: boolean;
  entranceMode: EntranceMode;
  cellularFillPercent: number;
  cellularIterations: number;
  drunkardCoveragePercent: number;
  roomSizeDistributionEnabled: boolean;
  roomSizeFrequencies: RoomSizeFrequencies;
  roomShapeFrequencies: RoomShapeFrequencies;
  rectangularRoomRatioFrequencies: RectangularRoomRatioFrequencies;
  roomTypeDistributionEnabled: boolean;
  roomTypeCategoryFrequencies: RoomTypeCategoryFrequencies;
  trapCategoryDistributionEnabled: boolean;
  trapCategoryWeights: TrapCategoryWeights;
  roomTrapChancePercent: number;
  corridorTrapChancePercent: number;
  treasureCategoryDistributionEnabled: boolean;
  treasureCategoryWeights: TreasureCategoryWeights;
  treasureRarityDistributionEnabled: boolean;
  treasureRarityWeights: TreasureRarityWeights;
  treasureChancePercent: number;
  treasureConsumablesEnabled: boolean;
}

export interface DungeonGenerationRequest {
  generatorVersion: typeof DUNGEON_GENERATOR_VERSION_V1;
  algorithm: Algorithm;
  seed: number;
  profile?: string;
  parameters?: DungeonParameters;
  settings?: Readonly<Record<string, string | number | boolean>>;
}

export interface DungeonGenerationMetadata {
  generatorVersion: DungeonGeneratorVersion;
  seed: number;
  profile: string;
  algorithm: Algorithm;
  parameters: DungeonParameters;
  settings: Readonly<Record<string, string | number | boolean>>;
  generatedAt: string;
}

export interface VersionedDungeonGeneration {
  dungeon: Dungeon;
  metadata: DungeonGenerationMetadata;
}

export interface DungeonRoom extends Rect {
  number: number;
  centerX: number;
  centerY: number;
  shape: RoomShape;
  generationBounds: RoomGenerationBounds;
  roomType: RoomTypeDefinition;
  liquidFeature?: LiquidFeature;
  liquidType?: LiquidType;
  traps: TrapType[];
  treasures: DungeonTreasure[];
}

export interface GeneratedRoom extends Rect {
  shape: RoomShape;
  generationBounds: RoomGenerationBounds;
  liquidFeature?: LiquidFeature;
  liquidType?: LiquidType;
  traps?: TrapType[];
  treasures?: DungeonTreasure[];
}

export const DEFAULT_DUNGEON_PARAMETERS: DungeonParameters = {
  width: DEFAULT_DUNGEON_DIMENSIONS.width,
  height: DEFAULT_DUNGEON_DIMENSIONS.height,
  roomCount: DEFAULT_DUNGEON_DIMENSIONS.roomCount,
  corridorWidth: 1,
  corridorCompactness: 95,
  doubleDoorsEnabled: false,
  entranceMode: "upper-stairs",
  cellularFillPercent: 52,
  cellularIterations: 5,
  drunkardCoveragePercent: 34,
  roomSizeDistributionEnabled: false,
  roomTypeDistributionEnabled: false,
  trapCategoryDistributionEnabled: false,
  treasureCategoryDistributionEnabled: false,
  treasureRarityDistributionEnabled: false,
  treasureChancePercent: 25,
  treasureConsumablesEnabled: true,
  roomTypeCategoryFrequencies: {
    exploration: 10,
    combat: 9,
    habitation: 9,
    logistics: 9,
    religious: 9,
    arcane: 9,
    funerary: 9,
    natural: 9,
    puzzle: 9,
    treasure: 9,
    special: 9,
  },
  trapCategoryWeights: DEFAULT_TRAP_CATEGORY_WEIGHTS,
  roomTrapChancePercent: 25,
  corridorTrapChancePercent: 5,
  treasureCategoryWeights: DEFAULT_TREASURE_CATEGORY_WEIGHTS,
  treasureRarityWeights: DEFAULT_TREASURE_RARITY_WEIGHTS,
  roomSizeFrequencies: {
    micro: 10,
    verySmall: 20,
    small: 25,
    medium: 20,
    large: 12,
    veryLarge: 8,
    colossal: 5,
  },
  roomShapeFrequencies: {
    rectangular: 24,
    square: 8,
    round: 8,
    elliptical: 7,
    octagonal: 6,
    lShaped: 7,
    tShaped: 6,
    crossShaped: 6,
    ringShaped: 5,
    irregular: 8,
    columns: 6,
    alcoves: 6,
    multiLevel: 3,
  },
  rectangularRoomRatioFrequencies: {
    square: 25,
    slightlyElongated: 35,
    elongated: 25,
    veryElongated: 10,
    gallery: 5,
  },
};
const WALL: Tile = WALL_TILE;
const FLOOR: Tile = FLOOR_TILE;
const CORRIDOR = CORRIDOR_TILE;
export interface NumberedCorridorTrap extends DungeonTrap {
  number: number;
}

export function getNumberedCorridorTraps(dungeon: Dungeon): NumberedCorridorTrap[] {
  return dungeon.traps
    .filter((trap) => dungeon.tiles[trap.y]?.[trap.x] === CORRIDOR_TILE)
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((trap, index) => ({ ...trap, number: index + 1 }));
}

const DOOR = DOOR_TILE;
const STAIRS_UP = STAIRS_UP_TILE;
const STAIRS_DOWN = STAIRS_DOWN_TILE;

type Point = [number, number];

const DOORWAY_ROOM_SURFACE_TILES = new Set<Tile>([
  FLOOR_TILE,
  STAIRS_UP_TILE,
  STAIRS_DOWN_TILE,
  ELEVATED_FLOOR_TILE,
  ROOM_STAIRS_TILE,
  WATER_TILE,
  LAVA_TILE,
  ...TRAP_TYPES
    .filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor")
    .map((type) => TRAP_DEFINITIONS[type].tile),
]);

function findDoorwayCandidates(tiles: Tile[][], room: Rect, doorwayWidth: number): Point[][] {
  const candidates = new Map<string, Point[]>();
  const minY = Math.max(1, room.y - 1);
  const maxY = Math.min(tiles.length - 1, room.y + room.height + 1);
  const minX = Math.max(1, room.x - 1);
  const maxX = Math.min(tiles[0].length - 1, room.x + room.width + 1);

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (tiles[y][x] !== CORRIDOR) continue;
      for (const [towardX, towardY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const crossX = towardX === 0 ? 1 : 0;
        const crossY = towardY === 0 ? 1 : 0;
        for (let offset = 1 - doorwayWidth; offset <= 0; offset += 1) {
          const group = Array.from({ length: doorwayWidth }, (_, index): Point => [
            x + crossX * (offset + index),
            y + crossY * (offset + index),
          ]);
          const groupSet = new Set(group.map(([groupX, groupY]) => `${groupX},${groupY}`));
          const completesEntrance = group.every(([groupX, groupY]) => {
            const roomX = groupX + towardX;
            const roomY = groupY + towardY;
            const corridorX = groupX - towardX;
            const corridorY = groupY - towardY;
            const isOutsideRoom = towardX === 1
              ? groupX < room.x
              : towardX === -1
                ? groupX >= room.x + room.width
                : towardY === 1
                  ? groupY < room.y
                  : groupY >= room.y + room.height;
            const touchesRoom = roomX >= room.x
              && roomX < room.x + room.width
              && roomY >= room.y
              && roomY < room.y + room.height
              && DOORWAY_ROOM_SURFACE_TILES.has(tiles[roomY][roomX]);
            return isOutsideRoom && touchesRoom && tiles[corridorY]?.[corridorX] === CORRIDOR;
          });
          if (!completesEntrance) continue;

          const hasSideOpening = group.some(([groupX, groupY]) => (
            [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
          ).some(([deltaX, deltaY]) => {
            if (
              (deltaX === towardX && deltaY === towardY)
              || (deltaX === -towardX && deltaY === -towardY)
            ) return false;
            const nextX = groupX + deltaX;
            const nextY = groupY + deltaY;
            if (groupSet.has(`${nextX},${nextY}`)) return false;
            const sideTile = tiles[nextY]?.[nextX] ?? WALL;
            return sideTile !== WALL && sideTile !== CAVE_CONNECTION_WALL_TILE;
          }));
          if (hasSideOpening) continue;

          const key = group.map(([groupX, groupY]) => `${groupX},${groupY}`).sort().join("|");
          candidates.set(key, group);
        }
      }
    }
  }
  return [...candidates.values()];
}

function hasNearbyDoor(tiles: Tile[][], group: Point[]): boolean {
  return group.some(([x, y]) => {
    for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
      for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
        if (
          deltaX === 0 && deltaY === 0
          || Math.abs(deltaX) + Math.abs(deltaY) > 2
        ) continue;
        const neighbor = tiles[y + deltaY]?.[x + deltaX];
        if (neighbor === DOOR || neighbor === SECRET_DOOR_TILE) return true;
      }
    }
    return false;
  });
}

function placeDoors(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
  corridorWidth: number,
  doubleDoorsEnabled: boolean,
  forceDoorRoomIndexes: ReadonlySet<number> = new Set(),
): void {
  const doorwayWidth = corridorWidth === 2 && !doubleDoorsEnabled
    ? 0
    : corridorWidth;
  if (doorwayWidth === 0) return;

  for (let index = 1; index < rooms.length; index += 1) {
    if (random() >= 0.8 && !forceDoorRoomIndexes.has(index)) continue;
    const candidates = findDoorwayCandidates(tiles, rooms[index], doorwayWidth)
      .filter((group) => !hasNearbyDoor(tiles, group));
    if (candidates.length === 0) continue;
    const group = candidates[Math.floor(random() * candidates.length)];
    const doorTile = random() < 0.2 ? SECRET_DOOR_TILE : DOOR;
    for (const [x, y] of group) tiles[y][x] = doorTile;
  }
}

function removeInvalidDoors(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  corridorWidth: number,
  doubleDoorsEnabled: boolean,
): void {
  const doorwayWidth = corridorWidth === 2 && !doubleDoorsEnabled
    ? 0
    : corridorWidth;
  const originalTiles = new Map<number, Tile>();
  const doorGroups: Point[][] = [];
  const visited = new Set<number>();

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
        const position = y * tiles[y].length + x;
        originalTiles.set(position, tile);
        tiles[y][x] = CORRIDOR_TILE;
      }
    }
  }

  for (const [position, tile] of originalTiles) {
    if (visited.has(position)) continue;
    const group: Point[] = [];
    const queue = [position];
    visited.add(position);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const x = current % tiles[0].length;
      const y = Math.floor(current / tiles[0].length);
      group.push([x, y]);
      for (const [nextX, nextY] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const nextPosition = nextY * tiles[0].length + nextX;
        if (
          nextX < 0
          || nextY < 0
          || nextX >= tiles[0].length
          || nextY >= tiles.length
          || visited.has(nextPosition)
          || originalTiles.get(nextPosition) !== tile
        ) continue;
        visited.add(nextPosition);
        queue.push(nextPosition);
      }
    }
    doorGroups.push(group);
  }

  const validDoorwayKeys = new Set<string>();
  if (doorwayWidth > 0) {
    for (const room of rooms) {
      for (const group of findDoorwayCandidates(tiles, room, doorwayWidth)) {
        validDoorwayKeys.add(group.map(([x, y]) => `${x},${y}`).sort().join("|"));
      }
    }
  }

  for (const group of doorGroups) {
    const key = group.map(([x, y]) => `${x},${y}`).sort().join("|");
    const isCompleteDoorway = group.length === doorwayWidth && validDoorwayKeys.has(key);
    for (const [x, y] of group) {
      const position = y * tiles[0].length + x;
      const originalTile = originalTiles.get(position);
      tiles[y][x] = isCompleteDoorway && originalTile !== undefined ? originalTile : WALL;
    }
  }
}

function placeSymmetricPillars(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
): void {
  for (const room of rooms) {
    const hasColumns = room.shape === "columns";
    const isSquareRoom = room.shape === "square"
      || (room.shape === "rectangular" && room.width === room.height);
    if (!hasColumns && ((!isSquareRoom && room.shape !== "round") || room.width < 7 || room.height < 7)) continue;
    if (!hasColumns && random() >= 0.1) continue;
    if (hasColumns && (room.width < 3 || room.height < 3)) continue;

    const centerX = room.x + Math.floor(room.width / 2);
    const centerY = room.y + Math.floor(room.height / 2);
    if (hasColumns && (room.width < 5 || room.height < 5)) {
      const pillarX = room.x + Math.floor(room.width / 4);
      const pillarY = room.y + Math.floor(room.height / 4);
      if (tiles[pillarY][pillarX] === FLOOR) tiles[pillarY][pillarX] = PILLAR_TILE;
      continue;
    }
    const offsetX = Math.max(hasColumns ? 1 : 2, Math.floor(room.width / 4));
    const offsetY = Math.max(hasColumns ? 1 : 2, Math.floor(room.height / 4));
    const positions: Point[] = [
      [centerX - offsetX, centerY - offsetY],
      [centerX + offsetX, centerY - offsetY],
      [centerX - offsetX, centerY + offsetY],
      [centerX + offsetX, centerY + offsetY],
    ];
    if (positions.some(([x, y]) => tiles[y][x] !== FLOOR)) continue;
    for (const [x, y] of positions) tiles[y][x] = PILLAR_TILE;
  }
}

function getLiquidPattern(room: GeneratedRoom, liquidFeature: LiquidFeature, random: () => number): Point[] {
  const centerX = room.x + Math.floor(room.width / 2);
  const centerY = room.y + Math.floor(room.height / 2);
  if (liquidFeature === "well") return [[centerX, centerY]];
  if (liquidFeature === "fountain") {
    return [
      [centerX - 1, centerY - 1],
      [centerX, centerY - 1],
      [centerX + 1, centerY - 1],
      [centerX - 1, centerY],
      [centerX + 1, centerY],
      [centerX - 1, centerY + 1],
      [centerX, centerY + 1],
      [centerX + 1, centerY + 1],
    ];
  }
  if (liquidFeature === "stream") {
    if (random() < 0.5) {
      return Array.from({ length: room.width - 2 }, (_, index): Point => [room.x + index + 1, centerY]);
    }
    return Array.from({ length: room.height - 2 }, (_, index): Point => [centerX, room.y + index + 1]);
  }

  const radiusX = Math.min(3, Math.max(2, Math.floor(room.width / 5)));
  const radiusY = Math.min(2, Math.max(1, Math.floor(room.height / 5)));
  const pond: Point[] = [];
  for (let offsetY = -radiusY; offsetY <= radiusY; offsetY += 1) {
    for (let offsetX = -radiusX; offsetX <= radiusX; offsetX += 1) {
      if ((offsetX * offsetX) / (radiusX * radiusX) + (offsetY * offsetY) / (radiusY * radiusY) <= 1) {
        pond.push([centerX + offsetX, centerY + offsetY]);
      }
    }
  }
  return pond;
}

function placeLiquidFeatures(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
): void {
  const liquidFeatures: LiquidFeature[] = ["fountain", "stream", "well", "pond"];
  for (const room of rooms) {
    if (room.width < 7 || room.height < 7 || random() >= 0.15) continue;
    const liquidFeature = liquidFeatures[Math.floor(random() * liquidFeatures.length)];
    const liquidType: LiquidType = random() < 0.2 ? "lava" : "water";
    const pattern = getLiquidPattern(room, liquidFeature, random);
    if (pattern.some(([x, y]) => tiles[y]?.[x] !== FLOOR)) continue;
    const liquidTile = liquidType === "lava" ? LAVA_TILE : WATER_TILE;
    for (const [x, y] of pattern) tiles[y][x] = liquidTile;
    room.liquidFeature = liquidFeature;
    room.liquidType = liquidType;
  }
}

type CaveLiquidFormation = "pool" | "stream" | "waterfall" | "spring";

function getCaveRegions(tiles: Tile[][]): Point[][] {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const regions: Point[][] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[y][x] !== CAVE_TILE || visited[y][x]) continue;
      const region: Point[] = [];
      const queue: Point[] = [[x, y]];
      visited[y][x] = true;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentX, currentY] = queue[cursor];
        region.push([currentX, currentY]);
        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ]) {
          if (
            nextX < 0
            || nextY < 0
            || nextX >= width
            || nextY >= height
            || visited[nextY][nextX]
            || tiles[nextY][nextX] !== CAVE_TILE
          ) continue;
          visited[nextY][nextX] = true;
          queue.push([nextX, nextY]);
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

function getCaveInteriorCells(tiles: Tile[][], region: Point[]): Point[] {
  return region.filter(([x, y]) => {
    let caveNeighborCount = 0;
    for (const [neighborX, neighborY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const neighbor = tiles[neighborY]?.[neighborX];
      if (neighbor === CAVE_TILE) {
        caveNeighborCount += 1;
      } else if (neighbor !== undefined && neighbor !== WALL) {
        return false;
      }
    }
    return caveNeighborCount >= 2;
  });
}

function getCaveFormationPattern(
  tiles: Tile[][],
  candidates: Point[],
  start: Point,
  formation: CaveLiquidFormation,
  random: () => number,
): Point[] {
  const width = tiles[0]?.length ?? 0;
  const candidatePositions = new Set(candidates.map(([x, y]) => y * width + x));
  const isCandidate = (x: number, y: number) => (
    candidatePositions.has(y * width + x) && tiles[y]?.[x] === CAVE_TILE
  );
  const [startX, startY] = start;

  if (formation === "pool") {
    const radiusX = 1 + Math.floor(random() * 3);
    const radiusY = 1 + Math.floor(random() * 2);
    const pond: Point[] = [];
    for (let offsetY = -radiusY; offsetY <= radiusY; offsetY += 1) {
      for (let offsetX = -radiusX; offsetX <= radiusX; offsetX += 1) {
        if (
          (offsetX * offsetX) / (radiusX * radiusX)
            + (offsetY * offsetY) / (radiusY * radiusY) <= 1
          && isCandidate(startX + offsetX, startY + offsetY)
        ) pond.push([startX + offsetX, startY + offsetY]);
      }
    }
    return pond.length >= 3 ? pond : [];
  }

  if (formation === "stream") {
    const stream: Point[] = [start];
    const visited = new Set<number>([startY * width + startX]);
    const targetLength = 5 + Math.floor(random() * 7);
    while (stream.length < targetLength) {
      const [x, y] = stream[stream.length - 1];
      const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([nextX, nextY]) => (
        isCandidate(nextX, nextY) && !visited.has(nextY * width + nextX)
      ));
      if (next.length === 0) break;
      const [nextX, nextY] = next[Math.floor(random() * next.length)];
      stream.push([nextX, nextY]);
      visited.add(nextY * width + nextX);
    }
    return stream.length >= 4 ? stream : [];
  }

  if (formation === "waterfall") {
    const length = 2 + Math.floor(random() * 3);
    const direction = random() < 0.5 ? 1 : -1;
    const waterfall = Array.from({ length }, (_, index): Point => [
      startX,
      startY + index * direction,
    ]);
    return waterfall.every(([x, y]) => isCandidate(x, y)) ? waterfall : [];
  }

  const spring = [start];
  const sources = [[startX + 1, startY], [startX - 1, startY], [startX, startY + 1], [startX, startY - 1]]
    .filter(([x, y]) => isCandidate(x, y));
  while (spring.length < 4 && sources.length > 0) {
    const [x, y] = sources.splice(Math.floor(random() * sources.length), 1)[0];
    spring.push([x, y]);
  }
  return spring;
}

function placeCaveLiquidFeatures(tiles: Tile[][], random: () => number): void {
  for (const region of getCaveRegions(tiles)) {
    if (region.length < 12 || random() >= 0.65) continue;
    const candidates = getCaveInteriorCells(tiles, region);
    const featureCount = Math.min(3, Math.max(1, Math.floor(candidates.length / 180) + 1));
    for (let index = 0; index < featureCount; index += 1) {
      const available = candidates.filter(([x, y]) => tiles[y][x] === CAVE_TILE);
      if (available.length === 0) break;
      const formation = (["pool", "stream", "waterfall", "spring"] as const)[
        Math.floor(random() * 4)
      ];
      let pattern: Point[] = [];
      for (let attempt = 0; attempt < 12 && pattern.length === 0; attempt += 1) {
        const start = available[Math.floor(random() * available.length)];
        pattern = getCaveFormationPattern(tiles, available, start, formation, random);
      }
      if (pattern.length === 0) continue;

      const isLava = random() < 0.2;
      const liquidTile = isLava ? CAVE_LAVA_TILE : CAVE_WATER_TILE;
      const formationTile = formation === "waterfall"
        ? isLava ? CAVE_LAVA_FALL_TILE : CAVE_WATERFALL_TILE
        : formation === "spring"
          ? isLava ? CAVE_LAVA_VENT_TILE : CAVE_SPRING_TILE
          : liquidTile;
      for (const [patternIndex, [x, y]] of pattern.entries()) {
        tiles[y][x] = formation === "spring" && patternIndex === 0
          ? formationTile
          : formation === "waterfall"
            ? formationTile
            : liquidTile;
      }
    }
  }
}

function selectWeightedTrapType(
  trapTypes: readonly TrapType[],
  weights: TrapCategoryWeights,
  random: () => number,
): TrapType | undefined {
  const availableCategories = TRAP_CATEGORY_ORDER.filter((category) => (
    Number.isFinite(weights[category])
    && weights[category] > 0
    && trapTypes.some((type) => TRAP_DEFINITIONS[type].category === category)
  ));
  const totalWeight = availableCategories.reduce((total, category) => total + weights[category], 0);
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const category of availableCategories) {
    choice -= weights[category];
    if (choice < 0) {
      const categoryTypes = trapTypes.filter((type) => TRAP_DEFINITIONS[type].category === category);
      return categoryTypes[Math.floor(random() * categoryTypes.length)];
    }
  }
  const finalCategory = availableCategories[availableCategories.length - 1];
  const finalTypes = trapTypes.filter((type) => TRAP_DEFINITIONS[type].category === finalCategory);
  return finalTypes[Math.floor(random() * finalTypes.length)];
}

const MAX_ROOM_TRAPS = 3;
const MAX_ROOM_TREASURES = 3;
const ADDITIONAL_ROOM_ITEM_CHANCE = 0.35;

function placeTraps(
  rooms: GeneratedRoom[],
  random: () => number,
  weights: TrapCategoryWeights,
  chancePercent: number,
): void {
  const roomTrapTypes = TRAP_TYPES.filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor");
  for (const room of rooms) {
    const traps: TrapType[] = [];
    if (random() < chancePercent / 100) {
      for (let index = 0; index < MAX_ROOM_TRAPS; index += 1) {
        if (index > 0 && random() >= ADDITIONAL_ROOM_ITEM_CHANCE) break;
        const availableTypes = roomTrapTypes.filter((type) => !traps.includes(type));
        const trapType = selectWeightedTrapType(availableTypes, weights, random);
        if (!trapType) break;
        traps.push(trapType);
      }
    }
    room.traps = traps;
  }
}

function placeCorridorTraps(
  tiles: Tile[][],
  random: () => number,
  weights: TrapCategoryWeights,
  chancePercent: number,
): DungeonTrap[] {
  const corridorTrapTypes = TRAP_TYPES.filter((type) => TRAP_DEFINITIONS[type].placement !== "room");
  const traps: DungeonTrap[] = [];
  const candidates: Point[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === CORRIDOR || tiles[y][x] === CAVE_TILE) candidates.push([x, y]);
    }
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  const trapLimit = Math.min(3, Math.max(1, Math.round(candidates.length / 80)));
  for (const [x, y] of candidates) {
    if (traps.length >= trapLimit) break;
    if (random() >= chancePercent / 100) continue;
    const hasNearbyTrap = traps.some((trap) => Math.abs(trap.x - x) <= 1 && Math.abs(trap.y - y) <= 1);
    if (hasNearbyTrap) continue;

    const trapType = selectWeightedTrapType(corridorTrapTypes, weights, random);
    if (!trapType) continue;
    traps.push({ type: trapType, x, y });
  }
  return traps;
}

function selectWeightedTreasureCategory(
  weights: TreasureCategoryWeights,
  consumablesEnabled: boolean,
  random: () => number,
): TreasureCategory | undefined {
  const categories = TREASURE_CATEGORY_ORDER.filter((category) => (
    (consumablesEnabled || category !== "consumables")
    && Number.isFinite(weights[category])
    && weights[category] > 0
    && TREASURE_CATALOG[category].length > 0
  ));
  const totalWeight = categories.reduce((total, category) => total + weights[category], 0);
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const category of categories) {
    choice -= weights[category];
    if (choice < 0) return category;
  }
  return categories[categories.length - 1];
}

function selectWeightedTreasureRarity(
  weights: TreasureRarityWeights,
  random: () => number,
): TreasureRarity | undefined {
  const rarities = TREASURE_RARITY_ORDER.filter((rarity) => (
    Number.isFinite(weights[rarity]) && weights[rarity] > 0
  ));
  const totalWeight = rarities.reduce((total, rarity) => total + weights[rarity], 0);
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const rarity of rarities) {
    choice -= weights[rarity];
    if (choice < 0) return rarity;
  }
  return rarities[rarities.length - 1];
}

function normalizeTreasureText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function treasureMatchesRoom(definition: TreasureDefinition, room: DungeonRoom): boolean {
  const roomContext = normalizeTreasureText(`${room.roomType.title} ${room.roomType.description}`);
  const genericLocationWords = new Set(["sala", "salas", "camara", "camaras", "area", "areas", "local", "locais"]);
  return definition.locations.split(/[,;.]/).some((location) => (
    location
      .split(/[^a-z0-9]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !genericLocationWords.has(word))
      .some((word) => {
        const singular = word.endsWith("s") ? word.slice(0, -1) : word;
        return roomContext.includes(word) || roomContext.includes(singular);
      })
  ));
}

function selectRandomValue<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function createTreasureDetails(
  definition: TreasureDefinition,
  category: TreasureCategory,
  random: () => number,
): string[] {
  const details: string[] = [];
  const quantityDescriptions = ["pequena quantidade", "quantidade moderada", "reserva significativa", "grande reserva"];
  const qualityDescriptions = ["qualidade comum", "bem preservado", "trabalho refinado", "estado deteriorado"];

  if (category === "monetary") {
    details.push(
      `Quantidade: ${selectRandomValue(quantityDescriptions, random)}.`,
      `Qualidade: ${selectRandomValue(qualityDescriptions, random)}.`,
      `Valor contextual: pode ser maior para colecionadores ou estudiosos.`,
    );
  } else if (category === "equipment") {
    const attributes = [
      "Origem cultural: uma tradiÃ§Ã£o local antiga.",
      "Material: liga metÃ¡lica de procedÃªncia incomum.",
      "Qualidade artesanal: acabamento acima do padrÃ£o.",
      "ConservaÃ§Ã£o: marcas de uso, mas ainda funcional.",
      "InscriÃ§Ã£o: sÃ­mbolo ou nome de um antigo proprietÃ¡rio.",
      "Valor histÃ³rico: associado a uma facÃ§Ã£o desaparecida.",
      "Propriedade especial: possÃ­vel efeito sobrenatural, a critÃ©rio da campanha.",
    ];
    const selected = new Set<string>();
    while (selected.size < 3) selected.add(selectRandomValue(attributes, random));
    details.push(...selected);
  } else if (category === "consumables") {
    details.push(
      `Quantidade: ${Math.floor(random() * 4) + 1} unidade(s).`,
      `CondiÃ§Ã£o: ${selectRandomValue(qualityDescriptions, random)}.`,
    );
  } else if (category === "relics") {
    const values = ["baixo", "moderado", "alto", "excepcional"];
    details.push(
      `Valor comercial: ${selectRandomValue(values, random)}.`,
      `Valor histÃ³rico: ${selectRandomValue(values, random)}.`,
      `Valor narrativo: ${selectRandomValue(values, random)}.`,
    );
  } else if (category === "documents") {
    details.push("Pista potencial: pode conectar esta sala a outra Ã¡rea ou facÃ§Ã£o.");
  } else if (category === "materials") {
    details.push(
      `Quantidade: ${selectRandomValue(quantityDescriptions, random)}.`,
      `Qualidade: ${selectRandomValue(qualityDescriptions, random)}.`,
    );
  } else if (category === "creatureTrophies") {
    details.push(`Comportamento do acumulador: ${selectRandomValue(["organizado por valor ou utilidade", "acumulado aleatoriamente, sem critÃ©rio aparente"], random)}.`);
  } else if (category === "cursed") {
    details.push("O risco estÃ¡ vinculado ao prÃ³prio objeto e pode persistir depois de retirado; nÃ£o Ã© uma armadilha de piso.");
  } else if (category === "secret" && definition.discoveryMethod) {
    details.push(`Forma de descoberta: ${definition.discoveryMethod}`);
    details.push(`RelevÃ¢ncia: ${selectRandomValue(["objeto incomum", "pista importante", "recompensa valiosa"], random)}.`);
  }

  return details;
}

function placeRoomTreasures(
  rooms: DungeonRoom[],
  random: () => number,
  categoryWeights: TreasureCategoryWeights,
  rarityWeights: TreasureRarityWeights,
  chancePercent: number,
  consumablesEnabled: boolean,
): void {
  for (const room of rooms) {
    const roomChance = getRoomTreasureChance(
      room.roomType.category,
      room.roomType.title,
      chancePercent,
    );
    const treasures: DungeonTreasure[] = [];
    if (random() < roomChance / 100) {
      for (let index = 0; index < MAX_ROOM_TREASURES; index += 1) {
        if (index > 0 && random() >= ADDITIONAL_ROOM_ITEM_CHANCE) break;
        const category = selectWeightedTreasureCategory(categoryWeights, consumablesEnabled, random);
        if (!category) break;

        const rarity = category === "magical"
          ? selectWeightedTreasureRarity(rarityWeights, random)
          : undefined;
        if (category === "magical" && !rarity) break;

        const categoryDefinitions: readonly TreasureDefinition[] = category === "magical"
          ? TREASURE_CATALOG.magical.filter((definition) => definition.rarity === rarity)
          : TREASURE_CATALOG[category];
        const contextualDefinitions = categoryDefinitions.filter((definition) => treasureMatchesRoom(definition, room));
        const availableDefinitions = contextualDefinitions.length > 0 ? contextualDefinitions : categoryDefinitions;
        if (availableDefinitions.length === 0) break;

        const definition = selectRandomValue(availableDefinitions, random);
        treasures.push({
          type: definition.id as TreasureType,
          category,
          rarity,
          details: createTreasureDetails(definition, category, random),
        });
      }
    }
    room.treasures = treasures;
  }
}

function findRoomStairPosition(
  tiles: Tile[][],
  room: Rect,
  random: () => number,
): Point | undefined {
  const candidates: Point[] = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (tiles[y][x] === FLOOR) candidates.push([x, y]);
    }
  }
  if (candidates.length === 0) return undefined;

  const [centerX, centerY] = roomCenter(room);
  const distances = candidates.map(([x, y]) => Math.abs(x - centerX) + Math.abs(y - centerY));
  const maximumDistance = Math.max(...distances);
  const edgeCandidates = candidates.filter((_, index) => distances[index] === maximumDistance);
  return edgeCandidates[Math.floor(random() * edgeCandidates.length)];
}

function isStraightCorridorTile(tiles: Tile[][], x: number, y: number, corridorWidth: number): boolean {
  if (tiles[y]?.[x] !== CORRIDOR) return false;
  const width = Math.max(1, Math.min(3, Math.floor(corridorWidth)));
  const offsets = Array.from(
    { length: width },
    (_, index) => index - Math.floor((width - 1) / 2),
  );
  const hasStraightRun = (horizontal: boolean): boolean => {
    const position = horizontal ? y : x;
    for (const offset of offsets) {
      const center = position - offset;
      const lanePositions = offsets.map((laneOffset) => center + laneOffset);
      if (!lanePositions.includes(position)) continue;
      const hasForwardAndBackwardNeighbors = lanePositions.every((lanePosition) => (
        horizontal
          ? tiles[lanePosition]?.[x - 1] === CORRIDOR && tiles[lanePosition]?.[x + 1] === CORRIDOR
          : tiles[y - 1]?.[lanePosition] === CORRIDOR && tiles[y + 1]?.[lanePosition] === CORRIDOR
      ));
      if (!hasForwardAndBackwardNeighbors) continue;

      const minimumLane = Math.min(...lanePositions);
      const maximumLane = Math.max(...lanePositions);
      const hasCrossing = horizontal
        ? Array.from({ length: 3 }, (_, index) => x + index - 1).some((laneX) => (
          tiles[minimumLane - 1]?.[laneX] === CORRIDOR
          || tiles[maximumLane + 1]?.[laneX] === CORRIDOR
        ))
        : Array.from({ length: 3 }, (_, index) => y + index - 1).some((laneY) => (
          tiles[laneY]?.[minimumLane - 1] === CORRIDOR
          || tiles[laneY]?.[maximumLane + 1] === CORRIDOR
        ));
      if (!hasCrossing) return true;
    }
    return false;
  };
  return hasStraightRun(true) || hasStraightRun(false);
}

function findFarthestOpenPoint(
  tiles: Tile[][],
  origin: Point | undefined,
  random: () => number,
  corridorWidth: number,
): Point | undefined {
  const candidates: Point[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === FLOOR || isStraightCorridorTile(tiles, x, y, corridorWidth)) {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return undefined;
  if (!origin) return candidates[Math.floor(random() * candidates.length)];

  let farthestDistance = -1;
  let farthestCandidates: Point[] = [];
  for (const point of candidates) {
    if (point[0] === origin[0] && point[1] === origin[1]) continue;
    const distance = Math.abs(point[0] - origin[0]) + Math.abs(point[1] - origin[1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestCandidates = [point];
    } else if (distance === farthestDistance) {
      farthestCandidates.push(point);
    }
  }
  if (farthestCandidates.length === 0) return undefined;
  return farthestCandidates[Math.floor(random() * farthestCandidates.length)];
}

function findCorridorStairPosition(
  tiles: Tile[][],
  excluded: Point | undefined,
  random: () => number,
  corridorWidth: number,
): Point | undefined {
  const candidates: Point[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (
        isStraightCorridorTile(tiles, x, y, corridorWidth)
        && (excluded === undefined || x !== excluded[0] || y !== excluded[1])
      ) {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)];
}

function findStairPosition(
  tiles: Tile[][],
  room: GeneratedRoom | undefined,
  excluded: Point | undefined,
  random: () => number,
  corridorWidth: number,
): Point | undefined {
  if (random() < 0.35) {
    const corridorPosition = findCorridorStairPosition(tiles, excluded, random, corridorWidth);
    if (corridorPosition) return corridorPosition;
  }

  const roomPosition = room ? findRoomStairPosition(tiles, room, random) : undefined;
  if (roomPosition && (excluded === undefined || roomPosition[0] !== excluded[0] || roomPosition[1] !== excluded[1])) {
    return roomPosition;
  }
  return findFarthestOpenPoint(tiles, excluded, random, corridorWidth);
}

function carveExteriorAccess(tiles: Tile[][], room: GeneratedRoom, accessTile: Tile): void {
  const width = tiles[0].length;
  const height = tiles.length;
  const routes: Array<{ distance: number; x: number; y: number; dx: number; dy: number }> = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (tiles[y][x] !== FLOOR) continue;
      routes.push(
        { distance: x, x, y, dx: -1, dy: 0 },
        { distance: width - 1 - x, x, y, dx: 1, dy: 0 },
        { distance: y, x, y, dx: 0, dy: -1 },
        { distance: height - 1 - y, x, y, dx: 0, dy: 1 },
      );
    }
  }
  if (routes.length === 0) return;
  routes.sort((first, second) => first.distance - second.distance);
  const route = routes[0];
  let x = route.x;
  let y = route.y;

  while (x >= 0 && x < width && y >= 0 && y < height) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
      tiles[y][x] = accessTile;
      return;
    }
    if (tiles[y][x] === WALL) tiles[y][x] = CORRIDOR;
    x += route.dx;
    y += route.dy;
  }
}

function placeStairs(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
  entranceMode: EntranceMode,
  corridorWidth: number,
): void {
  let upstairs = entranceMode === "upper-stairs" && rooms[0]
    ? findRoomStairPosition(tiles, rooms[0], random)
    : findStairPosition(tiles, rooms[0], undefined, random, corridorWidth);
  let downstairs = findStairPosition(
    tiles,
    rooms.length > 1 ? rooms[rooms.length - 1] : undefined,
    upstairs,
    random,
    corridorWidth,
  );

  const usesExteriorAccess = rooms.length > 0 && entranceMode !== "upper-stairs";
  if (usesExteriorAccess) {
    const accessTile = entranceMode === "exterior-entrance"
      ? EXTERIOR_ENTRANCE_TILE
      : EXTERIOR_CONNECTION_TILE;
    carveExteriorAccess(tiles, rooms[0], accessTile);
  } else {
    if (!upstairs) upstairs = findFarthestOpenPoint(tiles, undefined, random, corridorWidth);
    if (upstairs) tiles[upstairs[1]][upstairs[0]] = STAIRS_UP;
  }
  if (!downstairs) downstairs = findFarthestOpenPoint(tiles, upstairs, random, corridorWidth);
  if (upstairs && downstairs && upstairs[0] === downstairs[0] && upstairs[1] === downstairs[1]) {
    downstairs = findFarthestOpenPoint(tiles, upstairs, random, corridorWidth);
  }

  if (downstairs) tiles[downstairs[1]][downstairs[0]] = STAIRS_DOWN;
}

function getRoomTraversalOrder(tiles: Tile[][], rooms: GeneratedRoom[]): number[] {
  if (rooms.length < 2) return rooms.map((_, index) => index);

  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const cellCount = width * height;
  const roomAt = new Int16Array(cellCount).fill(-1);
  const roomCells = rooms.map(() => [] as number[]);

  for (const [roomIndex, room] of rooms.entries()) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const position = y * width + x;
        const tile = tiles[y]?.[x];
        if (
          tile === undefined
          || tile === WALL
          || tile === CAVE_CONNECTION_WALL_TILE
          || tile === CAVE_TILE
          || isCaveLiquidTile(tile)
          || tile === PILLAR_TILE
        ) continue;
        if (roomAt[position] === -1) roomAt[position] = roomIndex;
        if (roomAt[position] === roomIndex) roomCells[roomIndex].push(position);
      }
    }
  }

  const roomDistances = rooms.map(() => new Float64Array(rooms.length).fill(Number.POSITIVE_INFINITY));
  for (const [sourceRoom, sourceCells] of roomCells.entries()) {
    const distances = new Int32Array(cellCount).fill(-1);
    const queue = new Int32Array(cellCount);
    let tail = 0;
    for (const position of sourceCells) {
      if (distances[position] !== -1) continue;
      distances[position] = 0;
      queue[tail++] = position;
    }

    for (let head = 0; head < tail; head += 1) {
      const position = queue[head];
      const roomIndex = roomAt[position];
      if (
        roomIndex >= 0
        && roomIndex !== sourceRoom
        && !Number.isFinite(roomDistances[sourceRoom][roomIndex])
      ) {
        roomDistances[sourceRoom][roomIndex] = distances[position];
      }

      const x = position % width;
      const y = Math.floor(position / width);
      for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const nextPosition = nextY * width + nextX;
        const tile = tiles[nextY][nextX];
        if (distances[nextPosition] !== -1 || tile === WALL || tile === PILLAR_TILE) continue;
        distances[nextPosition] = distances[position] + 1;
        queue[tail++] = nextPosition;
      }
    }
  }

  const spatialDistance = (firstRoom: number, secondRoom: number) => (
    Math.abs(rooms[firstRoom].x + rooms[firstRoom].width / 2 - rooms[secondRoom].x - rooms[secondRoom].width / 2)
    + Math.abs(rooms[firstRoom].y + rooms[firstRoom].height / 2 - rooms[secondRoom].y - rooms[secondRoom].height / 2)
  );
  const spatialOrder = (roomIndex: number) => (
    rooms[roomIndex].y * width + rooms[roomIndex].x
  );
  const getRouteDistance = (firstRoom: number, secondRoom: number) => {
    const distance = roomDistances[firstRoom][secondRoom];
    return Number.isFinite(distance)
      ? distance
      : cellCount + spatialDistance(firstRoom, secondRoom);
  };
  const roomOrder = [0];
  const unvisited = new Set(rooms.map((_, index) => index).slice(1));
  const exitRoom = rooms.length - 1;

  while (unvisited.size > 0) {
    const currentRoom = roomOrder[roomOrder.length - 1];
    const candidates = [...unvisited].filter((roomIndex) => (
      unvisited.size === 1 || roomIndex !== exitRoom
    ));
    let nextRoom = candidates[0];
    for (const candidate of candidates.slice(1)) {
      const candidateDistance = roomDistances[currentRoom][candidate];
      const nextDistance = roomDistances[currentRoom][nextRoom];
      const isCloser = Number.isFinite(candidateDistance)
        ? !Number.isFinite(nextDistance) || candidateDistance < nextDistance
        : !Number.isFinite(nextDistance)
          && spatialDistance(currentRoom, candidate) < spatialDistance(currentRoom, nextRoom);
      const isDistanceTie = candidateDistance === nextDistance
        || (!Number.isFinite(candidateDistance) && !Number.isFinite(nextDistance)
          && spatialDistance(currentRoom, candidate) === spatialDistance(currentRoom, nextRoom));
      const isSpatialTieBreak = isDistanceTie
        && spatialOrder(candidate) < spatialOrder(nextRoom);
      if (isCloser || isSpatialTieBreak) nextRoom = candidate;
    }
    roomOrder.push(nextRoom);
    unvisited.delete(nextRoom);
  }

  const getRouteScore = (order: number[]): [number, number] => {
    let longestSegment = 0;
    let totalDistance = 0;
    for (let index = 1; index < order.length; index += 1) {
      const distance = getRouteDistance(order[index - 1], order[index]);
      longestSegment = Math.max(longestSegment, distance);
      totalDistance += distance;
    }
    return [longestSegment, totalDistance];
  };

  // Keep the entrance and exit fixed while reducing long jumps between numbered rooms.
  let routeScore = getRouteScore(roomOrder);
  while (true) {
    let improvedOrder: number[] | null = null;
    let improvedScore = routeScore;
    for (let start = 1; start < roomOrder.length - 2; start += 1) {
      for (let end = start + 1; end < roomOrder.length - 1; end += 1) {
        const candidateOrder = [
          ...roomOrder.slice(0, start),
          ...roomOrder.slice(start, end + 1).reverse(),
          ...roomOrder.slice(end + 1),
        ];
        const candidateScore = getRouteScore(candidateOrder);
        if (
          candidateScore[0] < improvedScore[0]
          || (candidateScore[0] === improvedScore[0] && candidateScore[1] < improvedScore[1])
        ) {
          improvedOrder = candidateOrder;
          improvedScore = candidateScore;
        }
      }
    }
    if (!improvedOrder) break;
    roomOrder.splice(0, roomOrder.length, ...improvedOrder);
    routeScore = improvedScore;
  }

  return roomOrder;
}

export function generateDungeon(
  algorithm: Algorithm,
  seed: number,
  parameters: DungeonParameters = DEFAULT_DUNGEON_PARAMETERS,
): Dungeon {
  assertSupportedDungeonDimensions(parameters.width, parameters.height);
  const random = createRandom(seed);
  let tiles: Tile[][];
  let roomRects: GeneratedRoom[] = [];

  if (algorithm === "bsp") {
    const result = generateBsp(
      parameters.width,
      parameters.height,
      random,
      parameters.roomCount,
      parameters.corridorWidth,
      parameters.corridorCompactness,
      parameters.roomShapeFrequencies,
      parameters.roomSizeDistributionEnabled,
      parameters.roomSizeFrequencies,
      parameters.rectangularRoomRatioFrequencies,
    );
    tiles = result.tiles;
    roomRects = result.rooms;
  } else if (algorithm === "cellular") {
    tiles = generateCellular(
      parameters.width,
      parameters.height,
      random,
      parameters.cellularFillPercent,
      parameters.cellularIterations,
    );
    for (let y = 0; y < tiles.length; y += 1) {
      for (let x = 0; x < tiles[y].length; x += 1) {
        if (tiles[y][x] === FLOOR) tiles[y][x] = CAVE_TILE;
      }
    }
  } else if (algorithm === "drunkard") {
    tiles = generateDrunkard(
      parameters.width,
      parameters.height,
      random,
      parameters.drunkardCoveragePercent,
    );
  } else {
    const result = generateHybrid(
      parameters.width,
      parameters.height,
      seed,
      parameters,
      algorithm !== "bsp-drunkard",
      algorithm !== "bsp-cellular",
    );
    tiles = result.tiles;
    roomRects = result.rooms;
  }

  placeSymmetricPillars(tiles, roomRects, random);
  placeLiquidFeatures(tiles, roomRects, random);
  placeCaveLiquidFeatures(tiles, random);
  placeDoors(
    tiles,
    roomRects,
    random,
    parameters.corridorWidth,
    parameters.doubleDoorsEnabled,
  );
  placeStairs(tiles, roomRects, random, parameters.entranceMode, parameters.corridorWidth);
  placeTraps(
    roomRects,
    random,
    parameters.trapCategoryWeights,
    parameters.roomTrapChancePercent,
  );
  const traps = placeCorridorTraps(
    tiles,
    random,
    parameters.trapCategoryWeights,
    parameters.corridorTrapChancePercent,
  );

  let floorCount = 0;
  for (const row of tiles) {
    for (const tile of row) {
      if (tile !== WALL && tile !== CAVE_CONNECTION_WALL_TILE) floorCount += 1;
    }
  }
  const roomOrder = getRoomTraversalOrder(tiles, roomRects);
  const roomTypes = getRoomTypeDefinitions(
    roomOrder.length,
    seed,
    parameters.roomTypeDistributionEnabled ? parameters.roomTypeCategoryFrequencies : undefined,
  );
  const roomDetails: DungeonRoom[] = roomOrder.map((roomIndex, index) => {
    const room = roomRects[roomIndex];
    return {
      ...room,
      number: index + 1,
      centerX: room.x + room.width / 2,
      centerY: room.y + room.height / 2,
      shape: room.shape,
      roomType: roomTypes[index],
      traps: room.traps ?? [],
      treasures: [],
    };
  });
  placeRoomTreasures(
    roomDetails,
    random,
    parameters.treasureCategoryWeights,
    parameters.treasureRarityWeights,
    parameters.treasureChancePercent,
    parameters.treasureConsumablesEnabled,
  );
  return {
    width: parameters.width,
    height: parameters.height,
    tiles,
    rooms: roomRects.length,
    roomDetails,
    traps,
    floorCount,
    seed,
    algorithm,
    corridorWidth: parameters.corridorWidth,
    doubleDoorsEnabled: parameters.doubleDoorsEnabled,
    trapCategoryWeights: parameters.trapCategoryWeights,
    roomTrapChancePercent: parameters.roomTrapChancePercent,
    corridorTrapChancePercent: parameters.corridorTrapChancePercent,
    treasureCategoryWeights: parameters.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityWeights,
    treasureChancePercent: parameters.treasureChancePercent,
    treasureConsumablesEnabled: parameters.treasureConsumablesEnabled,
  };
}

export const generateDungeonV1 = generateDungeon;

function snapshotDungeonParameters(parameters: DungeonParameters): DungeonParameters {
  return {
    ...parameters,
    roomSizeFrequencies: { ...parameters.roomSizeFrequencies },
    roomShapeFrequencies: { ...parameters.roomShapeFrequencies },
    rectangularRoomRatioFrequencies: { ...parameters.rectangularRoomRatioFrequencies },
    roomTypeCategoryFrequencies: { ...parameters.roomTypeCategoryFrequencies },
    trapCategoryWeights: { ...parameters.trapCategoryWeights },
    treasureCategoryWeights: { ...parameters.treasureCategoryWeights },
    treasureRarityWeights: { ...parameters.treasureRarityWeights },
  };
}

export function generateDungeonVersioned(
  request: DungeonGenerationRequest,
): VersionedDungeonGeneration {
  const parameters = snapshotDungeonParameters(request.parameters ?? DEFAULT_DUNGEON_PARAMETERS);
  let dungeon: Dungeon;

  switch (request.generatorVersion) {
    case DUNGEON_GENERATOR_VERSION_V1:
      dungeon = generateDungeonV1(request.algorithm, request.seed, parameters);
      break;
    default:
      throw new Error(`Unsupported dungeon generator version: ${String(request.generatorVersion)}`);
  }

  return {
    dungeon,
    metadata: {
      generatorVersion: request.generatorVersion,
      seed: dungeon.seed,
      profile: request.profile ?? "custom",
      algorithm: dungeon.algorithm,
      parameters,
      settings: { ...request.settings },
      generatedAt: new Date().toISOString(),
    },
  };
}

export function repositionDungeonRooms(
  dungeon: Dungeon,
  positions: Readonly<Record<number, RoomPosition>>,
): Dungeon | null {
  if (dungeon.roomDetails.length === 0) return null;

  const rooms = dungeon.roomDetails.map((room) => {
    const position = positions[room.number];
    return position ? { ...room, x: position.x, y: position.y } : room;
  });
  const movedRoomNumbers = new Set<number>();
  for (const [index, room] of rooms.entries()) {
    const originalRoom = dungeon.roomDetails[index];
    if (room.x !== originalRoom.x || room.y !== originalRoom.y) {
      movedRoomNumbers.add(room.number);
    }
  }
  for (const [index, room] of rooms.entries()) {
    if (
      !Number.isInteger(room.x)
      || !Number.isInteger(room.y)
      || room.x < 1
      || room.y < 1
      || room.x + room.width > dungeon.width - 1
      || room.y + room.height > dungeon.height - 1
    ) return null;
    for (const otherRoom of rooms.slice(index + 1)) {
      const overlapsWithClearance = (
        room.x < otherRoom.x + otherRoom.width + 1
        && room.x + room.width + 1 > otherRoom.x
        && room.y < otherRoom.y + otherRoom.height + 1
        && room.y + room.height + 1 > otherRoom.y
      );
      if (overlapsWithClearance) return null;
    }
  }
  if (movedRoomNumbers.size === 0) return dungeon;

  const roomSurfaceTiles = new Set<Tile>([
    FLOOR_TILE,
    STAIRS_UP_TILE,
    STAIRS_DOWN_TILE,
    PILLAR_TILE,
    ELEVATED_FLOOR_TILE,
    ROOM_STAIRS_TILE,
    WATER_TILE,
    LAVA_TILE,
    ...TRAP_TYPES
      .filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor")
      .map((type) => TRAP_DEFINITIONS[type].tile),
  ]);
  const corridorTrapTiles = new Set<Tile>(
    TRAP_TYPES
      .filter((type) => TRAP_DEFINITIONS[type].placement === "corridor")
      .map((type) => TRAP_DEFINITIONS[type].tile),
  );
  const roomTemplates = dungeon.roomDetails.map((room) => {
    const template = Array.from({ length: room.height }, (_, offsetY) => (
      Array.from({ length: room.width }, (_, offsetX) => {
        const tile = dungeon.tiles[room.y + offsetY]?.[room.x + offsetX] ?? WALL;
        return roomSurfaceTiles.has(tile) ? tile : WALL;
      })
    ));
    if (!template.some((row) => row.some((tile) => roomSurfaceTiles.has(tile)))) {
      for (const row of template) row.fill(FLOOR_TILE);
    }
    return template;
  });
  const tiles = dungeon.tiles.map((row) => [...row]);
  let exteriorAccessTile: Tile | undefined;
  const doorBelongsToRoom = (room: DungeonRoom, x: number, y: number): boolean => (
    (
      (x === room.x - 1 || x === room.x + room.width)
      && y >= room.y
      && y < room.y + room.height
    )
    || (
      (y === room.y - 1 || y === room.y + room.height)
      && x >= room.x
      && x < room.x + room.width
    )
  );
  const roomsWithDoorsBeforeMove = new Set<number>();
  const stationaryDoorConnections: Array<{ doorPosition: number; doorTile: Tile; corridorPosition: number }> = [];
  const corridorStairs: Tile[] = [];
  const protectedDoorSidePositions = new Set<number>();
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = tiles[y][x];
      if (tile === CAVE_CONNECTION_WALL_TILE || tile === CAVE_BREACH_TILE) {
        tiles[y][x] = CAVE_TILE;
        continue;
      }
      if (tile === EXTERIOR_ENTRANCE_TILE || tile === EXTERIOR_CONNECTION_TILE) {
        exteriorAccessTile = tile;
      }
      if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
        const ownerRoom = dungeon.roomDetails.find((room) => doorBelongsToRoom(room, x, y));
        if (ownerRoom && ownerRoom.number > 1) roomsWithDoorsBeforeMove.add(ownerRoom.number);
        if (ownerRoom && !movedRoomNumbers.has(ownerRoom.number)) {
          const corridorX = x === ownerRoom.x - 1
            ? x - 1
            : x === ownerRoom.x + ownerRoom.width
              ? x + 1
              : x;
          const corridorY = y === ownerRoom.y - 1
            ? y - 1
            : y === ownerRoom.y + ownerRoom.height
              ? y + 1
              : y;
          if (tiles[corridorY]?.[corridorX] === CORRIDOR_TILE) {
            stationaryDoorConnections.push({
              doorPosition: y * dungeon.width + x,
              doorTile: tile,
              corridorPosition: corridorY * dungeon.width + corridorX,
            });
          }
          const verticalDoorway = x === ownerRoom.x - 1 || x === ownerRoom.x + ownerRoom.width;
          const sideOffsets: Point[] = verticalDoorway
            ? [[0, -1], [0, 1]]
            : [[-1, 0], [1, 0]];
          for (const [offsetX, offsetY] of sideOffsets) {
            const sideX = x + offsetX;
            const sideY = y + offsetY;
            const sideTile = dungeon.tiles[sideY]?.[sideX];
            if (
              sideTile === WALL
              || sideTile === CAVE_CONNECTION_WALL_TILE
            ) {
              protectedDoorSidePositions.add(sideY * dungeon.width + sideX);
            }
          }
        }
        if (!ownerRoom || movedRoomNumbers.has(ownerRoom.number)) {
          tiles[y][x] = WALL;
        }
        continue;
      }
      if (corridorTrapTiles.has(tile)) {
        const isCaveFloor = dungeon.algorithm === "cellular"
          || tiles.slice(Math.max(0, y - 1), y + 2).some((row) => (
            row.slice(Math.max(0, x - 1), x + 2).includes(CAVE_TILE)
          ));
        tiles[y][x] = isCaveFloor ? CAVE_TILE : WALL;
        continue;
      }
      if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE) {
        const belongsToRoom = dungeon.roomDetails.some((room) => (
          x >= room.x
          && x < room.x + room.width
          && y >= room.y
          && y < room.y + room.height
        ));
        if (!belongsToRoom) {
          corridorStairs.push(tile);
          tiles[y][x] = WALL;
        }
        continue;
      }
      if (tile === CORRIDOR_TILE) continue;
      if (
        tile === CAVE_CONNECTION_WALL_TILE
        || tile === EXTERIOR_ENTRANCE_TILE
        || tile === EXTERIOR_CONNECTION_TILE
      ) {
        tiles[y][x] = WALL;
      }
    }
  }

  for (const room of dungeon.roomDetails) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        tiles[y][x] = WALL;
      }
    }
  }
  for (const [roomIndex, room] of rooms.entries()) {
    const template = roomTemplates[roomIndex];
    for (let offsetY = 0; offsetY < room.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < room.width; offsetX += 1) {
        tiles[room.y + offsetY][room.x + offsetX] = template[offsetY][offsetX];
      }
    }
  }

  const roomAt = new Int16Array(dungeon.width * dungeon.height).fill(-1);
  for (const [roomIndex, room] of rooms.entries()) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        roomAt[y * dungeon.width + x] = roomIndex;
      }
    }
  }
  const getRoomExits = (roomIndex: number): Array<{ position: number; roomPositions: number[] }> => {
    const room = rooms[roomIndex];
    const exits = new Map<number, Set<number>>();
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (!roomSurfaceTiles.has(tiles[y][x])) continue;
        for (const [deltaX, deltaY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 1 || nextY < 1 || nextX >= dungeon.width - 1 || nextY >= dungeon.height - 1) continue;
          const nextPosition = nextY * dungeon.width + nextX;
          const nextRoomIndex = roomAt[nextPosition];
          const hasOpeningToOutside = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
            .some(([outsideX, outsideY]) => {
              const x = nextX + outsideX;
              const y = nextY + outsideY;
              const position = y * dungeon.width + x;
              return roomAt[position] === -1
                && (tiles[y]?.[x] === WALL || tiles[y]?.[x] === FLOOR_TILE);
            });
          const isRoomBoundary = nextRoomIndex === roomIndex
            && tiles[nextY][nextX] === WALL
            && (
              nextX === room.x
              || nextX === room.x + room.width - 1
              || nextY === room.y
              || nextY === room.y + room.height - 1
            )
            && hasOpeningToOutside;
          const isOpenRoute = nextRoomIndex === -1
            && (
              tiles[nextY][nextX] === WALL
              || tiles[nextY][nextX] === FLOOR_TILE
              || tiles[nextY][nextX] === CORRIDOR_TILE
              || tiles[nextY][nextX] === DOOR_TILE
              || tiles[nextY][nextX] === SECRET_DOOR_TILE
            );
          if (!isRoomBoundary && !isOpenRoute) continue;
          const roomPositions = exits.get(nextPosition) ?? new Set<number>();
          roomPositions.add(y * dungeon.width + x);
          exits.set(nextPosition, roomPositions);
        }
      }
    }
    return [...exits.entries()].map(([position, roomPositions]) => ({
      position,
      roomPositions: [...roomPositions],
    }));
  };

  const getReachableCells = (): Uint8Array => {
    const cellCount = dungeon.width * dungeon.height;
    const reachable = new Uint8Array(cellCount);
    const queue = new Int32Array(cellCount);
    let tail = 0;
    const firstRoom = rooms[0];
    for (let y = firstRoom.y; y < firstRoom.y + firstRoom.height; y += 1) {
      for (let x = firstRoom.x; x < firstRoom.x + firstRoom.width; x += 1) {
        const position = y * dungeon.width + x;
        if (
          reachable[position]
          || tiles[y][x] === WALL
          || tiles[y][x] === CAVE_CONNECTION_WALL_TILE
          || tiles[y][x] === CAVE_TILE
          || isCaveLiquidTile(tiles[y][x])
          || tiles[y][x] === PILLAR_TILE
        ) continue;
        reachable[position] = 1;
        queue[tail] = position;
        tail += 1;
      }
    }

    for (let head = 0; head < tail; head += 1) {
      const position = queue[head];
      const x = position % dungeon.width;
      const y = Math.floor(position / dungeon.width);
      for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nextX < 0 || nextY < 0 || nextX >= dungeon.width || nextY >= dungeon.height) continue;
        const nextPosition = nextY * dungeon.width + nextX;
        const tile = tiles[nextY][nextX];
        if (
          reachable[nextPosition]
          || tile === WALL
          || tile === CAVE_CONNECTION_WALL_TILE
          || tile === CAVE_TILE
          || isCaveLiquidTile(tile)
          || tile === PILLAR_TILE
        ) continue;
        reachable[nextPosition] = 1;
        queue[tail] = nextPosition;
        tail += 1;
      }
    }
    return reachable;
  };

  const isRoomReachable = (room: DungeonRoom, reachable: Uint8Array): boolean => {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (reachable[y * dungeon.width + x] && tiles[y][x] !== PILLAR_TILE) return true;
      }
    }
    return false;
  };

  const routeRooms = (
    sourceRoom: number,
    targetRoom: number,
    reachable: Uint8Array,
  ): boolean => {
    const sourceExits = getRoomExits(sourceRoom)
      .filter((exit) => exit.roomPositions.some((position) => reachable[position]));
    const targetExits = getRoomExits(targetRoom);
    const targetExitPositions = new Set(targetExits.map((exit) => exit.position));
    if (sourceExits.length === 0 || targetExits.length === 0) return false;

    const cellCount = dungeon.width * dungeon.height;
    const previous = new Int32Array(cellCount).fill(-1);
    const queue = new Int32Array(cellCount);
    let tail = 0;
    for (const { position } of sourceExits) {
      if (previous[position] !== -1) continue;
      previous[position] = position;
      queue[tail] = position;
      tail += 1;
    }

    let destination = -1;
    for (let head = 0; head < tail; head += 1) {
      const position = queue[head];
      if (targetExitPositions.has(position)) {
        destination = position;
        break;
      }
      const x = position % dungeon.width;
      const y = Math.floor(position / dungeon.width);
      for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nextX < 1 || nextY < 1 || nextX >= dungeon.width - 1 || nextY >= dungeon.height - 1) continue;
        const nextPosition = nextY * dungeon.width + nextX;
        if (
          previous[nextPosition] !== -1
          || protectedDoorSidePositions.has(nextPosition)
        ) continue;
        if (roomAt[nextPosition] !== -1 && !targetExitPositions.has(nextPosition)) continue;
        const tile = tiles[nextY][nextX];
        if (
          tile !== WALL
          && tile !== FLOOR_TILE
          && tile !== CORRIDOR_TILE
          && tile !== DOOR_TILE
          && tile !== SECRET_DOOR_TILE
        ) continue;
        previous[nextPosition] = position;
        queue[tail] = nextPosition;
        tail += 1;
      }
    }
    if (destination < 0) return false;

    const path: number[] = [];
    for (let position = destination; ; position = previous[position]) {
      path.push(position);
      if (previous[position] === position) break;
    }
    path.reverse();
    const corridorWidth = Math.max(1, Math.min(3, dungeon.corridorWidth));
    for (let index = 0; index < path.length; index += 1) {
      const position = path[index];
      const x = position % dungeon.width;
      const y = Math.floor(position / dungeon.width);
      const next = path[index + 1] ?? path[index - 1];
      const horizontal = next === undefined || Math.floor(next / dungeon.width) === y;
      const isEndpoint = index === 0 || index === path.length - 1;
      for (let offset = 0; offset < corridorWidth; offset += 1) {
        const shift = offset - Math.floor((corridorWidth - 1) / 2);
        const corridorX = x + (horizontal ? 0 : shift);
        const corridorY = y + (horizontal ? shift : 0);
        const corridorPosition = corridorY * dungeon.width + corridorX;
        if (protectedDoorSidePositions.has(corridorPosition)) continue;
        if (roomAt[corridorPosition] !== -1 && !(isEndpoint && offset === 0)) continue;
        if (tiles[corridorY]?.[corridorX] === WALL) tiles[corridorY][corridorX] = CORRIDOR_TILE;
      }
    }
    return true;
  };

  const connectUnreachableRooms = (): boolean => {
    let reachable = getReachableCells();
    while (true) {
      const connectedRooms = rooms
        .map((room, index) => (isRoomReachable(room, reachable) ? index : -1))
        .filter((index) => index >= 0);
      const pendingRooms = rooms
        .map((_, index) => index)
        .filter((index) => !connectedRooms.includes(index));
      if (pendingRooms.length === 0) return true;

      let shortestDistance = Number.POSITIVE_INFINITY;
      let sourceRoom = -1;
      let targetRoom = -1;
      for (const connectedRoom of connectedRooms) {
        const first = rooms[connectedRoom];
        const firstX = first.x + first.width / 2;
        const firstY = first.y + first.height / 2;
        for (const candidate of pendingRooms) {
          const second = rooms[candidate];
          const distance = Math.abs(firstX - second.x - second.width / 2)
            + Math.abs(firstY - second.y - second.height / 2);
          if (distance < shortestDistance) {
            shortestDistance = distance;
            sourceRoom = connectedRoom;
            targetRoom = candidate;
          }
        }
      }
      if (sourceRoom < 0 || targetRoom < 0 || !routeRooms(sourceRoom, targetRoom, reachable)) return false;
      reachable = getReachableCells();
      if (!isRoomReachable(rooms[targetRoom], reachable)) return false;
    }
  };
  const pruneRedundantCorridors = (): number[] => {
    const cellCount = dungeon.width * dungeon.height;
    const previous = new Int32Array(cellCount).fill(-1);
    const queue = new Int32Array(cellCount);
    let tail = 0;
    const firstRoom = rooms[0];
    for (let y = firstRoom.y; y < firstRoom.y + firstRoom.height; y += 1) {
      for (let x = firstRoom.x; x < firstRoom.x + firstRoom.width; x += 1) {
        const position = y * dungeon.width + x;
        const tile = tiles[y][x];
        if (
          previous[position] !== -1
          || tile === WALL
          || tile === CAVE_CONNECTION_WALL_TILE
          || tile === CAVE_TILE
          || isCaveLiquidTile(tile)
          || tile === PILLAR_TILE
        ) continue;
        previous[position] = position;
        queue[tail] = position;
        tail += 1;
      }
    }

    for (let head = 0; head < tail; head += 1) {
      const position = queue[head];
      const x = position % dungeon.width;
      const y = Math.floor(position / dungeon.width);
      for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nextX < 0 || nextY < 0 || nextX >= dungeon.width || nextY >= dungeon.height) continue;
        const nextPosition = nextY * dungeon.width + nextX;
        const tile = tiles[nextY][nextX];
        if (
          previous[nextPosition] !== -1
          || tile === WALL
          || tile === CAVE_CONNECTION_WALL_TILE
          || tile === CAVE_TILE
          || isCaveLiquidTile(tile)
          || tile === PILLAR_TILE
        ) continue;
        previous[nextPosition] = position;
        queue[tail] = nextPosition;
        tail += 1;
      }
    }

    const retainedCorridors = new Uint8Array(cellCount);
    const retainPath = (position: number): void => {
      if (position < 0 || position >= cellCount || previous[position] < 0) return;
      for (let current = position; ; current = previous[current]) {
        const currentX = current % dungeon.width;
        const currentY = Math.floor(current / dungeon.width);
        if (tiles[currentY][currentX] === CORRIDOR_TILE) {
          retainedCorridors[current] = 1;
          const parent = previous[current];
          const parentY = Math.floor(parent / dungeon.width);
          const horizontal = parent === current || parentY === currentY;
          const corridorWidth = Math.max(1, Math.min(3, dungeon.corridorWidth));
          for (let offset = 0; offset < corridorWidth; offset += 1) {
            const shift = offset - Math.floor((corridorWidth - 1) / 2);
            const corridorX = currentX + (horizontal ? 0 : shift);
            const corridorY = currentY + (horizontal ? shift : 0);
            const corridorPosition = corridorY * dungeon.width + corridorX;
            if (tiles[corridorY]?.[corridorX] === CORRIDOR_TILE) {
              retainedCorridors[corridorPosition] = 1;
            }
          }
        }
        if (previous[current] === current) break;
      }
    };

    for (const room of rooms) {
      let roomPosition = -1;
      for (let y = room.y; y < room.y + room.height && roomPosition < 0; y += 1) {
        for (let x = room.x; x < room.x + room.width; x += 1) {
          const position = y * dungeon.width + x;
          if (previous[position] >= 0 && tiles[y][x] !== PILLAR_TILE) {
            roomPosition = position;
            break;
          }
        }
      }
      if (roomPosition >= 0) retainPath(roomPosition);
    }

    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        const position = y * dungeon.width + x;
        const tile = tiles[y][x];
        if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
          const ownerRoom = rooms.find((room) => doorBelongsToRoom(room, x, y));
          if (ownerRoom) {
            const outsideX = x === ownerRoom.x - 1
              ? x - 1
              : x === ownerRoom.x + ownerRoom.width
                ? x + 1
                : x;
            const outsideY = y === ownerRoom.y - 1
              ? y - 1
              : y === ownerRoom.y + ownerRoom.height
                ? y + 1
                : y;
            retainPath(outsideY * dungeon.width + outsideX);
          }
        }
        if (
          (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE)
          && roomAt[position] === -1
        ) {
          retainPath(position);
        }
        if (tile === EXTERIOR_ENTRANCE_TILE || tile === EXTERIOR_CONNECTION_TILE) {
          retainPath(position);
        }
      }
    }

    const removedCorridors: number[] = [];
    for (let position = 0; position < cellCount; position += 1) {
      if (!retainedCorridors[position]) {
        const x = position % dungeon.width;
        const y = Math.floor(position / dungeon.width);
        if (tiles[y][x] === CORRIDOR_TILE) {
          tiles[y][x] = WALL;
          removedCorridors.push(position);
        }
      }
    }
    return removedCorridors;
  };
  if (!connectUnreachableRooms()) return null;

  if (exteriorAccessTile !== undefined && rooms[0]) {
    carveExteriorAccess(tiles, rooms[0], exteriorAccessTile);
  }
  if (tiles.some((row) => row.includes(CAVE_TILE))) {
    placeCaveConnectionWalls(
      tiles,
      rooms,
      createRandom(dungeon.seed ^ 0xc2b2ae35),
    );
  }
  for (const position of protectedDoorSidePositions) {
    const x = position % dungeon.width;
    const y = Math.floor(position / dungeon.width);
    tiles[y][x] = WALL;
  }
  removeInvalidDoors(
    tiles,
    rooms,
    dungeon.corridorWidth,
    dungeon.doubleDoorsEnabled,
  );
  const doorRoomsAfterCleanup = new Set<number>();
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (tiles[y][x] !== DOOR_TILE && tiles[y][x] !== SECRET_DOOR_TILE) continue;
      const ownerRoom = rooms.find((room) => doorBelongsToRoom(room, x, y));
      if (ownerRoom) doorRoomsAfterCleanup.add(ownerRoom.number);
    }
  }
  const roomsNeedingDoors = rooms.filter((room) => (
    room.number > 1
    && (
      movedRoomNumbers.has(room.number)
      || (
        roomsWithDoorsBeforeMove.has(room.number)
        && !doorRoomsAfterCleanup.has(room.number)
      )
    )
  ));
  if (roomsNeedingDoors.length > 0) {
    const stationaryDoorRoomIndexes = new Set(
      roomsNeedingDoors
        .flatMap((room, index) => (
          !movedRoomNumbers.has(room.number)
          && roomsWithDoorsBeforeMove.has(room.number)
            ? [index + 1]
            : []
        )),
    );
    placeDoors(
      tiles,
      [rooms[0], ...roomsNeedingDoors],
      createRandom(dungeon.seed ^ 0x85ebca6b),
      dungeon.corridorWidth,
      dungeon.doubleDoorsEnabled,
      stationaryDoorRoomIndexes,
    );
  }
  const stairRandom = createRandom(dungeon.seed ^ 0x27d4eb2f);
  for (const stairTile of corridorStairs) {
    const position = findCorridorStairPosition(
      tiles,
      undefined,
      stairRandom,
      dungeon.corridorWidth,
    );
    if (!position) break;
    tiles[position[1]][position[0]] = stairTile;
  }
  const removedCorridors = pruneRedundantCorridors();
  let reachableCorridorCells = getReachableCells();
  const lostStationaryDoor = stationaryDoorConnections.some(({ doorPosition, doorTile, corridorPosition }) => (
    tiles[Math.floor(doorPosition / dungeon.width)][doorPosition % dungeon.width] !== doorTile
    || tiles[Math.floor(corridorPosition / dungeon.width)][corridorPosition % dungeon.width] !== CORRIDOR_TILE
  ));
  if (
    lostStationaryDoor
    || rooms.some((room) => !isRoomReachable(room, reachableCorridorCells))
  ) {
    for (const position of removedCorridors) {
      const x = position % dungeon.width;
      const y = Math.floor(position / dungeon.width);
      tiles[y][x] = CORRIDOR_TILE;
    }
    for (const { doorPosition, doorTile, corridorPosition } of stationaryDoorConnections) {
      tiles[Math.floor(doorPosition / dungeon.width)][doorPosition % dungeon.width] = doorTile;
      tiles[Math.floor(corridorPosition / dungeon.width)][corridorPosition % dungeon.width] = CORRIDOR_TILE;
    }
    reachableCorridorCells = getReachableCells();
  }
  if (rooms.some((room) => !isRoomReachable(room, reachableCorridorCells))) return null;
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (
        tiles[y][x] === CORRIDOR_TILE
        && !reachableCorridorCells[y * dungeon.width + x]
      ) {
        tiles[y][x] = WALL;
      }
    }
  }
  const traps = placeCorridorTraps(
    tiles,
    createRandom(dungeon.seed),
    dungeon.trapCategoryWeights,
    dungeon.corridorTrapChancePercent,
  );

  let floorCount = 0;
  for (const row of tiles) {
    for (const tile of row) {
      if (tile !== WALL && tile !== CAVE_CONNECTION_WALL_TILE) floorCount += 1;
    }
  }
  return {
    ...dungeon,
    tiles,
    traps,
    roomDetails: rooms.map((room) => ({
      ...room,
      centerX: room.x + room.width / 2,
      centerY: room.y + room.height / 2,
    })),
    floorCount,
  };
}

export function getDimensionValidationMessage(
  width: number,
  height: number,
): string | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return "Informe largura e altura como números inteiros.";
  }
  if (width < MIN_DUNGEON_DIMENSION || height < MIN_DUNGEON_DIMENSION) {
    return `Cada dimensão deve ter pelo menos ${MIN_DUNGEON_DIMENSION} tiles.`;
  }
  if (width > MAX_DUNGEON_WIDTH) {
    return `A largura máxima é ${MAX_DUNGEON_WIDTH.toLocaleString("pt-BR")} tiles.`;
  }
  if (height > MAX_DUNGEON_HEIGHT) {
    return `A altura máxima é ${MAX_DUNGEON_HEIGHT.toLocaleString("pt-BR")} tiles.`;
  }
  if (width * height > MAX_DUNGEON_TILE_COUNT) {
    return `A área máxima é ${MAX_DUNGEON_TILE_COUNT.toLocaleString("pt-BR")} tiles.`;
  }
  return undefined;
}

export function redistributeFrequencies<T extends string>(
  frequencies: Record<T, number>,
  keys: readonly T[],
  selectedKey: T,
  selectedValue: number,
): Record<T, number> {
  const otherKeys = keys.filter((key) => key !== selectedKey);
  const otherTotal = otherKeys.reduce((total, key) => total + frequencies[key], 0);
  const remaining = 100 - selectedValue;
  const allocations = otherKeys.map((key) => {
    const exactValue = otherTotal === 0 ? remaining / otherKeys.length : remaining * frequencies[key] / otherTotal;
    return { key, value: Math.floor(exactValue), remainder: exactValue % 1 };
  });
  let unallocated = remaining - allocations.reduce((total, entry) => total + entry.value, 0);
  const remainderOrder = [...allocations].sort((left, right) => right.remainder - left.remainder);
  for (const entry of remainderOrder) { if (unallocated <= 0) break; entry.value += 1; unallocated -= 1; }
  const updated: Record<T, number> = { ...frequencies };
  updated[selectedKey] = selectedValue;
  for (const allocation of allocations) updated[allocation.key] = allocation.value;
  return updated;
}

export function getFrequencyPercentages<T extends string>(
  weights: Record<T, number>,
  keys: readonly T[],
): Record<T, number> {
  const total = keys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
  const allocations = keys.map((key) => {
    const exactValue = total === 0 ? 100 / keys.length : 100 * Math.max(0, weights[key]) / total;
    return { key, value: Math.floor(exactValue), remainder: exactValue % 1 };
  });
  let unallocated = 100 - allocations.reduce((sum, allocation) => sum + allocation.value, 0);
  for (const allocation of [...allocations].sort((left, right) => right.remainder - left.remainder)) {
    if (unallocated <= 0) break; allocation.value += 1; unallocated -= 1;
  }
  const percentages: Record<T, number> = { ...weights };
  for (const allocation of allocations) percentages[allocation.key] = allocation.value;
  return percentages;
}

export const rotatableRoomShapes: ReadonlySet<RoomShape> = new Set(["lShaped", "tShaped", "crossShaped"]);

const roomTrapTypes = TRAP_TYPES.filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor");

export function getEnvironmentalRoomTrapChance(weights: TrapCategoryWeights): number {
  const availableCategories = TRAP_CATEGORY_ORDER.filter((category) => roomTrapTypes.some((type) => TRAP_DEFINITIONS[type].category === category));
  const totalWeight = availableCategories.reduce((total, category) => (Number.isFinite(weights[category]) && weights[category] > 0 ? total + weights[category] : total), 0);
  if (totalWeight === 0) return 0;
  const environmentalWeight = (["environmental", "biological"] as const).reduce((total, category) => (availableCategories.includes(category) && Number.isFinite(weights[category]) && weights[category] > 0 ? total + weights[category] : total), 0);
  return 25 * environmentalWeight / totalWeight;
}
