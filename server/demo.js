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

// ---- Demo brokerage (Plaid Investments shape) ----

// [ticker, name, type, shares, price now, total cost basis]
const HOLDINGS = [
  ['VOO', 'Vanguard S&P 500 ETF', 'etf', 4.2, 548.3, 2010.0],
  ['NVDA', 'NVIDIA Corp', 'equity', 6, 182.4, 812.0],
  ['AAPL', 'Apple Inc', 'equity', 3.5, 236.1, 742.5],
  ['SCHD', 'Schwab US Dividend Equity ETF', 'etf', 18, 27.9, 498.6],
  ['SOFI', 'SoFi Technologies', 'equity', 25, 21.35, 410.0],
  ['AMD', 'Advanced Micro Devices', 'equity', 2, 162.8, 361.0],
  ['RIVN', 'Rivian Automotive', 'equity', 10, 12.6, 158.0],
];
const CASH = 142.37;

function buildInvestments(days = 120) {
  const rand = seededRandom(7);
  const securities = HOLDINGS.map(([ticker, name, type, , price]) => ({
    security_id: `sec-${ticker}`,
    ticker_symbol: ticker,
    name,
    type,
    close_price: price,
    is_cash_equivalent: false,
  }));
  const holdings = HOLDINGS.map(([ticker, , , quantity, price, cost]) => ({
    account_id: 'demo-brokerage',
    security_id: `sec-${ticker}`,
    quantity,
    institution_price: price,
    institution_value: Math.round(quantity * price * 100) / 100,
    cost_basis: cost,
  }));
  const invested = holdings.reduce((sum, h) => sum + h.institution_value, 0);
  const accounts = [{ account_id: 'demo-brokerage', balances: { current: invested + CASH } }];

  // Buys after each paycheck and a quarterly dividend, newest first.
  const today = new Date();
  const investTxns = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const date = isoDate(d);
    if (d.getDate() === 2 || d.getDate() === 16) {
      const [ticker, , , , price] = HOLDINGS[(i * 3) % HOLDINGS.length];
      const amount = 50 + Math.round(rand() * 100);
      investTxns.push({
        investment_transaction_id: `demo-inv-${i}`,
        date,
        name: `BUY ${ticker}`,
        type: 'buy',
        subtype: 'buy',
        security_id: `sec-${ticker}`,
        quantity: Math.round((amount / price) * 10000) / 10000,
        amount,
      });
    }
    if (d.getDate() === 25 && [2, 5, 8, 11].includes(d.getMonth())) {
      investTxns.push({
        investment_transaction_id: `demo-div-${i}`,
        date,
        name: 'SCHD dividend',
        type: 'cash',
        subtype: 'dividend',
        security_id: 'sec-SCHD',
        quantity: 0,
        amount: -12.84, // negative = cash into the account
      });
    }
  }

  // A random walk that ends at today's value, plus the deposits stepping it up.
  const total = accounts[0].balances.current;
  const history = [];
  let value = total;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    history.push({ date: isoDate(d), value: Math.round(value * 100) / 100 });
    const deposit = investTxns.find((t) => t.date === isoDate(d) && t.type === 'buy');
    value = value / (1 + (rand() - 0.47) * 0.024) - (deposit ? deposit.amount : 0);
  }

  return {
    snapshot: { accounts, holdings, securities, transactions: investTxns, asOf: new Date().toISOString() },
    history: history.reverse(),
  };
}

const investments = buildInvestments();

module.exports = { transactions, investments };
