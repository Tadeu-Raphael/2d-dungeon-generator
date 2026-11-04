import {
  CAVE_BREACH_TILE,
  CAVE_CONNECTION_WALL_TILE,
  CAVE_LAVA_FALL_TILE,
  CAVE_LAVA_VENT_TILE,
  CAVE_SPRING_TILE,
  CAVE_TILE,
  CAVE_WATERFALL_TILE,
  CAVE_WATER_TILE,
  DOOR_TILE,
  ELEVATED_FLOOR_TILE,
  EXTERIOR_CONNECTION_TILE,
  EXTERIOR_ENTRANCE_TILE,
  LAVA_TILE,
  PILLAR_TILE,
  ROOM_STAIRS_TILE,
  SECRET_DOOR_TILE,
  STAIRS_DOWN_TILE,
  STAIRS_UP_TILE,
  TRAP_DEFINITIONS,
  TRAP_TYPES,
  WATER_TILE,
  getNumberedCorridorTraps,
} from "../dungeon";
import type { Dungeon, NumberedCorridorTrap, Tile, TrapCategory, TrapType } from "../dungeon";
import { ROOM_TYPE_CATEGORIES } from "../roomTypes";
import {
  CAVE_LAVA_TILES,
  CAVE_WATER_TILES,
  TRAP_CATEGORY_COLORS,
  createDungeonTileCanvas,
  createRoomCategoryGrid,
  getRoomCategory,
  getTileColor,
  isOpenCaveConnection,
} from "./dungeonTileSemantics";

const EXPORT_TILE_SIZE = 16;
const MAX_EXPORT_PIXELS = 16_000_000;
const RASTER_SVG_TILE_THRESHOLD = 50_000;

export function getExportTileSize(dungeon: Dungeon): number {
  const tileCount = dungeon.width * dungeon.height;
  return Math.min(EXPORT_TILE_SIZE, Math.sqrt(MAX_EXPORT_PIXELS / tileCount));
}

