import { describe, expect, it } from "vitest";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  DUNGEON_GENERATOR_VERSION_V1,
  DOOR_TILE,
} from "./dungeon";
import type { DungeonParameters } from "./dungeon";
import type { GenerationPlan, GridPosition, RoomNode } from "./generationPlan";
import { generationPlanToDungeon } from "./generationPlanToDungeon";
import { validateGenerationPlan } from "./generationPlanValidation";
import {
  MAX_CORRIDOR_ROUTE_EXPANDED_STATES,
  routeGenerationPlanCorridors,
} from "./generationCorridorRouter";
import { generateGenerationSpatialLayout } from "./generationSpatialLayout";
import { generateDungeonTopology, validateDungeonTopology } from "./generationTopology";

function createFootprint(width: number, height: number): GridPosition[] {
  return Array.from({ length: height }, (_, y) => (
    Array.from({ length: width }, (_, x) => ({ x, y }))
  )).flat();
}

function createSpatialPlan(seed = 93751, corridorWidth = 1): GenerationPlan {
  const roomCount = 8;
  const parameters: DungeonParameters = {
    ...DEFAULT_DUNGEON_PARAMETERS,
    width: 64,
    height: 48,
    roomCount,
    corridorWidth,
  };
  const rooms: RoomNode[] = Array.from({ length: roomCount }, (_, index) => ({
    id: `route-room-${String(index).padStart(2, "0")}`,
    roomType: "exploration",
    roomRole: index === 0 ? "entrance" : index === roomCount - 1 ? "objective" : "secondary",
    width: 3,
    height: 3,
    position: { x: 2 + (index % 4) * 12, y: 2 + Math.floor(index / 4) * 12 },
    shape: "rectangular",
    footprint: createFootprint(3, 3),
    floorId: "floor-1",
    importance: index === 0 || index === roomCount - 1 ? 1 : 0.4,
    isRequired: false,
    metadata: {},
  }));
  const source: GenerationPlan = {
    id: `route-test-${seed}`,
    width: parameters.width,
    height: parameters.height,
    generation: {
      generatorVersion: DUNGEON_GENERATOR_VERSION_V1,
      seed,
      profile: "custom",
      algorithm: "bsp",
      parameters,
      settings: {},
      generatedAt: "2025-01-01T00:00:00.000Z",
    },
    rooms,
    connections: [],
    sectors: [],
    entryRoomId: rooms[0].id,
    objectiveRoomId: rooms[roomCount - 1].id,
    exitRoomId: rooms[roomCount - 1].id,
    intersections: [],
    transitions: [],
    features: [],
    metadata: {},
  };
  const topology = generateDungeonTopology(source, {
    style: "branching",
    parameters: { branchCount: 2, optionalPathCount: 1 },
  });
  return generateGenerationSpatialLayout(topology, { style: "axis-branches" });
}

