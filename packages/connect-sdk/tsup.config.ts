import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/contract.ts"],
  format: ["esm", "cjs"],
  // Each entry carries its own copy of what it shares with the other, so
  // `dist/index.js` stays one file. The harness copies that file alone, and so
  // does anyone loading the bundle directly rather than through a package
  // manager; a shared chunk beside it would break both silently.
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
});
