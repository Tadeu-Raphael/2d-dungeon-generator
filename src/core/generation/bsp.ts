import type { Tile, Rect } from "../types";
import { WALL_TILE, FLOOR_TILE, CORRIDOR_TILE, ELEVATED_FLOOR_TILE, ROOM_STAIRS_TILE } from "../tiles";
import { createTileGrid } from "./grid";
import type { RoomDimensionChoice } from "../types";
import type { GeneratedRoom } from "../../dungeon";
import type {
  RectangularRoomRatioFrequencies,
  RectangularRoomRatioKey,
  RoomShape,
  RoomShapeFrequencies,
  RoomSizeFrequencies,
  RoomSizeCategoryKey,
} from "./roomOptions";
import {
  DEFAULT_DUNGEON_DIMENSIONS,
  RECTANGULAR_ROOM_RATIO_DEFINITIONS,
  ROOM_SHAPE_DEFINITIONS,
  ROOM_SIZE_CATEGORIES,
} from "./roomOptions";

export const BS_MIN_ROOM_SIZE = 2;
export const BS_MAX_ROOM_SIZE = 12;
export const BS_MAX_ROOM_ASPECT_RATIO = 1.5;

export { createTileGrid as bsCreateGrid } from "./grid";

export function bsCarveRect(tiles: Tile[][], rect: Rect, tile: Tile): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      tiles[y][x] = tile;
    }
  }
}

export function bsCarveHorizontal(tiles: Tile[][], x1: number, x2: number, y: number, width: number): void {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      const corridorY = y + offset - Math.floor((width - 1) / 2);
      if (tiles[corridorY]?.[x] === WALL_TILE) tiles[corridorY][x] = CORRIDOR_TILE;
    }
  }
}

export function bsCarveVertical(tiles: Tile[][], y1: number, y2: number, x: number, width: number): void {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
    for (let offset = 0; offset < width; offset += 1) {
      const corridorX = x + offset - Math.floor((width - 1) / 2);
      if (tiles[y][corridorX] === WALL_TILE) tiles[y][corridorX] = CORRIDOR_TILE;
    }
  }
}

export function bsRoomCenter(room: Rect): [number, number] {
  return [Math.floor(room.x + room.width / 2), Math.floor(room.y + room.height / 2)];
}

export function bsSquareRoomBounds(room: Rect): Rect {
  const size = Math.min(room.width, room.height);
  return {
    x: room.x + Math.floor((room.width - size) / 2),
    y: room.y + Math.floor((room.height - size) / 2),
    width: size,
    height: size,
  };
}

