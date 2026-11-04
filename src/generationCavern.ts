import { createGenerationRandomStreams } from "./core/random";
import type { Tile } from "./core/types";
import { generateCellular } from "./core/generation/cellular";
import { FLOOR_TILE } from "./core/tiles";
import { getCorridorPathBrush } from "./generationCorridorGeometry";
import {
  analyzeTopologyConnectivity,
  isConnectionPlayerAccessible,
} from "./generationTopology";
import type {
  CaveConnection,
  CaveConnectionTarget,
  GenerationPlan,
  GridPosition,
  NaturalRegion,
  NaturalRegionRowSpan,
} from "./generationPlan";
import type { DungeonParameters } from "./dungeon";

export class CavernGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CavernGenerationError";
  }
}

const MAX_CELLULAR_ITERATIONS = 12;

function assertCavernParameters(parameters: DungeonParameters): void {
  if (
    !Number.isSafeInteger(parameters.cellularFillPercent)
    || parameters.cellularFillPercent < 1
    || parameters.cellularFillPercent > 99
  ) {
    throw new CavernGenerationError(
      "A densidade celular da caverna deve estar entre 1% e 99%.",
    );
  }
  if (
    !Number.isSafeInteger(parameters.cellularIterations)
    || parameters.cellularIterations < 0
    || parameters.cellularIterations > MAX_CELLULAR_ITERATIONS
  ) {
    throw new CavernGenerationError(
      `A irregularidade celular deve usar de 0 a ${MAX_CELLULAR_ITERATIONS} iterações.`,
    );
  }
}

function generateCavernTiles(
  width: number,
  height: number,
  parameters: DungeonParameters,
  seed: number,
): Tile[][] {
  assertCavernParameters(parameters);
  return generateCellular(
    width,
    height,
    createGenerationRandomStreams(seed).caverns,
    parameters.cellularFillPercent,
    parameters.cellularIterations,
  );
}

function createRowSpans(
  width: number,
  height: number,
  isCaveTile: (x: number, y: number) => boolean,
): NaturalRegionRowSpan[] {
  const spans: NaturalRegionRowSpan[] = [];
  for (let y = 0; y < height; y += 1) {
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const open = x < width && isCaveTile(x, y);
      if (open && start < 0) start = x;
      if (!open && start >= 0) {
        spans.push({ y, xStart: start, xEnd: x });
        start = -1;
      }
    }
  }
  return spans;
}

function countSpanTiles(spans: readonly NaturalRegionRowSpan[]): number {
  return spans.reduce((total, span) => total + span.xEnd - span.xStart, 0);
}

function getPositionAtOrdinal(
  spans: readonly NaturalRegionRowSpan[],
  ordinal: number,
): GridPosition {
  let remaining = ordinal;
  for (const span of spans) {
    const spanLength = span.xEnd - span.xStart;
    if (remaining < spanLength) return { x: span.xStart + remaining, y: span.y };
    remaining -= spanLength;
  }
  throw new RangeError("A cavern tile ordinal is outside the generated region.");
}

export interface GeneratedNaturalCavern {
  region: NaturalRegion;
  entryPosition: GridPosition;
  exitPosition: GridPosition;
  tileCount: number;
}

export function generateNaturalCavern(
  planId: string,
  width: number,
  height: number,
  parameters: DungeonParameters,
  seed: number,
): GeneratedNaturalCavern {
  const tiles = generateCavernTiles(width, height, parameters, seed);
  const rowSpans = createRowSpans(width, height, (x, y) => tiles[y]?.[x] === FLOOR_TILE);
  const tileCount = countSpanTiles(rowSpans);
  if (tileCount < 2) {
    throw new CavernGenerationError(
      "O autômato celular não produziu uma região navegável grande o suficiente para posicionar as entradas.",
    );
  }

  const random = createGenerationRandomStreams(seed).decoration;
  const entryPosition = getPositionAtOrdinal(
    rowSpans,
    Math.floor(random() * tileCount),
  );
  let exitPosition = entryPosition;
  let greatestDistance = -1;
  for (const span of rowSpans) {
    for (let x = span.xStart; x < span.xEnd; x += 1) {
      const distance = Math.abs(x - entryPosition.x) + Math.abs(span.y - entryPosition.y);
      if (distance > greatestDistance) {
        greatestDistance = distance;
        exitPosition = { x, y: span.y };
      }
    }
  }

  return {
    region: {
      id: `${planId}:natural-region:0000`,
      type: "cavern",
      rowSpans,
      metadata: {
        algorithm: "cellular-automata",
        fillPercent: parameters.cellularFillPercent,
        iterations: parameters.cellularIterations,
        connected: true,
        tileCount,
      },
    },
    entryPosition,
    exitPosition,
    tileCount,
  };
}

