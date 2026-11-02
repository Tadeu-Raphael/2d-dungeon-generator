# Dungeon Foundry

Protótipo web para geração procedural de masmorras com React, TypeScript, Vite e PixiJS.

## Executar

```bash
npm install
npm run dev
```

Para validar a compilação de produção:

```bash
npm run build
```

## Conceitos de masmorra

- **Fortaleza militar:** favorece salas de combate, logística e funções especiais; usa salas BSP e corredores.
- **Templo antigo:** favorece espaços religiosos, funerários e enigmas; combina salas com expansões de Cellular Automata.
- **Catacumbas:** prioriza funções funerárias e religiosas; conecta salas com túneis de Drunkard's Walk.
- **Mina abandonada:** favorece logística e espaços naturais; combina salas com túneis escavados.
- **Laboratório arcano:** prioriza pesquisa e experimentação; combina salas, cavernas e trilhas.
- **Caverna natural:** gera somente cavernas orgânicas, sem salas estruturadas.
- **Prisão:** prioriza habitação, combate e desafios; usa salas e corredores.
- **Ruínas de uma civilização perdida:** distribui funções entre espaços religiosos, funerários, naturais e de exploração; combina os três métodos.

O perfil determina automaticamente os pesos das categorias funcionais das salas, as categorias de armadilhas e tesouros e os métodos de geração usados, individualmente ou em conjunto. Na aba **Geração**, selecione **Incluir cavernas** para adicionar áreas orgânicas; o interior da caverna tem cor própria e corredores permanecem separados por paredes. Cavernas podem conter poças e córregos de água ou lava, cachoeiras e cascatas de lava, fontes e nascentes, além de fendas vulcânicas; os controles Água e Lava também mostram ou ocultam esses elementos sem apagar o piso da caverna. As ligações entre salas e cavernas podem ser abertas, protegidas por uma parede frágil rachada ou atravessar um trecho de parede demolido, cada qual com representação própria na legenda. Paredes internas têm bordas destacadas para tornar a divisão dos espaços mais legível. Na aba **Tipos**, é possível substituir a distribuição do perfil por frequências personalizadas.

Os métodos internos são **BSP**, que divide o mapa em regiões equilibradas e conecta salas; **Cellular Automata**, que suaviza áreas abertas para criar cavernas; e **Drunkard's Walk**, que escava trilhas conectadas. A geração combinada preserva as salas e incorpora áreas conectadas abertas pelos métodos selecionados. O controle **Compactação dos corredores** aproxima as salas para reduzir os trajetos; o valor padrão é 65%. As salas retangulares usam uma distribuição ajustável de proporções, podendo chegar a 3:1 ou mais quando o espaço permitir.

Nos mapas com salas, a numeração começa na sala de entrada, prioriza a próxima sala mais próxima pelo trajeto caminhável e termina na sala de saída. Assim, os números acompanham o percurso da masmorra em vez da ordem interna de criação das salas.

Nos mapas com salas, a grade usa 1 tile = 1 m × 1 m. Cada sala recebe uma categoria de porte com dimensões e área aproximadas: Micro (2–4 m; 4–16 m²), Muito pequena (3–6 m; 9–36 m²), Pequena (5–8 m; 25–64 m²), Média (8–12 m; 64–144 m²), Grande (12–18 m; 144–324 m²), Muito grande (18–30 m; 324–900 m²) e Colossal (30–50 m ou mais; 900–2.500 m² ou mais). A referência no painel mostra os usos típicos; o gerador escolhe o porte conforme a área da sala e os limites disponíveis no mapa.

## Formatos de salas

| Formato | Características | Aplicações |
|---|---|---|
| Retangular | Fácil de gerar e preencher | Quartos, depósitos, dormitórios |
| Quadrado | Proporções equilibradas | Salas de guarda, câmaras rituais |
| Circular | Centro bem definido | Templos, arenas, câmaras de chefes |
| Elíptico | Circular, mas alongado | Salões, auditórios |
| Octogonal | Geometria arquitetônica marcante | Santuários, salas de enigmas |
| Em L | Dois espaços conectados | Alojamentos, oficinas |
| Em T | Uma área principal com ramificação | Postos de controle, encruzilhadas |
| Em cruz | Quatro eixos de circulação | Templos, câmaras de mecanismos |
| Em anel | Espaço central cercado por circulação | Templos, prisões, arenas |
| Irregular | Contorno não uniforme | Cavernas, ruínas |
| Com colunas | Espaço dividido por obstáculos estruturais | Salões, templos |
| Com alcovas | Nichos nas paredes | Bibliotecas, criptas, santuários |
| Multinível | Plataformas em alturas diferentes | Arenas, poços, salas de máquinas |

## Identidade visual das salas

