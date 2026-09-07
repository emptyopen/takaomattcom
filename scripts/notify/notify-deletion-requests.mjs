// Scheduled notifier: emails a summary for each new `deletion_requests` doc in
// Firestore, then marks it notified so it isn't emailed twice. Runs in GitHub
// Actions (see .github/workflows/notify.yml). Uses the Firebase Admin SDK
// (bypasses Firestore rules) and Gmail SMTP via an app password. All config
// comes from env / GitHub secrets.
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

const {
  FIREBASE_SERVICE_ACCOUNT,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  NOTIFY_TO,
} = process.env;

if (!FIREBASE_SERVICE_ACCOUNT || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('Missing required env: FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const to = NOTIFY_TO || GMAIL_USER;
const snap = await db.collection('deletion_requests').get();
const pending = snap.docs.filter((d) => d.data().notified !== true);

if (pending.length === 0) {
  console.log('No new deletion requests.');
  process.exit(0);
}

let sent = 0;
for (const doc of pending) {
  const d = doc.data();
  const created =
    d.createdAt && typeof d.createdAt.toDate === 'function'
      ? d.createdAt.toDate().toISOString()
      : 'unknown';
  const body = [
    'New NextBite account-deletion request',
    '',
    `Email:     ${d.email}`,
    `Reason:    ${d.reason || '(none given)'}`,
    `Status:    ${d.status}`,
    `Submitted: ${created}`,
    `Doc ID:    ${doc.id}`,
    '',
    'Recorded in Firestore collection "deletion_requests" (project takaomatt-4bc1e).',
  ].join('\n');

  await transporter.sendMail({
    from: `NextBite Deletion Requests <${GMAIL_USER}>`,
    to,
    subject: `NextBite account deletion request: ${d.email}`,
    text: body,
  });
  await doc.ref.update({
    notified: true,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  sent += 1;
  console.log(`Notified for ${doc.id} (${d.email})`);
}
console.log(`Sent ${sent} notification(s).`);
