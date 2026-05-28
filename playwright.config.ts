import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  webServer: {
    // Force TF backend to CPU in the preview server for headless E2E stability
    // Set VITE_SKIP_FACEAPI=1 so tests run without loading the CDN face-api module
    // and VITE_FORCE_TF_BACKEND=cpu to avoid wasm/webgl in CI.
    command: 'VITE_SKIP_FACEAPI=1 VITE_FORCE_TF_BACKEND=cpu npm run build && npx vite preview --port 8080',
    port: 8080,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
