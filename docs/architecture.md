# Arquitetura e desenvolvimento

Este documento descreve as fronteiras atuais do gerador e os procedimentos para alterá-lo sem acoplar geração, interface e renderização. A arquitetura evolui incrementalmente; a V1 e o formato `Dungeon.tiles` continuam sendo contratos compatíveis.

## Visão geral

```text
Parâmetros da interface
  -> App.tsx / useDungeonGeneration
  -> execução síncrona ou GenerationWorkerRunner
  -> generateDungeonPipeline
       -> V1: geração compatível baseada em tiles
       -> V2: receita de salas -> GenerationPlan -> topologia
              -> layout espacial -> roteamento -> validação
              -> adaptação para Dungeon
  -> Dungeon consumida por PixiJS, Three.js e exportação SVG/PNG
```

O Worker chama o mesmo `generateDungeonPipeline` usado na execução síncrona; não existe uma segunda implementação dos algoritmos. A interface escolhe a execução em Worker por uma estimativa de trabalho, atualmente a partir de 120.000 unidades. O cancelamento termina o Worker ativo e IDs de solicitação impedem que um resultado antigo substitua o mais recente. O pipeline ainda não fornece progresso percentual por etapa.

## Responsabilidades dos módulos

| Módulo | Responsabilidade |
|---|---|
| `src/core/types.ts`, `tiles.ts`, `random.ts` | Tipos comuns, IDs de tiles e fontes determinísticas de aleatoriedade. |
| `src/core/content/` | Regras e valores dos elementos de conteúdo gerados, como portas, armadilhas, tesouros e líquidos. |
| `src/core/generation/` | Primitivas de grid e algoritmos legados BSP, Cellular Automata, Drunkard's Walk e híbrido. |
| `src/dungeon.ts` | Modelo legado `Dungeon`, parâmetros e APIs públicas da V1; também mantém regras de geração e edição que ainda não foram extraídas. É a maior concentração de responsabilidades restante. |
| `src/dungeonProfiles.ts`, `src/generationRoomRecipe.ts` | Perfis e afinidades de geração; receita BSP de dimensões e conteúdo de salas usada pela V2. |
| `src/generationPlan.ts` | Modelo lógico independente dos renderizadores: salas, funções estruturais, footprints, conexões, setores, transições e features. |
| `src/generationTopology.ts` | Grafo de exploração, caminho principal, ramificações, ciclos, setores e análise de acessibilidade. Não posiciona nem roteia a geometria. |
| `src/generationSpatialLayout.ts` | Posição e ajuste das salas, sem rasterizar tiles ou desenhar corredores. |
| `src/generationCorridorGeometry.ts`, `src/generationCorridorRouter.ts` | Footprint compartilhado de corredores e roteamento A* determinístico, com portas e junções. |
| `src/generationPlanValidation.ts` | Validação estrutural e geométrica do plano, incluindo footprints, conexões, transições e features. |
| `src/generationPlanToDungeon.ts` | Adaptador final do `GenerationPlan` para `Dungeon.tiles` e detalhes que os consumidores existentes entendem. |
| `src/generationPipeline.ts` | Coordena V1/V2, métricas e fallbacks explícitos com motivo e etapa. |
| `src/generationWorkerProtocol.ts`, `generationWorkerRunner.ts`, `generationWorkerRuntime.ts`, `generation.worker.ts` | Mensagens tipadas, seleção/execução/cancelamento do Worker e empacotamento dos tiles em buffer transferível. |
| `src/ui/`, `src/App.tsx`, `src/useDungeonGeneration.ts` | Controles, estado React, formulários e integração com o serviço de geração. `App.tsx` ainda é um módulo grande de coordenação. |
| `src/rendering/` | Renderização PixiJS e Three.js, semântica de tiles, SVG e descarte de recursos gráficos. |
| Fachadas em `src/DungeonCanvas.tsx`, `src/DungeonThreeCanvas.tsx` e `src/DungeonExportControl.tsx` | Compatibilidade com imports públicos existentes; código novo da aplicação deve preferir os caminhos canônicos em `rendering/` e `ui/components/`. |

Os módulos de geração não importam React, PixiJS nem Three.js. A dependência remanescente de `Dungeon` em alguns tipos de planejamento é de domínio/compatibilidade, não de renderização. A geração BSP também importa um tipo de sala de `dungeon.ts` como importação apenas de tipo; o build apaga essa referência, mas a extração dos tipos legados para uma camada neutra continua sendo uma possível melhoria.

## Dados e fluxo de geração

`Dungeon` é o contrato legado: dimensões, `Tile[][]`, detalhes de salas e elementos renderizados. A V1 continua disponível e `generateDungeon` mantém sua API compatível.

`GenerationPlan` é o modelo lógico/geométrico usado pela V2. `RoomNode.roomRole` (por exemplo, entrada, objetivo ou conector) é independente de `roomType` (categoria temática); cada sala possui um footprint explícito. `ConnectionEdge` registra endpoints, estado de acesso, largura e caminho; transições e features são entidades separadas. A geração mantém esses dados fora da matriz completa até a conversão final.

O caminho V2 é:

