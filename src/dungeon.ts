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

export type Algorithm =
  | "bsp"
  | "cellular"
  | "drunkard"
  | "hybrid"
  | "bsp-cellular"
  | "bsp-drunkard";
export type Tile =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
  | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58
  | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78
  | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90
  | 91 | 92 | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100 | 101 | 102 | 103 | 104 | 105
  | 106 | 107 | 108 | 109 | 110 | 111 | 112 | 113 | 114 | 115 | 116 | 117
  | 118 | 119 | 120 | 121 | 122 | 123 | 124 | 125 | 126 | 127 | 128 | 129
  | 130 | 131 | 132 | 133 | 134 | 135 | 136 | 137 | 138 | 139 | 140 | 141 | 142 | 143 | 144
  | 145 | 146 | 147 | 148 | 149 | 150 | 151 | 152 | 153 | 154 | 155 | 156 | 157 | 158 | 159 | 160;
export type RoomShape =
  | "rectangular"
  | "square"
  | "round"
  | "elliptical"
  | "octagonal"
  | "lShaped"
  | "tShaped"
  | "crossShaped"
  | "ringShaped"
  | "irregular"
  | "columns"
  | "alcoves"
  | "multiLevel";
export type RectangularRoomRatioKey =
  | "square"
  | "slightlyElongated"
  | "elongated"
  | "veryElongated"
  | "gallery";
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
  mechanical: "Mecânicas",
  environmental: "Ambientais",
  magical: "Mágicas",
  capture: "Captura e contenção",
  deception: "Percepção e engano",
  motion: "Sonoras e de movimento",
  biological: "Biológicas",
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
export const DOOR_TILE: Tile = 3;
export const FLOOR_TILE: Tile = 1;
export const CAVE_TILE: Tile = 50;
export const CAVE_CONNECTION_WALL_TILE: Tile = 51;
export const CAVE_BREACH_TILE: Tile = 52;
export const CAVE_WATER_TILE: Tile = 53;
export const CAVE_LAVA_TILE: Tile = 54;
export const CAVE_WATERFALL_TILE: Tile = 55;
export const CAVE_LAVA_FALL_TILE: Tile = 56;
export const CAVE_SPRING_TILE: Tile = 57;
export const CAVE_LAVA_VENT_TILE: Tile = 58;
export const STAIRS_UP_TILE: Tile = 4;
export const STAIRS_DOWN_TILE: Tile = 5;
export const SECRET_DOOR_TILE: Tile = 6;
export const EXTERIOR_ENTRANCE_TILE: Tile = 7;
export const EXTERIOR_CONNECTION_TILE: Tile = 8;
export const PILLAR_TILE: Tile = 9;
export const ELEVATED_FLOOR_TILE: Tile = 48;
export const ROOM_STAIRS_TILE: Tile = 49;
export const WATER_TILE: Tile = 10;
export const LAVA_TILE: Tile = 11;
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
  hiddenPit: { tile: 12, label: "Fosso oculto", description: "Uma seção do chão se abre, fazendo a vítima cair.", category: "mechanical" },
  spikedPit: { tile: 13, label: "Fosso com estacas", description: "Uma queda em um buraco repleto de estacas.", category: "mechanical" },
  falseFloor: { tile: 14, label: "Piso falso", description: "O chão cede sob o peso de quem passa.", category: "mechanical" },
  wallBlades: { tile: 15, label: "Lâminas nas paredes", description: "Lâminas saem de aberturas laterais.", category: "mechanical" },
  pendulumBlade: { tile: 16, label: "Pêndulo cortante", description: "Uma lâmina balança pelo corredor.", category: "mechanical" },
  spinningBlades: { tile: 17, label: "Lâminas giratórias", description: "Discos afiados emergem do chão ou das paredes.", category: "mechanical" },
  poisonDarts: { tile: 18, label: "Dardos envenenados", description: "Dardos são disparados de pequenas aberturas.", category: "mechanical" },
  wallArrows: { tile: 19, label: "Flechas nas paredes", description: "Um mecanismo dispara flechas ao detectar alguém.", category: "mechanical" },
  hiddenHarpoons: { tile: 20, label: "Arpões ocultos", description: "Ganchos são lançados contra intrusos.", category: "mechanical" },
  ceilingPress: { tile: 21, label: "Prensa de teto", description: "O teto desce, esmagando quem estiver embaixo.", category: "mechanical" },
  crushingWalls: { tile: 22, label: "Paredes esmagadoras", description: "Duas paredes se aproximam até comprimirem o espaço.", category: "mechanical" },
  guillotineDoor: { tile: 23, label: "Porta guilhotina", description: "Uma lâmina cai quando alguém atravessa uma passagem.", category: "mechanical" },
  retractableStairs: { tile: 24, label: "Escada retrátil", description: "Degraus desaparecem ou se soltam sob os pés.", category: "mechanical" },
  destructibleBridge: { tile: 25, label: "Ponte destrutível", description: "A estrutura desaba quando alguém a atravessa.", category: "mechanical" },
  grindingGears: { tile: 26, label: "Engrenagens trituradoras", description: "Um piso cede e arrasta a vítima para um mecanismo.", category: "mechanical" },
  capturingChains: { tile: 27, label: "Correntes capturadoras", description: "Correntes prendem braços, pernas ou o corpo inteiro.", category: "capture" },
  droppingCage: { tile: 28, label: "Gaiola suspensa", description: "Uma estrutura cai sobre o alvo, aprisionando-o.", category: "capture" },
  counterweightTrapdoor: { tile: 29, label: "Alçapão com contrapeso", description: "A vítima é deslocada para outra parte da dungeon.", category: "mechanical" },
  floodedRoom: { tile: 30, label: "Sala inundável", description: "Água começa a preencher uma sala fechada.", category: "environmental", placement: "room" },
  floodedCorridor: { tile: 31, label: "Corredor inundado", description: "O nível da água sobe enquanto os personagens avançam.", category: "environmental", placement: "corridor" },
  vacuumChamber: { tile: 32, label: "Câmara de vácuo", description: "Uma sala mágica ou artificial remove o ar respirável.", category: "magical", placement: "room" },
  poisonGas: { tile: 33, label: "Gás venenoso", description: "Uma substância tóxica é liberada no ambiente.", category: "environmental" },
  hallucinogenicGas: { tile: 34, label: "Gás alucinógeno", description: "Os personagens passam a perceber ilusões.", category: "magical" },
  corrosiveCloud: { tile: 35, label: "Nuvem corrosiva", description: "Uma névoa danifica criaturas e equipamentos.", category: "environmental" },
  slipperyFloor: { tile: 36, label: "Chão escorregadio", description: "Óleo, gelo ou limo dificulta a movimentação.", category: "environmental" },
  thinIceFloor: { tile: 37, label: "Piso de gelo fino", description: "O chão quebra sob determinado peso.", category: "environmental" },
  fallingRocks: { tile: 38, label: "Chuva de pedras", description: "Rochas caem do teto após o acionamento.", category: "environmental" },
  caveIn: { tile: 39, label: "Desmoronamento", description: "Uma seção do teto ou da parede desaba.", category: "environmental" },
  quicksand: { tile: 40, label: "Areia movediça", description: "O terreno cede e começa a engolir quem pisa nele.", category: "environmental" },
  undergroundCurrent: { tile: 41, label: "Correnteza subterrânea", description: "A água arrasta personagens para uma passagem perigosa.", category: "environmental", placement: "corridor" },
  overheatedChamber: { tile: 42, label: "Câmara superaquecida", description: "A temperatura sobe até tornar a permanência perigosa.", category: "environmental", placement: "room" },
  freezingChamber: { tile: 43, label: "Câmara congelante", description: "O ambiente provoca frio extremo.", category: "environmental", placement: "room" },
  electrifiedFloor: { tile: 44, label: "Piso eletrificado", description: "Uma superfície metálica transmite descargas mágicas ou elétricas.", category: "environmental" },
  ceilingSpikes: { tile: 45, label: "Espinhos no teto", description: "Uma queda ou mudança de pressão faz espinhos despencarem.", category: "mechanical" },
  lavaFloor: { tile: 46, label: "Chão de lava", description: "Uma ponte ou plataforma se move sobre lava.", category: "environmental", placement: "corridor" },
  explosiveCrystals: { tile: 47, label: "Cristais explosivos", description: "Cristais reagem à presença, ao som ou ao contato.", category: "environmental" },
  explosiveRune: { tile: 59, label: "Runa explosiva", description: "Uma inscrição libera uma explosão ao ser ativada.", category: "magical" },
  protectiveGlyph: { tile: 60, label: "Glifo de proteção", description: "Uma marca mágica ataca intrusos que se aproximam.", category: "magical" },
  forcedTeleport: { tile: 61, label: "Teletransporte forçado", description: "A vítima é transportada magicamente para outro local.", category: "magical" },
  prisonTeleport: { tile: 62, label: "Teletransporte para uma prisão", description: "O alvo é enviado para uma cela distante.", category: "magical", placement: "room" },
  antimagicField: { tile: 63, label: "Campo antimagia", description: "A magia deixa de funcionar dentro de uma área.", category: "magical", placement: "room" },
  slowField: { tile: 64, label: "Campo de lentidão", description: "Os movimentos ficam extremamente lentos.", category: "magical", placement: "room" },
  gravityField: { tile: 65, label: "Campo gravitacional", description: "A gravidade aumenta, diminui ou muda de direção.", category: "magical", placement: "room" },
  weaknessCurse: { tile: 66, label: "Maldição de fraqueza", description: "A vítima sofre uma penalidade temporária.", category: "magical" },
  agingCurse: { tile: 67, label: "Maldição de envelhecimento", description: "O alvo envelhece magicamente.", category: "magical" },
  energyDrain: { tile: 68, label: "Roubo de energia", description: "A armadilha drena energia vital ou mágica.", category: "magical" },
  petrification: { tile: 69, label: "Petrificação", description: "A vítima começa a se transformar em pedra.", category: "magical" },
  forcedTransformation: { tile: 70, label: "Transformação forçada", description: "O personagem assume outra forma contra a vontade.", category: "magical" },
  dimensionalPrison: { tile: 71, label: "Aprisionamento dimensional", description: "A vítima fica presa em uma dimensão isolada.", category: "magical", placement: "room" },
  unstablePortal: { tile: 72, label: "Portal instável", description: "Uma passagem transporta o personagem para um destino imprevisível.", category: "magical", placement: "room" },
  dangerIllusion: { tile: 73, label: "Ilusão de perigo", description: "Uma ameaça ilusória parece real para quem a vê.", category: "magical" },
  duplicateIllusion: { tile: 74, label: "Duplicação ilusória", description: "Cópias ilusórias de inimigos ou aliados confundem a vítima.", category: "magical" },
  magicalSilence: { tile: 75, label: "Silêncio mágico", description: "Sons deixam de existir dentro de determinada área.", category: "magical", placement: "room" },
  inversionField: { tile: 76, label: "Campo de inversão", description: "Controles, direções ou percepções são invertidos magicamente.", category: "magical", placement: "room" },
  memoryDrain: { tile: 77, label: "Drenagem de memória", description: "A vítima perde lembranças temporariamente.", category: "magical" },
  cursedMark: { tile: 78, label: "Marca amaldiçoada", description: "A vítima é marcada e passa a ser perseguida por uma entidade.", category: "magical" },
  suspendedNet: { tile: 79, label: "Rede suspensa", description: "Uma rede cai sobre os personagens e os captura.", category: "capture" },
  ankleNoose: { tile: 80, label: "Laço no tornozelo", description: "Um mecanismo prende e suspende a vítima pelo tornozelo.", category: "capture", placement: "corridor" },
  hiddenManacles: { tile: 81, label: "Algemas ocultas", description: "Dispositivos prendem os membros ao chão ou à parede.", category: "capture", placement: "room" },
  constrictingRoots: { tile: 82, label: "Raízes constritoras", description: "Plantas ou raízes agarram e imobilizam os invasores.", category: "capture" },
  compactingSand: { tile: 83, label: "Areia compactante", description: "Uma camada de material endurece e prende quem pisa nela.", category: "capture" },
  trappingGelatin: { tile: 84, label: "Gelatina aprisionadora", description: "Uma substância envolve e imobiliza a vítima.", category: "capture" },
  silkCocoon: { tile: 85, label: "Casulo de seda", description: "Uma criatura ou mecanismo envolve o alvo em um casulo.", category: "capture" },
  magicalCage: { tile: 86, label: "Jaula mágica", description: "Uma barreira invisível impede a saída da área.", category: "capture", placement: "room" },
  thornWall: { tile: 87, label: "Parede de espinhos", description: "Espinhos surgem ao redor e limitam a movimentação.", category: "capture" },
  spectralChains: { tile: 88, label: "Correntes espectrais", description: "Correntes sobrenaturais prendem o espírito ou o corpo.", category: "capture" },
  sealedRoom: { tile: 89, label: "Sala sem saída", description: "Portas e passagens se fecham até que um mecanismo seja resolvido.", category: "capture", placement: "room" },
  sealingSarcophagus: { tile: 90, label: "Sarcófago selante", description: "Um caixão ou compartimento se fecha sobre quem o abre.", category: "capture", placement: "room" },
  mimicChest: { tile: 91, label: "Baú mimético", description: "O suposto baú é, na verdade, uma criatura.", category: "deception", placement: "room" },
  illusoryDoor: { tile: 92, label: "Porta ilusória", description: "Uma passagem aparentemente real não existe.", category: "deception", placement: "corridor" },
  illusoryWall: { tile: 93, label: "Parede ilusória", description: "Uma parede esconde uma passagem ou cria um caminho falso.", category: "deception", placement: "corridor" },
  endlessCorridor: { tile: 94, label: "Corredor infinito", description: "A vítima acredita avançar, mas permanece na mesma área.", category: "deception", placement: "corridor" },
  loopRoom: { tile: 95, label: "Sala em loop", description: "Uma porta leva repetidamente ao mesmo ambiente.", category: "deception", placement: "room" },
  illusoryFloor: { tile: 96, label: "Piso ilusório", description: "Uma superfície aparentemente sólida esconde um abismo.", category: "deception" },
  cursedTreasure: { tile: 97, label: "Tesouro amaldiçoado", description: "Um objeto valioso desencadeia uma maldição quando removido.", category: "deception", placement: "room" },
  hiddenAlarm: { tile: 98, label: "Alarme oculto", description: "O mecanismo alerta os habitantes sem causar dano direto.", category: "deception" },
  falseSound: { tile: 99, label: "Som falso", description: "Ruídos simulam monstros, passos ou pedidos de socorro.", category: "deception" },
  watchingStatues: { tile: 100, label: "Estátuas observadoras", description: "Estátuas acompanham os movimentos e acionam mecanismos.", category: "deception", placement: "room" },
  deceptiveMirror: { tile: 101, label: "Espelho enganoso", description: "O reflexo mostra uma realidade diferente.", category: "deception", placement: "room" },
  falseSigns: { tile: 102, label: "Placas falsas", description: "Símbolos ou inscrições fornecem instruções enganosas.", category: "deception" },
  falseSafeZone: { tile: 103, label: "Falsa zona segura", description: "Uma área aparentemente protegida ativa um mecanismo quando o grupo relaxa.", category: "deception", placement: "room" },
  poisonedKey: { tile: 104, label: "Chave envenenada", description: "Uma chave aparentemente normal libera uma substância nociva ao ser usada.", category: "deception", placement: "room" },
  deceptiveSwitch: { tile: 105, label: "Interruptor enganoso", description: "Um botão desativa uma armadilha, mas ativa outra.", category: "deception", placement: "room" },
  weightSensitiveFloor: { tile: 106, label: "Piso sensível ao peso", description: "O piso é ativado quando recebe determinado peso.", category: "motion" },
  pressurePlate: { tile: 107, label: "Placa sensível à pressão", description: "A pressão exercida sobre a superfície dispara um mecanismo.", category: "motion" },
  motionSensor: { tile: 108, label: "Sensor de movimento", description: "O mecanismo detecta criaturas que se movimentam na área.", category: "motion" },
  heatSensor: { tile: 109, label: "Sensor de calor", description: "O mecanismo reage à presença de corpos quentes.", category: "motion" },
  magicSensor: { tile: 110, label: "Sensor mágico", description: "O mecanismo detecta o uso ou a presença de magia.", category: "motion" },
  alarmBell: { tile: 111, label: "Sino de alarme", description: "Um sino emite um som que alerta os habitantes.", category: "motion" },
  creakingFloor: { tile: 112, label: "Piso que range", description: "O ruído do piso denuncia a posição de quem passa.", category: "motion" },
  acousticTrigger: { tile: 113, label: "Armadilha acústica", description: "Um som específico desencadeia outro mecanismo.", category: "motion" },
  resonantCrystals: { tile: 114, label: "Cristais ressonantes", description: "Cristais vibram ou explodem quando expostos a certas frequências.", category: "motion" },
  awakenedGuardian: { tile: 115, label: "Guardião despertado", description: "Ruído excessivo ativa construtos ou criaturas adormecidas.", category: "motion", placement: "room" },
  collapsingPassage: { tile: 116, label: "Passagem que desaba", description: "Vibrações intensas fazem o teto desmoronar.", category: "motion", placement: "corridor" },
  proximityDoor: { tile: 117, label: "Porta sensível à proximidade", description: "A aproximação de alguém dispara um mecanismo.", category: "motion", placement: "corridor" },
  carnivorousPlant: { tile: 118, label: "Planta carnívora", description: "Uma planta captura quem se aproxima.", category: "biological" },
  toxicSpores: { tile: 119, label: "Esporos tóxicos", description: "Uma nuvem de esporos causa efeitos nocivos.", category: "biological" },
  explosiveFungus: { tile: 120, label: "Fungo explosivo", description: "O fungo libera uma explosão quando perturbado.", category: "biological" },
  constrictingVines: { tile: 121, label: "Cipós constritores", description: "Cipós agarram e imobilizam personagens.", category: "biological" },
  insectNest: { tile: 122, label: "Ninho de insetos", description: "Uma área perturbada libera insetos agressivos.", category: "biological" },
  invisibleWeb: { tile: 123, label: "Teia invisível", description: "Uma teia prende e denuncia a localização de intrusos.", category: "biological" },
  parasiticLarvae: { tile: 124, label: "Larvas parasitas", description: "Organismos aderem ao corpo e provocam efeitos progressivos.", category: "biological" },
  defensiveHive: { tile: 125, label: "Colmeia defensiva", description: "Uma colônia ataca quem atravessa seu território.", category: "biological" },
  predatorAttractant: { tile: 126, label: "Sangue atraente", description: "Uma substância desperta ou atrai predadores.", category: "biological" },
  explosiveEgg: { tile: 127, label: "Ovo explosivo", description: "Um organismo reage violentamente ao toque.", category: "biological" },
  unstableBurrow: { tile: 128, label: "Toca instável", description: "O terreno cede e libera criaturas subterrâneas.", category: "biological" },
  controllingParasite: { tile: 129, label: "Parasita controlador", description: "Uma criatura tenta assumir o controle de seu hospedeiro.", category: "biological" },
  firingTowers: { tile: 130, label: "Torres de disparo", description: "Estruturas atacam automaticamente quem entra na área.", category: "combat", placement: "room" },
  launcherStatues: { tile: 131, label: "Estátuas lançadoras", description: "Estátuas disparam projéteis em intervalos regulares.", category: "combat", placement: "room" },
  movingPillars: { tile: 132, label: "Pilares móveis", description: "Pilares alteram o caminho e podem dividir o grupo.", category: "combat", placement: "room" },
  movingPlatforms: { tile: 133, label: "Plataformas móveis", description: "O chão se desloca e dificulta o combate.", category: "combat", placement: "room" },
  dividingWalls: { tile: 134, label: "Paredes divisórias", description: "Barreiras se erguem e separam os personagens.", category: "combat", placement: "room" },
  summoningZone: { tile: 135, label: "Zona de invocação", description: "Um círculo invoca criaturas hostis.", category: "combat", placement: "room" },
  empowermentTotem: { tile: 136, label: "Totem de fortalecimento", description: "Inimigos próximos recebem bônus enquanto o totem existir.", category: "combat", placement: "room" },
  regenerationTotem: { tile: 137, label: "Totem de regeneração", description: "Criaturas recuperam vida dentro da área do totem.", category: "combat", placement: "room" },
  repulsionField: { tile: 138, label: "Campo de repulsão", description: "Personagens são empurrados para longe de um ponto.", category: "combat", placement: "room" },
  attractionField: { tile: 139, label: "Campo de atração", description: "Criaturas são puxadas para uma região perigosa.", category: "combat", placement: "room" },
  fragmentedFloor: { tile: 140, label: "Chão fragmentado", description: "A área se divide progressivamente durante o combate.", category: "combat" },
  reinforcements: { tile: 141, label: "Armadilha de reforços", description: "O acionamento abre passagens para inimigos adicionais.", category: "combat" },
  sealedArena: { tile: 142, label: "Arena selada", description: "As saídas se fecham quando o combate começa.", category: "combat", placement: "room" },
  hostileLight: { tile: 143, label: "Iluminação hostil", description: "A luz prejudica determinados tipos de criaturas ou personagens.", category: "combat", placement: "room" },
  resourceDrain: { tile: 144, label: "Armadilha de recursos", description: "O mecanismo consome mana, munição ou outro recurso do grupo.", category: "combat" },
  timedBladeCorridor: { tile: 145, label: "Corredor de lâminas temporizadas", description: "Lâminas avançam e recuam em intervalos regulares.", category: "complex", placement: "corridor" },
  pressureChamber: { tile: 146, label: "Sala de pressão crescente", description: "A pressão aumenta até que um mecanismo seja desativado.", category: "complex", placement: "room" },
  electrifiedFloodChamber: { tile: 147, label: "Câmara de água e eletricidade", description: "A sala se inunda enquanto descargas elétricas são ativadas.", category: "complex", placement: "room" },
  movingMaze: { tile: 148, label: "Labirinto móvel", description: "Paredes mudam de posição periodicamente.", category: "complex", placement: "room" },
  mirrorChamber: { tile: 149, label: "Sala de espelhos", description: "Reflexos direcionam raios mágicos para diferentes pontos.", category: "complex", placement: "room" },
  sequencePlates: { tile: 150, label: "Sequência de placas", description: "O grupo precisa pisar nas placas na ordem correta.", category: "complex", placement: "room" },
  lightBridge: { tile: 151, label: "Ponte de luz", description: "Plataformas aparecem apenas quando iluminadas corretamente.", category: "complex", placement: "room" },
  mechanicalClock: { tile: 152, label: "Relógio mecânico", description: "Engrenagens, plataformas e portas se movem segundo um ciclo.", category: "complex", placement: "room" },
  sacrificeChamber: { tile: 153, label: "Câmara de sacrifício", description: "Um mecanismo exige um custo para liberar a saída.", category: "complex", placement: "room" },
  deadlyBalance: { tile: 154, label: "Balança mortal", description: "A distribuição de peso determina o destino do grupo.", category: "complex", placement: "room" },
  twoRoomTrap: { tile: 155, label: "Armadilha de duas salas", description: "Um mecanismo precisa ser operado enquanto alguém atravessa outra sala.", category: "complex", placement: "room" },
  runeSequence: { tile: 156, label: "Sequência de runas", description: "Símbolos precisam ser ativados em uma ordem determinada.", category: "complex", placement: "room" },
  advancingSpikes: { tile: 157, label: "Câmara de espinhos progressivos", description: "Espinhos avançam gradualmente e criam um limite de tempo.", category: "complex", placement: "room" },
  dismantlingRoom: { tile: 158, label: "Sala que se desmonta", description: "O ambiente perde partes de sua estrutura a cada rodada.", category: "complex", placement: "room" },
  defensiveVault: { tile: 159, label: "Cofre defensivo", description: "Abrir o tesouro desencadeia várias etapas de proteção.", category: "complex", placement: "room" },
  adaptiveTrap: { tile: 160, label: "Armadilha adaptativa", description: "O mecanismo modifica seu comportamento após cada tentativa.", category: "complex" },
};
export const MIN_DUNGEON_DIMENSION = 20;
export const MAX_DUNGEON_WIDTH = 160;
export const MAX_DUNGEON_HEIGHT = 120;
export const MAX_DUNGEON_ROOM_COUNT = 24;
export const MAX_DUNGEON_SEED = 4_294_967_295;

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

