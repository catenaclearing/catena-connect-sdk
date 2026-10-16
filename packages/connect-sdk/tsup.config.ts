import { defineConfig } from "tsup";
import packageJson from "./package.json" with { type: "json" };

// `src/version.ts`: the one field of the manifest the bundle needs.
const define = {
  __CONNECT_SDK_VERSION__: JSON.stringify(packageJson.version),
};

// Neither build cleans `dist/`: tsup runs the two side by side, and a clean
// in one could delete what the other has just written. The package's `build`
// script empties `dist/` before tsup starts instead, with `node:fs` so it
// works on every platform.
export default defineConfig([
  {
    entry: ["src/index.ts", "src/contract.ts"],
    format: ["esm", "cjs"],
    // Each entry carries its own copy of what it shares with the other, so
    // `dist/index.js` stays one file. The harness copies that file alone, and
    // so does anyone loading the bundle directly rather than through a package
    // manager; a shared chunk beside it would break both silently.
    splitting: false,
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    define,
  },
  {
    // The build a page loads from a `<script>` tag, through a CDN that serves
    // npm packages, with no bundler: `open`, `resume` and `preload` on
    // `window.CatenaConnect`. `contract.ts` is left out: it is for the connect
    // app's tests, which import it from the package.
    entry: { "connect-sdk": "src/index.ts" },
    format: ["iife"],
    globalName: "CatenaConnect",
    outExtension: () => ({ js: ".global.js" }),
    minify: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    define,
  },
]);
