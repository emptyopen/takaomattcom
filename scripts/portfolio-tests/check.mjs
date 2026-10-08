import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

// emulators:exec sets FIRESTORE_EMULATOR_HOST; only ever target a local emulator.
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8097').split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-portfolio', firestore: {
  host, port: Number(port), rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
} });
try {
  const owner = env.authenticatedContext('h6yAgTDOXxcavDyNA5dqJsvgcVR2').firestore();
  const stranger = env.authenticatedContext('unrelated-user').firestore();
  const guest = env.unauthenticatedContext().firestore();
  const data = { updatedAt: '2026-09-26', projects: [] };
  await assertSucceeds(setDoc(doc(owner, 'portfolio/overview'), data));
  await assertSucceeds(getDoc(doc(owner, 'portfolio/overview')));
  for (const db of [stranger, guest]) {
    await assertFails(getDoc(doc(db, 'portfolio/overview')));
    await assertFails(setDoc(doc(db, 'portfolio/overview'), data));
    await assertFails(deleteDoc(doc(db, 'portfolio/overview')));
  }
  await assertFails(setDoc(doc(owner, 'portfolio/other'), data));
  await assertSucceeds(deleteDoc(doc(owner, 'portfolio/overview')));
  console.log('PASS: owner access, guest/other-user denial, unrelated path denial (10 assertions).');
} finally { await env.cleanup(); }
