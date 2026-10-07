import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, shortDate, wholeMoney } from '../format';
import Donut from './Donut';

// Allocation colors by rank: the four largest holdings, then cash and everything else.
const HOLDING_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const CASH_COLOR = 'var(--series-5)';
const TOP_HOLDINGS = HOLDING_COLORS.length;

function holdingColor(index) {
  return HOLDING_COLORS[index] || 'var(--other)';
}

// "▲ $292.86 (14.6%)" in green, or "▼ ..." in red. Arrow + sign so it never relies on color alone.
function Gain({ gain, pct, className = '' }) {
  if (gain === null || gain === undefined) return <span className={`gain ${className}`}>—</span>;
  const up = gain >= 0;
  return (
    <span className={`gain ${up ? 'good' : 'bad'} ${className}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {up ? '+' : '−'}
      {money(Math.abs(gain))}
      {pct !== null && pct !== undefined && ` (${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

const RANGES = [
  ['1M', 30],
  ['3M', 91],
  ['All', Infinity],
];

function PortfolioCard({ data }) {
  const [range, setRange] = useState('3M');
  const days = RANGES.find(([label]) => label === range)[1];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const history = Number.isFinite(days)
    ? data.history.filter((h) => new Date(h.date + 'T00:00:00') >= cutoff)
    : data.history;
  const change = history.length >= 2 ? history[history.length - 1].value - history[0].value : null;

  return (
    <section className="card spending-card">
      <p className="eyebrow">Portfolio value</p>
      <p className="hero">
        {money(data.totalValue)}
        <span className="cursor" aria-hidden="true" />
      </p>
      <p className="delta-line">
        <Gain gain={data.gain} pct={data.gainPct} /> <span className="muted">all-time gain</span>
      </p>

      <div className="card-head chart-head">
        <span className="muted small">
          {change !== null &&
            `${change >= 0 ? 'Up' : 'Down'} ${wholeMoney(Math.abs(change))} since ${shortDate(history[0].date)} (includes deposits)`}
        </span>
        <div className="segmented" role="group" aria-label="Chart range">
          {RANGES.map(([label]) => (
            <button key={label} className={range === label ? 'active' : ''} onClick={() => setRange(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {history.length < 2 ? (
        <p className="empty">The value chart fills in as the app syncs each day.</p>
      ) : (
        <div className="trend-chart">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={{ stroke: 'var(--axis)' }}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={36}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                width={48}
              />
              <Tooltip content={<ValueTooltip />} cursor={{ stroke: 'var(--axis)' }} />
              <Area
                type="monotone"
                dataKey="value"
                baseValue="dataMin"
                className="glow"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#valueFill)"
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ValueTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip">
      {shortDate(row.date)}: <strong>{money(row.value)}</strong>
    </div>
  );
}

function AllocationCard({ data }) {
  const [hovered, setHovered] = useState(null);

  const slices = data.holdings.slice(0, TOP_HOLDINGS).map((h, i) => ({
    key: h.id,
    label: h.ticker,
    color: holdingColor(i),
    amount: h.value,
  }));
  const rest = data.holdings.slice(TOP_HOLDINGS);
  if (rest.length) {
    slices.push({ key: 'OTHER', label: 'Other', color: 'var(--other)', amount: rest.reduce((s, h) => s + h.value, 0) });
  }
  if (data.cash > 0) slices.push({ key: 'CASH', label: 'Cash', color: CASH_COLOR, amount: data.cash });

  return (
    <section className="card">
      <h2>Allocation</h2>
      <div className="categories">
        <Donut slices={slices} total={data.totalValue} hovered={hovered} onHover={setHovered} />
        <ul className="category-list">
          {slices.map((s) => (
            <li
              key={s.key}
              className={hovered && hovered !== s.key ? 'dim' : ''}
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <i className="swatch dot big" style={{ background: s.color }} />
              <span className="name">{s.label}</span>
              <span className="value">
                {money(s.amount)}
                <small>{((s.amount / data.totalValue) * 100).toFixed(1)}%</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HoldingsCard({ data }) {
  return (
    <section className="card">
      <h2>Holdings</h2>
      <ul className="rows">
        {data.holdings.map((h, i) => (
          <li key={h.id} className="row">
            <span className="icon ticker" style={{ '--tint': holdingColor(i) }}>
              {h.ticker.slice(0, 4)}
            </span>
            <span className="name">
              {h.name}
              <small>
                {+h.quantity.toFixed(4)} {h.quantity === 1 ? 'share' : 'shares'} · {money(h.price)}
              </small>
            </span>
            <span className="value">
              {money(h.value)}
              <Gain gain={h.gain} pct={h.gainPct} className="small" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityCard({ data }) {
  return (
    <section className="card wide">
      <h2>Recent activity</h2>
      {data.activity.length === 0 && <p className="empty">No buys, sells, or dividends in the last year.</p>}
      <ul className="rows">
        {data.activity.map((a) => {
          const cashIn = a.amount < 0; // Plaid: negative = cash into the account
          return (
            <li key={a.id} className="row">
              <span className="icon ticker" style={{ '--tint': 'var(--other)' }}>
                {(a.ticker || '$').slice(0, 4)}
              </span>
              <span className="name">
                {a.label} {a.ticker}
                <small>
                  {shortDate(a.date)}
                  {a.quantity > 0 && ` · ${+a.quantity.toFixed(4)} shares`}
                </small>
              </span>
              <span className={cashIn ? 'value in' : 'value'}>
                {cashIn ? '+' : ''}
                {money(Math.abs(a.amount))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function InvestmentsView({ data, demo, onConnect }) {
  if (!data) return <main className="grid" />;

  if (!data.connected) {
    return (
      <main className="grid">
        <section className="card connect-card">
          <h2>Connect your brokerage</h2>
          <p className="muted">
            Link Webull through Plaid to see your portfolio value, holdings, and gains. Access is read-only, so the app
            can never place trades.
          </p>
          {!demo && (
            <button className="primary" onClick={onConnect}>
              Connect Webull
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <PortfolioCard data={data} />
      <AllocationCard data={data} />
      <HoldingsCard data={data} />
      <ActivityCard data={data} />
      {data.asOf && (
        <p className="footnote">
          Brokerage data updates once a day after market close. Last updated{' '}
          {new Date(data.asOf).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
        </p>
      )}
    </main>
  );
}
