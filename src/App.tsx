import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import DungeonCanvas from "./rendering/DungeonCanvas";
import { DungeonExportControl } from "./ui/components/DungeonExportControl";
import type { MapFocusRequest } from "./rendering/DungeonCanvas";
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
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DUNGEON_GENERATOR_VERSION_V2,
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_ROOM_COUNT,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
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
  type CustomDungeonProfile,
  type DungeonConcept,
  type DungeonProfileSelection,
} from "./dungeonProfiles";
import type { DungeonGenerationPipelineRequest } from "./generationPipeline";
import {
  resolveDungeonProfile,
  validateCustomDungeonProfile,
} from "./customDungeonProfile";
import {
  MAX_DUNGEON_LEVEL_COUNT,
  type DungeonLevelGenerationConfig,
} from "./dungeonStructureGeneration";
import type { VerticalConnectionKind } from "./dungeonStructure";
import type { DungeonGenerationWorkRequest } from "./generationWorkerProtocol";
import { useDungeonGeneration } from "./useDungeonGeneration";
import { useDungeonParameters } from "./ui/hooks/useDungeonParameters";
import { ParameterPanel } from "./ui/components/ParameterPanel";
import { RangeControl } from "./ui/components/RangeControl";
import { RoomsPanel } from "./ui/components/RoomsPanel";
import { TypesPanel } from "./ui/components/TypesPanel";
import { TrapsPanel } from "./ui/components/TrapsPanel";
import { TreasuresPanel } from "./ui/components/TreasuresPanel";
import { AccessPanel } from "./ui/components/AccessPanel";
import {
  createGenerationBenchmarkGalleryHtml,
  runGenerationBenchmarkGalleryScenarios,
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
import { RoomGuidePanel } from "./ui/components/RoomGuidePanel";
import { DungeonLevelNavigator } from "./ui/components/DungeonLevelNavigator";
import { getRoomConnectionIndex } from "./roomConnections";

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
type DungeonLevelOverride = Partial<Pick<
  DungeonLevelGenerationConfig,
  "width" | "height" | "roomCount" | "topologyStyle" | "spatialLayoutStyle" | "isSecret" | "isOptional"
>>;

const DungeonThreeCanvas = lazy(() => import("./rendering/DungeonThreeCanvas"));

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
const COMPACT_VIEWPORT_QUERY = "(max-width: 1100px)";
function matchesCompactViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
}
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
const verticalConnectionOptions: Array<{ id: VerticalConnectionKind; label: string }> = [
  { id: "stairs", label: "Escadas" },
  { id: "spiral-stairs", label: "Escadas em espiral" },
  { id: "elevator", label: "Elevadores" },
  { id: "trapdoor", label: "Alçapões" },
  { id: "secret-passage", label: "Passagens secretas" },
  { id: "vertical-shaft", label: "Poços verticais" },
  { id: "drop", label: "Quedas" },
  { id: "ramp", label: "Rampas" },
  { id: "portal", label: "Portais" },
  { id: "other", label: "Outros" },
];
const DEFAULT_CUSTOM_PROFILE_JSON = `{
  "id": "custom-fortress",
  "name": "Fortaleza personalizada",
  "baseProfile": "military-fortress",
  "topology": {
    "style": "sectorized",
    "parameters": {
      "branchCount": 3,
      "cycleCount": 1
    }
  },
  "v2Preferences": {
    "spatialLayoutWeights": {
      "clusters": 100
    },
    "roomSizeBias": "compact",
    "defaultDensity": 72,
    "corridorWidthBias": 1
  }
}`;

