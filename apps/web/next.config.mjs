/**
 * The website is a static export: `next build` writes plain HTML, CSS and JS to the `out` folder.
 * Any static host or CDN can serve it (Cloudflare Pages, Vercel, S3 + CloudFront, Netlify), so a
 * traffic spike never reaches a Node server. All the dynamic work is done by the API.
 *
 * Security headers cannot be set by Next.js in a static export. `scripts/write-headers.mjs` runs
 * after the build and writes them to `out/_headers` (Cloudflare Pages and Netlify read this file).
 * For other hosts, copy the same headers into the host's settings (see docs/DEPLOYMENT.md).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@ujjwal/schemes'],
  reactStrictMode: true,
  // Lint runs separately (npm run lint at the repository root and in CI).
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
