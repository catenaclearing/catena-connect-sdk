/**
 * Scans the npm registry for packages matching "catena" and reports any name
 * not on the allowlist.
 *
 * Exit codes: 0 = nothing new, 1 = new names found (printed to stdout),
 * 2 = scan failed (never treated as a finding).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let unknown;
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const allowlist = new Set(
    JSON.parse(readFileSync(join(here, "squat-allowlist.json"), "utf8"))
  );

  const res = await fetch(
    "https://registry.npmjs.org/-/v1/search?text=catena&size=250"
  );
  if (!res.ok) {
    throw new Error(`npm search returned HTTP ${res.status}`);
  }
  const { objects } = await res.json();

  unknown = objects
    .map((entry) => entry.package.name)
    .filter((name) => !name.startsWith("@catenaclearing/"))
    .filter((name) => !allowlist.has(name));
} catch (error) {
  console.error(
    `scan failed: ${error instanceof Error ? error.message : error}`
  );
  process.exit(2);
}

if (unknown.length === 0) {
  console.log("No new 'catena' packages found.");
  process.exit(0);
}

console.log(unknown.join("\n"));
process.exit(1);
