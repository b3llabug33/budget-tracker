const PRESETS = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['lastMonth', 'Last month'],
  ['custom', 'Custom'],
];

// One filter row that every card on the dashboard follows.
export default function RangePicker({ preset, onPreset, custom, onCustom }) {
  return (
    <div className="range">
      <div className="pills" role="tablist" aria-label="Date range">
        {PRESETS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={preset === value}
            className={preset === value ? 'pill active' : 'pill'}
            onClick={() => onPreset(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="custom-range">
          <label>
            From
            <input type="date" value={custom.start} max={custom.end || undefined} onChange={(e) => onCustom({ ...custom, start: e.target.value })} />
          </label>
          <label>
            To
            <input type="date" value={custom.end} min={custom.start || undefined} onChange={(e) => onCustom({ ...custom, end: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}
