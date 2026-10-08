'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';

type Project = {
  id: 'mutex' | 'nextbite'; name: string; status: string; billing: string;
  spending: string; source: string; priorities: string[]; blockers: string[];
};
type Overview = { updatedAt: string; projects: Project[] };

// Allow only text summaries. Private data is fetched after sign-in, never
// imported into the static site's JavaScript bundle.
function parseOverview(raw: unknown): Overview {
  if (!raw || typeof raw !== 'object') throw new Error('Expected a portfolio snapshot.');
  const input = raw as Record<string, unknown>;
  if (typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw new Error('A valid updatedAt date is required.');
  }
  if (!Array.isArray(input.projects) || input.projects.length !== 2) {
    throw new Error('Include exactly Mutex and NextBite.');
  }
  const projects = input.projects.map((entry: unknown): Project => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid project.');
    const p = entry as Record<string, unknown>;
    if (p.id !== 'mutex' && p.id !== 'nextbite') throw new Error('Unknown project.');
    const text = (key: string): string => {
      const value = p[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
        throw new Error(`Invalid ${key}.`);
      }
      return value;
    };
    const list = (key: string): string[] => {
      const value = p[key];
      if (!Array.isArray(value) || value.length > 5 || value.some(v => typeof v !== 'string' || v.length > 1000)) {
        throw new Error(`Invalid ${key}.`);
      }
      return value as string[];
    };
    return { id: p.id, name: text('name'), status: text('status'), billing: text('billing'),
      spending: text('spending'), source: text('source'), priorities: list('priorities'), blockers: list('blockers') };
  });
  if (new Set(projects.map(p => p.id)).size !== 2) throw new Error('Duplicate project.');
  return { updatedAt: input.updatedAt, projects };
}

export default function PortfolioOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [preview, setPreview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState('Loading saved overview…');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getDoc(doc(getDb(), 'portfolio', 'overview')).then(snapshot => {
      if (!active) return;
      if (snapshot.exists()) setOverview(parseOverview(snapshot.data()));
      setNotice(snapshot.exists() ? 'Saved snapshot loaded.' : 'No saved snapshot yet. Import a reviewed summary below.');
    }).catch(() => {
      if (active) setNotice('Saved overview unavailable. Check owner access and deployed portfolio rules. You can still preview a local snapshot.');
    });
    return () => { active = false; };
  }, []);
  const shown = preview ?? overview;
  const stale = shown && Date.now() - Date.parse(shown.updatedAt) > 7 * 86400000;
  return (
    <section className="card" aria-label="Portfolio overview">
      <h2>Portfolio overview</h2>
      <p>Mutex and NextBite: launch readiness, priorities, and decisions from their living plans.</p>
      <p role="status">{notice}</p>
      {shown && <>
        <p><strong>{preview ? 'Unsaved preview' : 'Saved snapshot'}</strong> · Evidence dated {shown.updatedAt}.
          {' '}This is a reviewed snapshot, not live monitoring.</p>
        {stale && <p style={{ color: 'var(--accent)' }}>This snapshot is over seven days old. Refresh evidence before acting.</p>}
        {shown.projects.map(p => <article className="card" key={p.id}>
          <h3>{p.name}</h3>
          <p><strong>Launch:</strong> {p.status}</p>
          <p><strong>Billing:</strong> {p.billing}</p>
          <p><strong>Spending:</strong> {p.spending}</p>
          <h4>Next priorities</h4><ol>{p.priorities.map((v, i) => <li key={i}>{v}</li>)}</ol>
          <h4>Blockers / decisions</h4>
          {p.blockers.length ? <ul>{p.blockers.map((v, i) => <li key={i}>{v}</li>)}</ul> : <p>None recorded.</p>}
          <p style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Source: {p.source}</p>
        </article>)}
      </>}
      <label htmlFor="portfolio-file">Import reviewed summary (JSON, up to 32 KB)</label>
      <input id="portfolio-file" type="file" accept="application/json,.json" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          if (file.size > 32768) throw new Error('Snapshot is too large.');
          setPreview(parseOverview(JSON.parse(await file.text())));
          setNotice('Preview only. Review the summary before saving to the private overview.');
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Invalid snapshot.'); }
      }} />
      {preview && <div className="row" style={{ marginTop: 12 }}>
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await setDoc(doc(getDb(), 'portfolio', 'overview'), preview);
            setOverview(preview); setPreview(null); setNotice('Private overview saved.');
          } catch { setNotice('Save failed. Preview retained; verify owner access and deployed rules.'); }
          finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save private overview'}</button>
        <button disabled={busy} onClick={() => { setPreview(null); setNotice('Preview discarded.'); }}>Discard preview</button>
      </div>}
    </section>
  );
}
