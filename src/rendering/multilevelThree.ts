import * as THREE from "three";
import {
  FLOOR_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  WALL_TILE,
  ELEVATED_FLOOR_TILE,
} from "../dungeon";
import type { Dungeon, DoorVariant, Tile } from "../dungeon";
import type { RoomTypeCategory } from "../roomTypes";
import type { VerticalConnection, VerticalConnectionKind } from "../dungeonStructure";
import { getDoorwayGroups } from "./doorwayLayout";
import { createSmoothWallMeshes } from "./smoothWalls";
import {
  createRoomCategoryGrid,
  getRoomFloorColor,
  getTileColor,
} from "./dungeonTileSemantics";

export type MultilevelViewMode = "level" | "stack" | "exploded";
export type UpperLevelMode = "solid" | "ghost" | "hidden";

export interface ThreeLevelDescriptor {
  id: string;
  name: string;
  verticalIndex: number;
  dungeon: Dungeon;
}

export const STACK_LEVEL_SPACING = 2.6;
export const EXPLODED_LEVEL_SPACING = 9;
export const MIN_LEVEL_SPACING = 1.6;
export const MAX_LEVEL_SPACING = 18;
const GHOST_OPACITY = 0.22;
const DIMMED_OPACITY = 0.62;

export function getDefaultLevelSpacing(mode: MultilevelViewMode): number {
  return mode === "exploded" ? EXPLODED_LEVEL_SPACING : STACK_LEVEL_SPACING;
}

/**
 * Vertical offset of every level. Deeper levels (lower verticalIndex) sit lower; the topmost level
 * is at y = 0 so selecting another level never moves the stack.
 */
export function computeLevelOffsets(
  levels: readonly Pick<ThreeLevelDescriptor, "id" | "verticalIndex">[],
  spacing: number,
): Map<string, number> {
  const top = levels.reduce((highest, level) => Math.max(highest, level.verticalIndex), Number.NEGATIVE_INFINITY);
  const offsets = new Map<string, number>();
  for (const level of levels) {
    offsets.set(level.id, (level.verticalIndex - top) * spacing);
  }
  return offsets;
}

export function getLevelOpacity(
  level: Pick<ThreeLevelDescriptor, "id" | "verticalIndex">,
  selectedLevel: Pick<ThreeLevelDescriptor, "id" | "verticalIndex"> | undefined,
  upperLevelMode: UpperLevelMode,
): number {
  if (!selectedLevel || level.id === selectedLevel.id) return 1;
  if (level.verticalIndex > selectedLevel.verticalIndex) {
    if (upperLevelMode === "hidden") return 0;
    return upperLevelMode === "ghost" ? GHOST_OPACITY : DIMMED_OPACITY;
  }
  return DIMMED_OPACITY;
}

export interface VerticalLinkGeometry {
  id: string;
  kind: VerticalConnectionKind;
  sourceLevelId: string;
  targetLevelId: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

/** Floor-surface endpoints of a vertical connection, in the shared scene coordinates. */
export function getVerticalLinkGeometry(
  connection: VerticalConnection,
  offsets: ReadonlyMap<string, number>,
): VerticalLinkGeometry | undefined {
  const sourceY = offsets.get(connection.sourceLevelId);
  const targetY = offsets.get(connection.targetLevelId);
  if (sourceY === undefined || targetY === undefined) return undefined;
  return {
    id: connection.id,
    kind: connection.kind,
    sourceLevelId: connection.sourceLevelId,
    targetLevelId: connection.targetLevelId,
    from: new THREE.Vector3(connection.sourcePosition.x + 0.5, sourceY + 0.04, connection.sourcePosition.y + 0.5),
    to: new THREE.Vector3(connection.targetPosition.x + 0.5, targetY + 0.04, connection.targetPosition.y + 0.5),
  };
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  color?: THREE.Color;
}

function getFloorColor(tile: Tile, category: RoomTypeCategory | undefined): THREE.Color {
  if (category && (tile === FLOOR_TILE || tile === ELEVATED_FLOOR_TILE)) {
    return new THREE.Color(getRoomFloorColor(category));
  }
  const [red, green, blue] = getTileColor(tile);
  return new THREE.Color().setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
}

function createMaterial(color: string, roughness: number, opacity: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness });
  if (opacity < 1) {
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
  }
  return material;
}

