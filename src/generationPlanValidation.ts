import {
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
} from "./dungeon";
import type { ConnectionEdge, GenerationPlan, GridPosition, RoomNode } from "./generationPlan";

export type GenerationPlanValidationIssueCode =
  | "invalid-plan-id"
  | "invalid-plan-dimensions"
  | "generation-dimension-mismatch"
  | "invalid-entity-id"
  | "duplicate-entity-id"
  | "invalid-room-dimensions"
  | "invalid-room-position"
  | "invalid-room-footprint"
  | "room-footprint-out-of-bounds"
  | "overlapping-room-footprints"
  | "invalid-room-importance"
  | "invalid-room-floor-id"
  | "room-type-definition-mismatch"
  | "duplicate-sector-room-reference"
  | "invalid-sector-reference"
  | "invalid-sector"
  | "connection-room-not-found"
  | "connection-self-reference"
  | "duplicate-connection"
  | "invalid-connection-width"
  | "connection-floor-mismatch"
  | "connection-path-required"
  | "invalid-connection-path"
  | "discontinuous-connection-path"
  | "connection-does-not-touch-room"
  | "connection-door-placement-unavailable"
  | "required-room-unconnected"
  | "plan-room-not-found"
  | "invalid-intersection"
  | "intersection-connection-not-found"
  | "invalid-transition"
  | "transition-reference-not-found"
  | "transition-not-on-connection"
  | "invalid-feature"
  | "feature-room-not-found";

export interface GenerationPlanValidationIssue {
  code: GenerationPlanValidationIssueCode;
  path: string;
  message: string;
}

export interface GenerationPlanValidationResult {
  valid: boolean;
  issues: GenerationPlanValidationIssue[];
}

const REQUIRED_ROOM_ROLES = new Set(["entrance", "main", "objective", "boss"]);
const CONNECTION_TYPES_REQUIRING_PATH = new Set([
  "corridor",
  "door",
  "secret-door",
  "blocked-passage",
]);
const DOOR_CONNECTION_TYPES = new Set(["door", "secret-door"]);

function isGridPosition(position: GridPosition): boolean {
  return Number.isSafeInteger(position.x) && Number.isSafeInteger(position.y);
}

function positionKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

function isPositionInsidePlan(position: GridPosition, plan: GenerationPlan): boolean {
  return isGridPosition(position)
    && position.x >= 0
    && position.y >= 0
    && position.x < plan.width
    && position.y < plan.height;
}

function getRoomCells(room: RoomNode): Set<string> {
  return new Set(room.footprint.map((cell) => positionKey({
    x: room.position.x + cell.x,
    y: room.position.y + cell.y,
  })));
}

function isRoomCell(room: RoomNode, position: GridPosition): boolean {
  return room.footprint.some((cell) => (
    room.position.x + cell.x === position.x
    && room.position.y + cell.y === position.y
  ));
}

function touchesRoomFootprint(position: GridPosition, room: RoomNode): boolean {
  return room.footprint.some((cell) => {
    const roomX = room.position.x + cell.x;
    const roomY = room.position.y + cell.y;
    return Math.abs(position.x - roomX) + Math.abs(position.y - roomY) <= 1;
  });
}

function canonicalPath(path: readonly GridPosition[]): string {
  const forward = path.map(positionKey).join(";");
  const backward = [...path].reverse().map(positionKey).join(";");
  return forward < backward ? forward : backward;
}

function isDoorConnection(edge: ConnectionEdge): boolean {
  return DOOR_CONNECTION_TYPES.has(edge.connectionType) || edge.isSecret;
}

function isDoorBlocked(edge: ConnectionEdge): boolean {
  return edge.isBlocked || edge.connectionType === "blocked-passage";
}