export function bsCarveRoom(
  tiles: Tile[][],
  room: Rect,
  shape: RoomShape,
  variation: number,
  tile: Tile,
): void {
  if (shape === "rectangular" || shape === "square" || shape === "columns") {
    bsCarveRect(tiles, room, tile);
    return;
  }

  if (shape === "multiLevel") {
    bsCarveRect(tiles, room, tile);
    const platformWidth = Math.max(1, Math.floor(room.width * 0.45));
    const platformHeight = Math.max(1, Math.floor(room.height * 0.45));
    const platformX = room.x + Math.floor((room.width - platformWidth) / 2);
    const platformY = room.y + Math.floor((room.height - platformHeight) / 2);
    bsCarveRect(tiles, {
      x: platformX,
      y: platformY,
      width: platformWidth,
      height: platformHeight,
    }, ELEVATED_FLOOR_TILE);
    const stairX = platformX > room.x ? platformX - 1 : platformX + platformWidth;
    const stairY = room.y + Math.floor(room.height / 2);
    if (stairX < room.x + room.width) tiles[stairY][stairX] = ROOM_STAIRS_TILE;
    return;
  }

  const centerX = room.x + (room.width - 1) / 2;
  const centerY = room.y + (room.height - 1) / 2;
  const radiusX = (shape === "round" ? Math.min(room.width, room.height) : room.width) / 2;
  const radiusY = (shape === "round" ? Math.min(room.width, room.height) : room.height) / 2;
  const orientation = Math.floor(variation / (Math.PI / 2)) % 4;
  let carvedTileCount = 0;

  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      const deltaX = (x - centerX) / radiusX;
      const deltaY = (y - centerY) / radiusY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const angle = Math.atan2(deltaY, deltaX);
      const boundary = 0.86 + 0.12 * Math.sin(angle * 3 + variation) + 0.08 * Math.cos(angle * 5 - variation * 1.7);
      const normalizedX = (x - room.x + 0.5) / room.width;
      const normalizedY = (y - room.y + 0.5) / room.height;
      const [orientedX, orientedY] = orientation === 1
        ? [normalizedY, 1 - normalizedX]
        : orientation === 2
          ? [1 - normalizedX, 1 - normalizedY]
          : orientation === 3
            ? [1 - normalizedY, normalizedX]
            : [normalizedX, normalizedY];
      let isFloor = false;
      if (shape === "round" || shape === "elliptical") {
        isFloor = distance <= 1;
      } else if (shape === "octagonal") {
        isFloor = Math.abs(deltaX) + Math.abs(deltaY) <= 1.5;
      } else if (shape === "lShaped") {
        isFloor = orientedX <= 0.38 || orientedY >= 0.5 || (orientedX >= 0.35 && orientedX <= 0.65 && orientedY >= 0.35 && orientedY <= 0.65);
      } else if (shape === "tShaped") {
        isFloor = orientedY <= 0.38 || (orientedX >= 0.37 && orientedX <= 0.63);
      } else if (shape === "crossShaped") {
        isFloor = Math.abs(orientedX - 0.5) <= 0.18 || Math.abs(orientedY - 0.5) <= 0.18;
      } else if (shape === "ringShaped") {
        isFloor = distance <= 1 && (distance >= 0.55 || distance <= 0.24 || Math.abs(deltaX) <= 0.12 || Math.abs(deltaY) <= 0.12);
      } else if (shape === "alcoves") {
        const inMainRoom = normalizedX >= 0.12 && normalizedX <= 0.88 && normalizedY >= 0.12 && normalizedY <= 0.88;
        const inTopOrBottomAlcove = (normalizedY < 0.12 || normalizedY > 0.88) && ((normalizedX >= 0.2 && normalizedX <= 0.36) || (normalizedX >= 0.64 && normalizedX <= 0.8));
        const inLeftOrRightAlcove = (normalizedX < 0.12 || normalizedX > 0.88) && ((normalizedY >= 0.2 && normalizedY <= 0.36) || (normalizedY >= 0.64 && normalizedY <= 0.8));
        isFloor = inMainRoom || inTopOrBottomAlcove || inLeftOrRightAlcove;
      } else {
        isFloor = distance <= boundary;
      }
      if (isFloor) {
        tiles[y][x] = tile;
        carvedTileCount += 1;
      }
    }
  }
  if (carvedTileCount === 0) bsCarveRect(tiles, room, tile);
}

export function bsCreateWeightedTargets<T extends string>(
  count: number,
  random: () => number,
  weights: readonly { key: T; frequency: number }[],
  fallback: T,
): T[] {
  const totalFrequency = weights.reduce((total, entry) => total + Math.max(0, entry.frequency), 0);
  if (totalFrequency <= 0) return Array.from({ length: count }, () => fallback);
  const allocations = weights.map((entry) => {
    const exactCount = Math.max(0, entry.frequency) / totalFrequency * count;
    return { ...entry, exactCount, tieBreak: random(), count: Math.floor(exactCount) };
  });
  let remaining = count - allocations.reduce((total, entry) => total + entry.count, 0);
  const largestRemainders = [...allocations].sort((left, right) => {
    const difference = (right.exactCount % 1) - (left.exactCount % 1);
    return difference || left.tieBreak - right.tieBreak;
  });
  for (const entry of largestRemainders) {
    if (remaining <= 0) break;
    entry.count += 1;
    remaining -= 1;
  }
  const targets: T[] = [];
  for (const entry of allocations) {
    for (let index = 0; index < entry.count; index += 1) {
      targets.push(entry.key);
    }
  }
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [targets[index], targets[swapIndex]] = [targets[swapIndex], targets[index]];
  }
  return targets;
}

export function bsCreateRoomShapes(
  count: number,
  random: () => number,
  frequencies: RoomShapeFrequencies,
): RoomShape[] {
  return bsCreateWeightedTargets(
    count,
    random,
    ROOM_SHAPE_DEFINITIONS.map(({ key }) => ({ key, frequency: frequencies[key] })),
    "rectangular",
  );
}