Cada função de sala recebe uma cor por categoria, seguindo os grupos de salas descritos abaixo. A cor aparece no piso e no número da sala; o guia lateral também mostra a categoria por extenso e a legenda expansível lista as categorias presentes no mapa. Água e lava mantêm seus símbolos e cores próprios; armadilhas são registradas somente no guia lateral.

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

O catálogo reúne 168 funções, incluindo os tipos do material enviado e os tipos já existentes no gerador. Por padrão, as categorias são intercaladas e a função específica varia conforme a seed; assim, os primeiros 12 números cobrem os 11 grupos, e a legenda mostra apenas os presentes no mapa atual.

## Proporções das salas retangulares

| Proporção | Característica | Exemplo |
|---|---|---|
| 1:1 | Quadrada | 8 × 8 m |
| 1,25:1 | Ligeiramente alongada | 10 × 8 m |
| 1,5:1 | Alongada | 12 × 8 m |
| 2:1 | Muito alongada | 16 × 8 m |
| 3:1 ou mais | Galeria ou corredor largo | 18 × 6 m |

Na aba **Salas**, configure a distribuição percentual dessas proporções; a soma permanece em 100%. O padrão favorece salas quadradas e moderadamente alongadas. Para minas e instalações industriais, aumente as faixas 2:1 e 3:1 ou mais; se uma proporção não couber na região BSP, o gerador usa a mais próxima viável.

## Metadados das salas

Abaixo dos cards de estatísticas do mapa, expanda **Metadados das salas**, abra uma sala e escolha uma das categorias de dados dentro dela. Cada sala tem suas próprias categorias **Estrutura**, **Uso e riscos** e **Narrativa**. Os limites de largura, altura, área e proporção representam as opções viáveis para a região daquela sala, considerando o porte e a proporção selecionados; as dimensões usam a escala de 1 tile = 1 m. Os atributos narrativos são sugestões para inspirar a criação da história, não fatos simulados pelo gerador.

| Propriedade | Informação exibida |
|---|---|
| `id` | Identificador da sala, formado pela seed e seu número |
| `type` | Tipo funcional sugerido para a sala |
| `shape` | Formato geométrico gerado |
| `minWidth` / `maxWidth` | Limites de largura em metros |
| `minHeight` / `maxHeight` | Limites de altura em metros |
| `areaRange` | Área mínima e máxima em m² |
| `aspectRatioRange` | Limites da proporção entre os lados |
| `rotationAllowed` | Indica se o formato permite rotação |
| `wallThickness` / `wallType` | Parede padrão de 1 tile (visual) |
| `ceilingHeight` | Não definida pelo gerador |
| `floorType` | Piso padrão, incluindo água ou lava quando presentes |
| `elevation` | Nível base ou plataforma elevada para salas multinível |
| `irregularity` | Variação de contorno de até 20% para salas irregulares |
| `purpose` / `importance` | Uso funcional e peso narrativo sugeridos |
| `encounterChance` | Estimativa narrativa; encontros não são gerados |
| `treasureChance` | Chance efetiva de geração do tesouro, ajustada pelo tipo da sala |
| `trapChance` | Taxa-base de 25% para armadilhas em salas |
| `secretChance` | Taxa de 20% por porta gerada; não representa uma chance calculada por sala |
| `occupancy` | Faixa estimada de ocupantes com base na função e no espaço |
| `coverDensity` | Cobertura medida pelos pilares efetivamente gerados |
| `lootCapacity` | Espaços estimados para recompensas; não determina a quantidade sorteada |
| `environmentalHazardChance` | Chance de armadilha ambiental no sorteio de armadilhas de sala |
| `faction` | Grupo construtor ou ocupante sugerido |
| `originalPurpose` / `currentState` | Função original sugerida e estado refletido pelos elementos gerados |
| `age` | Faixa de idade sugerida para a estrutura |
| `securityLevel` / `magicLevel` / `decayLevel` | Níveis narrativos sugeridos de proteção, magia e deterioração |
| `themeTags` | Etiquetas temáticas, como `royal`, `undead` e `arcane` |
| `specialFeatures` | Formato e características especiais presentes no mapa |
| `narrativeHooks` | Pergunta ou gancho para desenvolver a história |

Na aba **Salas**, configure os formatos e a quantidade de salas. Ative **Forçar porte das salas** para definir a distribuição percentual entre as sete categorias. As frequências somam 100%; quando uma sala do porte solicitado não couber na região disponível, o gerador tenta o porte viável mais próximo.

Na aba **Tipos**, consulte o catálogo de 168 funções e, opcionalmente, personalize as frequências das categorias funcionais. A primeira sala continua sendo a entrada; a distribuição vale para as demais e mantém as cores, o guia e as exportações sincronizados. Com a personalização desativada, cada perfil define os pesos das categorias.

