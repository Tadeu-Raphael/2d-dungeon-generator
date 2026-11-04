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
  { key: "rectangular", label: "Retangular", characteristics: "FÃ¡cil de gerar e preencher.", applications: "Quartos, depÃ³sitos e dormitÃ³rios." },
  { key: "square", label: "Quadrado", characteristics: "ProporÃ§Ãµes equilibradas.", applications: "Salas de guarda e cÃ¢maras rituais." },
  { key: "round", label: "Circular", characteristics: "Centro bem definido.", applications: "Templos, arenas e cÃ¢maras de chefes." },
  { key: "elliptical", label: "ElÃ­ptico", characteristics: "Circular, mas alongado.", applications: "SalÃµes e auditÃ³rios." },
  { key: "octagonal", label: "Octogonal", characteristics: "Geometria arquitetÃ´nica marcante.", applications: "SantuÃ¡rios e salas de enigmas." },
  { key: "lShaped", label: "Em L", characteristics: "Dois espaÃ§os conectados.", applications: "Alojamentos e oficinas." },
  { key: "tShaped", label: "Em T", characteristics: "Uma Ã¡rea principal com ramificaÃ§Ã£o.", applications: "Postos de controle e encruzilhadas." },
  { key: "crossShaped", label: "Em cruz", characteristics: "Quatro eixos de circulaÃ§Ã£o.", applications: "Templos e cÃ¢maras de mecanismos." },
  { key: "ringShaped", label: "Em anel", characteristics: "EspaÃ§o central cercado por circulaÃ§Ã£o.", applications: "Templos, prisÃµes e arenas." },
  { key: "irregular", label: "Irregular", characteristics: "Contorno nÃ£o uniforme.", applications: "Cavernas e ruÃ­nas." },
  { key: "columns", label: "Com colunas", characteristics: "EspaÃ§o dividido por obstÃ¡culos estruturais.", applications: "SalÃµes e templos." },
  { key: "alcoves", label: "Com alcovas", characteristics: "Nichos nas paredes.", applications: "Bibliotecas, criptas e santuÃ¡rios." },
  { key: "multiLevel", label: "MultinÃ­vel", characteristics: "Plataformas em alturas diferentes.", applications: "Arenas, poÃ§os e salas de mÃ¡quinas." },
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
  { key: "micro", label: "Micro", dimensions: "2â€“4 m por lado", area: "4â€“16 mÂ²", usage: "Nichos, esconderijos e pequenas celas.", minDimension: 2, maxDimension: 4, minArea: 4, maxArea: 16 },
  { key: "verySmall", label: "Muito pequena", dimensions: "3â€“6 m por lado", area: "9â€“36 mÂ²", usage: "Quartos, depÃ³sitos e criptas individuais.", minDimension: 3, maxDimension: 6, minArea: 17, maxArea: 36 },
  { key: "small", label: "Pequena", dimensions: "5â€“8 m por lado", area: "25â€“64 mÂ²", usage: "Salas de guarda, oficinas e capelas.", minDimension: 5, maxDimension: 8, minArea: 37, maxArea: 64 },
  { key: "medium", label: "MÃ©dia", dimensions: "8â€“12 m por lado", area: "64â€“144 mÂ²", usage: "Salas de combate, laboratÃ³rios e refeitÃ³rios.", minDimension: 8, maxDimension: 12, minArea: 65, maxArea: 144 },
  { key: "large", label: "Grande", dimensions: "12â€“18 m por lado", area: "144â€“324 mÂ²", usage: "SalÃµes cerimoniais e arenas menores.", minDimension: 12, maxDimension: 18, minArea: 145, maxArea: 324 },
  { key: "veryLarge", label: "Muito grande", dimensions: "18â€“30 m por lado", area: "324â€“900 mÂ²", usage: "SalÃµes do trono e cÃ¢maras de chefes.", minDimension: 18, maxDimension: 30, minArea: 325, maxArea: 900 },
  { key: "colossal", label: "Colossal", dimensions: "30â€“50 m ou mais por lado", area: "900â€“2.500 mÂ² ou mais", usage: "Cavernas e templos monumentais.", minDimension: 30, maxDimension: null, minArea: 901, maxArea: Number.POSITIVE_INFINITY },
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
  { key: "square", label: "1:1", characteristic: "Quadrada", example: "8 Ã— 8 m", minRatio: 1, maxRatio: 1.125, targetRatio: 1 },
  { key: "slightlyElongated", label: "1,25:1", characteristic: "Ligeiramente alongada", example: "10 Ã— 8 m", minRatio: 1.125, maxRatio: 1.375, targetRatio: 1.25 },
  { key: "elongated", label: "1,5:1", characteristic: "Alongada", example: "12 Ã— 8 m", minRatio: 1.375, maxRatio: 1.75, targetRatio: 1.5 },
  { key: "veryElongated", label: "2:1", characteristic: "Muito alongada", example: "16 Ã— 8 m", minRatio: 1.75, maxRatio: 3, targetRatio: 2 },
  { key: "gallery", label: "3:1 ou mais", characteristic: "Galeria ou corredor largo", example: "18 Ã— 6 m", minRatio: 3, maxRatio: Number.POSITIVE_INFINITY, targetRatio: 3 },
];

export type RectangularRoomRatioFrequencies = Record<RectangularRoomRatioKey, number>;

export const DEFAULT_DUNGEON_DIMENSIONS = {
  width: 64,
  height: 48,
  roomCount: 12,
} as const;
