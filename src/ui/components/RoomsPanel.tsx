import type { Dispatch, SetStateAction } from "react";
import type { DungeonParameters } from "../../dungeon";
import { RangeControl } from "./RangeControl";

interface RoomsPanelProps {
  parameters: DungeonParameters;
  setParameters: Dispatch<SetStateAction<DungeonParameters>>;
  corridorControls: Array<{ key: string; label: string; min: number; max: number; step: number; format: (value: number) => string }>;
}

export function RoomsPanel({ parameters, setParameters, corridorControls }: RoomsPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>QUANTIDADE DE SALAS</span></div>
      <RangeControl
        id="parameter-roomCount"
        label="Quantidade de salas"
        value={parameters.roomCount}
        min={4}
        max={24}
        step={1}
        formatValue={(value) => `${value} salas`}
        description="Ajuste a quantidade de ambientes gerados."
        editable
        onChange={(roomCount) => setParameters((current) => ({ ...current, roomCount }))}
      />
      <div className="section-heading settings-section-heading"><span>LARGURA DOS CORREDORES</span></div>
      <div className="range-control-list">
        {corridorControls.map((control) => (
          <RangeControl
            key={control.key}
            id={`parameter-${control.key}`}
            label={control.label}
            value={parameters[control.key as keyof DungeonParameters] as number}
            min={control.min}
            max={control.max}
            step={control.step}
            formatValue={control.format}
            description={control.key === "corridorWidth"
              ? "Espessura dos trajetos, medida em tiles."
              : "Controla o quanto as salas ficam agrupadas."}
            editable={control.step === 1}
            onChange={(value) => setParameters((current) => ({ ...current, [control.key]: value }))}
          />
        ))}
      </div>
    </>
  );
}