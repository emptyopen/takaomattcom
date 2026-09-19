/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — emits a fully static `out/` directory for S3 + CloudFront.
  // The Mutex admin panel calls themutex.app directly using Firebase ID tokens
  // for authentication (no server-side proxy needed).
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // Hide the dev-only Next.js/Turbopack indicator badge (bottom corner).
  devIndicators: false,
};

module.exports = nextConfig;