function validatePathWidth(
  edge: ConnectionEdge,
  path: readonly GridPosition[],
  plan: GenerationPlan,
  addIssue: (
    code: GenerationPlanValidationIssueCode,
    path: string,
    message: string,
  ) => void,
): void {
  const halfWidth = Math.floor((edge.width - 1) / 2);
  for (let index = 0; index < path.length; index += 1) {
    const position = path[index];
    const neighbor = path[index + 1] ?? path[index - 1];
    const horizontal = neighbor === undefined || neighbor.y === position.y;
    for (let offset = 0; offset < edge.width; offset += 1) {
      const shift = offset - halfWidth;
      const brushPosition = {
        x: position.x + (horizontal ? 0 : shift),
        y: position.y + (horizontal ? shift : 0),
      };
      if (!isPositionInsidePlan(brushPosition, plan)) {
        addIssue(
          "invalid-connection-path",
          `connections.${edge.id}.path[${index}]`,
          "The connection width extends outside the GenerationPlan bounds.",
        );
        return;
      }
    }
  }
}

export function validateGenerationPlan(plan: GenerationPlan): GenerationPlanValidationResult {
  const issues: GenerationPlanValidationIssue[] = [];
  const addIssue = (
    code: GenerationPlanValidationIssueCode,
    path: string,
    message: string,
  ): void => {
    issues.push({ code, path, message });
  };

  if (!plan.id.trim()) {
    addIssue("invalid-plan-id", "id", "The GenerationPlan ID cannot be empty.");
  }
  if (
    !Number.isSafeInteger(plan.width)
    || !Number.isSafeInteger(plan.height)
    || plan.width < MIN_DUNGEON_DIMENSION
    || plan.height < MIN_DUNGEON_DIMENSION
    || plan.width > MAX_DUNGEON_WIDTH
    || plan.height > MAX_DUNGEON_HEIGHT
  ) {
    addIssue(
      "invalid-plan-dimensions",
      "dimensions",
      `GenerationPlan dimensions must be between ${MIN_DUNGEON_DIMENSION} and the supported map limits.`,
    );
  }
  if (
    plan.generation.parameters.width !== plan.width
    || plan.generation.parameters.height !== plan.height
  ) {
    addIssue(
      "generation-dimension-mismatch",
      "generation.parameters",
      "Generation metadata dimensions must match the GenerationPlan dimensions.",
    );
  }

  const entityIds = new Map<string, string>();
  const registerId = (id: string, path: string): void => {
    if (!id.trim()) {
      addIssue("invalid-entity-id", path, "Entity IDs cannot be empty.");
      return;
    }
    const firstPath = entityIds.get(id);
    if (firstPath) {
      addIssue(
        "duplicate-entity-id",
        path,
        `This ID is already used at ${firstPath}.`,
      );
    } else {
      entityIds.set(id, path);
    }
  };

  const roomsById = new Map<string, RoomNode>();
  for (const [index, room] of plan.rooms.entries()) {
    registerId(room.id, `rooms[${index}].id`);
    if (!roomsById.has(room.id)) roomsById.set(room.id, room);
  }

  const sectorsById = new Map<string, GenerationPlan["sectors"][number]>();
  for (const [index, sector] of plan.sectors.entries()) {
    registerId(sector.id, `sectors[${index}].id`);
    if (!sectorsById.has(sector.id)) sectorsById.set(sector.id, sector);
    if (!sector.name.trim() || !sector.sectorType) {
      addIssue("invalid-sector", `sectors[${index}]`, "Sectors need a name and a type.");
    }

    const roomIdsInSector = new Set<string>();
    for (const roomId of sector.roomIds) {
      if (roomIdsInSector.has(roomId)) {
        addIssue(
          "duplicate-sector-room-reference",
          `sectors[${index}].roomIds`,
          `Room ${roomId} is listed more than once in this sector.`,
        );
      }
      roomIdsInSector.add(roomId);
      const room = roomsById.get(roomId);
      if (!room || room.sectorId !== sector.id) {
        addIssue(
          "invalid-sector-reference",
          `sectors[${index}].roomIds`,
          `Room ${roomId} does not reference sector ${sector.id}.`,
        );
      }
    }
  }

  const occupiedCells = new Map<string, string>();
  for (const [index, room] of plan.rooms.entries()) {
    const roomPath = `rooms[${index}]`;
    const validDimensions = Number.isSafeInteger(room.width)
      && Number.isSafeInteger(room.height)
      && room.width > 0
      && room.height > 0;
    if (!validDimensions) {
      addIssue(
        "invalid-room-dimensions",
        `${roomPath}.dimensions`,
        "Room width and height must be positive safe integers.",
      );
    }
    const validPosition = isGridPosition(room.position)
      && room.position.x >= 1
      && room.position.y >= 1
      && room.position.x + room.width <= plan.width - 1
      && room.position.y + room.height <= plan.height - 1;
    if (!validPosition) {
      addIssue(
        "invalid-room-position",
        `${roomPath}.position`,
        "The room bounding box must preserve the legacy one-tile map border.",
      );
    }
    if (!room.floorId.trim()) {
      addIssue("invalid-room-floor-id", `${roomPath}.floorId`, "Room floor IDs cannot be empty.");
    }
    if (!Number.isFinite(room.importance) || room.importance < 0 || room.importance > 1) {
      addIssue(
        "invalid-room-importance",
        `${roomPath}.importance`,
        "Room importance must be a number from 0 to 1.",
      );
    }
    if (
      room.metadata.roomTypeDefinition
      && room.metadata.roomTypeDefinition.category !== room.roomType
    ) {
      addIssue(
        "room-type-definition-mismatch",
        `${roomPath}.metadata.roomTypeDefinition`,
        "The thematic room type definition must match roomType.",
      );
    }
    if (room.sectorId) {
      const sector = sectorsById.get(room.sectorId);
      if (!sector || !sector.roomIds.includes(room.id)) {
        addIssue(
          "invalid-sector-reference",
          `${roomPath}.sectorId`,
          `Sector ${room.sectorId} must exist and list this room.`,
        );
      }
    }

    if (room.footprint.length === 0) {
      addIssue(
        "invalid-room-footprint",
        `${roomPath}.footprint`,
        "Room footprints must contain at least one local tile.",
      );
      continue;
    }
    const roomLocalCells = new Set<string>();
    for (const [cellIndex, cell] of room.footprint.entries()) {
      const cellPath = `${roomPath}.footprint[${cellIndex}]`;
      if (
        !isGridPosition(cell)
        || cell.x < 0
        || cell.y < 0
        || cell.x >= room.width
        || cell.y >= room.height
      ) {
        addIssue(
          "room-footprint-out-of-bounds",
          cellPath,
          "Footprint cells must be integer offsets inside the room bounding box.",
        );
        continue;
      }
      const absolutePosition = {
        x: room.position.x + cell.x,
        y: room.position.y + cell.y,
      };
      const absoluteKey = positionKey(absolutePosition);
      if (roomLocalCells.has(absoluteKey)) {
        addIssue(
          "invalid-room-footprint",
          cellPath,
          "A room footprint cannot contain the same tile more than once.",
        );
        continue;
      }
      roomLocalCells.add(absoluteKey);
      const previousRoomId = occupiedCells.get(absoluteKey);
      if (previousRoomId && previousRoomId !== room.id) {
        addIssue(
          "overlapping-room-footprints",
          cellPath,
          `This tile overlaps the footprint of room ${previousRoomId}.`,
        );
      } else {
        occupiedCells.set(absoluteKey, room.id);
      }
    }
    if (validDimensions && room.footprint.some((cell) => (
      cell.x >= 0 && cell.y >= 0 && cell.x < room.width && cell.y < room.height
    ))) {
      const hasAnyCellOutOfPlan = room.footprint.some((cell) => (
        room.position.x + cell.x < 0
        || room.position.y + cell.y < 0
        || room.position.x + cell.x >= plan.width
        || room.position.y + cell.y >= plan.height
      ));
      if (hasAnyCellOutOfPlan) {
        addIssue(
          "room-footprint-out-of-bounds",
          `${roomPath}.footprint`,
          "Room footprint tiles must stay inside the GenerationPlan bounds.",
        );
      }
    }
  }

  const connectionsById = new Map<string, ConnectionEdge>();
  const connectionSignatures = new Set<string>();
  const incidentRoomIds = new Set<string>();
  for (const [index, edge] of plan.connections.entries()) {
    const edgePath = `connections[${index}]`;
    registerId(edge.id, `${edgePath}.id`);
    if (!connectionsById.has(edge.id)) connectionsById.set(edge.id, edge);
    const sourceRoom = roomsById.get(edge.sourceRoomId);
    const targetRoom = roomsById.get(edge.targetRoomId);
    if (!sourceRoom || !targetRoom) {
      addIssue(
        "connection-room-not-found",
        edgePath,
        "Both sourceRoomId and targetRoomId must reference existing rooms.",
      );
    } else if (sourceRoom.id === targetRoom.id) {
      addIssue(
        "connection-self-reference",
        edgePath,
        "A connection must link two different rooms.",
      );
    } else {
      incidentRoomIds.add(sourceRoom.id);
      incidentRoomIds.add(targetRoom.id);
      if (sourceRoom.floorId !== targetRoom.floorId && edge.connectionType !== "vertical") {
        addIssue(
          "connection-floor-mismatch",
          edgePath,
          "Connections between different floors must use the vertical connection type.",
        );
      }
    }
    if (!Number.isSafeInteger(edge.width) || edge.width < 1) {
      addIssue(
        "invalid-connection-width",
        `${edgePath}.width`,
        "Connection width must be a positive safe integer.",
      );
    }

    const path = Array.isArray(edge.path) ? edge.path : [];
    if (CONNECTION_TYPES_REQUIRING_PATH.has(edge.connectionType) && path.length === 0) {
      addIssue(
        "connection-path-required",
        `${edgePath}.path`,
        "This connection type requires an explicit path.",
      );
    }
    let pathIsValid = true;
    for (const [pathIndex, position] of path.entries()) {
      if (!isPositionInsidePlan(position, plan)) {
        addIssue(
          "invalid-connection-path",
          `${edgePath}.path[${pathIndex}]`,
          "Path positions must be integer tiles inside the GenerationPlan bounds.",
        );
        pathIsValid = false;
      }
      if (pathIndex > 0) {
        const previous = path[pathIndex - 1];
        const distance = Math.abs(position.x - previous.x) + Math.abs(position.y - previous.y);
        if (distance !== 1) {
          addIssue(
            "discontinuous-connection-path",
            `${edgePath}.path[${pathIndex}]`,
            "Consecutive path positions must be orthogonally adjacent.",
          );
          pathIsValid = false;
        }
      }
    }
    if (
      path.length > 0
      && edge.connectionType !== "vertical"
      && sourceRoom
      && targetRoom
      && pathIsValid
    ) {
      if (!touchesRoomFootprint(path[0], sourceRoom) || !touchesRoomFootprint(path[path.length - 1], targetRoom)) {
        addIssue(
          "connection-does-not-touch-room",
          `${edgePath}.path`,
          "The first and last path tiles must touch their source and target room footprints.",
        );
      }
      if (Number.isSafeInteger(edge.width) && edge.width > 0) {
        validatePathWidth(edge, path, plan, addIssue);
      }
      if (isDoorConnection(edge) && !isDoorBlocked(edge)) {
        const sourceCells = getRoomCells(sourceRoom);
        const targetCells = getRoomCells(targetRoom);
        const hasDoorPosition = path.some((position) => (
          !sourceCells.has(positionKey(position))
          && !targetCells.has(positionKey(position))
        ));
        if (!hasDoorPosition) {
          addIssue(
            "connection-door-placement-unavailable",
            `${edgePath}.path`,
            "A door connection needs at least one path tile outside both rooms.",
          );
        }
      }
    }

    if (sourceRoom && targetRoom && sourceRoom.id !== targetRoom.id) {
      const roomPair = [sourceRoom.id, targetRoom.id].sort().join("|");
      const signature = `${roomPair}|${edge.connectionType}|${canonicalPath(path)}`;
      if (connectionSignatures.has(signature) && edge.metadata.allowParallel !== true) {
        addIssue(
          "duplicate-connection",
          edgePath,
          "An identical connection already exists; mark intentional parallel edges in metadata.",
        );
      }
      connectionSignatures.add(signature);
    }
  }

  for (const room of plan.rooms) {
    if (
      (room.isRequired || REQUIRED_ROOM_ROLES.has(room.roomRole))
      && !incidentRoomIds.has(room.id)
    ) {
      addIssue(
        "required-room-unconnected",
        `rooms.${room.id}`,
        "Required rooms must have at least one structural connection.",
      );
    }
  }

  const validatePlanRoomReference = (roomId: string | undefined, path: string): void => {
    if (roomId && !roomsById.has(roomId)) {
      addIssue("plan-room-not-found", path, `Room ${roomId} does not exist.`);
    }
  };
  validatePlanRoomReference(plan.entryRoomId, "entryRoomId");
  validatePlanRoomReference(plan.exitRoomId, "exitRoomId");
  validatePlanRoomReference(plan.objectiveRoomId, "objectiveRoomId");

  for (const [index, intersection] of plan.intersections.entries()) {
    const intersectionPath = `intersections[${index}]`;
    registerId(intersection.id, `${intersectionPath}.id`);
    if (
      !isPositionInsidePlan(intersection.position, plan)
      || !Number.isSafeInteger(intersection.width)
      || intersection.width < 1
      || intersection.connectionIds.length < 3
      || intersection.position.x - Math.floor((intersection.width - 1) / 2) < 0
      || intersection.position.y - Math.floor((intersection.width - 1) / 2) < 0
      || intersection.position.x + Math.ceil((intersection.width - 1) / 2) >= plan.width
      || intersection.position.y + Math.ceil((intersection.width - 1) / 2) >= plan.height
    ) {
      addIssue(
        "invalid-intersection",
        intersectionPath,
        "Intersections need an in-bounds position, positive width, and at least three connections.",
      );
    }
    for (const connectionId of intersection.connectionIds) {
      if (!connectionsById.has(connectionId)) {
        addIssue(
          "intersection-connection-not-found",
          `${intersectionPath}.connectionIds`,
          `Connection ${connectionId} does not exist.`,
        );
      }
    }
  }

  for (const [index, transition] of plan.transitions.entries()) {
    const transitionPath = `transitions[${index}]`;
    registerId(transition.id, `${transitionPath}.id`);
    if (!isPositionInsidePlan(transition.position, plan)) {
      addIssue(
        "invalid-transition",
        `${transitionPath}.position`,
        "Transition positions must be integer tiles inside the GenerationPlan bounds.",
      );
    }
    if ((transition.type === "doorway" || transition.type === "secret-door") && !transition.connectionId) {
      addIssue(
        "invalid-transition",
        transitionPath,
        "Door transitions must reference their connection.",
      );
    }
    validatePlanRoomReference(transition.roomId, `${transitionPath}.roomId`);
    const connection = transition.connectionId
      ? connectionsById.get(transition.connectionId)
      : undefined;
    if (transition.connectionId && !connection) {
      addIssue(
        "transition-reference-not-found",
        `${transitionPath}.connectionId`,
        `Connection ${transition.connectionId} does not exist.`,
      );
    } else if (
      connection
      && (transition.type === "doorway" || transition.type === "secret-door")
      && !connection.path.some((position) => (
        position.x === transition.position.x && position.y === transition.position.y
      ))
    ) {
      addIssue(
        "transition-not-on-connection",
        `${transitionPath}.position`,
        "Door transitions must lie on their connection path.",
      );
    }
    if (!transition.roomId && !transition.connectionId) {
      addIssue(
        "invalid-transition",
        transitionPath,
        "Transitions must reference a room or a connection.",
      );
    }
  }

  for (const [index, feature] of plan.features.entries()) {
    const featurePath = `features[${index}]`;
    registerId(feature.id, `${featurePath}.id`);
    if (!isPositionInsidePlan(feature.position, plan)) {
      addIssue(
        "invalid-feature",
        `${featurePath}.position`,
        "Feature positions must be integer tiles inside the GenerationPlan bounds.",
      );
    }
    if (feature.roomId) {
      const room = roomsById.get(feature.roomId);
      if (!room) {
        addIssue(
          "feature-room-not-found",
          `${featurePath}.roomId`,
          `Room ${feature.roomId} does not exist.`,
        );
      } else if (!isRoomCell(room, feature.position)) {
        addIssue(
          "invalid-feature",
          `${featurePath}.position`,
          "Room features must be placed on a tile in their referenced room footprint.",
        );
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export class GenerationPlanValidationError extends Error {
  readonly issues: readonly GenerationPlanValidationIssue[];

  constructor(issues: readonly GenerationPlanValidationIssue[]) {
    const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    super(`Invalid GenerationPlan: ${details}`);
    this.name = "GenerationPlanValidationError";
    this.issues = [...issues];
  }
}
