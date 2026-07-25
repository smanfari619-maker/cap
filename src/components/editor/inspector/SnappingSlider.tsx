import React, { useCallback, useRef } from 'react';

interface SnappingSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  snapThreshold?: number; // Threshold in units to snap. If omitted, ~3.5% of range is used.
  onChange: (value: number) => void;
  showDefaultMarker?: boolean;
  className?: string;
  accentColor?: string;
}

export default function SnappingSlider({
  value,
  defaultValue,
  min,
  max,
  step = 1,
  snapThreshold,
  onChange,
  showDefaultMarker = true,
  className = '',
  accentColor = 'accent-violet-500',
  ...props
}: SnappingSliderProps) {
  const isDraggingRef = useRef(false);
  const range = max - min;
  const threshold = snapThreshold ?? (range * 0.035);

  const snapValue = useCallback((rawVal: number): number => {
    if (Math.abs(rawVal - defaultValue) <= threshold) {
      return defaultValue;
    }
    return rawVal;
  }, [defaultValue, threshold]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = Number(e.target.value);
    const finalVal = snapValue(rawVal);
    onChange(finalVal);
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  // Percentage position of the default marker on the slider track
  const defaultPct = range > 0 ? ((defaultValue - min) / range) * 100 : 50;
  const isSnappedToDefault = value === defaultValue;

  return (
    <div className="relative flex items-center w-full group py-0.5" onDoubleClick={handleDoubleClick} title="Double-click to reset to default">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        onMouseDown={() => { isDraggingRef.current = true; }}
        onMouseUp={() => { isDraggingRef.current = false; }}
        className={`w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${accentColor} focus:outline-none transition-all ${className}`}
        {...props}
      />
      {showDefaultMarker && defaultPct >= 0 && defaultPct <= 100 && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-0.5 h-2 rounded-full pointer-events-none transition-all ${
            isSnappedToDefault 
              ? 'bg-violet-400 opacity-100 scale-y-125 z-10 shadow-[0_0_6px_rgba(167,139,250,0.8)]' 
              : 'bg-zinc-600/70 group-hover:bg-zinc-400/80 opacity-60'
          }`}
          style={{ left: `calc(${defaultPct}% - 1px)` }}
        />
      )}
    </div>
  );
}
