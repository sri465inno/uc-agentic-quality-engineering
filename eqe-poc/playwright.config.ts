import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.EQE_APP_PORT || 4300);

// Stage-equivalent environment: the bundled synthetic demo-booking app only (no real client systems).
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  workers: process.env.EQE_WORKERS ? Number(process.env.EQE_WORKERS) : 3,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: process.env.EQE_JSON_REPORT || 'test-results/results.json' }]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node apps/demo-booking/server.js',
    url: `http://127.0.0.1:${port}/api/config`,
    env: { PORT: String(port) },
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