export default function App() {
  const {
    parameters,
    setParameters,
    seed,
    setSeed,
    seedDraft,
    setSeedDraft,
    seedDraftError,
    setSeedDraftError,
    widthDraft,
    setWidthDraft,
    heightDraft,
    setHeightDraft,
    dimensionDraftError,
    setDimensionDraftError,
    updateDimensionDraft,
    updateSeedDraft,
    commitSeedDraft,
    commitDimension,
  } = useDungeonParameters();
  const [concept, setConcept] = useState<DungeonProfileSelection>("military-fortress");
  const [customProfileJson, setCustomProfileJson] = useState(DEFAULT_CUSTOM_PROFILE_JSON);
  const [generatorVersion, setGeneratorVersion] = useState<typeof DUNGEON_GENERATOR_VERSION_V1 | typeof DUNGEON_GENERATOR_VERSION_V2>(DUNGEON_GENERATOR_VERSION_V1);
  const [canvasView, setCanvasView] = useState<CanvasView>("2d");
  const [topologyStyleSelection, setTopologyStyleSelection] = useState<TopologyStyle | "profile">("profile");
  const [spatialStyleSelection, setSpatialStyleSelection] = useState<SpatialLayoutStyle | "profile">("profile");
  const [cycleCountOverride, setCycleCountOverride] = useState<number | null>(null);
  const [spatialDensityOverride, setSpatialDensityOverride] = useState<number | null>(null);
  const [varyCorridorWidths, setVaryCorridorWidths] = useState(true);
  const [multilevelEnabled, setMultilevelEnabled] = useState(false);
  const [levelCount, setLevelCount] = useState(2);
  const [levelsAboveReference, setLevelsAboveReference] = useState(0);
  const [levelOverrides, setLevelOverrides] = useState<Record<number, DungeonLevelOverride>>({});
  const [verticalConnectionCountOverride, setVerticalConnectionCountOverride] = useState<number | null>(null);
  const [allowedVerticalConnectionKinds, setAllowedVerticalConnectionKinds] = useState<VerticalConnectionKind[]>(["stairs"]);
  const [requireGlobalConnectivity, setRequireGlobalConnectivity] = useState(true);
  const [allowVerticalCycles, setAllowVerticalCycles] = useState(false);
  const [selectedLevelId, setSelectedLevelId] = useState<string | undefined>();
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null);
  const [roomDetailNumber, setRoomDetailNumber] = useState<number | null>(null);
  const [hoveredGuideRoomNumber, setHoveredGuideRoomNumber] = useState<number | undefined>();
  const [roomDetailSection, setRoomDetailSection] = useState<RoomMetadataSection | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("generation");
  const [compactViewport, setCompactViewport] = useState(matchesCompactViewport);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(() => !matchesCompactViewport());
  const [roomPanelOpen, setRoomPanelOpen] = useState(() => !matchesCompactViewport());
  const [roomPositionEdit, setRoomPositionEdit] = useState<RoomPositionEdit | null>(null);
  const roomDetailDialogRef = useRef<HTMLDialogElement | null>(null);
  const preserveRoomFocusOnCloseRef = useRef(false);
  const [showWater, setShowWater] = useState(true);
  const [showLava, setShowLava] = useState(true);
  const [cavesEnabled, setCavesEnabled] = useState(false);
  const [benchmarkGalleryError, setBenchmarkGalleryError] = useState<string | null>(null);
  const [benchmarkGalleryStatus, setBenchmarkGalleryStatus] = useState<string | null>(null);
  const [configurationActionStatus, setConfigurationActionStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const resetConfirmationDialogRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const updateCompactViewport = (event: MediaQueryListEvent) => {
      setCompactViewport(event.matches);
      setSettingsPanelOpen(!event.matches);
      setRoomPanelOpen(!event.matches);
    };
    mediaQuery.addEventListener("change", updateCompactViewport);
    return () => mediaQuery.removeEventListener("change", updateCompactViewport);
  }, []);
  useEffect(() => {
    if (!compactViewport || (!settingsPanelOpen && !roomPanelOpen)) return;
    const closeDrawers = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || roomDetailDialogRef.current?.open) return;
      setSettingsPanelOpen(false);
      setRoomPanelOpen(false);
    };
    window.addEventListener("keydown", closeDrawers);
    return () => window.removeEventListener("keydown", closeDrawers);
  }, [compactViewport, roomPanelOpen, settingsPanelOpen]);
  useEffect(() => {
    if (!compactViewport || (!settingsPanelOpen && !roomPanelOpen)) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [compactViewport, roomPanelOpen, settingsPanelOpen]);
  const customProfileValidation = useMemo(() => {
    try {
      const input: unknown = JSON.parse(customProfileJson);
      return validateCustomDungeonProfile(input);
    } catch (error) {
      return {
        valid: false,
        errors: [`JSON inválido: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }, [customProfileJson]);
  const activeCustomProfile: CustomDungeonProfile | undefined = concept === "custom"
    ? customProfileValidation.profile
    : undefined;
  const selectedBaseProfile: DungeonConcept = concept === "custom"
    ? activeCustomProfile?.baseProfile ?? "military-fortress"
    : concept;
  const conceptProfile = concept === "custom" && activeCustomProfile
    ? resolveDungeonProfile("custom", activeCustomProfile).profile
    : DUNGEON_CONCEPTS[selectedBaseProfile];
  const cavesRequired = concept === "natural-cavern"
    || (concept === "custom" && (
      activeCustomProfile?.mode === "natural-cavern"
      || (!activeCustomProfile?.mode && activeCustomProfile?.baseProfile === "natural-cavern")
    ));
  const profileCavesEnabled = Boolean(activeCustomProfile?.cavesEnabled);
  const multilevelUnavailableReason = cavesRequired
    ? "O perfil selecionado exige cavernas e não pode ser combinado com vários níveis."
    : profileCavesEnabled
      ? "O perfil personalizado exige cavernas; desative esse recurso para usar vários níveis."
      : cavesEnabled
        ? "Desative as cavernas para habilitar a geração multinível."
        : undefined;
  const multilevelUnavailable = Boolean(multilevelUnavailableReason);
  const defaultCycleCount = conceptProfile.topology.parameters.cycleCount ?? 0;
  const spatialDensity = spatialDensityOverride ?? conceptProfile.v2Preferences.defaultDensity;
  const singleGenerationRequest = useMemo<DungeonGenerationPipelineRequest>(() => ({
    generatorVersion,
    profile: concept,
    ...(activeCustomProfile ? { customProfile: activeCustomProfile } : {}),
    seed,
    parameters,
    cavesEnabled: cavesEnabled || cavesRequired || profileCavesEnabled,
    topologyStyle: topologyStyleSelection === "profile" ? undefined : topologyStyleSelection,
    spatialLayoutStyle: spatialStyleSelection === "profile" ? undefined : spatialStyleSelection,
    cycleCount: cycleCountOverride ?? undefined,
    spatialDensity,
    varyCorridorWidths,
  }), [activeCustomProfile, cavesEnabled, cavesRequired, concept, cycleCountOverride, generatorVersion, parameters, seed, spatialDensity, spatialStyleSelection, topologyStyleSelection, varyCorridorWidths]);
  const effectiveLevelCount = Math.max(2, Math.min(MAX_DUNGEON_LEVEL_COUNT, levelCount));
  const effectiveLevelsAboveReference = Math.min(levelsAboveReference, effectiveLevelCount - 1);
  const levelsBelowReference = effectiveLevelCount - 1 - effectiveLevelsAboveReference;
  const profileSpatialStyle = spatialStyleOptions.reduce((best, option) => (
    conceptProfile.v2Preferences.spatialLayoutWeights[option.id]
      > conceptProfile.v2Preferences.spatialLayoutWeights[best.id]
      ? option
      : best
  ), spatialStyleOptions[0]!).id;
  const levelConfigs = useMemo<DungeonLevelGenerationConfig[]>(() => (
    Array.from({ length: effectiveLevelCount }, (_, index) => {
      const verticalIndex = index - levelsBelowReference;
      const override = levelOverrides[index] ?? {};
      return {
        name: verticalIndex === 0
          ? "Nível principal"
          : verticalIndex < 0
            ? `Subsolo ${Math.abs(verticalIndex)}`
            : `Piso superior ${verticalIndex}`,
        verticalIndex,
        width: override.width ?? parameters.width,
        height: override.height ?? parameters.height,
        roomCount: override.roomCount ?? (
          multilevelEnabled ? Math.min(parameters.roomCount, 6) : parameters.roomCount
        ),
        topologyStyle: override.topologyStyle
          ?? (topologyStyleSelection === "profile" ? conceptProfile.topology.style : topologyStyleSelection),
        spatialLayoutStyle: override.spatialLayoutStyle
          ?? (spatialStyleSelection === "profile" ? profileSpatialStyle : spatialStyleSelection),
        ...(override.isSecret ? { isSecret: true } : {}),
        ...(override.isOptional ? { isOptional: true } : {}),
      };
    })
  ), [
    conceptProfile.topology.style,
    effectiveLevelCount,
    levelOverrides,
    levelsBelowReference,
    multilevelEnabled,
    parameters.height,
    parameters.roomCount,
    parameters.width,
    profileSpatialStyle,
    spatialStyleSelection,
    topologyStyleSelection,
  ]);
  const maximumVerticalConnectionCount = allowVerticalCycles
    ? (effectiveLevelCount - 1) * 2
    : effectiveLevelCount - 1;
  const verticalConnectionCount = Math.min(
    verticalConnectionCountOverride ?? effectiveLevelCount - 1,
    maximumVerticalConnectionCount,
  );
  const generationRequest = useMemo<DungeonGenerationWorkRequest>(() => (
    multilevelEnabled
      ? {
        kind: "multilevel",
        request: {
          seed,
          profile: concept,
          ...(activeCustomProfile ? { customProfile: activeCustomProfile } : {}),
          parameters: { ...parameters, entranceMode: "upper-stairs" },
          levels: levelConfigs,
          entryLevelIndex: levelsBelowReference,
          verticalConnectionCount,
          allowedVerticalConnectionKinds,
          requireGlobalConnectivity,
          allowVerticalCycles,
          cycleCount: cycleCountOverride ?? defaultCycleCount,
          spatialDensity,
          varyCorridorWidths,
        },
      }
      : { kind: "single", request: singleGenerationRequest }
  ), [
    allowVerticalCycles,
    allowedVerticalConnectionKinds,
    activeCustomProfile,
    concept,
    cycleCountOverride,
    defaultCycleCount,
    levelConfigs,
    levelsBelowReference,
    multilevelEnabled,
    parameters,
    requireGlobalConnectivity,
    seed,
    singleGenerationRequest,
    spatialDensity,
    varyCorridorWidths,
    verticalConnectionCount,
  ]);
  const {
    generationRun: primaryGenerationRun,
    structureRun,
    status: generationStatus,
    isWorker: isWorkerGeneration,
    hasGenerationResult,
    progress: generationProgress,
    error: generationError,
    metrics: generationMetrics,
    cancel: cancelGeneration,
  } = useDungeonGeneration(generationRequest);
  const selectedLevel = structureRun?.structure.levels.find((level) => level.id === selectedLevelId)
    ?? structureRun?.structure.levels.find((level) => level.id === structureRun.structure.connectivity.entryLevelId)
    ?? structureRun?.structure.levels[0];
  const generationRun = structureRun?.levels.find((level) => level.levelId === selectedLevel?.id)?.generation
    ?? primaryGenerationRun;
  const generatedDungeon = generationRun.dungeon;
  const requestedLevelConfig = generationRequest.kind === "multilevel"
    ? generationRequest.request.levels[generationRequest.request.entryLevelIndex]
    : undefined;
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
  const generationStateLabel = generationStatus === "running"
    ? "GERANDO"
    : generationStatus === "ready"
      ? "PRONTA"
      : generationStatus === "error"
        ? "FALHA"
        : generationStatus === "cancelled"
          ? "CANCELADA"
          : "AGUARDANDO";
  useEffect(() => {
    setRoomDetailNumber(null);
    setFocusRequest(null);
    setRoomDetailSection(null);
  }, [generatedDungeon]);
  useEffect(() => { const dialog = roomDetailDialogRef.current; if (!dialog) return; if (roomDetail && !dialog.open) dialog.showModal(); else if (!roomDetail && dialog.open) dialog.close(); }, [roomDetail]);
  useEffect(() => {
    const dialog = resetConfirmationDialogRef.current;
    if (!dialog) return;
    if (resetConfirmationOpen && !dialog.open) dialog.showModal();
    else if (!resetConfirmationOpen && dialog.open) dialog.close();
  }, [resetConfirmationOpen]);
  const moveRoom = useCallback((roomNumber: number, x: number, y: number) => {
    setRoomPositionEdit((current) => {
      const activeEdit = current?.baseDungeon === generatedDungeon ? current : null;
      const positions = { ...activeEdit?.positions, [roomNumber]: { x, y } };
      const movedDungeon = repositionDungeonRooms(generatedDungeon, positions);
      return movedDungeon
        ? { baseDungeon: generatedDungeon, positions, dungeon: movedDungeon }
        : current;
    });
  }, [generatedDungeon]);
  const openRoomDetails = useCallback((roomNumber: number) => {
    setRoomDetailSection(null);
    setRoomDetailNumber(roomNumber);
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: true,
    }));
  }, []);
  const selectRoomForInspector = useCallback((roomNumber: number) => {
    setRoomDetailNumber(null);
    setRoomDetailSection(null);
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: false,
    }));
    if (compactViewport) setRoomPanelOpen(true);
  }, [compactViewport]);
  const selectLevel = useCallback((levelId: string) => {
    if (levelId === selectedLevel?.id) return;
    setSelectedLevelId(levelId);
    setRoomDetailNumber(null);
    setRoomDetailSection(null);
    setFocusRequest(null);
  }, [selectedLevel?.id]);
  const focusRoomOnMap = useCallback((roomNumber: number) => {
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: true,
    }));
    if (compactViewport) setRoomPanelOpen(false);
  }, [compactViewport]);
  const selectMovedRoom = useCallback((roomNumber: number) => {
    setFocusRequest((current) => ({
      type: "room",
      roomNumber,
      requestId: (current?.requestId ?? 0) + 1,
      shouldFocus: false,
    }));
  }, []);
  const downloadBenchmarkGallery = () => { setBenchmarkGalleryError(null); let objectUrl: string | undefined; try { const scenarios = runGenerationBenchmarkGalleryScenarios(); const html = createGenerationBenchmarkGalleryHtml(scenarios.runs, scenarios.structures); objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); const link = document.createElement("a"); link.href = objectUrl; link.download = "generation-audit-gallery.html"; document.body.appendChild(link); link.click(); link.remove(); setBenchmarkGalleryStatus("Galeria de auditoria V1 × V2, cavernas e dungeons multinível gerada para download."); } catch (error) { setBenchmarkGalleryError(error instanceof Error ? error.message : "Não foi possível gerar a galeria de auditoria."); } finally { if (objectUrl) { const url = objectUrl; window.setTimeout(() => URL.revokeObjectURL(url), 1_000); } } };
  const updateTrapCategoryFrequency = (key: TrapCategory, value: number) => { setParameters((current) => ({ ...current, trapCategoryWeights: redistributeFrequencies(current.trapCategoryWeights, TRAP_CATEGORY_ORDER, key, value) })); };
  const updateTreasureCategoryFrequency = (key: TreasureCategory, value: number) => { setParameters((current) => ({ ...current, treasureCategoryWeights: redistributeFrequencies(current.treasureCategoryWeights, TREASURE_CATEGORY_ORDER, key, value) })); };
  const updateRoomTypeFrequency = (key: RoomTypeCategory, value: number) => { setParameters((current) => ({ ...current, roomTypeCategoryFrequencies: redistributeFrequencies(current.roomTypeCategoryFrequencies, ROOM_TYPE_CATEGORY_ORDER, key, value) })); };
  const selectedRoomNumber = roomDetailNumber ?? focusRequest?.roomNumber;
  const connectionsByRoom = useMemo(
    () => getRoomConnectionIndex(dungeon),
    [dungeon],
  );
  const entryRoomNumber = generationRun.metadata.generatorVersion === DUNGEON_GENERATOR_VERSION_V1
    && dungeon.roomDetails.length > 0
    ? 1
    : undefined;
  const clearRoomSelection = useCallback(() => {
    setRoomDetailNumber(null);
    setFocusRequest(null);
  }, []);
  const toggleWaterVisibility = useCallback(() => {
    setShowWater((visible) => !visible);
  }, []);
  const toggleLavaVisibility = useCallback(() => {
    setShowLava((visible) => !visible);
  }, []);
  const returnTo2D = useCallback(() => {
    setCanvasView("2d");
  }, []);
  const randomizeSeed = () => {
    setRoomDetailNumber(null);
    setRoomDetailSection(null);
    setFocusRequest(null);
    const nextSeed = createSeed(seed);
    setSeed(nextSeed);
    setSeedDraft(String(nextSeed));
    setSeedDraftError(undefined);
  };
  const rerollDungeon = () => {
    randomizeSeed();
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const restoreDefaultConfiguration = () => {
    setParameters(DEFAULT_DUNGEON_PARAMETERS);
    setWidthDraft(String(DEFAULT_DUNGEON_PARAMETERS.width));
    setHeightDraft(String(DEFAULT_DUNGEON_PARAMETERS.height));
    setDimensionDraftError(undefined);
    const nextSeed = createSeed(seed);
    setSeed(nextSeed);
    setSeedDraft(String(nextSeed));
    setSeedDraftError(undefined);
    setConcept("military-fortress");
    setCustomProfileJson(DEFAULT_CUSTOM_PROFILE_JSON);
    setGeneratorVersion(DUNGEON_GENERATOR_VERSION_V1);
    setTopologyStyleSelection("profile");
    setSpatialStyleSelection("profile");
    setCycleCountOverride(null);
    setSpatialDensityOverride(null);
    setVaryCorridorWidths(true);
    setMultilevelEnabled(false);
    setLevelCount(2);
    setLevelsAboveReference(0);
    setLevelOverrides({});
    setVerticalConnectionCountOverride(null);
    setAllowedVerticalConnectionKinds(["stairs"]);
    setRequireGlobalConnectivity(true);
    setAllowVerticalCycles(false);
    setCavesEnabled(false);
    setSelectedLevelId(undefined);
    setRoomDetailNumber(null);
    setRoomDetailSection(null);
    setFocusRequest(null);
    setRoomPositionEdit(null);
    setSettingsSection("generation");
    setBenchmarkGalleryError(null);
    setBenchmarkGalleryStatus(null);
    setConfigurationActionStatus(null);
    setResetConfirmationOpen(false);
  };
  const saveConfiguration = () => {
    let objectUrl: string | undefined;
    const filename = `dungeon-foundry-${seed}.json`;
    try {
      const configuration = {
        format: "dungeon-foundry-configuration",
        version: 1,
        savedAt: new Date().toISOString(),
        profile: concept,
        customProfileJson: concept === "custom" ? customProfileJson : undefined,
        generatorVersion,
        seed,
        parameters,
        advanced: {
          cavesEnabled,
          topologyStyle: topologyStyleSelection,
          spatialLayoutStyle: spatialStyleSelection,
          cycleCountOverride,
          spatialDensityOverride,
          varyCorridorWidths,
        },
        multilevel: multilevelEnabled
          ? {
            levelCount: effectiveLevelCount,
            levelsAboveReference: effectiveLevelsAboveReference,
            levelOverrides,
            verticalConnectionCountOverride,
            allowedVerticalConnectionKinds,
            requireGlobalConnectivity,
            allowVerticalCycles,
          }
          : null,
      };
      const blob = new Blob([JSON.stringify(configuration, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setConfigurationActionStatus({
        type: "success",
        message: `Configuração salva em ${filename}.`,
      });
    } catch (error) {
      console.error("Não foi possível salvar a configuração da masmorra.", error);
      setConfigurationActionStatus({
        type: "error",
        message: "Não foi possível salvar a configuração.",
      });
    } finally {
      if (objectUrl) {
        const url = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    }
  };
  const updateLevelOverride = <K extends keyof DungeonLevelOverride>(
    index: number,
    key: K,
    value: DungeonLevelOverride[K],
  ) => {
    setLevelOverrides((current) => ({
      ...current,
      [index]: {
        ...current[index],
        [key]: value,
      },
    }));
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-identity">
          <div className="topbar-brand-group">
            <a className="brand" href="#" aria-label="Dungeon Foundry início">
              <span className="brand-mark" aria-hidden="true">DF</span>
              <span>DUNGEON <strong>FOUNDRY</strong></span>
            </a>
            <span className="prototype-label"><span /> ESTAÇÃO DE CARTOGRAFIA</span>
          </div>
          <div className="topbar-current-dungeon">
            <span className="topbar-current-label">DUNGEON ATUAL</span>
            <strong>{conceptProfile.name}</strong>
          </div>
          <div className={`topbar-generation topbar-generation-${generationStatus}`} role="status" aria-live="polite">
            <span className="topbar-generation-dot" aria-hidden="true" />
            <span>{generationStateLabel}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className={`topbar-panel-button${settingsPanelOpen ? " active" : ""}`}
            type="button"
            aria-label={settingsPanelOpen ? "Fechar configurações" : "Abrir configurações"}
            aria-expanded={settingsPanelOpen}
            aria-controls="settings-panel"
            onClick={() => {
              const nextOpen = !settingsPanelOpen;
              setSettingsPanelOpen(nextOpen);
              if (compactViewport && nextOpen) setRoomPanelOpen(false);
            }}
          >
            <span className="topbar-panel-icon" aria-hidden="true">⚙</span>
            <span className="topbar-panel-label">Configurações</span>
          </button>
          <button
            className={`topbar-panel-button${roomPanelOpen ? " active" : ""}`}
            type="button"
            aria-label={roomPanelOpen ? "Fechar guia de salas" : "Abrir guia de salas"}
            aria-expanded={roomPanelOpen}
            aria-controls="rooms-panel"
            onClick={() => {
              const nextOpen = !roomPanelOpen;
              setRoomPanelOpen(nextOpen);
              if (compactViewport && nextOpen) setSettingsPanelOpen(false);
            }}
          >
            <span className="topbar-panel-icon" aria-hidden="true">▤</span>
            <span className="topbar-panel-label">Salas</span>
          </button>
        </div>
      </header>
      <div className={`workspace${settingsPanelOpen ? "" : " settings-collapsed"}${roomPanelOpen ? "" : " rooms-collapsed"}`}>
        {compactViewport && (settingsPanelOpen || roomPanelOpen) && (
          <button
            className="drawer-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Fechar painel aberto"
            onClick={() => {
              setSettingsPanelOpen(false);
              setRoomPanelOpen(false);
            }}
          />
        )}
        <aside
          id="settings-panel"
          className={`sidebar${settingsPanelOpen ? " panel-open" : ""}`}
          aria-label="Configurações da masmorra"
        >
          <div className="drawer-panel-heading">
            <span>CONFIGURAÇÕES</span>
            <button type="button" aria-label="Fechar configurações" onClick={() => setSettingsPanelOpen(false)}>×</button>
          </div>
          <div className="eyebrow">LABORATÓRIO DE MAPAS</div>
          <h1>Forje uma<br />nova masmorra.</h1>
          <p className="intro">Escolha um conceito, decida se haverá cavernas e explore as salas no mapa.</p>
          <nav className="settings-nav" aria-label="Seções de configuração" aria-controls="settings-content">
            {settingsSections.map((section) => (
              <button className={`settings-nav-button${settingsSection === section.id ? " active" : ""}`} key={section.id} type="button" aria-current={settingsSection === section.id ? "page" : undefined} onClick={() => setSettingsSection(section.id)}>{section.label}</button>
            ))}
          </nav>
          <div className="settings-panel" id="settings-content">
            {settingsSection === "generation" && (
              <>
                <div className="settings-tier-label">
                  <strong>Configuração básica</strong>
                  <span>Perfil, dimensões, seed e estrutura principal.</span>
                </div>
                <div className="section-heading settings-section-heading"><span>VERSÃO DO GERADOR</span></div>
                <label className="entrance-control" htmlFor="generator-version"><span>PIPELINE</span>
                  <select id="generator-version" value={generatorVersion} disabled={multilevelEnabled} onChange={(event) => setGeneratorVersion(event.currentTarget.value === DUNGEON_GENERATOR_VERSION_V2 ? DUNGEON_GENERATOR_VERSION_V2 : DUNGEON_GENERATOR_VERSION_V1)}>
                    <option value={DUNGEON_GENERATOR_VERSION_V1} disabled={multilevelEnabled}>V1 · compatível</option>
                    <option value={DUNGEON_GENERATOR_VERSION_V2}>V2 · GenerationPlan</option>
                  </select>
                  <small>{multilevelEnabled ? "Dungeons multinível sempre usam o pipeline V2 em cada andar." : generatorVersion === DUNGEON_GENERATOR_VERSION_V1 ? "Geração legada, mantida como padrão." : "Topologia, layout espacial e roteamento de corredores."}</small>
                </label>
                <div className="multilevel-control">
                  <button
                    className="multilevel-toggle-button"
                    type="button"
                    aria-pressed={multilevelEnabled}
                    disabled={multilevelUnavailable}
                    onClick={() => {
                      const enabled = !multilevelEnabled;
                      if (enabled) setGeneratorVersion(DUNGEON_GENERATOR_VERSION_V2);
                      setMultilevelEnabled(enabled);
                    }}
                  >
                    <span>Gerar vários níveis</span>
                    <strong>{multilevelEnabled ? "Ativado" : "Ativar"}</strong>
                  </button>
                  {multilevelUnavailableReason
                    ? <p className="generation-notice generation-notice-warning multilevel-unavailable" role="note">{multilevelUnavailableReason}</p>
                    : <small>Cada nível é gerado separadamente pelo pipeline V2.</small>}
                </div>
                <label className="entrance-control" htmlFor="dungeon-concept"><span>PERFIL</span>
                  <select id="dungeon-concept" value={concept} onChange={(event) => {
                    if (event.currentTarget.value === "custom") {
                      setConcept("custom");
                      return;
                    }
                    const selectedConcept = DUNGEON_CONCEPT_ORDER.find((id) => id === event.currentTarget.value);
                    if (selectedConcept) {
                      setConcept(selectedConcept);
                      if (selectedConcept === "natural-cavern") setMultilevelEnabled(false);
                    }
                  }}>
                    {DUNGEON_CONCEPT_ORDER.map((conceptId) => (
                      <option key={conceptId} value={conceptId}>{DUNGEON_CONCEPTS[conceptId].name}</option>
                    ))}
                    <option value="custom">Personalizado (JSON)</option>
                  </select>
                  <small>{conceptProfile.description}</small>
                </label>
                {concept === "custom" && (
                  <details className="generation-experimental custom-profile-editor" open={!customProfileValidation.valid}>
                    <summary>
                      Perfil personalizado · JSON
                      {!customProfileValidation.valid && <span className="settings-validation-badge">Revisar</span>}
                    </summary>
                    <label className="entrance-control" htmlFor="custom-profile-json">
                      <span>Editar conteúdo do perfil</span>
                      <textarea
                        id="custom-profile-json"
                        value={customProfileJson}
                        rows={15}
                        spellCheck={false}
                        onChange={(event) => setCustomProfileJson(event.currentTarget.value)}
                      />
                      <small>
                        Dimensões, salas e corredores continuam configurados nos parâmetros da dungeon e de cada nível.
                        Campos desconhecidos ou valores incompatíveis impedem a geração.
                      </small>
                    </label>
                    {!customProfileValidation.valid && (
                      <ul className="custom-profile-errors" role="alert">
                        {customProfileValidation.errors.map((error) => <li key={error}>{error}</li>)}
                      </ul>
                    )}
                  </details>
                )}
                <ParameterPanel
                  widthDraft={widthDraft}
                  heightDraft={heightDraft}
                  seedDraft={seedDraft}
                  dimensionDraftError={dimensionDraftError}
                  seedDraftError={seedDraftError}
                  updateDimensionDraft={updateDimensionDraft}
                  commitDimension={commitDimension}
                  updateSeedDraft={updateSeedDraft}
                  commitSeedDraft={commitSeedDraft}
                  randomizeSeed={randomizeSeed}
                />
                {multilevelEnabled && (
                  <details className="generation-advanced multilevel-config">
                    <summary>Configurações multinível</summary>
                    <p className="multilevel-intro">Defina a posição dos andares, seus ajustes individuais e como se conectam.</p>
                    <section className="multilevel-group">
                      <h3>Estrutura vertical</h3>
                      <p>Escolha a quantidade de andares e a posição do nível principal.</p>
                      <RangeControl
                        id="multilevel-count"
                        label="Quantidade de níveis"
                        value={effectiveLevelCount}
                        min={2}
                        max={MAX_DUNGEON_LEVEL_COUNT}
                        step={1}
                        formatValue={(value) => `${value} níveis`}
                        description={`Entre 2 e ${MAX_DUNGEON_LEVEL_COUNT} níveis.`}
                        editable
                        onChange={setLevelCount}
                      />
                      <RangeControl
                        id="levels-above-reference"
                        label="Níveis acima do principal"
                        value={effectiveLevelsAboveReference}
                        min={0}
                        max={effectiveLevelCount - 1}
                        step={1}
                        formatValue={(value) => `${value} acima`}
                        description={`${levelsBelowReference} abaixo · nível principal · ${effectiveLevelsAboveReference} acima.`}
                        editable
                        onChange={setLevelsAboveReference}
                      />
                    </section>
                    <section className="multilevel-group">
                      <h3>Conectividade</h3>
                      <p>Defina a rede vertical; a conectividade global requer ao menos uma ligação entre cada nível.</p>
                      <RangeControl
                        id="vertical-connection-count"
                        label="Conexões verticais"
                        value={verticalConnectionCount}
                        min={requireGlobalConnectivity ? effectiveLevelCount - 1 : 0}
                        max={maximumVerticalConnectionCount}
                        step={1}
                        formatValue={(value) => `${value} conexões`}
                        description={`Limites: ${requireGlobalConnectivity ? effectiveLevelCount - 1 : 0} a ${maximumVerticalConnectionCount}.`}
                        editable
                        onChange={setVerticalConnectionCountOverride}
                      />
                      <label className="parameter-control multilevel-option" htmlFor="require-global-connectivity">
                        <span className="parameter-label"><span>Conectar todos os níveis</span></span>
                        <input
                          id="require-global-connectivity"
                          type="checkbox"
                          checked={requireGlobalConnectivity}
                          onChange={(event) => {
                            setRequireGlobalConnectivity(event.currentTarget.checked);
                            if (event.currentTarget.checked) setVerticalConnectionCountOverride(null);
                          }}
                        />
                        <small>Garante um caminho entre todos os andares.</small>
                      </label>
                      <label className="parameter-control multilevel-option" htmlFor="allow-vertical-cycles">
                        <span className="parameter-label"><span>Permitir ciclos entre níveis</span></span>
                        <input
                          id="allow-vertical-cycles"
                          type="checkbox"
                          checked={allowVerticalCycles}
                          onChange={(event) => setAllowVerticalCycles(event.currentTarget.checked)}
                        />
                        <small>Permite conexões extras além da árvore principal.</small>
                      </label>
                    </section>
                    <fieldset className="vertical-connection-types">
                      <legend>Tipos de conexão permitidos</legend>
                      <p>Selecione ao menos um tipo quando houver conexões entre níveis.</p>
                        {verticalConnectionOptions.map(({ id, label }) => (
                          <label key={id}>
                            <input
                              type="checkbox"
                              checked={allowedVerticalConnectionKinds.includes(id)}
                              disabled={verticalConnectionCount > 0
                                && allowedVerticalConnectionKinds.length === 1
                                && allowedVerticalConnectionKinds.includes(id)}
                              onChange={(event) => {
                                const isChecked = event.currentTarget.checked;
                                setAllowedVerticalConnectionKinds((current) => (
                                  isChecked
                                    ? [...current, id]
                                    : current.filter((kind) => kind !== id)
                                ));
                              }}
                            />
                            {label}
                          </label>
                        ))}
                    </fieldset>
                    <section className="multilevel-group">
                      <h3>Distribuição dos níveis</h3>
                      <p>Expanda um andar para ajustar dimensões, salas, topologia e posição opcional.</p>
                      <div className="multilevel-level-list">
                        {levelConfigs.map((level, index) => (
                          <details className="multilevel-level-config" key={`${level.verticalIndex}-${index}`}>
                            <summary>{level.name} · {level.width} × {level.height} · {level.roomCount} salas</summary>
                            <label className="entrance-control" htmlFor={`level-width-${index}`}>
                              <span>Largura</span>
                              <input
                                id={`level-width-${index}`}
                                type="number"
                                min={MIN_DUNGEON_DIMENSION}
                                max={MAX_DUNGEON_WIDTH}
                                step={1}
                                value={level.width}
                                onChange={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  if (
                                    Number.isSafeInteger(value)
                                    && value >= MIN_DUNGEON_DIMENSION
                                    && value <= MAX_DUNGEON_WIDTH
                                  ) {
                                    updateLevelOverride(index, "width", value);
                                  }
                                }}
                              />
                            </label>
                            <label className="entrance-control" htmlFor={`level-height-${index}`}>
                              <span>Altura</span>
                              <input
                                id={`level-height-${index}`}
                                type="number"
                                min={MIN_DUNGEON_DIMENSION}
                                max={MAX_DUNGEON_HEIGHT}
                                step={1}
                                value={level.height}
                                onChange={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  if (
                                    Number.isSafeInteger(value)
                                    && value >= MIN_DUNGEON_DIMENSION
                                    && value <= MAX_DUNGEON_HEIGHT
                                  ) {
                                    updateLevelOverride(index, "height", value);
                                  }
                                }}
                              />
                            </label>
                            <label className="entrance-control" htmlFor={`level-rooms-${index}`}>
                              <span>Salas</span>
                              <input
                                id={`level-rooms-${index}`}
                                type="number"
                                min={2}
                                max={MAX_DUNGEON_ROOM_COUNT}
                                step={1}
                                value={level.roomCount}
                                onChange={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  if (
                                    Number.isSafeInteger(value)
                                    && value >= 2
                                    && value <= MAX_DUNGEON_ROOM_COUNT
                                  ) {
                                    updateLevelOverride(index, "roomCount", value);
                                  }
                                }}
                              />
                            </label>
                            <label className="parameter-control" htmlFor={`level-secret-${index}`}>
                              <span className="parameter-label"><span>Nível secreto</span></span>
                              <input
                                id={`level-secret-${index}`}
                                type="checkbox"
                                checked={Boolean(level.isSecret)}
                                onChange={(event) => updateLevelOverride(index, "isSecret", event.currentTarget.checked)}
                              />
                            </label>
                            <label className="parameter-control" htmlFor={`level-optional-${index}`}>
                              <span className="parameter-label"><span>Nível opcional</span></span>
                              <input
                                id={`level-optional-${index}`}
                                type="checkbox"
                                checked={Boolean(level.isOptional)}
                                onChange={(event) => updateLevelOverride(index, "isOptional", event.currentTarget.checked)}
                              />
                            </label>
                            <label className="entrance-control" htmlFor={`level-topology-${index}`}>
                              <span>Topologia</span>
                              <select
                                id={`level-topology-${index}`}
                                value={level.topologyStyle}
                                onChange={(event) => {
                                  const style = topologyStyleOptions.find(({ id }) => id === event.currentTarget.value)?.id;
                                  if (style) updateLevelOverride(index, "topologyStyle", style);
                                }}
                              >
                                {topologyStyleOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="entrance-control" htmlFor={`level-layout-${index}`}>
                              <span>Distribuição</span>
                              <select
                                id={`level-layout-${index}`}
                                value={level.spatialLayoutStyle}
                                onChange={(event) => {
                                  const style = spatialStyleOptions.find(({ id }) => id === event.currentTarget.value)?.id;
                                  if (style) updateLevelOverride(index, "spatialLayoutStyle", style);
                                }}
                              >
                                {spatialStyleOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                          </details>
                        ))}
                      </div>
                    </section>
                  </details>
                )}
                <details className="generation-advanced">
                  <summary>Configurações avançadas da V2</summary>
                  <p className="settings-detail-intro">Ajuste topologia, ocupação espacial e recursos de cavernas; valores mais complexos exigem uma nova geração.</p>
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
                  <div className="range-control-with-action">
                    <RangeControl
                      id="cycle-count"
                      label="Circuitos adicionais"
                      value={cycleCountOverride ?? defaultCycleCount}
                      min={0}
                      max={Math.max(1, parameters.roomCount, defaultCycleCount, cycleCountOverride ?? 0)}
                      step={1}
                      formatValue={(value) => `${value} ciclos`}
                      description="Conexões extras que criam rotas alternativas."
                      editable
                      onChange={setCycleCountOverride}
                    />
                    <button
                      className="configuration-button configuration-button-secondary"
                      type="button"
                      onClick={() => setCycleCountOverride(null)}
                    >
                      Usar padrão do perfil
                    </button>
                  </div>
                  <RangeControl
                    id="spatial-density"
                    label="Densidade espacial"
                    value={spatialDensity}
                    min={0}
                    max={100}
                    step={1}
                    formatValue={(value) => `${value}%`}
                    description="Controla o espaço livre entre as salas."
                    editable
                    onChange={setSpatialDensityOverride}
                  />
                  <label className="parameter-control" htmlFor="vary-corridor-widths">
                    <span className="parameter-label"><span>Variar largura dos corredores</span></span>
                    <input id="vary-corridor-widths" type="checkbox" checked={varyCorridorWidths} onChange={(event) => setVaryCorridorWidths(event.currentTarget.checked)} />
                  </label>
                  <label className="parameter-control" htmlFor="caves-enabled">
                    <span className="parameter-label"><span>Incluir cavernas</span></span>
                    <input id="caves-enabled" type="checkbox" checked={cavesEnabled} disabled={cavesRequired || multilevelEnabled} onChange={(event) => setCavesEnabled(event.currentTarget.checked)} />
                    <small>Na V2, cavernas orgânicas são conectadas às estruturas construídas.</small>
                  </label>
                  {(cavesRequired || cavesEnabled) && (
                    <>
                      <RangeControl
                        id="cavern-density"
                        label="Densidade navegável"
                        value={parameters.cellularFillPercent}
                        min={35}
                        max={65}
                        step={1}
                        formatValue={(value) => `${value}%`}
                        description="Percentual aproximado de células navegáveis."
                        editable
                        onChange={(cellularFillPercent) => setParameters((current) => ({ ...current, cellularFillPercent }))}
                      />
                      <RangeControl
                        id="cavern-irregularity"
                        label="Irregularidade"
                        value={parameters.cellularIterations}
                        min={2}
                        max={8}
                        step={1}
                        formatValue={(value) => `${value} iterações`}
                        description="Mais iterações produzem contornos mais fragmentados."
                        editable
                        onChange={(cellularIterations) => setParameters((current) => ({ ...current, cellularIterations }))}
                      />
                    </>
                  )}
                </details>
                <details className="generation-experimental">
                  <summary>Ferramentas experimentais</summary>
                  <p className="settings-detail-intro">Recursos de comparação e validação, separados das opções usadas na geração comum.</p>
                  <div className="benchmark-gallery-action">
                    <button className="benchmark-gallery-button" type="button" onClick={downloadBenchmarkGallery}>Baixar galeria de auditoria</button>
                    <small>Compara V1/V2, perfis, escalas, topologias, cavernas e dungeons multinível.</small>
                    {benchmarkGalleryError && <p className="benchmark-notice" role="alert">{benchmarkGalleryError}</p>}
                    {benchmarkGalleryStatus && <p className="benchmark-notice" role="status">{benchmarkGalleryStatus}</p>}
                  </div>
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
          <div className="configuration-actions">
            <div className="configuration-action-buttons">
              <button
                className="configuration-button configuration-button-secondary"
                type="button"
                onClick={saveConfiguration}
              >
                Salvar configuração
              </button>
              <button
                className="configuration-button configuration-button-danger"
                type="button"
                onClick={() => setResetConfirmationOpen(true)}
              >
                Restaurar padrões
              </button>
            </div>
            {configurationActionStatus && (
              <p
                className={`configuration-action-status configuration-action-status-${configurationActionStatus.type}`}
                role={configurationActionStatus.type === "error" ? "alert" : "status"}
              >
                {configurationActionStatus.message}
              </p>
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
              <button
                className="reroll-button"
                type="button"
                onClick={rerollDungeon}
                aria-label="Gerar nova masmorra"
                title="Gerar nova masmorra"
              >
                <span className="reroll-icon" aria-hidden="true">⟳</span>
                <span>Gerar nova</span>
              </button>
              <span className="map-coordinate">
                {hasGenerationResult ? dungeon.width : requestedLevelConfig?.width ?? parameters.width}
                {" × "}
                {hasGenerationResult ? dungeon.height : requestedLevelConfig?.height ?? parameters.height}
                <span>GRID · 1 TILE = 1 M</span>
              </span>
            </div>
          </div>
          {structureRun && selectedLevel && (
            <DungeonLevelNavigator
              structureRun={structureRun}
              selectedLevelId={selectedLevel.id}
              connectionKindOptions={verticalConnectionOptions}
              onSelectLevel={selectLevel}
            />
          )}
          {structureRun && structureRun.connectivity.disconnectedLevelIds.length > 0 && (
            <div className="generation-notice generation-notice-warning" role="status">
              <strong>Conectividade incompleta</strong>
              <span>
                Níveis sem caminho a partir do nível inicial:{" "}
                {structureRun.connectivity.disconnectedLevelIds.map((id) => (
                  structureRun.structure.levels.find((level) => level.id === id)?.name ?? id
                )).join(", ")}.
              </span>
            </div>
          )}
          {generationStatus === "running" && (
            <div className="generation-notice generation-notice-info generation-worker-status" role="status" aria-live="polite">
              <span className="generation-notice-icon" aria-hidden="true">◌</span>
              <span className="generation-notice-copy">
                <strong>Geração em andamento</strong>
                <span>{generationProgress ?? "Preparando a masmorra..."}</span>
              </span>
              {isWorkerGeneration && <button type="button" onClick={cancelGeneration}>Cancelar</button>}
            </div>
          )}
          {generationError && !(concept === "custom" && !customProfileValidation.valid) && (
            <div className="generation-notice generation-notice-error" role="alert">
              <strong>Falha na geração</strong>
              <span>{generationError}</span>
            </div>
          )}
          {generationStatus === "cancelled" && (
            <div className="generation-notice generation-notice-warning" role="status">
              <strong>Geração cancelada</strong>
              <span>O mapa anterior foi mantido.</span>
            </div>
          )}
          {generationStatus === "ready" && hasGenerationResult && (
            <div className="generation-notice generation-notice-success" role="status">
              <span className="generation-notice-icon" aria-hidden="true">✓</span>
              <span className="generation-notice-copy">
                <strong>Geração concluída</strong>
                <span>
                  {generationMetrics.roomCount} salas
                  {generationMetrics.levelCount > 1 ? ` em ${generationMetrics.levelCount} níveis` : ""}
                  {" geradas em "}{generationMetrics.generationMs.toFixed(1)} ms.
                </span>
              </span>
            </div>
          )}
          {generationStatus === "ready" && generationRun.fallbackReason && (
            <div className="generation-notice generation-notice-warning generation-fallback-notice" role="status">
              <strong>Fallback de pipeline aplicado</strong>
              <span>{generationRun.fallbackReason}</span>
            </div>
          )}
          <div
            className="map-frame"
            data-generator-version={generationRun.metadata.generatorVersion}
            data-generation-profile={generationRun.metadata.profile}
            data-generation-seed={seed}
            data-generation-ready={hasGenerationResult}
          >
            <div className="corner-mark corner-top-left" />
            <div className="corner-mark corner-top-right" />
            <div className="corner-mark corner-bottom-left" />
            <div className="corner-mark corner-bottom-right" />
            {canvasView === "3d" ? (
              <CanvasViewErrorBoundary onBackTo2D={returnTo2D}>
                <Suspense fallback={<div className="canvas-loading">Carregando Three.js...</div>}>
                  <DungeonThreeCanvas
                    dungeon={dungeon}
                    generationKey={generatedDungeon}
                    focusRequest={focusRequest}
                    selectedRoomNumber={selectedRoomNumber}
                    onRoomSelect={selectRoomForInspector}
                    onClearSelection={clearRoomSelection}
                    showWater={showWater}
                    showLava={showLava}
                    onToggleWater={toggleWaterVisibility}
                    onToggleLava={toggleLavaVisibility}
                    onBackTo2D={returnTo2D}
                  />
                </Suspense>
              </CanvasViewErrorBoundary>
            ) : (
              <DungeonCanvas
                dungeon={dungeon}
                generationKey={generatedDungeon}
                focusRequest={focusRequest}
                selectedRoomNumber={selectedRoomNumber}
                hoveredRoomNumber={hoveredGuideRoomNumber}
                onRoomMove={moveRoom}
                onRoomSelect={selectRoomForInspector}
                onRoomMoveEnd={selectMovedRoom}
                onClearSelection={clearRoomSelection}
                showWater={showWater}
                showLava={showLava}
                onToggleWater={toggleWaterVisibility}
                onToggleLava={toggleLavaVisibility}
              />
            )}
            <div className="map-overlay-label">{selectedLevel?.name ?? "NÍVEL 01"} <span>/</span> PROCEDURAL</div>
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
              <strong>{hasGenerationResult ? <>{floorPercentage}<small>%</small></> : "..."}</strong>
              <div className="stat-meter"><i style={{ width: `${hasGenerationResult ? floorPercentage : 0}%` }} /></div>
            </div>
            <div className="stat-card">
              <span>TILES ABERTOS</span>
              <strong>{hasGenerationResult ? <>{dungeon.floorCount.toLocaleString("pt-BR")}<small> / {dungeon.width * dungeon.height}</small></> : "..."}</strong>
              <p>{hasGenerationResult ? floorDescription : "Aguardando resultado da geração."}</p>
            </div>
            <div className="stat-card">
              <span>SALAS GERADAS</span>
              <strong>{hasGenerationResult ? dungeon.rooms.toString().padStart(2, "0") : "..."}</strong>
              <p>{hasGenerationResult ? conceptProfile.generationDescription : "Aguardando resultado da geração."}</p>
            </div>
          </div>
          <details className="room-metadata-section">
            <summary>
              <span>METADADOS DAS SALAS</span>
              <small>{hasGenerationResult ? `${dungeon.roomDetails.length} salas · categorias por sala` : "Aguardando geração..."}</small>
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
        <aside
          id="rooms-panel"
          className={`room-panel${roomPanelOpen ? " panel-open" : ""}`}
          aria-label="Guia das salas"
        >
          <div className="drawer-panel-heading">
            <span>GUIA DE SALAS</span>
            <button type="button" aria-label="Fechar guia de salas" onClick={() => setRoomPanelOpen(false)}>×</button>
          </div>
          <div className="room-panel-tools">
            {hasGenerationResult && <DungeonExportControl dungeon={dungeon} />}
          </div>
          <RoomGuidePanel
            dungeon={dungeon}
            hasGenerationResult={hasGenerationResult}
            generationSummary={hasGenerationResult
              ? `${dungeon.roomDetails.length} salas · ${roomTrapCount + generatedTraps.length} armadilhas · ${roomTreasureCount} tesouros`
              : "Aguardando resultado da geração"}
            emptyTitle={generationStatus === "cancelled"
              ? "Geração cancelada"
              : generationStatus === "error"
                ? "Geração indisponível"
                : "Salas em preparação"}
            emptyMessage={generationStatus === "error"
              ? "Nenhum resultado foi gerado."
              : "As salas aparecerão aqui quando a geração terminar."}
            selectedRoomNumber={selectedRoomNumber}
            selectionRequestId={focusRequest?.requestId}
            connectionsByRoom={connectionsByRoom}
            entryRoomNumber={entryRoomNumber}
            onSelectRoom={selectRoomForInspector}
            onHoverRoom={setHoveredGuideRoomNumber}
            onLocateRoom={focusRoomOnMap}
            onOpenFullDetails={openRoomDetails}
          >
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
          </RoomGuidePanel>
        </aside>
      </div>
      <dialog
        className="settings-confirmation-dialog"
        ref={resetConfirmationDialogRef}
        aria-labelledby="reset-confirmation-title"
        aria-describedby="reset-confirmation-description"
        onCancel={(event) => {
          event.preventDefault();
          setResetConfirmationOpen(false);
        }}
        onClose={() => setResetConfirmationOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            resetConfirmationDialogRef.current?.close();
          }
        }}
      >
        <span className="confirmation-kicker">AÇÃO DESTRUTIVA</span>
        <h2 id="reset-confirmation-title">Restaurar configurações padrão?</h2>
        <p id="reset-confirmation-description">
          Perfil, dimensões, seed e opções de geração serão substituídos. Uma nova seed será criada e a masmorra será gerada novamente.
        </p>
        <div className="confirmation-actions">
          <button
            className="configuration-button configuration-button-secondary"
            type="button"
            autoFocus
            onClick={() => setResetConfirmationOpen(false)}
          >
            Cancelar
          </button>
          <button
            className="configuration-button configuration-button-danger"
            type="button"
            onClick={restoreDefaultConfiguration}
          >
            Restaurar padrões
          </button>
        </div>
      </dialog>
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
    </main>
  );
}