function getIndex(position: GridPosition, width: number): number {
  return position.y * width + position.x;
}

function getLargestComponent(
  candidates: Uint8Array,
  width: number,
  height: number,
): { cells: Uint8Array; count: number } {
  const area = width * height;
  const visited = new Uint8Array(area);
  const queue = new Int32Array(area);
  const cells = new Uint8Array(area);
  let largestCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!candidates[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        const north = index - width;
        const east = index + 1;
        const south = index + width;
        const west = index - 1;
        if (y > 1 && candidates[north] && !visited[north]) {
          visited[north] = 1;
          queue[tail++] = north;
        }
        if (x < width - 2 && candidates[east] && !visited[east]) {
          visited[east] = 1;
          queue[tail++] = east;
        }
        if (y < height - 2 && candidates[south] && !visited[south]) {
          visited[south] = 1;
          queue[tail++] = south;
        }
        if (x > 1 && candidates[west] && !visited[west]) {
          visited[west] = 1;
          queue[tail++] = west;
        }
      }
      if (tail > largestCount) {
        cells.fill(0);
        for (let index = 0; index < tail; index += 1) cells[queue[index]] = 1;
        largestCount = tail;
      }
    }
  }
  return { cells, count: largestCount };
}

function addTargetCell(
  position: GridPosition,
  target: CaveConnectionTarget,
  width: number,
  structuralCells: Uint8Array,
  targets: Map<number, CaveConnectionTarget>,
): void {
  const index = getIndex(position, width);
  structuralCells[index] = 1;
  if (!targets.has(index) || target.type === "room") targets.set(index, target);
}

function findCavernConnectionPath(
  plan: GenerationPlan,
  cavernCells: Uint8Array,
  structuralCells: Uint8Array,
  targets: ReadonlyMap<number, CaveConnectionTarget>,
): { path: GridPosition[]; target: CaveConnectionTarget } {
  const area = plan.width * plan.height;
  const parent = new Int32Array(area);
  parent.fill(-2);
  const queue = new Int32Array(area);
  let head = 0;
  let tail = 0;
  for (const index of targets.keys()) {
    if (parent[index] !== -2) continue;
    parent[index] = -1;
    queue[tail++] = index;
  }

  let caveIndex = -1;
  while (head < tail) {
    const current = queue[head++];
    if (cavernCells[current]) {
      caveIndex = current;
      break;
    }
    const x = current % plan.width;
    const y = Math.floor(current / plan.width);
    const north = current - plan.width;
    const east = current + 1;
    const south = current + plan.width;
    const west = current - 1;
    if (
      y > 1
      && parent[north] === -2
      && !structuralCells[north]
    ) {
      parent[north] = current;
      queue[tail++] = north;
    }
    if (
      x < plan.width - 2
      && parent[east] === -2
      && !structuralCells[east]
    ) {
      parent[east] = current;
      queue[tail++] = east;
    }
    if (
      y < plan.height - 2
      && parent[south] === -2
      && !structuralCells[south]
    ) {
      parent[south] = current;
      queue[tail++] = south;
    }
    if (
      x > 1
      && parent[west] === -2
      && !structuralCells[west]
    ) {
      parent[west] = current;
      queue[tail++] = west;
    }
  }
  if (caveIndex < 0) {
    throw new CavernGenerationError(
      "Não foi possível conectar uma região cavernosa às salas e corredores existentes.",
    );
  }

  const path: GridPosition[] = [];
  let current = caveIndex;
  while (current >= 0 && !targets.has(current)) {
    path.push({ x: current % plan.width, y: Math.floor(current / plan.width) });
    current = parent[current];
  }
  const target = targets.get(current);
  if (!target || path.length === 0) {
    throw new CavernGenerationError(
      "A passagem orgânica não encontrou uma conexão espacial válida com o mapa construído.",
    );
  }
  path.reverse();
  return { path, target };
}

