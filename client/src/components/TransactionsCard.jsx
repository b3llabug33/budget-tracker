import { useState } from 'react';
import { categoryInfo, dayHeading, money } from '../format';

const PAGE = 25;

// Transactions in the selected range, grouped under a heading per day.
export default function TransactionsCard({ transactions }) {
  const [limit, setLimit] = useState(PAGE);
  if (!transactions) return <section className="card wide" />;

  const shown = transactions.slice(0, limit);
  const days = [];
  for (const t of shown) {
    const last = days[days.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else days.push({ date: t.date, items: [t] });
  }

  return (
    <section className="card wide">
      <h2>Transactions</h2>
      {transactions.length === 0 && <p className="empty">No transactions in this range.</p>}

      {days.map((day) => (
        <div key={day.date} className="day">
          <h3>{dayHeading(day.date)}</h3>
          <ul className="rows">
            {day.items.map((t) => {
              const info = categoryInfo(t.category);
              const moneyIn = t.amount < 0; // Plaid: negative = money in
              return (
                <li key={t.id} className={t.pending ? 'row pending' : 'row'}>
                  <span className="icon" style={{ '--tint': info.color }}>{info.icon}</span>
                  <span className="name">
                    {t.merchant}
                    <small>
                      {info.label}
                      {t.pending && ' · Pending'}
                    </small>
                  </span>
                  <span className={moneyIn ? 'value in' : 'value'}>
                    {moneyIn ? '+' : ''}
                    {money(Math.abs(t.amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {transactions.length > limit && (
        <button className="link" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </section>
  );
}
