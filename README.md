# Budget Tracker

A personal budget tracker that pulls transactions from my bank through [Plaid](https://plaid.com). Single user, runs on my own machine, and is never exposed to the public internet.

**Stack:** Express (Node.js) API, React 18 + Vite client, Recharts, Plaid Transactions API.

## Dashboard

- **Spending:** total for the selected range, the change compared with the same point in the previous period, and a running-total chart of both periods.
- **Categories:** donut chart of the top 5 categories plus "Other", with a list of amounts and percentages.
- **Merchants:** spending per merchant, sortable by amount, visits, or name. Tap one to see its transactions.
- **Transactions:** grouped by day, with money in shown in green and pending charges greyed out.
- **Date filters:** this week, this month, last month, or a custom range.
- Works on a phone screen and follows the system light/dark setting.

Spending totals leave out money coming in (negative amounts) and transfers. Totals are calculated on the server (`server/spending.js`), so the client never downloads every transaction to do math.

## Status

- [x] **Milestone 1:** connect a bank with Plaid Link, sync transactions, show them in a table
- [ ] Milestone 2: Postgres storage
- [~] Milestone 3: dashboard with charts (done) and budgets (waits on Postgres)
- [ ] Milestone 4: always-on server, scheduled sync, Tailscale access
- [ ] Milestone 5: iPhone home screen widget (Scriptable)

## How it works

1. The client asks the server for a **link token** and opens Plaid Link with it.
2. After the bank login, Plaid Link gives the client a **public token**. The server exchanges it for an **access token**, encrypts it with AES-256-GCM, and stores it. The access token never reaches the browser.
3. **Sync** calls Plaid's `/transactions/sync` with the saved cursor, pages through every added, modified, and removed transaction, then saves the changes and the new cursor together.

Plaid amounts are positive for money out and negative for money in.

## Security

- The API binds to `127.0.0.1` only, and the Vite dev server does the same.
- Plaid keys and `ENCRYPTION_KEY` live only in `server/.env`, which is gitignored along with `server/data/`.
- Plaid errors are logged by error code only, so request headers holding the secret never reach the logs.

## Setup

Requires Node.js 20 or newer.

1. Get Sandbox keys from [dashboard.plaid.com](https://dashboard.plaid.com/developers/keys).
2. Create the env file:
   ```
   cd server
   copy .env.example .env
   ```
   Fill in `PLAID_CLIENT_ID` and `PLAID_SECRET` (the **sandbox** secret), then generate an encryption key and paste it in as `ENCRYPTION_KEY`:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Install dependencies:
   ```
   cd server && npm install
   cd ../client && npm install
   ```

## Running

Use two terminals:

```
cd server
npm run dev        # API on http://127.0.0.1:3001
```

```
cd client
npm run dev        # app on http://127.0.0.1:5173
```

## Demo mode

If `server/.env` has no Plaid keys (or doesn't exist), the server starts in **demo mode** and serves about 100 days of sample transactions from `server/demo.js`. This lets anyone preview the app without a bank account. The connect and sync buttons are disabled in demo mode. Adding real keys switches it off automatically.

## Testing with Plaid Sandbox

1. Open http://127.0.0.1:5173 and click **Connect bank**.
2. Pick any bank and log in with `user_good` / `pass_good`.
3. The app syncs right after connecting. A brand-new Sandbox item can take a few seconds to prepare its transactions, so if the table is empty, click **Sync transactions** again.

## API

| Route | Returns |
|---|---|
| `GET /api/status` | connection status, demo flag, last sync time |
| `POST /api/link-token` | a Plaid Link token |
| `POST /api/exchange` | stores the encrypted access token |
| `POST /api/sync` | pulls new transactions from Plaid |
| `GET /api/transactions?start&end&merchant` | transactions, optionally filtered |
| `GET /api/spending/by-category?start&end` | total and per-category spending |
| `GET /api/spending/by-merchant?start&end` | per-merchant spending and visit counts |
| `GET /api/spending/trend?start&end&prevStart&prevEnd` | daily running totals for both periods |

## Project structure

```
server/
  index.js     Express routes: status, link-token, exchange, sync, transactions, spending/*
  spending.js  spending totals by category, merchant, and day
  crypto.js    AES-256-GCM encrypt/decrypt for the access token
  store.js     temporary JSON file storage (server/data/store.json)
  demo.js      sample transactions for demo mode
client/src/
  App.jsx      loads the dashboard for the selected range, Plaid Link connect and sync
  format.js    money formatting, category names/icons/colors, date-range math
  components/  RangePicker, SpendingCard, CategoryCard, MerchantsCard, TransactionsCard
```
