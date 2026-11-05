import { MAX_DUNGEON_SEED } from "../../dungeon";

export interface ParameterPanelProps {
  widthDraft: string;
  heightDraft: string;
  seedDraft: string;
  dimensionDraftError: string | undefined;
  seedDraftError: string | undefined;
  updateDimensionDraft: (key: "width" | "height", value: string) => void;
  commitDimension: (key: "width" | "height") => void;
  updateSeedDraft: (value: string) => void;
  commitSeedDraft: () => void;
  randomizeSeed: () => void;
}

export function ParameterPanel({
  widthDraft,
  heightDraft,
  seedDraft,
  dimensionDraftError,
  seedDraftError,
  updateDimensionDraft,
  commitDimension,
  updateSeedDraft,
  commitSeedDraft,
  randomizeSeed,
}: ParameterPanelProps) {
  return (
    <section className="parameter-panel">
      <div className="section-heading settings-section-heading">
        <span>DIMENSÕES E SEED</span>
      </div>
      <div className="dimension-fields">
        <label className="dimension-field" htmlFor="map-width">
          <span>Largura tiles</span>
          <input
            id="map-width"
            type="number"
            min={20}
            max={1000}
            step={1}
            value={widthDraft}
            aria-invalid={Boolean(dimensionDraftError)}
            onChange={(event) =>
              updateDimensionDraft("width", event.currentTarget.value)
            }
            onBlur={() => commitDimension("width")}
            aria-describedby="dimension-hint"
          />
        </label>
        <label className="dimension-field" htmlFor="map-height">
          <span>Altura tiles</span>
          <input
            id="map-height"
            type="number"
            min={20}
            max={1000}
            step={1}
            value={heightDraft}
            aria-invalid={Boolean(dimensionDraftError)}
            onChange={(event) =>
              updateDimensionDraft("height", event.currentTarget.value)
            }
            onBlur={() => commitDimension("height")}
            aria-describedby="dimension-hint"
          />
        </label>
      </div>
      <div className="seed-field">
        <label className="dimension-field seed-field-input" htmlFor="generator-seed">
          <span>Seed do gerador</span>
          <input
            id="generator-seed"
            type="number"
            min={0}
            max={MAX_DUNGEON_SEED}
            step={1}
            inputMode="numeric"
            value={seedDraft}
            aria-invalid={Boolean(seedDraftError)}
            aria-describedby={`seed-hint${seedDraftError ? " seed-error" : ""}`}
            onChange={(event) => updateSeedDraft(event.currentTarget.value)}
            onBlur={commitSeedDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitSeedDraft();
            }}
          />
        </label>
        <button
          className="configuration-button configuration-button-secondary seed-randomize-button"
          type="button"
          aria-label="Randomizar seed e gerar outra masmorra"
          onMouseDown={(event) => event.preventDefault()}
          onClick={randomizeSeed}
        >
          Randomizar seed
        </button>
      </div>
      <p className="dimension-hint" id="dimension-hint">
        Largura e altura: 20–1000 tiles; área máxima: 1.000.000 tiles.
      </p>
      {dimensionDraftError && (
        <p className="generation-notice generation-notice-error" role="alert">
          {dimensionDraftError}
        </p>
      )}
      <p className="dimension-hint seed-hint" id="seed-hint">
        Seed entre 0 e {MAX_DUNGEON_SEED.toLocaleString("pt-BR")}. Enter ou saída do campo aplica o valor.
      </p>
      {seedDraftError && (
        <p className="generation-notice generation-notice-error" id="seed-error" role="alert">
          {seedDraftError}
        </p>
      )}
    </section>
  );
}
