import type { Dispatch, SetStateAction } from "react";
import type { DungeonParameters } from "../../dungeon";

interface RoomsPanelProps {
  parameters: DungeonParameters;
  setParameters: Dispatch<SetStateAction<DungeonParameters>>;
  corridorControls: Array<{ key: string; label: string; min: number; max: number; step: number; format: (value: number) => string }>;
}

export function RoomsPanel({ parameters, setParameters, corridorControls }: RoomsPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>QUANTIDADE DE SALAS</span></div>
      <label className="parameter-control">
        <span className="parameter-label"><span>Quantidade de salas</span><strong>{parameters.roomCount} salas</strong></span>
        <input id="parameter-roomCount" type="range" min={4} max={24} step={1} value={parameters.roomCount} onChange={(e) => setParameters((c) => ({ ...c, roomCount: Number(e.currentTarget.value) }))} aria-label="Quantidade de salas" />
      </label>
      <div className="section-heading settings-section-heading"><span>LARGURA DOS CORREDORES</span></div>
      {corridorControls.map((c) => (
        <label className="parameter-control" key={c.key}>
          <span className="parameter-label"><span>{c.label}</span><strong>{c.format(parameters[c.key as keyof DungeonParameters] as number)}</strong></span>
          <input id={`parameter-${c.key}`} type="range" min={c.min} max={c.max} step={c.step} value={parameters[c.key as keyof DungeonParameters] as number} onChange={(e) => setParameters((cur) => ({ ...cur, [c.key]: Number(e.currentTarget.value) }))} aria-label={c.label} />
        </label>
      ))}
    </>
  );
}