function createInstanced(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  levelId: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.userData.levelId = levelId;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  placements.forEach((placement, index) => {
    position.set(placement.x, placement.y, placement.z);
    rotation.setFromAxisAngle(axis, placement.rotation ?? 0);
    scale.set(placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    if (placement.color) mesh.setColorAt(index, placement.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Lightweight structural model of one level: floors, walls, doors, stairs and pillars built from
 * the same Dungeon tiles as the 2D view. The active level keeps the richer builder in
 * DungeonThreeCanvas; this one renders every other level with shared instancing.
 */
const DOOR_VARIANT_3D: Record<DoorVariant, { color: string; roughness: number; heightScale: number; opacity: number }> = {
  reinforced: { color: "#4f5660", roughness: 0.55, heightScale: 1, opacity: 1 },
  locked: { color: "#6f4b2e", roughness: 0.8, heightScale: 1, opacity: 1 },
  gate: { color: "#8d98a5", roughness: 0.5, heightScale: 1, opacity: 0.6 },
  grate: { color: "#7c8794", roughness: 0.5, heightScale: 1, opacity: 0.45 },
  destroyed: { color: "#4a3a2b", roughness: 0.95, heightScale: 0.28, opacity: 1 },
  open: { color: "#8f7a58", roughness: 0.9, heightScale: 0, opacity: 1 },
};

/**
 * One instanced mesh per door variant so reinforced doors, gates, grates and ruined doors read
 * differently in 3D; open doorways leave the passage clear and only keep thin jamb posts.
 */
export function addDoorVariantMeshes(
  group: THREE.Group,
  placementsByVariant: ReadonlyMap<DoorVariant, readonly Placement[]>,
  opacityScale = 1,
  levelId = "",
): void {
  for (const [variant, placements] of placementsByVariant) {
    if (placements.length === 0) continue;
    const style = DOOR_VARIANT_3D[variant];
    if (style.heightScale === 0) {
      const posts = placements.flatMap((placement) => {
        const half = (placement.scaleX ?? 1) / 2 - 0.06;
        const along = placement.rotation === 0 || placement.rotation === undefined
          ? { dx: half, dz: 0 }
          : { dx: 0, dz: half };
        return [
          { x: placement.x - along.dx, y: 0.4, z: placement.z - along.dz },
          { x: placement.x + along.dx, y: 0.4, z: placement.z + along.dz },
        ];
      });
      group.add(createInstanced(
        `door-jambs-${variant}`,
        new THREE.BoxGeometry(0.12, 0.8, 0.12),
        createMaterial(style.color, style.roughness, opacityScale),
        posts,
        levelId,
      ));
      continue;
    }
    const height = 0.86 * style.heightScale;
    group.add(createInstanced(
      `door-${variant}`,
      new THREE.BoxGeometry(1, height, 0.08),
      createMaterial(style.color, style.roughness, Math.min(style.opacity, 1) * opacityScale),
      placements.map((placement) => ({ ...placement, y: 0.03 + height / 2 })),
      levelId,
    ));
  }
}

export function buildLevelContextGroup(
  level: ThreeLevelDescriptor,
  offsetY: number,
  opacity: number,
): THREE.Group {
  const { dungeon } = level;
  const group = new THREE.Group();
  group.name = `level-${level.id}`;
  group.position.y = offsetY;
  group.userData.levelId = level.id;
  if (opacity <= 0) {
    group.visible = false;
    return group;
  }

  const categories = createRoomCategoryGrid(dungeon);
  const floors: Placement[] = [];
  const pillars: Placement[] = [];
  const treads: Placement[] = [];

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = dungeon.tiles[y]?.[x];
      if (tile === undefined || tile === WALL_TILE) continue;
      floors.push({
        x: x + 0.5,
        y: 0,
        z: y + 0.5,
        color: getFloorColor(tile, categories.get(y * dungeon.width + x)),
      });
      if (tile === PILLAR_TILE) pillars.push({ x: x + 0.5, y: 0.48, z: y + 0.5 });
      if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE || tile === ROOM_STAIRS_TILE) {
        for (let step = 0; step < 4; step += 1) {
          const rise = tile === STAIRS_DOWN_TILE ? 3 - step : step;
          treads.push({
            x: x + 0.5,
            y: 0.09 + rise * 0.065,
            z: y + 0.22 + step * 0.18,
            color: new THREE.Color(tile === STAIRS_DOWN_TILE ? "#8c795f" : "#b69a6b"),
          });
        }
      }
    }
  }

  const doors: Placement[] = [];
  const secretDoors: Placement[] = [];
  const variantDoors = new Map<DoorVariant, Placement[]>();
  for (const doorway of getDoorwayGroups(dungeon.tiles, dungeon.doorVariants)) {
    const centerX = doorway.positions.reduce((sum, position) => sum + position.x, 0) / doorway.positions.length + 0.5;
    const centerZ = doorway.positions.reduce((sum, position) => sum + position.y, 0) / doorway.positions.length + 0.5;
    const placement: Placement = {
      x: centerX,
      y: 0.46,
      z: centerZ,
      rotation: doorway.axis === "vertical" ? Math.PI / 2 : 0,
      scaleX: doorway.positions.length,
    };
    if (doorway.tile === SECRET_DOOR_TILE) secretDoors.push(placement);
    else if (doorway.variant) {
      const bucket = variantDoors.get(doorway.variant) ?? [];
      bucket.push(placement);
      variantDoors.set(doorway.variant, bucket);
    } else doors.push(placement);
  }

  if (floors.length > 0) {
    const floorMesh = createInstanced(
      "level-floor",
      new THREE.BoxGeometry(0.97, 0.08, 0.97),
      createMaterial("#ffffff", 0.92, opacity),
      floors,
      level.id,
    );
    // Faint ghost floors must not intercept clicks meant for the active level behind them.
    floorMesh.userData.pickable = opacity >= 0.5;
    group.add(floorMesh);
  }
  for (const wallMesh of createSmoothWallMeshes(dungeon, { opacity, levelId: level.id, namePrefix: "level" })) {
    group.add(wallMesh);
  }
  if (pillars.length > 0) {
    group.add(createInstanced(
      "level-pillars",
      new THREE.CylinderGeometry(0.25, 0.34, 0.92, 10),
      createMaterial("#9b9585", 0.86, opacity),
      pillars,
      level.id,
    ));
  }
  if (treads.length > 0) {
    group.add(createInstanced(
      "level-stairs",
      new THREE.BoxGeometry(0.76, 0.07, 0.15),
      createMaterial("#ffffff", 0.88, opacity),
      treads,
      level.id,
    ));
  }
  if (doors.length > 0) {
    group.add(createInstanced(
      "level-doors",
      new THREE.BoxGeometry(1, 0.86, 0.08),
      createMaterial("#8f6b49", 0.82, opacity),
      doors,
      level.id,
    ));
  }
  if (secretDoors.length > 0) {
    group.add(createInstanced(
      "level-secret-doors",
      new THREE.BoxGeometry(1, 0.86, 0.08),
      createMaterial("#56616a", 0.92, opacity),
      secretDoors,
      level.id,
    ));
  }
  addDoorVariantMeshes(group, variantDoors, opacity, level.id);
  return group;
}

const LINK_COLORS: Record<VerticalConnectionKind, string> = {
  stairs: "#d9b46c",
  "spiral-stairs": "#d9b46c",
  ramp: "#c9a66b",
  "vertical-shaft": "#75b8c9",
  elevator: "#91b78c",
  trapdoor: "#c77d91",
  drop: "#c77d91",
  "secret-passage": "#9aa8b9",
  portal: "#b79bd6",
  other: "#9aa8b9",
};

export interface VerticalLinkPart {
  kind: "step" | "column" | "ring" | "rail";
  position: THREE.Vector3;
  rotationY: number;
  scale: THREE.Vector3;
}

/** Physical parts of a vertical connection; stairs and ramps are real steps spanning both floors. */
export function getVerticalLinkParts(link: VerticalLinkGeometry): VerticalLinkPart[] {
  const rise = link.to.y - link.from.y;
  const run = new THREE.Vector3(link.to.x - link.from.x, 0, link.to.z - link.from.z);
  const parts: VerticalLinkPart[] = [];
  const stepCount = THREE.MathUtils.clamp(Math.ceil(Math.abs(rise) / 0.22), 6, 48);

  if (link.kind === "stairs" || link.kind === "ramp" || link.kind === "spiral-stairs") {
    const heading = Math.atan2(run.x, run.z);
    for (let step = 0; step <= stepCount; step += 1) {
      const t = step / stepCount;
      if (link.kind === "spiral-stairs") {
        const angle = t * Math.PI * 2 * Math.max(1, Math.round(Math.abs(rise) / 2.4));
        parts.push({
          kind: "step",
          position: new THREE.Vector3(
            THREE.MathUtils.lerp(link.from.x, link.to.x, t) + Math.cos(angle) * 0.34,
            link.from.y + rise * t,
            THREE.MathUtils.lerp(link.from.z, link.to.z, t) + Math.sin(angle) * 0.34,
          ),
          rotationY: -angle,
          scale: new THREE.Vector3(0.5, 0.07, 0.22),
        });
      } else {
        parts.push({
          kind: "step",
          position: new THREE.Vector3(
            THREE.MathUtils.lerp(link.from.x, link.to.x, t),
            link.from.y + rise * t,
            THREE.MathUtils.lerp(link.from.z, link.to.z, t),
          ),
          rotationY: heading,
          scale: new THREE.Vector3(0.76, 0.07, link.kind === "ramp" ? 0.5 : 0.24),
        });
      }
    }
    return parts;
  }

  const center = new THREE.Vector3().addVectors(link.from, link.to).multiplyScalar(0.5);
  parts.push({
    kind: "column",
    position: center,
    rotationY: 0,
    scale: new THREE.Vector3(link.kind === "elevator" ? 0.7 : 0.5, Math.max(0.2, Math.abs(rise)), link.kind === "elevator" ? 0.7 : 0.5),
  });
  parts.push({ kind: "ring", position: link.from.clone(), rotationY: 0, scale: new THREE.Vector3(0.62, 0.62, 0.62) });
  parts.push({ kind: "ring", position: link.to.clone(), rotationY: 0, scale: new THREE.Vector3(0.62, 0.62, 0.62) });
  if (run.lengthSq() > 0.01) {
    parts.push({ kind: "rail", position: center, rotationY: 0, scale: run.clone() });
  }
  return parts;
}

export function buildVerticalLinksGroup(
  links: readonly VerticalLinkGeometry[],
  visibleLevelIds: ReadonlySet<string>,
  emphasized: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "vertical-connections";
  const opacity = emphasized ? 0.95 : 0.7;
  const axis = new THREE.Vector3(0, 1, 0);

  for (const link of links) {
    if (!visibleLevelIds.has(link.sourceLevelId) || !visibleLevelIds.has(link.targetLevelId)) continue;
    const color = LINK_COLORS[link.kind];
    const parts = getVerticalLinkParts(link);
    const steps = parts.filter((part) => part.kind === "step");
    if (steps.length > 0) {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        emissive: color,
        emissiveIntensity: emphasized ? 0.45 : 0.15,
        transparent: true,
        opacity,
      });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, steps.length);
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      steps.forEach((step, index) => {
        rotation.setFromAxisAngle(axis, step.rotationY);
        matrix.compose(step.position, rotation, step.scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `vertical-${link.kind}-${link.id}`;
      mesh.renderOrder = 4;
      group.add(mesh);
    }

    for (const part of parts) {
      if (part.kind === "column") {
        const column = new THREE.Mesh(
          link.kind === "elevator"
            ? new THREE.BoxGeometry(part.scale.x, part.scale.y, part.scale.z)
            : new THREE.CylinderGeometry(part.scale.x / 2, part.scale.x / 2, part.scale.y, 20, 1, true),
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.5,
            emissive: color,
            emissiveIntensity: emphasized ? 0.4 : 0.12,
            transparent: true,
            opacity: link.kind === "elevator" ? 0.45 : 0.3,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        column.position.copy(part.position);
        column.renderOrder = 4;
        column.name = `vertical-${link.kind}-${link.id}`;
        group.add(column);
      } else if (part.kind === "ring") {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(part.scale.x / 2, 0.035, 8, 24),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: emphasized ? 0.6 : 0.25,
            roughness: 0.4,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(part.position);
        ring.renderOrder = 5;
        group.add(ring);
      } else if (part.kind === "rail") {
        const geometry = new THREE.BufferGeometry().setFromPoints([link.from, link.to]);
        const rail = new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
        );
        rail.renderOrder = 5;
        group.add(rail);
      }
    }
  }
  return group;
}
