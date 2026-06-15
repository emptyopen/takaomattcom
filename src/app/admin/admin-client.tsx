'use client';

import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getFirebaseAuth,
  getNextbiteAuth,
  getNextbiteDb,
  isAdmin,
} from '@/lib/firebase';

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
async function signInBothProjects() {
  const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (cred) {
    try {
      await signInWithCredential(getNextbiteAuth(), cred);
    } catch (e) {
      // Credential reuse can fail if the site's OAuth client isn't whitelisted
      // in NextBite's Google provider. Don't block the admin UI — the
      // "Connect NextBite" button offers a direct-popup fallback.
      console.error('NextBite credential sign-in failed:', e);
    }
  }
}

export default function AdminClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [nextbiteUser, setNextbiteUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    return onAuthStateChanged(getNextbiteAuth(), setNextbiteUser);
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
        <button
          onClick={async () => {
            try {
              await signInBothProjects();
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
    </main>
  );
}

// Direct-popup fallback to authenticate against NextBite's project when the
// shared-credential sign-in didn't establish a NextBite session.
async function connectNextbite() {
  try {
    await signInWithPopup(getNextbiteAuth(), new GoogleAuthProvider());
  } catch (e) {
    console.error(e);
    alert('Could not connect to NextBite. Check console.');
  }
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
      await setDoc(doc(getNextbiteDb(), 'flags', flagId), flag, { merge: true });
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
