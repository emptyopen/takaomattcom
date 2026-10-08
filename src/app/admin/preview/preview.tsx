'use client';
import { useEffect, useMemo, useState } from 'react';
import MutexDashboard from '@/components/mutex-dashboard';

export default function Preview() {
  const [app, setApp] = useState('mutex');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sample = useMemo(() => {
    const values = [8, 12, 4, 0, 0, 3, 14, 22, 34, 52, 28, 31, 48, 71, 90, 62, 44, 30, 58, 80, 101, 65, 47, 29];
    return { status: { paused: false, durable: true, updated_at: null }, metrics: {
      generated_at: new Date().toISOString(), measured_since: new Date(Date.now() - 86400000).toISOString(), durable: true,
      totals: { pods: 24, agents: 67, connections: 31, new_pods_hour: 2, new_pods_day: 7, messages_hour: 29, messages_day: values.reduce((a, b) => a + b, 0) },
      buckets: values.map((messages, i) => ({ at: new Date(Date.now() - (24 - i) * 3600000).toISOString(), messages })),
    } };
  }, []);
  if (!mounted) return <main className="container"><p>Loading local preview…</p></main>;
  return <main className="container admin-container"><h1>Admin</h1><p>Dashboard layout preview</p>
    <div className="admin-app-tabs" role="tablist" aria-label="Apps">{['mutex', 'nextbite'].map(id => <button key={id} role="tab" aria-selected={app === id} onClick={() => setApp(id)}>{id === 'mutex' ? 'Mutex' : 'NextBite'}</button>)}</div>
    {app === 'mutex' ? <><MutexDashboard user={null} preview={sample} /><section className="card"><h2>Mutex Pro Grants</h2><p>Existing grant and revoke controls appear here after sign-in. Disabled in this preview.</p><button disabled>Grant Pro</button></section></> : <section className="card"><h2>NextBite banner</h2><p>The existing NextBite banner control remains in this tab. Sign in to the admin dashboard to edit it.</p><button disabled>Save</button></section>}
  </main>;
}
