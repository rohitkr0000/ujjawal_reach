import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  // The shared package is TypeScript source inside this repository: bundle it. Everything else
  // listed in package.json "dependencies" stays external and is installed on the server.
  noExternal: [/^@ujjwal\/schemes/],
});
