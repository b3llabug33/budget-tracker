// Spending aggregation for the dashboard. Works on Plaid-shaped transactions.
// Milestone 2 moves these calculations into SQL queries.

// Money in (negative amounts) and transfers between accounts aren't spending.
const NOT_SPENDING = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT']);

function category(t) {
  return t.personal_finance_category ? t.personal_finance_category.primary : 'OTHER';
}

function merchant(t) {
  return t.merchant_name || t.name;
}

function isSpending(t) {
  return t.amount > 0 && !NOT_SPENDING.has(category(t));
}

function inRange(t, start, end) {
  return t.date >= start && t.date <= end; // YYYY-MM-DD strings compare correctly
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function spendingIn(transactions, start, end) {
  return transactions.filter((t) => isSpending(t) && inRange(t, start, end));
}

// Groups spending by keyFn, largest total first.
function groupBy(transactions, keyFn) {
  const groups = new Map();
  for (const t of transactions) {
    const key = keyFn(t);
    const g = groups.get(key) || { amount: 0, count: 0, category: category(t) };
    g.amount += t.amount;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, amount: round(g.amount), count: g.count, category: g.category }))
    .sort((a, b) => b.amount - a.amount);
}

function byCategory(transactions, start, end) {
  const spent = spendingIn(transactions, start, end);
  const categories = groupBy(spent, category).map(({ key, amount, count }) => ({
    category: key,
    amount,
    count,
  }));
  const total = round(categories.reduce((sum, c) => sum + c.amount, 0));
  return { total, categories };
}

function byMerchant(transactions, start, end) {
  const merchants = groupBy(spendingIn(transactions, start, end), merchant).map(
    ({ key, amount, count, category }) => ({ merchant: key, amount, count, category })
  );
  return { merchants };
}

// Day-by-day spending with a running total, one entry per day of the range.
function dailySeries(transactions, start, end) {
  const perDay = new Map();
  for (const t of spendingIn(transactions, start, end)) {
    perDay.set(t.date, (perDay.get(t.date) || 0) + t.amount);
  }
  const series = [];
  let cumulative = 0;
  for (let d = new Date(start + 'T00:00:00'), day = 1; formatDate(d) <= end; d.setDate(d.getDate() + 1), day++) {
    const date = formatDate(d);
    const amount = perDay.get(date) || 0;
    cumulative += amount;
    series.push({ day, date, amount: round(amount), cumulative: round(cumulative) });
  }
  return series;
}

function trend(transactions, start, end, prevStart, prevEnd) {
  const current = dailySeries(transactions, start, end);
  const previous = dailySeries(transactions, prevStart, prevEnd);
  return {
    current,
    previous,
    currentTotal: current.length ? current[current.length - 1].cumulative : 0,
    previousTotal: previous.length ? previous[previous.length - 1].cumulative : 0,
  };
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { byCategory, byMerchant, trend, isSpending };
