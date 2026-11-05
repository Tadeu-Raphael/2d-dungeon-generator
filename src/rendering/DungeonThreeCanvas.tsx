import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_WATERFALL_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  getNumberedCorridorTraps,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
  WALL_TILE,
} from "../dungeon";
import type { Dungeon, DoorVariant, Tile, TrapCategory, TrapType } from "../dungeon";
import type { MapFocusRequest } from "./types";
import type { RoomTypeCategory } from "../roomTypes";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  DUNGEON_MAP_PALETTE,
  getRoomFloorColor,
  createRoomCategoryGrid,
  createRoomNumberGrid,
  getRoomConnectionTiles,
  getTileColor,
  getVisibleTile,
  TRAP_CATEGORY_COLORS,
} from "./dungeonTileSemantics";
import { disposeDungeonThreeGroup } from "./dungeonThreeResources";
import { getDoorwayGroups } from "./doorwayLayout";
import { createSmoothWallMeshes } from "./smoothWalls";
import type { VerticalConnection } from "../dungeonStructure";
import {
  MAX_LEVEL_SPACING,
  MIN_LEVEL_SPACING,
  addDoorVariantMeshes,
  buildLevelContextGroup,
  buildVerticalLinksGroup,
  computeLevelOffsets,
  getDefaultLevelSpacing,
  getLevelOpacity,
  getVerticalLinkGeometry,
} from "./multilevelThree";
import type {
  MultilevelViewMode,
  ThreeLevelDescriptor,
  UpperLevelMode,
} from "./multilevelThree";

interface DungeonThreeCanvasProps {
  dungeon: Dungeon;
  generationKey: Dungeon;
  focusRequest: MapFocusRequest | null;
  selectedRoomNumber?: number;
  onRoomSelect: (roomNumber: number) => void;
  onClearSelection: () => void;
  showWater: boolean;
  showLava: boolean;
  onToggleWater: () => void;
  onToggleLava: () => void;
  onBackTo2D: () => void;
  /** All levels of a multilevel dungeon; the selected level is rendered from `dungeon`. */
  levels?: readonly ThreeLevelDescriptor[];
  verticalConnections?: readonly VerticalConnection[];
  selectedLevelId?: string;
  onSelectLevel?: (levelId: string) => void;
}

const SHADOW_TILE_LIMIT = 20_000;

const MULTILEVEL_MODE_LABELS: Record<MultilevelViewMode, string> = {
  level: "Nível",
  stack: "Pilha",
  exploded: "Explodida",
};

const UPPER_LEVEL_LABELS: Record<UpperLevelMode, string> = {
  solid: "Sólidos",
  ghost: "Fantasma",
  hidden: "Ocultos",
};

interface FloorCoordinate {
  x: number;
  y: number;
}

interface InstancePlacement {
  x: number;
  y: number;
  z: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  color?: THREE.Color;
}

interface DungeonFootprint {
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
}

type CameraView = "top" | "isometric" | "custom";

// A lower camera shows stacked levels side by side instead of one floor hiding the next.
function getIsometricDirection(stacked: boolean): THREE.Vector3 {
  return new THREE.Vector3(0.62, stacked ? 0.42 : 0.76, 0.9).normalize();
}

const TRAP_TYPE_BY_TILE = new Map<Tile, TrapType>(
  TRAP_TYPES.map((type) => [TRAP_DEFINITIONS[type].tile, type]),
);

function getFloorColor(tile: Tile, category: RoomTypeCategory | undefined): THREE.Color {
  if (category && (tile === FLOOR_TILE || tile === ELEVATED_FLOOR_TILE)) {
    return new THREE.Color(getRoomFloorColor(category));
  }
  const [red, green, blue] = getTileColor(tile);
  return new THREE.Color().setRGB(
    red / 255,
    green / 255,
    blue / 255,
    THREE.SRGBColorSpace,
  );
}

function getTrapColor(category: TrapCategory): THREE.Color {
  const [red, green, blue] = TRAP_CATEGORY_COLORS[category];
  return new THREE.Color().setRGB(
    red / 255,
    green / 255,
    blue / 255,
    THREE.SRGBColorSpace,
  );
}

function getPassageRotation(dungeon: Dungeon, x: number, y: number): number {
  const left = dungeon.tiles[y]?.[x - 1];
  const right = dungeon.tiles[y]?.[x + 1];
  return [left, right].some((tile) => tile !== undefined && tile !== WALL_TILE)
    ? Math.PI / 2
    : 0;
}