function createTrapSvgFeature(trapType: TrapType, tileX: number, tileY: number, tileSize: number): string {
  const [red, green, blue] = getTileColor(TRAP_DEFINITIONS[trapType].tile);
  const glyphs: Partial<Record<TrapType, string>> = {
    hiddenPit: '<circle cx=".5" cy=".5" r=".22" fill="#080c10" stroke="#f0c46d" stroke-width=".07"/><path d="M.36 .36L.64 .64" stroke="#d1d1c5" stroke-width=".045"/>',
    spikedPit: '<circle cx=".5" cy=".5" r=".23" fill="#080c10" stroke="#e36b48" stroke-width=".06"/><path d="M.5 .5V.27M.5 .5V.73M.5 .5H.27M.5 .5H.73" stroke="#d1d1c5" stroke-width=".07"/>',
    falseFloor: '<path d="M.22 .24L.5 .5L.77 .76M.5 .5L.62 .31L.76 .37M.5 .5L.42 .76" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    wallBlades: '<path d="M.24 .5H.43M.76 .5H.57" stroke="#e36b48" stroke-width=".08"/><path d="M.37 .43L.45 .5L.37 .57M.63 .43L.55 .5L.63 .57" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    pendulumBlade: '<path d="M.5 .22L.67 .53" stroke="#d1d1c5" stroke-width=".07"/><circle cx=".5" cy=".2" r=".06" fill="#f0c46d"/><path d="M.58 .49L.76 .59L.56 .64Z" fill="#e36b48"/>',
    spinningBlades: '<circle cx=".5" cy=".5" r=".08" fill="#f0c46d"/><path d="M.29 .29L.71 .71M.29 .71L.71 .29" stroke="#d1d1c5" stroke-width=".09"/>',
    poisonDarts: '<path d="M.25 .34H.72M.25 .5H.72M.25 .66H.72M.63 .27L.72 .34L.63 .41M.63 .43L.72 .5L.63 .57M.63 .59L.72 .66L.63 .73" fill="none" stroke="#8bd17c" stroke-width=".06"/>',
    wallArrows: '<path d="M.25 .5H.72M.63 .41L.72 .5L.63 .59" fill="none" stroke="#f0c46d" stroke-width=".08"/><rect x=".18" y=".39" width=".08" height=".22" fill="#87939b"/>',
    hiddenHarpoons: '<path d="M.22 .5H.62L.77 .37M.62 .5L.75 .63M.25 .36V.64" fill="none" stroke="#d1d1c5" stroke-width=".07"/>',
    ceilingPress: '<rect x=".24" y=".2" width=".52" height=".15" fill="#9da4a5"/><path d="M.39 .42V.7M.61 .42V.7M.34 .62L.39 .7L.44 .62M.56 .62L.61 .7L.66 .62" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    crushingWalls: '<rect x=".22" y=".28" width=".13" height=".44" fill="#9da4a5"/><rect x=".65" y=".28" width=".13" height=".44" fill="#9da4a5"/><path d="M.4 .5H.49M.6 .5H.51M.44 .44L.5 .5L.44 .56M.56 .44L.5 .5L.56 .56" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    guillotineDoor: '<path d="M.28 .24H.72M.5 .25V.57M.38 .58L.5 .73L.62 .58" fill="none" stroke="#d1d1c5" stroke-width=".08"/><path d="M.5 .31V.51M.45 .45L.5 .51L.55 .45" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    retractableStairs: '<path d="M.25 .65H.39V.55H.52V.45H.65M.72 .3V.66M.66 .58L.72 .66L.78 .58" fill="none" stroke="#f0c46d" stroke-width=".07"/>',
    destructibleBridge: '<path d="M.22 .34H.45M.55 .34H.78M.22 .5H.45M.55 .5H.78M.22 .66H.45M.55 .66H.78M.46 .29L.55 .45L.47 .54L.56 .72" fill="none" stroke="#d1d1c5" stroke-width=".06"/><path d="M.46 .29L.55 .45L.47 .54L.56 .72" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    grindingGears: '<circle cx=".4" cy=".5" r=".16" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".62" cy=".5" r=".16" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".4" cy=".5" r=".04" fill="#d1d1c5"/><circle cx=".62" cy=".5" r=".04" fill="#d1d1c5"/><path d="M.4 .28V.34M.4 .66V.72M.62 .28V.34M.62 .66V.72" stroke="#d1d1c5" stroke-width=".06"/>',
    capturingChains: '<ellipse cx=".34" cy=".5" rx=".07" ry=".19" fill="none" stroke="#f0c46d" stroke-width=".06"/><ellipse cx=".5" cy=".5" rx=".07" ry=".19" fill="none" stroke="#d1d1c5" stroke-width=".06"/><ellipse cx=".66" cy=".5" rx=".07" ry=".19" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    droppingCage: '<path d="M.28 .34H.72V.72H.28ZM.5 .2V.34M.37 .36V.7M.5 .36V.7M.63 .36V.7" fill="none" stroke="#f0c46d" stroke-width=".06"/>',
    counterweightTrapdoor: '<rect x=".29" y=".37" width=".34" height=".34" fill="none" stroke="#f0c46d" stroke-width=".07"/><circle cx=".72" cy=".31" r=".09" fill="#e36b48"/><path d="M.68 .37L.59 .5H.5M.5 .51V.64M.45 .59L.5 .65L.55 .59" fill="none" stroke="#d1d1c5" stroke-width=".06"/>',
    floodedRoom: '<rect x=".23" y=".22" width=".54" height=".56" fill="none" stroke="#78c7e2" stroke-width=".06"/><path d="M.28 .47Q.36 .4 .44 .47T.6 .47T.76 .47M.28 .61Q.36 .54 .44 .61T.6 .61T.76 .61" fill="none" stroke="#a9e3f2" stroke-width=".06"/>',
    floodedCorridor: '<path d="M.23 .36Q.31 .29 .39 .36T.55 .36T.71 .36M.23 .5Q.31 .43 .39 .5T.55 .5T.71 .5M.23 .64Q.31 .57 .39 .64T.55 .64T.71 .64M.3 .76H.7M.63 .69L.7 .76L.63 .83" fill="none" stroke="#78c7e2" stroke-width=".06"/>',
    vacuumChamber: '<circle cx=".5" cy=".5" r=".2" fill="none" stroke="#b2b9e8" stroke-width=".06"/><path d="M.23 .5H.39M.77 .5H.61M.5 .23V.39M.5 .77V.61M.34 .45L.39 .5L.34 .55M.66 .45L.61 .5L.66 .55M.45 .34L.5 .39L.55 .34M.45 .66L.5 .61L.55 .66" fill="none" stroke="#b2b9e8" stroke-width=".05"/>',
    poisonGas: '<circle cx=".35" cy=".56" r=".13" fill="#8bd17c"/><circle cx=".5" cy=".42" r=".17" fill="#8bd17c"/><circle cx=".66" cy=".56" r=".12" fill="#8bd17c"/><circle cx=".32" cy=".29" r=".035" fill="#d6ef8d"/><circle cx=".7" cy=".3" r=".04" fill="#d6ef8d"/>',
    hallucinogenicGas: '<path d="M.22 .5Q.5 .2 .78 .5Q.5 .8 .22 .5Z" fill="none" stroke="#d7a4e8" stroke-width=".06"/><circle cx=".5" cy=".5" r=".11" fill="#a968cf"/><circle cx=".5" cy=".5" r=".04" fill="#f0c46d"/><path d="M.29 .28Q.42 .18 .53 .25M.49 .74Q.62 .82 .73 .7" fill="none" stroke="#d7a4e8" stroke-width=".05"/>',
    corrosiveCloud: '<circle cx=".35" cy=".5" r=".12" fill="none" stroke="#d0e879" stroke-width=".06"/><circle cx=".5" cy=".42" r=".16" fill="none" stroke="#d0e879" stroke-width=".06"/><circle cx=".66" cy=".5" r=".11" fill="none" stroke="#d0e879" stroke-width=".06"/><path d="M.35 .66L.31 .74M.5 .64L.46 .75M.65 .65L.61 .74" stroke="#d0e879" stroke-width=".06"/>',
    slipperyFloor: '<path d="M.22 .4H.4L.34 .33M.78 .58H.6L.66 .65M.28 .72H.7M.62 .66L.7 .72L.62 .78" fill="none" stroke="#a9e3f2" stroke-width=".07"/>',
    thinIceFloor: '<rect x=".23" y=".23" width=".54" height=".54" fill="none" stroke="#a9e3f2" stroke-width=".05"/><path d="M.51 .24L.44 .45L.54 .51L.39 .75M.53 .51L.72 .62" fill="none" stroke="#e4f8ff" stroke-width=".06"/>',
    fallingRocks: '<circle cx=".33" cy=".27" r=".07" fill="#b5a68e"/><circle cx=".5" cy=".23" r=".09" fill="#b5a68e"/><circle cx=".68" cy=".28" r=".06" fill="#b5a68e"/><path d="M.33 .38V.69M.5 .37V.72M.68 .38V.66M.28 .63L.33 .7L.38 .63M.45 .66L.5 .73L.55 .66M.63 .6L.68 .67L.73 .6" fill="none" stroke="#e36b48" stroke-width=".06"/>',
    caveIn: '<path d="M.22 .72L.36 .48L.47 .58L.58 .36L.78 .72Z" fill="#8b7967" stroke="#d1d1c5" stroke-width=".04"/><path d="M.49 .27L.55 .39L.46 .49L.53 .56" fill="none" stroke="#e36b48" stroke-width=".07"/>',
    quicksand: '<ellipse cx=".5" cy=".52" rx=".26" ry=".17" fill="none" stroke="#e1c17d" stroke-width=".06"/><ellipse cx=".5" cy=".52" rx=".14" ry=".08" fill="none" stroke="#d2a95b" stroke-width=".05"/><path d="M.5 .22V.39M.45 .33L.5 .39L.55 .33" fill="none" stroke="#e1c17d" stroke-width=".06"/>',
    undergroundCurrent: '<path d="M.22 .35H.76M.68 .28L.76 .35L.68 .42M.22 .5H.76M.68 .43L.76 .5L.68 .57M.22 .65H.76M.68 .58L.76 .65L.68 .72" fill="none" stroke="#a9e3f2" stroke-width=".06"/>',
    overheatedChamber: '<path d="M.32 .76L.39 .58L.44 .65L.5 .37L.56 .55L.62 .46L.68 .76M.42 .76L.47 .65L.5 .7L.54 .61L.59 .76" fill="none" stroke="#ff9b45" stroke-width=".07"/>',
    freezingChamber: '<path d="M.5 .23V.77M.27 .37L.73 .63M.27 .63L.73 .37M.43 .3L.5 .37L.57 .3M.43 .7L.5 .63L.57 .7M.3 .43L.37 .37L.36 .29M.7 .57L.63 .63L.64 .71M.3 .57L.37 .63L.36 .71M.7 .43L.63 .37L.64 .29" fill="none" stroke="#bcecff" stroke-width=".05"/>',
    electrifiedFloor: '<rect x=".23" y=".28" width=".54" height=".44" fill="none" stroke="#e9d76d" stroke-width=".05"/><path d="M.55 .28L.42 .49H.53L.45 .72L.65 .45H.54Z" fill="#fff29a" stroke="#fff29a" stroke-width=".04"/>',
    ceilingSpikes: '<path d="M.23 .28H.77M.31 .29L.39 .55L.47 .29M.46 .29L.54 .55L.62 .29M.61 .29L.69 .55L.77 .29M.5 .61V.78M.45 .72L.5 .78L.55 .72" fill="none" stroke="#e36b48" stroke-width=".06"/>',
    lavaFloor: '<path d="M.22 .35H.78M.32 .35V.55M.5 .35V.55M.68 .35V.55M.22 .64Q.31 .55 .4 .64T.58 .64T.76 .64M.22 .75Q.31 .66 .4 .75T.58 .75T.76 .75" fill="none" stroke="#ff9b45" stroke-width=".06"/>',
    explosiveCrystals: '<path d="M.5 .23L.61 .45L.56 .72L.43 .72L.38 .45ZM.3 .38L.38 .47L.34 .62L.26 .61ZM.7 .37L.75 .47L.7 .62L.62 .53Z" fill="#db9ce8" stroke="#f0c46d" stroke-width=".045"/><path d="M.22 .22L.29 .29M.71 .22L.78 .29M.2 .75L.27 .69M.73 .69L.8 .75" stroke="#f0c46d" stroke-width=".055"/>',
  };
  const category = TRAP_DEFINITIONS[trapType].category;
  const color = `rgb(${TRAP_CATEGORY_COLORS[category].join(",")})`;
  const categoryGlyphs: Record<TrapCategory, string> = {
    mechanical: '<path d="M.5 .27V.73M.27 .5H.73M.34 .34L.66 .66M.34 .66L.66 .34" stroke="CURRENT" stroke-width=".06"/>',
    environmental: '<path d="M.5 .76V.27M.5 .48L.34 .34M.5 .57L.67 .41" fill="none" stroke="CURRENT" stroke-width=".07"/>',
    magical: '<circle cx=".5" cy=".5" r=".22" fill="none" stroke="CURRENT" stroke-width=".05"/><path d="M.5 .26L.57 .44L.75 .5L.57 .56L.5 .74L.43 .56L.25 .5L.43 .44Z" fill="none" stroke="CURRENT" stroke-width=".05"/>',
    capture: '<path d="M.32 .25V.75M.5 .25V.75M.68 .25V.75M.25 .35H.75M.25 .5H.75M.25 .65H.75" stroke="CURRENT" stroke-width=".045"/>',
    deception: '<path d="M.22 .5Q.5 .22 .78 .5Q.5 .78 .22 .5Z" fill="none" stroke="CURRENT" stroke-width=".055"/><circle cx=".5" cy=".5" r=".08" fill="CURRENT"/>',
    motion: '<circle cx=".5" cy=".5" r=".06" fill="CURRENT"/><path d="M.5 .22V.36M.5 .64V.78M.22 .5H.36M.64 .5H.78" stroke="CURRENT" stroke-width=".06"/>',
    biological: '<path d="M.5 .76V.25M.5 .48L.3 .31M.5 .58L.7 .4" fill="none" stroke="CURRENT" stroke-width=".07"/>',
    combat: '<path d="M.3 .3L.7 .7M.3 .7L.7 .3" stroke="CURRENT" stroke-width=".09"/>',
    complex: '<circle cx=".5" cy=".5" r=".22" fill="none" stroke="CURRENT" stroke-width=".05"/><circle cx=".5" cy=".5" r=".07" fill="CURRENT"/><path d="M.5 .2V.28M.5 .72V.8M.2 .5H.28M.72 .5H.8" stroke="CURRENT" stroke-width=".05"/>',
  };
  const glyph = glyphs[trapType] ?? categoryGlyphs[category].replace(/CURRENT/g, color);
  return `<g transform="translate(${tileX} ${tileY}) scale(${tileSize})" stroke-linecap="round" stroke-linejoin="round"><rect width="1" height="1" fill="rgb(${red},${green},${blue})"/><rect x=".16" y=".16" width=".68" height=".68" rx=".07" fill="#1c2329" stroke="#9b8055" stroke-width=".05"/>${glyph}</g>`;
}