export interface RoomShapeFrequencies {
  rectangular: number;
  square: number;
  round: number;
  elliptical: number;
  octagonal: number;
  lShaped: number;
  tShaped: number;
  crossShaped: number;
  ringShaped: number;
  irregular: number;
  columns: number;
  alcoves: number;
  multiLevel: number;
}

export interface RoomShapeDefinition {
  key: RoomShape;
  label: string;
  characteristics: string;
  applications: string;
}

export const ROOM_SHAPE_DEFINITIONS: readonly RoomShapeDefinition[] = [
  { key: "rectangular", label: "Retangular", characteristics: "Fácil de gerar e preencher.", applications: "Quartos, depósitos e dormitórios." },
  { key: "square", label: "Quadrado", characteristics: "Proporções equilibradas.", applications: "Salas de guarda e câmaras rituais." },
  { key: "round", label: "Circular", characteristics: "Centro bem definido.", applications: "Templos, arenas e câmaras de chefes." },
  { key: "elliptical", label: "Elíptico", characteristics: "Circular, mas alongado.", applications: "Salões e auditórios." },
  { key: "octagonal", label: "Octogonal", characteristics: "Geometria arquitetônica marcante.", applications: "Santuários e salas de enigmas." },
  { key: "lShaped", label: "Em L", characteristics: "Dois espaços conectados.", applications: "Alojamentos e oficinas." },
  { key: "tShaped", label: "Em T", characteristics: "Uma área principal com ramificação.", applications: "Postos de controle e encruzilhadas." },
  { key: "crossShaped", label: "Em cruz", characteristics: "Quatro eixos de circulação.", applications: "Templos e câmaras de mecanismos." },
  { key: "ringShaped", label: "Em anel", characteristics: "Espaço central cercado por circulação.", applications: "Templos, prisões e arenas." },
  { key: "irregular", label: "Irregular", characteristics: "Contorno não uniforme.", applications: "Cavernas e ruínas." },
  { key: "columns", label: "Com colunas", characteristics: "Espaço dividido por obstáculos estruturais.", applications: "Salões e templos." },
  { key: "alcoves", label: "Com alcovas", characteristics: "Nichos nas paredes.", applications: "Bibliotecas, criptas e santuários." },
  { key: "multiLevel", label: "Multinível", characteristics: "Plataformas em alturas diferentes.", applications: "Arenas, poços e salas de máquinas." },
];

