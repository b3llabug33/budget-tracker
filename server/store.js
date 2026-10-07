// Temporary JSON file storage. Milestone 2 replaces this with Postgres.
//
// Shape of server/data/store.json:
//   items:        { [itemId]: { itemId, accessTokenEnc, institution, kind, cursor } }
//                 kind is 'bank' (transactions) or 'investments' (brokerage)
//   transactions: { [itemId]: { [transactionId]: Plaid transaction } }
//   investments:  { [itemId]: { accounts, holdings, securities, transactions, asOf } }
//   history:      [{ date, value }]  total portfolio value, one entry per day synced
//   lastSync:     ISO timestamp
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const EMPTY = { items: {}, transactions: {}, investments: {}, history: [], lastSync: null };

function load() {
  if (!fs.existsSync(STORE_FILE)) return structuredClone(EMPTY);
  const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));

  // Upgrade the original single-bank format.
  if (data.item) {
    const { itemId } = data.item;
    data.items = { [itemId]: { ...data.item, kind: 'bank', cursor: data.cursor } };
    data.transactions = { [itemId]: data.transactions || {} };
    delete data.item;
    delete data.cursor;
  }
  return { ...structuredClone(EMPTY), ...data };
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file first so a crash mid-write can't corrupt the store.
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function getItems(kind) {
  return Object.values(load().items).filter((item) => !kind || item.kind === kind);
}

// Adds a connection. Reconnecting the same institution replaces the old one
// and its data, so nothing is counted twice.
function addItem(item) {
  const data = load();
  for (const old of Object.values(data.items)) {
    if (old.kind === item.kind && old.institution === item.institution) {
      delete data.items[old.itemId];
      delete data.transactions[old.itemId];
      delete data.investments[old.itemId];
    }
  }
  data.items[item.itemId] = { ...item, cursor: null };
  save(data);
}

// Applies one full /transactions/sync result and the new cursor in a single save.
function applySync(itemId, { added, modified, removed, cursor }) {
  const data = load();
  const txns = data.transactions[itemId] || {};
  for (const t of [...added, ...modified]) txns[t.transaction_id] = t;
  for (const r of removed) delete txns[r.transaction_id];
  data.transactions[itemId] = txns;
  data.items[itemId].cursor = cursor;
  save(data);
}

function getTransactions() {
  const data = load();
  return Object.values(data.transactions)
    .flatMap((txns) => Object.values(txns))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function setInvestments(itemId, snapshot) {
  const data = load();
  data.investments[itemId] = snapshot;
  save(data);
}

function getInvestments() {
  return Object.values(load().investments);
}

// Saves today's total portfolio value. A second sync on the same day overwrites it.
function recordHistory(date, value) {
  const data = load();
  data.history = data.history.filter((h) => h.date !== date);
  data.history.push({ date, value });
  data.history.sort((a, b) => a.date.localeCompare(b.date));
  save(data);
}

function getHistory() {
  return load().history;
}

function markSynced() {
  const data = load();
  data.lastSync = new Date().toISOString();
  save(data);
}

function getStatus() {
  const data = load();
  const items = Object.values(data.items);
  const bank = items.find((i) => i.kind === 'bank');
  const brokerage = items.find((i) => i.kind === 'investments');
  return {
    connected: Boolean(bank),
    institution: bank ? bank.institution : null,
    brokerage: brokerage ? brokerage.institution : null,
    lastSync: data.lastSync,
  };
}

module.exports = {
  getItems,
  addItem,
  applySync,
  getTransactions,
  setInvestments,
  getInvestments,
  recordHistory,
  getHistory,
  markSynced,
  getStatus,
};
