import {
  CORRIDOR_TILE,
  DOOR_TILE,
  SECRET_DOOR_TILE,
  WALL_TILE,
} from "./core/tiles";
import type { Tile } from "./core/types";
import type { DoorVariant } from "./dungeon";
import type {
  ConnectionEdge,
  ConnectionEndpointGeometry,
  GenerationPlan,
  GridPosition,
} from "./generationPlan";

export type DoorValidationIssueCode =
  | "door-without-connection"
  | "door-position-mismatch"
  | "door-type-mismatch"
  | "door-duplicate"
  | "door-orphan-tile"
  | "door-orientation"
  | "door-disconnected"
  | "connection-without-opening"
  | "door-variant-mismatch"
  | "opening-impassable"
  | "wall-breach";

export interface DoorValidationIssue {
  code: DoorValidationIssueCode;
  position?: GridPosition;
  connectionId?: string;
  message: string;
}

const DIRECTIONS: Record<ConnectionEndpointGeometry["orientation"], GridPosition> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

const ORTHOGONAL: readonly GridPosition[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function key(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

function isTraversable(tile: Tile | undefined): boolean {
  return tile !== undefined && tile !== WALL_TILE;
}

function isBlocked(edge: ConnectionEdge): boolean {
  return edge.isBlocked || edge.connectionType === "blocked-passage";
}

function isDoorEdge(edge: ConnectionEdge): boolean {
  return edge.isSecret || edge.connectionType === "door" || edge.connectionType === "secret-door";
}

function expectedDoorTile(edge: ConnectionEdge): Tile {
  return edge.isSecret || edge.connectionType === "secret-door" ? SECRET_DOOR_TILE : DOOR_TILE;
}

/**
 * Checks that the rasterized tiles agree with the logical plan: every door belongs to a
 * connection and lies on its wall opening, every opening is sealed or deliberately open, and no
 * corridor touches a room wall outside a connection endpoint.
 */
export function validateDoorGeometry(
  plan: GenerationPlan,
  tiles: readonly (readonly Tile[])[],
  doorVariants?: Readonly<Record<string, DoorVariant>>,
): DoorValidationIssue[] {
  const issues: DoorValidationIssue[] = [];
  const tileAt = (position: GridPosition): Tile | undefined => tiles[position.y]?.[position.x];
  const roomCells = new Set<string>();
  for (const room of plan.rooms) {
    for (const cell of room.footprint) {
      roomCells.add(key({ x: room.position.x + cell.x, y: room.position.y + cell.y }));
    }
  }
  const connectionsById = new Map(plan.connections.map((edge) => [edge.id, edge]));
  const routedEdges = plan.connections.filter((edge) => (
    edge.metadata.sourceEndpoint && edge.metadata.targetEndpoint
  ));
  const endpointsOf = (edge: ConnectionEdge): ConnectionEndpointGeometry[] => [
    edge.metadata.sourceEndpoint,
    edge.metadata.targetEndpoint,
  ].filter((endpoint): endpoint is ConnectionEndpointGeometry => Boolean(endpoint));

  const wallOpenings = new Set<string>();
  for (const edge of routedEdges) {
    if (isBlocked(edge)) continue;
    for (const endpoint of endpointsOf(edge)) {
      for (const position of endpoint.openingPositions) wallOpenings.add(key(position));
    }
  }

  const doorTransitionPositions = new Set<string>();
  for (const transition of plan.transitions) {
    if (transition.type !== "doorway" && transition.type !== "secret-door") continue;
    const positionKey = key(transition.position);
    const edge = transition.connectionId ? connectionsById.get(transition.connectionId) : undefined;
    if (!edge || (edge.sourceRoomId !== transition.roomId && edge.targetRoomId !== transition.roomId)) {
      issues.push({
        code: "door-without-connection",
        position: transition.position,
        connectionId: transition.connectionId,
        message: `Door ${transition.id} has no matching connection for room ${transition.roomId}.`,
      });
      continue;
    }
    if (doorTransitionPositions.has(positionKey)) {
      issues.push({
        code: "door-duplicate",
        position: transition.position,
        connectionId: edge.id,
        message: `More than one door occupies ${positionKey}.`,
      });
    }
    doorTransitionPositions.add(positionKey);

    const endpoint = endpointsOf(edge).find((candidate) => candidate.roomId === transition.roomId);
    if (endpoint && !endpoint.openingPositions.some((position) => key(position) === positionKey)) {
      issues.push({
        code: "door-position-mismatch",
        position: transition.position,
        connectionId: edge.id,
        message: `Door ${transition.id} is not on the wall opening of connection ${edge.id}.`,
      });
    }
    const expectedType = expectedDoorTile(edge) === SECRET_DOOR_TILE ? "secret-door" : "doorway";
    if (!isDoorEdge(edge) || transition.type !== expectedType || tileAt(transition.position) !== expectedDoorTile(edge)) {
      issues.push({
        code: "door-type-mismatch",
        position: transition.position,
        connectionId: edge.id,
        message: `Door ${transition.id} does not match the type or tile of connection ${edge.id}.`,
      });
    }
  }

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      const position = { x, y };
      if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
        if (!doorTransitionPositions.has(key(position))) {
          issues.push({
            code: "door-orphan-tile",
            position,
            message: `Door tile at ${x},${y} has no door transition in the plan.`,
          });
        }
      }
      const isCorridorLike = tile === CORRIDOR_TILE || tile === DOOR_TILE || tile === SECRET_DOOR_TILE;
      if (!isCorridorLike || roomCells.has(key(position))) continue;
      const touchingRoom = ORTHOGONAL.some((direction) => (
        roomCells.has(key({ x: x + direction.x, y: y + direction.y }))
      ));
      if (touchingRoom && !wallOpenings.has(key(position))) {
        issues.push({
          code: "wall-breach",
          position,
          message: `Corridor tile at ${x},${y} opens a room wall outside any connection endpoint.`,
        });
      }
    }
  }

  for (const edge of routedEdges) {
    if (isBlocked(edge)) continue;
    for (const endpoint of endpointsOf(edge)) {
      const direction = DIRECTIONS[endpoint.orientation];
      const expectedTile = expectedDoorTile(edge);
      const variants = new Set<string>();
      for (const position of endpoint.openingPositions) {
        const transition = plan.transitions.find((candidate) => (
          candidate.connectionId === edge.id
          && candidate.position.x === position.x
          && candidate.position.y === position.y
        ));
        variants.add(String(transition?.metadata.doorVariant ?? (transition?.metadata.locked === true ? "locked" : "")));
        if (doorVariants && tileAt(position) === DOOR_TILE) {
          const expected = transition?.metadata.doorVariant ?? (transition?.metadata.locked === true ? "locked" : undefined);
          if (doorVariants[key(position)] !== expected) {
            issues.push({
              code: "door-variant-mismatch",
              position,
              connectionId: edge.id,
              message: `The door variant at ${key(position)} differs from the plan.`,
            });
          }
        }
      }
      if (variants.size > 1) {
        issues.push({
          code: "door-variant-mismatch",
          position: endpoint.position,
          connectionId: edge.id,
          message: `Opening of connection ${edge.id} mixes door variants.`,
        });
      }
      for (const position of endpoint.openingPositions) {
        const tile = tileAt(position);
        const inside = { x: position.x - direction.x, y: position.y - direction.y };
        const beyond = { x: position.x + direction.x, y: position.y + direction.y };
        if (!roomCells.has(key(inside))) {
          issues.push({
            code: "door-orientation",
            position,
            connectionId: edge.id,
            message: `Opening ${key(position)} does not face a room cell along its ${endpoint.orientation} orientation.`,
          });
        }
        if (!isTraversable(tile) || !isTraversable(tileAt(beyond)) || !isTraversable(tileAt(inside))) {
          issues.push({
            code: "opening-impassable",
            position,
            connectionId: edge.id,
            message: `Opening ${key(position)} of connection ${edge.id} does not allow passage.`,
          });
        }
        if (isDoorEdge(edge)) {
          if (tile !== expectedTile) {
            issues.push({
              code: "connection-without-opening",
              position,
              connectionId: edge.id,
              message: `Door connection ${edge.id} leaves ${key(position)} of its opening unsealed.`,
            });
          }
        } else if (tile === DOOR_TILE || tile === SECRET_DOOR_TILE) {
          issues.push({
            code: "door-type-mismatch",
            position,
            connectionId: edge.id,
            message: `Connection ${edge.id} has no door but ${key(position)} holds a door tile.`,
          });
        }
      }
    }
  }

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      if (tile !== DOOR_TILE && tile !== SECRET_DOOR_TILE) continue;
      const open = (dx: number, dy: number): boolean => isTraversable(tiles[y + dy]?.[x + dx]);
      const horizontal = open(-1, 0) && open(1, 0);
      const vertical = open(0, -1) && open(0, 1);
      if (!horizontal && !vertical) {
        issues.push({
          code: "door-disconnected",
          position: { x, y },
          message: `Door at ${x},${y} does not connect two open spaces.`,
        });
      }
    }
  }

  return issues;
}
