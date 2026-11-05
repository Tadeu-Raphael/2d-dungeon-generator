export interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  description?: string;
  editable?: boolean;
}

export function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = String,
  description,
  editable = false,
}: RangeControlProps) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={`range-control${editable ? " range-control-editable" : ""}`}>
      <div className="range-control-heading">
        <label htmlFor={id}>{label}</label>
        {editable ? (
          <input
            className="range-control-value"
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={`${label} · valor exato`}
            aria-describedby={descriptionId}
            onChange={(event) => {
              const nextValue = event.currentTarget.valueAsNumber;
              if (
                Number.isFinite(nextValue)
                && nextValue >= min
                && nextValue <= max
                && event.currentTarget.validity.valid
              ) {
                onChange(nextValue);
              }
            }}
          />
        ) : (
          <output className="range-control-value" htmlFor={id}>
            {formatValue(value)}
          </output>
        )}
      </div>
      {description && (
        <small className="range-control-description" id={descriptionId}>
          {description}
        </small>
      )}
      <div className="range-control-slider">
        <span aria-hidden="true">{formatValue(min)}</span>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span aria-hidden="true">{formatValue(max)}</span>
      </div>
    </div>
  );
}
