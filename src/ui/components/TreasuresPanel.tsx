import type { DungeonParameters, TreasureCategory } from "../../dungeon";
import { TREASURE_CATEGORY_LABELS, TREASURE_CATEGORY_ORDER } from "../../treasures";
import { RangeControl } from "./RangeControl";

interface TreasuresPanelProps {
  parameters: DungeonParameters;
  updateTreasureCategoryFrequency: (key: TreasureCategory, value: number) => void;
}

export function TreasuresPanel({ parameters, updateTreasureCategoryFrequency }: TreasuresPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE TESOUROS</span></div>
      <p className="parameter-description">Pesos relativos de cada categoria; o total permanece em 100%.</p>
      <div className="range-control-list">
      {TREASURE_CATEGORY_ORDER.map((key) => {
        const value = parameters.treasureCategoryDistributionEnabled ? parameters.treasureCategoryWeights[key] : 0;
        return (
          <RangeControl
            key={key}
            id={`parameter-treasureCategory-${key}`}
            label={TREASURE_CATEGORY_LABELS[key]}
            value={value}
            min={0}
            max={100}
            step={1}
            formatValue={(amount) => `${amount}%`}
            onChange={(amount) => updateTreasureCategoryFrequency(key, amount)}
          />
        );
      })}
      </div>
    </>
  );
}