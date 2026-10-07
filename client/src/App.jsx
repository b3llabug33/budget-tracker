import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

// Small fetch wrapper that throws the server's error message on failure.
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  return body;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCategory(category) {
  // FOOD_AND_DRINK -> Food and drink
  if (!category) return '';
  const words = category.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api('/api/status'), api('/api/transactions')]);
      setStatus(s);
      setTransactions(t.transactions);
    } catch (err) {
      setError(`Can't reach the server: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const result = await api('/api/sync', { method: 'POST' });
      setMessage(`Synced: ${result.added} added, ${result.modified} modified, ${result.removed} removed`);
      await refresh();
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  // Plaid Link calls this after the bank login succeeds.
  const onSuccess = useCallback(
    async (publicToken, metadata) => {
      try {
        await api('/api/exchange', {
          method: 'POST',
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution ? metadata.institution.name : null,
          }),
        });
        setLinkToken(null);
        await sync();
      } catch (err) {
        setError(`Connecting the bank failed: ${err.message}`);
      }
    },
    [sync]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // Open Link as soon as the link token arrives and the Plaid script is loaded.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function connectBank() {
    setError('');
    try {
      const { link_token } = await api('/api/link-token', { method: 'POST' });
      setLinkToken(link_token);
    } catch (err) {
      setError(`Couldn't start Plaid Link: ${err.message}`);
    }
  }

  const demo = Boolean(status && status.demo);

  return (
    <main>
      <header>
        <h1>Budget Tracker</h1>
        {status && !status.demo && (
          <p className="status">
            {status.connected ? `Connected to ${status.institution || 'bank'}` : 'No bank connected'}
            {' · '}Plaid {status.plaidEnv}
            {status.lastSync && ` · Last sync ${new Date(status.lastSync).toLocaleString()}`}
          </p>
        )}
      </header>

      {demo && (
        <p className="demo-banner">
          Demo mode: showing sample transactions. Add Plaid keys to <code>server/.env</code> to connect a real bank.
        </p>
      )}

      <div className="actions">
        <button onClick={connectBank} disabled={demo}>
          {status && status.connected ? 'Reconnect bank' : 'Connect bank'}
        </button>
        <button onClick={sync} disabled={demo || syncing || !(status && status.connected)}>
          {syncing ? 'Syncing…' : 'Sync transactions'}
        </button>
      </div>

      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th className="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className={t.pending ? 'pending' : ''}>
              <td>{t.date}</td>
              <td>{t.merchant}</td>
              <td>{formatCategory(t.category)}</td>
              {/* Plaid amounts: positive = money out, negative = money in */}
              <td className={`amount ${t.amount < 0 ? 'in' : ''}`}>
                {t.amount < 0 ? '+' : '-'}
                {money.format(Math.abs(t.amount))}
              </td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                No transactions yet. Connect a bank, then sync.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
