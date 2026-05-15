import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.resolve(__dirname, '../..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const apiCommand = `${pnpm} --dir "${repoRoot}" --filter @geovault/api start`;
const webCommand = `${pnpm} --dir "${repoRoot}" --filter @geovault/web dev`;
const e2eAdminEmail = 'e2e-admin@test.local';
const e2eAdminPassword = 'E2eAdmin123!@';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : [
        {
          command: apiCommand,
          port: 4000,
          reuseExistingServer: true,
          timeout: 90_000,
          env: {
            ADMIN_EMAIL: e2eAdminEmail,
            ADMIN_PASSWORD: e2eAdminPassword,
            OPENAI_API_KEY: '',
            ANTHROPIC_API_KEY: '',
            PERPLEXITY_API_KEY: '',
            GEMINI_API_KEY: '',
            AZURE_OPENAI_API_KEY: '',
            AZURE_OPENAI_ENDPOINT: '',
            AZURE_OPENAI_DEPLOYMENT: '',
            E2E: '1',
          },
        },
        {
          command: webCommand,
          port: 3001,
          reuseExistingServer: true,
          timeout: 90_000,
        },
      ],
});
