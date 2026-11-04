import type { DungeonParameters, RoomTypeCategory } from "../../dungeon";
import { ROOM_TYPE_CATEGORIES, ROOM_TYPE_CATEGORY_ORDER } from "../../roomTypes";

interface TypesPanelProps {
  parameters: DungeonParameters;
  updateRoomTypeFrequency: (key: RoomTypeCategory, value: number) => void;
}

export function TypesPanel({ parameters, updateRoomTypeFrequency }: TypesPanelProps) {
  return (
    <>
      <div className="section-heading settings-section-heading"><span>DISTRIBUIÇÃO DE TIPOS DE SALA</span></div>
      {ROOM_TYPE_CATEGORY_ORDER.map((key) => {
        const value = parameters.roomTypeDistributionEnabled ? parameters.roomTypeCategoryFrequencies[key] : 0;
        return (
          <label className="parameter-control" key={key}>
            <span className="parameter-label"><span>{ROOM_TYPE_CATEGORIES[key].shortLabel}</span><strong>{value}</strong></span>
            <input id={`parameter-roomType-${key}`} type="range" min={0} max={100} step={1} value={value} onChange={(e) => updateRoomTypeFrequency(key, Number(e.currentTarget.value))} aria-label={ROOM_TYPE_CATEGORIES[key].label} />
          </label>
        );
      })}
    </>
  );
}