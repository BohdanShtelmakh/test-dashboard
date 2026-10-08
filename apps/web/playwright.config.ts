import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run start:prod -w @test-dashboard/api',
      cwd: root,
      url: 'http://localhost:3001/api/widgets',
      env: { PORT: '3001', CORS_ORIGIN: 'http://localhost:5174' },
    },
    {
      command: 'npm run dev -w @test-dashboard/web -- --port 5174 --strictPort',
      cwd: root,
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:3001' },
    },
  ],
})