export type RoomSizeCategoryKey =
  | "micro"
  | "verySmall"
  | "small"
  | "medium"
  | "large"
  | "veryLarge"
  | "colossal";

export interface RoomSizeCategoryDefinition {
  key: RoomSizeCategoryKey;
  label: string;
  dimensions: string;
  area: string;
  usage: string;
  minDimension: number;
  maxDimension: number | null;
  minArea: number;
  maxArea: number;
}

export const ROOM_SIZE_CATEGORIES: readonly RoomSizeCategoryDefinition[] = [
  { key: "micro", label: "Micro", dimensions: "2–4 m por lado", area: "4–16 m²", usage: "Nichos, esconderijos e pequenas celas.", minDimension: 2, maxDimension: 4, minArea: 4, maxArea: 16 },
  { key: "verySmall", label: "Muito pequena", dimensions: "3–6 m por lado", area: "9–36 m²", usage: "Quartos, depósitos e criptas individuais.", minDimension: 3, maxDimension: 6, minArea: 17, maxArea: 36 },
  { key: "small", label: "Pequena", dimensions: "5–8 m por lado", area: "25–64 m²", usage: "Salas de guarda, oficinas e capelas.", minDimension: 5, maxDimension: 8, minArea: 37, maxArea: 64 },
  { key: "medium", label: "Média", dimensions: "8–12 m por lado", area: "64–144 m²", usage: "Salas de combate, laboratórios e refeitórios.", minDimension: 8, maxDimension: 12, minArea: 65, maxArea: 144 },
  { key: "large", label: "Grande", dimensions: "12–18 m por lado", area: "144–324 m²", usage: "Salões cerimoniais e arenas menores.", minDimension: 12, maxDimension: 18, minArea: 145, maxArea: 324 },
  { key: "veryLarge", label: "Muito grande", dimensions: "18–30 m por lado", area: "324–900 m²", usage: "Salões do trono e câmaras de chefes.", minDimension: 18, maxDimension: 30, minArea: 325, maxArea: 900 },
  { key: "colossal", label: "Colossal", dimensions: "30–50 m ou mais por lado", area: "900–2.500 m² ou mais", usage: "Cavernas e templos monumentais.", minDimension: 30, maxDimension: null, minArea: 901, maxArea: Number.POSITIVE_INFINITY },
];

