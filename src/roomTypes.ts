export type RoomTypeCategory =
  | "exploration"
  | "combat"
  | "habitation"
  | "logistics"
  | "religious"
  | "arcane"
  | "funerary"
  | "natural"
  | "puzzle"
  | "treasure"
  | "special";

export type RoomTypeCategoryFrequencies = Record<RoomTypeCategory, number>;

interface RoomTypeCategoryStyle {
  label: string;
  shortLabel: string;
  color: string;
  rgb: readonly [number, number, number];
}

export const ROOM_TYPE_CATEGORIES: Record<RoomTypeCategory, RoomTypeCategoryStyle> = {
  exploration: { label: "Exploração e circulação", shortLabel: "Exploração", color: "#82b4c3", rgb: [130, 180, 195] },
  combat: { label: "Combate", shortLabel: "Combate", color: "#d17f70", rgb: [209, 127, 112] },
  habitation: { label: "Descanso e habitação", shortLabel: "Habitação", color: "#9dbb7a", rgb: [157, 187, 122] },
  logistics: { label: "Armazenamento e logística", shortLabel: "Logística", color: "#c2a266", rgb: [194, 162, 102] },
  religious: { label: "Religiosas, cerimoniais e culturais", shortLabel: "Religiosa", color: "#b49aca", rgb: [180, 154, 202] },
  arcane: { label: "Magia, pesquisa e experimentação", shortLabel: "Arcana", color: "#78a5d6", rgb: [120, 165, 214] },
  funerary: { label: "Funerárias e horror", shortLabel: "Funerária", color: "#9b879b", rgb: [155, 135, 155] },
  natural: { label: "Naturais e cavernas", shortLabel: "Natural", color: "#72a887", rgb: [114, 168, 135] },
  puzzle: { label: "Enigmas e desafios", shortLabel: "Enigmas", color: "#58b8b1", rgb: [88, 184, 177] },
  treasure: { label: "Tesouro e recompensas", shortLabel: "Tesouro", color: "#e5b755", rgb: [229, 183, 85] },
  special: { label: "Especiais e narrativas", shortLabel: "Especial", color: "#d7839e", rgb: [215, 131, 158] },
};

export interface RoomTypeDefinition {
  title: string;
  description: string;
  category: RoomTypeCategory;
}

type RoomTypeContent = Omit<RoomTypeDefinition, "category">;

