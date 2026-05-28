import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only unit tests — e2e/ is run by Playwright (npm run test:e2e), not vitest
    include: ['test/unit/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.ts',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
    },
  },
});
