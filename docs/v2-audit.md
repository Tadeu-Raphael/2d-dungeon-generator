# Auditoria da V2 — etapa 8

## Escopo e método

Auditoria de compatibilidade, escala, conectividade, confiabilidade, Worker, renderização e galeria. Não foram adicionadas estratégias novas de geração. A correção de código ficou restrita a uma inconsistência de geometria encontrada pelos seeds de auditoria.

Os benchmarks multi-seed usam as seeds `83101–83153`, com 3 execuções por configuração, exceto 1000×1000 com 24 salas, que usa 2. Os tempos são médias observadas neste ambiente local; não são garantias de latência. As medidas de memória são diferenças entre snapshots antes/depois de cada configuração e incluem geração e serialização SVG, não picos de consumo.

## Diagnóstico e correção

O seed `83133` revelou que uma sala pequena em anel recebia uma footprint com duas regiões desconectadas. A V2 reutiliza a receita BSP legada, mas sua conversão para `GenerationPlan` não verificava conectividade interna da footprint. O grafo e o roteador consideravam a sala conectada enquanto a BFS de `Dungeon.tiles` não alcançava a região pela qual entrava o corredor.

`roomFootprintFromDungeon` agora conecta componentes separados com o caminho ortogonal mais curto dentro dos limites da sala. A validação da auditoria compara novamente o grafo com os tiles: o seed que falhava passou, assim como as demais configurações multi-seed. A mudança ocorre somente na adaptação da receita para V2; a implementação e as saídas congeladas da V1 permanecem inalteradas.

## Escalabilidade e confiabilidade

`Sucesso V2` conta somente execuções que terminaram em V2. Fallbacks para V1 são contabilizados separadamente. `Conexões` lista a quantidade por seed; `—` significa que não há grafo V2 disponível após fallback. A rasterização é a média das execuções que produziram plano V2; SVG é a média de todas as dungeons produzidas, inclusive fallback.

| Dimensões | Salas pedidas | Seeds | Sucesso V2 | Conexões por seed | Geração média | Rasterização média | Serialização SVG média | Falhas / observações |
|---|---:|---|---:|---|---:|---:|---:|---|
| 160×120 | 6 | 83101–83103 | 3/3 (100%) | 6, 7, 6 | 48,40 ms | 1,43 ms | 0,10 ms | 0 fallback; 0 salas isoladas; 0 divergências grafo/tiles |
| 250×250 | 8 | 83111–83113 | 3/3 (100%) | 8, 8, 8 | 129,07 ms | 2,45 ms | 0,21 ms | 0 fallback; 0 isoladas; 0 divergências |
| 400×300 | 12 | 83121–83123 | 3/3 (100%) | 12, 12, 13 | 270,70 ms | 3,90 ms | 0,32 ms | 0 fallback; 0 isoladas; 0 divergências |
| 500×500 | 16 | 83131–83133 | 2/3 (67%) | 16, —, 16 | 1.194,19 ms | 5,95 ms | 2,00 ms | 1 fallback V1, seed 83132, etapa `corridor-routing`; 0 isoladas; 0 divergências nas duas execuções V2 |
| 1000×1000 | 6 | 83141–83143 | 3/3 (100%) | 6, 7, 6 | 382,70 ms | 11,58 ms | 1,82 ms | 0 fallback; 0 isoladas; 0 divergências |
| 1000×1000 | 24 | 83151–83152 | 0/2 (0%) | —, — | 2.176,46 ms | N/D após fallback | 13,16 ms | 2 fallbacks V1, ambos em `corridor-routing`; 24 salas geradas, 0 isoladas em cada mapa |

O seed `83132` atingiu o limite cumulativo de 350.000 expansões A* na conexão `0008`, após 2 de 4 layouts tentados. Ambos os seeds de 1000×1000/24 atingiram o mesmo limite durante o roteamento V2. Um teste adicional com seed `83006` também exercita esse limite: fallback explícito para V1, 24 salas conectadas e zero salas isoladas. Isso confirma que o teto impede busca ilimitada, mas também mostra que 24 salas em 1000×1000 ainda não são suportadas de forma confiável pela V2.

### Deltas de memória multi-seed

Valores aproximados em MiB (`heap / RSS / ArrayBuffers`). Deltas negativos são possíveis devido à coleta de lixo e liberação de buffers; não representam uso de memória por mapa.

| Dimensões / salas | Δ heap / RSS / ArrayBuffers |
|---|---:|
| 160×120 / 6 | −3,4 / +1,0 / −3,1 |
| 250×250 / 8 | −9,1 / +12,2 / +13,0 |
| 400×300 / 12 | +25,8 / −23,3 / −31,8 |
| 500×500 / 16 | +17,7 / +22,4 / +30,3 |
| 1000×1000 / 6 | −8,6 / +4,8 / +37,4 |
| 1000×1000 / 24 | +11,4 / +40,9 / −15,3 |