export function bsCreateRoomSizeTargets(
  count: number,
  random: () => number,
  frequencies: RoomSizeFrequencies,
): RoomSizeCategoryKey[] {
  return bsCreateWeightedTargets(
    count,
    random,
    ROOM_SIZE_CATEGORIES.map((category) => ({ key: category.key, frequency: frequencies[category.key] })),
    "micro",
  );
}

export function bsCreateRoomRatioTargets(
  count: number,
  random: () => number,
  frequencies: RectangularRoomRatioFrequencies,
): RectangularRoomRatioKey[] {
  const totalFrequency = RECTANGULAR_ROOM_RATIO_DEFINITIONS.reduce(
    (total, definition) => total + Math.max(0, frequencies[definition.key]),
    0,
  );
  if (totalFrequency <= 0) return Array.from({ length: count }, () => "square");
  return Array.from({ length: count }, () => {
    let remainingWeight = random() * totalFrequency;
    for (const definition of RECTANGULAR_ROOM_RATIO_DEFINITIONS) {
      remainingWeight -= Math.max(0, frequencies[definition.key]);
      if (remainingWeight < 0) return definition.key;
    }
    return RECTANGULAR_ROOM_RATIO_DEFINITIONS[RECTANGULAR_ROOM_RATIO_DEFINITIONS.length - 1].key;
  });
}

export function bsChooseRoomDimensions(
  availableWidth: number,
  availableHeight: number,
  maxRoomSize: number,
  shape: RoomShape,
  categoryKey: RoomSizeCategoryKey | null,
  random: () => number,
  ratioKey?: RectangularRoomRatioKey,
): RoomDimensionChoice | null {
  const category = categoryKey === null
    ? undefined
    : ROOM_SIZE_CATEGORIES.find((entry) => entry.key === categoryKey);
  if (categoryKey !== null && !category) return null;
  const minDimension = category?.minDimension ?? BS_MIN_ROOM_SIZE;
  const categoryMaxDimension = category?.maxDimension ?? maxRoomSize;
  const maxWidth = Math.min(availableWidth, maxRoomSize, categoryMaxDimension);
  const maxHeight = Math.min(availableHeight, maxRoomSize, categoryMaxDimension);
  const candidates: Array<{ width: number; height: number }> = [];
  for (let width = minDimension; width <= maxWidth; width += 1) {
    for (let height = minDimension; height <= maxHeight; height += 1) {
      const area = width * height;
      if ((category && (area < category.minArea || area > category.maxArea)) || ((shape === "square" || shape === "round") && width !== height)) continue;
      const ratio = Math.max(width, height) / Math.min(width, height);
      if (!ratioKey && ratio > BS_MAX_ROOM_ASPECT_RATIO) continue;
      candidates.push({ width, height });
    }
  }
  if (candidates.length === 0) return null;
  let validCandidates = candidates;
  if (ratioKey) {
    const ratioDefinition = RECTANGULAR_ROOM_RATIO_DEFINITIONS.find((entry) => entry.key === ratioKey);
    if (!ratioDefinition) return null;
    const matchingCandidates = candidates.filter(({ width, height }) => {
      const ratio = Math.max(width, height) / Math.min(width, height);
      return ratio >= ratioDefinition.minRatio && ratio < ratioDefinition.maxRatio;
    });
    if (matchingCandidates.length > 0) {
      validCandidates = matchingCandidates;
    } else {
      let closestDifference = Number.POSITIVE_INFINITY;
      const closestCandidates: Array<{ width: number; height: number }> = [];
      for (const candidate of candidates) {
        const ratio = Math.max(candidate.width, candidate.height) / Math.min(candidate.width, candidate.height);
        const difference = Math.abs(ratio - ratioDefinition.targetRatio);
        if (difference < closestDifference) {
          closestDifference = difference;
          closestCandidates.length = 0;
          closestCandidates.push(candidate);
        } else if (difference === closestDifference) {
          closestCandidates.push(candidate);
        }
      }
      validCandidates = closestCandidates;
    }
  }
  const selected = validCandidates[Math.floor(random() * validCandidates.length)];
  const getRange = (valueFor: (candidate: { width: number; height: number }) => number) => (
    validCandidates.reduce(
      (range, candidate) => {
        const value = valueFor(candidate);
        return { min: Math.min(range.min, value), max: Math.max(range.max, value) };
      },
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    )
  );
  return {
    ...selected,
    minWidth: getRange((candidate) => candidate.width).min,
    maxWidth: getRange((candidate) => candidate.width).max,
    minHeight: getRange((candidate) => candidate.height).min,
    maxHeight: getRange((candidate) => candidate.height).max,
    areaRange: getRange((candidate) => candidate.width * candidate.height),
    aspectRatioRange: getRange(
      (candidate) => Math.max(candidate.width, candidate.height) / Math.min(candidate.width, candidate.height),
    ),
  };
}

