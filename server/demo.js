// Sample transactions for demo mode (no Plaid keys in .env). Shaped like Plaid's
// /transactions/sync output so the rest of the app treats them the same way.

// Each merchant: [name, Plaid primary category, min $, max $, visits per week]
const MERCHANTS = [
  ['Dutch Bros', 'FOOD_AND_DRINK', 5, 9, 3],
  ['Chipotle', 'FOOD_AND_DRINK', 11, 16, 1],
  ['Fry\'s Food', 'FOOD_AND_DRINK', 25, 80, 1],
  ['Target', 'GENERAL_MERCHANDISE', 15, 70, 0.7],
  ['Amazon', 'GENERAL_MERCHANDISE', 10, 60, 1],
  ['Shell', 'TRANSPORTATION', 35, 55, 0.5],
  ['Uber', 'TRANSPORTATION', 12, 28, 0.3],
  ['AMC Theatres', 'ENTERTAINMENT', 12, 25, 0.25],
  ['Ulta Beauty', 'PERSONAL_CARE', 15, 45, 0.2],
  ['CVS Pharmacy', 'MEDICAL', 8, 30, 0.15],
];

// Monthly charges: [name, category, amount, day of month]
const MONTHLY = [
  ['Spotify', 'ENTERTAINMENT', 11.99, 3],
  ['SRP', 'RENT_AND_UTILITIES', 92.4, 12],
  ['Cox Communications', 'RENT_AND_UTILITIES', 60.0, 18],
  ['ASU Payroll', 'INCOME', -612.5, 1], // negative = money in
  ['ASU Payroll', 'INCOME', -598.75, 15],
];

// Small seeded random generator so the demo data is the same on every run.
function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// YYYY-MM-DD in local time (toISOString would use UTC and can shift the day).
function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function build(days = 100) {
  const rand = seededRandom(42);
  const transactions = [];
  const today = new Date();

  const add = (date, name, category, amount, pending = false) => {
    transactions.push({
      transaction_id: `demo-${transactions.length}`,
      date: isoDate(date),
      name,
      merchant_name: name,
      amount: Math.round(amount * 100) / 100,
      personal_finance_category: { primary: category },
      pending,
    });
  };

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    for (const [name, category, min, max, perWeek] of MERCHANTS) {
      if (rand() < perWeek / 7) add(date, name, category, min + rand() * (max - min));
    }
    for (const [name, category, amount, day] of MONTHLY) {
      if (date.getDate() === day) add(date, name, category, amount);
    }
    if (rand() < 0.08) add(date, 'Venmo', 'TRANSFER_OUT', 10 + rand() * 40);
  }

  // One pending charge today so the pending style shows up.
  add(today, 'Dutch Bros', 'FOOD_AND_DRINK', 6.45, true);

  return transactions.sort((a, b) => b.date.localeCompare(a.date));
}

const transactions = build();

module.exports = { transactions };