function createCaveLiquidSvgFeature(tile: Tile, tileX: number, tileY: number, tileSize: number): string {
  const isWater = CAVE_WATER_TILES.has(tile);
  const fill = isWater ? "#287fa6" : "#d44823";
  const border = isWater ? "#78c7e2" : "#ff9b45";
  const mark = tile === CAVE_WATERFALL_TILE || tile === CAVE_LAVA_FALL_TILE
    ? `<path d="M.32 .16L.26 .44L.38 .7M.5 .16L.44 .44L.56 .7M.68 .16L.62 .44L.74 .7" fill="none" stroke="${isWater ? "#b9eff8" : "#ffd27a"}" stroke-width=".07"/>`
    : tile === CAVE_SPRING_TILE || tile === CAVE_LAVA_VENT_TILE
      ? `<circle cx=".5" cy=".52" r=".17" fill="${isWater ? "#c8f4fa" : "#ffd27a"}" stroke="#fff0b0" stroke-width=".05"/><path d="M.5 .32V.16M.3 .45L.2 .37M.7 .45L.8 .37" fill="none" stroke="${isWater ? "#d9faff" : "#ffb14d"}" stroke-width=".05"/>`
      : tile === CAVE_WATER_TILE
        ? `<path d="M.24 .38H.76M.3 .62Q.4 .54 .5 .62T.7 .62" fill="none" stroke="#a9e3f2" stroke-width=".05"/>`
        : `<path d="M.2 .68L.4 .36L.58 .62L.8 .28" fill="none" stroke="#ffd27a" stroke-width=".08"/>`;
  return `<g transform="translate(${tileX} ${tileY}) scale(${tileSize})" stroke-linecap="round" stroke-linejoin="round"><rect x=".08" y=".08" width=".84" height=".84" fill="${fill}" stroke="${border}" stroke-width=".05"/>${mark}</g>`;
}

