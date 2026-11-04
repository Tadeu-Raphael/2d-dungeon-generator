# Dungeon Foundry

[![GitHub Stars](https://img.shields.io/github/stars/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Forks](https://img.shields.io/github/forks/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Issues](https://img.shields.io/github/issues/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator/issues)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#licença)

Aplicação web interativa para gerar, explorar e exportar mapas de masmorras para RPGs. Alterne entre a planta 2D, renderizada em tiles com PixiJS, e uma visualização 3D orbitável com Three.js. Os mapas podem ser reproduzidos usando a mesma seed.

## Recursos

- **Oito conceitos de masmorra**, cada um com regras próprias para geração e distribuição de salas, armadilhas e tesouros.
- **Geração procedural combinável** com BSP, Cellular Automata e Drunkard's Walk.
- **Seed reproduzível** e dimensões configuráveis: de 20 a 160 tiles de largura e de 20 a 120 tiles de altura.
- **Salas ajustáveis**: de 4 a 24 salas, 13 formatos, sete portes, proporções retangulares e frequências personalizáveis para 11 categorias e 168 funções.
- **Cavernas naturais opcionais**, além do conceito Caverna natural, que gera cavernas sem salas estruturadas.
- **Elementos de mapa** como portas, escadas, colunas, água e lava; as camadas de água e lava podem ser exibidas ou ocultadas.
- **Visualização 2D e 3D** do mesmo mapa. Na vista 3D, paredes, pisos, pilares e marcadores de salas ganham volume; orbite com o arraste, aproxime com a roda do mouse e mova a câmera com o botão direito.
- **Guia de salas, armadilhas e tesouros** com detalhes, metadados e resumos por mapa. O catálogo inclui 138 armadilhas em nove categorias e tesouros em dez categorias.
- **Reposicionamento de salas** por arraste, ajustado à grade, sem sobreposição ou saída dos limites; os corredores são recalculados e a conectividade é preservada.
- **Exportação do mapa em SVG e PNG.**

## Conceitos

| Conceito | Ênfase |
|---|---|
| Fortaleza militar | Guarnições, arsenais e defesa |
| Templo antigo | Santuários, rituais e enigmas |
| Catacumbas | Criptas e espaços funerários |
| Mina abandonada | Galerias, depósitos e áreas instáveis |
| Laboratório arcano | Pesquisa, contenção e experimentos |
| Caverna natural | Formações naturais, água e vida subterrânea |
| Prisão | Celas, vigilância e contenção |
| Ruínas de uma civilização perdida | Monumentos e espaços esquecidos |

Cada perfil aplica pesos próprios às categorias de salas, armadilhas e tesouros. As cavernas também podem ser habilitadas em conceitos que geram salas.

## Como funciona a geração

| Método | Uso |
|---|---|
| **BSP** | Divide o mapa em regiões para dimensionar salas, agrupa-as conforme a compactação configurada e conecta suas bordas por corredores curtos. |
| **Cellular Automata** | Suaviza áreas abertas e cria cavernas orgânicas. |
| **Drunkard's Walk** | Escava trilhas e túneis conectados. |

Os métodos podem ser combinados para criar mapas com salas, túneis e cavernas. A seed permite reproduzir o mapa; o botão **Reroll masmorra** gera outro usando uma nova seed.

### Versionamento e compatibilidade da geração

A geração existente é a **V1**. `generateDungeon` permanece como entrada legada, e `generateDungeonV1` é um alias explícito para comparação futura. `generateDungeonVersioned` retorna a dungeon no contrato atual e, separadamente, metadados com versão do gerador, seed, perfil, algoritmo efetivo, parâmetros completos, configurações adicionais e horário da execução. O horário é apenas informativo; não participa do resultado determinístico.

A V1 continua usando o fluxo aleatório original. `createGenerationRandomStreams` oferece fluxos independentes para topologia, posicionamento, corredores, conteúdo e decoração para versões futuras, sem alterar a sequência aleatória da V1.

Na interface V1, o perfil **Caverna natural** usa Cellular Automata; os demais perfis usam BSP e o controle **Incluir cavernas** alterna entre BSP e BSP + Cellular Automata. Embora os perfis também declarem `bsp-drunkard` e `hybrid`, esse encaminhamento não chega à interface atualmente; `generateDungeon` ainda oferece esses algoritmos para chamadas diretas. O histórico simplificou o despacho, mas não registra uma justificativa, e o gerador não tem uma limitação técnica que impeça essas combinações. Para preservar mapas V1, `getDungeonGenerationAlgorithm` não foi alterado. As afinidades topológicas adicionadas na Fase 3 atuam separadamente e não mudam esse despacho; o encaminhamento dos algoritmos dos perfis continua sendo uma decisão pendente para uma versão futura explícita.

### Modelo lógico GenerationPlan

`GenerationPlan` é uma camada adicional e independente da renderização; nesta fase, ela não substitui nem altera os algoritmos V1. `RoomNode.roomRole` descreve a função estrutural da sala (como entrada ou objetivo), enquanto `roomType` continua usando as categorias temáticas existentes (como religiosa ou arcana). Cada sala fornece um `footprint` de tiles locais explícitos, e cada conexão geométrica fornece seu próprio caminho absoluto; a camada não calcula posicionamento nem roteamento. Caminhos duplicados são rejeitados, mas conexões paralelas intencionais podem declarar `metadata.allowParallel: true`.

O plano também registra setores, interseções, transições, recursos, versão e metadados completos da geração. `validateGenerationPlan` verifica IDs e referências, dimensões, setores, sobreposições de footprints e geometrias obrigatórias. Essa validação estrutural é distinta da análise de conectividade do grafo; ela não altera o BFS existente usado ao reposicionar salas.

`generationPlanToDungeon` rasteriza os footprints e caminhos informados no contrato atual `Dungeon.tiles`, além de preencher `roomDetails`, armadilhas e tiles existentes de portas, escadas e outros elementos. PixiJS, Three.js e as exportações SVG continuam consumindo somente `Dungeon`. O modelo retém flags como conexão secreta, bloqueada, opcional e trancada; o formato `Dungeon` atual não possui campos para todos esses estados. A conversão mantém essas informações no `GenerationPlan`, sem inferir uma regra de navegação. O reposicionamento legado trabalha com limites retangulares de salas, portanto não preserva necessariamente todos os detalhes de footprints irregulares após arrastar uma sala.

### Topologia e progressão

`generateDungeonTopology` adiciona a camada lógica de exploração ao `GenerationPlan`: escolhe entre `linear`, `branching`, `circuit`, `centralized`, `sectorized` e `hybrid`; atribui `RoomRole` sem mudar o conteúdo temático; e armazena `mainPathRoomIds`, ramificações, ciclos intencionais e setores. Cada conexão mantém seus endpoints e condições (`isLocked`, `isSecret`, `isBlocked`, `isOptional` e `metadata.accessRequirements`). `cycleCount` e `additionalConnectionCount` controlam ciclos adicionais; `branchCount`, `deadEndProbability`, `optionalPathCount` e `sectorCount` orientam a árvore e sua divisão.

As oito entradas de `DUNGEON_CONCEPTS` declaram afinidades próprias — por exemplo, a fortaleza e a prisão favorecem setores, catacumbas favorecem progressão linear com passagem secreta, e a caverna favorece ramificações. Elas são preferências para a nova etapa, não regras rígidas nem alterações dos algoritmos/categorias V1. `cycleCount` e `additionalConnectionCount` definem um mínimo de conexões cíclicas; `deadEndProbability` controla a chance de uma ramificação terminar ou se reconectar, podendo acrescentar circuitos. A geração usa exclusivamente o subfluxo determinístico `topology` da seed registrada; o resultado registra `topology.version: "topology-v1"`, separado da versão do gerador legado. Mudanças no conteúdo temático não consomem esse fluxo.

Exemplo de uso sobre um plano que já contém as salas definidas por outra etapa:

```ts
const topology = generateDungeonTopology(roomPlan, { profile: "catacombs" });
const validation = validateDungeonTopology(topology);
```

Esta função não escolhe nem move salas e não roteia corredores: conserva dimensões, posições e footprints recebidos, deixa `ConnectionEdge.path` vazio e marca `geometryStatus: "unrouted"`. `generationPlanToDungeon` recusa explicitamente esse estágio; uma fase posterior deverá fornecer a geometria antes da rasterização. Assim, os padrões representam grafos de exploração, não ainda plantas físicas prontas para renderizar.

`analyzeTopologyConnectivity` retorna resultados separados: **físico**, que considera as relações entre salas inclusive passagens bloqueadas, e **acesso do jogador**, que exclui bloqueios, portas trancadas sem `lockId` desbloqueado, segredos não descobertos e requisitos não satisfeitos. `validateDungeonTopology` verifica entrada/objetivo, sequência e arestas do caminho principal, acessibilidade das salas obrigatórias/importantes, conexão das ramificações e se as conexões marcadas como ciclos realmente aumentam o ciclo do grafo. `getDungeonTopologyStatistics` resume salas, arestas, becos sem saída, ciclos, setores e conexões especiais.

## Controles e interação

As configurações estão organizadas nas abas **Geração**, **Salas**, **Tipos**, **Armadilhas**, **Tesouros** e **Acesso**. Elas permitem ajustar o conceito, as dimensões, a compactação do mapa, as proporções e os formatos das salas, as categorias funcionais e as chances de geração.

- Na aba **Acesso**, escolha uma escadaria superior, uma entrada externa ou uma conexão com o exterior. Portas são colocadas em soleiras reais, e escadas indicam a direção de subida ou descida.
- Selecione uma sala no mapa para destacá-la no guia e abrir seus detalhes. O modal separa metadados de estrutura, uso e riscos, narrativa, armadilhas e tesouros.
- Alterne entre **2D** e **3D** acima do mapa. A seleção de salas e as camadas de água e lava funcionam nas duas vistas.
- Na vista 2D, use **Mover** para reposicionar salas, **Ajustar** para reenquadrar o mapa e os controles para aproximar ou afastar. Na vista 3D, **Ajustar** restaura o enquadramento da câmera; o reposicionamento de salas continua disponível na vista 2D.
- Armadilhas e tesouros são apresentados no guia, não como ilustrações no mapa. Armadilhas em corredores recebem identificadores numéricos no mapa e nas exportações.
- A exportação oferece os formatos **SVG** e **PNG** da planta 2D, independentemente da visualização ativa. O mapa exportado não inclui marcadores de tesouros nem ilustrações das armadilhas.

Uma sala pode receber até três armadilhas e até três tesouros, conforme as chances configuradas. As armadilhas variam por categoria e local de ocorrência; tesouros podem incluir consumíveis e itens mágicos com raridades distintas. Encontros não são simulados: os metadados narrativos são sugestões para criação de histórias.

## Formatos e identidade visual

As salas podem ser retangulares, quadradas, circulares, elípticas, octogonais, em L, em T, em cruz, em anel, irregulares, com colunas, com alcovas ou multinível. Para salas retangulares, a distribuição de proporções configurável vai de 1:1 a 3:1 ou mais.

O mapa e o guia usam cores para distinguir as categorias funcionais:

| Categoria | Cor |
|---|---|
| Exploração e circulação | `#82b4c3` |
| Combate | `#d17f70` |
| Descanso e habitação | `#9dbb7a` |
| Armazenamento e logística | `#c2a266` |
| Religiosas, cerimoniais e culturais | `#b49aca` |
| Magia, pesquisa e experimentação | `#78a5d6` |
| Funerárias e horror | `#9b879b` |
| Naturais e cavernas | `#72a887` |
| Enigmas e desafios | `#58b8b1` |
| Tesouro e recompensas | `#e5b755` |
| Especiais e narrativas | `#d7839e` |

## Metadados das salas

Os metadados aparecem no modal da sala, agrupados em **Estrutura**, **Uso e riscos** e **Narrativa**. As dimensões são expressas em metros, considerando a escala de 1 tile = 1 m.

| Campo | Descrição |
|---|---|
| `id`, `type`, `shape` | Identificador, função sugerida e formato gerado |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | Limites viáveis para as dimensões da sala |
| `areaRange`, `aspectRatioRange`, `rotationAllowed` | Área, proporção e possibilidade de rotação |
| `wallThickness`, `wallType`, `ceilingHeight` | Parede visual, tipo de parede e altura do teto (não definida pelo gerador) |
| `floorType`, `elevation`, `irregularity` | Piso, nível e variação do contorno |
| `purpose`, `importance`, `encounterChance` | Uso, importância e estimativa narrativa; encontros não são gerados |
| `treasureChance`, `trapChance`, `secretChance` | Chances efetivas de tesouro, armadilhas e portas secretas |
| `occupancy`, `coverDensity`, `lootCapacity` | Estimativas de ocupação, cobertura e capacidade de recompensas |
| `environmentalHazardChance` | Chance de armadilha ambiental |
| `faction`, `originalPurpose`, `currentState`, `age` | Sugestões de contexto e histórico da sala |
| `securityLevel`, `magicLevel`, `decayLevel` | Níveis narrativos de proteção, magia e deterioração |
| `themeTags`, `specialFeatures`, `narrativeHooks` | Etiquetas, características presentes e ganchos narrativos |

Os campos narrativos são sugestões, não fatos simulados. `coverDensity` reflete os pilares gerados; `lootCapacity` é uma estimativa e não determina a quantidade de tesouros. `secretChance` se refere às portas geradas, não a uma chance calculada por sala.

## Executar localmente

**Requisitos:** Node.js 18 ou superior e npm.

```bash
git clone https://github.com/Tadeu-Raphael/2d-dungeon-generator.git
cd 2d-dungeon-generator
npm ci
npm run dev
```

O Vite informa o endereço local ao iniciar; por padrão, é `http://localhost:5173`.

Para validar e gerar a versão de produção:

```bash
npm test
npm run build
npm run preview
```

Os arquivos de produção são gerados em `dist/`.

## Tecnologias

- React
- TypeScript
- Vite
- PixiJS
- Three.js
- Vitest

## Estrutura do projeto

| Caminho | Responsabilidade |
|---|---|
| `src/App.tsx` | Interface, configurações e guia |
| `src/dungeon.ts` | Algoritmos, mapa e elementos gerados |
| `src/dungeonProfiles.ts` | Conceitos e perfis de geração |
| `src/generationBaselines.ts` | Casos V1 de referência e gerador da coleção |
| `src/dungeon.test.ts` | Testes de regressão e contrato da geração |
| `src/generationPlan.ts` | Modelo lógico de salas, conexões, setores e transições |
| `src/generationPlanValidation.ts` | Validação estrutural do GenerationPlan |
| `src/generationPlanToDungeon.ts` | Conversão de GenerationPlan para Dungeon |
| `src/generationPlan.test.ts` | Testes do modelo, validador e conversor |
| `src/generationTopology.ts` | Geração e análise determinística de grafos de topologia |
| `src/generationTopology.test.ts` | Testes de estilos, progressão, perfis, ciclos e acessibilidade |
| `src/roomTypes.ts` | Categorias e funções de salas |
| `src/treasures.ts` | Categorias e catálogo de tesouros |
| `src/DungeonCanvas.tsx` | Renderização do mapa e exportação |
| `src/DungeonThreeCanvas.tsx` | Visualização 3D orbitável e seleção de salas |

## Referências relacionadas

Os projetos abaixo serviram como referências para comparar a apresentação de recursos, algoritmos, controles e instruções de execução. São projetos independentes, não dependências deste gerador:

- [Edgar for Unity](https://github.com/OndrejNepozitek/Edgar-Unity) — gerador procedural configurável com documentação e exemplos.
- [Dungeon Forge](https://github.com/majidmanzarpour/threejs-procedural-dungeon) — gerador web com seed reproduzível, controles interativos e descrição do pipeline.

## Licença

Este projeto está licenciado sob a **MIT License**.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
