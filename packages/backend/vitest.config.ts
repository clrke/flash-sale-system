import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Stress tests spin up many concurrent requests; give them room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