export type RoomSizeFrequencies = Record<RoomSizeCategoryKey, number>;

export interface RectangularRoomRatioDefinition {
  key: RectangularRoomRatioKey;
  label: string;
  characteristic: string;
  example: string;
  minRatio: number;
  maxRatio: number;
  targetRatio: number;
}

export const RECTANGULAR_ROOM_RATIO_DEFINITIONS: readonly RectangularRoomRatioDefinition[] = [
  { key: "square", label: "1:1", characteristic: "Quadrada", example: "8 × 8 m", minRatio: 1, maxRatio: 1.125, targetRatio: 1 },
  { key: "slightlyElongated", label: "1,25:1", characteristic: "Ligeiramente alongada", example: "10 × 8 m", minRatio: 1.125, maxRatio: 1.375, targetRatio: 1.25 },
  { key: "elongated", label: "1,5:1", characteristic: "Alongada", example: "12 × 8 m", minRatio: 1.375, maxRatio: 1.75, targetRatio: 1.5 },
  { key: "veryElongated", label: "2:1", characteristic: "Muito alongada", example: "16 × 8 m", minRatio: 1.75, maxRatio: 3, targetRatio: 2 },
  { key: "gallery", label: "3:1 ou mais", characteristic: "Galeria ou corredor largo", example: "18 × 6 m", minRatio: 3, maxRatio: Number.POSITIVE_INFINITY, targetRatio: 3 },
];

export type RectangularRoomRatioFrequencies = Record<RectangularRoomRatioKey, number>;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NumericRange {
  min: number;
  max: number;
}

export interface RoomGenerationBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  areaRange: NumericRange;
  aspectRatioRange: NumericRange;
}

interface RoomDimensionChoice extends RoomGenerationBounds {
  width: number;
  height: number;
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
  trap?: TrapType;
  treasure?: DungeonTreasure;
}

interface GeneratedRoom extends Rect {
  shape: RoomShape;
  generationBounds: RoomGenerationBounds;
  liquidFeature?: LiquidFeature;
  liquidType?: LiquidType;
  trap?: TrapType;
  treasure?: DungeonTreasure;
}

export const DEFAULT_DUNGEON_PARAMETERS: DungeonParameters = {
  width: 64,
  height: 40,
  roomCount: 12,
  corridorWidth: 1,
  corridorCompactness: 65,
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
const WALL: Tile = 0;
const FLOOR: Tile = FLOOR_TILE;
export const CORRIDOR_TILE: Tile = 2;
const CORRIDOR = CORRIDOR_TILE;
const DOOR = DOOR_TILE;
const STAIRS_UP = STAIRS_UP_TILE;
const STAIRS_DOWN = STAIRS_DOWN_TILE;
const MIN_ROOM_SIZE = 2;
const MAX_ROOM_SIZE = 12;
const MAX_ROOM_ASPECT_RATIO = 1.5;
const MAIN_ROOM_SHARE = 0.4;
const SMALL_ROOM_BRIDGE_CHANCE = 0.05;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createGrid(width: number, height: number, tile: Tile = WALL): Tile[][] {
  return Array.from({ length: height }, () => Array<Tile>(width).fill(tile));
}

function carveRect(tiles: Tile[][], rect: Rect, tile: Tile): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      tiles[y][x] = tile;
    }
  }
}

function squareRoomBounds(room: Rect): Rect {
  const size = Math.min(room.width, room.height);
  return {
    x: room.x + Math.floor((room.width - size) / 2),
    y: room.y + Math.floor((room.height - size) / 2),
    width: size,
    height: size,
  };
}

function carveRoom(
  tiles: Tile[][],
  room: Rect,
  shape: RoomShape,
  variation: number,
  tile: Tile,
): void {
  if (shape === "rectangular" || shape === "square" || shape === "columns") {
    carveRect(tiles, room, tile);
    return;
  }

  if (shape === "multiLevel") {
    carveRect(tiles, room, tile);
    const platformWidth = Math.max(1, Math.floor(room.width * 0.45));
    const platformHeight = Math.max(1, Math.floor(room.height * 0.45));
    const platformX = room.x + Math.floor((room.width - platformWidth) / 2);
    const platformY = room.y + Math.floor((room.height - platformHeight) / 2);
    carveRect(tiles, {
      x: platformX,
      y: platformY,
      width: platformWidth,
      height: platformHeight,
    }, ELEVATED_FLOOR_TILE);
    const stairX = platformX > room.x ? platformX - 1 : platformX + platformWidth;
    const stairY = room.y + Math.floor(room.height / 2);
    if (stairX < room.x + room.width) tiles[stairY][stairX] = ROOM_STAIRS_TILE;
    return;
  }

  const centerX = room.x + (room.width - 1) / 2;
  const centerY = room.y + (room.height - 1) / 2;
  const radiusX = (shape === "round" ? Math.min(room.width, room.height) : room.width) / 2;
  const radiusY = (shape === "round" ? Math.min(room.width, room.height) : room.height) / 2;
  const orientation = Math.floor(variation / (Math.PI / 2)) % 4;

  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const deltaX = (x - centerX) / radiusX;
      const deltaY = (y - centerY) / radiusY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const angle = Math.atan2(deltaY, deltaX);
      const boundary = 0.86
        + 0.12 * Math.sin(angle * 3 + variation)
        + 0.08 * Math.cos(angle * 5 - variation * 1.7);
      const normalizedX = (x - room.x + 0.5) / room.width;
      const normalizedY = (y - room.y + 0.5) / room.height;
      const [orientedX, orientedY] = orientation === 1
        ? [normalizedY, 1 - normalizedX]
        : orientation === 2
          ? [1 - normalizedX, 1 - normalizedY]
          : orientation === 3
            ? [1 - normalizedY, normalizedX]
            : [normalizedX, normalizedY];
      let isFloor = false;
      if (shape === "round" || shape === "elliptical") {
        isFloor = distance <= 1;
      } else if (shape === "octagonal") {
        isFloor = Math.abs(deltaX) + Math.abs(deltaY) <= 1.5;
      } else if (shape === "lShaped") {
        isFloor = orientedX <= 0.38
          || orientedY >= 0.5
          || (orientedX >= 0.35 && orientedX <= 0.65 && orientedY >= 0.35 && orientedY <= 0.65);
      } else if (shape === "tShaped") {
        isFloor = orientedY <= 0.38 || (orientedX >= 0.37 && orientedX <= 0.63);
      } else if (shape === "crossShaped") {
        isFloor = Math.abs(orientedX - 0.5) <= 0.18 || Math.abs(orientedY - 0.5) <= 0.18;
      } else if (shape === "ringShaped") {
        isFloor = distance <= 1
          && (distance >= 0.55 || distance <= 0.24 || Math.abs(deltaX) <= 0.12 || Math.abs(deltaY) <= 0.12);
      } else if (shape === "alcoves") {
        const inMainRoom = normalizedX >= 0.12
          && normalizedX <= 0.88
          && normalizedY >= 0.12
          && normalizedY <= 0.88;
        const inTopOrBottomAlcove = (normalizedY < 0.12 || normalizedY > 0.88)
          && (
            (normalizedX >= 0.2 && normalizedX <= 0.36)
            || (normalizedX >= 0.64 && normalizedX <= 0.8)
          );
        const inLeftOrRightAlcove = (normalizedX < 0.12 || normalizedX > 0.88)
          && (
            (normalizedY >= 0.2 && normalizedY <= 0.36)
            || (normalizedY >= 0.64 && normalizedY <= 0.8)
          );
        isFloor = inMainRoom || inTopOrBottomAlcove || inLeftOrRightAlcove;
      } else {
        isFloor = distance <= boundary;
      }
      if (isFloor) {
        tiles[y][x] = tile;
      }
    }
  }
}

