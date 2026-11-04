import type { TreasureCategory, TreasureCategoryWeights, TreasureRarity, TreasureRarityWeights, TreasureType } from "../../dungeon";
import { TREASURE_CATEGORY_ORDER, TREASURE_CATALOG, TREASURE_RARITY_ORDER } from "../../dungeon";
import type { DungeonRoom, DungeonTreasure, TreasureDefinition } from "../../dungeon";

export const MAX_ROOM_TREASURES = 3;
export const ADDITIONAL_ROOM_ITEM_CHANCE = 0.35;

export function selectWeightedTreasureCategory(
  weights: TreasureCategoryWeights,
  consumablesEnabled: boolean,
  random: () => number,
): TreasureCategory | undefined {
  const categories = TREASURE_CATEGORY_ORDER.filter((category) =>
    (consumablesEnabled || category !== "consumables")
    && Number.isFinite(weights[category])
    && weights[category] > 0
    && TREASURE_CATALOG[category].length > 0,
  );
  const totalWeight = categories.reduce((total, category) => total + weights[category], 0);
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const category of categories) {
    choice -= weights[category];
    if (choice < 0) return category;
  }
  return categories[categories.length - 1];
}

export function selectWeightedTreasureRarity(
  weights: TreasureRarityWeights,
  random: () => number,
): TreasureRarity | undefined {
  const rarities = TREASURE_RARITY_ORDER.filter((rarity) =>
    Number.isFinite(weights[rarity]) && weights[rarity] > 0,
  );
  const totalWeight = rarities.reduce((total, rarity) => total + weights[rarity], 0);
  if (totalWeight === 0) return undefined;

  let choice = random() * totalWeight;
  for (const rarity of rarities) {
    choice -= weights[rarity];
    if (choice < 0) return rarity;
  }
  return rarities[rarities.length - 1];
}

export function normalizeTreasureText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function treasureMatchesRoom(definition: TreasureDefinition, room: DungeonRoom): boolean {
  const roomContext = normalizeTreasureText(`${room.roomType.title} ${room.roomType.description}`);
  const genericLocationWords = new Set(["sala", "salas", "camara", "camaras", "area", "areas", "local", "locais"]);
  return definition.locations.split(/[,;.]/).some((location) =>
    location
      .split(/[^a-z0-9]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !genericLocationWords.has(word))
      .some((word) => {
        const singular = word.endsWith("s") ? word.slice(0, -1) : word;
        return roomContext.includes(word) || roomContext.includes(singular);
      }),
  );
}

export function selectRandomValue<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

export function createTreasureDetails(
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
    details.push(
      `Tipo de item: ${selectRandomValue(["arma", "armadura", "ferramenta", "utensílio"], random)}.`,
      `Estado de conservação: ${selectRandomValue(["novo", "usado", "gasto pelo tempo", "danificado"], random)}.`,
    );
  } else if (category === "consumables") {
    details.push(
      `Consumibilidade: ${selectRandomValue(["uso único", "várias cargas", "recarregável"], random)}.`,
      `Efeito principal: ${selectRandomValue(["restauração", "aumento temporário", "alteração de estado", "dano indireto"], random)}.`,
    );
  } else if (category === "magical") {
    details.push(
      `Afinidade: ${selectRandomValue(["arcana", "divina", "primal", "psíquica"], random)}.`,
      `Dificuldade de ativação: ${selectRandomValue(["baixa", "média", "alta"], random)}.`,
    );
  } else if (category === "relics") {
    details.push(
      `Origem histórica: ${selectRandomValue(["império caído", "culto esquecido", "dinastia antiga", "civilização perdida"], random)}.`,
      `Estado: ${selectRandomValue(["intacto", "fragmentado", "desgastado", "misteriosamente preservado"], random)}.`,
    );
  } else if (category === "documents") {
    details.push(
      `Formato: ${selectRandomValue(["pergaminho", "tábula", "livro", "carta"], random)}.`,
      `Idioma: ${selectRandomValue(["comum", "antigo", "esquecido", "cifrado"], random)}.`,
    );
  } else if (category === "materials") {
    details.push(
      `Matéria-prima: ${selectRandomValue(["minério", "erva", "madeira", "pedra", "couro", "metal"], random)}.`,
      `Pureza: ${selectRandomValue(["bruta", "refinada", "misturada", "excepcional"], random)}.`,
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

export function placeRoomTreasures(
  rooms: DungeonRoom[],
  random: () => number,
  categoryWeights: TreasureCategoryWeights,
  rarityWeights: TreasureRarityWeights,
  chancePercent: number,
  consumablesEnabled: boolean,
): void {
  for (const room of rooms) {
    const baseChance = chancePercent;
    const roomChance = (room.roomType.category === "treasure" || room.roomType.title === "Cofre" || room.roomType.title === "Tesouro")
      ? Math.min(100, Math.round(baseChance * 3.4))
      : (room.roomType.category === "logistics")
        ? Math.min(100, Math.round(baseChance * 2))
        : (room.roomType.category === "arcane" || room.roomType.category === "religious")
          ? Math.min(100, Math.round(baseChance * 1.4))
          : Math.min(100, Math.round(baseChance * 0.4));
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