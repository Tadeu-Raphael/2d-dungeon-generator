import { useEffect, useMemo, useRef, useState } from "react";
import DungeonCanvas, { DungeonExportControl } from "./DungeonCanvas";
import type { MapFocusRequest } from "./DungeonCanvas";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  CAVE_TILE,
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  CORRIDOR_TILE,
  DOOR_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  generateDungeon,
  LAVA_TILE,
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_ROOM_COUNT,
  MAX_DUNGEON_SEED,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
  PILLAR_TILE,
  repositionDungeonRooms,
  ROOM_STAIRS_TILE,
  ROOM_SHAPE_DEFINITIONS,
  ROOM_SIZE_CATEGORIES,
  RECTANGULAR_ROOM_RATIO_DEFINITIONS,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  TRAP_CATEGORY_LABELS,
  TRAP_CATEGORY_ORDER,
  TRAP_TYPES,
  WATER_TILE,
  type Dungeon,
  type DungeonRoom,
  type DungeonTrap,
  type RoomPosition,
} from "./dungeon";
import type {
  Algorithm,
  DungeonParameters,
  EntranceMode,
  RectangularRoomRatioKey,
  RoomShape,
  RoomShapeFrequencies,
  LiquidFeature,
  LiquidType,
  TrapCategory,
  TrapCategoryWeights,
  RoomSizeCategoryKey,
} from "./dungeon";
import {
  DEFAULT_TREASURE_RARITY_WEIGHTS,
  getRoomTreasureChance,
  getTreasureDefinition,
  TREASURE_CATALOG,
  TREASURE_CATEGORY_LABELS,
  TREASURE_CATEGORY_ORDER,
  TREASURE_RARITY_LABELS,
  TREASURE_RARITY_ORDER,
} from "./treasures";
import type {
  TreasureCategory,
  TreasureRarity,
} from "./treasures";
import {
  DUNGEON_CONCEPTS,
  DUNGEON_CONCEPT_ORDER,
  getDungeonGenerationAlgorithm,
  type DungeonConcept,
} from "./dungeonProfiles";
import {
  ROOM_TYPE_CATEGORY_ORDER,
  ROOM_TYPE_CATEGORIES,
  ROOM_TYPE_DEFINITIONS,
} from "./roomTypes";
import type { RoomTypeCategory } from "./roomTypes";

interface ParameterControl {
  key: Exclude<keyof DungeonParameters, "width" | "height" | "roomShapeFrequencies" | "roomSizeFrequencies" | "rectangularRoomRatioFrequencies" | "roomSizeDistributionEnabled" | "roomTypeDistributionEnabled" | "roomTypeCategoryFrequencies" | "trapCategoryDistributionEnabled" | "trapCategoryWeights" | "treasureCategoryDistributionEnabled" | "treasureCategoryWeights" | "treasureRarityDistributionEnabled" | "treasureRarityWeights" | "treasureConsumablesEnabled" | "entranceMode" | "doubleDoorsEnabled">;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

interface ShapeFrequencyControl {
  key: keyof RoomShapeFrequencies;
  label: string;
}

interface RoomSizeFrequencyControl {
  key: RoomSizeCategoryKey;
  label: string;
}

interface RoomRatioFrequencyControl {
  key: RectangularRoomRatioKey;
  label: string;
}

interface RoomTypeFrequencyControl {
  key: RoomTypeCategory;
  label: string;
  color: string;
}

interface TrapCategoryFrequencyControl {
  key: TrapCategory;
  label: string;
}

interface TreasureCategoryFrequencyControl {
  key: TreasureCategory;
  label: string;
}

interface TreasureRarityFrequencyControl {
  key: TreasureRarity;
  label: string;
}

interface RoomMetadataField {
  property: string;
  purpose: string;
  value: string;
}

type SettingsSection = "generation" | "rooms" | "types" | "traps" | "treasures" | "access";
type RoomMetadataSection = "structure" | "operations" | "narrative";

interface GeneratedTrap extends DungeonTrap {
  corridorRoomNumbers: number[];
}

interface RoomPositionEdit {
  baseDungeon: Dungeon;
  positions: Record<number, RoomPosition>;
  dungeon: Dungeon;
}

const roomCountControl: ParameterControl = {
  key: "roomCount",
  label: "Quantidade de salas",
  min: 4,
  max: MAX_DUNGEON_ROOM_COUNT,
  step: 1,
  format: (value) => `${value} salas`,
};

const corridorControls: ParameterControl[] = [
  { key: "corridorWidth", label: "Largura dos corredores", min: 1, max: 3, step: 1, format: (value) => `${value} ${value === 1 ? "tile" : "tiles"}` },
  { key: "corridorCompactness", label: "Compactação dos corredores", min: 0, max: 100, step: 5, format: (value) => `${value}%` },
];

const cellularControls: ParameterControl[] = [
  { key: "cellularFillPercent", label: "Densidade inicial", min: 35, max: 65, step: 1, format: (value) => `${value}%` },
  { key: "cellularIterations", label: "Suavização", min: 2, max: 7, step: 1, format: (value) => `${value} ciclos` },
];

const drunkardControls: ParameterControl[] = [
  { key: "drunkardCoveragePercent", label: "Área escavada", min: 15, max: 60, step: 1, format: (value) => `${value}%` },
];

const algorithmControls: Record<Algorithm, ParameterControl[]> = {
  bsp: [],
  cellular: cellularControls,
  drunkard: drunkardControls,
  hybrid: [...cellularControls, ...drunkardControls],
  "bsp-cellular": cellularControls,
  "bsp-drunkard": drunkardControls,
};

const shapeFrequencyControls: ShapeFrequencyControl[] = ROOM_SHAPE_DEFINITIONS.map(({ key, label }) => ({
  key,
  label,
}));

const roomSizeFrequencyControls: RoomSizeFrequencyControl[] = ROOM_SIZE_CATEGORIES.map((category) => ({
  key: category.key,
  label: category.label,
}));

const roomRatioFrequencyControls: RoomRatioFrequencyControl[] = RECTANGULAR_ROOM_RATIO_DEFINITIONS.map(({ key, label }) => ({
  key,
  label,
}));

const roomTypeFrequencyControls: RoomTypeFrequencyControl[] = ROOM_TYPE_CATEGORY_ORDER.map((key) => ({
  key,
  label: ROOM_TYPE_CATEGORIES[key].shortLabel,
  color: ROOM_TYPE_CATEGORIES[key].color,
}));

const trapCategoryFrequencyControls: TrapCategoryFrequencyControl[] = TRAP_CATEGORY_ORDER.map((key) => ({
  key,
  label: TRAP_CATEGORY_LABELS[key],
}));

const treasureCategoryFrequencyControls: TreasureCategoryFrequencyControl[] = TREASURE_CATEGORY_ORDER.map((key) => ({
  key,
  label: TREASURE_CATEGORY_LABELS[key],
}));

const treasureRarityFrequencyControls: TreasureRarityFrequencyControl[] = TREASURE_RARITY_ORDER.map((key) => ({
  key,
  label: TREASURE_RARITY_LABELS[key],
}));

const trapChanceControls: ParameterControl[] = [
  { key: "roomTrapChancePercent", label: "Chance por sala", min: 0, max: 100, step: 5, format: (value) => `${value}%` },
  { key: "corridorTrapChancePercent", label: "Chance por tile de circulação", min: 0, max: 20, step: 1, format: (value) => `${value}%` },
];

const treasureChanceControls: ParameterControl[] = [
  { key: "treasureChancePercent", label: "Chance-base por sala", min: 0, max: 100, step: 5, format: (value) => `${value}%` },
];

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "generation", label: "Geração" },
  { id: "rooms", label: "Salas" },
  { id: "types", label: "Tipos" },
  { id: "traps", label: "Armadilhas" },
  { id: "treasures", label: "Tesouros" },
  { id: "access", label: "Acesso" },
];

const roomShapeLabels: Record<RoomShape, string> = {
  rectangular: "RETANGULAR",
  square: "QUADRADA",
  round: "CIRCULAR",
  elliptical: "ELÍPTICA",
  octagonal: "OCTOGONAL",
  lShaped: "EM L",
  tShaped: "EM T",
  crossShaped: "EM CRUZ",
  ringShaped: "EM ANEL",
  irregular: "IRREGULAR",
  columns: "COM COLUNAS",
  alcoves: "COM ALCOVAS",
  multiLevel: "MULTINÍVEL",
};

function getRoomSizeCategory(width: number, height: number) {
  const area = width * height;
  return ROOM_SIZE_CATEGORIES.find((category) => area <= category.maxArea)
    ?? ROOM_SIZE_CATEGORIES[ROOM_SIZE_CATEGORIES.length - 1];
}

function redistributeFrequencies<T extends string>(
  frequencies: Record<T, number>,
  keys: readonly T[],
  selectedKey: T,
  selectedValue: number,
): Record<T, number> {
  const otherKeys = keys.filter((key) => key !== selectedKey);
  const otherTotal = otherKeys.reduce((total, key) => total + frequencies[key], 0);
  const remaining = 100 - selectedValue;
  const allocations = otherKeys.map((key) => {
    const exactValue = otherTotal === 0
      ? remaining / otherKeys.length
      : remaining * frequencies[key] / otherTotal;
    return { key, value: Math.floor(exactValue), remainder: exactValue % 1 };
  });
  let unallocated = remaining - allocations.reduce((total, entry) => total + entry.value, 0);
  const remainderOrder = [...allocations].sort((left, right) => right.remainder - left.remainder);
  for (const entry of remainderOrder) {
    if (unallocated <= 0) break;
    entry.value += 1;
    unallocated -= 1;
  }

  const updated: Record<T, number> = { ...frequencies };
  updated[selectedKey] = selectedValue;
  for (const allocation of allocations) updated[allocation.key] = allocation.value;
  return updated;
}

function getFrequencyPercentages<T extends string>(
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
    if (unallocated <= 0) break;
    allocation.value += 1;
    unallocated -= 1;
  }
  const percentages: Record<T, number> = { ...weights };
  for (const allocation of allocations) percentages[allocation.key] = allocation.value;
  return percentages;
}

const liquidFeatureLabels: Record<LiquidType, Record<LiquidFeature, string>> = {
  water: {
    fountain: "FONTE",
    stream: "CÓRREGO",
    well: "POÇO",
    pond: "LAGOA",
  },
  lava: {
    fountain: "FONTE DE LAVA",
    stream: "RIO DE LAVA",
    well: "POÇO DE LAVA",
    pond: "LAGOA DE LAVA",
  },
};

const entranceModeOptions: Array<{ value: EntranceMode; label: string }> = [
  { value: "upper-stairs", label: "Escadaria superior" },
  { value: "exterior-entrance", label: "Entrada vinda do exterior" },
  { value: "exterior-connection", label: "Conexão com o exterior" },
];

const trapTypeByTile = new Map(
  TRAP_TYPES.map((type) => [TRAP_DEFINITIONS[type].tile, type] as const),
);

