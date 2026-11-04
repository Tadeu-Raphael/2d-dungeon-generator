import { memo, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  FLOOR_TILE,
  getNumberedCorridorTraps,
  LAVA_TILE,
  PILLAR_TILE,
  WATER_TILE,
} from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";
import type { MapFocusRequest } from "./types";
import { ROOM_TYPE_CATEGORIES } from "../roomTypes";
import type { RoomTypeCategory } from "../roomTypes";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  createRoomCategoryGrid,
  getTileColor,
  getVisibleTile,
} from "./dungeonTileSemantics";
import { disposeDungeonThreeGroup } from "./dungeonThreeResources";

interface DungeonThreeCanvasProps {
  dungeon: Dungeon;
  generationKey: Dungeon;
  focusRequest: MapFocusRequest | null;
  onRoomSelect: (roomNumber: number) => void;
  onClearSelection: () => void;
  showWater: boolean;
  showLava: boolean;
  onToggleWater: () => void;
  onToggleLava: () => void;
  onBackTo2D: () => void;
}

interface FloorCoordinate {
  x: number;
  y: number;
}

interface WallPlacement {
  x: number;
  z: number;
  rotation: number;
}

function getFloorColor(tile: Tile, category: RoomTypeCategory | undefined): THREE.Color {
  if (category && (tile === FLOOR_TILE || tile === ELEVATED_FLOOR_TILE)) {
    return new THREE.Color(ROOM_TYPE_CATEGORIES[category].color);
  }
  const [red, green, blue] = getTileColor(tile);
  return new THREE.Color().setRGB(
    red / 255,
    green / 255,
    blue / 255,
    THREE.SRGBColorSpace,
  );
}

