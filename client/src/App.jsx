import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from './api';
import { rangeFor } from './format';
import RangePicker from './components/RangePicker';
import SpendingCard from './components/SpendingCard';
import CategoryCard from './components/CategoryCard';
import MerchantsCard from './components/MerchantsCard';
import TransactionsCard from './components/TransactionsCard';
import InvestmentsView from './components/InvestmentsView';

const VIEWS = [
  ['spending', 'Spending'],
  ['investments', 'Investments'],
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [view, setView] = useState('spending');
  const [investments, setInvestments] = useState(null);
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [dashboard, setDashboard] = useState({});
  const [loading, setLoading] = useState(false);
  const [linkToken, setLinkToken] = useState(null);
  const [linkKind, setLinkKind] = useState('bank'); // what the open Plaid Link is connecting
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);

  // Loads every card for the selected range, plus investments, in parallel.
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const dates = { start: range.start, end: range.end };
      const [s, trend, byCategory, byMerchant, tx, inv] = await Promise.all([
        api('/api/status'),
        api('/api/spending/trend', { params: { ...dates, prevStart: range.prevStart, prevEnd: range.prevEnd } }),
        api('/api/spending/by-category', { params: dates }),
        api('/api/spending/by-merchant', { params: dates }),
        api('/api/transactions', { params: dates }),
        api('/api/investments'),
      ]);
      setStatus(s);
      setInvestments(inv);
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
            kind: linkKind,
          }),
        });
        setLinkToken(null);
        await sync();
      } catch (err) {
        setError(`Connecting the bank failed: ${err.message}`);
      }
    },
    [sync, linkKind]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // Open Link as soon as the link token arrives and the Plaid script is loaded.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  // kind: 'bank' for BofA transactions, 'investments' for Webull holdings
  async function connect(kind) {
    setError('');
    try {
      const { link_token } = await api('/api/link-token', { method: 'POST', body: JSON.stringify({ kind }) });
      setLinkKind(kind);
      setLinkToken(link_token);
    } catch (err) {
      setError(`Couldn't start Plaid Link: ${err.message}`);
    }
  }

  const demo = Boolean(status && status.demo);
  const connected = Boolean(status && status.connected);
  const brokerConnected = Boolean(status && status.brokerage);
  const anyConnected = connected || brokerConnected;

  return (
    <div className="page">
      <header className="top">
        <div>
          <p className="prompt">
            bella@budget:~$ <span>./{view}</span>
          </p>
          <h1>{view === 'spending' ? 'Spending' : 'Investments'}</h1>
          {status && (
            <p className="status">
              {demo
                ? 'Demo data'
                : anyConnected
                  ? `${[status.institution, status.brokerage].filter(Boolean).join(' + ')} · ${status.lastSync ? 'synced ' + new Date(status.lastSync).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not synced yet'}`
                  : 'Nothing connected yet'}
            </p>
          )}
        </div>
        <div className="top-actions">
          {!demo && anyConnected && (
            <button className="icon-button" onClick={sync} disabled={syncing} aria-label="Sync transactions" title="Sync transactions">
              <span className={syncing ? 'spin' : ''} aria-hidden="true">⟳</span>
            </button>
          )}
          {!demo && view === 'spending' && (
            <button className="primary" onClick={() => connect('bank')}>
              {connected ? 'Reconnect' : 'Connect bank'}
            </button>
          )}
          {!demo && view === 'investments' && brokerConnected && (
            <button className="primary" onClick={() => connect('investments')}>
              Reconnect
            </button>
          )}
        </div>
      </header>

      {demo && (
        <p className="banner">
          You're looking at sample data. Add Plaid keys to <code>server/.env</code> to connect real accounts.
        </p>
      )}
      {error && <p className="banner error">{error}</p>}

      <div className="tabs" role="tablist" aria-label="View">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={view === value}
            className={view === value ? 'active' : ''}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'spending' ? (
        <>
          <RangePicker preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

          {/* Keep the previous numbers on screen (faded) while new ones load. */}
          <main className={loading ? 'grid loading' : 'grid'}>
            <SpendingCard trend={dashboard.trend} range={range} />
            <CategoryCard data={dashboard.byCategory} />
            <MerchantsCard key={range.start + range.end} data={dashboard.byMerchant} range={range} />
            <TransactionsCard key={'t' + range.start + range.end} transactions={dashboard.transactions} />
          </main>
        </>
      ) : (
        <InvestmentsView data={investments} demo={demo} onConnect={() => connect('investments')} />
      )}
    </div>
  );
}
