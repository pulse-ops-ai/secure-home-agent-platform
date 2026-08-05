#!/usr/bin/env node
/**
 * Validate one TypeScript workspace package manifest.
 *
 * Invoked as each package's `check` script, so `pnpm -r run check` validates
 * every member. Node standard library only — no dependencies, by design.
 *
 * This exists because the workspace has no source yet: the meaningful check at
 * this stage is that each manifest is well-formed, private, correctly scoped,
 * and has not quietly acquired a dependency. Replace or extend it when the
 * packages gain real source (type checking, tests, build).
 *
 * Governed by AGENTS.md and packages/README.md.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const SCOPE = "@secure-home/";
const dir = process.cwd();
const label = basename(dir);
const problems = [];

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
} catch (error) {
  console.error(`✗ ${label}: package.json unreadable or invalid JSON — ${error.message}`);
  process.exit(1);
}

if (typeof manifest.name !== "string" || !manifest.name.startsWith(SCOPE)) {
  problems.push(`name must start with "${SCOPE}" (got ${JSON.stringify(manifest.name)})`);
}

// Nothing in this repository is published. A package that loses `private`
// becomes publishable by accident.
if (manifest.private !== true) {
  problems.push('"private" must be true — nothing here is published');
}

if (typeof manifest.version !== "string") {
  problems.push('"version" is required');
}

if (typeof manifest.description !== "string" || manifest.description.length === 0) {
  problems.push('"description" is required — say what the package is for');
}

// The workspace is deliberately dependency-free. Adding a dependency is a
// reviewed decision (AGENTS.md), not something a scaffold change slips in.
for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
  const deps = manifest[field];
  if (deps && Object.keys(deps).length > 0) {
    problems.push(
      `${field} is non-empty (${Object.keys(deps).join(", ")}) — ` +
        "adding a dependency requires a reviewed decision; " +
        "update scripts/check-ts-package.mjs in the same change",
    );
  }
}

if (typeof manifest.scripts?.check !== "string") {
  problems.push('a "check" script is required so `pnpm -r run check` covers this package');
}

if (problems.length > 0) {
  console.error(`✗ ${manifest.name ?? label}`);
  for (const problem of problems) {
    console.error(`    ${problem}`);
  }
  process.exit(1);
}

console.log(`✓ ${manifest.name} — manifest valid (private, scoped, dependency-free)`);
