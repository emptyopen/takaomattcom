// Single shared Firebase Web SDK instance for the entire site. The values are
// public — the real security is enforced by Firestore rules (which should
// gate the `flags` collection to admin UIDs).

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;

function ensureApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(ensureApp());
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(ensureApp());
  return _db;
}

/** Allowlist of admin UIDs; comma-separated in env. Empty list = nobody. */
export function adminUids(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isAdmin(uid: string | null | undefined): boolean {
  if (!uid) return false;
  return adminUids().includes(uid);
}
