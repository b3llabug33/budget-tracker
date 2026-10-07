require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { encrypt, decrypt, getKey } = require('./crypto');
const store = require('./store');
const demo = require('./demo');
const spending = require('./spending');

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
  if (DEMO) return res.status(400).json({ error: 'DEMO_MODE', message: 'Add Plaid keys to server/.env to connect a real bank.' });
  next();
}

// ---- Routes ----

app.get('/api/status', (req, res) => {
  if (DEMO) {
    return res.json({
      demo: true,
      connected: false,
      institution: null,
      lastSync: null,
      transactionCount: demo.transactions.length,
    });
  }
  res.json({ demo: false, plaidEnv: PLAID_ENV, ...store.getStatus() });
});

// Step 1 of connecting a bank: the client needs a short-lived link token to open Plaid Link.
app.post('/api/link-token', rejectInDemo, async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: 'bella' }, // single user app
      client_name: 'Budget Tracker',
      products: [Products.Transactions],
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
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });
  try {
    const response = await plaid.itemPublicTokenExchange({ public_token });
    store.setItem({
      itemId: response.data.item_id,
      accessTokenEnc: encrypt(response.data.access_token),
      institution: institution || null,
    });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'exchange');
  }
});

// Pulls everything new since the saved cursor. Plaid pages results, so loop
// until has_more is false, then save all pages and the new cursor together.
app.post('/api/sync', rejectInDemo, async (req, res) => {
  const item = store.getItem();
  if (!item) return res.status(400).json({ error: 'No bank connected yet' });

  const accessToken = decrypt(item.accessTokenEnc);
  const startCursor = store.getCursor();

  try {
    let added = [];
    let modified = [];
    let removed = [];
    let cursor = startCursor;
    let hasMore = true;

    while (hasMore) {
      let page;
      try {
        page = (
          await plaid.transactionsSync({
            access_token: accessToken,
            cursor: cursor || undefined,
            count: 500,
          })
        ).data;
      } catch (err) {
        // Plaid's data changed mid-pagination: throw away this run's pages and restart.
        const code = err.response && err.response.data && err.response.data.error_code;
        if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
          added = [];
          modified = [];
          removed = [];
          cursor = startCursor;
          continue;
        }
        throw err;
      }
      added = added.concat(page.added);
      modified = modified.concat(page.modified);
      removed = removed.concat(page.removed);
      cursor = page.next_cursor;
      hasMore = page.has_more;
    }

    store.applySync({ added, modified, removed, cursor });
    res.json({ added: added.length, modified: modified.length, removed: removed.length });
  } catch (err) {
    handleError(res, err, 'sync');
  }
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
