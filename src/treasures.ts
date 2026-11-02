export type TreasureCategory =
  | "monetary"
  | "equipment"
  | "consumables"
  | "magical"
  | "relics"
  | "documents"
  | "materials"
  | "creatureTrophies"
  | "cursed"
  | "secret";

export const TREASURE_CATEGORY_ORDER: readonly TreasureCategory[] = [
  "monetary",
  "equipment",
  "consumables",
  "magical",
  "relics",
  "documents",
  "materials",
  "creatureTrophies",
  "cursed",
  "secret",
];

export const TREASURE_CATEGORY_LABELS: Record<TreasureCategory, string> = {
  monetary: "Tesouros monetários",
  equipment: "Armas e equipamentos",
  consumables: "Poções, consumíveis e materiais alquímicos",
  magical: "Itens mágicos",
  relics: "Relíquias históricas e arqueológicas",
  documents: "Documentos, informações e segredos",
  materials: "Ingredientes, materiais raros e recursos naturais",
  creatureTrophies: "Tesouros de criaturas e troféus",
  cursed: "Tesouros amaldiçoados, perigosos ou enganosos",
  secret: "Tesouros secretos e recompensas especiais",
};

export type TreasureRarity = "common" | "uncommon" | "rare" | "veryRare" | "legendary";

export const TREASURE_RARITY_ORDER: readonly TreasureRarity[] = [
  "common",
  "uncommon",
  "rare",
  "veryRare",
  "legendary",
];

export const TREASURE_RARITY_LABELS: Record<TreasureRarity, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  veryRare: "Muito raro",
  legendary: "Lendário",
};

export type TreasureCategoryWeights = Record<TreasureCategory, number>;
export type TreasureRarityWeights = Record<TreasureRarity, number>;

export const DEFAULT_TREASURE_CATEGORY_WEIGHTS: TreasureCategoryWeights = {
  monetary: 1,
  equipment: 1,
  consumables: 1,
  magical: 1,
  relics: 1,
  documents: 1,
  materials: 1,
  creatureTrophies: 1,
  cursed: 1,
  secret: 1,
};

export const DEFAULT_TREASURE_RARITY_WEIGHTS: TreasureRarityWeights = {
  common: 55,
  uncommon: 25,
  rare: 13,
  veryRare: 5,
  legendary: 2,
};

export interface TreasureDefinition {
  id: string;
  label: string;
  description: string;
  locations: string;
  rarity?: TreasureRarity;
  discoveryMethod?: string;
}

