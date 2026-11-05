/**
 * Rounded 3D walls for both the active level and the context levels. Instead of one straight slab
 * per tile edge, walls follow the smoothed contour of the floor mask (see cartographicField), so
 * corners are rounded and caves keep organic outlines. A lighter cap on each segment reads as a
 * carved stone top.
 */
import * as THREE from "three";
import {
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  WALL_TILE,
} from "../dungeon";
import type { Dungeon, Tile } from "../dungeon";
import { computeContourSegments } from "./cartographicField";

const WALL_HEIGHT = 0.96;
const WALL_THICKNESS = 0.17;
const CAP_HEIGHT = 0.05;
const STONE = new THREE.Color("#596671");
const STONE_CAP = new THREE.Color("#86939f");
const CAVE_STONE = new THREE.Color("#647568");
const CAVE_STONE_CAP = new THREE.Color("#8ea08f");

function hash(x: number, y: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function isOpenTile(tile: Tile | undefined): boolean {
  return tile !== undefined && tile !== WALL_TILE;
}

export interface SmoothWallOptions {
  opacity?: number;
  levelId?: string;
  namePrefix?: string;
}

export function createSmoothWallMeshes(
  dungeon: Dungeon,
  options: SmoothWallOptions = {},
): THREE.InstancedMesh[] {
  const opacity = options.opacity ?? 1;
  const prefix = options.namePrefix ?? "dungeon";
  const segments = computeContourSegments(dungeon, 4, 0.3, 0.5, isOpenTile);
  const tileAt = (x: number, y: number): Tile | undefined => (
    dungeon.tiles[Math.min(dungeon.height - 1, Math.max(0, Math.floor(y)))]
      ?.[Math.min(dungeon.width - 1, Math.max(0, Math.floor(x)))]
  );

  const kept = segments.filter((segment) => {
    const midX = (segment.x1 + segment.x2) / 2;
    const midY = (segment.y1 + segment.y2) / 2;
    const onBorder = midX < 0.2 || midY < 0.2
      || midX > dungeon.width - 0.2 || midY > dungeon.height - 0.2;
    if (!onBorder) return true;
    const tile = tileAt(midX, midY);
    return tile !== EXTERIOR_ENTRANCE_TILE && tile !== EXTERIOR_CONNECTION_TILE;
  });
  if (kept.length === 0) return [];

  const material = (color: string, roughness: number): THREE.MeshStandardMaterial => {
    const result = new THREE.MeshStandardMaterial({ color, roughness });
    if (opacity < 1) {
      result.transparent = true;
      result.opacity = opacity;
      result.depthWrite = false;
    }
    return result;
  };
  const wallMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material("#ffffff", 0.94),
    kept.length,
  );
  const capMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material("#ffffff", 0.86),
    kept.length,
  );
  wallMesh.name = `${prefix}-walls`;
  capMesh.name = `${prefix}-wall-caps`;
  for (const mesh of [wallMesh, capMesh]) {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    if (options.levelId) mesh.userData.levelId = options.levelId;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  kept.forEach((segment, index) => {
    const deltaX = segment.x2 - segment.x1;
    const deltaZ = segment.y2 - segment.y1;
    const length = Math.hypot(deltaX, deltaZ);
    const midX = (segment.x1 + segment.x2) / 2;
    const midZ = (segment.y1 + segment.y2) / 2;
    const tileX = Math.floor(midX);
    const tileY = Math.floor(midZ);
    // Height and tone vary per tile so long walls look quarried rather than extruded.
    const variation = hash(tileX, tileY);
    const height = WALL_HEIGHT * (0.9 + variation * 0.16);
    const nearCave = [-0.35, 0.35].some((dx) => [-0.35, 0.35].some((dz) => {
      const tile = tileAt(midX + dx, midZ + dz);
      return tile === CAVE_BREACH_TILE || tile === CAVE_CONNECTION_WALL_TILE;
    }));
    rotation.setFromAxisAngle(axis, -Math.atan2(deltaZ, deltaX));

    position.set(midX, height / 2, midZ);
    scale.set(length + 0.1, height, WALL_THICKNESS);
    matrix.compose(position, rotation, scale);
    wallMesh.setMatrixAt(index, matrix);
    color.copy(nearCave ? CAVE_STONE : STONE).multiplyScalar(0.9 + variation * 0.22);
    wallMesh.setColorAt(index, color);

    position.set(midX, height + CAP_HEIGHT / 2 - 0.005, midZ);
    scale.set(length + 0.12, CAP_HEIGHT, WALL_THICKNESS + 0.07);
    matrix.compose(position, rotation, scale);
    capMesh.setMatrixAt(index, matrix);
    color.copy(nearCave ? CAVE_STONE_CAP : STONE_CAP).multiplyScalar(0.92 + variation * 0.16);
    capMesh.setColorAt(index, color);
  });

  for (const mesh of [wallMesh, capMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return [wallMesh, capMesh];
}