function createWeightedTargets<T extends string>(
  count: number,
  random: () => number,
  weights: readonly { key: T; frequency: number }[],
  fallback: T,
): T[] {
  const totalFrequency = weights.reduce((total, entry) => total + Math.max(0, entry.frequency), 0);
  if (totalFrequency <= 0) return Array.from({ length: count }, () => fallback);

  const allocations = weights.map((entry) => {
    const exactCount = Math.max(0, entry.frequency) / totalFrequency * count;
    return { ...entry, exactCount, tieBreak: random(), count: Math.floor(exactCount) };
  });
  let remaining = count - allocations.reduce((total, entry) => total + entry.count, 0);
  const largestRemainders = [...allocations].sort((left, right) => {
    const difference = (right.exactCount % 1) - (left.exactCount % 1);
    return difference || left.tieBreak - right.tieBreak;
  });
  for (const entry of largestRemainders) {
    if (remaining <= 0) break;
    entry.count += 1;
    remaining -= 1;
  }

  const targets: T[] = [];
  for (const entry of allocations) {
    for (let index = 0; index < entry.count; index += 1) {
      targets.push(entry.key);
    }
  }
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [targets[index], targets[swapIndex]] = [targets[swapIndex], targets[index]];
  }
  return targets;
}

function createRoomShapes(
  count: number,
  random: () => number,
  frequencies: RoomShapeFrequencies,
): RoomShape[] {
  return createWeightedTargets(
    count,
    random,
    ROOM_SHAPE_DEFINITIONS.map(({ key }) => ({ key, frequency: frequencies[key] })),
    "rectangular",
  );
}

function createRoomSizeTargets(
  count: number,
  random: () => number,
  frequencies: RoomSizeFrequencies,
): RoomSizeCategoryKey[] {
  return createWeightedTargets(
    count,
    random,
    ROOM_SIZE_CATEGORIES.map((category) => ({
      key: category.key,
      frequency: frequencies[category.key],
    })),
    "micro",
  );
}

function createRoomRatioTargets(
  count: number,
  random: () => number,
  frequencies: RectangularRoomRatioFrequencies,
): RectangularRoomRatioKey[] {
  const totalFrequency = RECTANGULAR_ROOM_RATIO_DEFINITIONS.reduce(
    (total, definition) => total + Math.max(0, frequencies[definition.key]),
    0,
  );
  if (totalFrequency <= 0) return Array.from({ length: count }, () => "square");

  return Array.from({ length: count }, () => {
    let remainingWeight = random() * totalFrequency;
    for (const definition of RECTANGULAR_ROOM_RATIO_DEFINITIONS) {
      remainingWeight -= Math.max(0, frequencies[definition.key]);
      if (remainingWeight < 0) return definition.key;
    }
    return RECTANGULAR_ROOM_RATIO_DEFINITIONS[RECTANGULAR_ROOM_RATIO_DEFINITIONS.length - 1].key;
  });
}

function chooseRoomDimensions(
  availableWidth: number,
  availableHeight: number,
  maxRoomSize: number,
  shape: RoomShape,
  categoryKey: RoomSizeCategoryKey | null,
  random: () => number,
  ratioKey?: RectangularRoomRatioKey,
): RoomDimensionChoice | null {
  const category = categoryKey === null
    ? undefined
    : ROOM_SIZE_CATEGORIES.find((entry) => entry.key === categoryKey);
  if (categoryKey !== null && !category) return null;
  const minDimension = category?.minDimension ?? MIN_ROOM_SIZE;
  const categoryMaxDimension = category?.maxDimension ?? maxRoomSize;
  const maxWidth = Math.min(availableWidth, maxRoomSize, categoryMaxDimension);
  const maxHeight = Math.min(availableHeight, maxRoomSize, categoryMaxDimension);
  const candidates: Array<{ width: number; height: number }> = [];

  for (let width = minDimension; width <= maxWidth; width += 1) {
    for (let height = minDimension; height <= maxHeight; height += 1) {
      const area = width * height;
      if (
        (category && (area < category.minArea || area > category.maxArea))
        || ((shape === "square" || shape === "round") && width !== height)
      ) continue;
      const ratio = Math.max(width, height) / Math.min(width, height);
      if (!ratioKey && ratio > MAX_ROOM_ASPECT_RATIO) continue;
      candidates.push({ width, height });
    }
  }

  if (candidates.length === 0) return null;
  let validCandidates = candidates;
  if (ratioKey) {
    const ratioDefinition = RECTANGULAR_ROOM_RATIO_DEFINITIONS.find((entry) => entry.key === ratioKey);
    if (!ratioDefinition) return null;
    const matchingCandidates = candidates.filter(({ width, height }) => {
      const ratio = Math.max(width, height) / Math.min(width, height);
      return ratio >= ratioDefinition.minRatio && ratio < ratioDefinition.maxRatio;
    });
    if (matchingCandidates.length > 0) {
      validCandidates = matchingCandidates;
    } else {
      let closestDifference = Number.POSITIVE_INFINITY;
      const closestCandidates: Array<{ width: number; height: number }> = [];
      for (const candidate of candidates) {
        const ratio = Math.max(candidate.width, candidate.height) / Math.min(candidate.width, candidate.height);
        const difference = Math.abs(ratio - ratioDefinition.targetRatio);
        if (difference < closestDifference) {
          closestDifference = difference;
          closestCandidates.length = 0;
          closestCandidates.push(candidate);
        } else if (difference === closestDifference) {
          closestCandidates.push(candidate);
        }
      }
      validCandidates = closestCandidates;
    }
  }

  const selected = validCandidates[Math.floor(random() * validCandidates.length)];
  const getRange = (valueFor: (candidate: { width: number; height: number }) => number) => (
    validCandidates.reduce(
      (range, candidate) => {
        const value = valueFor(candidate);
        return { min: Math.min(range.min, value), max: Math.max(range.max, value) };
      },
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    )
  );
  return {
    ...selected,
    minWidth: getRange((candidate) => candidate.width).min,
    maxWidth: getRange((candidate) => candidate.width).max,
    minHeight: getRange((candidate) => candidate.height).min,
    maxHeight: getRange((candidate) => candidate.height).max,
    areaRange: getRange((candidate) => candidate.width * candidate.height),
    aspectRatioRange: getRange(
      (candidate) => Math.max(candidate.width, candidate.height) / Math.min(candidate.width, candidate.height),
    ),
  };
}

function carveHorizontal(tiles: Tile[][], x1: number, x2: number, y: number, width: number): void {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      const corridorY = y + offset - Math.floor((width - 1) / 2);
      if (tiles[corridorY]?.[x] === WALL) tiles[corridorY][x] = CORRIDOR;
    }
  }
}

function carveVertical(tiles: Tile[][], y1: number, y2: number, x: number, width: number): void {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      const corridorX = x + offset - Math.floor((width - 1) / 2);
      if (tiles[y][corridorX] === WALL) tiles[y][corridorX] = CORRIDOR;
    }
  }
}

function roomCenter(room: Rect): [number, number] {
  return [Math.floor(room.x + room.width / 2), Math.floor(room.y + room.height / 2)];
}

