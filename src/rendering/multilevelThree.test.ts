import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_DUNGEON_PARAMETERS } from "../dungeon";
import { generateDungeonStructure } from "../dungeonStructureGeneration";
import type { VerticalConnection } from "../dungeonStructure";
import { disposeDungeonThreeGroup } from "./dungeonThreeResources";
import {
  buildLevelContextGroup,
  buildVerticalLinksGroup,
  computeLevelOffsets,
  getLevelOpacity,
  getVerticalLinkGeometry,
  getVerticalLinkParts,
} from "./multilevelThree";
import type { ThreeLevelDescriptor } from "./multilevelThree";

function generateLevels(): { levels: ThreeLevelDescriptor[]; connections: readonly VerticalConnection[] } {
  const result = generateDungeonStructure({
    seed: 83002,
    profile: "military-fortress",
    parameters: {
      ...DEFAULT_DUNGEON_PARAMETERS,
      width: 64,
      height: 48,
      roomCount: 6,
      corridorWidth: 1,
      entranceMode: "upper-stairs",
    },
    levels: [
      { name: "Subsolo", verticalIndex: -1, width: 64, height: 48, roomCount: 6, topologyStyle: "linear", spatialLayoutStyle: "axis-branches" },
      { name: "Principal", verticalIndex: 0, width: 60, height: 52, roomCount: 5, topologyStyle: "branching", spatialLayoutStyle: "clusters" },
    ],
    entryLevelIndex: 1,
    verticalConnectionCount: 1,
    allowedVerticalConnectionKinds: ["stairs"],
    requireGlobalConnectivity: true,
    allowVerticalCycles: false,
  });
  return {
    levels: result.structure.levels.map((level) => ({
      id: level.id,
      name: level.name,
      verticalIndex: level.verticalIndex,
      dungeon: result.levels.find((entry) => entry.levelId === level.id)!.generation.dungeon,
    })),
    connections: result.structure.verticalConnections,
  };
}

describe("multilevel 3D layout", () => {
  it("places deeper levels lower with the top level at the origin", () => {
    const offsets = computeLevelOffsets([
      { id: "a", verticalIndex: -2 },
      { id: "b", verticalIndex: 0 },
      { id: "c", verticalIndex: -1 },
    ], 3);

    expect(offsets.get("b")).toBe(0);
    expect(offsets.get("c")).toBe(-3);
    expect(offsets.get("a")).toBe(-6);
  });

  it("fades upper levels but keeps lower ones readable", () => {
    const selected = { id: "b", verticalIndex: -1 };
    expect(getLevelOpacity(selected, selected, "hidden")).toBe(1);
    expect(getLevelOpacity({ id: "up", verticalIndex: 0 }, selected, "hidden")).toBe(0);
    expect(getLevelOpacity({ id: "up", verticalIndex: 0 }, selected, "ghost"))
      .toBeLessThan(getLevelOpacity({ id: "up", verticalIndex: 0 }, selected, "solid"));
    expect(getLevelOpacity({ id: "down", verticalIndex: -2 }, selected, "hidden")).toBeGreaterThan(0);
  });

  it("builds level geometry and vertical links from generated multilevel data", () => {
    const { levels, connections } = generateLevels();
    expect(connections.length).toBeGreaterThan(0);
    const offsets = computeLevelOffsets(levels, 4);

    const group = buildLevelContextGroup(levels[0], offsets.get(levels[0].id) ?? 0, 0.6);
    const names = group.children.map((child) => child.name);
    expect(names).toContain("level-floor");
    expect(names).toContain("level-walls");
    const floorMesh = group.children.find((child) => child.name === "level-floor") as THREE.InstancedMesh;
    const openTiles = levels[0].dungeon.tiles.flat().filter((tile) => tile !== 0).length;
    expect(floorMesh.count).toBe(openTiles);
    const floorMaterial = floorMesh.material as THREE.MeshStandardMaterial;
    expect(floorMaterial.map).toBeInstanceOf(THREE.DataTexture);
    expect(floorMaterial.bumpMap).toBeInstanceOf(THREE.DataTexture);
    const wallMesh = group.children.find((child) => child.name === "level-walls") as THREE.InstancedMesh;
    expect((wallMesh.material as THREE.MeshStandardMaterial).map).toBeInstanceOf(THREE.DataTexture);
    expect(group.position.y).toBe(offsets.get(levels[0].id));

    const link = getVerticalLinkGeometry(connections[0], offsets);
    if (!link) throw new Error("The vertical connection could not be placed.");
    const parts = getVerticalLinkParts(link);
    const steps = parts.filter((part) => part.kind === "step");
    expect(steps.length).toBeGreaterThan(5);
    expect(steps[0].position.y).toBeCloseTo(link.from.y);
    expect(steps[steps.length - 1].position.y).toBeCloseTo(link.to.y);
    expect(Math.abs(link.to.y - link.from.y)).toBeCloseTo(4);

    const linkGroup = buildVerticalLinksGroup([link], new Set(levels.map((level) => level.id)), true);
    expect(linkGroup.children.length).toBeGreaterThan(0);
    const stepMesh = linkGroup.children.find((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect((stepMesh.material as THREE.MeshStandardMaterial).map).toBeInstanceOf(THREE.DataTexture);
    expect(buildVerticalLinksGroup([link], new Set([levels[0].id]), true).children).toHaveLength(0);

    disposeDungeonThreeGroup(group);
    disposeDungeonThreeGroup(linkGroup);
  });

  it("represents shafts and elevators as columns joining both floors", () => {
    const base = { sourceLevelId: "low", targetLevelId: "high", id: "shaft" } as const;
    const from = new THREE.Vector3(5.5, -6, 5.5);
    const to = new THREE.Vector3(5.5, 0, 5.5);
    for (const kind of ["vertical-shaft", "elevator", "trapdoor", "drop"] as const) {
      const parts = getVerticalLinkParts({ ...base, kind, from, to });
      const column = parts.find((part) => part.kind === "column");
      expect(column?.scale.y).toBeCloseTo(6);
      expect(parts.filter((part) => part.kind === "ring")).toHaveLength(2);
    }
  });
});