O teto documentado de 1.000.000 tiles por mapa e de 1.000 tiles por eixo permanece. A matriz legada `Dungeon.tiles` continua necessária para renderizadores e exportação; a V2 evita materializá-la até a conversão, mas ainda aloca estruturas densas no roteador. Os deltas acima não substituem uma captura de pico ou profiling de heap.

## Auditoria multinível

O cenário reproduzível de cinco níveis usa seed `94105`, dimensões diferentes, níveis secretos/opcionais, cinco pipelines V2 e seis conexões verticais:

| Níveis | Dimensões | Salas pedidas / geradas | Conexões verticais | Alcançáveis | Ciclos | Inconsistências | Geração |
|---:|---|---:|---:|---:|---:|---:|---:|
| 5 | 60×44, 64×48, 80×56, 56×44, 72×52 | 24 / 24 | 6 | 5/5 | 2 | 0 | 169,22 ms |

A segunda execução da mesma seed reproduziu as conexões verticais. A suíte também valida estruturas de um nível e preservação do adaptador legado, geração de dois e três níveis, dimensões diferentes, ciclos, conexões inválidas e níveis desconectados. A galeria exercita exemplos de dois e cinco níveis; não adiciona um novo gerador.

Conexões por escadaria ou escada em espiral agora ligam níveis adjacentes e usam marcadores pareados: descida no nível superior e subida no inferior. A distância Manhattan entre os pontos de chegada é limitada a 8 tiles; o gerador escolhe âncoras de salas próximas e a validação rejeita pares distantes, marcadores inconsistentes e escadas descendentes sem vínculo (exceto a entrada da masmorra). O inspetor da sala mostra o tipo, o sentido, o nível conectado e a coordenada do marcador.

## Compatibilidade e desempenho observado

- **V1:** todos os testes de fingerprints congelados e equivalência com as saídas de referência passaram. A correção de footprint não altera o gerador V1.
- **V2, cavernas e perfis:** os testes de pipeline cobrem topologias, perfis registrados/customizados, cavernas naturais/híbridas, validação, determinismo e integridade grafo/tiles.
- **Worker:** os testes cobrem equivalência síncrona/Worker, cancelamento e proteção contra resultados antigos. No smoke test do navegador, a geração inicial V1 de 64×48 (12 salas) terminou em 25,2 ms. Ao solicitar 1000×1000, o botão Cancelar permaneceu disponível; o clique foi atendido em 125 ms e o status mudou para “Geração cancelada”, sem alertas.
- **2D/3D:** Pixi e Three.js foram abertos na aplicação; cada vista apresentou um canvas de 459×358 pixels e não houve erro visível. A ativação 3D em uma sessão já aquecida levou 274 ms até a vista ficar disponível. Esse tempo inclui a troca da vista e não isola renderização GPU.
- **Exportação:** benchmarks medem a serialização SVG (ver tabela), não renderização GPU nem tempo de exportação PNG. Os testes de contrato existentes cobrem a exportação e os renderizadores.
- **Galeria:** o teste exercita V1/V2, perfis customizados, cavernas híbridas, seis topologias, 1000×1000 e estruturas de dois/cinco níveis. Fallbacks e indisponibilidades aparecem explicitamente; não são contabilizados como sucesso V2.

## Verificação executada

| Comando / validação | Resultado |
|---|---|
| `npm run benchmark` | 12/12 testes de benchmark passaram |
| `npm test` | 182/182 testes, 16 arquivos passaram |
| `npm run typecheck` | Passou |
| `npm run build` | Typecheck e build Vite passaram |
| `git diff --check` | Passou |
| Smoke test no navegador | Geração Worker, cancelamento e vistas 2D/3D sem alertas |

O build ainda exibe um aviso de chunk: o entry JavaScript tem 824,24 kB minificado (257,78 kB gzip) e o chunk Three.js 572,02 kB (142,71 kB gzip). O build é bem-sucedido; vale investigar divisão de código em uma etapa futura.

## Limitações e recomendações

1. **Roteamento denso é o principal gargalo.** O A* alcança o limite de 350.000 estados em alguns seeds a partir de 500×500/16 e em todos os seeds medidos de 1000×1000/24. A próxima investigação deve priorizar heurística/roteamento e métricas de taxa de sucesso sem elevar o teto arbitrariamente.
2. **Picos de memória não foram medidos.** Deltas de snapshots variam com o GC; uma próxima auditoria deve usar profiling de heap/RSS de pico e repetir cada configuração em processo isolado.
3. **GPU e PNG não foram cronometrados isoladamente.** O smoke test confirma que Pixi/Three inicializam, mas benchmarks reais de renderização/exportação devem ser feitos em navegador controlado, com aquecimento e coleta de quadros.
4. **O botão de galeria executa os cenários de benchmark sincronamente.** A geração normal de mapas usa Worker, mas o clique da galeria não foi medido quanto a bloqueio da thread principal; separar essa execução é uma recomendação se o uso revelar pausa perceptível.
5. **O modelo final ainda é rasterizado.** A representação lógica reduz trabalho intermediário, mas chunks não foram introduzidos: os renderizadores e adaptadores legados ainda consomem `Dungeon.tiles`.

Nenhuma etapa posterior foi iniciada.
