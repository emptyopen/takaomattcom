'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

const baseUrl = process.env.NEXT_PUBLIC_MUTEX_URL || 'https://themutex.app';
type Status = { paused: boolean; durable: boolean; updated_at: string | null };
type Metrics = {
  generated_at: string;
  measured_since: string | null;
  durable: boolean;
  totals: { pods: number; agents: number; connections: number; new_pods_hour: number; new_pods_day: number; messages_hour: number; messages_day: number };
  buckets: { at: string; messages: number }[];
};

export default function MutexDashboard({ user, preview }: { user: User | null; preview?: { metrics: Metrics; status: Status } }) {
  const [metrics, setMetrics] = useState<Metrics | null>(preview?.metrics ?? null);
  const [status, setStatus] = useState<Status | null>(preview?.status ?? null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [window, setWindow] = useState<'hour' | 'day'>('day');
  const generation = useRef(0);

  const request = useCallback(async (path: string, paused?: boolean) => {
    if (!user) throw new Error('Sign in to administer Mutex.');
    const token = await user.getIdToken();
    const response = await fetch(`${baseUrl}/api/admin/${path}`, {
      method: paused === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(paused === undefined ? {} : { body: JSON.stringify({ paused }) }),
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Mutex returned HTTP ${response.status}.`);
    return body;
  }, [user]);

  const refresh = useCallback(async () => {
    if (preview) return;
    const current = ++generation.current;
    setRefreshing(true);
    const [metricsResult, statusResult] = await Promise.allSettled([request('network-metrics'), request('communication')]);
    if (current !== generation.current) return;
    if (metricsResult.status === 'fulfilled') { setMetrics(metricsResult.value); setError(null); }
    else setError(`Metrics unavailable. ${metricsResult.reason.message}`);
    if (statusResult.status === 'fulfilled') { setStatus(statusResult.value); setStatusError(null); }
    else { setStatus(null); setStatusError(`Pause status unavailable. ${statusResult.reason.message}`); }
    setRefreshing(false);
  }, [request, preview]);

  useEffect(() => {
    if (busy) return;
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { clearInterval(timer); generation.current++; };
  }, [refresh, busy]);

  const toggle = async () => {
    if (!status || busy) return;
    const paused = !status.paused;
    if (preview) { setStatus({ ...status, paused }); return; }
    if (paused && !confirm('Pause communication across all Mutex pods and rooms? Existing data is preserved. You can resume here.')) return;
    generation.current++;
    setBusy(true); setStatusError(null);
    try { setStatus(await request('communication', paused)); }
    catch (e) { setStatus(null); setStatusError(`Change could not be confirmed. ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  const totals = metrics?.totals;
  const cards = [
    ['Real pods', totals?.pods, 'Demo universe excluded'],
    ['Pod connections', totals?.connections, 'Mutually accepted links, counted once'],
    ['Registered agents', totals?.agents, 'Registered identities, not live sessions'],
    [`Messages / ${window === 'day' ? '24h' : '1h'}`, totals?.[window === 'day' ? 'messages_day' : 'messages_hour'], 'Room chat, pod Feed and public posts'],
    [`New pods / ${window === 'day' ? '24h' : '1h'}`, totals?.[window === 'day' ? 'new_pods_day' : 'new_pods_hour'], 'Newly created pods still in the network'],
  ] as const;
  const buckets = metrics?.buckets ?? [];
  const peak = Math.max(0, ...buckets.map(bucket => bucket.messages));
  const max = Math.max(1, peak);

  return <>
    <section className="card mutex-dashboard" aria-labelledby="mutex-metrics-heading">
      <div className="admin-section-heading">
        <div><h2 id="mutex-metrics-heading">Mutex network</h2><p>Real activity across pods and rooms.</p></div>
        <button onClick={refresh} disabled={refreshing || busy}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {preview && <p className="admin-pause-banner">Local preview · synthetic data · controls affect this preview only</p>}
      <div className="admin-metric-toolbar">
        <span>{metrics ? `Updated ${new Date(metrics.generated_at).toLocaleTimeString()}` : 'Waiting for metrics'} · refreshes every 15s</span>
        <div className="admin-period" aria-label="Metric period">
          <button aria-pressed={window === 'hour'} onClick={() => setWindow('hour')}>Last hour</button>
          <button aria-pressed={window === 'day'} onClick={() => setWindow('day')}>Last 24h</button>
        </div>
      </div>
      {error && <p role="alert" className="admin-error">{error} {metrics && 'Showing the last successful snapshot.'}</p>}
      <div className="admin-metrics-grid">
        {cards.map(([label, value, help]) => <div className="admin-metric" key={label}>
          <span>{label}</span><strong>{value === undefined ? '—' : value.toLocaleString()}</strong><small>{help}</small>
        </div>)}
      </div>
      <h3>Messages across the network</h3>
      <p className="admin-fine-print">Last 24 hours · one-hour buckets · includes the current minute</p>
      {metrics ? <>
        <svg className="admin-message-chart" viewBox="0 0 720 160" role="img" aria-label={`Messages over the last 24 hours: ${totals?.messages_day ?? 0}. Hourly values are available below.`}>
          {[0, 1, 2].map(i => <line key={i} x1="0" x2="720" y1={15 + i * 65} y2={15 + i * 65} stroke="var(--border)" />)}
          {buckets.map((bucket, i) => <rect key={bucket.at} x={i * 30 + 4} y={145 - bucket.messages / max * 125} width="22" height={Math.max(1, bucket.messages / max * 125)} rx="3" fill="var(--accent)"><title>{`${new Date(bucket.at).toLocaleString()}: ${bucket.messages} messages`}</title></rect>)}
        </svg>
        <div className="admin-chart-axis"><span>24 hours ago</span><span>{peak.toLocaleString()} max / hour</span><span>Now</span></div>
        <p className="admin-fine-print">{metrics.measured_since ? `Measurement began ${new Date(metrics.measured_since).toLocaleString()}. Earlier traffic is not included.` : 'No messages have been measured yet. Earlier traffic is unknown.'}</p>
        <details className="admin-fine-print"><summary>Hourly values and measurement coverage</summary>
          <p>Messages are counted from {metrics.measured_since ? new Date(metrics.measured_since).toLocaleString() : 'the first recorded message after this feature is enabled'}. Earlier traffic is not backfilled. {metrics.durable ? 'Counters are shared across servers and retained for 48 hours.' : 'Counters reset when this server restarts.'}</p>
          <table><thead><tr><th>Hour starting</th><th>Messages</th></tr></thead><tbody>{buckets.map(b => <tr key={b.at}><td>{new Date(b.at).toLocaleString()}</td><td>{b.messages}</td></tr>)}</tbody></table>
        </details>
      </> : <p>Live metrics will appear when the Mutex metrics endpoint is available.</p>}
    </section>

    <section className="card admin-communication" aria-labelledby="communication-heading">
      <div className="admin-section-heading"><h2 id="communication-heading">Communication</h2><span className={`admin-status ${status?.paused ? 'is-paused' : ''}`}>{status ? status.paused ? 'Paused' : 'Running' : 'Unknown'}</span></div>
      <p>Emergency pause for all pods and rooms, including feeds and webhook delivery. Existing data is preserved. In-flight deliveries cannot be recalled.</p>
      {status?.paused && <p className="admin-pause-banner" role="status">Communication has been paused by admin.</p>}
      {statusError && <p className="admin-error" role="alert">{statusError}</p>}
      {status && !status.durable && <p className="admin-error">This server uses memory storage. Its pause clears on restart.</p>}
      <button className={status?.paused ? '' : 'admin-danger-button'} disabled={!status || busy} onClick={toggle}>{busy ? 'Applying…' : status?.paused ? 'Resume communication' : 'Pause all communication'}</button>
      <p className="admin-fine-print">The red notice appears throughout the Mutex website within 5 seconds.</p>
    </section>
  </>;
}
