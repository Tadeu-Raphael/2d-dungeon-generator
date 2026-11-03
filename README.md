# Dungeon Foundry

[![GitHub Stars](https://img.shields.io/github/stars/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Forks](https://img.shields.io/github/forks/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator)
[![GitHub Issues](https://img.shields.io/github/issues/Tadeu-Raphael/2d-dungeon-generator?style=for-the-badge)](https://github.com/Tadeu-Raphael/2d-dungeon-generator/issues)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#licença)

Aplicação web interativa para gerar, explorar e exportar mapas 2D de masmorras para RPGs. Os mapas são renderizados em tiles com PixiJS e podem ser reproduzidos usando a mesma seed.

## Recursos

- **Oito conceitos de masmorra**, cada um com regras próprias para geração e distribuição de salas, armadilhas e tesouros.
- **Geração procedural combinável** com BSP, Cellular Automata e Drunkard's Walk.
- **Seed reproduzível** e dimensões configuráveis: de 20 a 160 tiles de largura e de 20 a 120 tiles de altura.
- **Salas ajustáveis**: de 4 a 24 salas, 13 formatos, sete portes, proporções retangulares e frequências personalizáveis para 11 categorias e 168 funções.
- **Cavernas naturais opcionais**, além do conceito Caverna natural, que gera cavernas sem salas estruturadas.
- **Elementos de mapa** como portas, escadas, colunas, água e lava; as camadas de água e lava podem ser exibidas ou ocultadas.
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
| **BSP** | Divide o mapa em regiões para posicionar salas e conectá-las por corredores. |
| **Cellular Automata** | Suaviza áreas abertas e cria cavernas orgânicas. |
| **Drunkard's Walk** | Escava trilhas e túneis conectados. |

Os métodos podem ser combinados para criar mapas com salas, túneis e cavernas. A seed permite reproduzir o mapa; o botão **Reroll masmorra** gera outro usando uma nova seed.

## Controles e interação

As configurações estão organizadas nas abas **Geração**, **Salas**, **Tipos**, **Armadilhas**, **Tesouros** e **Acesso**. Elas permitem ajustar o conceito, as dimensões, as proporções e os formatos das salas, as categorias funcionais e as chances de geração.

- Na aba **Acesso**, escolha uma escadaria superior, uma entrada externa ou uma conexão com o exterior. Portas são colocadas em soleiras reais, e escadas indicam a direção de subida ou descida.
- Selecione uma sala no mapa para destacá-la no guia e abrir seus detalhes. O modal separa metadados de estrutura, uso e riscos, narrativa, armadilhas e tesouros.
- Use **Mover** para reposicionar uma sala; use **Ajustar** para enquadrar o mapa e os controles de zoom para aproximar ou afastar.
- Armadilhas e tesouros são apresentados no guia, não como ilustrações no mapa. Armadilhas em corredores recebem identificadores numéricos no mapa e nas exportações.
- A exportação oferece os formatos **SVG** e **PNG**. O mapa exportado não inclui marcadores de tesouros nem ilustrações das armadilhas.

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
npm run build
npm run preview
```

Os arquivos de produção são gerados em `dist/`.

## Tecnologias

- React
- TypeScript
- Vite
- PixiJS

## Estrutura do projeto

| Caminho | Responsabilidade |
|---|---|
| `src/App.tsx` | Interface, configurações e guia |
| `src/dungeon.ts` | Algoritmos, mapa e elementos gerados |
| `src/dungeonProfiles.ts` | Conceitos e perfis de geração |
| `src/roomTypes.ts` | Categorias e funções de salas |
| `src/treasures.ts` | Categorias e catálogo de tesouros |
| `src/DungeonCanvas.tsx` | Renderização do mapa e exportação |

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
