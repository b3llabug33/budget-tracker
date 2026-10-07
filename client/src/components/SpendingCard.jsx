import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fromISO, money, shortDate, toISO, wholeMoney } from '../format';

// Hero number + running-total chart comparing this period with the last one.
export default function SpendingCard({ trend, range }) {
  if (!trend) return <section className="card spending-card" />;

  const { current, previous, currentTotal } = trend;

  // A finished period compares totals. One still in progress compares with the
  // previous period at the same point (day 6 vs. day 6), so early in the month
  // doesn't always look like "less".
  const samePoint = previous[Math.min(current.length, previous.length) - 1];
  const compareTo = range.complete ? trend.previousTotal : samePoint ? samePoint.cumulative : 0;
  const diff = currentTotal - compareTo;
  const spentLess = diff <= 0;

  // One row per day index. The current line stops at the last day it has.
  const length = Math.max(current.length, previous.length);
  const start = fromISO(range.start);
  const data = Array.from({ length }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      day: i + 1,
      label: shortDate(toISO(d)),
      current: current[i] ? current[i].cumulative : null,
      currentDate: current[i] ? current[i].date : null,
      previous: previous[i] ? previous[i].cumulative : null,
      previousDate: previous[i] ? previous[i].date : null,
    };
  });

  return (
    <section className="card spending-card">
      <p className="eyebrow">Spent {range.label}</p>
      <p className="hero">
        {money(currentTotal)}
        <span className="cursor" aria-hidden="true" />
      </p>
      {compareTo > 0 && (
        <p className={spentLess ? 'delta good' : 'delta bad'}>
          <span aria-hidden="true">{spentLess ? '▼' : '▲'}</span>
          {wholeMoney(Math.abs(diff))} {spentLess ? 'less' : 'more'} {range.compareText}
        </p>
      )}

      <div className="legend" aria-hidden="true">
        <span><i className="swatch line current" />{range.legend}</span>
        <span><i className="swatch line previous" />{range.prevLabel}</span>
      </div>

      <div className="trend-chart">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="currentFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              width={48}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--axis)' }} />
            <Area
              type="monotone"
              dataKey="previous"
              stroke="var(--previous)"
              strokeWidth={2}
              fill="none"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="current"
              className="glow"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#currentFill)"
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip">
      {row.current !== null && (
        <div>
          <i className="swatch dot current" />
          {shortDate(row.currentDate)}: <strong>{money(row.current)}</strong>
        </div>
      )}
      {row.previous !== null && (
        <div>
          <i className="swatch dot previous" />
          {shortDate(row.previousDate)}: <strong>{money(row.previous)}</strong>
        </div>
      )}
    </div>
  );
}
