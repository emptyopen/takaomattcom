# Working on takaomatt.com

Read PORTFOLIO.md (local only and gitignored; never commit it to this public repository) for shared Mutex/NextBite priorities and links to their canonical living plans. Keep private business summaries out of the public static export; authenticated UI alone does not protect bundled data. Enforce private overview access in Firestore rules and run the portfolio emulator checks for authorization changes. With Java 21+, from the repository root: `npm ci --prefix scripts/portfolio-tests --ignore-scripts`, then `firebase emulators:exec --only firestore --project demo-portfolio "node scripts/portfolio-tests/check.mjs"`. The `demo-` project never touches production.

Shipping: merging to `master` runs `.github/workflows/deploy.yml`, which builds the static export, deploys `firestore.rules` to production, and publishes to S3/CloudFront. Pull requests have no CI, so build and run the relevant checks locally before merging.

Preserve existing project admin controls. Deployment credentials belong in a trusted backend, never the browser. Distinguish local changes, emulator checks, snapshots, live telemetry, and deployed behavior. Do not alter unrelated app billing or services. End responses with what Matt is needed for now.