function getCorridorRoomNumbers(
  dungeon: Dungeon,
  startX: number,
  startY: number,
): number[] {
  const visited = Array.from({ length: dungeon.height }, () => new Uint8Array(dungeon.width));
  const distances = new Map<number, number>();
  const queue: Array<{ x: number; y: number; distance: number }> = [
    { x: startX, y: startY, distance: 0 },
  ];
  visited[startY][startX] = 1;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const [deltaX, deltaY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + deltaX;
      const y = current.y + deltaY;
      if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height || visited[y][x]) continue;
      const tile = dungeon.tiles[y][x];
      if (tile === FLOOR_TILE || tile === ELEVATED_FLOOR_TILE || tile === ROOM_STAIRS_TILE) {
        const room = dungeon.roomDetails.find((candidate) => (
          x >= candidate.x
          && x < candidate.x + candidate.width
          && y >= candidate.y
          && y < candidate.y + candidate.height
        ));
        if (room && !distances.has(room.number)) {
          distances.set(room.number, current.distance + 1);
        }
        continue;
      }
      if (
        tile !== CORRIDOR_TILE
        && tile !== DOOR_TILE
        && tile !== SECRET_DOOR_TILE
        && tile !== EXTERIOR_ENTRANCE_TILE
        && tile !== EXTERIOR_CONNECTION_TILE
        && !trapTypeByTile.has(tile)
      ) continue;
      visited[y][x] = 1;
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }

  return [...distances.entries()]
    .sort(([roomA, distanceA], [roomB, distanceB]) => distanceA - distanceB || roomA - roomB)
    .slice(0, 2)
    .map(([roomNumber]) => roomNumber);
}

function isEntranceMode(value: string): value is EntranceMode {
  return entranceModeOptions.some((option) => option.value === value);
}

const rotatableRoomShapes: ReadonlySet<RoomShape> = new Set([
  "lShaped",
  "tShaped",
  "crossShaped",
]);

const roomTrapTypes = TRAP_TYPES.filter((type) => TRAP_DEFINITIONS[type].placement !== "corridor");
function getEnvironmentalRoomTrapChance(weights: TrapCategoryWeights): number {
  const availableCategories = TRAP_CATEGORY_ORDER.filter((category) => (
    roomTrapTypes.some((type) => TRAP_DEFINITIONS[type].category === category)
  ));
  const totalWeight = availableCategories.reduce((total, category) => (
    Number.isFinite(weights[category]) && weights[category] > 0
      ? total + weights[category]
      : total
  ), 0);
  if (totalWeight === 0) return 0;
  const environmentalWeight = (["environmental", "biological"] as const).reduce((total, category) => (
    availableCategories.includes(category) && Number.isFinite(weights[category]) && weights[category] > 0
      ? total + weights[category]
      : total
  ), 0);
  return 25 * environmentalWeight / totalWeight;
}

const roomTypeGroups = {
  combat: new Set(["Guarita", "Interrogatório", "Prisão", "Sala de guarda", "Salão do trono"]),
  resting: new Set(["Alojamento", "Refeitório", "Cozinha", "Enfermaria"]),
  storage: new Set(["Arsenal", "Depósito", "Cofre", "Tesouro"]),
  research: new Set(["Oficina", "Biblioteca", "Escritório", "Laboratório"]),
  ritual: new Set(["Capela", "Câmara ritual", "Cripta", "Santuário"]),
  highOccupancy: new Set(["Alojamento", "Refeitório", "Prisão"]),
  critical: new Set(["Entrada", "Câmara central", "Tesouro", "Salão do trono"]),
  highImportance: new Set(["Cofre", "Capela", "Câmara ritual", "Laboratório", "Cripta", "Santuário"]),
  lowImportance: new Set(["Cozinha", "Depósito", "Oficina", "Refeitório"]),
};

const roomMetadataSections: Array<{
  key: RoomMetadataSection;
  label: string;
  properties: readonly string[];
}> = [
  {
    key: "structure",
    label: "Estrutura",
    properties: [
      "id", "type", "shape", "minWidth / maxWidth", "minHeight / maxHeight",
      "areaRange", "aspectRatioRange", "rotationAllowed", "wallThickness",
      "ceilingHeight", "floorType", "wallType", "elevation", "irregularity",
    ],
  },
  {
    key: "operations",
    label: "Uso e riscos",
    properties: [
      "purpose", "importance", "encounterChance", "trapChance", "treasureChance",
      "secretChance", "occupancy", "coverDensity", "lootCapacity", "environmentalHazardChance",
    ],
  },
  {
    key: "narrative",
    label: "Narrativa",
    properties: [
      "faction", "originalPurpose", "currentState", "age", "securityLevel",
      "magicLevel", "decayLevel", "themeTags", "specialFeatures", "narrativeHooks",
    ],
  },
];

function createNarrativeRoomFields(
  room: DungeonRoom,
  roomType: string,
  originalPurpose: string,
  seed: number,
  shape: string,
  pillarCount: number,
): RoomMetadataField[] {
  const isCombatRoom = roomTypeGroups.combat.has(roomType);
  const isStorageRoom = roomTypeGroups.storage.has(roomType);
  const isResearchRoom = roomTypeGroups.research.has(roomType);
  const isRitualRoom = roomTypeGroups.ritual.has(roomType);
  const ageOptions = ["40–100 anos", "100–300 anos", "300–700 anos", "Mais de 700 anos"];
  const suggestedAge = ageOptions[(seed + room.number * 17) % ageOptions.length];
  const faction = roomType === "Cripta"
    ? "Ordem funerária ou mortos-vivos (sugestão)"
    : roomType === "Salão do trono" || roomType === "Cofre" || roomType === "Tesouro"
      ? "Casa governante (sugestão)"
      : isRitualRoom
        ? "Culto local (sugestão)"
        : isCombatRoom
          ? "Guarnição local (sugestão)"
          : isResearchRoom
            ? "Eruditos ou artífices (sugestão)"
            : isStorageRoom
              ? "Administradores da fortaleza (sugestão)"
              : "Construtores originais ou habitantes locais (sugestão)";
  const currentState = room.trap
    ? `Armadilha presente: ${TRAP_DEFINITIONS[room.trap].label}`
    : room.liquidType
      ? `Ambiente alterado por ${room.liquidType === "water" ? "água" : "lava"}`
      : room.shape === "multiLevel"
        ? "Plataforma elevada preservada"
        : "Estado de conservação não simulado";
  const securityLevel = roomType === "Cofre" || roomType === "Tesouro"
    ? "Muito alta (sugestão)"
    : room.trap || isCombatRoom
      ? "Alta (sugestão)"
      : roomType === "Entrada" || roomType === "Vestíbulo"
        ? "Média (sugestão)"
        : "Baixa (sugestão)";
  const magicLevel = isRitualRoom || roomType === "Laboratório"
    ? "Alta (sugestão)"
    : room.shape === "multiLevel" || room.liquidType === "lava"
      ? "Média (sugestão)"
      : "Baixa (sugestão)";
  const decayLevel = room.liquidType === "water" || room.trap === "caveIn"
    ? "Alta (sugestão)"
    : room.shape === "irregular" || (seed + room.number) % 2 === 0
      ? "Média (sugestão)"
      : "Baixa (sugestão)";
  const themeTags = new Set<string>();
  if (isCombatRoom) themeTags.add("military");
  if (isStorageRoom) themeTags.add("treasure");
  if (isResearchRoom || roomType === "Câmara ritual") themeTags.add("arcane");
  if (roomType === "Cripta") themeTags.add("undead");
  if (roomType === "Capela" || roomType === "Santuário") themeTags.add("sacred");
  if (roomType === "Salão do trono" || roomType === "Cofre" || roomType === "Tesouro") themeTags.add("royal");
  if (room.shape === "irregular") themeTags.add("cavernous");
  if (room.shape === "multiLevel") themeTags.add("multilevel");
  if (room.trap) themeTags.add("trapped");
  if (room.liquidType === "water") themeTags.add("flooded");
  if (room.liquidType === "lava") themeTags.add("volcanic");
  if (themeTags.size === 0) themeTags.add("abandoned");
  const liquidFeatureLabels: Record<LiquidFeature, string> = {
    fountain: "Fonte",
    stream: "Córrego",
    well: "Poço",
    pond: "Lagoa",
  };
  const specialFeatures = [
    shape,
    pillarCount > 0 ? `${pillarCount} pilares gerados` : "",
    room.liquidFeature ? liquidFeatureLabels[room.liquidFeature] : "",
    room.trap ? TRAP_DEFINITIONS[room.trap].label : "",
  ].filter(Boolean).join("; ");
  const narrativeHook = room.trap
    ? `A armadilha "${TRAP_DEFINITIONS[room.trap].label}" protege algo ou tenta manter alguém preso?`
    : room.liquidType
      ? `Quem alterou o ambiente com ${room.liquidType === "water" ? "água" : "lava"} e o que isso está escondendo?`
      : isCombatRoom
        ? `Quem ainda protege este local, e a quem essa defesa deveria impedir a entrada?`
        : isStorageRoom
          ? `O que foi guardado aqui e por que ainda não foi recuperado?`
          : isResearchRoom
            ? `Que registro ou experimento inacabado pode revelar o passado da masmorra?`
            : isRitualRoom
              ? `Que entidade ou promessa ainda está ligada a este lugar?`
              : `Que vestígio dos antigos ocupantes revela o que aconteceu em ${roomType.toLowerCase()}?`;

  return [
    { property: "faction", purpose: "Grupo que construiu ou ocupa a sala", value: faction },
    { property: "originalPurpose", purpose: "Função original", value: originalPurpose },
    { property: "currentState", purpose: "Estado atual", value: currentState },
    { property: "age", purpose: "Idade aproximada da estrutura", value: `${suggestedAge} (sugestão narrativa)` },
    { property: "securityLevel", purpose: "Nível de proteção", value: securityLevel },
    { property: "magicLevel", purpose: "Intensidade da presença mágica", value: magicLevel },
    { property: "decayLevel", purpose: "Grau de deterioração", value: decayLevel },
    { property: "themeTags", purpose: "Etiquetas como royal, undead, arcane", value: [...themeTags].join(", ") },
    { property: "specialFeatures", purpose: "Características exclusivas", value: specialFeatures },
    { property: "narrativeHooks", purpose: "Ganchos de história associados", value: narrativeHook },
  ];
}

