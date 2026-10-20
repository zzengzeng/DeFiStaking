import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  webServer: {
    // 使用 .next-e2e 避免与本地 pnpm dev 争用 .next；CI 已在 job 内 build 过主 .next
    command:
      "NEXT_DIST_DIR=.next-e2e pnpm run build && NEXT_DIST_DIR=.next-e2e pnpm exec next start -p 3001 -H 127.0.0.1",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
