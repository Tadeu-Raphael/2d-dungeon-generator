import { useState } from "react";
import type { Dungeon } from "../../dungeon";
import type { VerticalConnection } from "../../dungeonStructure";
import { createDungeonSvg, getExportTileSize } from "../../rendering/dungeonSvg";
import { createDungeonStructureSvg } from "../../rendering/dungeonStructureSvg";
import type { StructureSvgLevel } from "../../rendering/dungeonStructureSvg";

export interface DungeonExportStructure {
  levels: readonly StructureSvgLevel[];
  verticalConnections: readonly VerticalConnection[];
  name?: string;
}

interface DungeonExportControlProps {
  dungeon: Dungeon;
  /** Present for multilevel dungeons: enables a combined export of every level. */
  structure?: DungeonExportStructure;
}

type ExportFormat = "svg" | "png";
type ExportScope = "level" | "all";

interface ExportDocument {
  svg: string;
  width: number;
  height: number;
  filename: string;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createExportDocument(
  dungeon: Dungeon,
  structure: DungeonExportStructure | undefined,
  scope: ExportScope,
): ExportDocument {
  if (scope === "all" && structure && structure.levels.length > 1) {
    const sheet = createDungeonStructureSvg(
      structure.levels,
      structure.verticalConnections,
      structure.name ?? "Estrutura multinível",
    );
    return { ...sheet, filename: `masmorra-multinivel-${structure.levels.length}-niveis` };
  }
  const tileSize = getExportTileSize(dungeon);
  return {
    svg: createDungeonSvg(dungeon),
    width: Math.ceil(dungeon.width * tileSize),
    height: Math.ceil(dungeon.height * tileSize),
    filename: `masmorra-${dungeon.width}x${dungeon.height}`,
  };
}

export function DungeonExportControl({ dungeon, structure }: DungeonExportControlProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const isMultilevel = Boolean(structure && structure.levels.length > 1);

  const exportDungeon = async (format: ExportFormat, scope: ExportScope) => {
    try {
      const exportDocument = createExportDocument(dungeon, structure, scope);
      const svgBlob = new Blob([exportDocument.svg], {
        type: "image/svg+xml;charset=utf-8",
      });
      if (format === "svg") {
        downloadBlob(svgBlob, `${exportDocument.filename}.svg`);
      } else {
        const imageUrl = URL.createObjectURL(svgBlob);
        try {
          const image = new Image();
          image.src = imageUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(exportDocument.width);
          canvas.height = Math.ceil(exportDocument.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a imagem PNG.");
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0);
          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Não foi possível gerar a imagem PNG."));
            }, "image/png");
          });
          downloadBlob(pngBlob, `${exportDocument.filename}.png`);
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      }
      setExportStatus(`${format.toUpperCase()} exportado.`);
      setExportMenuOpen(false);
    } catch (error) {
      console.error(`Não foi possível exportar o mapa em ${format.toUpperCase()}.`, error);
      setExportStatus(`Falha ao exportar ${format.toUpperCase()}.`);
    }
  };

  return (
    <div className="map-export">
      <button
        className="map-control-button export-trigger"
        type="button"
        aria-expanded={exportMenuOpen}
        aria-haspopup="menu"
        onClick={() => setExportMenuOpen((open) => !open)}
      >
        Exportar <span aria-hidden="true">⌄</span>
      </button>
      {exportMenuOpen && (
        <div className="export-menu" role="menu" aria-label="Formato de exportação">
          {isMultilevel && (
            <>
              <button type="button" role="menuitem" onClick={() => void exportDungeon("svg", "all")}>
                SVG · todos os níveis
              </button>
              <button type="button" role="menuitem" onClick={() => void exportDungeon("png", "all")}>
                PNG · todos os níveis
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void exportDungeon("svg", "level")}>
            {isMultilevel ? "SVG · nível atual" : "Baixar SVG"}
          </button>
          <button type="button" role="menuitem" onClick={() => void exportDungeon("png", "level")}>
            {isMultilevel ? "PNG · nível atual" : "Baixar PNG"}
          </button>
        </div>
      )}
      {exportStatus && !exportMenuOpen && <span className="export-status" role="status">{exportStatus}</span>}
    </div>
  );
}
