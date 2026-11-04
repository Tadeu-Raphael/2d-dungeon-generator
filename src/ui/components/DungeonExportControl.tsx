import { useState } from "react";
import type { Dungeon } from "../../dungeon";
import { createDungeonSvg, getExportTileSize } from "../../rendering/dungeonSvg";

interface DungeonExportControlProps {
  dungeon: Dungeon;
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

export function DungeonExportControl({ dungeon }: DungeonExportControlProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const exportDungeon = async (format: "svg" | "png") => {
    const filename = `masmorra-${dungeon.width}x${dungeon.height}`;
    try {
      const svgBlob = new Blob([createDungeonSvg(dungeon)], {
        type: "image/svg+xml;charset=utf-8",
      });
      if (format === "svg") {
        downloadBlob(svgBlob, `${filename}.svg`);
      } else {
        const imageUrl = URL.createObjectURL(svgBlob);
        try {
          const image = new Image();
          image.src = imageUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          const tileSize = getExportTileSize(dungeon);
          canvas.width = Math.ceil(dungeon.width * tileSize);
          canvas.height = Math.ceil(dungeon.height * tileSize);
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
          downloadBlob(pngBlob, `${filename}.png`);
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
          <button type="button" role="menuitem" onClick={() => void exportDungeon("svg")}>
            Baixar SVG
          </button>
          <button type="button" role="menuitem" onClick={() => void exportDungeon("png")}>
            Baixar PNG
          </button>
        </div>
      )}
      {exportStatus && !exportMenuOpen && <span className="export-status" role="status">{exportStatus}</span>}
    </div>
  );
}