function generateBsp(
  width: number,
  height: number,
  random: () => number,
  roomTarget: number,
  corridorWidth: number,
  corridorCompactness: number,
  roomShapeFrequencies: RoomShapeFrequencies,
  roomSizeDistributionEnabled: boolean,
  roomSizeFrequencies: RoomSizeFrequencies,
  rectangularRoomRatioFrequencies: RectangularRoomRatioFrequencies,
): {
  tiles: Tile[][];
  rooms: GeneratedRoom[];
} {
  const tiles = createGrid(width, height);
  const leaves: Rect[] = [{ x: 2, y: 2, width: width - 4, height: height - 4 }];
  const rooms: GeneratedRoom[] = [];
  const defaultAreaPerRoom = (
    DEFAULT_DUNGEON_PARAMETERS.width
    * DEFAULT_DUNGEON_PARAMETERS.height
    / DEFAULT_DUNGEON_PARAMETERS.roomCount
  );
  const areaPerRoom = width * height / Math.max(1, roomTarget);
  const requestedMaxRoomDimension = roomSizeDistributionEnabled
    ? ROOM_SIZE_CATEGORIES.reduce(
      (largest, category) => (
        roomSizeFrequencies[category.key] > 0
          ? Math.max(largest, category.maxDimension ?? MAX_ROOM_SIZE * 10)
          : largest
      ),
      MIN_ROOM_SIZE,
    )
    : MAX_ROOM_SIZE;
  const maxRoomSize = Math.min(
    MAX_ROOM_SIZE * 10,
    Math.max(
      MAX_ROOM_SIZE,
      Math.round(MAX_ROOM_SIZE * Math.sqrt(areaPerRoom / defaultAreaPerRoom)),
      requestedMaxRoomDimension,
    ),
  );
  const minRoomSize = MIN_ROOM_SIZE;
  const roomSizeTargets = roomSizeDistributionEnabled
    ? createRoomSizeTargets(roomTarget, random, roomSizeFrequencies)
    : [];

  for (let index = 0; index < leaves.length && leaves.length < roomTarget; index += 1) {
    const leaf = leaves[index];
    const canSplitHorizontally = leaf.height >= 15;
    const canSplitVertically = leaf.width >= 15;
    if (!canSplitHorizontally && !canSplitVertically) continue;

    let splitHorizontally: boolean;
    if (!canSplitHorizontally) {
      splitHorizontally = false;
    } else if (!canSplitVertically) {
      splitHorizontally = true;
    } else {
      const aspectRatio = leaf.width / leaf.height;
      if (aspectRatio > MAX_ROOM_ASPECT_RATIO) {
        splitHorizontally = false;
      } else if (aspectRatio < 1 / MAX_ROOM_ASPECT_RATIO) {
        splitHorizontally = true;
      } else {
        splitHorizontally = random() > 0.5;
      }
    }

    const dimension = splitHorizontally ? leaf.height : leaf.width;
    const minimum = Math.max(7, Math.floor(dimension * 0.3));
    const maximum = Math.min(dimension - 7, Math.ceil(dimension * 0.7));
    const split = minimum + Math.floor(random() * (maximum - minimum + 1));
    if (split < minimum || dimension - split < minimum) continue;

    if (splitHorizontally) {
      leaves.push(
        { x: leaf.x, y: leaf.y, width: leaf.width, height: split },
        { x: leaf.x, y: leaf.y + split, width: leaf.width, height: leaf.height - split },
      );
    } else {
      leaves.push(
        { x: leaf.x, y: leaf.y, width: split, height: leaf.height },
        { x: leaf.x + split, y: leaf.y, width: leaf.width - split, height: leaf.height },
      );
    }
    leaves.splice(index, 1);
    index -= 1;
  }

  const roomLeaves = leaves.filter((leaf) => (
    Math.min(leaf.width - 2, maxRoomSize) >= minRoomSize
    && Math.min(leaf.height - 2, maxRoomSize) >= minRoomSize
  ));
  const roomShapes = createRoomShapes(roomLeaves.length, random, roomShapeFrequencies);
  const rectangularRoomCount = roomShapes.filter((shape) => shape === "rectangular").length;
  const roomRatioTargets = createRoomRatioTargets(
    rectangularRoomCount,
    random,
    rectangularRoomRatioFrequencies,
  );
  let rectangularRoomIndex = 0;

  for (const [leafIndex, leaf] of roomLeaves.entries()) {
    const maxWidth = Math.min(leaf.width - 2, maxRoomSize);
    const maxHeight = Math.min(leaf.height - 2, maxRoomSize);
    const shape = roomShapes[leafIndex];
    const ratioKey = shape === "rectangular"
      ? roomRatioTargets[rectangularRoomIndex++]
      : undefined;
    let dimensions: RoomDimensionChoice | null = null;
    const requestedCategory = roomSizeTargets[leafIndex];
    if (requestedCategory) {
      const requestedIndex = ROOM_SIZE_CATEGORIES.findIndex((category) => category.key === requestedCategory);
      const fallbackCategories = [...ROOM_SIZE_CATEGORIES].sort((left, right) => (
        Math.abs(ROOM_SIZE_CATEGORIES.indexOf(left) - requestedIndex)
        - Math.abs(ROOM_SIZE_CATEGORIES.indexOf(right) - requestedIndex)
      ));
      for (const category of fallbackCategories) {
        dimensions = chooseRoomDimensions(
          maxWidth,
          maxHeight,
          maxRoomSize,
          shape,
          category.key,
          random,
          ratioKey,
        );
        if (dimensions) break;
      }
    }
    dimensions ??= chooseRoomDimensions(
      maxWidth,
      maxHeight,
      maxRoomSize,
      shape,
      null,
      random,
      ratioKey,
    );
    if (!dimensions) continue;
    const minX = leaf.x + 1;
    const maxX = leaf.x + leaf.width - dimensions.width - 1;
    const minY = leaf.y + 1;
    const maxY = leaf.y + leaf.height - dimensions.height - 1;
    const randomX = minX + Math.floor(random() * (maxX - minX + 1));
    const randomY = minY + Math.floor(random() * (maxY - minY + 1));
    const targetX = Math.max(minX, Math.min(maxX, Math.round((width - dimensions.width) / 2)));
    const targetY = Math.max(minY, Math.min(maxY, Math.round((height - dimensions.height) / 2)));
    const compactness = Math.max(0, Math.min(1, corridorCompactness / 100));
    const room: Rect = {
      x: Math.round(randomX + (targetX - randomX) * compactness),
      y: Math.round(randomY + (targetY - randomY) * compactness),
      width: dimensions.width,
      height: dimensions.height,
    };
    rooms.push({
      ...room,
      shape,
      generationBounds: {
        minWidth: dimensions.minWidth,
        maxWidth: dimensions.maxWidth,
        minHeight: dimensions.minHeight,
        maxHeight: dimensions.maxHeight,
        areaRange: dimensions.areaRange,
        aspectRatioRange: dimensions.aspectRatioRange,
      },
    });
  }

  const generatedRooms = rooms.map((room): GeneratedRoom => {
    const shape = room.shape;
    const shapedRoom = shape === "square" || shape === "round"
      ? squareRoomBounds(room)
      : room;
    carveRoom(tiles, shapedRoom, shape, random() * Math.PI * 2, FLOOR);
    return { ...shapedRoom, shape, generationBounds: room.generationBounds };
  });

  const roomIndices = generatedRooms.map((_, index) => index);
  const largestFirst = [...roomIndices].sort((left, right) => (
    generatedRooms[right].width * generatedRooms[right].height
    - generatedRooms[left].width * generatedRooms[left].height
    || left - right
  ));
  const mainRoomCount = Math.max(1, Math.ceil(generatedRooms.length * MAIN_ROOM_SHARE));
  const mainRoomIndices = largestFirst.slice(0, mainRoomCount);
  const connectedMainRoomIndices = new Set<number>(mainRoomIndices.slice(0, 1));
  const pendingMainRoomIndices = new Set(mainRoomIndices.slice(1));

  const connectRooms = (sourceIndex: number, targetIndex: number) => {
    const [sourceX, sourceY] = roomCenter(generatedRooms[sourceIndex]);
    const [targetX, targetY] = roomCenter(generatedRooms[targetIndex]);
    if (random() > 0.5) {
      carveHorizontal(tiles, sourceX, targetX, sourceY, corridorWidth);
      carveVertical(tiles, sourceY, targetY, targetX, corridorWidth);
    } else {
      carveVertical(tiles, sourceY, targetY, sourceX, corridorWidth);
      carveHorizontal(tiles, sourceX, targetX, targetY, corridorWidth);
    }
  };

  while (pendingMainRoomIndices.size > 0) {
    let shortestDistance = Number.POSITIVE_INFINITY;
    const shortestConnections: Array<[number, number]> = [];
    for (const connectedIndex of connectedMainRoomIndices) {
      const [connectedX, connectedY] = roomCenter(generatedRooms[connectedIndex]);
      for (const pendingIndex of pendingMainRoomIndices) {
        const [pendingX, pendingY] = roomCenter(generatedRooms[pendingIndex]);
        const distance = Math.abs(connectedX - pendingX) + Math.abs(connectedY - pendingY);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          shortestConnections.length = 0;
          shortestConnections.push([connectedIndex, pendingIndex]);
        } else if (distance === shortestDistance) {
          shortestConnections.push([connectedIndex, pendingIndex]);
        }
      }
    }

    const [sourceIndex, targetIndex] = shortestConnections[
      Math.floor(random() * shortestConnections.length)
    ];
    connectRooms(sourceIndex, targetIndex);
    connectedMainRoomIndices.add(targetIndex);
    pendingMainRoomIndices.delete(targetIndex);
  }

  const mainRoomSet = new Set(mainRoomIndices);
  const smallerRoomIndices = roomIndices.filter((index) => !mainRoomSet.has(index));
  let rareBridgeChildIndex: number | null = null;
  let rareBridgeParentIndex: number | null = null;
  if (smallerRoomIndices.length > 1 && random() < SMALL_ROOM_BRIDGE_CHANCE) {
    rareBridgeChildIndex = smallerRoomIndices[Math.floor(random() * smallerRoomIndices.length)];
    const [childX, childY] = roomCenter(generatedRooms[rareBridgeChildIndex]);
    rareBridgeParentIndex = smallerRoomIndices
      .filter((index) => index !== rareBridgeChildIndex)
      .reduce((closestIndex, candidateIndex) => {
        const [closestX, closestY] = roomCenter(generatedRooms[closestIndex]);
        const [candidateX, candidateY] = roomCenter(generatedRooms[candidateIndex]);
        const closestDistance = Math.abs(closestX - childX) + Math.abs(closestY - childY);
        const candidateDistance = Math.abs(candidateX - childX) + Math.abs(candidateY - childY);
        return candidateDistance < closestDistance ? candidateIndex : closestIndex;
      });
  }

  for (const smallerRoomIndex of smallerRoomIndices) {
    if (smallerRoomIndex === rareBridgeChildIndex) continue;
    let shortestDistance = Number.POSITIVE_INFINITY;
    const closestMainRoomIndices: number[] = [];
    const [targetX, targetY] = roomCenter(generatedRooms[smallerRoomIndex]);
    for (const mainRoomIndex of connectedMainRoomIndices) {
      const [sourceX, sourceY] = roomCenter(generatedRooms[mainRoomIndex]);
      const distance = Math.abs(sourceX - targetX) + Math.abs(sourceY - targetY);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestMainRoomIndices.length = 0;
        closestMainRoomIndices.push(mainRoomIndex);
      } else if (distance === shortestDistance) {
        closestMainRoomIndices.push(mainRoomIndex);
      }
    }
    const sourceIndex = closestMainRoomIndices[
      Math.floor(random() * closestMainRoomIndices.length)
    ];
    connectRooms(sourceIndex, smallerRoomIndex);
  }

  if (rareBridgeChildIndex !== null && rareBridgeParentIndex !== null) {
    connectRooms(rareBridgeParentIndex, rareBridgeChildIndex);
  }

  return { tiles, rooms: generatedRooms };
}