function createRoomMetadataFields(
  room: DungeonRoom,
  roomType: string,
  seed: number,
  dungeon: Dungeon,
  originalPurpose: string,
): RoomMetadataField[] {
  const shapeDefinition = ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === room.shape);
  const shape = shapeDefinition?.label ?? roomShapeLabels[room.shape];
  const bounds = room.generationBounds;
  const formatNumber = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const formatRatio = (value: number) => `${formatNumber(value)}:1`;
  const ratioRange = bounds.aspectRatioRange.min === bounds.aspectRatioRange.max
    ? formatRatio(bounds.aspectRatioRange.min)
    : `${formatRatio(bounds.aspectRatioRange.min)}–${formatRatio(bounds.aspectRatioRange.max)}`;
  const floorType = room.shape === "multiLevel"
    ? "Piso padrão com plataforma elevada"
    : room.liquidType
      ? `Piso padrão com ${room.liquidType === "water" ? "água" : "lava"}`
      : "Piso padrão";
  const elevation = room.shape === "multiLevel"
    ? "Base no nível 0; plataforma no nível 1"
    : "Nível 0";
  const irregularity = room.shape === "irregular"
    ? "Até 20% de variação do contorno"
    : "0% (formato regular)";
  const isCombatRoom = roomTypeGroups.combat.has(roomType);
  const isRestingRoom = roomTypeGroups.resting.has(roomType);
  const isStorageRoom = roomTypeGroups.storage.has(roomType);
  const isResearchRoom = roomTypeGroups.research.has(roomType);
  const isRitualRoom = roomTypeGroups.ritual.has(roomType);
  const purpose = isCombatRoom
    ? "Combate e segurança"
    : isRestingRoom
      ? "Descanso e suporte"
      : isStorageRoom
        ? "Armazenamento e recompensas"
        : isResearchRoom
          ? "Trabalho e pesquisa"
          : isRitualRoom
            ? "Culto e rituais"
            : "Exploração e circulação";
  const importance = roomTypeGroups.critical.has(roomType)
    ? "Crítica"
    : roomTypeGroups.highImportance.has(roomType)
      ? "Alta"
      : roomTypeGroups.lowImportance.has(roomType)
        ? "Baixa"
        : "Média";
  const encounterChance = isCombatRoom ? 65 : isRitualRoom ? 45 : isStorageRoom ? 25 : 20;
  const treasureChance = getRoomTreasureChance(
    room.roomType.category,
    roomType,
    dungeon.treasureChancePercent,
  );
  let pillarCount = 0;
  let roomFloorTiles = 0;
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const tile = dungeon.tiles[y]?.[x];
      if (tile === PILLAR_TILE) {
        pillarCount += 1;
        roomFloorTiles += 1;
      } else if (tile !== undefined && tile !== 0) {
        roomFloorTiles += 1;
      }
    }
  }
  const coverPercentage = roomFloorTiles === 0 ? 0 : pillarCount / roomFloorTiles * 100;
  const coverDensity = pillarCount === 0
    ? "Nenhuma (0 pilares gerados)"
    : `${coverPercentage < 5 ? "Baixa" : coverPercentage < 15 ? "Média" : "Alta"} (${pillarCount} pilares; ${formatNumber(coverPercentage)}%)`;
  const occupancyDivisor = roomTypeGroups.highOccupancy.has(roomType) ? 8 : isCombatRoom ? 12 : 24;
  const occupancyMaximum = Math.max(1, Math.min(16, Math.floor(roomFloorTiles / occupancyDivisor)));
  const occupancyMinimum = isCombatRoom || isRestingRoom ? 1 : 0;
  const occupancyValue = occupancyMinimum === occupancyMaximum
    ? `${occupancyMinimum} ${occupancyMinimum === 1 ? "ocupante" : "ocupantes"} (estimativa)`
    : `${occupancyMinimum}–${occupancyMaximum} ocupantes (estimativa)`;
  const lootMultiplier = roomType === "Tesouro" ? 3 : roomType === "Cofre" ? 2 : isStorageRoom ? 1.5 : 1;
  const lootCapacity = Math.max(1, Math.min(30, Math.floor(roomFloorTiles / 16 * lootMultiplier)));
  const lootCapacityValue = `${lootCapacity} ${lootCapacity === 1 ? "espaço" : "espaços"} de recompensa (estimativa)`;
  const formatPercent = (value: number) => `${formatNumber(value)}%`;

  const metadataFields: RoomMetadataField[] = [
    {
      property: "id",
      purpose: "Identificador único da sala",
      value: `room-${seed}-${room.number.toString().padStart(2, "0")}`,
    },
    { property: "type", purpose: "Tipo funcional da sala", value: roomType },
    { property: "shape", purpose: "Formato geométrico", value: shape },
    {
      property: "minWidth / maxWidth",
      purpose: "Limites de largura",
      value: `${bounds.minWidth}–${bounds.maxWidth} m`,
    },
    {
      property: "minHeight / maxHeight",
      purpose: "Limites de altura",
      value: `${bounds.minHeight}–${bounds.maxHeight} m`,
    },
    {
      property: "areaRange",
      purpose: "Área mínima e máxima",
      value: `${formatNumber(bounds.areaRange.min)}–${formatNumber(bounds.areaRange.max)} m²`,
    },
    {
      property: "aspectRatioRange",
      purpose: "Limites da proporção entre os lados",
      value: ratioRange,
    },
    {
      property: "rotationAllowed",
      purpose: "Permite rotacionar a sala",
      value: rotatableRoomShapes.has(room.shape) ? "Sim" : "Não",
    },
    { property: "wallThickness", purpose: "Espessura visual ou estrutural das paredes", value: "1 tile (1 m)" },
    { property: "ceilingHeight", purpose: "Altura do teto, se relevante", value: "Não definida pelo gerador" },
    { property: "floorType", purpose: "Tipo de piso", value: floorType },
    { property: "wallType", purpose: "Tipo de parede", value: "Parede padrão" },
    { property: "elevation", purpose: "Nível vertical", value: elevation },
    { property: "irregularity", purpose: "Grau de irregularidade geométrica", value: irregularity },
    { property: "purpose", purpose: "Exploração, combate, descanso, armazenamento etc.", value: purpose },
    { property: "importance", purpose: "Peso narrativo da sala", value: importance },
    {
      property: "encounterChance",
      purpose: "Probabilidade de conter um encontro",
      value: `${formatPercent(encounterChance)} (estimativa narrativa)`,
    },
    {
      property: "trapChance",
      purpose: "Probabilidade de conter armadilhas",
      value: `${formatPercent(dungeon.roomTrapChancePercent)} (taxa-base por sala)`,
    },
    {
      property: "treasureChance",
      purpose: "Probabilidade efetiva de gerar um tesouro nesta sala",
      value: `${formatPercent(treasureChance)} (sorteada durante a geração)`,
    },
    {
      property: "secretChance",
      purpose: "Probabilidade de possuir passagens ou conteúdos secretos",
      value: "20% por porta gerada; não calculada por sala",
    },
    {
      property: "occupancy",
      purpose: "Quantidade provável de criaturas ou ocupantes",
      value: occupancyValue,
    },
    {
      property: "coverDensity",
      purpose: "Densidade de obstáculos e coberturas",
      value: coverDensity,
    },
    {
      property: "lootCapacity",
      purpose: "Capacidade aproximada para distribuir recompensas",
      value: `${lootCapacityValue}; não determina a quantidade sorteada`,
    },
    {
      property: "environmentalHazardChance",
      purpose: "Probabilidade de perigos ambientais",
      value: `${formatPercent(getEnvironmentalRoomTrapChance(dungeon.trapCategoryWeights))} (no sorteio de armadilhas de sala)`,
    },
  ];
  return [
    ...metadataFields,
    ...createNarrativeRoomFields(room, roomType, originalPurpose, seed, shape, pillarCount),
  ];
}

interface RoomMetadataCardProps {
  roomNumber: number;
  roomType: string;
  shape: string;
  width: number;
  height: number;
  metadata: RoomMetadataField[];
}

