// Pulls data from Plaid for each connected item and saves it to the store.
const { decrypt } = require('./crypto');
const store = require('./store');

function errorCode(err) {
  return err.response && err.response.data ? err.response.data.error_code : null;
}

// Bank transactions: everything new since the saved cursor. Plaid pages
// results, so loop until has_more is false, then save all pages together.
async function syncTransactions(plaid, item) {
  const accessToken = decrypt(item.accessTokenEnc);
  let added = [];
  let modified = [];
  let removed = [];
  let cursor = item.cursor;
  let hasMore = true;

  while (hasMore) {
    let page;
    try {
      page = (await plaid.transactionsSync({ access_token: accessToken, cursor: cursor || undefined, count: 500 }))
        .data;
    } catch (err) {
      // Plaid's data changed mid-pagination: throw away this run's pages and restart.
      if (errorCode(err) === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
        added = [];
        modified = [];
        removed = [];
        cursor = item.cursor;
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

  store.applySync(item.itemId, { added, modified, removed, cursor });
  return { added: added.length, modified: modified.length, removed: removed.length };
}

// YYYY-MM-DD in local time. toISOString would use UTC, which is already
// "tomorrow" on Arizona evenings.
function isoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Brokerage: current holdings plus the last year of buys, sells, and dividends.
// Plaid replaces this data each time rather than sending changes, so we save a
// fresh snapshot on every sync.
async function syncInvestments(plaid, item) {
  const accessToken = decrypt(item.accessTokenEnc);
  const holdings = (await plaid.investmentsHoldingsGet({ access_token: accessToken })).data;

  const securities = new Map(holdings.securities.map((s) => [s.security_id, s]));
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 1);

  const transactions = [];
  let total = Infinity;
  while (transactions.length < total) {
    const page = (
      await plaid.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: isoDate(start),
        end_date: isoDate(end),
        options: { count: 500, offset: transactions.length },
      })
    ).data;
    transactions.push(...page.investment_transactions);
    for (const s of page.securities) securities.set(s.security_id, s);
    total = page.total_investment_transactions;
    if (page.investment_transactions.length === 0) break;
  }

  store.setInvestments(item.itemId, {
    accounts: holdings.accounts,
    holdings: holdings.holdings,
    securities: [...securities.values()],
    transactions,
    asOf: new Date().toISOString(),
  });
  return { holdings: holdings.holdings.length, transactions: transactions.length };
}

// Syncs every item. One item failing (for example a brokerage whose data isn't
// ready yet) doesn't stop the others; its error is returned in the results.
async function syncAll(plaid) {
  const results = [];
  for (const item of store.getItems()) {
    try {
      const result =
        item.kind === 'investments' ? await syncInvestments(plaid, item) : await syncTransactions(plaid, item);
      results.push({ institution: item.institution, kind: item.kind, ...result });
    } catch (err) {
      const code = errorCode(err) || 'SYNC_FAILED';
      console.error(`sync ${item.institution || item.itemId}: ${code}`);
      results.push({ institution: item.institution, kind: item.kind, error: code });
    }
  }
  store.markSynced();
  return results;
}

module.exports = { syncAll, isoDate };
