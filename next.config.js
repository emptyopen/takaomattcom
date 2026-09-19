/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hybrid mode: static pages + API routes. Deploy on Vercel, AWS Amplify,
  // or any Node.js host. Public pages are still statically generated;
  // only API routes require server execution.
  //
  // If you need a fully static `out/` build (e.g. S3 + CloudFront), add
  // `output: 'export'` and remove the /api routes — the Mutex admin panel
  // would then need a separate backend to keep the secret server-side.
  images: { unoptimized: true },
  reactStrictMode: true,
  // Hide the dev-only Next.js/Turbopack indicator badge (bottom corner).
  devIndicators: false,
};

module.exports = nextConfig;
