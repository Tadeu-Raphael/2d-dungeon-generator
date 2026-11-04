import type { DungeonParameters, TrapCategory } from "../../dungeon";
import { TRAP_CATEGORY_LABELS, TRAP_CATEGORY_ORDER } from "../../dungeon";

interface TrapsPanelProps {
  parameters: DungeonParameters;
  updateTrapCategoryFrequency: (key: TrapCategory, value: number) => void;
}

export function TrapsPanel({ parameters, updateTrapCategoryFrequency }: TrapsPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE ARMADILHAS</span></div>
      {TRAP_CATEGORY_ORDER.map((key) => {
        const value = parameters.trapCategoryDistributionEnabled ? parameters.trapCategoryWeights[key] : 0;
        return (
          <label className="parameter-control" key={key}>
            <span className="parameter-label"><span>{TRAP_CATEGORY_LABELS[key]}</span><strong>{value}</strong></span>
            <input id={`parameter-trapCategory-${key}`} type="range" min={0} max={100} step={1} value={value} onChange={(e) => updateTrapCategoryFrequency(key, Number(e.currentTarget.value))} aria-label={TRAP_CATEGORY_LABELS[key]} />
          </label>
        );
      })}
    </>
  );
}