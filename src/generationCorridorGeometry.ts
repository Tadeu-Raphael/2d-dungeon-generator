import type { GridPosition } from "./generationPlan";

export interface CorridorDirection {
  dx: number;
  dy: number;
}

export const CORRIDOR_DIRECTIONS: readonly CorridorDirection[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export function getCorridorCrossSection(
  position: GridPosition,
  direction: CorridorDirection,
  width: number,
): GridPosition[] {
  const halfWidth = Math.floor((width - 1) / 2);
  const tangentX = direction.dy === 0 ? 0 : 1;
  const tangentY = direction.dx === 0 ? 0 : 1;
  return Array.from({ length: width }, (_, index) => {
    const shift = index - halfWidth;
    return {
      x: position.x + tangentX * shift,
      y: position.y + tangentY * shift,
    };
  });
}

export function getCorridorPathBrush(path: readonly GridPosition[], width: number): GridPosition[] {
  const cells = new Map<string, GridPosition>();
  for (let index = 0; index < path.length; index += 1) {
    const position = path[index];
    const directions: CorridorDirection[] = [];
    if (index > 0) {
      directions.push({
        dx: Math.sign(position.x - path[index - 1].x),
        dy: Math.sign(position.y - path[index - 1].y),
      });
    }
    if (index + 1 < path.length) {
      directions.push({
        dx: Math.sign(path[index + 1].x - position.x),
        dy: Math.sign(path[index + 1].y - position.y),
      });
    }
    if (directions.length === 0) directions.push(CORRIDOR_DIRECTIONS[1]);
    for (const direction of directions) {
      for (const cell of getCorridorCrossSection(position, direction, width)) {
        cells.set(`${cell.x},${cell.y}`, cell);
      }
    }
  }
  return [...cells.values()];
}
