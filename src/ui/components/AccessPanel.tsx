import type { Dispatch, SetStateAction } from "react";
import type { DungeonParameters, EntranceMode } from "../../dungeon";

const ENTRANCE_MODE_OPTIONS = [
  { value: "upper-stairs" as EntranceMode, label: "Escadaria superior" },
  { value: "exterior-entrance" as EntranceMode, label: "Entrada vinda do exterior" },
  { value: "exterior-connection" as EntranceMode, label: "Conexão com o exterior" },
];

interface AccessPanelProps {
  parameters: DungeonParameters;
  setParameters: Dispatch<SetStateAction<DungeonParameters>>;
}

export function AccessPanel({ parameters, setParameters }: AccessPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>ACESSO</span></div>
      <label className="parameter-control">
        <span className="parameter-label"><span>Modo de entrada</span></span>
        <select id="parameter-entranceMode" value={parameters.entranceMode} onChange={(event) => {
          const entranceMode = ENTRANCE_MODE_OPTIONS.find((option) => option.value === event.currentTarget.value)?.value;
          if (entranceMode) setParameters((current) => ({ ...current, entranceMode }));
        }}>
          {ENTRANCE_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="parameter-control">
        <span className="parameter-label"><span>Portas duplas</span></span>
        <input id="parameter-doubleDoorsEnabled" type="checkbox" checked={parameters.doubleDoorsEnabled} onChange={(e) => setParameters((c) => ({ ...c, doubleDoorsEnabled: e.currentTarget.checked }))} />
      </label>
    </>
  );
}