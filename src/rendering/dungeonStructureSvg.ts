import type { Dungeon } from "../dungeon";
import type { VerticalConnection, VerticalConnectionKind } from "../dungeonStructure";
import { createDungeonSvgContent, getExportTileSize } from "./dungeonSvg";

export interface StructureSvgLevel {
  id: string;
  name: string;
  verticalIndex: number;
  dungeon: Dungeon;
  isSecret?: boolean;
  isOptional?: boolean;
}

export interface DungeonStructureSvg {
  svg: string;
  width: number;
  height: number;
}

const MAX_SHEET_PIXELS = 16_000_000;
const MARGIN = 32;
const TITLE_HEIGHT = 52;
const PANEL_HEADER_HEIGHT = 36;
const PANEL_GAP = 28;
const LEGEND_ROW_HEIGHT = 22;

export const VERTICAL_KIND_LABELS: Record<VerticalConnectionKind, string> = {
  stairs: "Escada",
  "spiral-stairs": "Escada em espiral",
  "vertical-shaft": "Poço vertical",
  elevator: "Elevador",
  trapdoor: "Alçapão",
  drop: "Queda",
  "secret-passage": "Passagem secreta",
  ramp: "Rampa",
  portal: "Portal",
  other: "Conexão vertical",
};

const KIND_COLORS: Record<VerticalConnectionKind, string> = {
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatLevelLabel(level: Pick<StructureSvgLevel, "name" | "verticalIndex">): string {
  const depth = level.verticalIndex > 0 ? `+${level.verticalIndex}` : `${level.verticalIndex}`;
  return `Nível ${depth} · ${level.name}`;
}

/** One tile size shared by every level so the sheet stays proportional and within the pixel budget. */
export function getStructureExportTileSize(levels: readonly StructureSvgLevel[]): number {
  const tileCount = levels.reduce((sum, level) => sum + level.dungeon.width * level.dungeon.height, 0);
  const budgetTile = Math.sqrt((MAX_SHEET_PIXELS * 0.8) / Math.max(1, tileCount));
  return Math.max(
    1,
    Math.min(16, budgetTile, ...levels.map((level) => getExportTileSize(level.dungeon))),
  );
}

/**
 * Single sheet with every level from top to bottom, each labeled with its depth, and the vertical
 * connections drawn as lettered markers joined by lines that run through a right-hand gutter.
 */
export function createDungeonStructureSvg(
  levels: readonly StructureSvgLevel[],
  connections: readonly VerticalConnection[],
  title = "Estrutura multinível",
): DungeonStructureSvg {
  const ordered = [...levels].sort((first, second) => second.verticalIndex - first.verticalIndex);
  const tileSize = getStructureExportTileSize(ordered);
  const contents = ordered.map((level) => createDungeonSvgContent(level.dungeon, tileSize));
  const mapWidth = Math.max(...contents.map((content) => content.width), 240);
  const gutter = 28 + connections.length * 12;
  const sheetWidth = MARGIN * 2 + mapWidth + gutter;

  const panelTops: number[] = [];
  let cursorY = MARGIN + TITLE_HEIGHT;
  for (const content of contents) {
    panelTops.push(cursorY);
    cursorY += PANEL_HEADER_HEIGHT + content.height + PANEL_GAP;
  }
  const legendTop = cursorY;
  const legendHeight = connections.length > 0 ? 34 + connections.length * LEGEND_ROW_HEIGHT : 0;
  const sheetHeight = legendTop + legendHeight + MARGIN;

  const indexByLevelId = new Map(ordered.map((level, index) => [level.id, index]));
  const markerPoint = (levelId: string, position: { x: number; y: number }) => {
    const index = indexByLevelId.get(levelId);
    if (index === undefined) return undefined;
    return {
      x: MARGIN + (position.x + 0.5) * tileSize,
      y: panelTops[index] + PANEL_HEADER_HEIGHT + (position.y + 0.5) * tileSize,
    };
  };

  const parts: string[] = [
    `<rect width="${sheetWidth}" height="${sheetHeight}" fill="#10151d"/>`,
    `<text x="${MARGIN}" y="${MARGIN + 18}" fill="#f0e9dc" font-family="DM Sans, sans-serif" font-size="20" font-weight="600">${escapeXml(title)}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 38}" fill="#9aa8b9" font-family="DM Mono, monospace" font-size="11">${ordered.length} níveis · ${connections.length} conexões verticais · do mais alto ao mais profundo</text>`,
  ];

  ordered.forEach((level, index) => {
    const top = panelTops[index];
    const content = contents[index];
    const flags = [level.isSecret ? "secreto" : "", level.isOptional ? "opcional" : ""].filter(Boolean).join(" · ");
    parts.push(
      `<rect x="${MARGIN}" y="${top}" width="${content.width}" height="${PANEL_HEADER_HEIGHT - 4}" fill="#171e28" stroke="#303c4b"/>`,
      `<text x="${MARGIN + 12}" y="${top + 21}" fill="#d9b46c" font-family="DM Mono, monospace" font-size="13" font-weight="600">${escapeXml(formatLevelLabel(level))}</text>`,
      `<text x="${MARGIN + content.width - 12}" y="${top + 21}" fill="#9aa8b9" font-family="DM Mono, monospace" font-size="11" text-anchor="end">${level.dungeon.width}×${level.dungeon.height} · ${level.dungeon.roomDetails.length} salas${flags ? ` · ${escapeXml(flags)}` : ""}</text>`,
      `<g transform="translate(${MARGIN} ${top + PANEL_HEADER_HEIGHT})">${content.body}</g>`,
      `<rect x="${MARGIN}" y="${top + PANEL_HEADER_HEIGHT}" width="${content.width}" height="${content.height}" fill="none" stroke="#303c4b"/>`,
    );
  });

  const markerRadius = Math.max(7, Math.min(11, tileSize * 0.8));
  const markers: string[] = [];
  const legendRows: string[] = [];
  connections.forEach((connection, index) => {
    const from = markerPoint(connection.sourceLevelId, connection.sourcePosition);
    const to = markerPoint(connection.targetLevelId, connection.targetPosition);
    if (!from || !to) return;
    const color = KIND_COLORS[connection.kind];
    const code = `V${index + 1}`;
    const gutterX = MARGIN + mapWidth + 14 + index * 12;
    parts.push(
      `<path d="M ${from.x} ${from.y} H ${gutterX} V ${to.y} H ${to.x}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="6 4" stroke-linejoin="round" opacity="0.8"/>`,
    );
    for (const point of [from, to]) {
      markers.push(
        `<circle cx="${point.x}" cy="${point.y}" r="${markerRadius}" fill="#10151d" stroke="${color}" stroke-width="2"/>`,
        `<text x="${point.x}" y="${point.y}" fill="${color}" font-family="DM Mono, monospace" font-size="${Math.max(7, markerRadius * 0.9)}" font-weight="700" text-anchor="middle" dominant-baseline="central">${code}</text>`,
      );
    }
    const sourceLevel = ordered[indexByLevelId.get(connection.sourceLevelId) ?? 0];
    const targetLevel = ordered[indexByLevelId.get(connection.targetLevelId) ?? 0];
    const rowY = legendTop + 34 + index * LEGEND_ROW_HEIGHT;
    legendRows.push(
      `<circle cx="${MARGIN + 8}" cy="${rowY - 4}" r="6" fill="#10151d" stroke="${color}" stroke-width="2"/>`,
      `<text x="${MARGIN + 24}" y="${rowY}" fill="#f0e9dc" font-family="DM Mono, monospace" font-size="11">${code} · ${escapeXml(VERTICAL_KIND_LABELS[connection.kind])} — ${escapeXml(formatLevelLabel(sourceLevel))} (${connection.sourcePosition.x}, ${connection.sourcePosition.y}) ⇄ ${escapeXml(formatLevelLabel(targetLevel))} (${connection.targetPosition.x}, ${connection.targetPosition.y})</text>`,
    );
  });
  parts.push(...markers);
  if (connections.length > 0) {
    parts.push(
      `<text x="${MARGIN}" y="${legendTop + 12}" fill="#d9b46c" font-family="DM Mono, monospace" font-size="12" font-weight="600">CONEXÕES VERTICAIS</text>`,
      ...legendRows,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}"><title>${escapeXml(title)}</title>${parts.join("")}</svg>`;
  return { svg, width: sheetWidth, height: sheetHeight };
}
