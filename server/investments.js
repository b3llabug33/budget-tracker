// Turns raw Plaid Investments snapshots into the numbers the dashboard shows.

function round(n) {
  return Math.round(n * 100) / 100;
}

function isCash(security) {
  return Boolean(security && (security.is_cash_equivalent || security.type === 'cash'));
}

// Plaid's investment transaction types/subtypes -> a short label for the activity list.
function activityLabel(t) {
  if (t.type === 'buy') return 'Bought';
  if (t.type === 'sell') return 'Sold';
  if (t.subtype === 'dividend' || t.subtype === 'qualified dividend') return 'Dividend';
  if (t.subtype === 'deposit' || t.subtype === 'contribution') return 'Deposit';
  if (t.subtype === 'withdrawal') return 'Withdrawal';
  if (t.type === 'fee') return 'Fee';
  return t.subtype ? t.subtype.charAt(0).toUpperCase() + t.subtype.slice(1) : 'Other';
}

// snapshots: [{ accounts, holdings, securities, transactions, asOf }], one per brokerage
// history:   [{ date, value }]
function summarize(snapshots, history) {
  const securities = new Map();
  for (const snap of snapshots) for (const s of snap.securities) securities.set(s.security_id, s);

  const holdings = [];
  let invested = 0;
  let costBasis = 0;
  let gainOnKnownCost = 0;
  let holdingsCash = 0;

  for (const snap of snapshots) {
    for (const h of snap.holdings) {
      const security = securities.get(h.security_id);
      const value = h.institution_value || 0;
      if (isCash(security)) {
        holdingsCash += value;
        continue;
      }
      // Plaid's cost_basis is the total paid for the position, not per share.
      const gain = h.cost_basis != null ? value - h.cost_basis : null;
      invested += value;
      if (gain !== null) {
        costBasis += h.cost_basis;
        gainOnKnownCost += gain;
      }
      holdings.push({
        id: `${h.account_id}-${h.security_id}`,
        ticker: (security && security.ticker_symbol) || '—',
        name: (security && security.name) || 'Unknown security',
        type: security ? security.type : null,
        quantity: h.quantity,
        price: h.institution_price,
        value: round(value),
        costBasis: h.cost_basis != null ? round(h.cost_basis) : null,
        gain: gain !== null ? round(gain) : null,
        gainPct: gain !== null && h.cost_basis ? round((gain / h.cost_basis) * 100) : null,
      });
    }
  }

  // Account balances include uninvested cash; use them for the total when Plaid has them.
  const accountTotal = snapshots
    .flatMap((s) => s.accounts)
    .reduce((sum, a) => sum + (a.balances && a.balances.current != null ? a.balances.current : 0), 0);
  const totalValue = accountTotal > 0 ? accountTotal : invested + holdingsCash;
  const cash = Math.max(0, totalValue - invested);

  const activity = snapshots
    .flatMap((snap) => snap.transactions)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 25)
    .map((t) => {
      const security = securities.get(t.security_id);
      return {
        id: t.investment_transaction_id,
        date: t.date,
        label: activityLabel(t),
        ticker: security ? security.ticker_symbol : null,
        name: t.name,
        quantity: t.quantity,
        amount: t.amount, // Plaid: positive = cash out of the account (a purchase)
      };
    });

  const asOf = snapshots.map((s) => s.asOf).sort().pop() || null;

  return {
    connected: snapshots.length > 0,
    asOf,
    totalValue: round(totalValue),
    cash: round(cash),
    gain: round(gainOnKnownCost),
    gainPct: costBasis ? round((gainOnKnownCost / costBasis) * 100) : null,
    holdings: holdings.sort((a, b) => b.value - a.value),
    history,
    activity,
  };
}

module.exports = { summarize };
