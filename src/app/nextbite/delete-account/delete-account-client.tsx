'use client';

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';

// Public, unauthenticated page so NextBite users can request that their account
// and data be deleted (required by app-store data-deletion policies). The site
// is a static export, so the request is written straight to the site's own
// Firestore from the browser — see the `deletion_requests` rule in
// firestore.rules, which allows a constrained create for anyone and reads for
// the admin UID only.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DeleteAccountClient() {
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const emailsMatch =
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase();
  const canSubmit = emailValid && emailsMatch && ack && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      await addDoc(collection(getDb(), 'deletion_requests'), {
        email: email.trim().toLowerCase(),
        reason: reason.trim() ? reason.trim() : null,
        status: 'pending',
        createdAt: serverTimestamp(),
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      setDone(true);
    } catch (e) {
      console.error('deletion request failed:', e);
      setErr(
        'Something went wrong submitting your request. Please try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <main className="container">
        <h1>Request received</h1>
        <p>
          We&apos;ve received your request to delete the NextBite account for{' '}
          <strong>{email.trim().toLowerCase()}</strong>. Your account and its
          associated data will be permanently deleted, typically within 30 days.
        </p>
        <p>
          If you didn&apos;t mean to submit this, reach out before the deletion
          is processed and we&apos;ll cancel the request.
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Delete your NextBite account</h1>
      <p>
        Use this form to request permanent deletion of your NextBite account and
        the data associated with it. Enter the email address you use to sign in
        to NextBite and we&apos;ll process the deletion.
      </p>
      <p>
        This removes your account profile, saved preferences, and activity
        history. Requests are typically completed within 30 days. This action
        cannot be undone.
      </p>

      <section className="card">
        <label htmlFor="email">Account email</label>
        <input
          id="email"
          type="text"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="confirmEmail">Confirm email</label>
        <input
          id="confirmEmail"
          type="text"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
        />
        {confirmEmail.length > 0 && !emailsMatch && (
          <p style={{ color: 'crimson', fontSize: 13, margin: '6px 0 0' }}>
            Email addresses don&apos;t match.
          </p>
        )}

        <label htmlFor="reason">Reason (optional)</label>
        <textarea
          id="reason"
          rows={3}
          placeholder="Anything you'd like us to know"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div
          className="row"
          style={{ marginTop: 16, alignItems: 'flex-start' }}
        >
          <input
            id="ack"
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <label
            htmlFor="ack"
            style={{
              margin: 0,
              textTransform: 'none',
              letterSpacing: 0,
              fontSize: 14,
              color: 'var(--fg)',
            }}
          >
            I understand this permanently deletes my NextBite account and all
            associated data.
          </label>
        </div>

        {err && <p style={{ color: 'crimson', marginBottom: 0 }}>{err}</p>}

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={submit} disabled={!canSubmit}>
            {saving ? 'Submitting…' : 'Request account deletion'}
          </button>
        </div>
      </section>
    </main>
  );
}
