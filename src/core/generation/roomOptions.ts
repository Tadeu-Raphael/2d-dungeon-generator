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

export const DEFAULT_DUNGEON_DIMENSIONS = {
  width: 64,
  height: 48,
  roomCount: 12,
} as const;
