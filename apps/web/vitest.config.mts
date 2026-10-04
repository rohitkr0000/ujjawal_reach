import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next.js needs "jsx": "preserve" in tsconfig, so tell the test transformer to compile JSX itself.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['test/**/*.test.{ts,tsx}'], environment: 'node' },
} as any);