O painel lateral reúne o guia de salas, armadilhas e tesouros gerados: cada sala lista suas recompensas e armadilhas; armadilhas de corredores, cavernas e trilhas aparecem numa seção própria. Esses elementos são informações do guia e não são desenhados nem selecionáveis no mapa ou nas exportações. Clique em uma sala do guia para abrir seus detalhes em um modal com descrição, categoria, raridade mágica, locais comuns e detalhes variáveis do tesouro; use **Localizar no mapa** para focá-la. Arraste salas pelo mapa para reposicioná-las: o movimento é ajustado à grade e os corredores são recalculados enquanto a sala se move. Salas não podem sair dos limites nem se sobrepor; ao gerar um novo mapa, as posições manuais são descartadas.

O catálogo conta com 138 armadilhas em nove categorias: mecânicas, ambientais, mágicas, captura e contenção, percepção e engano, sonoras e de movimento, biológicas, combate e complexas/encadeadas. As 102 opções adicionadas incluem os tipos listados neste catálogo; a categoria é sorteada com peso relativo ao conceito da masmorra e, dentro dela, o tipo é escolhido entre as opções compatíveis com o local. Fortaleza militar favorece mecanismos, movimento e combate; templos e laboratórios favorecem magia e mecanismos complexos; catacumbas e cavernas naturais favorecem perigos biológicos; prisões favorecem contenção e vigilância. Na aba **Armadilhas**, ajuste a chance por sala (25% por padrão) e por tile de corredor/caverna (5% por padrão, limitado a uma ou três colocações), além de substituir os pesos do conceito por frequências personalizadas. Algumas armadilhas são restritas a salas ou a corredores e cavernas conforme seu funcionamento; todas são apresentadas somente no guia.

Na aba **Tesouros**, ajuste a chance-base por sala, permita ou desative consumíveis e personalize os pesos das dez categorias. Cada conceito favorece categorias coerentes com seu tema; quando a categoria mágica é sorteada, a raridade é definida separadamente (padrão: comum 55%, incomum 25%, raro 13%, muito raro 5% e lendário 2%). A geração escolhe um tesouro compatível com o contexto da sala quando possível e inclui variações de quantidade, qualidade, atributos, valores independentes de relíquias e forma de descoberta para recompensas secretas. Itens amaldiçoados permanecem distintos das armadilhas. O catálogo da aba mostra descrições, locais típicos, raridade mágica e métodos de descoberta; recompensas só aparecem no guia e no modal, sem marcadores no mapa.

As configurações da coluna esquerda estão divididas nas abas **Geração**, **Salas**, **Tipos**, **Armadilhas**, **Tesouros** e **Acesso**. Na aba Geração, escolha um dos oito conceitos, informe a seed (de 0 a 4.294.967.295) para reproduzir um mapa e ajuste as dimensões, com largura de 20 a 160 e altura de 20 a 120 tiles. Na aba Salas, configure de 4 a 24 salas e a frequência dos 13 formatos; o total permanece em 100%. Salas quadradas e circulares podem receber, com baixa probabilidade, quatro pilares dispostos simetricamente; salas no formato **Com colunas** recebem colunas estruturais. Algumas salas também recebem fontes, córregos, poços ou lagoas de água ou lava. Use os botões Água e Lava no mapa para mostrar ou ocultar cada camada. Na aba **Armadilhas**, ajuste a chance por sala e por tile de circulação e, opcionalmente, personalize as frequências das categorias em vez de usar os pesos do conceito. O catálogo nessa aba lista todos os 138 tipos, suas descrições e os espaços em que podem aparecer. Na aba **Tesouros**, configure as recompensas geradas nas salas e consulte o catálogo completo. Na aba Tipos, consulte o catálogo de funções e personalize as frequências das categorias de salas, se desejar. Na aba Acesso, escolha um modo de entrada para a primeira sala: escadaria superior, entrada vinda do exterior ou conexão com o exterior. Nos dois últimos modos, um corredor conecta a sala à borda do mapa. Portas são colocadas apenas em soleiras reais, fora da sala, e quando bloqueiam toda a largura do corredor; grupos independentes não ficam lado a lado. Em corredores de dois tiles, ative a opção de portas duplas para usar duas folhas. Cerca de 20% das portas geradas são secretas. Escadas de subida e descida são posicionadas em áreas exploráveis e indicam a direção com setas. O guia informa o formato de cada sala junto às suas possíveis funções; clique em uma sala do mapa para aproximar e selecioná-la no guia, ou clique em uma sala do guia para focá-la no mapa. Use os controles sobre o mapa para aproximar ou afastar e arraste-o quando ampliado; o botão de exportação acima do guia de salas oferece os formatos SVG e PNG. Os ajustes regeneram o mapa imediatamente; **Reroll masmorra** cria outro mapa com uma nova seed. A seed e métricas básicas são exibidas junto ao mapa.