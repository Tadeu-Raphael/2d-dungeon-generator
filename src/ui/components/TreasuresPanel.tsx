import type { DungeonParameters, TreasureCategory } from "../../dungeon";
import { TREASURE_CATEGORY_LABELS, TREASURE_CATEGORY_ORDER } from "../../treasures";

interface TreasuresPanelProps {
  parameters: DungeonParameters;
  updateTreasureCategoryFrequency: (key: TreasureCategory, value: number) => void;
}

export function TreasuresPanel({ parameters, updateTreasureCategoryFrequency }: TreasuresPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE TESOUROS</span></div>
      {TREASURE_CATEGORY_ORDER.map((key) => {
        const value = parameters.treasureCategoryDistributionEnabled ? parameters.treasureCategoryWeights[key] : 0;
        return (
          <label className="parameter-control" key={key}>
            <span className="parameter-label"><span>{TREASURE_CATEGORY_LABELS[key]}</span><strong>{value}</strong></span>
            <input id={`parameter-treasureCategory-${key}`} type="range" min={0} max={100} step={1} value={value} onChange={(e) => updateTreasureCategoryFrequency(key, Number(e.currentTarget.value))} aria-label={TREASURE_CATEGORY_LABELS[key]} />
          </label>
        );
      })}
    </>
  );
}