export const TREASURE_CATALOG = {
  monetary: [
    { id: "copperCoins", label: "Moedas de cobre", description: "Pequena quantia de dinheiro comum.", locations: "Bolsas, gavetas e cadáveres." },
    { id: "silverCoins", label: "Moedas de prata", description: "Dinheiro de valor intermediário.", locations: "Baús, depósitos e esconderijos." },
    { id: "goldCoins", label: "Moedas de ouro", description: "Riqueza significativa.", locations: "Cofres, tesourarias e câmaras de recompensa." },
    { id: "ancientCoins", label: "Moedas antigas", description: "Moedas de civilizações desaparecidas.", locations: "Ruínas, tumbas e cidades soterradas." },
    { id: "foreignCoins", label: "Moedas estrangeiras", description: "Dinheiro de outros reinos.", locations: "Mercadores, aventureiros e caravanas." },
    { id: "commemorativeCoins", label: "Moedas comemorativas", description: "Peças cunhadas para eventos históricos.", locations: "Tesouros nobres e coleções." },
    { id: "goldBars", label: "Barras de ouro", description: "Metal precioso em formato de lingote.", locations: "Tesourarias e cofres." },
    { id: "silverBars", label: "Barras de prata", description: "Reserva de riqueza em metal.", locations: "Depósitos comerciais." },
    { id: "roughGems", label: "Gemas brutas", description: "Pedras preciosas ainda não lapidadas.", locations: "Minas, cavernas e depósitos." },
    { id: "cutGems", label: "Gemas lapidadas", description: "Pedras preciosas trabalhadas.", locations: "Joalherias, cofres e tesouros." },
    { id: "pearls", label: "Pérolas", description: "Objetos valiosos de origem marinha.", locations: "Templos aquáticos e coleções." },
    { id: "jewelry", label: "Joias", description: "Peças decorativas feitas com metais e pedras preciosas.", locations: "Túmulos e aposentos nobres." },
    { id: "valuableMedallions", label: "Medalhões valiosos", description: "Peças ornamentais de ouro ou prata.", locations: "Coleções particulares." },
    { id: "rareMetalBars", label: "Barras de metais raros", description: "Metais incomuns com valor comercial.", locations: "Minas, laboratórios e arsenais." },
    { id: "coinVault", label: "Cofre de moedas", description: "Grande quantidade de dinheiro armazenado.", locations: "Tesourarias e fortalezas." },
    { id: "payPouch", label: "Bolsa de pagamento", description: "Dinheiro reservado para salários ou despesas.", locations: "Quartéis e escritórios." },
    { id: "tradeReserve", label: "Reserva comercial", description: "Dinheiro acumulado por uma organização.", locations: "Guildas, armazéns e bases criminosas." },
    { id: "lootedTreasure", label: "Tesouro saqueado", description: "Riquezas acumuladas por um grupo.", locations: "Covis, esconderijos e fortalezas." },
  ],
  equipment: [
    { id: "ancientSword", label: "Espada antiga", description: "Arma comum de uma civilização passada.", locations: "Arsenais e tumbas." },
    { id: "ornateWeapon", label: "Arma ornamentada", description: "Equipamento decorado com símbolos e metais preciosos.", locations: "Aposentos nobres e salas de troféus." },
    { id: "ceremonialWeapon", label: "Arma cerimonial", description: "Objeto destinado a rituais ou cerimônias.", locations: "Templos e altares." },
    { id: "masterworkWeapon", label: "Arma de mestre", description: "Equipamento de qualidade excepcional.", locations: "Oficinas e arsenais de elite." },
    { id: "enchantedWeapon", label: "Arma encantada", description: "Arma com propriedades mágicas.", locations: "Cofres arcanos e câmaras de chefes." },
    { id: "cursedWeapon", label: "Arma amaldiçoada", description: "Equipamento poderoso com consequências negativas.", locations: "Tumbas e salas proibidas." },
    { id: "ancientArmor", label: "Armadura antiga", description: "Proteção de uma civilização desaparecida.", locations: "Mausoléus e arsenais." },
    { id: "superiorArmor", label: "Armadura de qualidade superior", description: "Equipamento especialmente bem construído.", locations: "Quartéis de elite e cofres." },
    { id: "enchantedArmor", label: "Armadura encantada", description: "Proteção com propriedades sobrenaturais.", locations: "Tesouros de magos e fortalezas." },
    { id: "heraldicShield", label: "Escudo heráldico", description: "Escudo com símbolos de uma família ou facção.", locations: "Salões nobres e quartéis." },
    { id: "magicShield", label: "Escudo mágico", description: "Escudo com propriedades especiais.", locations: "Cofres e câmaras de guardiões." },
    { id: "rareBow", label: "Arco raro", description: "Arma de longo alcance de qualidade excepcional.", locations: "Torres de arqueiros e arsenais." },
    { id: "specialAmmunition", label: "Munição especial", description: "Projéteis com propriedades incomuns.", locations: "Laboratórios e arsenais." },
    { id: "rareToolKit", label: "Kit de ferramentas raro", description: "Ferramentas de um artesão excepcional.", locations: "Oficinas e esconderijos." },
    { id: "valuableInstrument", label: "Instrumento musical valioso", description: "Instrumento raro ou ornamentado.", locations: "Salões de banquetes e coleções." },
    { id: "mechanicalClock", label: "Relógio mecânico", description: "Dispositivo de precisão e valor elevado.", locations: "Laboratórios e tesourarias." },
    { id: "explorationGear", label: "Equipamento de exploração", description: "Cordas, lanternas, ferramentas e suprimentos.", locations: "Depósitos e acampamentos." },
    { id: "creatureEquipment", label: "Equipamento de criatura", description: "Itens adaptados a uma espécie específica.", locations: "Covis e salas de troféus." },
  ],
  consumables: [
    { id: "healingPotion", label: "Poção de cura", description: "Recupera ferimentos.", locations: "Enfermarias e laboratórios." },
    { id: "energyPotion", label: "Poção de energia", description: "Restaura energia ou recursos mágicos.", locations: "Laboratórios arcanos." },
    { id: "resistancePotion", label: "Poção de resistência", description: "Concede resistência temporária a um efeito.", locations: "Cofres e depósitos especializados." },
    { id: "invisibilityPotion", label: "Poção de invisibilidade", description: "Oculta temporariamente o usuário.", locations: "Cofres arcanos e esconderijos." },
    { id: "speedPotion", label: "Poção de velocidade", description: "Aumenta temporariamente a mobilidade.", locations: "Laboratórios." },
    { id: "strengthPotion", label: "Poção de força", description: "Amplia temporariamente a força física.", locations: "Quartéis e arsenais." },
    { id: "nightVisionPotion", label: "Poção de visão noturna", description: "Permite enxergar melhor na escuridão.", locations: "Depósitos de exploradores." },
    { id: "waterBreathingPotion", label: "Poção de respiração aquática", description: "Permite respirar debaixo d'água.", locations: "Templos submersos." },
    { id: "antidote", label: "Antídoto", description: "Neutraliza determinado veneno.", locations: "Enfermarias e laboratórios." },
    { id: "purificationElixir", label: "Elixir de purificação", description: "Remove uma contaminação fictícia ou mágica.", locations: "Templos e laboratórios." },
    { id: "acidFlask", label: "Frasco de ácido", description: "Substância corrosiva utilizável em aventuras.", locations: "Laboratórios e oficinas." },
    { id: "alchemicalFire", label: "Frasco de fogo alquímico", description: "Substância incendiária fantástica.", locations: "Arsenais e laboratórios." },
    { id: "explosivePowder", label: "Pó explosivo", description: "Material utilizado em explosões fictícias.", locations: "Minas e depósitos." },
    { id: "illusionPowder", label: "Pó de ilusão", description: "Cria efeitos visuais temporários.", locations: "Laboratórios arcanos." },
    { id: "magicInk", label: "Tinta mágica", description: "Permite registrar inscrições especiais.", locations: "Bibliotecas e oficinas." },
    { id: "singleUseScroll", label: "Pergaminho de uso único", description: "Armazena uma magia ou efeito.", locations: "Arquivos e cofres." },
    { id: "ritualComponent", label: "Componente ritualístico", description: "Material consumido em cerimônias.", locations: "Templos e câmaras rituais." },
    { id: "rareReagent", label: "Reagente raro", description: "Ingrediente de receitas alquímicas.", locations: "Laboratórios e cavernas." },
    { id: "essenceFlask", label: "Frasco de essência", description: "Material sobrenatural condensado.", locations: "Câmaras de energia." },
    { id: "firstAidKit", label: "Kit de primeiros socorros", description: "Suprimentos para tratar ferimentos.", locations: "Enfermarias e acampamentos." },
  ],
  magical: [
    { id: "enchantedRing", label: "Anel encantado", description: "Anel com um efeito mágico.", locations: "Cofres e tumbas.", rarity: "common" },
    { id: "protectiveAmulet", label: "Amuleto protetor", description: "Objeto que protege seu portador.", locations: "Templos e santuários.", rarity: "common" },
    { id: "magicNecklace", label: "Colar mágico", description: "Joia com propriedades sobrenaturais.", locations: "Aposentos nobres e tesouros.", rarity: "uncommon" },
    { id: "arcaneBracelet", label: "Bracelete arcano", description: "Canaliza ou modifica magia.", locations: "Laboratórios.", rarity: "uncommon" },
    { id: "enchantedCape", label: "Capa encantada", description: "Concede uma propriedade especial.", locations: "Cofres e câmaras de chefes.", rarity: "uncommon" },
    { id: "magicBoots", label: "Botas mágicas", description: "Alteram mobilidade ou deslocamento.", locations: "Tesouros e esconderijos.", rarity: "common" },
    { id: "magicGloves", label: "Luvas mágicas", description: "Melhoram uma habilidade ou interação.", locations: "Oficinas e laboratórios.", rarity: "common" },
    { id: "arcaneStaff", label: "Cajado arcano", description: "Canaliza poderes mágicos.", locations: "Torres e bibliotecas.", rarity: "rare" },
    { id: "magicWand", label: "Varinha mágica", description: "Permite produzir efeitos específicos.", locations: "Laboratórios e cofres.", rarity: "uncommon" },
    { id: "crystalOrb", label: "Orbe de cristal", description: "Foco mágico ou instrumento de observação.", locations: "Observatórios e santuários.", rarity: "rare" },
    { id: "energyCrystal", label: "Cristal de energia", description: "Armazena poder mágico.", locations: "Câmaras de energia.", rarity: "common" },
    { id: "memoryStone", label: "Pedra da memória", description: "Preserva lembranças ou informações.", locations: "Arquivos e ruínas.", rarity: "uncommon" },
    { id: "communicationStone", label: "Pedra de comunicação", description: "Permite comunicação à distância.", locations: "Torres e postos de comando.", rarity: "common" },
    { id: "magicMirror", label: "Espelho mágico", description: "Revela informações ou mostra outros locais.", locations: "Salas de observação.", rarity: "rare" },
    { id: "arcaneCompass", label: "Bússola arcana", description: "Aponta para um alvo ou fenômeno específico.", locations: "Laboratórios e esconderijos.", rarity: "common" },
    { id: "enchantedKey", label: "Chave encantada", description: "Abre determinadas portas ou selos.", locations: "Cofres e câmaras secretas.", rarity: "uncommon" },
    { id: "dimensionalBag", label: "Bolsa dimensional", description: "Armazena objetos em um espaço sobrenatural.", locations: "Tesouros de aventureiros.", rarity: "rare" },
    { id: "illusionCloak", label: "Manto de ilusão", description: "Modifica a aparência do usuário.", locations: "Cofres arcanos.", rarity: "veryRare" },
    { id: "temporalClock", label: "Relógio temporal", description: "Interage com a percepção ou passagem do tempo.", locations: "Laboratórios experimentais.", rarity: "veryRare" },
    { id: "unknownArtifact", label: "Artefato de origem desconhecida", description: "Objeto cujas propriedades não são compreendidas.", locations: "Ruínas antigas e câmaras secretas.", rarity: "legendary" },
  ],
  relics: [
    { id: "ancientCrown", label: "Coroa antiga", description: "Símbolo de uma antiga dinastia.", locations: "Tumbas reais e tesourarias." },
    { id: "ceremonialScepter", label: "Cetro cerimonial", description: "Insígnia de autoridade.", locations: "Salões do trono e templos." },
    { id: "militaryMedal", label: "Medalha militar", description: "Reconhecimento de uma campanha histórica.", locations: "Quartéis e túmulos de soldados." },
    { id: "warBanner", label: "Bandeira de guerra", description: "Estandarte de uma facção desaparecida.", locations: "Fortalezas e salões militares." },
    { id: "ancientManuscript", label: "Manuscrito antigo", description: "Documento de valor histórico.", locations: "Bibliotecas e arquivos." },
    { id: "lostTerritoryMap", label: "Mapa de território perdido", description: "Registro geográfico de uma região esquecida.", locations: "Arquivos e esconderijos." },
    { id: "explorerDiary", label: "Diário de explorador", description: "Relato de uma expedição.", locations: "Acampamentos e cadáveres." },
    { id: "commemorativePlaque", label: "Placa comemorativa", description: "Registro de um acontecimento importante.", locations: "Salões cerimoniais." },
    { id: "funeraryMask", label: "Máscara funerária", description: "Objeto usado em rituais mortuários.", locations: "Tumbas e mausoléus." },
    { id: "ancestralFigurine", label: "Estatueta ancestral", description: "Representação de uma figura importante.", locations: "Santuários e coleções." },
    { id: "royalSeal", label: "Selo real", description: "Marca de autoridade política.", locations: "Cofres e arquivos." },
    { id: "ancientContract", label: "Contrato antigo", description: "Registro de um pacto ou acordo.", locations: "Bibliotecas e salas de comando." },
    { id: "forbiddenTreatise", label: "Tratado proibido", description: "Documento que revela um segredo.", locations: "Arquivos selados." },
    { id: "muralFragment", label: "Fragmento de mural", description: "Parte de uma obra histórica.", locations: "Ruínas e câmaras destruídas." },
    { id: "stoneInscription", label: "Inscrição em pedra", description: "Registro de leis, profecias ou acontecimentos.", locations: "Templos e monumentos." },
    { id: "religiousRelic", label: "Relíquia religiosa", description: "Objeto venerado por uma tradição.", locations: "Santuários e câmaras sagradas." },
    { id: "ancestralMachinePart", label: "Restos de uma máquina ancestral", description: "Peça tecnológica de uma civilização perdida.", locations: "Laboratórios e ruínas." },
    { id: "experimentDiary", label: "Diário de experimentos", description: "Registro de pesquisas antigas.", locations: "Laboratórios e câmaras secretas." },
    { id: "genealogyRecord", label: "Registro genealógico", description: "Documento sobre uma família ou linhagem.", locations: "Criptas e arquivos nobres." },
    { id: "unknownCultureArtifact", label: "Artefato de origem desconhecida", description: "Objeto que não corresponde à tecnologia ou cultura local.", locations: "Ruínas e câmaras seladas." },
  ],
  documents: [
    { id: "dungeonMap", label: "Mapa da masmorra", description: "Revela parte ou toda a estrutura.", locations: "Postos de guarda e arquivos." },
    { id: "incompleteMap", label: "Mapa incompleto", description: "Mostra apenas algumas áreas.", locations: "Cadáveres e esconderijos." },
    { id: "commonKey", label: "Chave comum", description: "Abre uma porta ou um recipiente.", locations: "Quartéis e depósitos." },
    { id: "specialKey", label: "Chave especial", description: "Abre uma área protegida.", locations: "Cofres e aposentos importantes." },
    { id: "accessCode", label: "Código de acesso", description: "Permite operar um mecanismo.", locations: "Salas de controle." },
    { id: "ritualPassword", label: "Senha ritualística", description: "Libera uma passagem ou proteção.", locations: "Templos e arquivos." },
    { id: "personalDiary", label: "Diário pessoal", description: "Revela informações sobre um habitante.", locations: "Quartos e escritórios." },
    { id: "militaryReport", label: "Relatório militar", description: "Explica a organização defensiva.", locations: "Quartéis e salas de comando." },
    { id: "alchemicalRecipes", label: "Livro de receitas alquímicas", description: "Ensina a produzir substâncias fictícias.", locations: "Laboratórios." },
    { id: "mechanismManual", label: "Manual de mecanismo", description: "Explica o funcionamento de uma máquina.", locations: "Oficinas e salas de máquinas." },
    { id: "secretCorrespondence", label: "Correspondência secreta", description: "Revela alianças ou traições.", locations: "Escritórios e esconderijos." },
    { id: "prisonerList", label: "Lista de prisioneiros", description: "Registra pessoas capturadas.", locations: "Prisões e postos de guarda." },
    { id: "experimentRecord", label: "Registro de experimentos", description: "Revela acontecimentos de um laboratório.", locations: "Laboratórios arcanos." },
    { id: "prophecy", label: "Profecia", description: "Antecipa um evento ou apresenta um enigma.", locations: "Santuários e câmaras rituais." },
    { id: "locationLetter", label: "Carta de localização", description: "Indica onde encontrar outro tesouro.", locations: "Esconderijos e cofres." },
    { id: "debtRecord", label: "Registro de dívida", description: "Revela obrigações de uma facção.", locations: "Escritórios e tesourarias." },
    { id: "escapePlan", label: "Plano de fuga", description: "Mostra uma rota alternativa.", locations: "Prisões e aposentos de líderes." },
    { id: "treasureInventory", label: "Inventário de tesouro", description: "Revela a existência de outra reserva de riquezas.", locations: "Arquivos e cofres." },
    { id: "identificationCode", label: "Código de identificação", description: "Permite passar por um sistema de segurança.", locations: "Laboratórios e fortalezas." },
    { id: "documentFragment", label: "Fragmento de um documento", description: "Apresenta apenas parte de uma informação.", locations: "Ruínas e salas destruídas." },
  ],
  materials: [
    { id: "ironOre", label: "Minério de ferro", description: "Material comum para fabricação.", locations: "Minas e depósitos." },
    { id: "silverOre", label: "Minério de prata", description: "Recurso metálico valioso.", locations: "Minas e cofres comerciais." },
    { id: "goldOre", label: "Minério de ouro", description: "Recurso precioso.", locations: "Minas e reservas." },
    { id: "arcaneCrystal", label: "Cristal arcano", description: "Mineral com propriedades mágicas.", locations: "Cavernas e laboratórios." },
    { id: "meteoriteFragment", label: "Fragmento de meteorito", description: "Material de origem extraterrestre.", locations: "Ruínas e câmaras de pesquisa." },
    { id: "dragonScales", label: "Escamas de dragão", description: "Material raro de origem monstruosa.", locations: "Covis e depósitos de troféus." },
    { id: "creatureFangs", label: "Presas de criatura", description: "Componentes para fabricação.", locations: "Covis e oficinas." },
    { id: "enchantedFeathers", label: "Penas encantadas", description: "Material mágico.", locations: "Santuários e ninhos." },
    { id: "petrifiedWood", label: "Madeira petrificada", description: "Recurso raro de origem natural.", locations: "Cavernas antigas." },
    { id: "medicinalHerbs", label: "Ervas medicinais", description: "Plantas com propriedades úteis.", locations: "Jardins subterrâneos." },
    { id: "rareFungi", label: "Fungos raros", description: "Ingredientes alquímicos.", locations: "Cavernas úmidas." },
    { id: "magicSpores", label: "Esporos mágicos", description: "Componentes sobrenaturais.", locations: "Grutas e laboratórios." },
    { id: "elementalEssence", label: "Essência elemental", description: "Material associado a um elemento.", locations: "Câmaras de energia." },
    { id: "fantasticCreatureBlood", label: "Sangue de criatura fantástica", description: "Componente para rituais fictícios.", locations: "Laboratórios e covis." },
    { id: "ancestralBone", label: "Fragmento de osso ancestral", description: "Material ritualístico.", locations: "Criptas e ossuários." },
    { id: "mineralizedScales", label: "Escamas mineralizadas", description: "Material resistente.", locations: "Cavernas e ninhos." },
    { id: "undergroundPearls", label: "Pérolas subterrâneas", description: "Gemas de origem fantástica.", locations: "Lagos subterrâneos." },
    { id: "crystallizedResin", label: "Resina cristalizada", description: "Material raro de origem vegetal.", locations: "Cavernas de fungos." },
    { id: "constructCore", label: "Núcleo de construto", description: "Componente de uma criatura artificial.", locations: "Laboratórios e câmaras de guardiões." },
    { id: "portalFragment", label: "Fragmento de portal", description: "Material associado à manipulação dimensional.", locations: "Câmaras arcanas." },
  ],
  creatureTrophies: [
    { id: "stolenCoinCollection", label: "Coleção de moedas saqueadas", description: "Riquezas acumuladas por uma criatura.", locations: "Covis e ninhos." },
    { id: "takenAdventurerWeapons", label: "Armas tomadas de aventureiros", description: "Equipamentos de vítimas anteriores.", locations: "Covis e salas de monstros." },
    { id: "huntingTrophies", label: "Troféus de caça", description: "Partes de criaturas derrotadas.", locations: "Quartéis e covis." },
    { id: "ornateSkulls", label: "Crânios ornamentados", description: "Restos utilizados como decoração.", locations: "Salões de chefes." },
    { id: "stolenJewelry", label: "Joias roubadas", description: "Objetos saqueados de outras pessoas.", locations: "Esconderijos." },
    { id: "victimArmor", label: "Armadura de uma vítima", description: "Equipamento preservado ou danificado.", locations: "Covis e câmaras de monstros." },
    { id: "curiousObjects", label: "Coleção de objetos curiosos", description: "Itens sem valor aparente acumulados por uma criatura.", locations: "Ninhos e esconderijos." },
    { id: "fantasticCreatureEgg", label: "Ovo de criatura fantástica", description: "Possível objetivo de missão.", locations: "Ninhos e câmaras protegidas." },
    { id: "rareCocoon", label: "Casulo raro", description: "Estágio de desenvolvimento de uma criatura.", locations: "Cavernas e covis." },
    { id: "creaturePearl", label: "Pérola produzida por criatura", description: "Objeto natural valioso.", locations: "Covis aquáticos." },
    { id: "monsterSilk", label: "Tecido de seda monstruosa", description: "Material utilizável em fabricação.", locations: "Cavernas com aracnídeos." },
    { id: "carapaceFragment", label: "Fragmento de carapaça", description: "Material resistente de origem biológica.", locations: "Covis e ninhos." },
    { id: "predatorFangs", label: "Presas de predador", description: "Troféu ou componente de fabricação.", locations: "Salas de monstros." },
    { id: "dragonHoard", label: "Tesouro organizado por um dragão", description: "Coleção deliberada de riquezas e objetos raros.", locations: "Covil de dragão." },
    { id: "worshipperOfferings", label: "Oferendas deixadas por adoradores", description: "Objetos destinados a uma criatura venerada.", locations: "Santuários e covis." },
  ],
  cursed: [
    { id: "cursedCoin", label: "Moeda amaldiçoada", description: "Dinheiro marcado por uma maldição que atrai infortúnios.", locations: "Bolsas, cofres e tesouros." },
    { id: "parasiticRing", label: "Anel parasitário", description: "Item que se prende ao usuário e dificulta sua remoção.", locations: "Cofres e tumbas." },
    { id: "hungrySword", label: "Espada faminta", description: "Arma que exige uma condição para manter seu poder.", locations: "Arsenais e salas proibidas." },
    { id: "corruptingCrown", label: "Coroa corruptora", description: "Amplifica ambição ou agressividade e afeta decisões.", locations: "Tumbas reais e tesourarias." },
    { id: "trackingAmulet", label: "Amuleto rastreador", description: "Revela a posição de quem o carrega e atrai perseguidores.", locations: "Cofres e esconderijos." },
    { id: "mimicChest", label: "Baú mimético", description: "O recipiente é uma criatura disfarçada que ataca quem o abre.", locations: "Tesouros e salas de monstros." },
    { id: "imprisoningGem", label: "Gema aprisionadora", description: "Guarda uma entidade ou consciência que pode ser libertada acidentalmente.", locations: "Cofres arcanos e câmaras seladas." },
    { id: "deceptiveScroll", label: "Pergaminho enganoso", description: "Contém informações falsas e pode induzir a uma decisão equivocada.", locations: "Arquivos e cofres." },
    { id: "contaminatedRelic", label: "Relíquia contaminada", description: "Foi afetada por magia nociva e exige purificação.", locations: "Santuários e ruínas." },
    { id: "unstableArtifact", label: "Artefato instável", description: "Produz efeitos imprevisíveis e consequências inesperadas.", locations: "Laboratórios e câmaras arcanas." },
    { id: "whisperingJewel", label: "Joia que sussurra", description: "Comunica informações de origem desconhecida e pode manipular o portador.", locations: "Tesouros e esconderijos." },
    { id: "possessionMedallion", label: "Medalhão de possessão", description: "Facilita a influência de uma entidade sobre a vítima.", locations: "Criptas e câmaras rituais." },
    { id: "falseCompartmentChest", label: "Baú com compartimento falso", description: "Esconde uma armadilha ou um objeto enganoso e exige inspeção.", locations: "Cofres e depósitos." },
    { id: "illusoryTreasure", label: "Tesouro ilusório", description: "Parece real, mas desaparece quando removido.", locations: "Câmaras de ilusão e salas secretas." },
    { id: "sacrificialRelic", label: "Relíquia de sacrifício", description: "Exige uma condição para liberar seu poder e impõe um custo narrativo.", locations: "Templos e câmaras rituais." },
    { id: "agingObject", label: "Objeto que envelhece", description: "Provoca envelhecimento sobrenatural e exige uma solução especial.", locations: "Cofres arcanos e laboratórios." },
    { id: "boundArtifact", label: "Artefato vinculado", description: "Só funciona para determinada pessoa ou linhagem.", locations: "Tesouros nobres e câmaras secretas." },
    { id: "markedTreasure", label: "Tesouro marcado", description: "Sua remoção ativa um rastreamento e alerta os habitantes.", locations: "Cofres e tesourarias." },
    { id: "falseRewardVault", label: "Cofre de recompensa falsa", description: "Contém objetos sem valor ou uma pista enganosa, podendo esconder outro mecanismo.", locations: "Câmaras de recompensa." },
    { id: "entityFragment", label: "Fragmento de entidade", description: "Contém parte de uma consciência sobrenatural que pode influenciar o ambiente.", locations: "Câmaras arcanas e covis." },
  ],
  secret: [
    { id: "hiddenChest", label: "Baú escondido", description: "Pequena reserva de objetos oculta fora do caminho principal.", locations: "Passagens secretas.", discoveryMethod: "Encontrar uma passagem secreta." },
    { id: "wallCompartment", label: "Compartimento na parede", description: "Nicho oculto dentro de uma parede.", locations: "Paredes ocas e salas de armazenamento.", discoveryMethod: "Investigar uma parede." },
    { id: "underfloorTreasure", label: "Tesouro sob o piso", description: "Objeto enterrado ou escondido sob uma superfície.", locations: "Salas de guarda e aposentos.", discoveryMethod: "Examinar o chão." },
    { id: "bookcaseVault", label: "Cofre atrás de uma estante", description: "Reserva oculta por uma estante móvel.", locations: "Bibliotecas e escritórios.", discoveryMethod: "Mover uma estante." },
    { id: "submergedTreasure", label: "Tesouro submerso", description: "Objetos escondidos no fundo de uma área inundada.", locations: "Lagos subterrâneos e câmaras alagadas.", discoveryMethod: "Explorar a água." },
    { id: "highTreasure", label: "Tesouro em altura", description: "Recompensa em uma plataforma elevada ou saliência.", locations: "Poços, cavernas e plataformas.", discoveryMethod: "Escalar ou alcançar uma saliência." },
    { id: "secretChamber", label: "Câmara secreta", description: "Sala que não aparece no caminho principal.", locations: "Áreas opcionais e paredes ocultas.", discoveryMethod: "Descobrir uma passagem." },
    { id: "smugglerCache", label: "Reserva de contrabandistas", description: "Mercadorias escondidas para evitar fiscalização.", locations: "Esconderijos e rotas de fuga.", discoveryMethod: "Encontrar um esconderijo." },
    { id: "emergencyVault", label: "Cofre de emergência", description: "Reserva preparada para uma fuga ou emergência.", locations: "Salas de escape e aposentos de líderes.", discoveryMethod: "Encontrar uma sala de fuga." },
    { id: "explorerCache", label: "Tesouro de um antigo explorador", description: "Objetos abandonados durante uma expedição.", locations: "Acampamentos e rotas abandonadas.", discoveryMethod: "Seguir pistas." },
    { id: "puzzleReward", label: "Recompensa por enigma", description: "Objeto liberado após resolver um desafio.", locations: "Câmaras de enigmas e mecanismos.", discoveryMethod: "Resolver um mecanismo." },
    { id: "bossReward", label: "Recompensa por chefe", description: "Tesouro obtido após confronto ou negociação com um guardião.", locations: "Câmaras de chefes e covis.", discoveryMethod: "Derrotar ou negociar com o guardião." },
    { id: "factionReward", label: "Recompensa de facção", description: "Objetos concedidos por uma organização após cumprir uma condição.", locations: "Salas de comando e esconderijos.", discoveryMethod: "Cumprir uma condição." },
    { id: "alternateRouteReward", label: "Tesouro de rota alternativa", description: "Recompensa por explorar uma ramificação opcional.", locations: "Rotas alternativas e passagens secretas.", discoveryMethod: "Explorar uma ramificação." },
    { id: "questRelic", label: "Relíquia de missão", description: "Objeto que permite avançar em uma história ou objetivo.", locations: "Câmaras específicas e áreas protegidas.", discoveryMethod: "Descobrir uma área específica." },
  ],
} as const satisfies Record<TreasureCategory, readonly TreasureDefinition[]>;

export type TreasureType = (typeof TREASURE_CATALOG)[TreasureCategory][number]["id"];

export interface DungeonTreasure {
  type: TreasureType;
  category: TreasureCategory;
  rarity?: TreasureRarity;
  details: string[];
}

export function getTreasureDefinition(type: TreasureType): TreasureDefinition | undefined {
  for (const category of TREASURE_CATEGORY_ORDER) {
    const definition = TREASURE_CATALOG[category].find((item) => item.id === type);
    if (definition) return definition;
  }
  return undefined;
}

export function getRoomTreasureChance(
  roomCategory: string,
  roomType: string,
  baseChancePercent: number,
): number {
  const isHighValueRoom = roomCategory === "treasure" || roomType === "Cofre" || roomType === "Tesouro";
  const isStorageRoom = roomCategory === "logistics";
  const isArcaneOrRitualRoom = roomCategory === "arcane" || roomCategory === "religious";
  const multiplier = isHighValueRoom ? 3.4 : isStorageRoom ? 2 : isArcaneOrRitualRoom ? 1.4 : 0.4;
  return Math.min(100, Math.round(baseChancePercent * multiplier));
}
