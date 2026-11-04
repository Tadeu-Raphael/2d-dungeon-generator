import { useState } from "react";
import {
  getEnvironmentalRoomTrapChance,
  PILLAR_TILE,
  ROOM_SHAPE_DEFINITIONS,
  ROOM_SIZE_CATEGORIES,
  TRAP_DEFINITIONS,
} from "../../dungeon";
import type {
  Dungeon,
  DungeonRoom,
  LiquidFeature,
  LiquidType,
  RoomShape,
} from "../../dungeon";
import { getRoomTreasureChance } from "../../treasures";

export type RoomMetadataSection = "structure" | "operations" | "narrative";

export interface RoomMetadataField {
  property: string;
  purpose: string;
  value: string;
}

export const roomShapeLabels: Record<RoomShape, string> = {
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

export const liquidFeatureLabels: Record<LiquidType, Record<LiquidFeature, string>> = {
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

export function getRoomSizeCategory(width: number, height: number) {
  const area = width * height;
  return ROOM_SIZE_CATEGORIES.find((category) => area <= category.maxArea)
    ?? ROOM_SIZE_CATEGORIES[ROOM_SIZE_CATEGORIES.length - 1];
}

export const roomMetadataSections: Array<{
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

const rotatableRoomShapes: ReadonlySet<RoomShape> = new Set([
  "lShaped",
  "tShaped",
  "crossShaped",
]);

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
  const trapLabels = room.traps.map((trap) => TRAP_DEFINITIONS[trap].label);
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
  const currentState = trapLabels.length > 0
    ? `Armadilhas presentes: ${trapLabels.join(", ")}`
    : room.liquidType
      ? `Ambiente alterado por ${room.liquidType === "water" ? "água" : "lava"}`
      : room.shape === "multiLevel"
        ? "Plataforma elevada preservada"
        : "Estado de conservação não simulado";
  const securityLevel = roomType === "Cofre" || roomType === "Tesouro"
    ? "Muito alta (sugestão)"
    : room.traps.length > 0 || isCombatRoom
      ? "Alta (sugestão)"
      : roomType === "Entrada" || roomType === "Vestíbulo"
        ? "Média (sugestão)"
        : "Baixa (sugestão)";
  const magicLevel = isRitualRoom || roomType === "Laboratório"
    ? "Alta (sugestão)"
    : room.shape === "multiLevel" || room.liquidType === "lava"
      ? "Média (sugestão)"
      : "Baixa (sugestão)";
  const decayLevel = room.liquidType === "water" || room.traps.includes("caveIn")
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
  if (room.traps.length > 0) themeTags.add("trapped");
  if (room.liquidType === "water") themeTags.add("flooded");
  if (room.liquidType === "lava") themeTags.add("volcanic");
  if (themeTags.size === 0) themeTags.add("abandoned");
  const specialFeatures = [
    shape,
    pillarCount > 0 ? `${pillarCount} pilares gerados` : "",
    room.liquidFeature && room.liquidType
      ? liquidFeatureLabels[room.liquidType][room.liquidFeature]
      : "",
    ...trapLabels,
  ].filter(Boolean).join("; ");
  const narrativeHook = trapLabels.length > 0
    ? trapLabels.length === 1
      ? `A armadilha "${trapLabels[0]}" protege algo ou tenta manter alguém preso?`
      : `Como as armadilhas (${trapLabels.join(", ")}) protegem este lugar e como podem ser superadas?`
    : room.liquidType
      ? `Quem alterou o ambiente com ${room.liquidType === "water" ? "água" : "lava"} e o que isso está escondendo?`
      : isCombatRoom
        ? "Quem ainda protege este local, e a quem essa defesa deveria impedir a entrada?"
        : isStorageRoom
          ? "O que foi guardado aqui e por que ainda não foi recuperado?"
          : isResearchRoom
            ? "Que registro ou experimento inacabado pode revelar o passado da masmorra?"
            : isRitualRoom
              ? "Que entidade ou promessa ainda está ligada a este lugar?"
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

export function createRoomMetadataFields(
  room: DungeonRoom,
  roomType: string,
  seed: number,
  dungeon: Pick<Dungeon, "tiles" | "roomTrapChancePercent" | "treasureChancePercent" | "trapCategoryWeights">,
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
      purpose: "Chance-base do primeiro item; adicionais podem aparecer",
      value: `${formatPercent(dungeon.roomTrapChancePercent)} (mais até duas armadilhas a 35% cada)`,
    },
    {
      property: "treasureChance",
      purpose: "Chance-base do primeiro item; adicionais podem aparecer",
      value: `${formatPercent(treasureChance)} (mais até dois tesouros a 35% cada)`,
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

export function RoomMetadataCard({
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
