import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser tests for the iframe check, against a local stand-in for the
 * connect origin whose every step can be made slow (`e2e/servers.mjs`).
 * They load the built package, so run `pnpm build` first.
 */
export default defineConfig({
  testDir: "e2e",
  // The slow scenarios wait out the SDK's real budgets, up to about ten
  // seconds each.
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "https://localhost:4601",
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "node e2e/servers.mjs",
    url: "https://localhost:4601/",
    ignoreHTTPSErrors: true,
    // A server already running may be serving a different build.
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
