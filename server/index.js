require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { encrypt, decrypt, getKey } = require('./crypto');
const store = require('./store');

// ---- Startup checks ----
const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PORT = Number(process.env.PORT) || 3001;

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('Missing PLAID_CLIENT_ID or PLAID_SECRET in server/.env');
  process.exit(1);
}
if (!PlaidEnvironments[PLAID_ENV]) {
  console.error(`PLAID_ENV must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`);
  process.exit(1);
}
getKey(); // throws early if ENCRYPTION_KEY is missing or malformed

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET },
    },
  })
);

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

// ---- Routes ----

app.get('/api/status', (req, res) => {
  res.json({ plaidEnv: PLAID_ENV, ...store.getStatus() });
});

// Step 1 of connecting a bank: the client needs a short-lived link token to open Plaid Link.
app.post('/api/link-token', async (req, res) => {
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
app.post('/api/exchange', async (req, res) => {
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
app.post('/api/sync', async (req, res) => {
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

app.get('/api/transactions', (req, res) => {
  // Send only the fields the UI uses.
  const transactions = store.getTransactions().map((t) => ({
    id: t.transaction_id,
    date: t.date,
    merchant: t.merchant_name || t.name,
    category: t.personal_finance_category ? t.personal_finance_category.primary : null,
    amount: t.amount, // Plaid: positive = money out, negative = money in
    pending: t.pending,
  }));
  res.json({ transactions });
});

// Bind to localhost only: the server is never reachable from the network.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Budget tracker API on http://127.0.0.1:${PORT} (Plaid ${PLAID_ENV})`);
});
