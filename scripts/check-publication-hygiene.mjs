/**
 * Fails when content this repository must never publish appears under
 * `packages/` — the source, and the built bundle when one is present.
 *
 * Four things are enforced by remembering otherwise, and all four are
 * trivially greppable: issue identifiers, issue-tracker URLs, internal
 * hostnames, and user-agent inspection. The first three are a content rule
 * that survives twenty reviews and fails on the twenty-first. The fourth is
 * a design rule — the mode decision is made by evidence, never by a browser
 * table — and is stated as verifiable by inspecting the bundle, so the
 * verification may as well run.
 *
 * This lives in the repository rather than in a reviewer's head so the
 * constraint outlives the people who know why it exists.
 *
 * Exit codes: 0 = clean, 1 = findings (printed to stdout).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scanRoot = join(root, "packages");

/**
 * Prefixes that look like an issue identifier and are not one. Technical
 * names of the shape `LETTERS-DIGITS` are common enough in source and prose
 * that matching them would train everyone to ignore this check.
 */
const NOT_ISSUE_IDS = new Set([
  "AES",
  "ARIA",
  "BCP",
  "CRC",
  "CVE",
  "EC",
  "ECDSA",
  "ES",
  "HMAC",
  "HTTP",
  "IEEE",
  "ISO",
  "MD",
  "RFC",
  "RSA",
  "SHA",
  "TLS",
  "UTF",
  "WCAG",
]);

const RULES = [
  {
    id: "issue-identifier",
    pattern: /\b([A-Z][A-Z0-9]{1,5})-\d{2,6}\b/g,
    skip: (match) => NOT_ISSUE_IDS.has(match[1]),
    why: "Looks like an issue identifier. Describe why a change was made, not which ticket asked for it.",
  },
  {
    id: "tracker-url",
    // Hosted trackers generally, rather than the one this repository uses:
    // a list that names only ours would itself say which one that is.
    pattern:
      /\b(?:linear\.app|atlassian\.net|youtrack\.cloud|shortcut\.com|clickup\.com|asana\.com|monday\.com|notion\.so|height\.app|basecamp\.com)\b/gi,
    why: "Issue-tracker URL. Write the context itself in plain terms instead of pointing at an internal system.",
  },
  {
    id: "internal-hostname",
    pattern: /\b[a-z0-9-]+\.(?:internal|intranet|corp|lan|local)\b/gi,
    why: "Looks like an internal hostname. The connect origin is derived from the invite URL, so none is needed.",
  },
  {
    id: "user-agent-inspection",
    pattern:
      /\buserAgentData\b|\buserAgent\b|\bnavigator\.(?:vendor|platform|appVersion|oscpu)\b/g,
    why: "User-agent inspection. The mode decision is made by a capability probe, never by a browser table.",
  },
];

/** Every file under `dir`, skipping installed dependencies. */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

/** Text, or `null` for anything that is not. */
function text(path) {
  const content = readFileSync(path, "utf8");
  return content.includes("\0") ? null : content;
}

const findings = [];

for (const path of walk(scanRoot)) {
  const content = text(path);
  if (content === null) continue;

  const lines = content.split("\n");
  for (const rule of RULES) {
    for (const [index, line] of lines.entries()) {
      // Reset between lines: the patterns are global, and a `lastIndex`
      // carried over from the previous line skips real matches.
      rule.pattern.lastIndex = 0;
      for (const match of line.matchAll(rule.pattern)) {
        if (rule.skip?.(match)) continue;
        findings.push({
          file: relative(root, path),
          line: index + 1,
          rule,
          matched: match[0],
        });
      }
    }
  }
}

let built = true;
try {
  built = statSync(join(scanRoot, "connect-sdk", "dist")).isDirectory();
} catch {
  built = false;
}

if (findings.length === 0) {
  console.log(
    built
      ? "Publication hygiene: clean (source and built bundle)."
      : "Publication hygiene: clean (source only — no bundle built yet; run pnpm build)."
  );
  process.exit(0);
}

console.log(`Publication hygiene: ${findings.length} finding(s).\n`);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line}  [${finding.rule.id}]`);
  console.log(`  matched: ${finding.matched}`);
  console.log(`  ${finding.rule.why}\n`);
}
console.log(
  "Everything in this repository is world-readable, and packages/ additionally " +
    "ships to other people's browsers. Remove the content rather than narrowing this check."
);
process.exit(1);