1. Criar uma receita BSP de salas e conteúdo compatível com os perfis existentes.
2. Preparar o plano com as salas e seus metadados.
3. Gerar topologia e caminho principal usando o subfluxo RNG `topology`.
4. Posicionar salas usando o subfluxo `placement`.
5. Transferir conteúdo e elementos da receita.
6. Roteiar conexões com o subfluxo `corridors`.
7. Validar o plano e sua geometria.
8. Rasterizar uma única vez para o contrato `Dungeon.tiles`.

Os subfluxos determinísticos isolam decisões de topologia, posicionamento, corredores, conteúdo e decoração. O horário de execução e as métricas não participam do resultado. O perfil Caverna natural, cavernas híbridas e entradas externas ainda usam fallback V1; o resultado registra o motivo e a etapa, em vez de ocultar a diferença.

O adaptador recusa planos topológicos ainda não roteados, planos inválidos e conexões verticais. A representação `Dungeon` atual é de um único nível e não pode preservar todas as propriedades lógicas de acesso; não se deve inferir navegação além dos dados que o modelo legado representa.

## Validação, dimensões e renderização

`validateGenerationPlan` verifica consistência estrutural e geométrica antes da conversão. `validateDungeonTopology` verifica caminho principal, conectividade física, acesso do jogador, setores e ciclos. O roteador verifica as rotas durante e após a busca. Os benchmarks também comparam conectividade do grafo com conectividade observada no grid.

O limite atual é de 250.000 tiles por mapa, com no máximo 1.000 tiles por eixo; 1000×1000 é recusado antes de alocar o grid. O teto mantém o custo do modelo legado e do A* dentro do orçamento definido. Aumentá-lo exige medir memória, geração, rasterização, renderização e exportação — não apenas permitir valores maiores nos controles.

PixiJS, Three.js e SVG consomem `Dungeon`, não `GenerationPlan`. `dungeonTileSemantics.ts` mantém paleta e classificação compartilhadas. A geometria e o ciclo de vida de cena continuam específicos de cada renderer; os recursos Three.js são descartados pelo helper dedicado. Os benchmarks medem etapas de geração, rasterização e serialização SVG, mas ainda não medem tempo real de GPU nem o pico de memória.

Os resultados reproduzíveis por dimensão, seed, número de salas e estágio estão na seção [Limites de escala](../README.md#limites-de-escala) do README.

## Como adicionar ou alterar um algoritmo

1. Determine se o algoritmo opera sobre tiles legados ou sobre uma etapa lógica do `GenerationPlan`. Não misture geração e desenho.
2. Para uma primitiva reutilizável de grid/V1, implemente-a em `src/core/generation/` e mantenha a API pública da V1 por meio das exportações/fachadas existentes.
3. Para uma etapa V2, receba e retorne estruturas lógicas tipadas; não aloque/rasterize o mapa inteiro antes da etapa adaptadora e não importe módulos de UI/renderização.
4. Use o subfluxo RNG apropriado via `createGenerationRandomStreams(seed)`. Não introduza chamadas a `Math.random()` nem compartilhe estado aleatório entre etapas independentes.
5. Lance erros explícitos para entradas ou estados impossíveis. Se houver fallback, registre motivo e etapa no resultado; não descarte salas/conexões silenciosamente.
6. Adicione testes com seed fixa para determinismo e testes de invariantes para limites, contagem de salas, footprints, rotas e conectividade. Preserve testes de contrato da V1 quando alterar APIs compartilhadas.
7. Se o custo for relevante, inclua dimensões/seeds no benchmark reproduzível e compare os estágios; não substitua teste de integridade por um teste que apenas confirme a existência do mapa.
8. Atualize este guia e a tabela de módulos do README se a responsabilidade ou o fluxo mudar.

Prefira funções e dados simples a criar uma classe ou interface por algoritmo. Extraia um novo módulo quando isso reduzir dependências ou permitir testar uma responsabilidade isoladamente.

## Padrões e verificações

O TypeScript é strict nos projetos de aplicação e de configuração. `tsconfig.app.json` também ativa `noUnusedLocals`, `noUnusedParameters`, `isolatedModules` e `verbatimModuleSyntax`. Não desabilite essas verificações para contornar um erro; use `import type` para dependências apenas de tipo.

Scripts de validação:

```bash
npm run typecheck
npm test
npm run benchmark
npm run build
```

`build` executa primeiro `typecheck`; `test` executa Vitest em modo não interativo; `benchmark` executa os casos reproduzíveis de `generationBenchmark.test.ts`. `npm run dev` inicia o Vite e `npm run preview` serve o build existente.

ESLint e Prettier ainda não estão configurados nem instalados. Por isso, não há script de lint, verificação automática de formatação ou regra de ordenação de imports para declarar como aprovada. Esta revisão não aplicou uma formatação global que alteraria arquivos fora do foco funcional. Até uma adoção dedicada dessas ferramentas, preserve o estilo local (dois espaços, ponto e vírgula, aspas duplas), agrupe imports externos antes dos internos e mantenha imports de tipos explícitos. Uma futura introdução de ESLint/Prettier deve começar com regras acordadas, corrigir os achados existentes e só então tornar os comandos obrigatórios no CI.

Os testes cobrem regressão V1, plano/validação/conversão, topologia, layout, roteamento, pipeline, Worker, semântica dos renderizadores, descarte Three.js, metadados e benchmark. O projeto não tem ferramenta de cobertura instalada; não se deve apresentar uma porcentagem de cobertura sem instrumentar e medir a suíte.
