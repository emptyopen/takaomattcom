/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — emits a fully static `out/` directory you can host on
  // S3 + CloudFront or any static host. If you later want SSR for an API
  // route, drop the `output: 'export'` line and switch deploy to AWS
  // Amplify or Lambda@Edge.
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // Hide the dev-only Next.js/Turbopack indicator badge (bottom corner).
  devIndicators: false,
};

module.exports = nextConfig;
