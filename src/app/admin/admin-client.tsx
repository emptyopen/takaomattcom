'use client';

import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseAuth, isAdmin } from '@/lib/firebase';

// Flag IDs the admin portal can edit. Add new entries to expand the
// surface — each becomes a Banner card on the page. Multiple apps live
// side by side here, e.g. add { id: 'someother_banner', label: 'Other app' }.
const BANNERS: { id: string; label: string }[] = [
  { id: 'nextbite_banner', label: 'NextBite banner' },
];

type BannerFlag = {
  enabled: boolean;
  text: string;
  url: string;
  color: string;
};

const emptyFlag: BannerFlag = {
  enabled: false,
  text: '',
  url: '',
  color: '',
};

export default function AdminClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
  }, []);

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
        <p>Sign in with Google to manage flags.</p>
        <button
          onClick={async () => {
            try {
              await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
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
        <button onClick={() => signOut(getFirebaseAuth())}>Sign out</button>
      </div>
      <p>
        Signed in as <strong>{user.email}</strong>. Edits write directly to
        Firestore — clients pick them up in real time.
      </p>

      {BANNERS.map((b) => (
        <BannerEditor key={b.id} flagId={b.id} label={b.label} />
      ))}
    </main>
  );
}

function BannerEditor({ flagId, label }: { flagId: string; label: string }) {
  const [flag, setFlag] = useState<BannerFlag | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(getDb(), 'flags', flagId));
        const data = (snap.data() as Partial<BannerFlag> | undefined) ?? {};
        setFlag({ ...emptyFlag, ...data });
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
      // setDoc + merge so we don't blow away unrelated fields a future
      // version of the app might add to the same flag doc.
      await setDoc(doc(getDb(), 'flags', flagId), flag, { merge: true });
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

      <label>Text</label>
      <input
        type="text"
        value={flag.text}
        onChange={(e) => setFlag({ ...flag, text: e.target.value })}
        placeholder="Banner copy shown to users"
      />

      <label>URL (optional)</label>
      <input
        type="url"
        value={flag.url}
        onChange={(e) => setFlag({ ...flag, url: e.target.value })}
        placeholder="https://…"
      />

      <label>Background color (optional, #RRGGBB)</label>
      <input
        type="text"
        value={flag.color}
        onChange={(e) => setFlag({ ...flag, color: e.target.value })}
        placeholder="#0F766E"
      />

      <div style={{ marginTop: 16 }} className="row">
        <button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Path: <code>flags/{flagId}</code>
        </span>
      </div>
    </section>
  );
}
