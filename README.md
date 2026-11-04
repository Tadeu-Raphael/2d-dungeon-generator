# Dungeon Foundry

[![GitHub Stars](https://img.shields.io/github/stars/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Forks](https://img.shields.io/github/forks/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Issues](https://img.shields.io/github/issues/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator/issues)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#licença)

Aplicação web interativa para gerar, explorar e exportar mapas de masmorras para RPGs. Alterne entre a planta 2D, renderizada em tiles com PixiJS, e uma visualização 3D orbitável com Three.js. Os mapas podem ser reproduzidos usando a mesma seed.

## Recursos

- **Oito conceitos de masmorra**, cada um com regras próprias para geração e distribuição de salas, armadilhas e tesouros.
- **Geração procedural combinável** com BSP, Cellular Automata e Drunkard's Walk.
- **Dois pipelines disponíveis**: V1 permanece como padrão; V2 gera topologia, layout e corredores por meio de `GenerationPlan`.
- **Geração responsiva**: solicitações maiores usam Web Worker; mapas menores mantêm a execução síncrona e os mesmos algoritmos.
- **Seed reproduzível** e dimensões configuráveis: de 20 a 1.000 tiles por eixo, com orçamento máximo de 250.000 tiles.
- **Salas ajustáveis**: de 4 a 24 salas, 13 formatos, sete portes, proporções retangulares e frequências personalizáveis para 11 categorias e 168 funções.
- **Cavernas naturais opcionais**, além do conceito Caverna natural, que gera cavernas sem salas estruturadas.
- **Elementos de mapa** como portas, escadas, colunas, água e lava; as camadas de água e lava podem ser exibidas ou ocultadas.
- **Visualização 2D e 3D** do mesmo mapa. Na vista 3D, paredes, pisos, pilares e marcadores de salas ganham volume; orbite com o arraste, aproxime com a roda do mouse e mova a câmera com o botão direito.
- **Guia de salas, armadilhas e tesouros** com detalhes, metadados e resumos por mapa. O catálogo inclui 138 armadilhas em nove categorias e tesouros em dez categorias.
- **Reposicionamento de salas** por arraste, ajustado à grade, sem sobreposição ou saída dos limites; os corredores são recalculados e a conectividade é preservada.
- **Exportação do mapa em SVG e PNG.**

## Limites de escala

A aplicação aceita mapas de 20 a 1.000 tiles em cada eixo, limitados também a 250.000 tiles no total. O teto preserva a matriz legada `Dungeon.tiles` e limita o roteador direcional a, no máximo, um milhão de estados A*; dimensões fora desses limites são rejeitadas antes da geração, em vez de alocar matrizes sem limite. Assim, 1000×1000 não é suportado (excede o limite de área), embora dimensões como 1000×250 sejam permitidas. A exportação reduz a escala para permanecer abaixo de 16 milhões de pixels.

No V2, salas e conexões permanecem no `GenerationPlan` até a conversão final. A busca de posições adapta sua resolução ao tamanho do mapa e refina localmente cada candidato. Para cada sala, o layout pré-calcula limites, folgas de colisão e relações topológicas; a pontuação considera apenas salas conectadas ou do mesmo setor. Isso preserva a ordem de busca e as chamadas ao RNG, mantendo o resultado determinístico. O roteador mantém índices compactos de salas/obstáculos e reutiliza buffers tipados entre conexões. O benchmark verifica o grafo contra um BFS em tiles com filas tipadas e mede separadamente as etapas:

Três execuções com as mesmas seeds (83001–83004); valores abaixo são medianas. “Antes” é a medição imediatamente anterior à otimização do layout e já inclui o cache da heurística A*. A integridade e o roteamento foram validados em cada execução.

| Dimensões | Salas | Conexões | Geração antes | Layout antes | Geração depois | Layout depois | Rasterização depois | Falhas / fallback |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 160×120 | 6 | 6 | 237 ms | 75 ms | 197 ms | 24 ms | 3,1 ms | 0 / não |
| 250×250 | 8 | 8 | 451 ms | 199 ms | 282 ms | 25 ms | 3,0 ms | 0 / não |
| 400×300 | 12 | 12 | 715 ms | 437 ms | 300 ms | 23 ms | 4,4 ms | 0 / não |
| 500×500 | 16 | 17 | 627 ms | 435 ms | 212 ms | 26 ms | 4,6 ms | 0 / não |

No caso de estresse com 24 salas em 160×120 (seed 81004), a V2 gerou todas as salas sem fallback e passou na validação de conectividade. A mediana de três execuções foi 3.044 ms no total, com 103 ms no layout e 2.904 ms no roteamento; portanto, o roteamento permanece o principal gargalo nesse caso.

As medições usam seeds fixas e representam o ambiente local, não uma garantia de tempo em todos os dispositivos. A variação de heap é aproximada e não representa o pico de memória. A serialização SVG é medida separadamente, mas não representa o tempo de renderização GPU de PixiJS ou Three.js; a renderização Three.js ainda não foi medida.

## Geração em segundo plano

A aplicação estima o trabalho como `área do mapa × maior valor entre salas e iterações celulares aplicáveis`; a partir de 120.000 unidades, executa o mesmo `generateDungeonPipeline` em um Web Worker. Com a otimização atual, 160×120 com 6 salas representa 115.200 unidades e levou uma mediana de cerca de 197 ms; 96×72 com 18 salas representa 124.416 unidades e levou cerca de 164 ms. O limite é uma heurística baseada no trabalho estimado, não uma garantia de duração.

O mapa concluído permanece visível durante o trabalho. Alterar parâmetros substitui a solicitação, cancelar termina o Worker ativo e identificadores de solicitação impedem que respostas antigas atualizem a tela. O Worker transfere os tiles em um `ArrayBuffer` compacto, que é reconstruído como `Dungeon.tiles` na interface. O progresso disponível é indeterminado (“gerando”): o pipeline é síncrono internamente e ainda não fornece etapas intermediárias para uma porcentagem confiável.

A prévia 2D usa uma base rasterizada e desenha detalhes apenas na região visível em mapas grandes.

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

A geração legada é a **V1**. `generateDungeon` permanece como entrada compatível, e `generateDungeonV1` é um alias explícito. `generateDungeonVersioned` retorna a dungeon e metadados com versão, seed, perfil, algoritmo efetivo, parâmetros e horário da execução. O horário é apenas informativo; não participa do resultado determinístico. A interface inicia em V1 e permite selecionar V2 sem remover a versão anterior.

A V1 continua usando o fluxo aleatório original. `createGenerationRandomStreams` oferece fluxos independentes para topologia, posicionamento, corredores, conteúdo e decoração; o pipeline V2 usa esses fluxos para que posicionamento, rotas e conteúdo não compartilhem o mesmo estado aleatório.

O despacho V1 respeita os algoritmos declarados em `dungeonProfiles.ts`: o templo usa BSP + Cellular Automata; catacumbas e mina usam BSP + Drunkard's Walk; laboratório e civilização perdida usam o híbrido; a caverna natural usa Cellular Automata. O controle **Incluir cavernas** acrescenta Cellular Automata aos perfis compatíveis, combinando os passes em `hybrid` quando necessário. `resolveDungeonGenerationAlgorithm` retorna o algoritmo efetivo e uma explicação quando há fallback.

### Integração do pipeline V2

`generateDungeonPipeline` é o ponto de entrada usado pela interface para V1 e V2. A V2 usa o BSP V1 para produzir uma receita de dimensões e conteúdo de salas; esse estágio cria uma `Dungeon` intermediária cujos dados são extraídos para `RoomNode`s. Em seguida, a V2 aplica as afinidades probabilísticas do perfil, gera topologia e caminho principal, posiciona as salas, transfere armadilhas/elementos de sala, roteia corredores, valida o plano e converte o resultado para `Dungeon`. O perfil influencia estilo espacial, porte das salas, densidade e largura dos corredores sem substituir as categorias ou os pesos temáticos existentes.

Os controles V2 permitem substituir a topologia e o estilo espacial sugeridos pelo perfil, ajustar conexões/ciclos, compactação e variação das larguras. A seed reproduz grafo, layout, rotas e tiles. `metadata.generatorVersion` identifica a versão efetivamente usada; em um fallback V2→V1, `requestedGeneratorVersion`, `fallbackReason` e `fallbackStage` tornam a decisão explícita.

O perfil **Caverna natural**, a opção de cavernas híbridas e entradas externas usam fallback V1 enquanto essas geometrias não estiverem representadas como conexões roteáveis no GenerationPlan. O fallback preserva o algoritmo e o conteúdo V1, e a interface exibe o motivo. Para perfis cuja receita V1 declara `bsp-drunkard` ou `hybrid`, a V2 informa que usa BSP apenas como receita de salas/conteúdo; topologia, layout e corredores finais continuam vindo do pipeline V2.

### Modelo lógico GenerationPlan

`GenerationPlan` é a camada lógica/geométrica usada pela V2, sem substituir o contrato consumido pelo restante da aplicação. `RoomNode.roomRole` descreve a função estrutural da sala (como entrada ou objetivo), enquanto `roomType` continua usando as categorias temáticas existentes (como religiosa ou arcana). Cada sala fornece um `footprint` de tiles locais explícitos, e cada conexão geométrica fornece seu próprio caminho absoluto. Caminhos duplicados são rejeitados, mas conexões paralelas intencionais podem declarar `metadata.allowParallel: true`.

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

### Posicionamento espacial do GenerationPlan

`generateGenerationSpatialLayout` posiciona as salas de um plano topológico sem modificar suas conexões, setores ou caminho principal. O estilo espacial pode ser escolhido independentemente da topologia — `axis-branches`, `central-hub`, `ring` ou `clusters` — e, se omitido, é inferido da topologia (`centralized` → hub, `sectorized`/`hybrid` → clusters, `circuit` → anel; demais → eixo com ramificações).

```ts
const topology = generateDungeonTopology(roomPlan, { profile: "catacombs" });
const layout = generateGenerationSpatialLayout(topology, { style: "ring" });
layout.spatialLayout?.metrics.score;
```

O posicionamento combina âncoras por estilo, relaxação force-directed de atrações/repulsões e empacotamento de retângulos com footprints como aproximação conservadora de colisão. O estilo `clusters` divide zonas por BSP apenas para posicionar setores/agrupamentos; os outros estilos não usam zoneamento BSP. As distâncias de conexões influenciam o layout e são verificadas contra `maximumConnectionDistance`. A busca é limitada, determinística pela seed e pelo subfluxo `placement`; tenta reduzir o espaçamento e, como último recurso, girar ou reduzir salas somente dentro dos limites registrados em `generationBounds`. Se não for possível posicionar todas as salas ou respeitar o limite de distância, `SpatialLayoutError` informa as salas/conexões afetadas — elas não são descartadas silenciosamente.

`spatialLayout` registra `layout-v1`, estilo, contagem de tentativas, ajustes aplicados e métricas de sobreposição, distâncias, compactação, cobertura, topologia, espaço para corredores, agrupamento por setor e pontuação ponderada. A busca é limitada pela área do mapa, pelas variantes de cada sala e por até cinco tentativas; cada candidato compara no máximo 24 retângulos. Como o projeto limita a dungeon a 24 salas, essa comparação limitada foi preferida a um índice espacial adicional. A divisão de zonas BSP serve apenas como âncora de clusters e não substitui o gerador legado.

O layout ainda não roteia corredores: as arestas ficam com `path` vazio e `geometryStatus: "unrouted"`. O roteador descrito a seguir transforma esse layout em uma planta física. O fluxo V1, seus perfis, o reposicionamento/BFS e os renderizadores existentes permanecem inalterados.

### Roteamento de corredores do GenerationPlan

`routeGenerationPlanCorridors` implementa uma busca A* em grade com estado de direção. Ela começa em aberturas candidatas nas bordas reais dos footprints, busca até uma abertura do cômodo de destino e não atravessa salas, recursos ou elementos de transição não relacionados. Paredes são escaváveis; corredores já roteados podem ser compartilhados quando a conexão tem uma sala em comum ou quando o grafo marca o ciclo como intencional. Cruzamentos sem essa relação são proibidos.

```ts
const topology = generateDungeonTopology(roomPlan, { profile: "ancient-temple" });
const layout = generateGenerationSpatialLayout(topology, { style: "axis-branches" });
const routed = routeGenerationPlanCorridors(layout);
const dungeon = generationPlanToDungeon(routed);
```

O caminho é determinístico pela seed, pelo subfluxo independente `corridors` e pela ordem estável das conexões. Os custos padrão são: movimento `1`, escavação de parede `1.5`, reutilização `0.2`, mudança de direção `2` multiplicada pelo estilo, e junção de ciclo `4`; trajetos sinuosos recebem ainda uma atração determinística por uma curva lateral. `CorridorRoutingOptions.costs` permite ajustar esses valores, e `maxExpandedStates` limita cada busca. Uma falha ou limite de busca produz `CorridorRoutingError` com o ID da conexão; nenhuma aresta é descartada silenciosamente.

O estilo da rota fica em `ConnectionEdge.metadata.routeStyle` e pode ser `straight`, `angular`, `sinuous` ou `transition`. A topologia e os perfis fornecem preferências, não regras rígidas. A largura usa `DungeonParameters.corridorWidth` como referência: caminho principal, objetivo/chefe e ligação entre setores podem receber uma tile extra; conexões opcionais ou secretas podem ficar uma tile mais estreitas. Uma largura definida explicitamente na aresta (ou marcada com `metadata.widthIsFixed`) é preservada. O limite físico atual é de três tiles; se a largura pedida não couber, o roteador tenta larguras menores até um tile e registra a solicitação original.

```text
R───R       R──┐       R─╮       R══[vestíbulo]══R
reta        angular      sinuosa   transição/larga
```

As larguras são verificadas durante o A*, inclusive nas curvas. Aberturas de portas recebem `ConnectionEndpointGeometry` com orientação, tiles da parede e posição de entrada; transições de porta/porta secreta são colocadas nesses endpoints (a configuração de portas duplas continua respeitada). Junções compartilhadas geram `PlanIntersection` de tipo T, cruzamento ou merge; rotas `transition` podem gerar vestíbulos 3×3 quando há espaço. A validação final verifica continuidade, limites, footprints completos, obstáculos, endpoints, portas e junções antes de marcar `geometryStatus: "routed"`.

O resultado informa em `corridorRouting` quantas conexões foram roteadas, o comprimento total, células de corredor compartilhadas, junções, vestíbulos e transições de porta. Conexões verticais/múltiplos andares são rejeitadas explicitamente nesta fase. A conversão mantém `Dungeon.tiles`, `roomDetails` e os elementos que os renderizadores já entendem; PixiJS, Three.js, SVG e PNG não dependem de `GenerationPlan`. A V2 é integrada à interface, enquanto o fluxo V1 continua disponível.

## Controles e interação

As configurações estão organizadas nas abas **Geração**, **Salas**, **Tipos**, **Armadilhas**, **Tesouros** e **Acesso**. Na aba **Geração**, escolha V1/V2, conceito e dimensões; V2 também expõe topologia, distribuição espacial, compactação e ajustes avançados de ciclos e larguras. As demais abas ajustam proporções e formatos das salas, categorias funcionais e chances de conteúdo.

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
npm run typecheck
npm test
npm run benchmark
npm run build
npm run preview
```

Os arquivos de produção são gerados em `dist/`.

Para responsabilidades dos módulos, fluxo de geração, convenções de contribuição e limites conhecidos, consulte o [guia técnico](./docs/architecture.md).

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
| `src/dungeon.ts` | Modelo legado `Dungeon`, APIs de geração V1 e fachada de compatibilidade |
| `src/core/` | Tipos fundamentais, tiles, aleatoriedade e algoritmos legados de geração |
| `src/core/generation/` | Algoritmos BSP, cellular e drunkard, composição híbrida e utilitário compartilhado de matriz |
| `src/core/generation/grid.ts` | Criação consistente de matrizes de tiles, reutilizada pelo V1, V2 e algoritmos |
| `src/core/generation/roomOptions.ts` | Tipos e catálogos de formas/tamanhos; referência dimensional compartilhada com o BSP |
| `src/dungeonProfiles.ts` | Conceitos e perfis de geração |
| `src/generationBaselines.ts` | Casos V1 de referência e gerador da coleção |
| `src/dungeon.test.ts` | Testes de regressão e contrato da geração |
| `src/generationPlan.ts` | Modelo lógico de salas, conexões, setores e transições |
| `src/generationPipeline.ts` | Despacho V1/V2 e orquestração do grafo, layout, roteamento e conversão |
| `src/generationRoomRecipe.ts` | Receita BSP de salas e conteúdo usada como entrada para a V2 |
| `src/generationPipeline.test.ts` | Integração por perfil, determinismo, fallbacks e contrato dos renderizadores/exportações |
| `src/generationPlanValidation.ts` | Validação estrutural do GenerationPlan |
| `src/generationPlanToDungeon.ts` | Conversão de GenerationPlan para Dungeon |
| `src/generationPlan.test.ts` | Testes do modelo, validador e conversor |
| `src/generationCorridorGeometry.ts` | Footprints de largura e curvas para corredores |
| `src/generationCorridorRouter.ts` | Roteamento A* determinístico, portas e junções |
| `src/generationCorridorRouter.test.ts` | Testes geométricos, determinismo e integração |
| `src/generationTopology.ts` | Geração e análise determinística de grafos de topologia |
| `src/generationTopology.test.ts` | Testes de estilos, progressão, perfis, ciclos e acessibilidade |
| `src/roomTypes.ts` | Categorias e funções de salas |
| `src/treasures.ts` | Categorias e catálogo de tesouros |
| `src/rendering/` | Renderizadores PixiJS/Three.js, semântica de tiles e exportação SVG |
| `src/rendering/DungeonCanvas.tsx` | Visualização PixiJS, interação 2D, zoom e arraste de salas |
| `src/rendering/DungeonThreeCanvas.tsx` | Visualização Three.js, câmera e interação 3D |
| `src/ui/components/` | Componentes da interface, incluindo controles de exportação |
| `src/ui/hooks/` | Hooks da interface |
| `src/DungeonCanvas.tsx`, `src/DungeonThreeCanvas.tsx`, `src/DungeonExportControl.tsx` | Fachadas para manter compatibilidade com imports existentes |
| `src/rendering/dungeonSvg.ts` | Serialização SVG e preparação para exportação PNG |
| `src/rendering/dungeonTileSemantics.ts` | Paleta, visibilidade e regras de tiles compartilhadas entre renderizadores |
| `src/rendering/dungeonThreeResources.ts` | Descarte de geometrias, materiais, texturas e buffers instanciados do Three.js |

PixiJS e Three.js consomem o mesmo modelo legado `Dungeon`; regras visuais compartilhadas ficam em `dungeonTileSemantics.ts`, enquanto geometria de cena e ciclo de vida permanecem específicos do renderizador. O foco de sala é tipado em `src/rendering/types.ts`. Os renderizadores são isolados de atualizações alheias da interface, e alternar água/lava em 3D atualiza cores/visibilidade sem reconstruir toda a cena.

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
