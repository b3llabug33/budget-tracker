import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { money, wholeMoney } from '../format';

// Donut chart with the total (or the hovered slice) in the middle.
// slices: [{ key, label, color, amount }]. Hover state lives in the parent so
// the list next to the chart can highlight the same slice.
export default function Donut({ slices, total, hovered, onHover, totalLabel = 'Total' }) {
  const active = slices.find((s) => s.key === hovered);
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="amount"
            nameKey="label"
            innerRadius="68%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--surface)"
            strokeWidth={2}
            cornerRadius={0}
            isAnimationActive={false}
            onMouseEnter={(_, i) => onHover(slices[i].key)}
            onMouseLeave={() => onHover(null)}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.color} opacity={hovered && hovered !== s.key ? 0.35 : 1} />
            ))}
          </Pie>
          <Tooltip content={<SliceTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <span>{active ? active.label : totalLabel}</span>
        <strong>{wholeMoney(active ? active.amount : total)}</strong>
      </div>
    </div>
  );
}

function SliceTooltip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const s = payload[0].payload;
  return (
    <div className="tooltip">
      <i className="swatch dot" style={{ background: s.color }} />
      {s.label}: <strong>{money(s.amount)}</strong> ({Math.round((s.amount / total) * 100)}%)
    </div>
  );
}
