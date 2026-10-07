import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { OTHER, categoryInfo, hasOwnColor, money, wholeMoney } from '../format';

const MAX_SLICES = 5; // plus "Other", so the donut never has more than 6 slices

// Keeps the top categories that have their own color and folds the rest into "Other".
function toSlices(categories) {
  const named = categories.filter((c) => hasOwnColor(c.category)).slice(0, MAX_SLICES);
  const keep = new Set(named.map((c) => c.category));
  const rest = categories.filter((c) => !keep.has(c.category));
  const slices = named.map((c) => ({ key: c.category, ...categoryInfo(c.category), amount: c.amount, count: c.count }));
  if (rest.length) {
    slices.push({
      key: 'OTHER',
      ...OTHER,
      amount: rest.reduce((sum, c) => sum + c.amount, 0),
      count: rest.reduce((sum, c) => sum + c.count, 0),
    });
  }
  return slices;
}

export default function CategoryCard({ data }) {
  const [hovered, setHovered] = useState(null);
  if (!data) return <section className="card" />;

  const slices = toSlices(data.categories);
  const active = slices.find((s) => s.key === hovered);

  return (
    <section className="card">
      <h2>Categories</h2>
      {slices.length === 0 ? (
        <p className="empty">No spending in this range.</p>
      ) : (
        <div className="categories">
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
                  cornerRadius={4}
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setHovered(slices[i].key)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} opacity={hovered && hovered !== s.key ? 0.35 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<SliceTooltip total={data.total} />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label: the hovered category, or the total */}
            <div className="donut-center">
              <span>{active ? active.label : 'Total'}</span>
              <strong>{wholeMoney(active ? active.amount : data.total)}</strong>
            </div>
          </div>

          {/* The list doubles as the chart's legend and its readable table. */}
          <ul className="category-list">
            {slices.map((s) => (
              <li
                key={s.key}
                className={hovered && hovered !== s.key ? 'dim' : ''}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="icon" style={{ '--tint': s.color }}>{s.icon}</span>
                <span className="name">
                  {s.label}
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${(s.amount / data.total) * 100}%`, background: s.color }} />
                  </span>
                </span>
                <span className="value">
                  {money(s.amount)}
                  <small>{Math.round((s.amount / data.total) * 100)}%</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
