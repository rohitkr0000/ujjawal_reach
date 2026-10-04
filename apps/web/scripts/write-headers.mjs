/**
 * Writes the security headers file for the static site: out/_headers
 * (the format read by Cloudflare Pages and Netlify). Run after `next build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../out');
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

// Scripts and styles only from the site itself. Next.js needs inline scripts for its own start-up.
// The browser may talk to the site and to the API, nothing else. Fonts are bundled at build time.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const common = [
  `Content-Security-Policy: ${csp}`,
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
];

const lines = [
  '/*',
  ...common.map((h) => `  ${h}`),
  '',
  '# Built files have a hash in their name and never change.',
  '/_next/static/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '# Scheme files are refreshed from the API when it is reachable, so keep the fallback copy fresh.',
  '/data/*',
  '  Cache-Control: public, max-age=300',
  '',
  '# The admin area must never be indexed or cached.',
  '/admin/*',
  '  X-Robots-Tag: noindex, nofollow',
  '  Cache-Control: no-store',
  '',
];

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, '_headers'), lines.join('\n'));
writeFileSync(resolve(out, 'robots.txt'), 'User-agent: *\nDisallow: /admin/\n');
console.log(`Wrote out/_headers and out/robots.txt (API: ${apiUrl || 'not set'})`);
