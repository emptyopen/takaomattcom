'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getFirebaseAuth,
  getNextbiteAuth,
  getNextbiteDb,
  isAdmin,
} from '@/lib/firebase';

type MutexGrant = {
  uid: string;
  email?: string;
  grantedAt: string;
  grantedBy?: string;
};

// Flag IDs the admin portal can edit. Add new entries to expand the
// surface — each becomes a Banner card on the page. Multiple apps live
// side by side here, e.g. add { id: 'someother_banner', label: 'Other app' }.
const BANNERS: { id: string; label: string }[] = [
  { id: 'nextbite_banner', label: 'NextBite banner' },
];

type BannerFlag = {
  enabled: boolean;
};

const emptyFlag: BannerFlag = {
  enabled: false,
};

// Sign in to the site's project (for the admin gate) and reuse the same Google
// credential to also sign in to NextBite's project, so banner writes land in
// NextBite's Firestore authenticated as the same person.
//
// Credential reuse only works if this project's web OAuth client ID is listed
// under "Whitelist client IDs from external projects" in NextBite's Google
// sign-in provider. Without it Firebase rejects the token and every session
// falls back to the manual "Connect NextBite" popup.
async function signInBothProjects(): Promise<string | null> {
  const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred) return 'Google sign-in returned no reusable credential.';
  try {
    await signInWithCredential(getNextbiteAuth(), cred);
    return null;
  } catch (e) {
    // Don't block the admin UI — the "Connect NextBite" button is the fallback.
    console.error('NextBite credential sign-in failed:', e);
    return e instanceof Error ? e.message : String(e);
  }
}

export default function AdminClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [nextbiteUser, setNextbiteUser] = useState<User | null>(null);
  const [nextbiteError, setNextbiteError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    return onAuthStateChanged(getNextbiteAuth(), (u) => {
      setNextbiteUser(u);
      if (u) setNextbiteError(null);
    });
  }, []);

  // Direct-popup fallback for when the shared-credential sign-in didn't
  // establish a NextBite session.
  const connectNextbite = async () => {
    setNextbiteError(null);
    try {
      await signInWithPopup(getNextbiteAuth(), new GoogleAuthProvider());
    } catch (e) {
      console.error(e);
      setNextbiteError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!authChecked) {
    return (
      <main className="container">
        <p>Checking sign-in…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container">
        <h1>Admin</h1>
        <button
          onClick={async () => {
            try {
              setNextbiteError(await signInBothProjects());
            } catch (e) {
              console.error(e);
              alert('Sign-in failed. Check console.');
            }
          }}
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (!isAdmin(user.uid)) {
    return (
      <main className="container">
        <h1>Admin</h1>
        <p>
          Signed in as <strong>{user.email}</strong>, but this UID isn&apos;t on
          the admin list.
        </p>
        <p style={{ fontSize: 12 }}>
          Your UID: <code>{user.uid}</code>
        </p>
        <button onClick={() => signOut(getFirebaseAuth())}>Sign out</button>
      </main>
    );
  }

  return (
    <main className="container">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1>Admin</h1>
        <button
          onClick={() => {
            signOut(getFirebaseAuth());
            signOut(getNextbiteAuth());
          }}
        >
          Sign out
        </button>
      </div>
      <p>
        Signed in as <strong>{user.email}</strong>. Edits write directly to
        NextBite&apos;s Firestore — the app picks them up in real time.
      </p>

      {!nextbiteUser && (
        <section className="card" style={{ borderColor: 'crimson' }}>
          <p style={{ marginTop: 0 }}>
            Not connected to NextBite — saving is disabled. Connect to authorize
            writes into NextBite&apos;s project.
          </p>
          {nextbiteError && (
            <p style={{ fontSize: 12, color: 'crimson' }}>
              Automatic connect failed: <code>{nextbiteError}</code>
              <br />
              If this says the credential is invalid, add this site&apos;s web
              OAuth client ID to &quot;Whitelist client IDs from external
              projects&quot; in NextBite&apos;s Google sign-in provider.
            </p>
          )}
          <button onClick={connectNextbite}>Connect NextBite</button>
        </section>
      )}

      {BANNERS.map((b) => (
        <BannerEditor
          key={b.id}
          flagId={b.id}
          label={b.label}
          canWrite={!!nextbiteUser}
        />
      ))}

      <MutexEmergency user={user} />
      <MutexAdmin user={user} />
    </main>
  );
}


function BannerEditor({
  flagId,
  label,
  canWrite,
}: {
  flagId: string;
  label: string;
  canWrite: boolean;
}) {
  const [flag, setFlag] = useState<BannerFlag | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(getNextbiteDb(), 'flags', flagId));
        const data = snap.data() as { enabled?: boolean } | undefined;
        setFlag({ ...emptyFlag, enabled: data?.enabled ?? false });
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, [flagId]);

  if (err) {
    return (
      <section className="card">
        <h2>{label}</h2>
        <p style={{ color: 'crimson' }}>{err}</p>
      </section>
    );
  }
  if (!flag) {
    return (
      <section className="card">
        <h2>{label}</h2>
        <p>Loading…</p>
      </section>
    );
  }

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      // Write only `enabled`, and drop the legacy text/url/color fields so the
      // doc collapses to a single bool. deleteField() on absent fields is a
      // no-op, so this is safe whether or not they exist.
      await setDoc(
        doc(getNextbiteDb(), 'flags', flagId),
        {
          enabled: flag.enabled,
          text: deleteField(),
          url: deleteField(),
          color: deleteField(),
        },
        { merge: true },
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{label}</h2>

      <label>
        <input
          type="checkbox"
          checked={flag.enabled}
          onChange={(e) => setFlag({ ...flag, enabled: e.target.checked })}
        />{' '}
        Enabled
      </label>

      <div style={{ marginTop: 16 }} className="row">
        <button onClick={save} disabled={saving || !canWrite}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Path: <code>flags/{flagId}</code>
        </span>
      </div>
    </section>
  );
}

