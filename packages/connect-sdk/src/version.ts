/**
 * This package's own version, as published.
 *
 * Replaced at build time from `package.json` (`define` in `tsup.config.ts`, and
 * the same in `vitest.config.ts` for the tests), so the bundle carries the one
 * string and not the manifest. The release bumps `package.json` before it
 * builds, so a published bundle always names its own release.
 */
declare const __CONNECT_SDK_VERSION__: string;

export const SDK_VERSION: string = __CONNECT_SDK_VERSION__;