function addInstancedMesh(
  group: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly InstancePlacement[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  placements.forEach((placement, index) => {
    position.set(placement.x, placement.y, placement.z);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotation ?? 0);
    scale.set(placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    if (placement.color) mesh.setColorAt(index, placement.color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

function getCameraFitDistance(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): number {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const widthDistance = width / (2 * Math.tan(horizontalFov / 2));
  const heightDistance = height / (2 * Math.tan(verticalFov / 2));
  return Math.max(12, widthDistance, heightDistance) * 1.22;
}

function getDungeonFootprint(dungeon: Dungeon): DungeonFootprint {
  let minX = dungeon.width;
  let minY = dungeon.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (dungeon.tiles[y]?.[x] === undefined || dungeon.tiles[y][x] === WALL_TILE) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      centerX: dungeon.width / 2,
      centerZ: dungeon.height / 2,
      width: dungeon.width,
      height: dungeon.height,
    };
  }

  return {
    centerX: (minX + maxX + 1) / 2,
    centerZ: (minY + maxY + 1) / 2,
    width: maxX - minX + 3,
    height: maxY - minY + 3,
  };
}

function createBadgeTexture(label: string, borderColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o rótulo do mapa 3D.");

  context.fillStyle = "rgba(16, 21, 29, 0.96)";
  context.fillRect(2, 2, 124, 60);
  context.strokeStyle = borderColor;
  context.lineWidth = 5;
  context.strokeRect(4, 4, 120, 56);
  context.fillStyle = "#f0e9dc";
  context.font = "700 34px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 64, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBadge(
  group: THREE.Group,
  label: string,
  borderColor: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): void {
  const texture = createBadgeTexture(label, borderColor);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 10;
  group.add(sprite);
}

function DungeonThreeCanvas({
  dungeon,
  generationKey,
  focusRequest,
  selectedRoomNumber,
  onRoomSelect,
  onClearSelection,
  showWater,
  showLava,
  onToggleWater,
  onToggleLava,
  onBackTo2D,
  levels,
  verticalConnections,
  selectedLevelId,
  onSelectLevel,
}: DungeonThreeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mapGroupRef = useRef<THREE.Group | null>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const floorCoordinatesRef = useRef<FloorCoordinate[]>([]);
  const waterMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const lavaMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const waterfallMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const lavafallMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const highlightRef = useRef<THREE.LineSegments | null>(null);
  const connectionHighlightRef = useRef<THREE.InstancedMesh | null>(null);
  const latestDungeonRef = useRef(dungeon);
  const callbacksRef = useRef({ onRoomSelect, onClearSelection, onSelectLevel });
  const requestRenderRef = useRef<(() => void) | null>(null);
  const contextGroupRef = useRef<THREE.Group | null>(null);
  const stackExtentRef = useRef({ centerY: 0, span: 0 });
  const selectedOffsetRef = useRef(0);
  const selectedVisibleRef = useRef(true);
  const isMultilevel = (levels?.length ?? 0) > 1;
  const [viewMode, setViewMode] = useState<MultilevelViewMode>("stack");
  const [levelSpacing, setLevelSpacing] = useState(getDefaultLevelSpacing("stack"));
  const [upperLevelMode, setUpperLevelMode] = useState<UpperLevelMode>("ghost");
  const [hiddenLevelIds, setHiddenLevelIds] = useState<ReadonlySet<string>>(() => new Set());
  const [emphasizeLinks, setEmphasizeLinks] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [cameraView, setCameraView] = useState<CameraView>("isometric");
  const cameraViewRef = useRef<CameraView>("isometric");
  const footprint = useMemo(() => getDungeonFootprint(dungeon), [dungeon]);
  const setActiveCameraView = useCallback((view: CameraView) => {
    cameraViewRef.current = view;
    setCameraView(view);
  }, []);

  latestDungeonRef.current = dungeon;
  callbacksRef.current = { onRoomSelect, onClearSelection, onSelectLevel };

  const fitCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const centerX = footprint.centerX;
    const centerZ = footprint.centerZ;
    const { centerY, span } = stackExtentRef.current;
    const distance = getCameraFitDistance(camera, footprint.width, footprint.height + span * 0.7);
    const offset = getIsometricDirection(span > 0).multiplyScalar(distance);
    camera.up.set(0, 1, 0);
    controls.target.set(centerX, centerY, centerZ);
    camera.position.copy(controls.target).add(offset);
    camera.far = Math.max(2000, distance * 10);
    camera.updateProjectionMatrix();
    controls.update();
    setActiveCameraView("isometric");
  }, [footprint, setActiveCameraView]);

  const setCameraPreset = useCallback((view: Exclude<CameraView, "custom">) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const { centerY, span } = stackExtentRef.current;
    const center = new THREE.Vector3(footprint.centerX, centerY, footprint.centerZ);
    const distance = getCameraFitDistance(camera, footprint.width, footprint.height + span * 0.7);
    controls.target.copy(center);
    if (view === "top") {
      camera.up.set(0, 0, -1);
      camera.position.set(center.x, center.y + distance, center.z + 0.001);
    } else {
      camera.up.set(0, 1, 0);
      const offset = getIsometricDirection(span > 0).multiplyScalar(distance);
      camera.position.copy(center).add(offset);
    }
    camera.updateProjectionMatrix();
    controls.update();
    setActiveCameraView(view);
    requestRenderRef.current?.();
  }, [footprint, setActiveCameraView]);

  const adjustCameraZoom = useCallback((factor: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    requestRenderRef.current?.();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (error) {
      console.error("Não foi possível inicializar a visualização Three.js.", error);
      setRenderError("WebGL não está disponível. Volte à visualização 2D.");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DUNGEON_MAP_PALETTE.background);
    scene.add(new THREE.HemisphereLight("#e2e8ee", "#26313a", 1.7));
    scene.add(new THREE.AmbientLight("#c6d3de", 0.55));

    const keyLight = new THREE.DirectionalLight("#f4e3c2", 2.1);
    const lightSpan = Math.max(dungeon.width, dungeon.height);
    keyLight.position.set(
      dungeon.width * 0.85,
      lightSpan * 1.1,
      dungeon.height * 0.25,
    );
    keyLight.target.position.set(dungeon.width / 2, 0, dungeon.height / 2);
    scene.add(keyLight.target);
    // Soft shadows give walls depth; very large maps skip them to keep rendering responsive.
    const shadowsEnabled = dungeon.width * dungeon.height <= SHADOW_TILE_LIMIT;
    if (shadowsEnabled) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      const shadowCamera = keyLight.shadow.camera;
      shadowCamera.left = -lightSpan * 0.8;
      shadowCamera.right = lightSpan * 0.8;
      shadowCamera.top = lightSpan * 0.8;
      shadowCamera.bottom = -lightSpan * 0.8;
      shadowCamera.near = 1;
      shadowCamera.far = lightSpan * 4;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.03;
    }
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = 1.48;
    controls.minDistance = Math.max(4, Math.min(dungeon.width, dungeon.height) * 0.15);
    controls.maxDistance = Math.max(dungeon.width, dungeon.height) * 6;
    controls.target.set(dungeon.width / 2, 0, dungeon.height / 2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "dungeon-three-canvas";
    renderer.domElement.setAttribute("aria-label", "Mapa 3D interativo");
    host.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    setRenderError(null);
    setIsReady(true);

    let animationFrame = 0;
    let updatingControls = false;
    let renderedWidth = 0;
    let renderedHeight = 0;
    let requestRender = () => {};
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      if (width === renderedWidth && height === renderedHeight) return;
      renderedWidth = width;
      renderedHeight = height;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const currentView = cameraViewRef.current;
      const { centerY, span } = stackExtentRef.current;
      const target = currentView === "custom"
        ? controls.target.clone()
        : new THREE.Vector3(footprint.centerX, centerY, footprint.centerZ);
      const direction = currentView === "top"
        ? new THREE.Vector3(0, 1, 0)
        : currentView === "isometric"
          ? getIsometricDirection(span > 0)
          : camera.position.clone().sub(controls.target).normalize();
      if (currentView === "top") camera.up.set(0, 0, -1);
      else if (currentView === "isometric") camera.up.set(0, 1, 0);
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(
        direction,
        getCameraFitDistance(camera, footprint.width, footprint.height + span * 0.7),
      );
      controls.update();
      requestRender();
    };

    resize();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(resize);
    observer?.observe(host);
    window.addEventListener("resize", resize);

    const renderFrame = () => {
      animationFrame = 0;
      updatingControls = true;
      const needsAnotherFrame = controls.update();
      updatingControls = false;
      renderer.render(scene, camera);
      if (needsAnotherFrame) requestRender();
    };
    requestRender = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    };
    const onControlsChange = () => {
      if (updatingControls) return;
      requestRender();
    };
    const onControlsStart = () => setActiveCameraView("custom");
    controls.addEventListener("change", onControlsChange);
    controls.addEventListener("start", onControlsStart);
    requestRenderRef.current = requestRender;
    requestRender();

    let pointerStart: { pointerId: number; x: number; y: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (
        !start
        || start.pointerId !== event.pointerId
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
      ) {
        return;
      }

      const floorMesh = floorMeshRef.current;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = floorMesh && selectedVisibleRef.current
        ? raycaster.intersectObject(floorMesh, false)[0]
        : undefined;
      const contextFloors: THREE.Object3D[] = [];
      contextGroupRef.current?.traverse((object) => {
        if (object.visible && object.name === "level-floor" && object.userData.pickable) {
          contextFloors.push(object);
        }
      });
      const contextHit = contextFloors.length > 0
        ? raycaster.intersectObjects(contextFloors, false)[0]
        : undefined;
      if (contextHit && (!hit || contextHit.distance < hit.distance)) {
        const levelId = contextHit.object.userData.levelId as string | undefined;
        if (levelId) callbacksRef.current.onSelectLevel?.(levelId);
        return;
      }
      if (!floorMesh) return;
      if (hit?.instanceId === undefined) {
        callbacksRef.current.onClearSelection();
        return;
      }
      const coordinate = floorCoordinatesRef.current[hit.instanceId];
      if (!coordinate) return;
      const room = latestDungeonRef.current.roomDetails.find((candidate) => (
        coordinate.x >= candidate.x
        && coordinate.x < candidate.x + candidate.width
        && coordinate.y >= candidate.y
        && coordinate.y < candidate.y + candidate.height
      ));
      if (room) callbacksRef.current.onRoomSelect(room.number);
      else callbacksRef.current.onClearSelection();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    fitCamera();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener("start", onControlsStart);
      controls.dispose();
      if (requestRenderRef.current === requestRender) requestRenderRef.current = null;
      if (mapGroupRef.current) {
        scene.remove(mapGroupRef.current);
        disposeDungeonThreeGroup(mapGroupRef.current);
      }
      if (contextGroupRef.current) {
        scene.remove(contextGroupRef.current);
        disposeDungeonThreeGroup(contextGroupRef.current);
        contextGroupRef.current = null;
      }
      cameraRef.current = null;
      controlsRef.current = null;
      mapGroupRef.current = null;
      floorMeshRef.current = null;
      floorCoordinatesRef.current = [];
      waterMeshRef.current = null;
      lavaMeshRef.current = null;
      waterfallMeshRef.current = null;
      lavafallMeshRef.current = null;
      highlightRef.current = null;
      connectionHighlightRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      setIsReady(false);
    };
  }, [dungeon.height, dungeon.width, fitCamera, footprint, setActiveCameraView]);

  const sortedLevels = useMemo(
    () => [...(levels ?? [])].sort((first, second) => first.verticalIndex - second.verticalIndex),
    [levels],
  );

  // Other levels and the vertical links between levels, placed relative to the active level.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !isReady) return;

    if (contextGroupRef.current) {
      scene.remove(contextGroupRef.current);
      disposeDungeonThreeGroup(contextGroupRef.current);
      contextGroupRef.current = null;
    }
    const mapGroup = mapGroupRef.current;
    const selected = sortedLevels.find((level) => level.id === selectedLevelId) ?? sortedLevels[0];
    if (!isMultilevel || !selected || viewMode === "level") {
      stackExtentRef.current = { centerY: 0, span: 0 };
      selectedOffsetRef.current = 0;
      selectedVisibleRef.current = true;
      if (mapGroup) {
        mapGroup.visible = true;
        mapGroup.position.y = 0;
        mapGroup.traverse((object) => {
          if (object.userData.isBase) object.visible = true;
        });
      }
      requestRenderRef.current?.();
      return;
    }

    const offsets = computeLevelOffsets(sortedLevels, levelSpacing);
    const selectedOffset = offsets.get(selected.id) ?? 0;
    selectedOffsetRef.current = selectedOffset;
    selectedVisibleRef.current = !hiddenLevelIds.has(selected.id);
    const visibleLevelIds = new Set<string>();
    const contextGroup = new THREE.Group();
    contextGroup.name = "multilevel-context";
    let lowestY = selectedOffset;
    let highestY = selectedOffset + 1;
    for (const level of sortedLevels) {
      const opacity = getLevelOpacity(level, selected, upperLevelMode);
      const isHidden = hiddenLevelIds.has(level.id) || opacity <= 0;
      if (!isHidden) {
        visibleLevelIds.add(level.id);
        const y = offsets.get(level.id) ?? 0;
        lowestY = Math.min(lowestY, y);
        highestY = Math.max(highestY, y + 1);
        if (level.id !== selected.id) {
          contextGroup.add(buildLevelContextGroup(level, y, opacity));
        }
      }
    }
    if (mapGroup) {
      mapGroup.visible = selectedVisibleRef.current;
      mapGroup.position.y = selectedOffset;
      mapGroup.traverse((object) => {
        if (object.userData.isBase) object.visible = false;
      });
    }

    const links = (verticalConnections ?? [])
      .map((connection) => getVerticalLinkGeometry(connection, offsets))
      .filter((link): link is NonNullable<typeof link> => link !== undefined);
    contextGroup.add(buildVerticalLinksGroup(links, visibleLevelIds, emphasizeLinks));

    scene.add(contextGroup);
    contextGroupRef.current = contextGroup;
    stackExtentRef.current = {
      centerY: (lowestY + highestY) / 2,
      span: highestY - lowestY,
    };
    requestRenderRef.current?.();
  }, [
    emphasizeLinks,
    hiddenLevelIds,
    isMultilevel,
    isReady,
    levelSpacing,
    selectedLevelId,
    sortedLevels,
    upperLevelMode,
    verticalConnections,
    viewMode,
    dungeon,
  ]);

  useEffect(() => {
    if (isReady) fitCamera();
  }, [fitCamera, isReady, viewMode]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (mapGroupRef.current) {
      scene.remove(mapGroupRef.current);
      disposeDungeonThreeGroup(mapGroupRef.current);
      mapGroupRef.current = null;
      highlightRef.current = null;
      connectionHighlightRef.current = null;
    }
    floorMeshRef.current = null;
    floorCoordinatesRef.current = [];
    waterMeshRef.current = null;
    lavaMeshRef.current = null;
    waterfallMeshRef.current = null;
    lavafallMeshRef.current = null;

    const group = new THREE.Group();
    const categories = createRoomCategoryGrid(dungeon);
    const floors: Array<{ coordinate: FloorCoordinate; color: THREE.Color }> = [];
    const pillars: FloorCoordinate[] = [];
    const waterTiles: FloorCoordinate[] = [];
    const lavaTiles: FloorCoordinate[] = [];
    const doors: InstancePlacement[] = [];
    const secretDoors: InstancePlacement[] = [];
    const variantDoors = new Map<DoorVariant, InstancePlacement[]>();
    const stairTreads: InstancePlacement[] = [];
    const entranceArch: InstancePlacement[] = [];
    const exteriorLinks: InstancePlacement[] = [];
    const trapMarkers: InstancePlacement[] = [];
    const treasureMarkers: InstancePlacement[] = [];
    const raisedFloors: InstancePlacement[] = [];
    const caveBarriers: InstancePlacement[] = [];
    const breachRubble: InstancePlacement[] = [];
    const waterfalls: InstancePlacement[] = [];
    const lavafalls: InstancePlacement[] = [];
    const shaftCenters: InstancePlacement[] = [];
    const shaftRims: InstancePlacement[] = [];

    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        const sourceTile = dungeon.tiles[y]?.[x];
        if (sourceTile === undefined) continue;
        const tile = sourceTile;
        if (tile === WALL_TILE) continue;

        const coordinate = { x, y };
        floors.push({
          coordinate,
          color: getFloorColor(tile, categories.get(y * dungeon.width + x)),
        });
        if (tile === PILLAR_TILE) pillars.push(coordinate);
        if (tile === WATER_TILE || CAVE_WATER_TILES.has(tile)) waterTiles.push(coordinate);
        if (tile === LAVA_TILE || CAVE_LAVA_TILES.has(tile)) lavaTiles.push(coordinate);

        const passageRotation = getPassageRotation(dungeon, x, y);
        if (
          tile === STAIRS_UP_TILE
          || tile === STAIRS_DOWN_TILE
          || tile === ROOM_STAIRS_TILE
        ) {
          for (let step = 0; step < 4; step += 1) {
            const ascendingStep = tile === STAIRS_DOWN_TILE ? 3 - step : step;
            const color = tile === STAIRS_DOWN_TILE
              ? new THREE.Color("#8c795f")
              : new THREE.Color("#b69a6b");
            stairTreads.push({
              x: x + 0.5,
              y: 0.09 + ascendingStep * 0.065,
              z: y + 0.22 + step * 0.18,
              color,
            });
          }
        }

        if (tile === ELEVATED_FLOOR_TILE) {
          raisedFloors.push({ x: x + 0.5, y: 0.09, z: y + 0.5 });
        }
        if (tile === CAVE_CONNECTION_WALL_TILE) {
          caveBarriers.push({
            x: x + 0.5,
            y: 0.32,
            z: y + 0.5,
            rotation: passageRotation,
          });
        }
        if (tile === CAVE_BREACH_TILE) {
          breachRubble.push(
            { x: x + 0.34, y: 0.09, z: y + 0.34, scaleX: 0.8, scaleY: 0.7, scaleZ: 0.8 },
            { x: x + 0.65, y: 0.08, z: y + 0.5, scaleX: 0.65, scaleY: 0.55, scaleZ: 0.65 },
            { x: x + 0.46, y: 0.1, z: y + 0.69, scaleX: 0.7, scaleY: 0.8, scaleZ: 0.7 },
          );
        }
        if (tile === CAVE_WATERFALL_TILE) {
          waterfalls.push({ x: x + 0.5, y: 0.43, z: y + 0.48 });
        }
        if (tile === CAVE_LAVA_FALL_TILE) {
          lavafalls.push({ x: x + 0.5, y: 0.43, z: y + 0.48 });
        }
        const trapType = TRAP_TYPE_BY_TILE.get(tile);
        if (trapType) {
          trapMarkers.push({
            x: x + 0.5,
            y: 0.18,
            z: y + 0.5,
            color: getTrapColor(TRAP_DEFINITIONS[trapType].category),
          });
        }
        if (tile === EXTERIOR_ENTRANCE_TILE) {
          const angle = passageRotation;
          const offsetX = Math.cos(angle) * 0.36;
          const offsetZ = -Math.sin(angle) * 0.36;
          entranceArch.push(
            { x: x + 0.5 - offsetX, y: 0.48, z: y + 0.5 - offsetZ, rotation: angle, scaleX: 0.14, scaleY: 0.96, scaleZ: 0.14 },
            { x: x + 0.5 + offsetX, y: 0.48, z: y + 0.5 + offsetZ, rotation: angle, scaleX: 0.14, scaleY: 0.96, scaleZ: 0.14 },
            { x: x + 0.5, y: 0.96, z: y + 0.5, rotation: angle, scaleX: 0.92, scaleY: 0.16, scaleZ: 0.18 },
          );
        }
        if (tile === EXTERIOR_CONNECTION_TILE) {
          exteriorLinks.push({ x: x + 0.5, y: 0.07, z: y + 0.5 });
        }
      }
    }

    for (const doorway of getDoorwayGroups(dungeon.tiles, dungeon.doorVariants)) {
      const center = doorway.positions.reduce(
        (sum, position) => ({ x: sum.x + position.x, y: sum.y + position.y }),
        { x: 0, y: 0 },
      );
      const x = center.x / doorway.positions.length + 0.5;
      const z = center.y / doorway.positions.length + 0.5;
      const rotation = doorway.axis === "horizontal"
        ? 0
        : doorway.axis === "vertical"
          ? Math.PI / 2
          : getPassageRotation(dungeon, doorway.positions[0].x, doorway.positions[0].y);
      const placement: InstancePlacement = {
        x,
        y: 0.46,
        z,
        rotation,
        scaleX: doorway.positions.length,
      };
      if (doorway.tile === SECRET_DOOR_TILE) secretDoors.push(placement);
      else if (doorway.variant) {
        const bucket = variantDoors.get(doorway.variant) ?? [];
        bucket.push(placement);
        variantDoors.set(doorway.variant, bucket);
      } else doors.push(placement);
    }

    for (const room of dungeon.roomDetails) {
      const treasureCount = room.treasures.length;
      const columns = Math.min(3, treasureCount);
      const rows = Math.ceil(treasureCount / Math.max(columns, 1));
      for (let index = 0; index < treasureCount; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        treasureMarkers.push({
          x: room.x + room.width / 2 + (column - (columns - 1) / 2) * 0.34,
          y: 0.16,
          z: room.y + room.height / 2 + (row - (rows - 1) / 2) * 0.28,
          color: new THREE.Color("#c4a66f"),
        });
      }

      const roomTypeTitle = room.roomType.title.toLocaleLowerCase();
      if (
        roomTypeTitle.includes("elevador")
        || roomTypeTitle.includes("poço de transporte")
        || roomTypeTitle.includes("poço vertical")
      ) {
        const x = room.x + room.width / 2;
        const z = room.y + room.height / 2;
        shaftCenters.push({ x, y: 0.052, z });
        shaftRims.push({ x, y: 0.1, z });
      }
    }

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(dungeon.width + 2, dungeon.height + 2),
      new THREE.MeshStandardMaterial({ color: "#151d26", roughness: 1 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(dungeon.width / 2, -0.12, dungeon.height / 2);
    base.visible = stackExtentRef.current.span === 0;
    base.userData.isBase = true;
    group.add(base);

    if (floors.length > 0) {
      const floorMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.985, 0.08, 0.985),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 0.92,
          metalness: 0,
          emissive: "#151b21",
          emissiveIntensity: 0.2,
        }),
        floors.length,
      );
      floorMesh.name = "dungeon-floor";
      floorMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const coordinates: FloorCoordinate[] = [];

      floors.forEach((floor, index) => {
        position.set(floor.coordinate.x + 0.5, 0, floor.coordinate.y + 0.5);
        matrix.compose(position, rotation, scale);
        floorMesh.setMatrixAt(index, matrix);
        const noise = Math.sin(floor.coordinate.x * 12.9898 + floor.coordinate.y * 78.233) * 43758.5453;
        floorMesh.setColorAt(index, floor.color.clone().multiplyScalar(0.93 + (noise - Math.floor(noise)) * 0.12));
        coordinates.push(floor.coordinate);
      });

      floorMesh.instanceMatrix.needsUpdate = true;
      if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
      floorMesh.computeBoundingSphere();
      group.add(floorMesh);
      floorMesh.receiveShadow = true;
      floorMeshRef.current = floorMesh;
      floorCoordinatesRef.current = coordinates;
    } else {
      floorMeshRef.current = null;
      floorCoordinatesRef.current = [];
    }

    for (const wallMesh of createSmoothWallMeshes(dungeon)) group.add(wallMesh);

    if (pillars.length > 0) {
      const pillarMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.25, 0.34, 0.92, 12),
        new THREE.MeshStandardMaterial({ color: "#9b9585", roughness: 0.86 }),
        pillars.length,
      );
      pillarMesh.name = "dungeon-pillars";
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      pillars.forEach((pillar, index) => {
        position.set(pillar.x + 0.5, 0.48, pillar.y + 0.5);
        matrix.compose(position, rotation, scale);
        pillarMesh.setMatrixAt(index, matrix);
      });
      pillarMesh.instanceMatrix.needsUpdate = true;
      group.add(pillarMesh);
      pillarMesh.castShadow = true;
    }

    if (doors.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-doors",
        new THREE.BoxGeometry(1, 0.86, 0.08),
        new THREE.MeshStandardMaterial({ color: "#8f6b49", roughness: 0.82 }),
        doors,
      );
    }
    if (secretDoors.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-secret-doors",
        new THREE.BoxGeometry(1, 0.86, 0.08),
        new THREE.MeshStandardMaterial({ color: "#56616a", roughness: 0.92 }),
        secretDoors,
      );
    }
    addDoorVariantMeshes(group, variantDoors);
    if (stairTreads.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-stairs",
        new THREE.BoxGeometry(0.76, 0.07, 0.15),
        new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 }),
        stairTreads,
      );
    }
    if (raisedFloors.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-elevated-floors",
        new THREE.BoxGeometry(0.9, 0.18, 0.9),
        new THREE.MeshStandardMaterial({ color: "#b4a68a", roughness: 0.9 }),
        raisedFloors,
      );
    }
    if (entranceArch.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-exterior-entrances",
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: "#a18a69", roughness: 0.88 }),
        entranceArch,
      );
    }
    if (exteriorLinks.length > 0) {
      const linkGeometry = new THREE.TorusGeometry(0.24, 0.035, 6, 16);
      linkGeometry.rotateX(Math.PI / 2);
      addInstancedMesh(
        group,
        "dungeon-exterior-connections",
        linkGeometry,
        new THREE.MeshStandardMaterial({
          color: DUNGEON_MAP_PALETTE.hover,
          emissive: "#17343c",
          emissiveIntensity: 0.26,
          roughness: 0.55,
        }),
        exteriorLinks,
      );
    }
    if (trapMarkers.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-traps",
        new THREE.OctahedronGeometry(0.15, 0),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 0.68,
          emissive: "#1d1710",
          emissiveIntensity: 0.14,
        }),
        trapMarkers,
      );
    }
    if (treasureMarkers.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-treasures",
        new THREE.BoxGeometry(0.28, 0.19, 0.23),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 0.62,
          metalness: 0.12,
        }),
        treasureMarkers,
      );
    }
    if (caveBarriers.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-cave-connection-walls",
        new THREE.BoxGeometry(0.92, 0.62, 0.16),
        new THREE.MeshStandardMaterial({ color: "#647568", roughness: 0.96 }),
        caveBarriers,
      );
    }
    if (breachRubble.length > 0) {
      addInstancedMesh(
        group,
        "dungeon-cave-breaches",
        new THREE.DodecahedronGeometry(0.18, 0),
        new THREE.MeshStandardMaterial({ color: "#77786d", roughness: 0.95 }),
        breachRubble,
      );
    }
    if (shaftCenters.length > 0) {
      const shaftGeometry = new THREE.CircleGeometry(0.27, 16);
      shaftGeometry.rotateX(Math.PI / 2);
      addInstancedMesh(
        group,
        "dungeon-vertical-shafts",
        shaftGeometry,
        new THREE.MeshStandardMaterial({ color: "#182029", side: THREE.DoubleSide }),
        shaftCenters,
      );

      const rimGeometry = new THREE.TorusGeometry(0.33, 0.055, 6, 18);
      rimGeometry.rotateX(Math.PI / 2);
      addInstancedMesh(
        group,
        "dungeon-vertical-shaft-rims",
        rimGeometry,
        new THREE.MeshStandardMaterial({ color: "#9a825d", roughness: 0.85 }),
        shaftRims,
      );
    }

    const addLiquidSurface = (
      coordinates: FloorCoordinate[],
      color: string,
      emissive: string,
      name: string,
    ): THREE.InstancedMesh | null => {
      if (coordinates.length === 0) return null;
      const liquidMesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.78, 0.78),
        new THREE.MeshStandardMaterial({
          color,
          emissive,
          emissiveIntensity: 0.35,
          roughness: 0.3,
          side: THREE.DoubleSide,
        }),
        coordinates.length,
      );
      liquidMesh.name = name;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2,
      );
      const scale = new THREE.Vector3(1, 1, 1);
      coordinates.forEach((coordinate, index) => {
        position.set(coordinate.x + 0.5, 0.052, coordinate.y + 0.5);
        matrix.compose(position, rotation, scale);
        liquidMesh.setMatrixAt(index, matrix);
      });
      liquidMesh.instanceMatrix.needsUpdate = true;
      group.add(liquidMesh);
      return liquidMesh;
    };
    waterMeshRef.current = addLiquidSurface(
      waterTiles,
      "#347c94",
      "#0b2934",
      "water-surfaces",
    );
    lavaMeshRef.current = addLiquidSurface(
      lavaTiles,
      "#b85c42",
      "#642415",
      "lava-surfaces",
    );
    if (waterfalls.length > 0) {
      waterfallMeshRef.current = addInstancedMesh(
        group,
        "dungeon-waterfalls",
        new THREE.PlaneGeometry(0.72, 0.72),
        new THREE.MeshStandardMaterial({
          color: "#5599aa",
          transparent: true,
          opacity: 0.82,
          roughness: 0.36,
          side: THREE.DoubleSide,
        }),
        waterfalls,
      );
    }
    if (lavafalls.length > 0) {
      lavafallMeshRef.current = addInstancedMesh(
        group,
        "dungeon-lavafalls",
        new THREE.PlaneGeometry(0.72, 0.72),
        new THREE.MeshStandardMaterial({
          color: "#bd684d",
          emissive: "#6f2415",
          emissiveIntensity: 0.38,
          transparent: true,
          opacity: 0.9,
          roughness: 0.4,
          side: THREE.DoubleSide,
        }),
        lavafalls,
      );
    }

    for (const room of dungeon.roomDetails) {
      addBadge(
        group,
        room.number.toString().padStart(2, "0"),
        getRoomFloorColor(room.roomType.category),
        room.x + room.width / 2,
        1.85,
        room.y + room.height / 2,
        1.35,
        0.68,
      );
    }

    for (const trap of getNumberedCorridorTraps(dungeon)) {
      addBadge(
        group,
        trap.number.toString().padStart(2, "0"),
        "#e77f58",
        trap.x + 0.5,
        0.85,
        trap.y + 0.5,
        0.65,
        0.34,
      );
    }

    scene.add(group);
    group.position.y = selectedOffsetRef.current;
    group.visible = selectedVisibleRef.current;
    mapGroupRef.current = group;
    requestRenderRef.current?.();
  }, [dungeon]);

  useEffect(() => {
    const floorMesh = floorMeshRef.current;
    if (floorMesh) {
      const categories = createRoomCategoryGrid(dungeon);
      floorCoordinatesRef.current.forEach((coordinate, index) => {
        const sourceTile = dungeon.tiles[coordinate.y]?.[coordinate.x];
        if (sourceTile === undefined) return;
        const tile = getVisibleTile(sourceTile, showWater, showLava);
        floorMesh.setColorAt(
          index,
          getFloorColor(tile, categories.get(coordinate.y * dungeon.width + coordinate.x)),
        );
      });
      if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
    }
    if (waterMeshRef.current) waterMeshRef.current.visible = showWater;
    if (lavaMeshRef.current) lavaMeshRef.current.visible = showLava;
    if (waterfallMeshRef.current) waterfallMeshRef.current.visible = showWater;
    if (lavafallMeshRef.current) lavafallMeshRef.current.visible = showLava;
    requestRenderRef.current?.();
  }, [dungeon, showLava, showWater]);

  useEffect(() => {
    const room = focusRequest?.shouldFocus
      ? dungeon.roomDetails.find((candidate) => candidate.number === focusRequest.roomNumber)
      : undefined;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!room || !camera || !controls) return;

    const center = new THREE.Vector3(room.x + room.width / 2, selectedOffsetRef.current, room.y + room.height / 2);
    const offset = camera.position.clone().sub(controls.target);
    const distance = Math.max(8, Math.max(room.width, room.height) * 2.6);
    controls.target.copy(center);
    camera.position.copy(center).add(offset.setLength(distance));
    camera.updateProjectionMatrix();
    controls.update();
  }, [dungeon, focusRequest]);

  useEffect(() => {
    const group = mapGroupRef.current;
    if (!group) return;
    if (highlightRef.current) {
      group.remove(highlightRef.current);
      disposeDungeonThreeGroup(new THREE.Group().add(highlightRef.current));
      highlightRef.current = null;
    }
    if (connectionHighlightRef.current) {
      group.remove(connectionHighlightRef.current);
      disposeDungeonThreeGroup(new THREE.Group().add(connectionHighlightRef.current));
      connectionHighlightRef.current = null;
    }

    if (selectedRoomNumber === undefined) {
      requestRenderRef.current?.();
      return;
    }
    const room = dungeon.roomDetails.find((candidate) => (
      candidate.number === selectedRoomNumber
    ));
    if (!room) {
      requestRenderRef.current?.();
      return;
    }

    const box = new THREE.BoxGeometry(room.width + 0.12, 0.015, room.height + 0.12);
    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({
        color: DUNGEON_MAP_PALETTE.selected,
        transparent: true,
        opacity: 0.95,
      }),
    );
    box.dispose();
    highlight.position.set(
      room.x + room.width / 2,
      0.065,
      room.y + room.height / 2,
    );
    group.add(highlight);
    highlightRef.current = highlight;

    const roomNumbers = createRoomNumberGrid(
      dungeon.tiles,
      dungeon.width,
      dungeon.roomDetails,
    );
    const connectionTiles = getRoomConnectionTiles(
      dungeon.tiles,
      dungeon.width,
      dungeon.roomDetails,
      roomNumbers,
      selectedRoomNumber,
    );
    if (connectionTiles.size > 0) {
      const connectionHighlight = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.82, 0.025, 0.82),
        new THREE.MeshStandardMaterial({
          color: DUNGEON_MAP_PALETTE.selected,
          emissive: DUNGEON_MAP_PALETTE.selected,
          emissiveIntensity: 0.16,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          roughness: 1,
        }),
        connectionTiles.size,
      );
      const transform = new THREE.Object3D();
      let instanceIndex = 0;
      for (const tileIndex of connectionTiles) {
        const x = tileIndex % dungeon.width;
        const y = Math.floor(tileIndex / dungeon.width);
        transform.position.set(x + 0.5, 0.075, y + 0.5);
        transform.scale.set(0.88, 1, 0.88);
        transform.updateMatrix();
        connectionHighlight.setMatrixAt(instanceIndex, transform.matrix);
        instanceIndex += 1;
      }
      connectionHighlight.instanceMatrix.needsUpdate = true;
      connectionHighlight.name = "selected-room-connections";
      connectionHighlight.renderOrder = 3;
      group.add(connectionHighlight);
      connectionHighlightRef.current = connectionHighlight;
    }
    requestRenderRef.current?.();
  }, [dungeon, selectedRoomNumber]);

  useEffect(() => {
    fitCamera();
  }, [fitCamera, generationKey]);

  return (
    <div
      className="canvas-host three-canvas-host"
      ref={hostRef}
      aria-label="Visualização 3D da masmorra gerada"
    >
      {!isReady && !renderError && <div className="canvas-loading">Preparando visualização 3D...</div>}
      {renderError && (
        <div className="three-canvas-error" role="alert">
          <p>{renderError}</p>
          <button className="map-control-button" type="button" onClick={onBackTo2D}>
            Voltar para 2D
          </button>
        </div>
      )}
      {!renderError && (
        <>
          <div className="map-controls three-canvas-controls">
            <div className="map-layer-controls" role="group" aria-label="Camadas de líquidos">
              <button
                className="map-control-button liquid-toggle water-toggle"
                type="button"
                aria-label={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
                aria-pressed={showWater}
                title={`${showWater ? "Ocultar" : "Mostrar"} água no mapa`}
                onClick={onToggleWater}
              >
                <i aria-hidden="true" /> Água
              </button>
              <button
                className="map-control-button liquid-toggle lava-toggle"
                type="button"
                aria-label={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
                aria-pressed={showLava}
                title={`${showLava ? "Ocultar" : "Mostrar"} lava no mapa`}
                onClick={onToggleLava}
              >
                <i aria-hidden="true" /> Lava
              </button>
            </div>
            <div className="three-view-controls" role="group" aria-label="Perspectiva da masmorra">
              <button
                className="map-control-button map-view-button"
                type="button"
                aria-label="Vista superior"
                aria-pressed={cameraView === "top"}
                title="Vista superior"
                onClick={() => setCameraPreset("top")}
              >
                Topo
              </button>
              <button
                className="map-control-button map-view-button"
                type="button"
                aria-label="Vista isométrica"
                aria-pressed={cameraView === "isometric"}
                title="Vista isométrica"
                onClick={() => setCameraPreset("isometric")}
              >
                Iso
              </button>
            </div>
            <div className="map-zoom-controls">
              <button
                className="map-control-button"
                type="button"
                aria-label="Afastar mapa 3D"
                title="Afastar"
                onClick={() => adjustCameraZoom(1.2)}
              >
                −
              </button>
              <button
                className="map-control-button"
                type="button"
                aria-label="Aproximar mapa 3D"
                title="Aproximar"
                onClick={() => adjustCameraZoom(0.82)}
              >
                +
              </button>
              <button
                className="map-control-button fit-button"
                type="button"
                aria-label="Ajustar mapa 3D à tela"
                title="Ajustar mapa 3D à tela"
                onClick={() => {
                  onClearSelection();
                  fitCamera();
                }}
              >
                Ajustar
              </button>
            </div>
          </div>
          <div className="three-canvas-hint">
            Arraste para orbitar · roda para zoom · botão direito para mover
            {isMultilevel && viewMode !== "level" ? " · clique em um andar para ativá-lo" : ""}
          </div>
          {isMultilevel && (
            <details className="three-level-panel" open>
              <summary>Níveis <span>{sortedLevels.length}</span></summary>
              <div className="three-level-modes" role="group" aria-label="Modo de visualização dos níveis">
                {(Object.keys(MULTILEVEL_MODE_LABELS) as MultilevelViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    className="map-control-button map-view-button"
                    type="button"
                    aria-pressed={viewMode === mode}
                    title={mode === "level"
                      ? "Exibir apenas o nível ativo"
                      : mode === "stack"
                        ? "Todos os níveis empilhados"
                        : "Níveis separados verticalmente"}
                    onClick={() => {
                      setViewMode(mode);
                      setLevelSpacing(getDefaultLevelSpacing(mode));
                    }}
                  >
                    {MULTILEVEL_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
              {viewMode !== "level" && (
                <>
                  <label className="three-level-field">
                    <span>Distância entre andares</span>
                    <input
                      type="range"
                      min={MIN_LEVEL_SPACING}
                      max={MAX_LEVEL_SPACING}
                      step={0.2}
                      value={levelSpacing}
                      onChange={(event) => setLevelSpacing(Number(event.target.value))}
                    />
                  </label>
                  <label className="three-level-field">
                    <span>Níveis acima do ativo</span>
                    <select
                      value={upperLevelMode}
                      onChange={(event) => setUpperLevelMode(event.target.value as UpperLevelMode)}
                    >
                      {(Object.keys(UPPER_LEVEL_LABELS) as UpperLevelMode[]).map((mode) => (
                        <option key={mode} value={mode}>{UPPER_LEVEL_LABELS[mode]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="map-control-button three-level-link-toggle"
                    type="button"
                    aria-pressed={emphasizeLinks}
                    onClick={() => setEmphasizeLinks((current) => !current)}
                  >
                    Destacar conexões verticais
                  </button>
                </>
              )}
              <ul className="three-level-list">
                {[...sortedLevels].reverse().map((level) => {
                  const isActive = level.id === selectedLevelId;
                  const isHidden = hiddenLevelIds.has(level.id);
                  return (
                    <li key={level.id} data-active={isActive} data-hidden={isHidden}>
                      <button
                        className="three-level-select"
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onSelectLevel?.(level.id)}
                      >
                        {level.name}
                      </button>
                      {viewMode !== "level" && (
                        <button
                          className="three-level-visibility"
                          type="button"
                          aria-pressed={!isHidden}
                          aria-label={`${isHidden ? "Mostrar" : "Ocultar"} ${level.name}`}
                          title={`${isHidden ? "Mostrar" : "Ocultar"} ${level.name}`}
                          onClick={() => setHiddenLevelIds((current) => {
                            const next = new Set(current);
                            if (next.has(level.id)) next.delete(level.id);
                            else next.add(level.id);
                            return next;
                          })}
                        >
                          {isHidden ? "○" : "●"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export default memo(DungeonThreeCanvas);
