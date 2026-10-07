import { useState } from 'react';
import { OTHER, categoryInfo, hasOwnColor, money } from '../format';
import Donut from './Donut';

const MAX_SLICES = 5; // plus "Other", so the donut never has more than 6 slices

// Keeps the top categories that have their own color and folds the rest into "Other".
function toSlices(categories) {
  const named = categories.filter((c) => hasOwnColor(c.category)).slice(0, MAX_SLICES);
  const keep = new Set(named.map((c) => c.category));
  const rest = categories.filter((c) => !keep.has(c.category));
  const slices = named.map((c) => ({ key: c.category, ...categoryInfo(c.category), amount: c.amount }));
  if (rest.length) {
    slices.push({ key: 'OTHER', ...OTHER, amount: rest.reduce((sum, c) => sum + c.amount, 0) });
  }
  return slices;
}

export default function CategoryCard({ data }) {
  const [hovered, setHovered] = useState(null);
  if (!data) return <section className="card" />;

  const slices = toSlices(data.categories);

  return (
    <section className="card">
      <h2>Categories</h2>
      {slices.length === 0 ? (
        <p className="empty">No spending in this range.</p>
      ) : (
        <div className="categories">
          <Donut slices={slices} total={data.total} hovered={hovered} onHover={setHovered} />

          {/* The list doubles as the chart's legend and its readable table. */}
          <ul className="category-list">
            {slices.map((s) => (
              <li
                key={s.key}
                className={hovered && hovered !== s.key ? 'dim' : ''}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="icon" style={{ '--tint': s.color }}>{s.code}</span>
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
