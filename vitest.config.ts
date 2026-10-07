import { defineConfig } from "vitest/config";

// The config is loaded as a module, so `import.meta.url` is its own location.
// A URL rather than `node:url`, which would need Node's type definitions for
// one call.
const coreSource = (file: string): string =>
  decodeURIComponent(
    new URL(`./packages/connect-sdk/src/${file}`, import.meta.url).pathname
  );

export default defineConfig({
  resolve: {
    // The wrapper's tests import the core by its package name, and the core's
    // manifest points at `dist/`, which CI builds only after the tests have
    // run. Exact matches, so the subpath entry does not fall through to the
    // main one. Mirrors the `paths` in `tsconfig.json`.
    alias: [
      {
        find: /^@catenaclearing\/connect-sdk$/,
        replacement: coreSource("index.ts"),
      },
      {
        find: /^@catenaclearing\/connect-sdk\/contract$/,
        replacement: coreSource("contract.ts"),
      },
    ],
  },
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    // The package runs in a host page and is almost entirely DOM work.
    // What jsdom can and cannot prove is recorded in the feature's quickstart;
    // the claims it cannot are verified in a real browser, not asserted here.
    environment: "jsdom",
  },
});