// NOTE: Mutex server must accept Firebase ID tokens from the takaomatt-4bc1e
// project for admin authentication. The admin UID allowlist is checked on the
// Mutex side. A parallel PR on the Mutex repo is required to add this support.
const MUTEX_URL =
  process.env.NEXT_PUBLIC_MUTEX_URL || 'https://themutex.app';

type MutexStatus = {
  locked: boolean;
  live_rooms: number;
  store: string;
  durable: boolean;
};

// Two blunt instruments for when Mutex needs to stop right now. Kept in their
// own card, above the Pro grants, so neither is ever a mis-click away.
function MutexEmergency({ user }: { user: User }) {
  const [status, setStatus] = useState<MutexStatus | null>(null);
  const [busy, setBusy] = useState<null | 'purge' | 'lock'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [user]);

  const fetchStatus = useCallback(async () => {
    setErr(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${MUTEX_URL}/api/admin/rooms/lockdown`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      setStatus(data);
    } catch (e) {
      setErr(String(e));
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handlePurge = async () => {
    const count = status?.live_rooms ?? 0;
    if (
      !confirm(
        `Destroy all ${count} live room${count === 1 ? '' : 's'} on Mutex?\n\n` +
          'Every transcript is deleted immediately and connected agents are ' +
          'disconnected. This cannot be undone.'
      )
    ) {
      return;
    }

    setBusy('purge');
    setErr(null);
    setResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${MUTEX_URL}/api/admin/rooms/purge`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      setResult(`Destroyed ${data.purged} room${data.purged === 1 ? '' : 's'}.`);
      fetchStatus();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleToggleLock = async () => {
    const next = !status?.locked;
    if (
      next &&
      !confirm('Block all new room creation on Mutex?\n\nExisting rooms keep running.')
    ) {
      return;
    }

    setBusy('lock');
    setErr(null);
    setResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${MUTEX_URL}/api/admin/rooms/lockdown`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locked: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      setResult(next ? 'Room creation is blocked.' : 'Room creation is open again.');
      fetchStatus();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const locked = status?.locked ?? false;

  return (
    <section className="card" style={{ borderColor: 'crimson' }}>
      <h2 style={{ marginTop: 0 }}>Mutex — emergency controls</h2>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Immediate, destructive, and not undoable. For shutting the service down
        in a hurry.
      </p>

      {err && <p style={{ color: 'crimson', fontSize: 13 }}>{err}</p>}
      {result && (
        <p style={{ color: 'var(--accent)', fontSize: 13 }}>{result}</p>
      )}

      <div style={{ fontSize: 13, marginBottom: 12 }}>
        {status ? (
          <>
            <div>
              Live rooms: <strong>{status.live_rooms}</strong>
            </div>
            <div>
              New rooms:{' '}
              <strong style={{ color: locked ? 'crimson' : 'inherit' }}>
                {locked ? 'BLOCKED' : 'allowed'}
              </strong>
            </div>
          </>
        ) : (
          <div>Loading status…</div>
        )}
      </div>

      {status && !status.durable && (
        <p
          style={{
            fontSize: 12,
            color: 'crimson',
            border: '1px solid crimson',
            padding: '8px 10px',
            marginBottom: 12,
          }}
        >
          Mutex is running the in-memory store, so this switch is not durable:
          a restart, a deploy, or the machine idling to zero clears it and new
          rooms are allowed again. Treat it as a stopgap and follow up by
          scaling the app down, until REDIS_URL is set.
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button
          onClick={handlePurge}
          disabled={busy !== null}
          style={{
            background: 'crimson',
            color: 'white',
            border: '1px solid crimson',
          }}
        >
          {busy === 'purge' ? 'Destroying…' : 'Destroy all rooms'}
        </button>

        <button
          onClick={handleToggleLock}
          disabled={busy !== null || status === null}
          style={{
            background: 'transparent',
            color: 'crimson',
            border: '1px solid crimson',
          }}
        >
          {busy === 'lock'
            ? 'Working…'
            : locked
              ? 'Allow new rooms'
              : 'Block new rooms'}
        </button>

        <button
          onClick={fetchStatus}
          disabled={busy !== null}
          style={{ background: 'transparent' }}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}

function MutexAdmin({ user }: { user: User }) {
  const [grants, setGrants] = useState<MutexGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [user]);

  const fetchGrants = useCallback(async () => {
    setErr(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${MUTEX_URL}/api/admin/pro/grants`, { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGrants(data.grants ?? []);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail.trim()) return;

    setGranting(true);
    setErr(null);
    setLastResult(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${MUTEX_URL}/api/admin/pro/grant`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `HTTP ${res.status}`);
      }
      const resultUid = data.uid || data.user?.uid;
      setLastResult(
        resultUid
          ? `Granted Pro to ${grantEmail} (uid: ${resultUid})`
          : `Granted Pro to ${grantEmail}`
      );
      setGrantEmail('');
      fetchGrants();
    } catch (e) {
      setErr(String(e));
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (grant: MutexGrant) => {
    const identifier = grant.email || grant.uid;
    if (!confirm(`Revoke Pro from ${identifier}?`)) return;

    setRevoking(grant.uid);
    setErr(null);
    setLastResult(null);

    try {
      const headers = await getAuthHeaders();
      const body = grant.email ? { email: grant.email } : { uid: grant.uid };
      const res = await fetch(`${MUTEX_URL}/api/admin/pro/revoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `HTTP ${res.status}`);
      }
      setLastResult(`Revoked Pro from ${identifier}`);
      fetchGrants();
    } catch (e) {
      setErr(String(e));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Mutex Pro Grants</h2>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Honorary/comped Pro subscriptions — not Stripe-managed. These bypass
        payment and grant full Pro access.
      </p>

      {err && (
        <p style={{ color: 'crimson', fontSize: 13 }}>{err}</p>
      )}

      {lastResult && (
        <p style={{ color: 'var(--accent)', fontSize: 13 }}>{lastResult}</p>
      )}

      <form onSubmit={handleGrant} style={{ marginBottom: 16 }}>
        <label htmlFor="mutex-grant-email">Grant Pro by email</label>
        <div className="row" style={{ marginTop: 4 }}>
          <input
            id="mutex-grant-email"
            type="email"
            placeholder="takaomatt@gmail.com"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={granting || !grantEmail.trim()}>
            {granting ? 'Granting…' : 'Grant Pro'}
          </button>
        </div>
      </form>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        Current grants ({grants.length})
      </div>

      {loading ? (
        <p>Loading grants…</p>
      ) : grants.length === 0 ? (
        <p style={{ fontSize: 13 }}>No honorary Pro grants yet.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {grants.map((g) => (
            <li
              key={g.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 13,
              }}
            >
              <div>
                <div>{g.email || '(no email)'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  uid: {g.uid}
                  {g.grantedAt && (
                    <>
                      {' · '}
                      {new Date(g.grantedAt).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(g)}
                disabled={revoking === g.uid}
                style={{
                  background: 'transparent',
                  color: 'crimson',
                  border: '1px solid crimson',
                  padding: '4px 10px',
                  fontSize: 12,
                }}
              >
                {revoking === g.uid ? '…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
