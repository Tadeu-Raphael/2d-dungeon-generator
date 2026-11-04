export interface ParameterPanelProps {
  widthDraft: string;
  heightDraft: string;
  seedDraft: string;
  dimensionDraftError: string | undefined;
  updateDimensionDraft: (key: "width" | "height", value: string) => void;
  commitDimension: (key: "width" | "height") => void;
  updateSeedDraft: (value: string) => void;
  commitSeedDraft: () => void;
}

export function ParameterPanel({
  widthDraft,
  heightDraft,
  seedDraft,
  dimensionDraftError,
  updateDimensionDraft,
  commitDimension,
  updateSeedDraft,
  commitSeedDraft,
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
      <label className="dimension-field seed-field" htmlFor="generator-seed">
        <span>Seed do gerador</span>
        <input
          id="generator-seed"
          type="text"
          value={seedDraft}
          onChange={(event) => updateSeedDraft(event.currentTarget.value)}
          onBlur={commitSeedDraft}
        />
      </label>
      <p className="dimension-hint" id="dimension-hint">
        Largura e altura: 20–1000 tiles; área máxima: 250.000 tiles.
      </p>
      {dimensionDraftError && (
        <p className="generation-notice" role="alert">
          {dimensionDraftError}
        </p>
      )}
    </section>
  );
}
