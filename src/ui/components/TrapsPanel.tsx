import type { DungeonParameters, TrapCategory } from "../../dungeon";
import { TRAP_CATEGORY_LABELS, TRAP_CATEGORY_ORDER } from "../../dungeon";
import { RangeControl } from "./RangeControl";

interface TrapsPanelProps {
  parameters: DungeonParameters;
  updateTrapCategoryFrequency: (key: TrapCategory, value: number) => void;
}

export function TrapsPanel({ parameters, updateTrapCategoryFrequency }: TrapsPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE ARMADILHAS</span></div>
      <p className="parameter-description">Pesos relativos de cada categoria; o total permanece em 100%.</p>
      <div className="range-control-list">
      {TRAP_CATEGORY_ORDER.map((key) => {
        const value = parameters.trapCategoryDistributionEnabled ? parameters.trapCategoryWeights[key] : 0;
        return (
          <RangeControl
            key={key}
            id={`parameter-trapCategory-${key}`}
            label={TRAP_CATEGORY_LABELS[key]}
            value={value}
            min={0}
            max={100}
            step={1}
            formatValue={(amount) => `${amount}%`}
            onChange={(amount) => updateTrapCategoryFrequency(key, amount)}
          />
        );
      })}
      </div>
    </>
  );
}