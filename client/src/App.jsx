import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from './api';
import { rangeFor } from './format';
import RangePicker from './components/RangePicker';
import SpendingCard from './components/SpendingCard';
import CategoryCard from './components/CategoryCard';
import MerchantsCard from './components/MerchantsCard';
import TransactionsCard from './components/TransactionsCard';

export default function App() {
  const [status, setStatus] = useState(null);
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [dashboard, setDashboard] = useState({});
  const [loading, setLoading] = useState(false);
  const [linkToken, setLinkToken] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);

  // Loads every card for the selected range in parallel.
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const dates = { start: range.start, end: range.end };
      const [s, trend, byCategory, byMerchant, tx] = await Promise.all([
        api('/api/status'),
        api('/api/spending/trend', { params: { ...dates, prevStart: range.prevStart, prevEnd: range.prevEnd } }),
        api('/api/spending/by-category', { params: dates }),
        api('/api/spending/by-merchant', { params: dates }),
        api('/api/transactions', { params: dates }),
      ]);
      setStatus(s);
      setDashboard({ trend, byCategory, byMerchant, transactions: tx.transactions });
      setError('');
    } catch (err) {
      setError(`Can't reach the server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      await api('/api/sync', { method: 'POST' });
      await loadDashboard();
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard]);

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
  const connected = Boolean(status && status.connected);

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Spending</h1>
          {status && (
            <p className="status">
              {demo
                ? 'Demo data'
                : connected
                  ? `${status.institution || 'Bank'} · ${status.lastSync ? 'synced ' + new Date(status.lastSync).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not synced yet'}`
                  : 'No bank connected'}
            </p>
          )}
        </div>
        <div className="top-actions">
          {!demo && connected && (
            <button className="icon-button" onClick={sync} disabled={syncing} aria-label="Sync transactions" title="Sync transactions">
              <span className={syncing ? 'spin' : ''} aria-hidden="true">⟳</span>
            </button>
          )}
          {!demo && (
            <button className="primary" onClick={connectBank}>
              {connected ? 'Reconnect' : 'Connect bank'}
            </button>
          )}
        </div>
      </header>

      {demo && (
        <p className="banner">
          You're looking at sample data. Add Plaid keys to <code>server/.env</code> to connect a real bank.
        </p>
      )}
      {error && <p className="banner error">{error}</p>}

      <RangePicker preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

      {/* Keep the previous numbers on screen (faded) while new ones load. */}
      <main className={loading ? 'grid loading' : 'grid'}>
        <SpendingCard trend={dashboard.trend} range={range} />
        <CategoryCard data={dashboard.byCategory} />
        <MerchantsCard key={range.start + range.end} data={dashboard.byMerchant} range={range} />
        <TransactionsCard key={'t' + range.start + range.end} transactions={dashboard.transactions} />
      </main>
    </div>
  );
}