type Point = [number, number];

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
              && tiles[roomY][roomX] === FLOOR;
            return isOutsideRoom && touchesRoom && tiles[corridorY]?.[corridorX] === CORRIDOR;
          });
          if (!completesEntrance) continue;

          const hasSideCorridor = group.some(([groupX, groupY]) => (
            [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
          ).some(([deltaX, deltaY]) => {
            if (
              (deltaX === towardX && deltaY === towardY)
              || (deltaX === -towardX && deltaY === -towardY)
            ) return false;
            const nextX = groupX + deltaX;
            const nextY = groupY + deltaY;
            return !groupSet.has(`${nextX},${nextY}`) && tiles[nextY]?.[nextX] === CORRIDOR;
          }));
          if (hasSideCorridor) continue;

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
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
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
): void {
  const doorwayWidth = corridorWidth === 2 && !doubleDoorsEnabled
    ? 0
    : corridorWidth;
  if (doorwayWidth === 0) return;

  for (let index = 1; index < rooms.length; index += 1) {
    if (random() >= 0.8) continue;
    const candidates = findDoorwayCandidates(tiles, rooms[index], doorwayWidth)
      .filter((group) => !hasNearbyDoor(tiles, group));
    if (candidates.length === 0) continue;
    const group = candidates[Math.floor(random() * candidates.length)];
    const doorTile = random() < 0.2 ? SECRET_DOOR_TILE : DOOR;
    for (const [x, y] of group) tiles[y][x] = doorTile;
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

function placeTraps(
  rooms: GeneratedRoom[],
  random: () => number,
  weights: TrapCategoryWeights,
  chancePercent: number,
): void {
  const roomTrapTypes = TRAP_TYPES.filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor");
  for (const room of rooms) {
    if (random() >= chancePercent / 100) continue;
    const trapType = selectWeightedTrapType(roomTrapTypes, weights, random);
    if (!trapType) continue;
    room.trap = trapType;
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
      "Origem cultural: uma tradição local antiga.",
      "Material: liga metálica de procedência incomum.",
      "Qualidade artesanal: acabamento acima do padrão.",
      "Conservação: marcas de uso, mas ainda funcional.",
      "Inscrição: símbolo ou nome de um antigo proprietário.",
      "Valor histórico: associado a uma facção desaparecida.",
      "Propriedade especial: possível efeito sobrenatural, a critério da campanha.",
    ];
    const selected = new Set<string>();
    while (selected.size < 3) selected.add(selectRandomValue(attributes, random));
    details.push(...selected);
  } else if (category === "consumables") {
    details.push(
      `Quantidade: ${Math.floor(random() * 4) + 1} unidade(s).`,
      `Condição: ${selectRandomValue(qualityDescriptions, random)}.`,
    );
  } else if (category === "relics") {
    const values = ["baixo", "moderado", "alto", "excepcional"];
    details.push(
      `Valor comercial: ${selectRandomValue(values, random)}.`,
      `Valor histórico: ${selectRandomValue(values, random)}.`,
      `Valor narrativo: ${selectRandomValue(values, random)}.`,
    );
  } else if (category === "documents") {
    details.push("Pista potencial: pode conectar esta sala a outra área ou facção.");
  } else if (category === "materials") {
    details.push(
      `Quantidade: ${selectRandomValue(quantityDescriptions, random)}.`,
      `Qualidade: ${selectRandomValue(qualityDescriptions, random)}.`,
    );
  } else if (category === "creatureTrophies") {
    details.push(`Comportamento do acumulador: ${selectRandomValue(["organizado por valor ou utilidade", "acumulado aleatoriamente, sem critério aparente"], random)}.`);
  } else if (category === "cursed") {
    details.push("O risco está vinculado ao próprio objeto e pode persistir depois de retirado; não é uma armadilha de piso.");
  } else if (category === "secret" && definition.discoveryMethod) {
    details.push(`Forma de descoberta: ${definition.discoveryMethod}`);
    details.push(`Relevância: ${selectRandomValue(["objeto incomum", "pista importante", "recompensa valiosa"], random)}.`);
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
    if (random() >= roomChance / 100) continue;

    const category = selectWeightedTreasureCategory(categoryWeights, consumablesEnabled, random);
    if (!category) continue;

    const rarity = category === "magical"
      ? selectWeightedTreasureRarity(rarityWeights, random)
      : undefined;
    if (category === "magical" && !rarity) continue;

    const categoryDefinitions: readonly TreasureDefinition[] = category === "magical"
      ? TREASURE_CATALOG.magical.filter((definition) => definition.rarity === rarity)
      : TREASURE_CATALOG[category];
    const contextualDefinitions = categoryDefinitions.filter((definition) => treasureMatchesRoom(definition, room));
    const availableDefinitions = contextualDefinitions.length > 0 ? contextualDefinitions : categoryDefinitions;
    if (availableDefinitions.length === 0) continue;

    const definition = selectRandomValue(availableDefinitions, random);
    room.treasure = {
      type: definition.id as TreasureType,
      category,
      rarity,
      details: createTreasureDetails(definition, category, random),
    };
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

function findFarthestOpenPoint(tiles: Tile[][], origin: Point | undefined, random: () => number): Point | undefined {
  const candidates: Point[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === FLOOR || tiles[y][x] === CORRIDOR) candidates.push([x, y]);
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
): void {
  let upstairs = rooms.length > 0
    ? findRoomStairPosition(tiles, rooms[0], random)
    : findFarthestOpenPoint(tiles, undefined, random);
  let downstairs = rooms.length > 1
    ? findRoomStairPosition(tiles, rooms[rooms.length - 1], random)
    : findFarthestOpenPoint(tiles, upstairs, random);

  const usesExteriorAccess = rooms.length > 0 && entranceMode !== "upper-stairs";
  if (usesExteriorAccess) {
    const accessTile = entranceMode === "exterior-entrance"
      ? EXTERIOR_ENTRANCE_TILE
      : EXTERIOR_CONNECTION_TILE;
    carveExteriorAccess(tiles, rooms[0], accessTile);
  } else {
    if (!upstairs) upstairs = findFarthestOpenPoint(tiles, undefined, random);
    if (upstairs) tiles[upstairs[1]][upstairs[0]] = STAIRS_UP;
  }
  if (!downstairs) downstairs = findFarthestOpenPoint(tiles, upstairs, random);
  if (upstairs && downstairs && upstairs[0] === downstairs[0] && upstairs[1] === downstairs[1]) {
    downstairs = findFarthestOpenPoint(tiles, upstairs, random);
  }

  if (downstairs) tiles[downstairs[1]][downstairs[0]] = STAIRS_DOWN;
}

function largestFloorRegion(tiles: Tile[][]): Array<[number, number]> {
  const height = tiles.length;
  const width = tiles[0].length;
  const visited = createGrid(width, height, WALL);
  let largest: Array<[number, number]> = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (tiles[y][x] === WALL || visited[y][x] === FLOOR) continue;
      const region: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      visited[y][x] = FLOOR;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [currentX, currentY] = queue[cursor];
        region.push([currentX, currentY]);
        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ]) {
          if (tiles[nextY][nextX] !== WALL && visited[nextY][nextX] !== FLOOR) {
            visited[nextY][nextX] = FLOOR;
            queue.push([nextX, nextY]);
          }
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }
  return largest;
}

function generateCellular(
  width: number,
  height: number,
  random: () => number,
  fillPercent: number,
  iterations: number,
): Tile[][] {
  let tiles = createGrid(width, height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      tiles[y][x] = random() < fillPercent / 100 ? FLOOR : WALL;
    }
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = createGrid(width, height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if ((offsetX !== 0 || offsetY !== 0) && tiles[y + offsetY][x + offsetX] !== WALL) {
              neighbors += 1;
            }
          }
        }
        const survives = tiles[y][x] === FLOOR && neighbors >= 4;
        const isBorn = tiles[y][x] === WALL && neighbors >= 5;
        next[y][x] = survives || isBorn ? FLOOR : WALL;
      }
    }
    tiles = next;
  }

  const mainCave = largestFloorRegion(tiles);
  const connected = createGrid(width, height);
  for (const [x, y] of mainCave) connected[y][x] = FLOOR;
  return connected;
}