function createCorridorTrapNumberSvgLabel(
  trap: NumberedCorridorTrap,
  tileSize: number,
): string {
  const centerX = (trap.x + 0.5) * tileSize;
  const centerY = (trap.y + 0.5) * tileSize;
  const badgeWidth = Math.max(14, Math.min(20, tileSize * 0.9));
  const badgeHeight = Math.max(12, Math.min(16, tileSize * 0.85));
  return [
    `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight * 0.25}" fill="#8e4032" stroke="#f0a36f" stroke-width="${Math.max(1, tileSize * 0.06)}"/>`,
    `<text x="${centerX}" y="${centerY}" fill="#fff1df" font-family="DM Mono, monospace" font-size="${Math.min(9, Math.max(7, tileSize * 0.5))}" font-weight="600" text-anchor="middle" dominant-baseline="central">${trap.number.toString().padStart(2, "0")}</text>`,
  ].join("");
}

export function createDungeonSvg(dungeon: Dungeon): string {
  const tileSize = getExportTileSize(dungeon);
  const inset = Math.max(1, tileSize * 0.09);
  const width = dungeon.width * tileSize;
  const height = dungeon.height * tileSize;
  const roomCategories = createRoomCategoryGrid(dungeon);

  if (dungeon.width * dungeon.height > RASTER_SVG_TILE_THRESHOLD) {
    const tileImage = createDungeonTileCanvas(dungeon, true, true, roomCategories).toDataURL("image/png");
    const roomLabels = tileSize >= 8
      ? dungeon.roomDetails.map((room) => {
        const centerX = (room.x + room.width / 2) * tileSize;
        const centerY = (room.y + room.height / 2) * tileSize;
        const badgeWidth = Math.min(20, tileSize * 1.5);
        const badgeHeight = Math.min(16, tileSize * 1.4);
        const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
        return [
          `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${category.color}"/>`,
          `<text x="${centerX}" y="${centerY}" fill="#10141b" font-family="DM Mono, monospace" font-size="${Math.min(9, tileSize * 0.75)}" text-anchor="middle" dominant-baseline="central">${room.number.toString().padStart(2, "0")}</text>`,
        ].join("");
      }).join("")
      : "";
    const corridorTrapLabels = tileSize >= 8
      ? getNumberedCorridorTraps(dungeon).map((trap) => createCorridorTrapNumberSvgLabel(trap, tileSize)).join("")
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Mapa de masmorra</title><image width="${width}" height="${height}" href="${tileImage}" image-rendering="pixelated"/>${roomLabels}${corridorTrapLabels}</svg>`;
  }

  const elements = [`<rect width="${width}" height="${height}" fill="#0b1017"/>`];

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const tile = dungeon.tiles[y][x];
      const tileX = x * tileSize;
      const tileY = y * tileSize;
      const category = getRoomCategory(roomCategories, dungeon.width, x, y);
      const roomFloorColor = category ? ROOM_TYPE_CATEGORIES[category].color : "#d1b987";
      const rect = (rx: number, ry: number, rw: number, rh: number, fill: string, extra = "") =>
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" ${extra}/>`;

      if (tile === 0) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#17212c"));
      } else if (tile === 2) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#a9824d"));
      } else if (tile === DOOR_TILE) {
        const doorX = tileX + tileSize * 0.18;
        const doorY = tileY + tileSize * 0.12;
        const doorWidth = tileSize * 0.64;
        const doorHeight = tileSize * 0.76;
        elements.push(rect(
          doorX,
          doorY,
          doorWidth,
          doorHeight,
          "#775334",
          `stroke="#d6aa66" stroke-width="${Math.max(0.7, tileSize * 0.08)}"`,
        ));
        elements.push(`<circle cx="${doorX + doorWidth * 0.72}" cy="${doorY + doorHeight * 0.52}" r="${Math.max(0.7, tileSize * 0.06)}" fill="#f0cf87"/>`);
      } else if (tile === SECRET_DOOR_TILE) {
        const doorX = tileX + tileSize * 0.12;
        const doorY = tileY + tileSize * 0.12;
        const doorSize = tileSize * 0.76;
        elements.push(rect(
          doorX,
          doorY,
          doorSize,
          doorSize,
          "#17212c",
          `stroke="#596671" stroke-width="${Math.max(0.7, tileSize * 0.06)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.5} ${tileY + tileSize * 0.28} V ${tileY + tileSize * 0.72}" stroke="#87919a" stroke-width="${Math.max(0.7, tileSize * 0.06)}"/>`);
      } else if (tile === EXTERIOR_ENTRANCE_TILE) {
        elements.push(rect(
          tileX + tileSize * 0.2,
          tileY + tileSize * 0.14,
          tileSize * 0.6,
          tileSize * 0.72,
          "#775334",
          `stroke="#f0cf87" stroke-width="${Math.max(0.8, tileSize * 0.09)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.5} ${tileY + tileSize * 0.3} V ${tileY + tileSize * 0.7}" stroke="#f0cf87" stroke-width="${Math.max(0.7, tileSize * 0.07)}"/>`);
      } else if (tile === EXTERIOR_CONNECTION_TILE) {
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.31}" fill="#17212c" stroke="#c5e1c7" stroke-width="${Math.max(0.8, tileSize * 0.1)}"/>`);
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.12}" fill="#c5e1c7"/>`);
      } else if (tile === PILLAR_TILE) {
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.34}" fill="#625d50" stroke="#292b2a" stroke-width="${Math.max(0.8, tileSize * 0.08)}"/>`);
        elements.push(`<circle cx="${tileX + tileSize * 0.5}" cy="${tileY + tileSize * 0.5}" r="${tileSize * 0.19}" fill="#c1b49c" stroke="#e2d3b6" stroke-width="${Math.max(0.6, tileSize * 0.05)}"/>`);
      } else if (tile === ELEVATED_FLOOR_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, category ? roomFloorColor : "#d5b882"));
        elements.push(rect(
          tileX + tileSize * 0.16,
          tileY + tileSize * 0.16,
          tileSize * 0.68,
          tileSize * 0.68,
          "none",
          `stroke="#f0cf87" stroke-width="${Math.max(0.6, tileSize * 0.07)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.38} H ${tileX + tileSize * 0.76} M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.62} H ${tileX + tileSize * 0.76}" fill="none" stroke="#80643e" stroke-width="${Math.max(0.6, tileSize * 0.06)}"/>`);
      } else if (tile === ROOM_STAIRS_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#a9824d"));
        elements.push(`<path d="M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.28} H ${tileX + tileSize * 0.82} M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.5} H ${tileX + tileSize * 0.82} M ${tileX + tileSize * 0.18} ${tileY + tileSize * 0.72} H ${tileX + tileSize * 0.82}" stroke="#17212c" stroke-width="${Math.max(0.7, tileSize * 0.1)}"/>`);
      } else if (tile === CAVE_TILE) {
        const fill = isOpenCaveConnection(dungeon, roomCategories, x, y) ? "#879a70" : "#4c6953";
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, fill));
      } else if (tile === CAVE_CONNECTION_WALL_TILE) {
        elements.push(rect(
          tileX + tileSize * 0.12,
          tileY + tileSize * 0.12,
          tileSize * 0.76,
          tileSize * 0.76,
          "#725631",
          `stroke="#f0c574" stroke-width="${Math.max(0.8, tileSize * 0.08)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.52} ${tileY + tileSize * 0.2} L ${tileX + tileSize * 0.42} ${tileY + tileSize * 0.42} L ${tileX + tileSize * 0.56} ${tileY + tileSize * 0.56} L ${tileX + tileSize * 0.43} ${tileY + tileSize * 0.8}" fill="none" stroke="#f5d992" stroke-width="${Math.max(0.7, tileSize * 0.07)}"/>`);
      } else if (tile === CAVE_BREACH_TILE) {
        elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, "#998058"));
        elements.push(`<path d="M ${tileX + tileSize * 0.16} ${tileY + tileSize * 0.7}L ${tileX + tileSize * 0.26} ${tileY + tileSize * 0.55}L ${tileX + tileSize * 0.44} ${tileY + tileSize * 0.75}L ${tileX + tileSize * 0.52} ${tileY + tileSize * 0.48}L ${tileX + tileSize * 0.82} ${tileY + tileSize * 0.72}" fill="#806b49" stroke="#ead4a6" stroke-width="${Math.max(0.6, tileSize * 0.04)}"/>`);
      } else if (CAVE_WATER_TILES.has(tile) || CAVE_LAVA_TILES.has(tile)) {
        elements.push(createCaveLiquidSvgFeature(tile, tileX, tileY, tileSize));
      } else if (tile === WATER_TILE) {
        const waterInset = tileSize * 0.08;
        elements.push(rect(
          tileX + waterInset,
          tileY + waterInset,
          tileSize - waterInset,
          tileSize - waterInset,
          "#287fa6",
          `stroke="#78c7e2" stroke-width="${Math.max(0.6, tileSize * 0.05)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.24} ${tileY + tileSize * 0.38} H ${tileX + tileSize * 0.76}" stroke="#a9e3f2" stroke-width="${Math.max(0.6, tileSize * 0.05)}"/>`);
      } else if (tile === LAVA_TILE) {
        const lavaInset = tileSize * 0.08;
        elements.push(rect(
          tileX + lavaInset,
          tileY + lavaInset,
          tileSize - lavaInset,
          tileSize - lavaInset,
          "#d44823",
          `stroke="#ff9b45" stroke-width="${Math.max(0.6, tileSize * 0.06)}"`,
        ));
        elements.push(`<path d="M ${tileX + tileSize * 0.2} ${tileY + tileSize * 0.68} L ${tileX + tileSize * 0.4} ${tileY + tileSize * 0.36} L ${tileX + tileSize * 0.58} ${tileY + tileSize * 0.62} L ${tileX + tileSize * 0.8} ${tileY + tileSize * 0.28}" fill="none" stroke="#ffd27a" stroke-width="${Math.max(0.6, tileSize * 0.08)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else if (tile === STAIRS_UP_TILE || tile === STAIRS_DOWN_TILE) {
        elements.push(rect(tileX + inset, tileY + inset, tileSize - inset, tileSize - inset, "#c7a86c"));
        const isAscending = tile === STAIRS_UP_TILE;
        const treads = [0.26, 0.42, 0.58, 0.74]
          .map((lineY) => `M ${tileX + tileSize * 0.12} ${tileY + tileSize * lineY} H ${tileX + tileSize * 0.5}`)
          .join(" ");
        const shaftStartY = isAscending ? 0.76 : 0.24;
        const shaftEndY = isAscending ? 0.24 : 0.76;
        const arrowBaseY = isAscending ? 0.44 : 0.56;
        const arrow = `M ${tileX + tileSize * 0.76} ${tileY + tileSize * shaftStartY} V ${tileY + tileSize * shaftEndY} M ${tileX + tileSize * 0.58} ${tileY + tileSize * arrowBaseY} L ${tileX + tileSize * 0.76} ${tileY + tileSize * shaftEndY} L ${tileX + tileSize * 0.94} ${tileY + tileSize * arrowBaseY}`;
        elements.push(
          `<path d="${treads} ${arrow}" fill="none" stroke="#17212c" stroke-width="${Math.max(0.8, tileSize * 0.1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      } else {
        const trapType = TRAP_TYPES.find((type) => TRAP_DEFINITIONS[type].tile === tile);
        if (trapType) {
          elements.push(createTrapSvgFeature(trapType, tileX, tileY, tileSize));
        } else {
          elements.push(rect(tileX, tileY, tileSize - inset, tileSize - inset, roomFloorColor));
        }
      }
    }
  }

  for (const room of dungeon.roomDetails) {
    const centerX = (room.x + room.width / 2) * tileSize;
    const centerY = (room.y + room.height / 2) * tileSize;
    const badgeWidth = Math.max(14, Math.min(20, tileSize * 1.1));
    const badgeHeight = Math.max(12, Math.min(16, tileSize * 0.95));
    const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
    elements.push(
      `<rect x="${centerX - badgeWidth / 2}" y="${centerY - badgeHeight / 2}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${category.color}"/>`,
    );
    elements.push(
      `<text x="${centerX}" y="${centerY}" fill="#10141b" font-family="DM Mono, monospace" font-size="8" text-anchor="middle" dominant-baseline="central">${room.number.toString().padStart(2, "0")}</text>`,
    );
  }
  for (const trap of getNumberedCorridorTraps(dungeon)) {
    elements.push(createCorridorTrapNumberSvgLabel(trap, tileSize));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Mapa de masmorra</title>${elements.join("")}</svg>`;
}
