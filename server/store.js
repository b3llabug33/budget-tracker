// Temporary JSON file storage. Milestone 2 replaces this with Postgres.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const EMPTY = { item: null, cursor: null, lastSync: null, transactions: {} };

function load() {
  if (!fs.existsSync(STORE_FILE)) return structuredClone(EMPTY);
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file first so a crash mid-write can't corrupt the store.
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

// item = { itemId, accessTokenEnc, institution }
function getItem() {
  return load().item;
}

function setItem(item) {
  const data = load();
  data.item = item;
  // A new bank connection starts its transaction history from scratch.
  data.cursor = null;
  data.transactions = {};
  save(data);
}

function getCursor() {
  return load().cursor;
}

// Applies one full /transactions/sync result and the new cursor in a single save.
function applySync({ added, modified, removed, cursor }) {
  const data = load();
  for (const t of [...added, ...modified]) data.transactions[t.transaction_id] = t;
  for (const r of removed) delete data.transactions[r.transaction_id];
  data.cursor = cursor;
  data.lastSync = new Date().toISOString();
  save(data);
}

function getTransactions() {
  return Object.values(load().transactions).sort((a, b) => b.date.localeCompare(a.date));
}

function getStatus() {
  const data = load();
  return {
    connected: Boolean(data.item),
    institution: data.item ? data.item.institution : null,
    lastSync: data.lastSync,
    transactionCount: Object.keys(data.transactions).length,
  };
}

module.exports = { getItem, setItem, getCursor, applySync, getTransactions, getStatus };