export function bsGenerateBsp(
  width: number,
  height: number,
  random: () => number,
  roomTarget: number,
  corridorWidth: number,
  corridorCompactness: number,
  roomShapeFrequencies: RoomShapeFrequencies,
  roomSizeDistributionEnabled: boolean,
  roomSizeFrequencies: RoomSizeFrequencies,
  rectangularRoomRatioFrequencies: RectangularRoomRatioFrequencies,
): { tiles: Tile[][]; rooms: GeneratedRoom[] } {
  const tiles = createTileGrid(width, height);
  const compactness = Math.max(0, Math.min(1, corridorCompactness / 100));
  const roomScale = Math.min(1.25, Math.sqrt(DEFAULT_DUNGEON_DIMENSIONS.roomCount / Math.max(1, roomTarget)));
  const compactFootprintScaleX = Math.max(0.75, 1 - 0.25 * compactness * roomScale);
  const compactFootprintScaleY = Math.max(0.75, 1 - 0.18 * compactness * roomScale);
  const expandedFootprint = random() >= compactness;
  const layoutWidth = Math.max(Math.min(width - 4, 15), Math.round((width - 4) * (expandedFootprint ? 1 : compactFootprintScaleX)));
  const layoutHeight = Math.max(Math.min(height - 4, 15), Math.round((height - 4) * (expandedFootprint ? 1 : compactFootprintScaleY)));
  const leaves: Rect[] = [{
    x: Math.floor((width - layoutWidth) / 2),
    y: Math.floor((height - layoutHeight) / 2),
    width: layoutWidth,
    height: layoutHeight,
  }];
  const rooms: GeneratedRoom[] = [];
  const defaultAreaPerRoom = DEFAULT_DUNGEON_DIMENSIONS.width
    * DEFAULT_DUNGEON_DIMENSIONS.height
    / DEFAULT_DUNGEON_DIMENSIONS.roomCount;
  const areaPerRoom = width * height / Math.max(1, roomTarget);
  const requestedMaxRoomDimension = roomSizeDistributionEnabled
    ? ROOM_SIZE_CATEGORIES.reduce(
      (largest, category) => (
        roomSizeFrequencies[category.key] > 0
          ? Math.max(largest, category.maxDimension ?? BS_MAX_ROOM_SIZE * 10)
          : largest
      ),
      BS_MIN_ROOM_SIZE,
    )
    : BS_MAX_ROOM_SIZE;
  const maxRoomSize = Math.min(
    BS_MAX_ROOM_SIZE * 10,
    Math.max(
      BS_MAX_ROOM_SIZE,
      Math.round(BS_MAX_ROOM_SIZE * Math.sqrt(areaPerRoom / defaultAreaPerRoom)),
      requestedMaxRoomDimension,
    ),
  );
  const minRoomSize = BS_MIN_ROOM_SIZE;
  const roomSizeTargets = roomSizeDistributionEnabled ? bsCreateRoomSizeTargets(roomTarget, random, roomSizeFrequencies) : [];
  const placementBounds: Rect = {
    x: leaves[0].x,
    y: leaves[0].y,
    width: leaves[0].width,
    height: leaves[0].height,
  };
  const targetFootprintScale = Math.min(
    0.98,
    0.82 + 0.13 * Math.sqrt(roomTarget / DEFAULT_DUNGEON_DIMENSIONS.roomCount) + 0.1 * (1 - compactness),
  );
  const targetFootprintWidth = placementBounds.width * targetFootprintScale;
  const targetFootprintHeight = placementBounds.height * targetFootprintScale;
  const fullBounds: Rect = { x: 2, y: 2, width: width - 4, height: height - 4 };
  const canPlaceRoom = (candidate: Rect, bounds: Rect): boolean => {
    if (
      candidate.x < bounds.x + 1
      || candidate.y < bounds.y + 1
      || candidate.x + candidate.width > bounds.x + bounds.width - 1
      || candidate.y + candidate.height > bounds.y + bounds.height - 1
    ) return false;
    return rooms.every((room) => {
      const horizontalGap = Math.max(0, candidate.x - (room.x + room.width), room.x - (candidate.x + candidate.width));
      const verticalGap = Math.max(0, candidate.y - (room.y + room.height), room.y - (candidate.y + candidate.height));
      return horizontalGap > 0 || verticalGap > 0;
    });
  };
  const placeRoom = (roomWidth: number, roomHeight: number): Rect | null => {
    if (rooms.length === 0) {
      return {
        x: placementBounds.x + Math.floor((placementBounds.width - roomWidth) / 2),
        y: placementBounds.y + Math.floor((placementBounds.height - roomHeight) / 2),
        width: roomWidth,
        height: roomHeight,
      };
    }
    const candidates = new Map<string, { room: Rect; score: number; tieBreak: number }>();
    const maxGap = 1 + Math.ceil((1 - compactness) * 8);
    const addCandidate = (x: number, y: number): void => {
      const candidate = { x, y, width: roomWidth, height: roomHeight };
      if (!canPlaceRoom(candidate, placementBounds)) return;
      const key = x + "," + y;
      if (candidates.has(key)) return;
      const minX = Math.min(x, ...rooms.map((room) => room.x));
      const minY = Math.min(y, ...rooms.map((room) => room.y));
      const maxX = Math.max(x + roomWidth, ...rooms.map((room) => room.x + room.width));
      const maxY = Math.max(y + roomHeight, ...rooms.map((room) => room.y + room.height));
      const centerX = x + roomWidth / 2;
      const centerY = y + roomHeight / 2;
      const layoutCenterX = placementBounds.x + placementBounds.width / 2;
      const layoutCenterY = placementBounds.y + placementBounds.height / 2;
      const footprintWidth = maxX - minX;
      const footprintHeight = maxY - minY;
      const nearestGap = Math.min(...rooms.map((room) => {
        const horizontalGap = Math.max(0, x - (room.x + room.width), room.x - (x + roomWidth));
        const verticalGap = Math.max(0, y - (room.y + room.height), room.y - (y + roomHeight));
        return horizontalGap + verticalGap;
      }));
      const adjacentRoomCount = rooms.filter((room) => {
        const horizontalGap = Math.max(0, x - (room.x + room.width), room.x - (x + roomWidth));
        const verticalGap = Math.max(0, y - (room.y + room.height), room.y - (y + roomHeight));
        return horizontalGap + verticalGap === 1;
      }).length;
      const score = Math.abs(targetFootprintWidth - footprintWidth)
        + Math.abs(targetFootprintHeight - footprintHeight)
        + 0.25 * (Math.abs(centerX - layoutCenterX) + Math.abs(centerY - layoutCenterY))
        + 1.95 * nearestGap
        - 1.5 * Math.max(0, adjacentRoomCount - 1);
      candidates.set(key, { room: candidate, score, tieBreak: random() });
    };
    for (const anchor of rooms) {
      const alignedY = new Set([
        anchor.y,
        anchor.y + Math.floor((anchor.height - roomHeight) / 2),
        anchor.y + anchor.height - roomHeight,
        anchor.y - roomHeight + 1,
        anchor.y + anchor.height - 1,
      ]);
      const alignedX = new Set([
        anchor.x,
        anchor.x + Math.floor((anchor.width - roomWidth) / 2),
        anchor.x + anchor.width - roomWidth,
        anchor.x - roomWidth + 1,
        anchor.x + anchor.width - 1,
      ]);
      for (let gap = 1; gap <= maxGap; gap += 1) {
        for (const y of alignedY) {
          addCandidate(anchor.x - gap - roomWidth, y);
          addCandidate(anchor.x + anchor.width + gap, y);
        }
        for (const x of alignedX) {
          addCandidate(x, anchor.y - gap - roomHeight);
          addCandidate(x, anchor.y + anchor.height + gap);
        }
      }
    }
    if (candidates.size > 0) {
      const rankedCandidates = [...candidates.values()].sort(
        (left, right) => left.score - right.score || left.tieBreak - right.tieBreak,
      );
      const candidateCount = Math.max(1, Math.ceil(rankedCandidates.length * (1 - compactness) * 0.25));
      return rankedCandidates[Math.floor(random() * Math.min(candidateCount, rankedCandidates.length))].room;
    }
    for (const bounds of [placementBounds, fullBounds]) {
      for (let y = bounds.y + 1; y <= bounds.y + bounds.height - roomHeight - 1; y += 1) {
        for (let x = bounds.x + 1; x <= bounds.x + bounds.width - roomWidth - 1; x += 1) {
          const candidate = { x, y, width: roomWidth, height: roomHeight };
          if (canPlaceRoom(candidate, bounds)) return candidate;
        }
      }
    }
    return null;
  };

  for (let index = 0; index < leaves.length && leaves.length < roomTarget; index += 1) {
    const leaf = leaves[index];
    const canSplitHorizontally = leaf.height >= 15;
    const canSplitVertically = leaf.width >= 15;
    if (!canSplitHorizontally && !canSplitVertically) continue;
    let splitHorizontally: boolean;
    if (!canSplitHorizontally) {
      splitHorizontally = false;
    } else if (!canSplitVertically) {
      splitHorizontally = true;
    } else {
      const aspectRatio = leaf.width / leaf.height;
      if (aspectRatio > BS_MAX_ROOM_ASPECT_RATIO) {
        splitHorizontally = false;
      } else if (aspectRatio < 1 / BS_MAX_ROOM_ASPECT_RATIO) {
        splitHorizontally = true;
      } else {
        splitHorizontally = random() > 0.5;
      }
    }
    const dimension = splitHorizontally ? leaf.height : leaf.width;
    const minimum = Math.max(7, Math.floor(dimension * 0.3));
    const maximum = Math.min(dimension - 7, Math.ceil(dimension * 0.7));
    const split = minimum + Math.floor(random() * (maximum - minimum + 1));
    if (split < minimum || dimension - split < minimum) continue;
    if (splitHorizontally) {
      leaves.push(
        { x: leaf.x, y: leaf.y, width: leaf.width, height: split },
        { x: leaf.x, y: leaf.y + split, width: leaf.width, height: leaf.height - split },
      );
    } else {
      leaves.push(
        { x: leaf.x, y: leaf.y, width: split, height: leaf.height },
        { x: leaf.x + split, y: leaf.y, width: leaf.width - split, height: leaf.height },
      );
    }
    leaves.splice(index, 1);
    index -= 1;
  }

  const roomLeaves = leaves.filter((leaf) => (
    Math.min(leaf.width - 2, maxRoomSize) >= minRoomSize
    && Math.min(leaf.height - 2, maxRoomSize) >= minRoomSize
  ));
  const roomShapes = bsCreateRoomShapes(roomLeaves.length, random, roomShapeFrequencies);
  const rectangularRoomCount = roomShapes.filter((shape) => shape === "rectangular").length;
  const roomRatioTargets = bsCreateRoomRatioTargets(rectangularRoomCount, random, rectangularRoomRatioFrequencies);
  let rectangularRoomIndex = 0;

  for (const [leafIndex, leaf] of roomLeaves.entries()) {
    const maxWidth = Math.min(leaf.width - 2, maxRoomSize);
    const maxHeight = Math.min(leaf.height - 2, maxRoomSize);
    const shape = roomShapes[leafIndex];
    const ratioKey = shape === "rectangular" ? roomRatioTargets[rectangularRoomIndex++] : undefined;
    let dimensions: RoomDimensionChoice | null = null;
    const requestedCategory = roomSizeTargets[leafIndex];
    if (requestedCategory) {
      const requestedIndex = ROOM_SIZE_CATEGORIES.findIndex((category) => category.key === requestedCategory);
      const fallbackCategories = [...ROOM_SIZE_CATEGORIES].sort((left, right) => (
        Math.abs(ROOM_SIZE_CATEGORIES.indexOf(left) - requestedIndex)
        - Math.abs(ROOM_SIZE_CATEGORIES.indexOf(right) - requestedIndex)
      ));
      for (const category of fallbackCategories) {
        dimensions = bsChooseRoomDimensions(
          maxWidth,
          maxHeight,
          maxRoomSize,
          shape,
          category.key,
          random,
          ratioKey,
        );
        if (dimensions) break;
      }
    }
    dimensions ??= bsChooseRoomDimensions(
      maxWidth,
      maxHeight,
      maxRoomSize,
      shape,
      null,
      random,
      ratioKey,
    );
    if (!dimensions) continue;
    const room = placeRoom(dimensions.width, dimensions.height);
    if (!room) continue;
    rooms.push({
      ...room,
      shape,
      generationBounds: {
        minWidth: dimensions.minWidth,
        maxWidth: dimensions.maxWidth,
        minHeight: dimensions.minHeight,
        maxHeight: dimensions.maxHeight,
        areaRange: dimensions.areaRange,
        aspectRatioRange: dimensions.aspectRatioRange,
      },
    });
  }

  const generatedRooms = rooms.map((room): GeneratedRoom => {
    const shape = room.shape;
    const shapedRoom = shape === "square" || shape === "round" ? bsSquareRoomBounds(room) : room;
    bsCarveRoom(tiles, shapedRoom, shape, random() * Math.PI * 2, FLOOR_TILE);
    return { ...shapedRoom, shape, generationBounds: room.generationBounds };
  });

  const roomBoundaryPoints = generatedRooms.map((room) => {
    const points: Array<[number, number]> = [];
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (
          tiles[y][x] !== WALL_TILE
          && (x === room.x || x === room.x + room.width - 1 || y === room.y || y === room.y + room.height - 1)
        ) {
          points.push([x, y]);
        }
      }
    }
    if (points.length > 0) return points;
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (tiles[y][x] !== WALL_TILE) points.push([x, y]);
      }
    }
    return points.length > 0 ? points : [bsRoomCenter(room)];
  });

  const connectedRoomIndices = new Set<number>(generatedRooms.length > 0 ? [0] : []);
  const pendingRoomIndices = new Set(generatedRooms.map((_, index) => index).slice(1));
  const getRoomSeparation = (firstIndex: number, secondIndex: number): number => {
    let shortestDistance = Number.POSITIVE_INFINITY;
    for (const [firstX, firstY] of roomBoundaryPoints[firstIndex]) {
      for (const [secondX, secondY] of roomBoundaryPoints[secondIndex]) {
        shortestDistance = Math.min(shortestDistance, Math.abs(firstX - secondX) + Math.abs(firstY - secondY));
      }
    }
    return shortestDistance;
  };
  const connectRooms = (sourceIndex: number, targetIndex: number) => {
    let shortestDistance = Number.POSITIVE_INFINITY;
    const shortestConnections: Array<[[number, number], [number, number]]> = [];
    for (const sourcePoint of roomBoundaryPoints[sourceIndex]) {
      for (const targetPoint of roomBoundaryPoints[targetIndex]) {
        const distance = Math.abs(sourcePoint[0] - targetPoint[0]) + Math.abs(sourcePoint[1] - targetPoint[1]);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          shortestConnections.length = 0;
          shortestConnections.push([sourcePoint, targetPoint]);
        } else if (distance === shortestDistance) {
          shortestConnections.push([sourcePoint, targetPoint]);
        }
      }
    }
    const [[sourceX, sourceY], [targetX, targetY]] = shortestConnections[Math.floor(random() * shortestConnections.length)];
    if (sourceX === targetX) {
      bsCarveVertical(tiles, sourceY, targetY, sourceX, corridorWidth);
    } else if (sourceY === targetY) {
      bsCarveHorizontal(tiles, sourceX, targetX, sourceY, corridorWidth);
    } else if (random() > 0.5) {
      bsCarveHorizontal(tiles, sourceX, targetX, sourceY, corridorWidth);
      bsCarveVertical(tiles, sourceY, targetY, targetX, corridorWidth);
    } else {
      bsCarveVertical(tiles, sourceY, targetY, sourceX, corridorWidth);
      bsCarveHorizontal(tiles, sourceX, targetX, targetY, corridorWidth);
    }
  };
  while (pendingRoomIndices.size > 0) {
    let shortestDistance = Number.POSITIVE_INFINITY;
    const shortestConnections: Array<[number, number]> = [];
    for (const connectedIndex of connectedRoomIndices) {
      for (const pendingIndex of pendingRoomIndices) {
        const distance = getRoomSeparation(connectedIndex, pendingIndex);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          shortestConnections.length = 0;
          shortestConnections.push([connectedIndex, pendingIndex]);
        } else if (distance === shortestDistance) {
          shortestConnections.push([connectedIndex, pendingIndex]);
        }
      }
    }
    const [sourceIndex, targetIndex] = shortestConnections[Math.floor(random() * shortestConnections.length)];
    connectRooms(sourceIndex, targetIndex);
    connectedRoomIndices.add(targetIndex);
    pendingRoomIndices.delete(targetIndex);
  }
  return { tiles, rooms: generatedRooms };
}
