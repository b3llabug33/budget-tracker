import { useState } from 'react';
import { api } from '../api';
import { categoryInfo, money, shortDate } from '../format';

const SORTS = {
  amount: (a, b) => b.amount - a.amount,
  visits: (a, b) => b.count - a.count || b.amount - a.amount,
  name: (a, b) => a.merchant.localeCompare(b.merchant),
};

const COLLAPSED_COUNT = 6;

// Spending per merchant. Tapping a merchant shows its transactions in the range.
export default function MerchantsCard({ data, range }) {
  const [sort, setSort] = useState('amount');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(null); // merchant name
  const [detail, setDetail] = useState([]);

  if (!data) return <section className="card" />;

  const merchants = [...data.merchants].sort(SORTS[sort]);
  const visible = showAll ? merchants : merchants.slice(0, COLLAPSED_COUNT);
  const max = Math.max(...merchants.map((m) => m.amount), 1);

  async function toggle(merchant) {
    if (open === merchant) return setOpen(null);
    setOpen(merchant);
    setDetail([]);
    const { transactions } = await api('/api/transactions', {
      params: { start: range.start, end: range.end, merchant },
    });
    setDetail(transactions.filter((t) => t.isSpending));
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Merchants</h2>
        <div className="segmented" role="group" aria-label="Sort merchants">
          {[['amount', 'Amount'], ['visits', 'Visits'], ['name', 'A–Z']].map(([value, label]) => (
            <button key={value} className={sort === value ? 'active' : ''} onClick={() => setSort(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {merchants.length === 0 && <p className="empty">No spending in this range.</p>}

      <ul className="rows">
        {visible.map((m) => {
          const info = categoryInfo(m.category);
          const isOpen = open === m.merchant;
          return (
            <li key={m.merchant}>
              <button className="row" onClick={() => toggle(m.merchant)} aria-expanded={isOpen}>
                <span className="icon" style={{ '--tint': info.color }}>{info.code}</span>
                <span className="name">
                  {m.merchant}
                  <small>
                    {m.count} {m.count === 1 ? 'visit' : 'visits'}
                  </small>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${(m.amount / max) * 100}%` }} />
                  </span>
                </span>
                <span className="value">{money(m.amount)}</span>
                <span className={isOpen ? 'chevron open' : 'chevron'} aria-hidden="true">›</span>
              </button>
              {isOpen && (
                <ul className="detail">
                  {detail.map((t) => (
                    <li key={t.id}>
                      <span>
                        {shortDate(t.date)}
                        {t.pending && <em> · Pending</em>}
                      </span>
                      <span>{money(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {merchants.length > COLLAPSED_COUNT && (
        <button className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show less' : `Show all ${merchants.length}`}
        </button>
      )}
    </section>
  );
}