const ROOM_TYPES_BY_CATEGORY: Record<RoomTypeCategory, readonly RoomTypeContent[]> = {
  exploration: [
    { title: "Entrada", description: "Acesso principal e primeiro posto de guarda." },
    { title: "Vestíbulo", description: "Recebe quem entra na masmorra." },
    { title: "Corredor largo", description: "Conecta grandes áreas." },
    { title: "Antecâmara", description: "Prepara o acesso a uma área importante." },
    { title: "Encruzilhada", description: "Distribui o fluxo entre caminhos." },
    { title: "Passagem estreita", description: "Limita a movimentação e cria tensão." },
    { title: "Escadaria", description: "Conecta níveis diferentes." },
    { title: "Elevador ou poço de transporte", description: "Permite deslocamento vertical." },
    { title: "Sala de transição", description: "Separa setores temáticos." },
    { title: "Corredor em anel", description: "Permite circular ao redor de uma área." },
    { title: "Câmara de observação", description: "Permite vigiar outras áreas." },
    { title: "Passagem secreta", description: "Conecta áreas sem ser percebida facilmente." },
    { title: "Ponte subterrânea", description: "Cruza um obstáculo como abismos, água ou lava." },
  ],
  combat: [
    { title: "Guarita", description: "Ponto de vigilância dos acessos." },
    { title: "Sala de patrulha", description: "Pequena área de vigilância." },
    { title: "Quartel de soldados", description: "Acomoda vários combatentes." },
    { title: "Sala de emboscada", description: "Favorece ataques inesperados." },
    { title: "Câmara de combate", description: "Espaço aberto para um encontro." },
    { title: "Arena", description: "Confronto deliberado entre grupos." },
    { title: "Sala de treinamento", description: "Espaço para prática de combate." },
    { title: "Posto de artilharia", description: "Permite atacar de posições protegidas." },
    { title: "Câmara de guardiões", description: "Protege uma passagem importante." },
    { title: "Sala de monstros", description: "Abriga uma criatura territorial." },
    { title: "Câmara de ondas", description: "Recebe grupos sucessivos de inimigos." },
    { title: "Sala de duelo", description: "Favorece um combate individual." },
    { title: "Sala do campeão", description: "Abriga um inimigo especialmente poderoso." },
  ],
  habitation: [
    { title: "Alojamento", description: "Dormitório para habitantes ou guardas." },
    { title: "Dormitório coletivo", description: "Acomoda várias pessoas." },
    { title: "Quarto individual", description: "Alojamento de uma pessoa." },
    { title: "Aposentos de oficiais", description: "Alojamento mais confortável e reservado." },
    { title: "Câmara do líder", description: "Alojamento de uma figura importante." },
    { title: "Refeitório", description: "Espaço comum para refeições." },
    { title: "Cozinha", description: "Preparo de alimentos e provisões." },
    { title: "Despensa", description: "Armazenamento de alimentos." },
    { title: "Banheiro", description: "Espaço para higiene e necessidades fisiológicas." },
    { title: "Balneário", description: "Local de banhos coletivos." },
    { title: "Lavanderia", description: "Limpeza de roupas e tecidos." },
    { title: "Sala de convívio", description: "Espaço de socialização e lazer." },
    { title: "Enfermaria", description: "Tratamento de feridos." },
    { title: "Cela individual", description: "Mantém um prisioneiro isolado." },
    { title: "Cela coletiva", description: "Alojamento de vários prisioneiros." },
    { title: "Sala de interrogatório", description: "Interrogação de prisioneiros." },
    { title: "Sala de guarda", description: "Permanência de sentinelas." },
    { title: "Prisão", description: "Área de detenção para cativos." },
  ],
  logistics: [
    { title: "Depósito", description: "Armazenamento de suprimentos." },
    { title: "Depósito geral", description: "Armazenamento variado." },
    { title: "Arsenal", description: "Armas e equipamentos." },
    { title: "Cofre", description: "Proteção de itens valiosos." },
    { title: "Tesouraria", description: "Armazenamento de riquezas." },
    { title: "Arquivo", description: "Guarda documentos e registros." },
    { title: "Biblioteca", description: "Conhecimento organizado em livros e registros." },
    { title: "Oficina", description: "Reparos e fabricação." },
    { title: "Ferraria", description: "Trabalho com metais." },
    { title: "Fundição", description: "Produção de peças metálicas." },
    { title: "Carpintaria", description: "Fabricação de estruturas de madeira." },
    { title: "Depósito de explosivos", description: "Armazenamento de materiais perigosos." },
    { title: "Armazém de alimentos", description: "Conservação de mantimentos." },
    { title: "Câmara frigorífica", description: "Conservação por frio." },
    { title: "Sala de troféus", description: "Exibição de conquistas." },
    { title: "Sala de equipamentos", description: "Guarda objetos de uso coletivo." },
    { title: "Sala de descarte", description: "Acúmulo de resíduos e objetos quebrados." },
    { title: "Escritório", description: "Administração e planejamento." },
  ],
  religious: [
    { title: "Capela", description: "Espaço religioso pequeno." },
    { title: "Santuário", description: "Lugar de veneração." },
    { title: "Templo", description: "Local de culto coletivo." },
    { title: "Grande salão cerimonial", description: "Espaço para eventos religiosos ou políticos." },
    { title: "Câmara de sacrifícios", description: "Local de rituais com oferendas ou sacrifícios." },
    { title: "Sala de iniciação", description: "Espaço para cerimônias de entrada em uma ordem." },
    { title: "Sala de juramentos", description: "Local para pactos e compromissos formais." },
    { title: "Cripta sagrada", description: "Guarda restos de figuras veneradas." },
    { title: "Mausoléu", description: "Monumento funerário individual ou familiar." },
    { title: "Ossuário", description: "Armazenamento de ossos humanos." },
    { title: "Salão dos ancestrais", description: "Homenagem aos antepassados." },
    { title: "Câmara de relíquias", description: "Protege objetos sagrados." },
    { title: "Sala de oráculos", description: "Busca revelações ou profecias." },
    { title: "Salão de assembleia", description: "Reuniões de grupos ou ordens." },
    { title: "Salão do trono", description: "Sede de autoridade política ou sobrenatural." },
    { title: "Salão de banquetes", description: "Espaço para festividades e recepções." },
    { title: "Câmara ritual", description: "Espaço para cerimônias e invocações." },
  ],
  arcane: [
    { title: "Laboratório", description: "Espaço para experimentos e estudos arcanos." },
    { title: "Laboratório arcano", description: "Pesquisa mágica geral." },
    { title: "Laboratório de alquimia", description: "Preparação de substâncias." },
    { title: "Sala de encantamento", description: "Criação de itens mágicos." },
    { title: "Observatório", description: "Estudo de astros e fenômenos." },
    { title: "Sala de invocação", description: "Contato com outras entidades." },
    { title: "Câmara dimensional", description: "Experimentos com espaço e planos." },
    { title: "Laboratório biológico", description: "Estudo de criaturas e organismos." },
    { title: "Sala de contenção", description: "Isolamento de entidades perigosas." },
    { title: "Câmara de cristais", description: "Armazenamento ou estudo de cristais." },
    { title: "Sala de energia", description: "Produção ou distribuição de energia." },
    { title: "Câmara de experimentos", description: "Local para testes perigosos." },
    { title: "Arquivo proibido", description: "Guarda conhecimento perigoso ou restrito." },
    { title: "Câmara de suspensão", description: "Conservação de corpos ou criaturas." },
    { title: "Sala de controle", description: "Operação de mecanismos complexos." },
    { title: "Câmara de testes mágicos", description: "Avalia habilidades ou artefatos." },
    { title: "Cofre arcano", description: "Protege objetos extremamente valiosos." },
  ],
  funerary: [
    { title: "Cripta", description: "Sepultamento de antigos moradores." },
    { title: "Câmara funerária", description: "Sepultamento de indivíduos." },
    { title: "Tumba individual", description: "Sepultura de uma pessoa importante." },
    { title: "Tumba coletiva", description: "Sepultamento de várias pessoas." },
    { title: "Catacumba", description: "Rede de passagens funerárias." },
    { title: "Câmara de embalsamamento", description: "Preparação de cadáveres." },
    { title: "Sala de cremação", description: "Incineração de corpos." },
    { title: "Câmara dos mortos", description: "Reúne corpos ou sarcófagos." },
    { title: "Cripta dos nobres", description: "Sepultamento de famílias importantes." },
    { title: "Câmara de profanação", description: "Local sagrado violado ou corrompido." },
    { title: "Sala de necromancia", description: "Manipulação de mortos." },
    { title: "Câmara de contenção dos mortos", description: "Aprisionamento de mortos-vivos." },
    { title: "Poço de descarte de corpos", description: "Depósito vertical de cadáveres." },
    { title: "Sala de vigília funerária", description: "Observação e proteção dos mortos." },
    { title: "Câmara do cadáver ausente", description: "Túmulo vazio com sinais de acontecimentos recentes." },
  ],
  natural: [
    { title: "Câmara natural", description: "Grande cavidade irregular." },
    { title: "Gruta estreita", description: "Pequena cavidade de acesso difícil." },
    { title: "Caverna principal", description: "Grande espaço subterrâneo com múltiplos caminhos." },
    { title: "Lago subterrâneo", description: "Ambiente natural ocupado por água." },
    { title: "Rio subterrâneo", description: "Curso de água atravessa a área." },
    { title: "Poço vertical", description: "Grande cavidade com diferentes alturas." },
    { title: "Câmara de estalactites", description: "Teto com formações pontiagudas." },
    { title: "Campo de cristais", description: "Cristais ocupam boa parte da cavidade." },
    { title: "Caverna de fungos", description: "Vegetação subterrânea abundante." },
    { title: "Caverna de lava", description: "Túnel ou câmara vulcânica." },
    { title: "Fenda subterrânea", description: "Passagem estreita entre paredes naturais." },
    { title: "Depósito de água", description: "Reservatório natural ou artificial." },
    { title: "Câmara de fósseis", description: "Espaço com restos de criaturas antigas." },
    { title: "Ninho de criaturas", description: "Área natural ocupada por uma espécie." },
    { title: "Caverna de morcegos", description: "Abrigo de uma colônia de morcegos." },
    { title: "Câmara de raízes", description: "Espaço tomado por raízes." },
  ],
  puzzle: [
    { title: "Câmara de enigmas", description: "Um problema precisa ser resolvido para avançar." },
    { title: "Sala de alavancas", description: "Combinação correta de alavancas ativa uma passagem." },
    { title: "Câmara de pressão", description: "Objetos precisam ser posicionados sobre placas." },
    { title: "Sala de espelhos", description: "Reflexos precisam ser alinhados." },
    { title: "Câmara musical", description: "Uma sequência sonora precisa ser reproduzida." },
    { title: "Sala de símbolos", description: "Inscrições devem ser interpretadas ou ativadas." },
    { title: "Câmara de cores", description: "Cores ou luzes precisam ser combinadas." },
    { title: "Sala de plataformas", description: "Plataformas precisam ser atravessadas em determinada ordem." },
    { title: "Câmara de sacrifício de recursos", description: "Um recurso precisa ser oferecido para abrir uma porta." },
    { title: "Sala de sequência temporal", description: "Mecanismos precisam ser ativados dentro de um intervalo." },
    { title: "Câmara de equilíbrio", description: "O grupo precisa equilibrar pesos ou forças." },
    { title: "Sala de observação", description: "Pistas precisam ser encontradas em diferentes partes do ambiente." },
  ],
  treasure: [
    { title: "Tesouro", description: "Câmara para riquezas e relíquias." },
    { title: "Esconderijo", description: "Pequeno depósito oculto." },
    { title: "Tesouro menor", description: "Recompensa secundária." },
    { title: "Cofre de facção", description: "Reserva de recursos de um grupo." },
    { title: "Câmara de tesouro", description: "Grande coleção de riquezas." },
    { title: "Tesouro real", description: "Riquezas de uma figura importante." },
    { title: "Câmara de artefato", description: "Guarda um único objeto extraordinário." },
    { title: "Sala de troféus", description: "Exibe recompensas conquistadas ou tomadas." },
    { title: "Tesouro falso", description: "Parece valioso, mas esconde uma fraude ou armadilha." },
    { title: "Câmara de recompensa", description: "Prêmio por superar um desafio." },
    { title: "Depósito de relíquias", description: "Guarda objetos históricos ou sagrados." },
    { title: "Câmara de recompensa secreta", description: "Recompensa acessível por passagem escondida." },
  ],
  special: [
    { title: "Câmara central", description: "Núcleo de encontro da masmorra." },
    { title: "Câmara do chefe", description: "Local do confronto final." },
    { title: "Câmara do guardião", description: "Protege uma área importante." },
    { title: "Sala do trono abandonada", description: "Antiga sede de autoridade." },
    { title: "Câmara de contenção", description: "Mantém algo perigoso isolado." },
    { title: "Sala de máquinas", description: "Controla o funcionamento da masmorra." },
    { title: "Câmara de energia", description: "Fonte de poder do complexo." },
    { title: "Sala destruída", description: "Área danificada por algum evento." },
    { title: "Sala abandonada", description: "Área sem ocupantes atuais." },
    { title: "Sala inundada", description: "Espaço parcialmente ou totalmente submerso." },
    { title: "Câmara contaminada", description: "Área afetada por uma substância ou fenômeno." },
    { title: "Sala de anomalia", description: "Ambiente com propriedades incomuns." },
    { title: "Câmara viva", description: "O próprio ambiente é um organismo." },
    { title: "Sala congelada no tempo", description: "Um acontecimento parece ter sido interrompido." },
    { title: "Câmara de observação dimensional", description: "Permite observar outros planos ou locais." },
    { title: "Câmara de fuga", description: "Projetada para uma retirada rápida." },
    { title: "Câmara sem saída aparente", description: "O caminho de progressão está escondido." },
  ],
};

