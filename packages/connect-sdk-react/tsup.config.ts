import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  splitting: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  // A server-components application can render the component straight from
  // a server tree only if the module declares itself a client module. The
  // directive is inert everywhere else.
  banner: { js: '"use client";' },
});
