# takaomatt.com

Personal site + admin portal for flipping flags on apps I ship (currently
NextBite). Static Next.js export, intended for S3 + CloudFront on AWS.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # fill in Firebase web config + admin UIDs
npm run dev
```

Visit `http://localhost:3000` for the public page, `/admin` for the flag
editor.

## Configure

1. **Firebase web app**. In the Firebase console for the NextBite project,
   register a Web app and copy the config values into `.env.local`.
2. **Admin allowlist**. Set `NEXT_PUBLIC_ADMIN_UIDS` to your Firebase Auth
   UID (comma-separated for multiple admins). Find your UID under
   Authentication → Users after signing in once.
3. **Firestore rules**. Lock down the `flags` collection so only admin UIDs
   can write. Mobile clients still read:

   ```
   match /flags/{flagId} {
     allow read: if true;
     allow write: if request.auth != null
       && request.auth.uid in ['<YOUR_UID>'];
   }
   ```

## Deploy to AWS (S3 + CloudFront)

```bash
npm run build         # emits ./out
aws s3 sync ./out s3://takaomatt.com --delete
aws cloudfront create-invalidation \
  --distribution-id <DIST_ID> --paths "/*"
```

CloudFront should be set up with takaomatt.com as the alternate domain name,
an ACM cert in us-east-1, and a default root object of `index.html`. For
client-side route refreshes (`/admin` deep-link), add a CloudFront function
or custom error response that rewrites 403/404 to `/index.html`.

## Adding a new app's flags

In `src/app/admin/admin-client.tsx`, push another `{ id, label }` onto the
`BANNERS` array. The Firestore doc shape (`enabled`, `text`, `url`, `color`)
is reusable. For richer flags, add a different editor component and gate it
on its own ID.
