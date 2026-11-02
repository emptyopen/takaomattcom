# Working on takaomatt.com

Keep private data out of the public static export; authenticated UI alone does not protect bundled data. Enforce private overview access in Firestore rules and run the portfolio emulator checks for authorization changes. With Java 21+, from the repository root: `npm ci --prefix scripts/portfolio-tests --ignore-scripts`, then `firebase emulators:exec --only firestore --project demo-portfolio "node scripts/portfolio-tests/check.mjs"`. The `demo-` project never touches production.

Shipping: merging to `master` triggers the deploy workflow. Pull requests have no CI, so build and run the relevant checks locally before merging.

Deployment credentials belong in a trusted backend, never the browser. Distinguish local changes, emulator checks, and deployed behavior. End responses with what Matt is needed for now.
