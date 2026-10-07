require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { encrypt, getKey } = require('./crypto');
const store = require('./store');
const demo = require('./demo');
const spending = require('./spending');
const investments = require('./investments');
const { syncAll, isoDate } = require('./sync');

// ---- Startup checks ----
const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PORT = Number(process.env.PORT) || 3001;

// Demo mode: with no Plaid keys, serve sample transactions so the UI can be
// previewed without a bank. Real keys in .env switch it off automatically.
const DEMO = !PLAID_CLIENT_ID || !PLAID_SECRET;

let plaid = null;
if (!DEMO) {
  if (!PlaidEnvironments[PLAID_ENV]) {
    console.error(`PLAID_ENV must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`);
    process.exit(1);
  }
  getKey(); // throws early if ENCRYPTION_KEY is missing or malformed

  plaid = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[PLAID_ENV],
      baseOptions: {
        headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET },
      },
    })
  );
}

const app = express();
app.use(express.json());

// Plaid/axios errors carry request headers (including the secret), so only
// ever log or return the safe fields from Plaid's error body.
function handleError(res, err, label) {
  const plaidError = err.response && err.response.data;
  if (plaidError && plaidError.error_code) {
    console.error(`${label}: ${plaidError.error_code} - ${plaidError.error_message}`);
    return res.status(500).json({ error: plaidError.error_code, message: plaidError.error_message });
  }
  console.error(`${label}: ${err.message}`);
  res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
}

function rejectInDemo(req, res, next) {
  if (DEMO) return res.status(400).json({ error: 'DEMO_MODE', message: 'Add Plaid keys to server/.env to connect real accounts.' });
  next();
}

// ---- Routes ----

app.get('/api/status', (req, res) => {
  if (DEMO) {
    return res.json({ demo: true, connected: false, institution: null, brokerage: null, lastSync: null });
  }
  res.json({ demo: false, plaidEnv: PLAID_ENV, ...store.getStatus() });
});

// What each kind of connection asks Plaid for.
const PRODUCTS = {
  bank: [Products.Transactions],
  investments: [Products.Investments], // read-only: holdings and history, never trading
};

// Step 1 of connecting an account: the client needs a short-lived link token to open Plaid Link.
// Body: { kind: 'bank' | 'investments' }
app.post('/api/link-token', rejectInDemo, async (req, res) => {
  const kind = req.body.kind || 'bank';
  if (!PRODUCTS[kind]) return res.status(400).json({ error: 'kind must be bank or investments' });
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: 'bella' }, // single user app
      client_name: 'Budget Tracker',
      products: PRODUCTS[kind],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    handleError(res, err, 'link-token');
  }
});

// Step 2: Plaid Link hands the client a public token, which we trade for a
// long-lived access token. The access token never leaves the server.
app.post('/api/exchange', rejectInDemo, async (req, res) => {
  const { public_token, institution } = req.body;
  const kind = req.body.kind || 'bank';
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });
  if (!PRODUCTS[kind]) return res.status(400).json({ error: 'kind must be bank or investments' });
  try {
    const response = await plaid.itemPublicTokenExchange({ public_token });
    store.addItem({
      itemId: response.data.item_id,
      accessTokenEnc: encrypt(response.data.access_token),
      institution: institution || null,
      kind,
    });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'exchange');
  }
});

// Syncs every connected bank and brokerage, then saves today's portfolio value
// so the investments chart grows a point per day.
app.post('/api/sync', rejectInDemo, async (req, res) => {
  if (store.getItems().length === 0) return res.status(400).json({ error: 'Nothing connected yet' });
  try {
    const results = await syncAll(plaid);
    const snapshots = store.getInvestments();
    if (snapshots.length) {
      const { totalValue } = investments.summarize(snapshots, []);
      store.recordHistory(isoDate(new Date()), totalValue);
    }
    res.json({ results });
  } catch (err) {
    handleError(res, err, 'sync');
  }
});

app.get('/api/investments', (req, res) => {
  if (DEMO) return res.json(investments.summarize([demo.investments.snapshot], demo.investments.history));
  res.json(investments.summarize(store.getInvestments(), store.getHistory()));
});

function allTransactions() {
  return DEMO ? demo.transactions : store.getTransactions();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Reads ?start=YYYY-MM-DD&end=YYYY-MM-DD (plus any extra date params named in keys).
// Responds with 400 and returns null if any are missing or malformed.
function readDates(req, res, keys = ['start', 'end']) {
  const dates = {};
  for (const key of keys) {
    const value = req.query[key];
    if (!DATE_RE.test(value || '')) {
      res.status(400).json({ error: `${key} must be a YYYY-MM-DD date` });
      return null;
    }
    dates[key] = value;
  }
  return dates;
}

// Optional filters: ?start&end limit the date range, ?merchant limits to one merchant.
app.get('/api/transactions', (req, res) => {
  const { start, end, merchant } = req.query;
  if ((start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end))) {
    return res.status(400).json({ error: 'start and end must be YYYY-MM-DD dates' });
  }
  const transactions = allTransactions()
    .filter((t) => (!start || t.date >= start) && (!end || t.date <= end))
    .filter((t) => !merchant || (t.merchant_name || t.name) === merchant)
    // Send only the fields the UI uses.
    .map((t) => ({
      id: t.transaction_id,
      date: t.date,
      merchant: t.merchant_name || t.name,
      category: t.personal_finance_category ? t.personal_finance_category.primary : null,
      amount: t.amount, // Plaid: positive = money out, negative = money in
      pending: t.pending,
      isSpending: spending.isSpending(t),
    }));
  res.json({ transactions });
});

app.get('/api/spending/by-category', (req, res) => {
  const d = readDates(req, res);
  if (d) res.json(spending.byCategory(allTransactions(), d.start, d.end));
});

app.get('/api/spending/by-merchant', (req, res) => {
  const d = readDates(req, res);
  if (d) res.json(spending.byMerchant(allTransactions(), d.start, d.end));
});

// Running spending total for the selected range and the period it's compared with.
app.get('/api/spending/trend', (req, res) => {
  const d = readDates(req, res, ['start', 'end', 'prevStart', 'prevEnd']);
  if (d) res.json(spending.trend(allTransactions(), d.start, d.end, d.prevStart, d.prevEnd));
});

// Bind to localhost only: the server is never reachable from the network.
app.listen(PORT, '127.0.0.1', () => {
  const mode = DEMO ? 'DEMO MODE, sample data' : `Plaid ${PLAID_ENV}`;
  console.log(`Budget tracker API on http://127.0.0.1:${PORT} (${mode})`);
});
