/**
 * Fails when a changeset body breaks the changelog-entry rule.
 *
 * A changeset body is published verbatim as a changelog entry, and a
 * changelog entry is written for a stranger deciding whether to upgrade: a
 * headline sentence plus at most one short paragraph, and on a major release
 * a migration note that says what they have to do. The package README's
 * "Versioning and support" section promises exactly that, and a promise made
 * in public is kept by a check rather than by remembering.
 *
 * Two rules, each a single number or a single word:
 *
 *   body-length            every body is at most 120 words
 *   major-needs-migration  a body under a `major` bump contains a form of
 *                          the word "migrate" (migrate, migrating,
 *                          migration, migrated)
 *
 * Empty changesets (no package lines in the frontmatter) are length-checked
 * only. The threshold is the measurable form of "one short paragraph": the
 * 1.0.0 entry fits in about 100 words with its migration note, which leaves
 * room without inviting a second paragraph.
 *
 * Exit codes: 0 = clean, 1 = findings (printed to stdout).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changesetDir = join(root, ".changeset");

const MAX_BODY_WORDS = 120;
// Whole-word forms only: "migratory" or "premigration" is not a note.
const MIGRATION_NOTE = /\bmigrat(?:e|es|ed|ing|ion|ions)\b/i;
const BUMP_LINE = /^\s*["']?[^"':]+["']?\s*:\s*(major|minor|patch)\s*$/;

const RULES = {
  "body-length": {
    why: `A changelog entry is a headline and at most one short paragraph. Cut it to ${MAX_BODY_WORDS} words; review notes belong in the PR.`,
  },
  "major-needs-migration": {
    why: 'A major release tells a user on the previous major what to do. Add a migration note (a form of the word "migrate": migrate, migrating, migration).',
  },
};

/**
 * The frontmatter lines and the body after them. Throws rather than guessing
 * when a file does not open with `---`: changesets itself would refuse it,
 * and a silently skipped file is one this check never looked at.
 */
function split(file, content) {
  const lines = content.split("\n");
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );
  if (lines[0].trim() !== "---" || closing === -1) {
    throw new Error(
      `${file}: no YAML frontmatter. Every changeset opens and closes with ---.`
    );
  }
  return {
    frontmatter: lines.slice(1, closing),
    body: lines.slice(closing + 1).join("\n"),
  };
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

const files = readdirSync(changesetDir)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

const findings = [];

for (const name of files) {
  const file = relative(root, join(changesetDir, name));
  const { frontmatter, body } = split(
    file,
    readFileSync(join(changesetDir, name), "utf8")
  );

  const bumps = frontmatter
    .map((line) => line.match(BUMP_LINE)?.[1])
    .filter(Boolean);

  const words = wordCount(body);
  if (words > MAX_BODY_WORDS) {
    findings.push({
      file,
      rule: "body-length",
      measured: `${words} words (limit ${MAX_BODY_WORDS})`,
    });
  }

  if (bumps.includes("major") && !MIGRATION_NOTE.test(body)) {
    findings.push({
      file,
      rule: "major-needs-migration",
      measured: "major bump, no migration note in the body",
    });
  }
}

if (findings.length === 0) {
  console.log(`Changeset bodies: clean (${files.length} changeset(s)).`);
  process.exit(0);
}

console.log(`Changeset bodies: ${findings.length} finding(s).\n`);
for (const finding of findings) {
  console.log(`${finding.file}  [${finding.rule}]`);
  console.log(`  measured: ${finding.measured}`);
  console.log(`  ${RULES[finding.rule].why}\n`);
}
console.log(
  "A changeset body is published as a changelog entry under the versioning " +
    "and support policy in packages/connect-sdk/README.md. Rewrite the entry " +
    "rather than widening this check."
);
process.exit(1);
