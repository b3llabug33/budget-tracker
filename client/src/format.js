// Formatting helpers, category display info, and date-range math.

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const money = (n) => currency.format(n);
export const wholeMoney = (n) => wholeCurrency.format(n);

// Each Plaid category keeps the same color everywhere, whatever its rank,
// so "Shopping is orange" stays true when filters change.
const CATEGORIES = {
  FOOD_AND_DRINK: { label: 'Food & drink', icon: '🍔', color: 'var(--series-1)' },
  GENERAL_MERCHANDISE: { label: 'Shopping', icon: '🛍️', color: 'var(--series-2)' },
  TRANSPORTATION: { label: 'Transportation', icon: '🚗', color: 'var(--series-3)' },
  RENT_AND_UTILITIES: { label: 'Bills & utilities', icon: '💡', color: 'var(--series-4)' },
  ENTERTAINMENT: { label: 'Entertainment', icon: '🎬', color: 'var(--series-5)' },
  PERSONAL_CARE: { label: 'Personal care', icon: '💅', color: 'var(--series-6)' },
  MEDICAL: { label: 'Medical', icon: '💊', color: 'var(--series-7)' },
  TRAVEL: { label: 'Travel', icon: '✈️', color: 'var(--series-8)' },
  INCOME: { label: 'Income', icon: '💰', color: 'var(--other)' },
  TRANSFER_IN: { label: 'Transfer in', icon: '🔁', color: 'var(--other)' },
  TRANSFER_OUT: { label: 'Transfer', icon: '🔁', color: 'var(--other)' },
};

export const OTHER = { label: 'Other', icon: '🧾', color: 'var(--other)' };

// True for the categories that get their own color in charts.
export function hasOwnColor(category) {
  return Boolean(CATEGORIES[category]) && CATEGORIES[category].color !== 'var(--other)';
}

export function categoryInfo(category) {
  if (CATEGORIES[category]) return CATEGORIES[category];
  if (!category) return OTHER;
  // LOAN_PAYMENTS -> Loan payments
  const words = category.toLowerCase().replace(/_/g, ' ');
  return { ...OTHER, label: words.charAt(0).toUpperCase() + words.slice(1) };
}

// ---- Dates (all local time, as YYYY-MM-DD strings) ----

export function toISO(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s) {
  return new Date(s + 'T00:00:00');
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns { start, end, prevStart, prevEnd, label, legend, prevLabel } for a preset.
// label finishes "Spent ...", legend names the current period in the chart legend,
// compareText finishes "$12 less ...", complete is true when the period is already over.
// The previous period is always complete, so the trend chart can show where
// last month ended up next to where this month is so far.
export function rangeFor(preset, custom) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === 'week') {
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    return {
      start: toISO(monday),
      end: toISO(today),
      prevStart: toISO(addDays(monday, -7)),
      prevEnd: toISO(addDays(monday, -1)),
      label: 'this week',
      legend: 'This week',
      prevLabel: 'Last week',
      compareText: 'than this point last week',
    };
  }

  if (preset === 'lastMonth') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long' });
    return {
      start: toISO(start),
      end: toISO(end),
      prevStart: toISO(prevStart),
      prevEnd: toISO(new Date(start.getFullYear(), start.getMonth(), 0)),
      label: 'in ' + monthName(start),
      legend: monthName(start),
      prevLabel: monthName(prevStart),
      compareText: 'than ' + monthName(prevStart),
      complete: true,
    };
  }

  if (preset === 'custom' && custom.start && custom.end && custom.start <= custom.end) {
    const start = fromISO(custom.start);
    const end = fromISO(custom.end);
    const days = Math.round((end - start) / DAY_MS) + 1;
    return {
      start: custom.start,
      end: custom.end,
      prevStart: toISO(addDays(start, -days)),
      prevEnd: toISO(addDays(start, -1)),
      label: 'in this range',
      legend: 'This range',
      prevLabel: `Previous ${days} days`,
      compareText: `than the ${days} days before`,
      complete: custom.end < toISO(today),
    };
  }

  // Default: this month
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: toISO(start),
    end: toISO(today),
    prevStart: toISO(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    prevEnd: toISO(new Date(today.getFullYear(), today.getMonth(), 0)),
    label: 'this month',
    legend: 'This month',
    prevLabel: 'Last month',
    compareText: 'than this point last month',
  };
}

export function shortDate(iso) {
  return fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Today", "Yesterday", or "Mon, Oct 3"
export function dayHeading(iso) {
  const today = toISO(new Date());
  const yesterday = toISO(addDays(new Date(), -1));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return fromISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