export const ROOM_TYPE_CATEGORY_ORDER: readonly RoomTypeCategory[] = [
  "exploration",
  "combat",
  "habitation",
  "logistics",
  "religious",
  "arcane",
  "funerary",
  "natural",
  "puzzle",
  "treasure",
  "special",
];

const roomTypeRounds = Math.max(
  ...ROOM_TYPE_CATEGORY_ORDER.map((category) => ROOM_TYPES_BY_CATEGORY[category].length),
);

export const ROOM_TYPE_DEFINITIONS: readonly RoomTypeDefinition[] = Array.from(
  { length: roomTypeRounds },
  (_, round) => ROOM_TYPE_CATEGORY_ORDER.flatMap((category) => {
    const definition = ROOM_TYPES_BY_CATEGORY[category][round];
    return definition ? [{ ...definition, category }] : [];
  }),
).flat();

export function getRoomTypeDefinitions(
  roomCount: number,
  seed = 0,
  categoryFrequencies?: RoomTypeCategoryFrequencies,
): RoomTypeDefinition[] {
  const count = Math.max(0, Math.floor(roomCount));
  if (count === 0) return [];

  const categories: RoomTypeCategory[] = ["exploration"];
  const remainingRoomCount = count - 1;
  const categoryCounts = Object.fromEntries(
    ROOM_TYPE_CATEGORY_ORDER.map((category) => [category, 0]),
  ) as RoomTypeCategoryFrequencies;

  if (categoryFrequencies) {
    const totalFrequency = ROOM_TYPE_CATEGORY_ORDER.reduce(
      (total, category) => total + categoryFrequencies[category],
      0,
    );
    if (totalFrequency <= 0) {
      throw new RangeError("A distribuição das categorias de salas deve somar mais que zero.");
    }

    const allocations = ROOM_TYPE_CATEGORY_ORDER.map((category) => {
      const exactCount = remainingRoomCount * categoryFrequencies[category] / totalFrequency;
      const allocatedCount = Math.floor(exactCount);
      categoryCounts[category] = allocatedCount;
      return { category, remainder: exactCount - allocatedCount };
    });
    let unallocated = remainingRoomCount - Object.values(categoryCounts).reduce((total, value) => total + value, 0);
    allocations.sort((left, right) => right.remainder - left.remainder);
    for (const allocation of allocations) {
      if (unallocated <= 0) break;
      categoryCounts[allocation.category] += 1;
      unallocated -= 1;
    }

    while (categories.length - 1 < remainingRoomCount) {
      for (const category of ROOM_TYPE_CATEGORY_ORDER) {
        if (categoryCounts[category] <= 0) continue;
        categories.push(category);
        categoryCounts[category] -= 1;
      }
    }
  } else {
    for (let index = 0; index < remainingRoomCount; index += 1) {
      categories.push(ROOM_TYPE_CATEGORY_ORDER[index % ROOM_TYPE_CATEGORY_ORDER.length]);
    }
  }

  const categoryUsage = Object.fromEntries(
    ROOM_TYPE_CATEGORY_ORDER.map((category) => [category, 0]),
  ) as Record<RoomTypeCategory, number>;
  const seedOffset = Math.abs(Math.trunc(seed));
  return categories.map((category, index) => {
    if (index === 0) return { ...ROOM_TYPES_BY_CATEGORY.exploration[0], category };

    const categoryTypes = category === "exploration"
      ? ROOM_TYPES_BY_CATEGORY[category].slice(1)
      : ROOM_TYPES_BY_CATEGORY[category];
    const typeIndex = (categoryUsage[category] + seedOffset % categoryTypes.length) % categoryTypes.length;
    categoryUsage[category] += 1;
    return { ...categoryTypes[typeIndex], category };
  });
}

export function getRoomTypeDefinition(roomNumber: number, seed = 0): RoomTypeDefinition {
  const roomCount = Math.max(1, Math.floor(roomNumber));
  const definitions = getRoomTypeDefinitions(roomCount, seed);
  return definitions[definitions.length - 1];
}