function createBadgeTexture(label: string, borderColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar o rótulo do mapa 3D.");

  context.fillStyle = "rgba(12, 16, 22, 0.94)";
  context.fillRect(2, 2, 124, 60);
  context.strokeStyle = borderColor;
  context.lineWidth = 5;
  context.strokeRect(4, 4, 120, 56);
  context.fillStyle = "#f4ead5";
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
  onRoomSelect,
  onClearSelection,
  showWater,
  showLava,
  onToggleWater,
  onToggleLava,
  onBackTo2D,
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
  const highlightRef = useRef<THREE.LineSegments | null>(null);
  const latestDungeonRef = useRef(dungeon);
  const callbacksRef = useRef({ onRoomSelect, onClearSelection });
  const requestRenderRef = useRef<(() => void) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  latestDungeonRef.current = dungeon;
  callbacksRef.current = { onRoomSelect, onClearSelection };

  const fitCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const centerX = dungeon.width / 2;
    const centerZ = dungeon.height / 2;
    const distance = Math.max(12, Math.max(dungeon.width, dungeon.height) * 1.55);
    controls.target.set(centerX, 0, centerZ);
    camera.position.set(
      centerX + distance * 0.62,
      distance * 0.76,
      centerZ + distance * 0.9,
    );
    camera.far = distance * 8;
    camera.updateProjectionMatrix();
    controls.update();
  }, [dungeon.height, dungeon.width]);

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
    scene.background = new THREE.Color("#0b1017");
    scene.add(new THREE.HemisphereLight("#e2e8ee", "#20252b", 2.8));
    scene.add(new THREE.AmbientLight("#c6d3de", 0.8));

    const keyLight = new THREE.DirectionalLight("#fff0d4", 3);
    keyLight.position.set(dungeon.width * 0.35, Math.max(dungeon.width, dungeon.height), -dungeon.height * 0.25);
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.48;
    controls.minDistance = Math.max(4, Math.min(dungeon.width, dungeon.height) * 0.15);
    controls.maxDistance = Math.max(dungeon.width, dungeon.height) * 6;
    controls.target.set(dungeon.width / 2, 0, dungeon.height / 2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
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
    let requestRender = () => {};
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };

    resize();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(resize);
    observer?.observe(host);
    if (!observer) window.addEventListener("resize", resize);

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
      renderer.render(scene, camera);
      requestRender();
    };
    controls.addEventListener("change", onControlsChange);
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
      if (!floorMesh) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(floorMesh, false)[0];
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
      if (!observer) window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.removeEventListener("change", onControlsChange);
      controls.dispose();
      if (requestRenderRef.current === requestRender) requestRenderRef.current = null;
      if (mapGroupRef.current) {
        scene.remove(mapGroupRef.current);
        disposeDungeonThreeGroup(mapGroupRef.current);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      mapGroupRef.current = null;
      floorMeshRef.current = null;
      floorCoordinatesRef.current = [];
      waterMeshRef.current = null;
      lavaMeshRef.current = null;
      highlightRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      setIsReady(false);
    };
  }, [dungeon.height, dungeon.width, fitCamera]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (mapGroupRef.current) {
      scene.remove(mapGroupRef.current);
      disposeDungeonThreeGroup(mapGroupRef.current);
      mapGroupRef.current = null;
      highlightRef.current = null;
    }
    floorMeshRef.current = null;
    floorCoordinatesRef.current = [];
    waterMeshRef.current = null;
    lavaMeshRef.current = null;

    const group = new THREE.Group();
    const categories = createRoomCategoryGrid(dungeon);
    const floors: Array<{ coordinate: FloorCoordinate; color: THREE.Color }> = [];
    const walls: WallPlacement[] = [];
    const pillars: FloorCoordinate[] = [];
    const waterTiles: FloorCoordinate[] = [];
    const lavaTiles: FloorCoordinate[] = [];

    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        const sourceTile = dungeon.tiles[y]?.[x];
        if (sourceTile === undefined) continue;
        const tile = sourceTile;
        if (tile === 0) continue;

        const coordinate = { x, y };
        floors.push({
          coordinate,
          color: getFloorColor(tile, categories.get(y * dungeon.width + x)),
        });
        if (tile === PILLAR_TILE) pillars.push(coordinate);
        if (tile === WATER_TILE || CAVE_WATER_TILES.has(tile)) waterTiles.push(coordinate);
        if (tile === LAVA_TILE || CAVE_LAVA_TILES.has(tile)) lavaTiles.push(coordinate);

        const neighbors = [
          { dx: 0, dz: -1, rotation: 0 },
          { dx: 1, dz: 0, rotation: Math.PI / 2 },
          { dx: 0, dz: 1, rotation: 0 },
          { dx: -1, dz: 0, rotation: Math.PI / 2 },
        ];
        for (const neighbor of neighbors) {
          const neighborX = x + neighbor.dx;
          const neighborY = y + neighbor.dz;
          const isOutside = neighborX < 0
            || neighborX >= dungeon.width
            || neighborY < 0
            || neighborY >= dungeon.height;
          if (
            isOutside
            && (tile === EXTERIOR_ENTRANCE_TILE || tile === EXTERIOR_CONNECTION_TILE)
          ) {
            continue;
          }
          const neighborTile = isOutside
            ? 0
            : dungeon.tiles[neighborY]?.[neighborX] ?? 0;
          if (neighborTile === 0) {
            walls.push({
              x: x + 0.5 + neighbor.dx * 0.5,
              z: y + 0.5 + neighbor.dz * 0.5,
              rotation: neighbor.rotation,
            });
          }
        }
      }
    }

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(dungeon.width + 2, dungeon.height + 2),
      new THREE.MeshStandardMaterial({ color: "#111820", roughness: 1 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(dungeon.width / 2, -0.12, dungeon.height / 2);
    group.add(base);

    if (floors.length > 0) {
      const floorMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.94, 0.08, 0.94),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          vertexColors: true,
          roughness: 0.86,
          metalness: 0.02,
          emissive: "#22272c",
          emissiveIntensity: 0.35,
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
        floorMesh.setColorAt(index, floor.color);
        coordinates.push(floor.coordinate);
      });

      floorMesh.instanceMatrix.needsUpdate = true;
      if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
      floorMesh.computeBoundingSphere();
      group.add(floorMesh);
      floorMeshRef.current = floorMesh;
      floorCoordinatesRef.current = coordinates;
    } else {
      floorMeshRef.current = null;
      floorCoordinatesRef.current = [];
    }

    if (walls.length > 0) {
      const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.02, 1.35, 0.16),
        new THREE.MeshStandardMaterial({ color: "#56636e", roughness: 0.94 }),
        walls.length,
      );
      wallMesh.name = "dungeon-walls";
      wallMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);

      walls.forEach((wall, index) => {
        position.set(wall.x, 0.675, wall.z);
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), wall.rotation);
        matrix.compose(position, rotation, scale);
        wallMesh.setMatrixAt(index, matrix);
      });
      wallMesh.instanceMatrix.needsUpdate = true;
      wallMesh.computeBoundingSphere();
      group.add(wallMesh);
    }

    if (pillars.length > 0) {
      const pillarMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.25, 0.34, 0.65, 12),
        new THREE.MeshStandardMaterial({ color: "#b2aa97", roughness: 0.78 }),
        pillars.length,
      );
      pillarMesh.name = "dungeon-pillars";
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      pillars.forEach((pillar, index) => {
        position.set(pillar.x + 0.5, 0.36, pillar.y + 0.5);
        matrix.compose(position, rotation, scale);
        pillarMesh.setMatrixAt(index, matrix);
      });
      pillarMesh.instanceMatrix.needsUpdate = true;
      group.add(pillarMesh);
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
      "#328db1",
      "#0c344a",
      "water-surfaces",
    );
    lavaMeshRef.current = addLiquidSurface(
      lavaTiles,
      "#e65c27",
      "#7d210b",
      "lava-surfaces",
    );

    for (const room of dungeon.roomDetails) {
      const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
      addBadge(
        group,
        room.number.toString().padStart(2, "0"),
        category.color,
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
    requestRenderRef.current?.();
  }, [dungeon, showLava, showWater]);

  useEffect(() => {
      const room = focusRequest?.shouldFocus
        ? dungeon.roomDetails.find((candidate) => candidate.number === focusRequest.roomNumber)
        : undefined;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (room && camera && controls) {
        const centerX = room.x + room.width / 2;
        const centerZ = room.y + room.height / 2;
        const distance = Math.max(12, Math.max(room.width, room.height) * 1.9);
        controls.target.set(centerX, 0, centerZ);
        camera.position.set(
          centerX + distance * 0.62,
          distance * 0.76,
          centerZ + distance * 0.9,
        );
        camera.updateProjectionMatrix();
        controls.update();
      } else {
        fitCamera();
      }
    }, [dungeon, fitCamera, focusRequest]);

    useEffect(() => {
    const group = mapGroupRef.current;
    if (!group) return;
    if (highlightRef.current) {
      group.remove(highlightRef.current);
      disposeDungeonThreeGroup(new THREE.Group().add(highlightRef.current));
      highlightRef.current = null;
    }

    if (!focusRequest?.shouldFocus) {
      requestRenderRef.current?.();
      return;
    }
    const room = dungeon.roomDetails.find((candidate) => (
      candidate.number === focusRequest.roomNumber
    ));
    if (!room) {
      requestRenderRef.current?.();
      return;
    }

    const box = new THREE.BoxGeometry(room.width + 0.1, 2.2, room.height + 0.1);
    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: "#f0cf87", transparent: true, opacity: 0.9 }),
    );
    box.dispose();
    highlight.position.set(
      room.x + room.width / 2,
      1.08,
      room.y + room.height / 2,
    );
    group.add(highlight);
    highlightRef.current = highlight;
    requestRenderRef.current?.();
  }, [dungeon, focusRequest]);

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
            <div className="map-zoom-controls">
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
          </div>
        </>
      )}
    </div>
  );
}

export default memo(DungeonThreeCanvas);
