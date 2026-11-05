import type { Dispatch, SetStateAction } from "react";
import type { DungeonParameters } from "../../dungeon";
import { MIN_DUNGEON_ROOM_COUNT, getMaxRoomCountForGrid } from "../../dungeon";
import { RangeControl } from "./RangeControl";

interface RoomsPanelProps {
  parameters: DungeonParameters;
  setParameters: Dispatch<SetStateAction<DungeonParameters>>;
  corridorControls: Array<{ key: string; label: string; min: number; max: number; step: number; format: (value: number) => string }>;
  multilevelEnabled: boolean;
}

export function RoomsPanel({
  parameters,
  setParameters,
  corridorControls,
  multilevelEnabled,
}: RoomsPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading">
        <span>{multilevelEnabled ? "QUANTIDADE DE SALAS POR NÍVEL" : "QUANTIDADE DE SALAS"}</span>
      </div>
      <RangeControl
        id="parameter-roomCount"
        label={multilevelEnabled ? "Salas por nível" : "Quantidade de salas"}
        value={parameters.roomCount}
        min={MIN_DUNGEON_ROOM_COUNT}
        max={getMaxRoomCountForGrid(parameters.width, parameters.height)}
        step={1}
        formatValue={(value) => `${value} salas`}
        description={multilevelEnabled
          ? "Referência do nível principal; os demais andares variam em torno dela, e a aba Multinível permite ajustes individuais."
          : "O limite cresce com a grade; em grades pequenas, valores altos podem recorrer ao gerador V1."}
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