function areTilesConnected(
  tiles: readonly (readonly number[])[],
  start: GridPosition,
  target: GridPosition,
): boolean {
  const width = tiles[0].length;
  const visited = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const position = queue[cursor];
    if (position.x === target.x && position.y === target.y) return true;
    for (const next of [
      { x: position.x, y: position.y - 1 },
      { x: position.x + 1, y: position.y },
      { x: position.x, y: position.y + 1 },
      { x: position.x - 1, y: position.y },
    ]) {
      const key = `${next.x},${next.y}`;
      if (
        next.x < 0
        || next.y < 0
        || next.y >= tiles.length
        || next.x >= width
        || tiles[next.y][next.x] === 0
        || visited.has(key)
      ) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

describe("GenerationPlan corridor routing", () => {
  it("routes every connection deterministically and converts the routed plan to tiles", () => {
    const layout = createSpatialPlan();
    const routed = routeGenerationPlanCorridors(layout);
    const repeated = routeGenerationPlanCorridors(layout);

    expect(routed.connections).toEqual(repeated.connections);
    expect(routed.intersections).toEqual(repeated.intersections);
    expect(routed.corridorRouting?.routedConnectionCount).toBe(layout.connections.length);
    expect(routed.corridorRouting?.junctionCount).toBeGreaterThan(0);
    expect(routed.connections.every((edge) => (
      edge.path.length > 0
      && edge.metadata.sourceEndpoint?.roomId === edge.sourceRoomId
      && edge.metadata.targetEndpoint?.roomId === edge.targetRoomId
    ))).toBe(true);
    expect(validateGenerationPlan(routed).valid).toBe(true);
    expect(validateDungeonTopology(routed).valid).toBe(true);

    const dungeon = generationPlanToDungeon(routed);
    expect(dungeon.tiles).toHaveLength(routed.height);
    expect(dungeon.tiles.every((row) => row.length === routed.width)).toBe(true);
    for (const edge of routed.connections) {
      expect(areTilesConnected(
        dungeon.tiles,
        edge.metadata.sourceEndpoint!.roomPosition,
        edge.metadata.targetEndpoint!.roomPosition,
      )).toBe(true);
    }
  });

  it("uses explicit route styles to alter corridor geometry", () => {
    const layout = createSpatialPlan(6842);
    const selectedEdge = layout.connections.find((edge) => edge.isMainPath)!;
    const withRouteStyle = (routeStyle: "straight" | "sinuous"): GenerationPlan => ({
      ...layout,
      connections: layout.connections.map((edge) => ({
        ...edge,
        metadata: {
          ...edge.metadata,
          routeStyle: edge.id === selectedEdge.id ? routeStyle : "straight",
        },
      })),
    });
    const straight = routeGenerationPlanCorridors(withRouteStyle("straight"));
    const sinuous = routeGenerationPlanCorridors(withRouteStyle("sinuous"));
    const straightPath = straight.connections.find((edge) => edge.id === selectedEdge.id)!;
    const sinuousPath = sinuous.connections.find((edge) => edge.id === selectedEdge.id)!;

    expect(straightPath.metadata.routeStyle).toBe("straight");
    expect(sinuousPath.metadata.routeStyle).toBe("sinuous");
    expect(sinuousPath.path).not.toEqual(straightPath.path);
  });

  it("routes around obstacles, varies important corridor width, and places doors at endpoints", () => {
    const layout = createSpatialPlan(93751, 2);
    const baseline = routeGenerationPlanCorridors(layout);
    const mainPath = baseline.connections.find((edge) => edge.isMainPath)!;
    expect(mainPath.width).toBeGreaterThan(1);

    const obstaclePosition = mainPath.path[Math.floor(mainPath.path.length / 2)];
    const obstructedLayout: GenerationPlan = {
      ...layout,
      connections: layout.connections.map((edge) => (
        edge.id === mainPath.id ? { ...edge, connectionType: "door" as const } : edge
      )),
      features: [{
        id: "route-test-obstacle",
        type: "pillar",
        position: obstaclePosition,
        metadata: {},
      }],
    };
    const routed = routeGenerationPlanCorridors(obstructedLayout);
    const routedMainPath = routed.connections.find((edge) => edge.id === mainPath.id)!;
    expect(routedMainPath.path).not.toContainEqual(obstaclePosition);
    expect(routedMainPath.metadata.sourceEndpoint?.openingPositions.length).toBe(routedMainPath.width);
    expect(routedMainPath.metadata.targetEndpoint?.openingPositions.length).toBe(routedMainPath.width);
    expect(routed.transitions.some((transition) => transition.connectionId === mainPath.id)).toBe(true);

    const dungeon = generationPlanToDungeon(routed);
    for (const transition of routed.transitions.filter((item) => item.connectionId === mainPath.id)) {
      expect(dungeon.tiles[transition.position.y][transition.position.x]).toBe(DOOR_TILE);
    }
    expect(validateGenerationPlan(routed).valid).toBe(true);
  });

  it("reports a bounded A* search failure instead of silently omitting connections", () => {
    const layout = createSpatialPlan(39211);

    expect(() => routeGenerationPlanCorridors(layout, { maxExpandedStates: 1 }))
      .toThrow(expect.objectContaining({
        code: "search-limit",
        details: expect.arrayContaining([
          "A* expanded 5 of 5 allowed states for this connection.",
        ]),
      }));
  });

  it("rejects A* expansion budgets above the per-route safety limit", () => {
    const layout = createSpatialPlan(39212);

    expect(() => routeGenerationPlanCorridors(layout, {
      maxExpandedStates: MAX_CORRIDOR_ROUTE_EXPANDED_STATES + 1,
    })).toThrow(new RangeError(
      `maxExpandedStates must be a positive safe integer no greater than ${MAX_CORRIDOR_ROUTE_EXPANDED_STATES}.`,
    ));
  });
});
