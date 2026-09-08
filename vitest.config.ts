import { defineConfig } from 'vitest/config'

/* convex-test runs Convex functions in an edge-like runtime, which is what the
   real deployment uses — a Node environment would let code pass here that fails
   on deploy. */
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
})