function generateDrunkard(
  width: number,
  height: number,
  random: () => number,
  coveragePercent: number,
): Tile[][] {
  const tiles = createGrid(width, height);
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);
  const targetFloorCount = Math.floor(width * height * coveragePercent / 100);
  let floorCount = 0;

  for (let step = 0; step < width * height * 30 && floorCount < targetFloorCount; step += 1) {
    if (tiles[y][x] === WALL) {
      tiles[y][x] = FLOOR;
      floorCount += 1;
    }
    const direction = Math.floor(random() * 4);
    if (direction === 0) x += 1;
    else if (direction === 1) x -= 1;
    else if (direction === 2) y += 1;
    else y -= 1;
    x = Math.max(1, Math.min(width - 2, x));
    y = Math.max(1, Math.min(height - 2, y));
  }

  return tiles;
}

function generateHybrid(
  width: number,
  height: number,
  seed: number,
  parameters: DungeonParameters,
  includeCellular = true,
  includeDrunkard = true,
): { tiles: Tile[][]; rooms: GeneratedRoom[] } {
  const bsp = generateBsp(
    width,
    height,
    createRandom(seed),
    parameters.roomCount,
    parameters.corridorWidth,
    parameters.corridorCompactness,
    parameters.roomShapeFrequencies,
    parameters.roomSizeDistributionEnabled,
    parameters.roomSizeFrequencies,
    parameters.rectangularRoomRatioFrequencies,
  );
  const caves = includeCellular
    ? generateCellular(
      width,
      height,
      createRandom(seed ^ 0x9e3779b9),
      parameters.cellularFillPercent,
      parameters.cellularIterations,
    )
    : null;
  const paths = includeDrunkard
    ? generateDrunkard(
      width,
      height,
      createRandom(seed ^ 0x85ebca6b),
      parameters.drunkardCoveragePercent,
    )
    : null;
  const tiles = createGrid(width, height);
  const queue: Array<[number, number]> = [];
  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bsp.tiles[y][x] !== WALL) {
        tiles[y][x] = bsp.tiles[y][x];
        visited[y][x] = true;
        queue.push([x, y]);
      }
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    for (const [nextX, nextY] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (
        nextX < 0
        || nextY < 0
        || nextX >= width
        || nextY >= height
        || visited[nextY][nextX]
      ) continue;
      const isOpenInCellular = caves === null || caves[nextY][nextX] !== WALL;
      const isOpenInDrunkard = paths === null || paths[nextY][nextX] !== WALL;
      const touchesCorridor = [
        [nextX + 1, nextY],
        [nextX - 1, nextY],
        [nextX, nextY + 1],
        [nextX, nextY - 1],
      ].some(([corridorX, corridorY]) => bsp.tiles[corridorY]?.[corridorX] === CORRIDOR_TILE);
      if (isOpenInCellular && isOpenInDrunkard && !touchesCorridor) {
        tiles[nextY][nextX] = caves === null ? FLOOR : CAVE_TILE;
        visited[nextY][nextX] = true;
        queue.push([nextX, nextY]);
      }
    }
  }
  if (caves !== null) {
    placeCaveConnectionWalls(
      tiles,
      bsp.rooms,
      createRandom(seed ^ 0xc2b2ae35),
    );
  }
  return { tiles, rooms: bsp.rooms };
}

function placeCaveConnectionWalls(
  tiles: Tile[][],
  rooms: GeneratedRoom[],
  random: () => number,
): void {
  const width = tiles[0]?.length ?? 0;
  const boundaries: Array<Map<number, [number, number]>> = [];
  for (const room of rooms) {
    const boundary = new Map<number, [number, number]>();
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (tiles[y]?.[x] !== FLOOR) continue;
        for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const wallX = x + offsetX;
          const wallY = y + offsetY;
          const isOutsideRoom = (
            wallX < room.x
            || wallX >= room.x + room.width
            || wallY < room.y
            || wallY >= room.y + room.height
          );
          if (isOutsideRoom && tiles[wallY]?.[wallX] === CAVE_TILE) {
            boundary.set(wallY * width + wallX, [wallX, wallY]);
          }
        }
      }
    }
    boundaries.push(boundary);
  }

  const boundaryKeys = new Set(boundaries.flatMap((boundary) => [...boundary.keys()]));
  for (const boundary of boundaries) {
    for (const [x, y] of boundary.values()) tiles[y][x] = WALL;
  }

  const markedWalls = new Set<number>();
  for (const boundary of boundaries) {
    const candidates = [...boundary.entries()].filter(([position, [x, y]]) => (
      !markedWalls.has(position)
      && [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([caveX, caveY]) => (
        tiles[caveY]?.[caveX] === CAVE_TILE
        && !boundaryKeys.has(caveY * width + caveX)
      ))
    ));
    if (candidates.length === 0 || random() >= 0.65) continue;
    const [position, [wallX, wallY]] = candidates[Math.floor(random() * candidates.length)];
    markedWalls.add(position);
    const connectionType = random();
    tiles[wallY][wallX] = connectionType < 0.34
      ? CAVE_TILE
      : connectionType < 0.67
        ? CAVE_CONNECTION_WALL_TILE
        : CAVE_BREACH_TILE;
  }
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
  placeStairs(tiles, roomRects, random, parameters.entranceMode);
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

  const floorCount = tiles.reduce(
    (total, row) => total + row.filter(
      (tile) => tile !== WALL && tile !== CAVE_CONNECTION_WALL_TILE,
    ).length,
    0,
  );
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
    trapCategoryWeights: parameters.trapCategoryWeights,
    roomTrapChancePercent: parameters.roomTrapChancePercent,
    corridorTrapChancePercent: parameters.corridorTrapChancePercent,
    treasureCategoryWeights: parameters.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityWeights,
    treasureChancePercent: parameters.treasureChancePercent,
    treasureConsumablesEnabled: parameters.treasureConsumablesEnabled,
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
  const roomTemplates = dungeon.roomDetails.map((room) => (
    Array.from({ length: room.height }, (_, offsetY) => (
      Array.from({ length: room.width }, (_, offsetX) => {
        const tile = dungeon.tiles[room.y + offsetY]?.[room.x + offsetX] ?? WALL;
        return roomSurfaceTiles.has(tile) ? tile : WALL;
      })
    ))
  ));
  const tiles = dungeon.tiles.map((row) => [...row]);
  let exteriorAccessTile: Tile | undefined;
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
      if (corridorTrapTiles.has(tile)) {
        const isCaveFloor = dungeon.algorithm === "cellular"
          || tiles.slice(Math.max(0, y - 1), y + 2).some((row) => (
            row.slice(Math.max(0, x - 1), x + 2).includes(CAVE_TILE)
          ));
        tiles[y][x] = isCaveFloor ? CAVE_TILE : WALL;
        continue;
      }
      if (
        tile === CORRIDOR_TILE
        || tile === CAVE_CONNECTION_WALL_TILE
        || tile === DOOR_TILE
        || tile === SECRET_DOOR_TILE
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
        if (previous[nextPosition] !== -1) continue;
        if (roomAt[nextPosition] !== -1 && !targetExitPositions.has(nextPosition)) continue;
        const tile = tiles[nextY][nextX];
        if (
          tile !== WALL
          && tile !== FLOOR_TILE
          && tile !== CORRIDOR_TILE
          && tile !== DOOR_TILE
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
        if (roomAt[corridorPosition] !== -1 && !(isEndpoint && offset === 0)) continue;
        if (tiles[corridorY]?.[corridorX] === WALL) tiles[corridorY][corridorX] = CORRIDOR_TILE;
      }
    }
    for (const endpoint of [path[0], path[path.length - 1]]) {
      const x = endpoint % dungeon.width;
      const y = Math.floor(endpoint / dungeon.width);
      if (tiles[y][x] === CORRIDOR_TILE) tiles[y][x] = DOOR_TILE;
    }
    return true;
  };

  let reachable = getReachableCells();
  while (true) {
    const connectedRooms = rooms
      .map((room, index) => (isRoomReachable(room, reachable) ? index : -1))
      .filter((index) => index >= 0);
    const pendingRooms = rooms
      .map((_, index) => index)
      .filter((index) => !connectedRooms.includes(index));
    if (pendingRooms.length === 0) break;

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
    if (sourceRoom < 0 || targetRoom < 0 || !routeRooms(sourceRoom, targetRoom, reachable)) return null;
    reachable = getReachableCells();
    if (!isRoomReachable(rooms[targetRoom], reachable)) return null;
  }

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
  const traps = placeCorridorTraps(
    tiles,
    createRandom(dungeon.seed),
    dungeon.trapCategoryWeights,
    dungeon.corridorTrapChancePercent,
  );

  const floorCount = tiles.reduce(
    (total, row) => total + row.filter(
      (tile) => tile !== WALL && tile !== CAVE_CONNECTION_WALL_TILE,
    ).length,
    0,
  );
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
