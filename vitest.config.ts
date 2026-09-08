import { defineConfig } from 'vitest/config'

/* convex-test runs Convex functions in an edge-like runtime, which is what the
   real deployment uses — a Node environment would let code pass here that fails
   on deploy. */
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    /* Pinned, not inherited. Recurrence is expanded in local wall-clock terms,
       so a DST test is only a test in a zone that has DST — CI runs in UTC,
       where a broken expansion would pass. Lisbon is where the clocks that
       matter actually change. */
    env: { TZ: 'Europe/Lisbon' },
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
})