export interface GeneratedHybridCavern {
  region: NaturalRegion;
  connection: CaveConnection;
  tileCount: number;
}

export function generateHybridCavern(
  plan: GenerationPlan,
  seed: number,
): GeneratedHybridCavern {
  const { width, height } = plan;
  const area = width * height;
  const tiles = generateCavernTiles(width, height, plan.generation.parameters, seed);
  const structuralCells = new Uint8Array(area);
  const targets = new Map<number, CaveConnectionTarget>();
  const roomCells = new Set<number>();
  const accessibleRoomIds = new Set(
    analyzeTopologyConnectivity(plan).playerAccess.reachableRoomIds,
  );

  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      const position = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      const index = getIndex(position, width);
      roomCells.add(index);
      if (accessibleRoomIds.has(room.id)) {
        addTargetCell(
          position,
          { type: "room", id: room.id, position },
          width,
          structuralCells,
          targets,
        );
      } else {
        structuralCells[index] = 1;
      }
    }
  }
  for (const connection of plan.connections) {
    if (
      connection.connectionType === "vertical"
      || connection.path.length === 0
      || !Number.isSafeInteger(connection.width)
      || connection.width <= 0
    ) continue;
    for (const position of getCorridorPathBrush(connection.path, connection.width)) {
      if (roomCells.has(getIndex(position, width))) continue;
      if (connection.connectionType === "blocked-passage" || connection.isBlocked) {
        structuralCells[getIndex(position, width)] = 1;
        continue;
      }
      if (!isConnectionPlayerAccessible(connection, {})) {
        structuralCells[getIndex(position, width)] = 1;
        continue;
      }
      addTargetCell(
        position,
        { type: "connection", id: connection.id, position },
        width,
        structuralCells,
        targets,
      );
    }
  }
  for (const intersection of plan.intersections) {
    const connectionId = intersection.connectionIds[0];
    if (!connectionId) continue;
    const offset = Math.floor((intersection.width - 1) / 2);
    for (let y = 0; y < intersection.width; y += 1) {
      for (let x = 0; x < intersection.width; x += 1) {
        const position = {
          x: intersection.position.x + x - offset,
          y: intersection.position.y + y - offset,
        };
        if (roomCells.has(getIndex(position, width))) continue;
        addTargetCell(
          position,
          { type: "connection", id: connectionId, position },
          width,
          structuralCells,
          targets,
        );
      }
    }
  }
  for (const transition of plan.transitions) {
    const index = getIndex(transition.position, width);
    structuralCells[index] = 1;
    targets.delete(index);
  }
  for (const feature of plan.features) {
    const index = getIndex(feature.position, width);
    structuralCells[index] = 1;
    targets.delete(index);
  }
  if (targets.size === 0) {
    throw new CavernGenerationError(
      "O mapa híbrido não contém salas ou corredores navegáveis para conectar a caverna.",
    );
  }

  const candidates = new Uint8Array(area);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!structuralCells[index] && tiles[y][x] === FLOOR_TILE) candidates[index] = 1;
    }
  }
  const component = getLargestComponent(candidates, width, height);
  if (component.count < 4) {
    throw new CavernGenerationError(
      "O espaço livre restante não comporta uma região cavernosa navegável sem sobrepor as salas e os corredores.",
    );
  }
  const rowSpans = createRowSpans(width, height, (x, y) => (
    component.cells[y * width + x] === 1
  ));
  const region: NaturalRegion = {
    id: `${plan.id}:natural-region:0000`,
    type: "cavern",
    rowSpans,
    metadata: {
      algorithm: "cellular-automata",
      fillPercent: plan.generation.parameters.cellularFillPercent,
      iterations: plan.generation.parameters.cellularIterations,
      connected: true,
      tileCount: component.count,
    },
  };
  const { path, target } = findCavernConnectionPath(
    plan,
    component.cells,
    structuralCells,
    targets,
  );
  return {
    region,
    connection: {
      id: `${plan.id}:cave-connection:0000`,
      regionId: region.id,
      target,
      path,
      metadata: {
        route: "shortest-orthogonal-carve",
        tileCount: component.count,
      },
    },
    tileCount: component.count,
  };
}
