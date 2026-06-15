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

// NextBite's own Firebase project. The admin portal signs in against the
// project above (the site's auth/allowlist), but the banner flag lives in
// NextBite's Firestore where its mobile app reads it — so we run a second,
// named Firebase app for those reads/writes.
const nextbiteConfig = {
  apiKey: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_NEXTBITE_FIREBASE_APP_ID,
};

const NEXTBITE_APP_NAME = 'nextbite';

let app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let nextbiteApp: FirebaseApp | undefined;
let _nextbiteAuth: Auth | undefined;
let _nextbiteDb: Firestore | undefined;

function ensureApp(): FirebaseApp {
  if (app) return app;
  app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(config);
  return app;
}

function ensureNextbiteApp(): FirebaseApp {
  if (nextbiteApp) return nextbiteApp;
  nextbiteApp =
    getApps().find((a) => a.name === NEXTBITE_APP_NAME) ??
    initializeApp(nextbiteConfig, NEXTBITE_APP_NAME);
  return nextbiteApp;
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

/** Auth instance for the NextBite project (for cross-project flag writes). */
export function getNextbiteAuth(): Auth {
  if (_nextbiteAuth) return _nextbiteAuth;
  _nextbiteAuth = getAuth(ensureNextbiteApp());
  return _nextbiteAuth;
}

/** Firestore for the NextBite project, where the mobile app reads its flags. */
export function getNextbiteDb(): Firestore {
  if (_nextbiteDb) return _nextbiteDb;
  _nextbiteDb = getFirestore(ensureNextbiteApp());
  return _nextbiteDb;
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
