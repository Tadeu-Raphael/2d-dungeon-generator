import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import DungeonCanvas, { DungeonExportControl } from "./DungeonCanvas";
import type { MapFocusRequest } from "./DungeonCanvas";
import {
  CAVE_TILE,
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  CORRIDOR_TILE,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  DOOR_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  getNumberedCorridorTraps,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  ROOM_SHAPE_DEFINITIONS,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  repositionDungeonRooms,
  redistributeFrequencies,
  TRAP_CATEGORY_LABELS,
  TRAP_CATEGORY_ORDER,
  TRAP_TYPES,
  WATER_TILE,
  type TrapCategory,
  type Dungeon,
  type DungeonTrap,
  type RoomPosition,
} from "./dungeon";
import {
  getTreasureDefinition,
  TREASURE_CATEGORY_LABELS,
  TREASURE_CATEGORY_ORDER,
  TREASURE_RARITY_LABELS,
} from "./treasures";
import type { TreasureCategory } from "./treasures";
import {
  DUNGEON_CONCEPTS,
  DUNGEON_CONCEPT_ORDER,
  type DungeonConcept,
} from "./dungeonProfiles";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import { useDungeonGeneration } from "./useDungeonGeneration";
import { useDungeonParameters } from "./ui/hooks/useDungeonParameters";
import { ParameterPanel } from "./ui/components/ParameterPanel";
import { RoomsPanel } from "./ui/components/RoomsPanel";
import { TypesPanel } from "./ui/components/TypesPanel";
import { TrapsPanel } from "./ui/components/TrapsPanel";
import { TreasuresPanel } from "./ui/components/TreasuresPanel";
import { AccessPanel } from "./ui/components/AccessPanel";
import {
  createGenerationBenchmarkGalleryHtml,
  runGenerationBenchmark,
} from "./generationBenchmark";
import type { SpatialLayoutStyle, TopologyStyle } from "./generationPlan";
import { ROOM_TYPE_CATEGORIES, ROOM_TYPE_CATEGORY_ORDER } from "./roomTypes";
import type { RoomTypeCategory } from "./roomTypes";
import {
  createRoomMetadataFields,
  getRoomSizeCategory,
  liquidFeatureLabels,
  roomMetadataSections,
  roomShapeLabels,
  RoomMetadataCard,
} from "./ui/components/RoomMetadata";
import type { RoomMetadataField, RoomMetadataSection } from "./ui/components/RoomMetadata";

interface ParameterControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}
type SettingsSection = "generation" | "rooms" | "types" | "traps" | "treasures" | "access";
type CanvasView = "2d" | "3d";
interface RoomPositionEdit { baseDungeon: Dungeon; positions: Record<number, RoomPosition>; dungeon: Dungeon; }
interface GeneratedTrap extends DungeonTrap {
  corridorRoomNumbers: number[];
  corridorNumber?: number;
}

const DungeonThreeCanvas = lazy(() => import("./DungeonThreeCanvas"));

class CanvasViewErrorBoundary extends Component<
  { children: ReactNode; onBackTo2D: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Não foi possível carregar a visualização Three.js.", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="three-canvas-error" role="alert">
          <p>Não foi possível carregar a visualização 3D. A visualização 2D continua disponível.</p>
          <button className="map-control-button" type="button" onClick={this.props.onBackTo2D}>
            Voltar para 2D
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const trapTypeByTile = new Map(
  TRAP_TYPES.map((type) => [TRAP_DEFINITIONS[type].tile, type] as const),
);

function createSeed(previousSeed: number): number {
  const minimumSeed = 100_000_000;
  const maximumSeed = 999_999_999;
  const candidate = Math.floor(Math.random() * 900_000_000) + minimumSeed;
  return candidate === previousSeed
    ? candidate === maximumSeed ? minimumSeed : candidate + 1
    : candidate;
}

function getCorridorRoomNumbers(dungeon: Dungeon, startX: number, startY: number): number[] {
  if (startX < 0 || startY < 0 || startX >= dungeon.width || startY >= dungeon.height) return [];
  const visited = Array.from({ length: dungeon.height }, () => new Uint8Array(dungeon.width));
  const distances = new Map<number, number>();
  const queue: Array<{ x: number; y: number; distance: number }> = [
    { x: startX, y: startY, distance: 0 },
  ];
  visited[startY][startX] = 1;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const [deltaX, deltaY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + deltaX;
      const y = current.y + deltaY;
      if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height || visited[y][x]) continue;
      const tile = dungeon.tiles[y]?.[x];
      if (tile === FLOOR_TILE || tile === ELEVATED_FLOOR_TILE || tile === ROOM_STAIRS_TILE) {
        const room = dungeon.roomDetails.find((candidate) => (
          x >= candidate.x
          && x < candidate.x + candidate.width
          && y >= candidate.y
          && y < candidate.y + candidate.height
        ));
        if (room && !distances.has(room.number)) {
          distances.set(room.number, current.distance + 1);
        }
        continue;
      }
      if (
        tile !== CORRIDOR_TILE
        && tile !== DOOR_TILE
        && tile !== SECRET_DOOR_TILE
        && tile !== EXTERIOR_ENTRANCE_TILE
        && tile !== EXTERIOR_CONNECTION_TILE
        && (tile === undefined || !trapTypeByTile.has(tile))
      ) continue;
      visited[y][x] = 1;
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }

  return [...distances.entries()]
    .sort(([roomA, distanceA], [roomB, distanceB]) => distanceA - distanceB || roomA - roomB)
    .slice(0, 2)
    .map(([roomNumber]) => roomNumber);
}