function RoomMetadataCard({
  roomNumber,
  roomType,
  shape,
  width,
  height,
  metadata,
}: RoomMetadataCardProps) {
  const [metadataSection, setMetadataSection] = useState<RoomMetadataSection>("structure");
  const selectedProperties = roomMetadataSections.find((section) => section.key === metadataSection)?.properties;

  return (
    <details className="room-metadata-card">
      <summary>
        <strong>Sala {roomNumber.toString().padStart(2, "0")} · {roomType}</strong>
        <span>
          {shape}
          {" · "}
          {width} × {height} m
        </span>
      </summary>
      <nav className="room-metadata-nav" aria-label={`Categorias de metadados da sala ${roomNumber}`}>
        {roomMetadataSections.map((section) => (
          <button
            className={metadataSection === section.key ? "active" : ""}
            type="button"
            aria-pressed={metadataSection === section.key}
            key={section.key}
            onClick={() => setMetadataSection(section.key)}
          >
            {section.label}
            <small>{section.properties.length}</small>
          </button>
        ))}
      </nav>
      <dl>
        {metadata.filter((field) => selectedProperties?.includes(field.property)).map((field) => (
          <div className="room-metadata-row" key={field.property}>
            <dt>
              <code>{field.property}</code>
              <small>{field.purpose}</small>
            </dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function createSeed(): number {
  return Math.floor(Math.random() * 900_000_000) + 100_000_000;
}

export default function App() {
  const [concept, setConcept] = useState<DungeonConcept>("military-fortress");
  const [seed, setSeed] = useState(createSeed);
  const [seedDraft, setSeedDraft] = useState(String(seed));
  const [parameters, setParameters] = useState<DungeonParameters>(DEFAULT_DUNGEON_PARAMETERS);
  const [widthDraft, setWidthDraft] = useState(String(DEFAULT_DUNGEON_PARAMETERS.width));
  const [heightDraft, setHeightDraft] = useState(String(DEFAULT_DUNGEON_PARAMETERS.height));
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null);
  const [roomDetailNumber, setRoomDetailNumber] = useState<number | null>(null);
  const [roomDetailSection, setRoomDetailSection] = useState<RoomMetadataSection>("structure");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("generation");
  const [roomPositionEdit, setRoomPositionEdit] = useState<RoomPositionEdit | null>(null);
  const guideListRef = useRef<HTMLDivElement | null>(null);
  const roomDetailDialogRef = useRef<HTMLDialogElement | null>(null);
  const preserveRoomFocusOnCloseRef = useRef(false);
  const [showWater, setShowWater] = useState(true);
  const [showLava, setShowLava] = useState(true);
  const [cavesEnabled, setCavesEnabled] = useState(false);
  const conceptProfile = DUNGEON_CONCEPTS[concept];
  const cavesRequired = concept === "natural-cavern";
  const algorithm = getDungeonGenerationAlgorithm(conceptProfile.algorithm, cavesEnabled);
  const hasBspRooms = algorithm !== "cellular" && algorithm !== "drunkard";
  const generationParameters = useMemo(() => ({
    ...parameters,
    roomTypeDistributionEnabled: true,
    roomTypeCategoryFrequencies: parameters.roomTypeDistributionEnabled
      ? parameters.roomTypeCategoryFrequencies
      : conceptProfile.roomTypeCategoryFrequencies,
    trapCategoryWeights: parameters.trapCategoryDistributionEnabled
      ? parameters.trapCategoryWeights
      : conceptProfile.trapCategoryWeights,
    treasureCategoryWeights: parameters.treasureCategoryDistributionEnabled
      ? parameters.treasureCategoryWeights
      : conceptProfile.treasureCategoryWeights,
    treasureRarityWeights: parameters.treasureRarityDistributionEnabled
      ? parameters.treasureRarityWeights
      : DEFAULT_TREASURE_RARITY_WEIGHTS,
  }), [conceptProfile, parameters]);
  const generatedDungeon = useMemo(
    () => generateDungeon(algorithm, seed, generationParameters),
    [algorithm, generationParameters, seed],
  );
  const dungeon = roomPositionEdit?.baseDungeon === generatedDungeon
    ? roomPositionEdit.dungeon
    : generatedDungeon;
  const roomDetail = roomDetailNumber === null
    ? undefined
    : dungeon.roomDetails.find((room) => room.number === roomDetailNumber);
  const roomDetailTreasureDefinition = roomDetail?.treasure
    ? getTreasureDefinition(roomDetail.treasure.type)
    : undefined;
  const roomDetailCategory = roomDetail
    ? ROOM_TYPE_CATEGORIES[roomDetail.roomType.category]
    : undefined;
  const roomDetailShape = roomDetail
    ? ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === roomDetail.shape)
    : undefined;
  const roomDetailSize = roomDetail
    ? getRoomSizeCategory(roomDetail.width, roomDetail.height)
    : undefined;
  const roomDetailMetadata = useMemo(
    () => roomDetail
      ? createRoomMetadataFields(roomDetail, roomDetail.roomType.title, seed, dungeon, roomDetail.roomType.description)
      : [],
    [dungeon, roomDetail, seed],
  );
  const roomDetailMetadataProperties = roomMetadataSections.find(
    (section) => section.key === roomDetailSection,
  )?.properties;
  const generatedTraps = useMemo(() => dungeon.traps.map((trap): GeneratedTrap => ({
    ...trap,
    corridorRoomNumbers: hasBspRooms
      ? getCorridorRoomNumbers(dungeon, trap.x, trap.y)
      : [],
  })), [dungeon, hasBspRooms]);
  const roomTrapCount = dungeon.roomDetails.filter((room) => room.trap !== undefined).length;
  const usedRoomCategories = [...new Set(
    dungeon.roomDetails.map((room) => room.roomType.category),
  )];
  useEffect(() => {
    setRoomDetailNumber(null);
    setFocusRequest(null);
  }, [generatedDungeon]);
  useEffect(() => {
    const dialog = roomDetailDialogRef.current;
    if (!dialog) return;
    if (roomDetail && !dialog.open) dialog.showModal();
    else if (!roomDetail && dialog.open) dialog.close();
  }, [roomDetail]);
  useEffect(() => {
    if (!focusRequest || !guideListRef.current) return;
    const selector = `button[data-room-number="${focusRequest.roomNumber}"]`;
    const button = guideListRef.current.querySelector<HTMLButtonElement>(selector);
    if (button) {
      button.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusRequest]);
  const floorPercentage = Math.round((dungeon.floorCount / (dungeon.width * dungeon.height)) * 100);
  const hasOpenCaveConnection = dungeon.tiles.some((row, y) => row.some((tile, x) => (
    tile === CAVE_TILE
    && [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([neighborX, neighborY]) => {
      const neighborTile = dungeon.tiles[neighborY]?.[neighborX];
      return neighborTile !== undefined
        && neighborTile !== 0
        && neighborTile !== CORRIDOR_TILE
        && neighborTile !== CAVE_TILE
        && neighborTile !== CAVE_CONNECTION_WALL_TILE
        && neighborTile !== CAVE_BREACH_TILE
        && dungeon.roomDetails.some((room) => (
        neighborX >= room.x
        && neighborX < room.x + room.width
        && neighborY >= room.y
        && neighborY < room.y + room.height
      ));
    })
  )));
  const floorLabel = algorithm === "cellular"
    ? "CAVERNA NATURAL"
    : algorithm === "bsp-cellular"
      ? "SALAS E CAVERNAS"
      : algorithm === "bsp-drunkard"
        ? "SALAS E TRILHAS"
        : algorithm === "hybrid"
          ? "GERAÇÃO MISTA"
          : "SALA";
  const floorDescription = conceptProfile.generationDescription;
  const updateDimensionDraft = (key: "width" | "height", value: string) => {
    if (key === "width") setWidthDraft(value);
    else setHeightDraft(value);

    const parsed = Number(value);
    const maximum = key === "width" ? MAX_DUNGEON_WIDTH : MAX_DUNGEON_HEIGHT;
    if (Number.isInteger(parsed) && parsed >= MIN_DUNGEON_DIMENSION && parsed <= maximum) {
      setParameters((current) => ({ ...current, [key]: parsed }));
    }
  };
  const updateSeedDraft = (value: string) => {
    setSeedDraft(value);
    if (!/^\d+$/.test(value)) return;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed <= MAX_DUNGEON_SEED) setSeed(parsed);
  };
  const moveRoom = (roomNumber: number, x: number, y: number) => {
    setRoomPositionEdit((current) => {
      const activeEdit = current?.baseDungeon === generatedDungeon ? current : null;
      const positions = {
        ...activeEdit?.positions,
        [roomNumber]: { x, y },
      };
      const movedDungeon = repositionDungeonRooms(generatedDungeon, positions);
      return movedDungeon
        ? { baseDungeon: generatedDungeon, positions, dungeon: movedDungeon }
        : current;
    });
  };
  const openRoomDetails = (roomNumber: number) => {
    setRoomDetailSection("structure");
    setRoomDetailNumber(roomNumber);
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: true,
    }));
  };
  const selectMovedRoom = (roomNumber: number) => {
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: false,
    }));
  };
  const commitSeedDraft = () => {
    const parsed = Number(seedDraft);
    if (/^\d+$/.test(seedDraft) && Number.isSafeInteger(parsed) && parsed <= MAX_DUNGEON_SEED) {
      setSeed(parsed);
      setSeedDraft(String(parsed));
    } else {
      setSeedDraft(String(seed));
    }
  };
  const commitDimension = (key: "width" | "height") => {
    const draft = key === "width" ? widthDraft : heightDraft;
    const parsed = Number(draft);
    const maximum = key === "width" ? MAX_DUNGEON_WIDTH : MAX_DUNGEON_HEIGHT;
    const value = Number.isFinite(parsed)
      ? Math.min(maximum, Math.max(MIN_DUNGEON_DIMENSION, Math.round(parsed)))
      : parameters[key];
    if (key === "width") setWidthDraft(String(value));
    else setHeightDraft(String(value));
    setParameters((current) => ({ ...current, [key]: value }));
  };
  const updateRoomShapeFrequency = (key: keyof RoomShapeFrequencies, value: number) => {
    setParameters((current) => ({
      ...current,
      roomShapeFrequencies: redistributeFrequencies(
        current.roomShapeFrequencies,
        shapeFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateTrapCategoryFrequency = (key: TrapCategory, value: number) => {
    setParameters((current) => ({
      ...current,
      trapCategoryWeights: redistributeFrequencies(
        current.trapCategoryWeights,
        trapCategoryFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateTreasureCategoryFrequency = (key: TreasureCategory, value: number) => {
    setParameters((current) => ({
      ...current,
      treasureCategoryWeights: redistributeFrequencies(
        current.treasureCategoryWeights,
        treasureCategoryFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateTreasureRarityFrequency = (key: TreasureRarity, value: number) => {
    setParameters((current) => ({
      ...current,
      treasureRarityWeights: redistributeFrequencies(
        current.treasureRarityWeights,
        treasureRarityFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateRoomSizeFrequency = (key: RoomSizeCategoryKey, value: number) => {
    setParameters((current) => ({
      ...current,
      roomSizeFrequencies: redistributeFrequencies(
        current.roomSizeFrequencies,
        roomSizeFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateRoomRatioFrequency = (key: RectangularRoomRatioKey, value: number) => {
    setParameters((current) => ({
      ...current,
      rectangularRoomRatioFrequencies: redistributeFrequencies(
        current.rectangularRoomRatioFrequencies,
        roomRatioFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const updateRoomTypeFrequency = (key: RoomTypeCategory, value: number) => {
    setParameters((current) => ({
      ...current,
      roomTypeCategoryFrequencies: redistributeFrequencies(
        current.roomTypeCategoryFrequencies,
        roomTypeFrequencyControls.map((control) => control.key),
        key,
        value,
      ),
    }));
  };
  const renderParameterControl = (control: ParameterControl) => (
    <label className="parameter-control" htmlFor={`parameter-${control.key}`} key={control.key}>
      <span className="parameter-label">
        <span>{control.label}</span>
        <strong>{control.format(parameters[control.key])}</strong>
      </span>
      <input
        id={`parameter-${control.key}`}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={parameters[control.key]}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          setParameters((current) => ({ ...current, [control.key]: value }));
        }}
        aria-label={control.label}
        aria-valuetext={control.format(parameters[control.key])}
      />
    </label>
  );
  const rerollDungeon = () => {
    setFocusRequest(null);
    const nextSeed = createSeed();
    setSeed(nextSeed);
    setSeedDraft(String(nextSeed));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Dungeon Foundry início">
          <span className="brand-mark" aria-hidden="true">⌘</span>
          <span>DUNGEON <strong>FOUNDRY</strong></span>
        </a>
        <span className="prototype-label"><span /> PROTÓTIPO DE GERAÇÃO</span>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">LABORATÓRIO DE MAPAS</div>
          <h1>Forje uma<br />nova masmorra.</h1>
          <p className="intro">Escolha um conceito, decida se haverá cavernas e explore as salas no mapa.</p>

          <nav className="settings-nav" aria-label="Seções de configuração">
            {settingsSections.map((section) => (
              <button
                className={`settings-nav-button${settingsSection === section.id ? " active" : ""}`}
                key={section.id}
                type="button"
                aria-current={settingsSection === section.id ? "page" : undefined}
                onClick={() => setSettingsSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="settings-panel">
            {settingsSection === "generation" && (
              <>
                <div className="section-heading settings-section-heading">
                  <span>CONCEITO DA MASMORRA</span>
                </div>
                <label className="entrance-control" htmlFor="dungeon-concept">
                  <span>PERFIL</span>
                  <select
                    id="dungeon-concept"
                    value={concept}
                    onChange={(event) => {
                      const selectedConcept = DUNGEON_CONCEPT_ORDER.find(
                        (candidate) => candidate === event.currentTarget.value,
                      );
                      if (selectedConcept) setConcept(selectedConcept);
                    }}
                  >
                    {DUNGEON_CONCEPT_ORDER.map((conceptId) => (
                      <option key={conceptId} value={conceptId}>
                        {DUNGEON_CONCEPTS[conceptId].name}
                      </option>
                    ))}
                  </select>
                  <small>{conceptProfile.description}</small>
                </label>
                <label className="double-door-option cave-option">
                  <input
                    type="checkbox"
                    checked={cavesEnabled || cavesRequired}
                    disabled={cavesRequired}
                    onChange={(event) => setCavesEnabled(event.currentTarget.checked)}
                    aria-label="Incluir cavernas naturais na masmorra"
                  />
                  <span>
                    <strong>Incluir cavernas</strong>
                    <small>
                      {cavesRequired
                        ? "Este conceito gera apenas cavernas naturais, sem salas."
                        : "Paredes destacadas indicam possíveis ligações entre salas e cavernas."}
                    </small>
                  </span>
                </label>

                <div className="section-heading settings-section-heading">
                  <span>DIMENSÕES E SEED</span>
                </div>
                <label className="dimension-field seed-field" htmlFor="map-seed">
                  <span>Seed do gerador</span>
                  <input
                    id="map-seed"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={seedDraft}
                    onChange={(event) => updateSeedDraft(event.currentTarget.value)}
                    onBlur={commitSeedDraft}
                    aria-label={`Seed do gerador, de 0 a ${MAX_DUNGEON_SEED}`}
                  />
                </label>
                <div className="dimension-fields">
                  <label className="dimension-field" htmlFor="map-width">
                    <span>Largura <small>tiles</small></span>
                    <input
                      id="map-width"
                      type="number"
                      min={MIN_DUNGEON_DIMENSION}
                      max={MAX_DUNGEON_WIDTH}
                      step={1}
                      value={widthDraft}
                      onChange={(event) => updateDimensionDraft("width", event.currentTarget.value)}
                      onBlur={() => commitDimension("width")}
                      aria-describedby="dimension-hint"
                    />
                  </label>
                  <label className="dimension-field" htmlFor="map-height">
                    <span>Altura <small>tiles</small></span>
                    <input
                      id="map-height"
                      type="number"
                      min={MIN_DUNGEON_DIMENSION}
                      max={MAX_DUNGEON_HEIGHT}
                      step={1}
                      value={heightDraft}
                      onChange={(event) => updateDimensionDraft("height", event.currentTarget.value)}
                      onBlur={() => commitDimension("height")}
                      aria-describedby="dimension-hint"
                    />
                  </label>
                </div>
                <p className="dimension-hint" id="dimension-hint">
                  Largura: {MIN_DUNGEON_DIMENSION}–{MAX_DUNGEON_WIDTH} · altura: {MIN_DUNGEON_DIMENSION}–{MAX_DUNGEON_HEIGHT} tiles.
                </p>
                {algorithmControls[algorithm].length > 0 && (
                  <div className="parameter-list">
                    {algorithmControls[algorithm].map(renderParameterControl)}
                  </div>
                )}
              </>
            )}

            {settingsSection === "rooms" && (
              hasBspRooms ? (
                <>
                  <div className="section-heading settings-section-heading">
                    <span>ESTRUTURA DAS SALAS</span>
                  </div>
                  <div className="parameter-list">
                    {renderParameterControl(roomCountControl)}
                  </div>
                  <details className="room-size-distribution shape-frequency-settings">
                    <summary>
                      <span>FORMATOS DAS SALAS</span>
                      <small>{shapeFrequencyControls.length} formatos</small>
                    </summary>
                    <div className="shape-frequency-settings-content">
                      <p className="shape-frequency-hint">As frequências totalizam 100%; ajuste cada formato conforme o mapa desejado.</p>
                      <div className="parameter-list">
                        {shapeFrequencyControls.map((control) => {
                          const value = parameters.roomShapeFrequencies[control.key];
                          const definition = ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === control.key);
                          return (
                            <label
                              className="parameter-control"
                              htmlFor={`room-frequency-${control.key}`}
                              key={control.key}
                              title={definition ? `${definition.characteristics} Aplicações: ${definition.applications}` : undefined}
                            >
                              <span className="parameter-label">
                                <span>{control.label}</span>
                                <strong>{value}%</strong>
                              </span>
                              <input
                                id={`room-frequency-${control.key}`}
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={value}
                                onChange={(event) => updateRoomShapeFrequency(control.key, Number(event.currentTarget.value))}
                                aria-label={`Frequência do formato ${control.label.toLocaleLowerCase("pt-BR")}`}
                                aria-valuetext={`${value}%`}
                              />
                            </label>
                          );
                        })}
                      </div>
                      <details className="room-size-reference room-shape-reference">
                        <summary>GUIA DOS FORMATOS</summary>
                        <div className="room-size-reference-content">
                          {ROOM_SHAPE_DEFINITIONS.map((shape) => (
                            <div className="room-size-reference-row" key={shape.key}>
                              <strong>{shape.label}</strong>
                              <span>{shape.characteristics}</span>
                              <small>Aplicações: {shape.applications}</small>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </details>
                  <details className="room-size-distribution room-ratio-distribution">
                    <summary>
                      <span>PROPORÇÕES RETANGULARES</span>
                      <small>{roomRatioFrequencyControls.length} faixas</small>
                    </summary>
                    <div className="room-ratio-distribution-content">
                      <p className="shape-frequency-hint">
                        A razão compara o lado maior ao menor. O padrão favorece salas quadradas e moderadamente alongadas; para minas e instalações industriais, aumente as faixas 2:1 e 3:1 ou mais.
                      </p>
                      <div className="parameter-list">
                        {roomRatioFrequencyControls.map((control) => {
                          const value = parameters.rectangularRoomRatioFrequencies[control.key];
                          const definition = RECTANGULAR_ROOM_RATIO_DEFINITIONS.find((ratio) => ratio.key === control.key);
                          return (
                            <label
                              className="parameter-control"
                              htmlFor={`room-ratio-frequency-${control.key}`}
                              key={control.key}
                              title={definition ? `${definition.characteristic}. Exemplo: ${definition.example}.` : undefined}
                            >
                              <span className="parameter-label">
                                <span className="ratio-frequency-label">
                                  <span>{control.label}</span>
                                  {definition && <small>{definition.characteristic}</small>}
                                </span>
                                <strong>{value}%</strong>
                              </span>
                              <input
                                id={`room-ratio-frequency-${control.key}`}
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={value}
                                onChange={(event) => updateRoomRatioFrequency(control.key, Number(event.currentTarget.value))}
                                aria-label={`Frequência da proporção retangular ${control.label}`}
                                aria-valuetext={`${value}%`}
                              />
                            </label>
                          );
                        })}
                      </div>
                      <details className="room-size-reference room-ratio-reference">
                        <summary>REFERÊNCIA DE PROPORÇÕES</summary>
                        <div className="room-size-reference-content">
                          {RECTANGULAR_ROOM_RATIO_DEFINITIONS.map((ratio) => (
                            <div className="room-size-reference-row" key={ratio.key}>
                              <strong>{ratio.label}</strong>
                              <span>{ratio.characteristic}</span>
                              <small>Exemplo: {ratio.example}</small>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </details>
                  <details className="room-size-distribution">
                    <summary>
                      <span>FORÇAR PORTE DAS SALAS</span>
                      <small>{parameters.roomSizeDistributionEnabled ? "ATIVO" : "AUTOMÁTICO"}</small>
                    </summary>
                    <label className="room-size-distribution-toggle">
                      <input
                        type="checkbox"
                        checked={parameters.roomSizeDistributionEnabled}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;
                          setParameters((current) => ({ ...current, roomSizeDistributionEnabled: enabled }));
                        }}
                        aria-label="Forçar distribuição de salas por porte"
                      />
                      <span>
                        <strong>Ativar portes configurados</strong>
                        <small>O gerador tenta seguir as porcentagens quando o espaço disponível permitir.</small>
                      </span>
                    </label>
                    <div className={`parameter-list room-size-frequency-list${parameters.roomSizeDistributionEnabled ? "" : " disabled"}`}>
                      {roomSizeFrequencyControls.map((control) => {
                        const value = parameters.roomSizeFrequencies[control.key];
                        return (
                          <label className="parameter-control" htmlFor={`room-size-frequency-${control.key}`} key={control.key}>
                            <span className="parameter-label">
                              <span>{control.label}</span>
                              <strong>{value}%</strong>
                            </span>
                            <input
                              id={`room-size-frequency-${control.key}`}
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={value}
                              disabled={!parameters.roomSizeDistributionEnabled}
                              onChange={(event) => updateRoomSizeFrequency(control.key, Number(event.currentTarget.value))}
                              aria-label={`Frequência de salas porte ${control.label.toLocaleLowerCase("pt-BR")}`}
                              aria-valuetext={`${value}%`}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <p className="room-size-distribution-hint">
                      A soma permanece em 100%. Se um porte não couber no setor, o gerador usa o porte viável mais próximo.
                    </p>
                  </details>
                  <details className="room-size-reference">
                    <summary>PORTE E ESCALA DAS SALAS</summary>
                    <div className="room-size-reference-content">
                      <p>1 tile = 1 m por lado; a área é aproximada.</p>
                      {ROOM_SIZE_CATEGORIES.map((category) => (
                        <div className="room-size-reference-row" key={category.label}>
                          <strong>{category.label}</strong>
                          <span>{category.dimensions} · {category.area}</span>
                          <small>{category.usage}</small>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              ) : (
                <p className="settings-unavailable">
                  A quantidade, os formatos e os portes dependem do conceito selecionado.
                </p>
              )
            )}

            {settingsSection === "types" && (
              <>
                <div className="section-heading settings-section-heading">
                  <span>DISTRIBUIÇÃO DE TIPOS</span>
                </div>
                {!hasBspRooms && (
                  <p className="settings-unavailable room-type-algorithm-note">
                    As categorias funcionais são aplicadas às salas do conceito selecionado.
                  </p>
                )}
                <label className="room-size-distribution-toggle room-type-distribution-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.roomTypeDistributionEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setParameters((current) => ({ ...current, roomTypeDistributionEnabled: enabled }));
                    }}
                    aria-label="Forçar distribuição das categorias de salas"
                  />
                  <span>
                    <strong>Personalizar frequências do perfil</strong>
                    <small>
                      {parameters.roomTypeDistributionEnabled
                        ? "Os percentuais abaixo substituem a distribuição definida pelo conceito."
                        : "O conceito define as frequências; ative para usar os percentuais personalizados."}
                    </small>
                  </span>
                </label>
                <div className={`parameter-list room-type-frequency-list${parameters.roomTypeDistributionEnabled ? "" : " disabled"}`}>
                  {roomTypeFrequencyControls.map((control) => {
                    const value = parameters.roomTypeDistributionEnabled
                      ? parameters.roomTypeCategoryFrequencies[control.key]
                      : conceptProfile.roomTypeCategoryFrequencies[control.key];
                    return (
                      <label
                        className="parameter-control"
                        htmlFor={`room-type-frequency-${control.key}`}
                        key={control.key}
                        title={ROOM_TYPE_CATEGORIES[control.key].label}
                      >
                        <span className="parameter-label">
                          <span className="room-type-frequency-name">
                            <i style={{ backgroundColor: control.color }} />
                            {control.label}
                          </span>
                          <strong>{value}%</strong>
                        </span>
                        <input
                          id={`room-type-frequency-${control.key}`}
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          disabled={!parameters.roomTypeDistributionEnabled}
                          onChange={(event) => updateRoomTypeFrequency(control.key, Number(event.currentTarget.value))}
                          aria-label={`Frequência da categoria ${ROOM_TYPE_CATEGORIES[control.key].label}`}
                          aria-valuetext={`${value}%`}
                          style={{ accentColor: control.color }}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="room-size-distribution-hint room-type-distribution-hint">
                  A primeira sala continua sendo a entrada; as demais seguem as frequências do perfil ou a personalização.
                </p>
                <details className="room-size-reference room-type-catalog">
                  <summary>
                    <span>CATÁLOGO DE TIPOS</span>
                    <small>{ROOM_TYPE_DEFINITIONS.length} funções</small>
                  </summary>
                  <div className="room-type-catalog-content">
                    {ROOM_TYPE_CATEGORY_ORDER.map((category) => {
                      const style = ROOM_TYPE_CATEGORIES[category];
                      const definitions = ROOM_TYPE_DEFINITIONS.filter((definition) => definition.category === category);
                      return (
                        <details className="room-type-category-details" key={category}>
                          <summary>
                            <span className="room-type-frequency-name">
                              <i style={{ backgroundColor: style.color }} />
                              {style.label}
                            </span>
                            <small>{definitions.length} funções</small>
                          </summary>
                          <div className="room-type-catalog-list">
                            {definitions.map((definition) => (
                              <div className="room-type-catalog-item" key={definition.title}>
                                <strong>{definition.title}</strong>
                                <small>{definition.description}</small>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              </>
            )}

            {settingsSection === "access" && (
              hasBspRooms ? (
                <>
                  <div className="section-heading settings-section-heading">
                    <span>CORREDORES E ACESSO</span>
                  </div>
                  <div className="parameter-list">
                    {corridorControls.map(renderParameterControl)}
                  </div>
                  <p className="corridor-compactness-hint">
                    Quanto maior a compactação, mais as salas se aproximam do centro da masmorra e menores ficam os trajetos.
                  </p>
                  <label className="double-door-option">
                    <input
                      type="checkbox"
                      checked={parameters.doubleDoorsEnabled}
                      disabled={parameters.corridorWidth !== 2}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;
                        setParameters((current) => ({ ...current, doubleDoorsEnabled: enabled }));
                      }}
                      aria-label="Permitir portas duplas em corredores de dois tiles"
                    />
                    <span>
                      <strong>Portas duplas</strong>
                      <small>
                        {parameters.corridorWidth === 2
                          ? "Duas folhas fecham toda a largura do corredor."
                          : "Defina a largura do corredor como 2 tiles para ativar."}
                      </small>
                    </span>
                  </label>
                  <label className="entrance-control" htmlFor="first-room-access">
                    <span>ACESSO DA PRIMEIRA SALA</span>
                    <select
                      id="first-room-access"
                      value={parameters.entranceMode}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        if (isEntranceMode(value)) {
                          setParameters((current) => ({ ...current, entranceMode: value }));
                        }
                      }}
                    >
                      {entranceModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <small>Selecione uma única forma de acesso ao exterior.</small>
                  </label>
                </>
              ) : (
                <p className="settings-unavailable">
                  Os ajustes de corredores e acesso dependem da estrutura do conceito selecionado.
                </p>
              )
            )}

            {settingsSection === "traps" && (
              <>
                <div className="section-heading settings-section-heading">
                  <span>PRESENÇA DE ARMADILHAS</span>
                </div>
                <div className="parameter-list">
                  {trapChanceControls.map(renderParameterControl)}
                </div>
                <p className="shape-frequency-hint trap-frequency-hint">
                  A chance por sala só se aplica a conceitos com salas. Nos corredores e cavernas, a chance é verificada por tile candidato e a geração limita o total a uma ou três armadilhas.
                </p>

                <div className="section-heading settings-section-heading">
                  <span>PESOS POR CATEGORIA</span>
                </div>
                <label className="room-size-distribution-toggle room-type-distribution-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.trapCategoryDistributionEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setParameters((current) => ({ ...current, trapCategoryDistributionEnabled: enabled }));
                    }}
                    aria-label="Personalizar frequências das categorias de armadilhas"
                  />
                  <span>
                    <strong>Personalizar frequências</strong>
                    <small>
                      {parameters.trapCategoryDistributionEnabled
                        ? "Os percentuais abaixo substituem os pesos do conceito."
                        : `${conceptProfile.name} determina os pesos; ative para personalizá-los.`}
                    </small>
                  </span>
                </label>
                <div className={`parameter-list room-type-frequency-list${parameters.trapCategoryDistributionEnabled ? "" : " disabled"}`}>
                  {trapCategoryFrequencyControls.map((control) => {
                    const effectiveWeights = parameters.trapCategoryDistributionEnabled
                      ? parameters.trapCategoryWeights
                      : conceptProfile.trapCategoryWeights;
                    const value = getFrequencyPercentages(
                      effectiveWeights,
                      TRAP_CATEGORY_ORDER,
                    )[control.key];
                    return (
                      <label
                        className="parameter-control"
                        htmlFor={`trap-category-frequency-${control.key}`}
                        key={control.key}
                      >
                        <span className="parameter-label">
                          <span>{control.label}</span>
                          <strong>{value}%</strong>
                        </span>
                        <input
                          id={`trap-category-frequency-${control.key}`}
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          disabled={!parameters.trapCategoryDistributionEnabled}
                          onChange={(event) => updateTrapCategoryFrequency(control.key, Number(event.currentTarget.value))}
                          aria-label={`Frequência da categoria ${control.label}`}
                          aria-valuetext={`${value}%`}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="shape-frequency-hint trap-frequency-hint">
                  As frequências totalizam 100%. Dentro da categoria sorteada, o tipo depende do espaço e das opções compatíveis.
                </p>

                <details className="room-size-reference room-type-catalog trap-catalog">
                  <summary>
                    <span>CATÁLOGO DE ARMADILHAS</span>
                    <small>{TRAP_TYPES.length} tipos</small>
                  </summary>
                  <div className="room-type-catalog-content">
                    {TRAP_CATEGORY_ORDER.map((category) => {
                      const definitions = TRAP_TYPES
                        .filter((type) => TRAP_DEFINITIONS[type].category === category)
                        .map((type) => ({ type, ...TRAP_DEFINITIONS[type] }));
                      return (
                        <details className="room-type-category-details" key={category}>
                          <summary>
                            <span>{TRAP_CATEGORY_LABELS[category]}</span>
                            <small>{definitions.length} tipos</small>
                          </summary>
                          <div className="room-type-catalog-list">
                            {definitions.map((definition) => (
                              <div className="room-type-catalog-item" key={definition.type}>
                                <strong>{definition.label}</strong>
                                <small>{definition.description}</small>
                                <small className="trap-catalog-placement">
                                  {definition.placement === "room"
                                    ? "Somente em salas"
                                    : definition.placement === "corridor"
                                      ? "Somente em corredores e cavernas"
                                      : "Salas, corredores e cavernas"}
                                </small>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              </>
            )}

            {settingsSection === "treasures" && (
              <>
                <div className="section-heading settings-section-heading">
                  <span>PRESENÇA DE TESOUROS</span>
                </div>
                <div className="parameter-list">
                  {treasureChanceControls.map(renderParameterControl)}
                </div>
                <p className="shape-frequency-hint trap-frequency-hint">
                  A chance-base é ajustada pelo tipo da sala: cofres e salas de tesouro recebem mais recompensas; salas comuns, menos. Tesouros aparecem apenas no guia e nos detalhes da sala, nunca como marcadores no mapa.
                </p>
                <label className="room-size-distribution-toggle room-type-distribution-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.treasureConsumablesEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setParameters((current) => ({ ...current, treasureConsumablesEnabled: enabled }));
                    }}
                    aria-label="Incluir consumíveis na geração de tesouros"
                  />
                  <span>
                    <strong>Incluir consumíveis</strong>
                    <small>Poções, pergaminhos, venenos e outros recursos de uso limitado.</small>
                  </span>
                </label>

                <div className="section-heading settings-section-heading">
                  <span>CATEGORIAS POR CONCEITO</span>
                </div>
                <label className="room-size-distribution-toggle room-type-distribution-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.treasureCategoryDistributionEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setParameters((current) => ({ ...current, treasureCategoryDistributionEnabled: enabled }));
                    }}
                    aria-label="Personalizar frequências das categorias de tesouro"
                  />
                  <span>
                    <strong>Personalizar frequências</strong>
                    <small>
                      {parameters.treasureCategoryDistributionEnabled
                        ? "Os percentuais abaixo substituem os pesos do conceito."
                        : `${conceptProfile.name} determina os pesos; ative para personalizá-los.`}
                    </small>
                  </span>
                </label>
                <div className={`parameter-list room-type-frequency-list${parameters.treasureCategoryDistributionEnabled ? "" : " disabled"}`}>
                  {treasureCategoryFrequencyControls.map((control) => {
                    const effectiveWeights = parameters.treasureCategoryDistributionEnabled
                      ? parameters.treasureCategoryWeights
                      : conceptProfile.treasureCategoryWeights;
                    const value = getFrequencyPercentages(
                      effectiveWeights,
                      TREASURE_CATEGORY_ORDER,
                    )[control.key];
                    return (
                      <label
                        className="parameter-control"
                        htmlFor={`treasure-category-frequency-${control.key}`}
                        key={control.key}
                      >
                        <span className="parameter-label">
                          <span>{control.label}</span>
                          <strong>{value}%</strong>
                        </span>
                        <input
                          id={`treasure-category-frequency-${control.key}`}
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          disabled={!parameters.treasureCategoryDistributionEnabled}
                          onChange={(event) => updateTreasureCategoryFrequency(control.key, Number(event.currentTarget.value))}
                          aria-label={`Frequência da categoria ${control.label}`}
                          aria-valuetext={`${value}%`}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="shape-frequency-hint trap-frequency-hint">
                  As frequências totalizam 100%. A categoria influencia qual grupo de recompensa pode aparecer em cada sala.
                </p>

                <div className="section-heading settings-section-heading">
                  <span>RARIDADE DOS ITENS MÁGICOS</span>
                </div>
                <label className="room-size-distribution-toggle room-type-distribution-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.treasureRarityDistributionEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      setParameters((current) => ({ ...current, treasureRarityDistributionEnabled: enabled }));
                    }}
                    aria-label="Personalizar frequências de raridade dos itens mágicos"
                  />
                  <span>
                    <strong>Personalizar raridades</strong>
                    <small>O padrão favorece itens comuns e torna os lendários muito raros.</small>
                  </span>
                </label>
                <div className={`parameter-list room-type-frequency-list${parameters.treasureRarityDistributionEnabled ? "" : " disabled"}`}>
                  {treasureRarityFrequencyControls.map((control) => {
                    const effectiveWeights = parameters.treasureRarityDistributionEnabled
                      ? parameters.treasureRarityWeights
                      : DEFAULT_TREASURE_RARITY_WEIGHTS;
                    const value = getFrequencyPercentages(
                      effectiveWeights,
                      TREASURE_RARITY_ORDER,
                    )[control.key];
                    return (
                      <label
                        className="parameter-control"
                        htmlFor={`treasure-rarity-frequency-${control.key}`}
                        key={control.key}
                      >
                        <span className="parameter-label">
                          <span>{control.label}</span>
                          <strong>{value}%</strong>
                        </span>
                        <input
                          id={`treasure-rarity-frequency-${control.key}`}
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={value}
                          disabled={!parameters.treasureRarityDistributionEnabled}
                          onChange={(event) => updateTreasureRarityFrequency(control.key, Number(event.currentTarget.value))}
                          aria-label={`Frequência da raridade ${control.label}`}
                          aria-valuetext={`${value}%`}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="shape-frequency-hint trap-frequency-hint">
                  A raridade é sorteada somente depois que a categoria de item mágico é selecionada.
                </p>

                <details className="room-size-reference room-type-catalog trap-catalog">
                  <summary>
                    <span>CATÁLOGO DE TESOUROS</span>
                    <small>{TREASURE_CATEGORY_ORDER.reduce((total, category) => total + TREASURE_CATALOG[category].length, 0)} tipos</small>
                  </summary>
                  <div className="room-type-catalog-content">
                    {TREASURE_CATEGORY_ORDER.map((category) => (
                      <details className="room-type-category-details" key={category}>
                        <summary>
                          <span>{TREASURE_CATEGORY_LABELS[category]}</span>
                          <small>{TREASURE_CATALOG[category].length} tipos</small>
                        </summary>
                        <div className="room-type-catalog-list">
                          {TREASURE_CATALOG[category].map((definition) => (
                            <div className="room-type-catalog-item" key={definition.id}>
                              <strong>{definition.label}</strong>
                              <small>{definition.description}</small>
                              <small className="trap-catalog-placement">
                                Locais: {definition.locations}
                                {"rarity" in definition && definition.rarity
                                  ? ` · ${TREASURE_RARITY_LABELS[definition.rarity]}`
                                  : ""}
                                {"discoveryMethod" in definition && definition.discoveryMethod
                                  ? ` · Descoberta: ${definition.discoveryMethod}`
                                  : ""}
                              </small>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
          <p className="parameter-hint">Os ajustes atualizam o mapa automaticamente.</p>

          <div className="sidebar-footer">
            <span className="status-dot" />
            GERADOR ONLINE
            <span className="version">v0.1.0</span>
          </div>
        </aside>

        <section className="map-panel" aria-label="Masmorra procedural">
          <div className="map-toolbar">
            <div className="map-title">
              <span className="live-dot" />
              <div>
                <strong>MAPA GERADO</strong>
                <small>{conceptProfile.name}</small>
              </div>
            </div>
            <div className="map-toolbar-actions">
              <span className="map-coordinate">{dungeon.width} × {dungeon.height} <span>GRID · 1 TILE = 1 M</span></span>
            </div>
          </div>

          <div className="map-frame">
            <div className="corner-mark corner-top-left" />
            <div className="corner-mark corner-top-right" />
            <div className="corner-mark corner-bottom-left" />
            <div className="corner-mark corner-bottom-right" />
            <DungeonCanvas
              dungeon={dungeon}
              generationKey={generatedDungeon}
              focusRequest={focusRequest}
              onRoomMove={moveRoom}
              onRoomSelect={openRoomDetails}
              onRoomMoveEnd={selectMovedRoom}
              onClearSelection={() => setFocusRequest(null)}
              showWater={showWater}
              showLava={showLava}
              onToggleWater={() => setShowWater((visible) => !visible)}
              onToggleLava={() => setShowLava((visible) => !visible)}
            />
            <div className="map-overlay-label">NÍVEL 01 <span>/</span> PROCEDURAL</div>
          </div>

          <div className="map-legend">
            <span><i className="legend-room" /> {floorLabel}</span>
            {dungeon.tiles.some((row) => row.includes(CAVE_TILE)) && (
              <span><i className="legend-cave" /> CAVERNA</span>
            )}
            {hasOpenCaveConnection && (
              <span title="A caverna encontra a sala sem parede entre elas">
                <i className="legend-cave-opening" /> ABERTURA
              </span>
            )}
            {dungeon.tiles.some((row) => row.includes(CAVE_CONNECTION_WALL_TILE)) && (
              <span title="Parede íntegra e rachada que pode ser rompida para acessar a caverna">
                <i className="legend-cave-wall" /> PAREDE FRÁGIL
              </span>
            )}
            {dungeon.tiles.some((row) => row.includes(CAVE_BREACH_TILE)) && (
              <span title="Trecho de parede demolido, com passagem entre sala e caverna">
                <i className="legend-cave-breach" /> PAREDE DEMOLIDA
              </span>
            )}
            {dungeon.roomDetails.length > 0 && <span><i className="legend-room-number" /> SALA NUMERADA</span>}
            {dungeon.tiles.some((row) => row.includes(PILLAR_TILE)) && <span><i className="legend-pillar" /> PILARES</span>}
            {dungeon.tiles.some((row) => row.includes(ELEVATED_FLOOR_TILE)) && <span><i className="legend-multilevel" /> NÍVEIS</span>}
            {dungeon.tiles.some((row) => row.some((tile) => (
              tile === WATER_TILE
              || tile === CAVE_WATER_TILE
              || tile === CAVE_WATERFALL_TILE
              || tile === CAVE_SPRING_TILE
            ))) && <span><i className="legend-water" /> ÁGUA</span>}
            {dungeon.tiles.some((row) => row.some((tile) => (
              tile === LAVA_TILE
              || tile === CAVE_LAVA_TILE
              || tile === CAVE_LAVA_FALL_TILE
              || tile === CAVE_LAVA_VENT_TILE
            ))) && <span><i className="legend-lava" /> LAVA</span>}
            {dungeon.tiles.some((row) => row.includes(CAVE_WATERFALL_TILE)) && (
              <span><i className="legend-cave-waterfall" /> CACHOEIRA</span>
            )}
            {dungeon.tiles.some((row) => row.includes(CAVE_LAVA_FALL_TILE)) && (
              <span><i className="legend-cave-lavafall" /> CASCATA DE LAVA</span>
            )}
            {dungeon.tiles.some((row) => row.includes(CAVE_SPRING_TILE)) && (
              <span><i className="legend-cave-spring" /> FONTE / NASCENTE</span>
            )}
            {dungeon.tiles.some((row) => row.includes(CAVE_LAVA_VENT_TILE)) && (
              <span><i className="legend-cave-vent" /> FENDA DE LAVA</span>
            )}
            {hasBspRooms && <span><i className="legend-corridor" /> CORREDOR</span>}
            {dungeon.tiles.some((row) => row.includes(DOOR_TILE)) && <span><i className="legend-door" /> PORTA</span>}
            {dungeon.tiles.some((row) => row.includes(SECRET_DOOR_TILE)) && <span><i className="legend-secret-door" /> PORTA SECRETA</span>}
            {dungeon.tiles.some((row) => row.includes(STAIRS_UP_TILE)) && <span><i className="legend-stairs-up" /> ESCADA ↑</span>}
            {dungeon.tiles.some((row) => row.includes(STAIRS_DOWN_TILE)) && <span><i className="legend-stairs-down" /> ESCADA ↓</span>}
            {dungeon.tiles.some((row) => row.includes(EXTERIOR_ENTRANCE_TILE)) && <span><i className="legend-exterior-entrance" /> ENTRADA EXTERIOR</span>}
            {dungeon.tiles.some((row) => row.includes(EXTERIOR_CONNECTION_TILE)) && <span><i className="legend-exterior-connection" /> CONEXÃO EXTERIOR</span>}
            <span><i className="legend-wall" /> PAREDE</span>
            <span className="seed-label">SEED <strong>{seed}</strong></span>
          </div>
          {usedRoomCategories.length > 0 && (
            <details className="room-type-legend">
              <summary>
                <span>TIPOS DE SALA</span>
                <small>{usedRoomCategories.length} categorias</small>
              </summary>
              <div>
                {usedRoomCategories.map((category) => {
                  const style = ROOM_TYPE_CATEGORIES[category];
                  return (
                    <span key={category}>
                      <i style={{ backgroundColor: style.color }} />
                      {style.label}
                    </span>
                  );
                })}
              </div>
            </details>
          )}

          <div className="stats-row">
            <div className="stat-card">
              <span>ÁREA EXPLORÁVEL</span>
              <strong>{floorPercentage}<small>%</small></strong>
              <div className="stat-meter"><i style={{ width: `${floorPercentage}%` }} /></div>
            </div>
            <div className="stat-card">
              <span>TILES ABERTOS</span>
              <strong>{dungeon.floorCount.toLocaleString("pt-BR")}<small> / {dungeon.width * dungeon.height}</small></strong>
              <p>{floorDescription}</p>
            </div>
            <div className="stat-card">
              <span>SALAS GERADAS</span>
              <strong>{dungeon.rooms.toString().padStart(2, "0")}</strong>
              <p>{conceptProfile.generationDescription}</p>
            </div>
          </div>
          <details className="room-metadata-section" open>
            <summary>
              <span>METADADOS DAS SALAS</span>
              <small>{dungeon.roomDetails.length} salas · categorias por sala</small>
              </summary>
              <p className="room-metadata-note">
                Encontros, ocupação, recompensas e atributos narrativos são sugestões; armadilhas seguem as taxas do gerador.
              </p>
              <div className="room-metadata-list">
                {dungeon.roomDetails.map((room) => {
                  const roomType = room.roomType.title;
                  const metadata = createRoomMetadataFields(room, roomType, seed, dungeon, room.roomType.description);
                  const shapeDefinition = ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === room.shape);
                  return (
                    <RoomMetadataCard
                      key={room.number}
                      roomNumber={room.number}
                      roomType={roomType}
                      shape={shapeDefinition?.label ?? roomShapeLabels[room.shape]}
                      width={room.width}
                      height={room.height}
                      metadata={metadata}
                    />
                  );
              })}
            </div>
          </details>
        </section>

        <aside className="room-panel" aria-label="Guias da masmorra">
          <div className="room-panel-tools">
            <DungeonExportControl dungeon={dungeon} />
          </div>
          <div className="room-index">
            <div className="room-index-heading">
              <div>
                <span className="room-index-kicker">GUIA DE SALAS</span>
                <strong>Salas e armadilhas</strong>
                <small className="room-index-summary">
                  {dungeon.roomDetails.length} salas · {roomTrapCount + generatedTraps.length} armadilhas
                </small>
              </div>
              <span className="room-total">
                {dungeon.roomDetails.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="room-list" ref={guideListRef}>
              {dungeon.roomDetails.length === 0 && (
                <div className="room-empty">
                  <span className="empty-room-icon" aria-hidden="true">⌁</span>
                  <strong>Sem salas individuais</strong>
                  <p>Este conceito não gera salas numeradas; armadilhas de cavernas e trilhas aparecem abaixo.</p>
                </div>
              )}
              {dungeon.roomDetails.map((room) => {
                const roomCategory = ROOM_TYPE_CATEGORIES[room.roomType.category];
                const shapeDefinition = ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === room.shape);
                const treasureDefinition = room.treasure
                  ? getTreasureDefinition(room.treasure.type)
                  : undefined;
                const isSelected = focusRequest?.roomNumber === room.number;
                return (
                  <button
                    className={`room-entry room-entry-button ${isSelected ? "selected" : ""}`}
                    key={room.number}
                    type="button"
                    data-room-number={room.number}
                    aria-label={`Ver detalhes da sala ${room.number}: ${room.roomType.title}, categoria ${roomCategory.label}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      openRoomDetails(room.number);
                    }}
                  >
                    <span
                      className="room-badge"
                      style={{ backgroundColor: roomCategory.color, borderColor: roomCategory.color, color: "#10141b" }}
                      title={roomCategory.label}
                    >
                      {room.number.toString().padStart(2, "0")}
                    </span>
                    <span className="room-copy">
                      <span className="room-copy-heading">
                        <strong>{room.roomType.title}</strong>
                        <small
                          className="room-category-tag"
                          style={{ borderColor: roomCategory.color, color: roomCategory.color }}
                        >
                          {roomCategory.shortLabel}
                        </small>
                        {room.liquidFeature && room.liquidType && (
                          <small className={`liquid-feature-tag ${room.liquidType}-feature-tag`}>
                            {liquidFeatureLabels[room.liquidType][room.liquidFeature]}
                          </small>
                        )}
                        {room.trap && (
                          <small className="trap-feature-tag" title={TRAP_DEFINITIONS[room.trap].description}>
                            {TRAP_DEFINITIONS[room.trap].label}
                          </small>
                        )}
                        {room.treasure && (
                          <small
                            className="treasure-feature-tag"
                            title={treasureDefinition?.description}
                          >
                            {treasureDefinition?.label ?? "Tesouro"}
                          </small>
                        )}
                      </span>
                      <small className="room-entry-summary">
                        {shapeDefinition?.label ?? roomShapeLabels[room.shape]} · {room.width} × {room.height} m
                        {room.trap ? " · Com armadilha" : ""}
                        {room.treasure ? " · Com tesouro" : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
              {generatedTraps.length > 0 && (
                <section className="trap-guide-list" aria-label="Armadilhas em corredores e cavernas">
                  <h3 className="trap-guide-section-title">Armadilhas em circulação</h3>
                  {generatedTraps.map((trap) => {
                    const definition = TRAP_DEFINITIONS[trap.type];
                    const location = dungeon.tiles[trap.y]?.[trap.x] === CAVE_TILE
                      ? "Caverna"
                      : hasBspRooms
                        ? trap.corridorRoomNumbers.length === 2
                          ? `Corredor ${[...trap.corridorRoomNumbers].sort((a, b) => a - b).map((number) => number.toString().padStart(2, "0")).join(" ↔ ")}`
                          : "Corredor"
                        : algorithm === "cellular" ? "Caverna" : "Trilha";
                    return (
                      <article className="room-entry trap-guide-entry" key={`${trap.x}-${trap.y}`}>
                        <span className="room-badge trap-guide-badge" aria-hidden="true">!</span>
                        <span className="room-copy">
                          <span className="room-copy-heading">
                            <strong>{definition.label}</strong>
                            <small className="trap-feature-tag">{TRAP_CATEGORY_LABELS[definition.category]}</small>
                            <small className="trap-feature-tag">{location}</small>
                          </span>
                          <small className="trap-feature-description">{definition.description}</small>
                        </span>
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          </div>
        </aside>
      </div>
      <dialog
        className="room-detail-dialog"
        ref={roomDetailDialogRef}
        aria-labelledby="room-detail-title"
        onClose={() => {
          setRoomDetailNumber(null);
          if (preserveRoomFocusOnCloseRef.current) {
            preserveRoomFocusOnCloseRef.current = false;
          } else {
            setFocusRequest((current) => current
              ? { ...current, shouldFocus: false }
              : null);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) roomDetailDialogRef.current?.close();
        }}
      >
        {roomDetail && roomDetailCategory && roomDetailSize && (
          <div className="room-detail-shell">
            <header className="room-detail-header">
              <span
                className="room-detail-number"
                style={{ backgroundColor: roomDetailCategory.color, borderColor: roomDetailCategory.color, color: "#10141b" }}
              >
                {roomDetail.number.toString().padStart(2, "0")}
              </span>
              <div className="room-detail-title-copy">
                <span className="room-detail-category" style={{ color: roomDetailCategory.color }}>
                  {roomDetailCategory.label}
                </span>
                <h2 id="room-detail-title">{roomDetail.roomType.title}</h2>
                <p>{roomDetail.roomType.description}</p>
              </div>
              <button
                className="room-detail-close"
                type="button"
                aria-label="Fechar detalhes da sala"
                onClick={() => roomDetailDialogRef.current?.close()}
              >
                ×
              </button>
            </header>
            <div className="room-detail-scroll">
              <section className="room-detail-overview" aria-label="Resumo da sala">
                <div className="room-detail-facts">
                  <div>
                    <span>FORMATO</span>
                    <strong>{roomDetailShape?.label ?? roomShapeLabels[roomDetail.shape]}</strong>
                  </div>
                  <div>
                    <span>DIMENSÕES</span>
                    <strong>{roomDetail.width} × {roomDetail.height} m · {roomDetail.width * roomDetail.height} m²</strong>
                  </div>
                  <div>
                    <span>PORTE</span>
                    <strong>{roomDetailSize.label}</strong>
                    <small>{roomDetailSize.dimensions} · uso: {roomDetailSize.usage}</small>
                  </div>
                  <div>
                    <span>POSIÇÃO NA GRADE</span>
                    <strong>{roomDetail.x}, {roomDetail.y}</strong>
                  </div>
                </div>
                {roomDetail.number === 1 && (
                  <p className="room-detail-entrance">
                    {parameters.entranceMode === "upper-stairs"
                      ? "Acesso pela escadaria superior da masmorra."
                      : parameters.entranceMode === "exterior-entrance"
                        ? "Entrada vinda do exterior da masmorra."
                        : "Conexão entre esta sala e o exterior da masmorra."}
                  </p>
                )}
                {roomDetailShape && (
                  <div className="room-detail-shape">
                    <strong>{roomDetailShape.characteristics}</strong>
                    <small>Aplicações: {roomDetailShape.applications}</small>
                  </div>
                )}
                {roomDetail.liquidType && roomDetail.liquidFeature && (
                  <div className={`room-detail-feature ${roomDetail.liquidType}-feature-tag`}>
                    <strong>{liquidFeatureLabels[roomDetail.liquidType][roomDetail.liquidFeature]} · {roomDetail.liquidType === "water" ? "Água" : "Lava"}</strong>
                    <small>Elemento ambiental incluído nesta sala.</small>
                  </div>
                )}
                {roomDetail.trap && (
                  <div className="room-detail-feature trap-detail-feature">
                    <strong>
                      {TRAP_DEFINITIONS[roomDetail.trap].label}
                      <span>{TRAP_CATEGORY_LABELS[TRAP_DEFINITIONS[roomDetail.trap].category]}</span>
                    </strong>
                    <small>{TRAP_DEFINITIONS[roomDetail.trap].description}</small>
                  </div>
                )}
                {roomDetail.treasure && (
                  <div className="room-detail-feature treasure-detail-feature">
                    <strong>
                      {roomDetailTreasureDefinition?.label ?? "Tesouro"}
                      <span>{TREASURE_CATEGORY_LABELS[roomDetail.treasure.category]}</span>
                      {roomDetail.treasure.rarity && (
                        <span>{TREASURE_RARITY_LABELS[roomDetail.treasure.rarity]}</span>
                      )}
                    </strong>
                    <small>{roomDetailTreasureDefinition?.description}</small>
                    {roomDetailTreasureDefinition && (
                      <small>Locais comuns: {roomDetailTreasureDefinition.locations}</small>
                    )}
                    {roomDetail.treasure.details.map((detail) => (
                      <small key={detail}>{detail}</small>
                    ))}
                  </div>
                )}
              </section>
              <section className="room-detail-metadata" aria-label="Informações complementares">
                <div className="room-detail-section-heading">
                  <h3>Contexto e detalhes</h3>
                  <small>Informações narrativas são sugestões para desenvolver a masmorra.</small>
                </div>
                <nav className="room-metadata-nav" role="tablist" aria-label="Categorias de detalhes da sala">
                  {roomMetadataSections.map((section) => (
                    <button
                      id={`room-detail-tab-${section.key}`}
                      className={roomDetailSection === section.key ? "active" : ""}
                      type="button"
                      role="tab"
                      aria-selected={roomDetailSection === section.key}
                      aria-controls={`room-detail-panel-${section.key}`}
                      key={section.key}
                      onClick={() => setRoomDetailSection(section.key)}
                    >
                      {section.label}
                      <small>{section.properties.length}</small>
                    </button>
                  ))}
                </nav>
                <div
                  className="room-detail-metadata-panel"
                  id={`room-detail-panel-${roomDetailSection}`}
                  role="tabpanel"
                  aria-labelledby={`room-detail-tab-${roomDetailSection}`}
                  tabIndex={0}
                >
                  <dl>
                    {roomDetailMetadata
                      .filter((field) => roomDetailMetadataProperties?.includes(field.property))
                      .map((field) => (
                        <div className="room-metadata-row" key={field.property}>
                          <dt>
                            <code>{field.property}</code>
                            <small>{field.purpose}</small>
                          </dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              </section>
            </div>
            <footer className="room-detail-footer">
              <button
                className="room-detail-button room-detail-dismiss"
                type="button"
                onClick={() => roomDetailDialogRef.current?.close()}
              >
                Fechar
              </button>
              <button
                className="room-detail-button room-detail-focus"
                type="button"
                onClick={() => {
                  preserveRoomFocusOnCloseRef.current = true;
                  setFocusRequest((current) => ({
                    type: "room",
                    roomNumber: roomDetail.number,
                    requestId: (current?.requestId ?? 0) + 1,
                    shouldFocus: true,
                  }));
                  roomDetailDialogRef.current?.close();
                }}
              >
                Localizar no mapa
              </button>
            </footer>
          </div>
        )}
      </dialog>
      <button
        className="reroll-button reroll-floating"
        onClick={rerollDungeon}
        aria-label="Rerollar masmorra"
        title="Rerollar masmorra"
        data-tooltip="Rerollar masmorra"
      >
        <span className="reroll-icon" aria-hidden="true">⟳</span>
      </button>
    </main>
  );
}
