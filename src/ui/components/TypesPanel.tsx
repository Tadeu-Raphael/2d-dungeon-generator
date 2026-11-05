import type { DungeonParameters, RoomTypeCategory } from "../../dungeon";
import { ROOM_TYPE_CATEGORIES, ROOM_TYPE_CATEGORY_ORDER } from "../../roomTypes";
import { RangeControl } from "./RangeControl";

interface TypesPanelProps {
  parameters: DungeonParameters;
  updateRoomTypeFrequency: (key: RoomTypeCategory, value: number) => void;
}

export function TypesPanel({ parameters, updateRoomTypeFrequency }: TypesPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE TIPOS DE SALA</span></div>
      <p className="parameter-description">Pesos percentuais relativos; ao ajustar um tipo, os demais são reequilibrados para totalizar 100%.</p>
      <div className="range-control-list">
      {ROOM_TYPE_CATEGORY_ORDER.map((key) => {
        const value = parameters.roomTypeDistributionEnabled ? parameters.roomTypeCategoryFrequencies[key] : 0;
        return (
          <RangeControl
            key={key}
            id={`parameter-roomType-${key}`}
            label={ROOM_TYPE_CATEGORIES[key].shortLabel}
            value={value}
            min={0}
            max={100}
            step={1}
            formatValue={(amount) => `${amount}%`}
            onChange={(amount) => updateRoomTypeFrequency(key, amount)}
          />
        );
      })}
      </div>
    </>
  );
}