const corridorControls: ParameterControl[] = [
  { key: "corridorWidth", label: "Largura dos corredores", min: 1, max: 3, step: 1, format: (v) => `${v} ${v === 1 ? "tile" : "tiles"}` },
  { key: "corridorCompactness", label: "Compactação do mapa", min: 0, max: 100, step: 5, format: (v) => `${v}%` },
];
const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "generation", label: "Geração" },
  { id: "rooms", label: "Salas" },
  { id: "types", label: "Tipos" },
  { id: "traps", label: "Armadilhas" },
  { id: "treasures", label: "Tesouros" },
  { id: "access", label: "Acesso" },
];
const topologyStyleOptions: Array<{ id: TopologyStyle; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "branching", label: "Ramificada" },
  { id: "circuit", label: "Circuito" },
  { id: "centralized", label: "Centralizada" },
  { id: "sectorized", label: "Setorizada" },
  { id: "hybrid", label: "Híbrida" },
];
const spatialStyleOptions: Array<{ id: SpatialLayoutStyle; label: string }> = [
  { id: "axis-branches", label: "Eixo com ramificações" },
  { id: "central-hub", label: "Hub central" },
  { id: "ring", label: "Anel" },
  { id: "clusters", label: "Clusters" },
];
export default function App() {
  const { parameters, setParameters, seed, setSeed, seedDraft, setSeedDraft, widthDraft, heightDraft, dimensionDraftError, updateDimensionDraft, updateSeedDraft, commitSeedDraft, commitDimension } = useDungeonParameters();
  const [concept, setConcept] = useState<DungeonConcept>("military-fortress");
  const [generatorVersion, setGeneratorVersion] = useState<typeof DUNGEON_GENERATOR_VERSION_V1 | typeof DUNGEON_GENERATOR_VERSION_V2>(DUNGEON_GENERATOR_VERSION_V1);
  const [canvasView, setCanvasView] = useState<CanvasView>("2d");
  const [topologyStyleSelection, setTopologyStyleSelection] = useState<TopologyStyle | "profile">("profile");
  const [spatialStyleSelection, setSpatialStyleSelection] = useState<SpatialLayoutStyle | "profile">("profile");
  const [cycleCountOverride, setCycleCountOverride] = useState<number | null>(null);
  const [spatialDensityOverride, setSpatialDensityOverride] = useState<number | null>(null);
  const [varyCorridorWidths, setVaryCorridorWidths] = useState(true);
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null);
  const [roomDetailNumber, setRoomDetailNumber] = useState<number | null>(null);
  const [roomDetailSection, setRoomDetailSection] = useState<RoomMetadataSection | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("generation");
  const [roomPositionEdit, setRoomPositionEdit] = useState<RoomPositionEdit | null>(null);
  const guideListRef = useRef<HTMLDivElement | null>(null);
  const roomDetailDialogRef = useRef<HTMLDialogElement | null>(null);
  const preserveRoomFocusOnCloseRef = useRef(false);
  const [showWater, setShowWater] = useState(true);
  const [showLava, setShowLava] = useState(true);
  const [cavesEnabled, setCavesEnabled] = useState(false);
  const [benchmarkGalleryError, setBenchmarkGalleryError] = useState<string | null>(null);
  const [benchmarkGalleryStatus, setBenchmarkGalleryStatus] = useState<string | null>(null);
  const conceptProfile = DUNGEON_CONCEPTS[concept];
  const cavesRequired = concept === "natural-cavern";
  const defaultCycleCount = conceptProfile.topology.parameters.cycleCount ?? 0;
  const spatialDensity = spatialDensityOverride ?? conceptProfile.v2Preferences.defaultDensity;
  const generationRequest = useMemo<DungeonGenerationPipelineRequest>(() => ({
    generatorVersion,
    profile: concept,
    seed,
    parameters,
    cavesEnabled: cavesEnabled || cavesRequired,
    topologyStyle: topologyStyleSelection === "profile" ? undefined : topologyStyleSelection,
    spatialLayoutStyle: spatialStyleSelection === "profile" ? undefined : spatialStyleSelection,
    cycleCount: cycleCountOverride ?? undefined,
    spatialDensity,
    varyCorridorWidths,
  }), [cavesEnabled, cavesRequired, concept, cycleCountOverride, generatorVersion, parameters, seed, spatialDensity, spatialStyleSelection, topologyStyleSelection, varyCorridorWidths]);
  const { generationRun, status: generationStatus, isWorker: isWorkerGeneration, progress: generationProgress, error: generationError, metrics: generationMetrics, cancel: cancelGeneration } = useDungeonGeneration(generationRequest);

  const generatedDungeon = generationRun.dungeon;
  const dungeon = roomPositionEdit?.baseDungeon === generatedDungeon ? roomPositionEdit.dungeon : generatedDungeon;
  const algorithm = generatedDungeon.algorithm;
  const hasBspRooms = dungeon.roomDetails.length > 0;
  const roomDetail = roomDetailNumber === null ? undefined : dungeon.roomDetails.find((room) => room.number === roomDetailNumber);
  const roomDetailCategory = roomDetail ? ROOM_TYPE_CATEGORIES[roomDetail.roomType.category] : undefined;
  const roomDetailShape = roomDetail
    ? ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === roomDetail.shape)
    : undefined;
  const roomDetailSize = roomDetail
    ? getRoomSizeCategory(roomDetail.width, roomDetail.height)
    : undefined;
  const roomDetailMetadata = useMemo(
    () => roomDetail
      ? createRoomMetadataFields(roomDetail, roomDetail.roomType.title, seed, dungeon, roomDetail.roomType.description)
      : [],
    [dungeon, roomDetail, seed],
  );
  const roomDetailMetadataProperties = roomDetailSection
    ? roomMetadataSections.find((section) => section.key === roomDetailSection)?.properties
    : undefined;
  const generatedTraps = useMemo(() => {
    const corridorNumbers = new Map(
      getNumberedCorridorTraps(dungeon)
        .map((trap) => [trap.y * dungeon.width + trap.x, trap.number] as const),
    );
    return dungeon.traps.map((trap): GeneratedTrap => ({
      ...trap,
      corridorNumber: corridorNumbers.get(trap.y * dungeon.width + trap.x),
      corridorRoomNumbers: hasBspRooms ? getCorridorRoomNumbers(dungeon, trap.x, trap.y) : [],
    }));
  }, [dungeon, hasBspRooms]);
  const roomTrapCount = dungeon.roomDetails.reduce((count, room) => count + room.traps.length, 0);
  const roomTreasureCount = dungeon.roomDetails.reduce((count, room) => count + room.treasures.length, 0);
  const usedRoomCategories = [...new Set(
    dungeon.roomDetails.map((room) => room.roomType.category),
  )];
  const tileTypes = useMemo(() => {
    const types = new Set<number>();
    for (const row of dungeon.tiles) {
      for (const tile of row) types.add(tile);
    }
    return types;
  }, [dungeon]);
  const floorPercentage = Math.round((dungeon.floorCount / (dungeon.width * dungeon.height)) * 100);
  const hasOpenCaveConnection = useMemo(
    () => dungeon.tiles.some((row, y) => row.some((tile, x) => (
      tile === CAVE_TILE
      && [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([neighborX, neighborY]) => {
        const neighborTile = dungeon.tiles[neighborY]?.[neighborX];
        return neighborTile !== undefined
          && neighborTile !== 0
          && neighborTile !== CORRIDOR_TILE
          && neighborTile !== CAVE_TILE
          && neighborTile !== CAVE_CONNECTION_WALL_TILE;
      })
    ))),
    [dungeon],
  );
  const floorLabel = generationRun.metadata.generatorVersion === DUNGEON_GENERATOR_VERSION_V2
    ? "SALAS E CORREDORES V2"
    : algorithm === "cellular"
      ? "CAVERNA NATURAL"
      : algorithm === "bsp-cellular"
        ? "SALAS E CAVERNAS"
        : algorithm === "bsp-drunkard"
          ? "SALAS E TRILHAS"
          : algorithm === "hybrid"
            ? "GERAÇÃO MISTA"
            : "SALA";
  const floorDescription = generationRun.fallbackReason
    ?? generationRun.algorithmNote
    ?? conceptProfile.generationDescription;
  useEffect(() => {
    setRoomDetailNumber(null);
    setFocusRequest(null);
    setRoomDetailSection(null);
  }, [generatedDungeon]);
  useEffect(() => { const dialog = roomDetailDialogRef.current; if (!dialog) return; if (roomDetail && !dialog.open) dialog.showModal(); else if (!roomDetail && dialog.open) dialog.close(); }, [roomDetail]);
  useEffect(() => {
    if (!focusRequest || !guideListRef.current) return;
    const entry = guideListRef.current.querySelector<HTMLButtonElement>(
      `button[data-room-number="${focusRequest.roomNumber}"]`,
    );
    entry?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusRequest]);
  const moveRoom = (roomNumber: number, x: number, y: number) => { setRoomPositionEdit((current) => { const activeEdit = current?.baseDungeon === generatedDungeon ? current : null; const positions = { ...activeEdit?.positions, [roomNumber]: { x, y } }; const movedDungeon = repositionDungeonRooms(generatedDungeon, positions); return movedDungeon ? { baseDungeon: generatedDungeon, positions, dungeon: movedDungeon } : current; }); };
  const openRoomDetails = (roomNumber: number) => { setRoomDetailSection(null); setRoomDetailNumber(roomNumber); setFocusRequest((current) => ({ type: "room", roomNumber, requestId: (current?.requestId ?? 0) + 1, shouldFocus: true })); };
  const selectMovedRoom = (roomNumber: number) => { setFocusRequest((current) => ({ type: "room", roomNumber, requestId: (current?.requestId ?? 0) + 1, shouldFocus: false })); };
  const downloadBenchmarkGallery = () => { setBenchmarkGalleryError(null); let objectUrl: string | undefined; try { const html = createGenerationBenchmarkGalleryHtml(runGenerationBenchmark()); objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); const link = document.createElement("a"); link.href = objectUrl; link.download = "generation-benchmark.html"; document.body.appendChild(link); link.click(); link.remove(); setBenchmarkGalleryStatus("Galeria V1 × V2 gerada para download."); } catch (error) { setBenchmarkGalleryError(error instanceof Error ? error.message : "Não foi possível gerar a galeria de benchmark."); } finally { if (objectUrl) { const url = objectUrl; window.setTimeout(() => URL.revokeObjectURL(url), 1_000); } } };
  const updateTrapCategoryFrequency = (key: TrapCategory, value: number) => { setParameters((current) => ({ ...current, trapCategoryWeights: redistributeFrequencies(current.trapCategoryWeights, TRAP_CATEGORY_ORDER, key, value) })); };
  const updateTreasureCategoryFrequency = (key: TreasureCategory, value: number) => { setParameters((current) => ({ ...current, treasureCategoryWeights: redistributeFrequencies(current.treasureCategoryWeights, TREASURE_CATEGORY_ORDER, key, value) })); };
  const updateRoomTypeFrequency = (key: RoomTypeCategory, value: number) => { setParameters((current) => ({ ...current, roomTypeCategoryFrequencies: redistributeFrequencies(current.roomTypeCategoryFrequencies, ROOM_TYPE_CATEGORY_ORDER, key, value) })); };
  const selectedRoomNumber = roomDetailNumber ?? focusRequest?.roomNumber;
  const clearRoomSelection = () => {
    setRoomDetailNumber(null);
    setFocusRequest(null);
  };
  const rerollDungeon = () => {
    setRoomDetailNumber(null);
    setRoomDetailSection(null);
    setFocusRequest(null);
    const nextSeed = createSeed(seed);
    setSeed(nextSeed);
    setSeedDraft(String(nextSeed));
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Dungeon Foundry início">
          <span className="brand-mark" aria-hidden="true">🏰</span>
          <span>DUNGEON <strong>FOUNDRY</strong></span>
        </a>
        <span className="prototype-label"><span /> PROTÓTIPO DE GERAÇÃO</span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">LABORATÓRIO DE MAPAS</div>
          <h1>Forje uma<br />nova masmorra.</h1>
          <p className="intro">Escolha um conceito, decida se haverá cavernas e explore as salas no mapa.</p>
          <nav className="settings-nav" aria-label="Seções de configuração">
            {settingsSections.map((section) => (
              <button className={`settings-nav-button${settingsSection === section.id ? " active" : ""}`} key={section.id} type="button" aria-current={settingsSection === section.id ? "page" : undefined} onClick={() => setSettingsSection(section.id)}>{section.label}</button>
            ))}
          </nav>
          <div className="settings-panel">
            {settingsSection === "generation" && (
              <>
                <div className="section-heading settings-section-heading"><span>VERSÃO DO GERADOR</span></div>
                <label className="entrance-control" htmlFor="generator-version"><span>PIPELINE</span>
                  <select id="generator-version" value={generatorVersion} onChange={(event) => setGeneratorVersion(event.currentTarget.value === DUNGEON_GENERATOR_VERSION_V2 ? DUNGEON_GENERATOR_VERSION_V2 : DUNGEON_GENERATOR_VERSION_V1)}>
                    <option value={DUNGEON_GENERATOR_VERSION_V1}>V1 · compatível</option>
                    <option value={DUNGEON_GENERATOR_VERSION_V2}>V2 · GenerationPlan</option>
                  </select>
                  <small>{generatorVersion === DUNGEON_GENERATOR_VERSION_V1 ? "Geração legada, mantida como padrão." : "Topologia, layout espacial e roteamento de corredores."}</small>
                </label>
                <div className="benchmark-gallery-action">
                  <button className="benchmark-gallery-button" type="button" onClick={downloadBenchmarkGallery}>Baixar galeria V1 × V2</button>
                  <small>Compara os seis seeds congelados da Fase 1, com mapas e métricas.</small>
                  {benchmarkGalleryError && <p className="benchmark-notice" role="alert">{benchmarkGalleryError}</p>}
                  {benchmarkGalleryStatus && <p className="benchmark-notice" role="status">{benchmarkGalleryStatus}</p>}
                </div>
                <label className="entrance-control" htmlFor="dungeon-concept"><span>PERFIL</span>
                  <select id="dungeon-concept" value={concept} onChange={(event) => {
                    const selectedConcept = DUNGEON_CONCEPT_ORDER.find((id) => id === event.currentTarget.value);
                    if (selectedConcept) setConcept(selectedConcept);
                  }}>
                    {DUNGEON_CONCEPT_ORDER.map((conceptId) => (
                      <option key={conceptId} value={conceptId}>{DUNGEON_CONCEPTS[conceptId].name}</option>
                    ))}
                  </select>
                  <small>{conceptProfile.description}</small>
                </label>
                <ParameterPanel
                  widthDraft={widthDraft}
                  heightDraft={heightDraft}
                  seedDraft={seedDraft}
                  dimensionDraftError={dimensionDraftError}
                  updateDimensionDraft={updateDimensionDraft}
                  commitDimension={commitDimension}
                  updateSeedDraft={updateSeedDraft}
                  commitSeedDraft={commitSeedDraft}
                />
                <details className="generation-advanced">
                  <summary>Opções avançadas da V2</summary>
                  <label className="entrance-control" htmlFor="topology-style"><span>TOPOLOGIA</span>
                    <select id="topology-style" value={topologyStyleSelection} onChange={(event) => {
                      const selectedStyle = topologyStyleOptions.find(({ id }) => id === event.currentTarget.value)?.id;
                      setTopologyStyleSelection(selectedStyle ?? "profile");
                    }}>
                      <option value="profile">Padrão do perfil</option>
                      {topologyStyleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="entrance-control" htmlFor="spatial-style"><span>DISTRIBUIÇÃO ESPACIAL</span>
                    <select id="spatial-style" value={spatialStyleSelection} onChange={(event) => {
                      const selectedStyle = spatialStyleOptions.find(({ id }) => id === event.currentTarget.value)?.id;
                      setSpatialStyleSelection(selectedStyle ?? "profile");
                    }}>
                      <option value="profile">Padrão do perfil</option>
                      {spatialStyleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="parameter-control" htmlFor="cycle-count">
                    <span className="parameter-label"><span>Circuitos adicionais</span><strong>{cycleCountOverride ?? defaultCycleCount}</strong></span>
                    <input id="cycle-count" type="range" min={0} max={Math.max(1, parameters.roomCount, defaultCycleCount)} step={1} value={cycleCountOverride ?? defaultCycleCount} onChange={(event) => setCycleCountOverride(Number(event.currentTarget.value))} />
                    <button className="map-control-button" type="button" onClick={() => setCycleCountOverride(null)}>Usar padrão do perfil</button>
                  </label>
                  <label className="parameter-control" htmlFor="spatial-density">
                    <span className="parameter-label"><span>Densidade espacial</span><strong>{spatialDensity}%</strong></span>
                    <input id="spatial-density" type="range" min={0} max={100} step={1} value={spatialDensity} onChange={(event) => setSpatialDensityOverride(Number(event.currentTarget.value))} />
                  </label>
                  <label className="parameter-control" htmlFor="vary-corridor-widths">
                    <span className="parameter-label"><span>Variar largura dos corredores</span></span>
                    <input id="vary-corridor-widths" type="checkbox" checked={varyCorridorWidths} onChange={(event) => setVaryCorridorWidths(event.currentTarget.checked)} />
                  </label>
                  <label className="parameter-control" htmlFor="caves-enabled">
                    <span className="parameter-label"><span>Incluir cavernas</span></span>
                    <input id="caves-enabled" type="checkbox" checked={cavesEnabled} disabled={cavesRequired} onChange={(event) => setCavesEnabled(event.currentTarget.checked)} />
                  </label>
                </details>
              </>
            )}
            {settingsSection === "rooms" && (
              <RoomsPanel
                parameters={parameters}
                setParameters={setParameters}
                corridorControls={corridorControls}
              />
            )}
            {settingsSection === "types" && (
              <TypesPanel
                parameters={parameters}
                updateRoomTypeFrequency={updateRoomTypeFrequency}
              />
            )}
            {settingsSection === "traps" && (
              <TrapsPanel
                parameters={parameters}
                updateTrapCategoryFrequency={updateTrapCategoryFrequency}
              />
            )}
            {settingsSection === "treasures" && (
              <TreasuresPanel
                parameters={parameters}
                updateTreasureCategoryFrequency={updateTreasureCategoryFrequency}
              />
            )}
            {settingsSection === "access" && (
              <AccessPanel
                parameters={parameters}
                setParameters={setParameters}
              />
            )}
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" />
            GERADOR ONLINE
            <span className="version">v0.1.0</span>
          </div>
        </aside>
        <section className="map-panel" aria-label="Masmorra procedural">
          <div className="map-toolbar">
            <div className="map-title">
              <span className="live-dot" />
              <div>
                <strong>MAPA GERADO</strong>
                <small>{conceptProfile.name}</small>
              </div>
            </div>
            <div className="map-toolbar-actions">
              <div className="map-mode-controls canvas-view-toggle" role="group" aria-label="Modo de visualização do mapa">
                <button
                  className="map-control-button"
                  type="button"
                  aria-pressed={canvasView === "2d"}
                  onClick={() => setCanvasView("2d")}
                >
                  2D
                </button>
                <button
                  className="map-control-button"
                  type="button"
                  aria-pressed={canvasView === "3d"}
                  onClick={() => setCanvasView("3d")}
                >
                  3D
                </button>
              </div>
              <span className="map-coordinate">
                {dungeon.width} × {dungeon.height}
                <span>GRID · 1 TILE = 1 M</span>
              </span>
            </div>
          </div>
          {generationStatus === "running" && (
            <div className="generation-notice generation-worker-status" role="status" aria-live="polite">
              <span>{generationProgress ?? "Gerando dungeon..."}</span>
              {isWorkerGeneration && <button type="button" onClick={cancelGeneration}>Cancelar</button>}
            </div>
          )}
          {generationError && <p className="generation-notice" role="alert">{generationError}</p>}
          {generationStatus === "cancelled" && <p className="generation-notice" role="status">Geração cancelada.</p>}
          {generationStatus === "ready" && (
            <p className="generation-notice" role="status">
              {generationMetrics.roomCount} salas geradas em {generationMetrics.generationMs.toFixed(1)} ms.
              {generationRun.fallbackReason && ` ${generationRun.fallbackReason}`}
            </p>
          )}
          <div
            className="map-frame"
            data-generator-version={generationRun.metadata.generatorVersion}
            data-generation-profile={generationRun.metadata.profile}
            data-generation-seed={generationRun.metadata.seed}
          >
            <div className="corner-mark corner-top-left" />
            <div className="corner-mark corner-top-right" />
            <div className="corner-mark corner-bottom-left" />
            <div className="corner-mark corner-bottom-right" />
            {canvasView === "3d" ? (
              <CanvasViewErrorBoundary onBackTo2D={() => setCanvasView("2d")}>
                <Suspense fallback={<div className="canvas-loading">Carregando Three.js...</div>}>
                  <DungeonThreeCanvas
                    dungeon={dungeon}
                    generationKey={generatedDungeon}
                    focusRequest={focusRequest}
                    onRoomSelect={openRoomDetails}
                    onClearSelection={clearRoomSelection}
                    showWater={showWater}
                    showLava={showLava}
                    onToggleWater={() => setShowWater((visible) => !visible)}
                    onToggleLava={() => setShowLava((visible) => !visible)}
                    onBackTo2D={() => setCanvasView("2d")}
                  />
                </Suspense>
              </CanvasViewErrorBoundary>
            ) : (
              <DungeonCanvas
                dungeon={dungeon}
                generationKey={generatedDungeon}
                focusRequest={focusRequest}
                onRoomMove={moveRoom}
                onRoomSelect={openRoomDetails}
                onRoomMoveEnd={selectMovedRoom}
                onClearSelection={clearRoomSelection}
                showWater={showWater}
                showLava={showLava}
                onToggleWater={() => setShowWater((visible) => !visible)}
                onToggleLava={() => setShowLava((visible) => !visible)}
              />
            )}
            <div className="map-overlay-label">NÍVEL 01 <span>/</span> PROCEDURAL</div>
          </div>
          <div className="map-legend">
            <span><i className="legend-room" /> {floorLabel}</span>
            {tileTypes.has(CAVE_TILE) && <span><i className="legend-cave" /> CAVERNA</span>}
            {hasOpenCaveConnection && (
              <span title="A caverna encontra a sala sem parede entre elas">
                <i className="legend-cave-opening" /> ABERTURA
              </span>
            )}
            {tileTypes.has(CAVE_CONNECTION_WALL_TILE) && (
              <span title="Parede íntegra e rachada que pode ser rompida para acessar a caverna">
                <i className="legend-cave-wall" /> PAREDE FRÁGIL
              </span>
            )}
            {tileTypes.has(CAVE_BREACH_TILE) && (
              <span title="Trecho de parede demolido, com passagem entre sala e caverna">
                <i className="legend-cave-breach" /> PAREDE DEMOLIDA
              </span>
            )}
            {dungeon.roomDetails.length > 0 && <span><i className="legend-room-number" /> SALA NUMERADA</span>}
            {tileTypes.has(PILLAR_TILE) && <span><i className="legend-pillar" /> PILARES</span>}
            {tileTypes.has(ELEVATED_FLOOR_TILE) && <span><i className="legend-multilevel" /> NÍVEIS</span>}
            {[
              WATER_TILE,
              CAVE_WATER_TILE,
              CAVE_WATERFALL_TILE,
              CAVE_SPRING_TILE,
            ].some((tile) => tileTypes.has(tile)) && <span><i className="legend-water" /> ÁGUA</span>}
            {[
              LAVA_TILE,
              CAVE_LAVA_TILE,
              CAVE_LAVA_FALL_TILE,
              CAVE_LAVA_VENT_TILE,
            ].some((tile) => tileTypes.has(tile)) && <span><i className="legend-lava" /> LAVA</span>}
            {tileTypes.has(CAVE_WATERFALL_TILE) && <span><i className="legend-cave-waterfall" /> CACHOEIRA</span>}
            {tileTypes.has(CAVE_LAVA_FALL_TILE) && <span><i className="legend-cave-lavafall" /> CASCATA DE LAVA</span>}
            {tileTypes.has(CAVE_SPRING_TILE) && <span><i className="legend-cave-spring" /> FONTE / NASCENTE</span>}
            {tileTypes.has(CAVE_LAVA_VENT_TILE) && <span><i className="legend-cave-vent" /> FENDA DE LAVA</span>}
            {tileTypes.has(CORRIDOR_TILE) && <span><i className="legend-corridor" /> CORREDOR</span>}
            {tileTypes.has(DOOR_TILE) && <span><i className="legend-door" /> PORTA</span>}
            {tileTypes.has(SECRET_DOOR_TILE) && <span><i className="legend-secret-door" /> PORTA SECRETA</span>}
            {tileTypes.has(STAIRS_UP_TILE) && <span><i className="legend-stairs-up" /> ESCADA ↑</span>}
            {tileTypes.has(STAIRS_DOWN_TILE) && <span><i className="legend-stairs-down" /> ESCADA ↓</span>}
            {tileTypes.has(EXTERIOR_ENTRANCE_TILE) && <span><i className="legend-exterior-entrance" /> ENTRADA EXTERIOR</span>}
            {tileTypes.has(EXTERIOR_CONNECTION_TILE) && <span><i className="legend-exterior-connection" /> CONEXÃO EXTERIOR</span>}
            <span><i className="legend-wall" /> PAREDE</span>
            <span className="seed-label">SEED <strong>{seed}</strong></span>
          </div>
          {usedRoomCategories.length > 0 && (
            <details className="room-type-legend">
              <summary>
                <span>TIPOS DE SALA</span>
                <small>{usedRoomCategories.length} categorias</small>
              </summary>
              <div>
                {usedRoomCategories.map((category) => {
                  const style = ROOM_TYPE_CATEGORIES[category];
                  return (
                    <span key={category}>
                      <i style={{ backgroundColor: style.color }} />
                      {style.label}
                    </span>
                  );
                })}
              </div>
            </details>
          )}
          <div className="stats-row">
            <div className="stat-card">
              <span>ÁREA EXPLORÁVEL</span>
              <strong>{floorPercentage}<small>%</small></strong>
              <div className="stat-meter"><i style={{ width: `${floorPercentage}%` }} /></div>
            </div>
            <div className="stat-card">
              <span>TILES ABERTOS</span>
              <strong>{dungeon.floorCount.toLocaleString("pt-BR")}<small> / {dungeon.width * dungeon.height}</small></strong>
              <p>{floorDescription}</p>
            </div>
            <div className="stat-card">
              <span>SALAS GERADAS</span>
              <strong>{dungeon.rooms.toString().padStart(2, "0")}</strong>
              <p>{conceptProfile.generationDescription}</p>
            </div>
          </div>
          <details className="room-metadata-section" open>
            <summary>
              <span>METADADOS DAS SALAS</span>
              <small>{dungeon.roomDetails.length} salas · categorias por sala</small>
            </summary>
            <p className="room-metadata-note">
              Encontros, ocupação, recompensas e atributos narrativos são sugestões; armadilhas seguem as taxas do gerador.
            </p>
            <div className="room-metadata-list">
              {dungeon.roomDetails.map((room) => {
                const roomType = room.roomType.title;
                const metadata = createRoomMetadataFields(room, roomType, seed, dungeon, room.roomType.description);
                const shapeDefinition = ROOM_SHAPE_DEFINITIONS.find((shape) => shape.key === room.shape);
                return (
                  <RoomMetadataCard
                    key={room.number}
                    roomNumber={room.number}
                    roomType={roomType}
                    shape={shapeDefinition?.label ?? roomShapeLabels[room.shape]}
                    width={room.width}
                    height={room.height}
                    metadata={metadata}
                  />
                );
              })}
            </div>
          </details>
        </section>
        <aside className="room-panel" aria-label="Guia das salas">
          <div className="room-panel-tools">
            <DungeonExportControl dungeon={dungeon} />
          </div>
          <section className="room-index">
            <header className="room-index-heading">
              <div>
                <span className="room-index-kicker">GUIA DE SALAS</span>
                <strong>Salas e armadilhas</strong>
                <span className="room-index-summary">
                  {dungeon.roomDetails.length} salas · {roomTrapCount + generatedTraps.length} armadilhas · {roomTreasureCount} tesouros
                </span>
              </div>
              <span className="room-total" aria-label={`${dungeon.roomDetails.length} salas`}>
                {dungeon.roomDetails.length.toString().padStart(2, "0")}
              </span>
            </header>
            <div className="room-list" ref={guideListRef}>
              {dungeon.roomDetails.length === 0 && (
                <div className="room-empty">
                  <span className="empty-room-icon" aria-hidden="true">⌁</span>
                  <strong>Sem salas individuais</strong>
                  <p>Este conceito não gera salas numeradas; armadilhas de cavernas e trilhas aparecem abaixo.</p>
                </div>
              )}
              {dungeon.roomDetails.map((room) => {
                const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
                const isSelected = selectedRoomNumber === room.number;
                const trapLabel = room.traps.length === 1
                  ? "Armadilha"
                  : `${room.traps.length}x Armadilhas`;
                const treasureLabel = room.treasures.length === 1
                  ? "Tesouro"
                  : `${room.treasures.length}x Tesouros`;
                return (
                  <button
                    className={`room-entry room-entry-button${isSelected ? " selected" : ""}`}
                    type="button"
                    key={room.number}
                    data-room-number={room.number}
                    aria-pressed={isSelected}
                    aria-label={`Abrir detalhes da sala ${room.number}: ${room.roomType.title}${room.traps.length > 0 ? `, com ${room.traps.length} ${room.traps.length === 1 ? "armadilha" : "armadilhas"}` : ""}${room.treasures.length > 0 ? `, com ${room.treasures.length} ${room.treasures.length === 1 ? "tesouro" : "tesouros"}` : ""}${room.liquidType === "water" ? ", com água" : room.liquidType === "lava" ? ", com lava" : ""}`}
                    onClick={() => openRoomDetails(room.number)}
                  >
                    <span
                      className="room-badge"
                      style={{
                        borderColor: category.color,
                        backgroundColor: `${category.color}22`,
                        color: category.color,
                      }}
                    >
                      {room.number.toString().padStart(2, "0")}
                    </span>
                    <span className="room-copy">
                      <span className="room-copy-heading">
                        <strong>{room.roomType.title}</strong>
                        {room.liquidType && (
                          <span
                            className={`room-guide-feature-badge ${room.liquidType === "lava" ? "lava-room-badge" : "water-room-badge"}`}
                            aria-hidden="true"
                            title={room.liquidType === "water" ? "Água" : "Lava"}
                          >
                            {room.liquidType === "water" ? "Água" : "Lava"}
                          </span>
                        )}
                        {room.treasures.length > 0 && (
                          <span
                            className="room-guide-feature-badge treasure-room-badge"
                            aria-hidden="true"
                            title={room.treasures.length > 1 ? `${room.treasures.length} tesouros` : "Tesouro"}
                          >
                            {treasureLabel}
                          </span>
                        )}
                        {room.traps.length > 0 && (
                          <span
                            className="room-guide-feature-badge trap-room-badge"
                            aria-hidden="true"
                            title={room.traps.length > 1 ? `${room.traps.length} armadilhas` : "Armadilha"}
                          >
                            {trapLabel}
                          </span>
                        )}
                      </span>
                      <small style={{ color: category.color }}>
                        {category.shortLabel} · {room.width} × {room.height} tiles
                      </small>
                    </span>
                  </button>
                );
              })}
              {generatedTraps.length > 0 && (
                <section className="trap-guide-list" aria-label="Armadilhas em corredores e cavernas">
                  <h3 className="trap-guide-section-title">Armadilhas em circulação</h3>
                  {generatedTraps.map((trap) => {
                    const definition = TRAP_DEFINITIONS[trap.type];
                    const location = dungeon.tiles[trap.y]?.[trap.x] === CAVE_TILE
                      ? "Caverna"
                      : hasBspRooms
                        ? trap.corridorRoomNumbers.length === 2
                          ? `Corredor ${[...trap.corridorRoomNumbers].sort((a, b) => a - b).map((number) => number.toString().padStart(2, "0")).join(" ↔ ")}`
                          : "Corredor"
                        : algorithm === "cellular" ? "Caverna" : "Trilha";
                    return (
                      <article className="room-entry trap-guide-entry" key={`${trap.x}-${trap.y}`}>
                        <span
                          className={`room-badge trap-guide-badge ${trap.corridorNumber ? "numbered-corridor-trap-badge" : ""}`}
                          aria-hidden="true"
                          title={trap.corridorNumber ? `Armadilha ${trap.corridorNumber.toString().padStart(2, "0")}` : undefined}
                        >
                          {trap.corridorNumber?.toString().padStart(2, "0") ?? "!"}
                        </span>
                        <span className="room-copy">
                          <span className="room-copy-heading">
                            <strong>{definition.label}</strong>
                            <small className="trap-feature-tag">{TRAP_CATEGORY_LABELS[definition.category]}</small>
                            <small className="trap-feature-tag">{location} · {trap.x}, {trap.y}</small>
                          </span>
                          <small className="trap-feature-description">{definition.description}</small>
                        </span>
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          </section>
        </aside>
      </div>
      <dialog
        className="room-detail-dialog"
        ref={roomDetailDialogRef}
        aria-labelledby="room-detail-title"
        onClose={() => {
          setRoomDetailNumber(null);
          if (preserveRoomFocusOnCloseRef.current) {
            preserveRoomFocusOnCloseRef.current = false;
          } else {
            setFocusRequest((current) => current
              ? { ...current, shouldFocus: false }
              : null);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) roomDetailDialogRef.current?.close();
        }}
      >
        {roomDetail && roomDetailCategory && roomDetailSize && (
          <div className="room-detail-shell">
            <header className="room-detail-header">
              <span
                className="room-detail-number"
                style={{
                  backgroundColor: roomDetailCategory.color,
                  borderColor: roomDetailCategory.color,
                  color: "#10141b",
                }}
              >
                {roomDetail.number.toString().padStart(2, "0")}
              </span>
              <div className="room-detail-title-copy">
                <span className="room-detail-category" style={{ color: roomDetailCategory.color }}>
                  {roomDetailCategory.label}
                </span>
                <h2 id="room-detail-title">{roomDetail.roomType.title}</h2>
                <p>{roomDetail.roomType.description}</p>
              </div>
              <button
                className="room-detail-close"
                type="button"
                aria-label="Fechar detalhes da sala"
                onClick={() => roomDetailDialogRef.current?.close()}
              >
                ×
              </button>
            </header>
            <div className="room-detail-scroll">
              <section className="room-detail-overview" aria-label="Resumo da sala">
                <div className="room-detail-facts">
                  <div>
                    <span>FORMATO</span>
                    <strong>{roomDetailShape?.label ?? roomShapeLabels[roomDetail.shape]}</strong>
                  </div>
                  <div>
                    <span>DIMENSÕES</span>
                    <strong>{roomDetail.width} × {roomDetail.height} m · {roomDetail.width * roomDetail.height} m²</strong>
                  </div>
                  <div>
                    <span>PORTE</span>
                    <strong>{roomDetailSize.label}</strong>
                    <small>{roomDetailSize.dimensions} · uso: {roomDetailSize.usage}</small>
                  </div>
                  <div>
                    <span>POSIÇÃO NA GRADE</span>
                    <strong>{roomDetail.x}, {roomDetail.y}</strong>
                  </div>
                </div>
                {roomDetail.number === 1 && (
                  <p className="room-detail-entrance">
                    {parameters.entranceMode === "upper-stairs"
                      ? "Acesso pela escadaria superior da masmorra."
                      : parameters.entranceMode === "exterior-entrance"
                        ? "Entrada vinda do exterior da masmorra."
                        : "Conexão entre esta sala e o exterior da masmorra."}
                  </p>
                )}
                {roomDetailShape && (
                  <div className="room-detail-shape">
                    <span className="room-detail-shape-heading">CARACTERÍSTICAS DO FORMATO</span>
                    <p>{roomDetailShape.characteristics}</p>
                    <div className="room-detail-shape-applications">
                      <span>APLICAÇÕES</span>
                      <p>{roomDetailShape.applications}</p>
                    </div>
                  </div>
                )}
                {roomDetail.liquidType && roomDetail.liquidFeature && (
                  <div className={`room-detail-feature ${roomDetail.liquidType}-feature-tag`}>
                    <strong>
                      {liquidFeatureLabels[roomDetail.liquidType][roomDetail.liquidFeature]}
                      {" · "}
                      {roomDetail.liquidType === "water" ? "Água" : "Lava"}
                    </strong>
                    <small>Elemento ambiental incluído nesta sala.</small>
                  </div>
                )}
                {roomDetail.traps.length > 0 && (
                  <section className="room-detail-feature trap-detail-feature" aria-label="Armadilhas da sala">
                    <h3 className="room-detail-feature-heading">
                      {roomDetail.traps.length === 1 ? "Armadilha" : `Armadilhas · ${roomDetail.traps.length}`}
                    </h3>
                    <div className="room-detail-feature-list">
                      {roomDetail.traps.map((trap, index) => {
                        const definition = TRAP_DEFINITIONS[trap];
                        return (
                          <div className="room-detail-feature-item" key={`${trap}-${index}`}>
                            <div className="room-detail-feature-content">
                              <strong className="room-detail-feature-name">{definition.label}</strong>
                              <dl className="room-detail-feature-facts">
                                <div>
                                  <dt>Categoria</dt>
                                  <dd>{TRAP_CATEGORY_LABELS[definition.category]}</dd>
                                </div>
                              </dl>
                              <div className="room-detail-feature-description">
                                <strong>Funcionamento</strong>
                                <p>{definition.description}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
                {roomDetail.treasures.length > 0 && (
                  <section className="room-detail-feature treasure-detail-feature" aria-label="Tesouros da sala">
                    <h3 className="room-detail-feature-heading">
                      {roomDetail.treasures.length === 1 ? "Tesouro" : `Tesouros · ${roomDetail.treasures.length}`}
                    </h3>
                    <div className="room-detail-feature-list">
                      {roomDetail.treasures.map((treasure, index) => {
                        const definition = getTreasureDefinition(treasure.type);
                        return (
                          <div className="room-detail-feature-item" key={`${treasure.type}-${index}`}>
                            <div className="room-detail-feature-content">
                              <strong className="room-detail-feature-name">{definition?.label ?? "Tesouro"}</strong>
                              <dl className="room-detail-feature-facts">
                                <div>
                                  <dt>Categoria</dt>
                                  <dd>{TREASURE_CATEGORY_LABELS[treasure.category]}</dd>
                                </div>
                                {treasure.rarity && (
                                  <div>
                                    <dt>Raridade</dt>
                                    <dd>{TREASURE_RARITY_LABELS[treasure.rarity]}</dd>
                                  </div>
                                )}
                              </dl>
                              {definition?.description && (
                                <div className="room-detail-feature-description">
                                  <strong>Descrição</strong>
                                  <p>{definition.description}</p>
                                </div>
                              )}
                              {definition && (
                                <div className="room-detail-feature-description">
                                  <strong>Locais comuns</strong>
                                  <p>{definition.locations}</p>
                                </div>
                              )}
                              {treasure.details.length > 0 && (
                                <div className="room-detail-feature-description">
                                  <strong>Detalhes adicionais</strong>
                                  <ul>
                                    {treasure.details.map((detail) => <li key={detail}>{detail}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </section>
              <section className="room-detail-metadata" aria-label="Informações complementares">
                <div className="room-detail-section-heading">
                  <h3>Contexto e detalhes</h3>
                  <small>Informações narrativas são sugestões para desenvolver a masmorra.</small>
                </div>
                <nav className="room-metadata-nav" aria-label="Categorias de detalhes da sala">
                  {roomMetadataSections.map((section) => (
                    <button
                      id={`room-detail-toggle-${section.key}`}
                      className={roomDetailSection === section.key ? "active" : ""}
                      type="button"
                      aria-expanded={roomDetailSection === section.key}
                      aria-controls="room-detail-panel"
                      key={section.key}
                      onClick={() => setRoomDetailSection((current) => current === section.key ? null : section.key)}
                    >
                      {section.label}
                      <small>{section.properties.length}</small>
                    </button>
                  ))}
                </nav>
                <div
                  className="room-detail-metadata-panel"
                  id="room-detail-panel"
                  aria-labelledby={roomDetailSection ? `room-detail-toggle-${roomDetailSection}` : undefined}
                  hidden={!roomDetailSection}
                >
                  <div className="room-detail-metadata-list">
                    {roomDetailMetadata
                      .filter((field: RoomMetadataField) => roomDetailMetadataProperties?.includes(field.property))
                      .map((field) => (
                        <div className="room-detail-metadata-item" key={field.property}>
                          <div className="room-detail-metadata-label">
                            <code>{field.property}</code>
                            <small>{field.purpose}</small>
                          </div>
                          <p>{field.value}</p>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </div>
            <footer className="room-detail-footer">
              <button
                className="room-detail-button room-detail-dismiss"
                type="button"
                onClick={() => roomDetailDialogRef.current?.close()}
              >
                Fechar
              </button>
              <button
                className="room-detail-button room-detail-focus"
                type="button"
                onClick={() => {
                  preserveRoomFocusOnCloseRef.current = true;
                  setFocusRequest((current) => ({
                    type: "room",
                    roomNumber: roomDetail.number,
                    requestId: (current?.requestId ?? 0) + 1,
                    shouldFocus: true,
                  }));
                  roomDetailDialogRef.current?.close();
                }}
              >
                Localizar no mapa
              </button>
            </footer>
          </div>
        )}
      </dialog>
      <button
        className="reroll-button reroll-floating"
        onClick={rerollDungeon}
        aria-label="Rerollar masmorra"
        title="Rerollar masmorra"
        data-tooltip="Rerollar masmorra"
      >
        <span className="reroll-icon" aria-hidden="true">⟳</span>
      </button>
    </main>
  );
}