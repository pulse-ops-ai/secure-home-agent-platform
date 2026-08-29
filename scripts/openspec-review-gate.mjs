#!/usr/bin/env node
/**
 * openspec-review-gate.mjs
 *
 * Dependency-free verifier for governed-spec-driven-v2.
 *
 * OpenSpec's artifact graph can require preimplementation-review.md to exist,
 * but existence is not an acceptance decision. This script binds the accepting
 * review to one repository commit and the exact bytes of every planning
 * artifact, then fails closed on drift.
 *
 * Modes:
 *   node scripts/openspec-review-gate.mjs manifest --change <name>
 *   node scripts/openspec-review-gate.mjs verify   --change <name>
 *
 * The script is read-only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  readdir,
  readFile,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CONTRACT = 'preimplementation-review-v1';
const SCHEMA = 'governed-spec-driven-v2';
const RUBRIC = 'governed-preimplementation-review-v1';
const REVIEW_FILE = 'preimplementation-review.md';

class GateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GateError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GateError(code, message);
}

function usage() {
  return `Usage:
  node scripts/openspec-review-gate.mjs manifest --change <change-name>
  node scripts/openspec-review-gate.mjs verify   --change <change-name>
  node scripts/openspec-review-gate.mjs manifest --change-dir <path>
  node scripts/openspec-review-gate.mjs verify   --change-dir <path>

Modes:
  manifest  Print a machine-readable gate block for the current clean HEAD.
  verify    Verify the accepting review, artifact hashes, and repository pin.
`;
}

function runGit(repoRoot, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    throw error;
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const mode = argv[0];
  if (mode !== 'manifest' && mode !== 'verify') {
    fail('USAGE', `first argument must be "manifest" or "verify"\n\n${usage()}`);
  }

  let change = null;
  let changeDirArg = null;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--change') {
      change = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--change-dir') {
      changeDirArg = argv[index + 1] ?? null;
      index += 1;
    } else {
      fail('USAGE', `unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if ((change === null) === (changeDirArg === null)) {
    fail(
      'USAGE',
      'provide exactly one of --change <name> or --change-dir <path>',
    );
  }

  if (change !== null && !/^[a-z0-9][a-z0-9-]*$/.test(change)) {
    fail(
      'INVALID_CHANGE_NAME',
      `change name must match ^[a-z0-9][a-z0-9-]*$: ${change}`,
    );
  }

  return { mode, change, changeDirArg };
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function resolveContext({ change, changeDirArg }) {
  const repoRootText = runGit(process.cwd(), ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  });

  if (repoRootText === null || repoRootText.length === 0) {
    fail('NOT_A_GIT_REPOSITORY', 'run this command inside a Git repository');
  }

  const repoRoot = await realpath(repoRootText);
  const changesRoot = await realpath(path.join(repoRoot, 'openspec', 'changes'));

  const unresolved =
    change !== null
      ? path.join(changesRoot, change)
      : path.resolve(repoRoot, changeDirArg);

  let changeDir;
  try {
    changeDir = await realpath(unresolved);
  } catch {
    fail('CHANGE_NOT_FOUND', `change directory does not exist: ${unresolved}`);
  }

  if (!isInside(changesRoot, changeDir)) {
    fail(
      'CHANGE_OUTSIDE_ACTIVE_ROOT',
      `change must be under openspec/changes/: ${changeDir}`,
    );
  }

  const changeName = path.basename(changeDir);
  const changeRepoPath = toPosix(path.relative(repoRoot, changeDir));

  return { repoRoot, changesRoot, changeDir, changeName, changeRepoPath };
}

async function assertRegularFileInside(changeDir, absolutePath, displayPath) {
  let info;
  try {
    info = await lstat(absolutePath);
  } catch {
    fail('PLANNING_FILE_MISSING', `required file is missing: ${displayPath}`);
  }

  if (!info.isFile()) {
    fail('PLANNING_FILE_NOT_REGULAR', `not a regular file: ${displayPath}`);
  }

  const resolved = await realpath(absolutePath);
  if (!isInside(changeDir, resolved)) {
    fail(
      'PLANNING_FILE_ESCAPES_CHANGE',
      `file resolves outside the change directory: ${displayPath}`,
    );
  }
}

async function listMarkdownFiles(directory, relativePrefix) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = `${relativePrefix}/${entry.name}`;

    if (entry.isDirectory()) {
      results.push(...(await listMarkdownFiles(absolute, relative)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(relative);
    } else if (entry.isSymbolicLink()) {
      fail(
        'SPEC_SYMLINK_REFUSED',
        `delta-spec paths must not be symlinks: ${relative}`,
      );
    }
  }

  return results;
}

async function readSchemaSelection(changeDir) {
  const metadataPath = path.join(changeDir, '.openspec.yaml');
  await assertRegularFileInside(changeDir, metadataPath, '.openspec.yaml');
  const metadata = await readFile(metadataPath, 'utf8');

  const selected = metadata.match(/^\s*schema:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1];
  if (selected !== SCHEMA) {
    fail(
      'WRONG_CHANGE_SCHEMA',
      `.openspec.yaml selects ${selected ?? 'no schema'}; expected ${SCHEMA}`,
    );
  }
}

async function planningPaths(changeDir) {
  await readSchemaSelection(changeDir);

  const fixedBeforeSpecs = ['.openspec.yaml', 'proposal.md'];
  const specPaths = await listMarkdownFiles(
    path.join(changeDir, 'specs'),
    'specs',
  );
  const fixedAfterSpecs = ['design.md', 'assurance.md', 'tasks.md'];

  if (specPaths.length === 0) {
    fail(
      'NO_DELTA_SPECS',
      'governed-spec-driven-v2 requires at least one specs/**/*.md file',
    );
  }

  const paths = [...fixedBeforeSpecs, ...specPaths, ...fixedAfterSpecs];

  for (const relative of paths) {
    await assertRegularFileInside(
      changeDir,
      path.join(changeDir, relative),
      relative,
    );
  }

  return paths;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function artifactManifest(changeDir) {
  const paths = await planningPaths(changeDir);
  return Promise.all(
    paths.map(async (relative) => {
      const bytes = await readFile(path.join(changeDir, relative));
      return { path: relative, sha256: sha256(bytes) };
    }),
  );
}

function repositoryChanges(repoRoot, reviewedCommit) {
  const committed =
    runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
      `${reviewedCommit}..HEAD`,
    ]) || '';
  const unstaged =
    runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
    ]) || '';
  const staged =
    runGit(repoRoot, [
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
    ]) || '';
  const untracked =
    runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']) || '';

  return new Set(
    [committed, unstaged, staged, untracked]
      .flatMap((group) => group.split('\n'))
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function assertManifestWorktreeClean(repoRoot) {
  const tracked = runGit(repoRoot, ['diff', '--name-only']) || '';
  const staged = runGit(repoRoot, ['diff', '--cached', '--name-only']) || '';
  const untracked =
    runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']) || '';

  const changes = [tracked, staged, untracked]
    .flatMap((group) => group.split('\n'))
    .map((item) => item.trim())
    .filter(Boolean);

  if (changes.length > 0) {
    fail(
      'MANIFEST_REQUIRES_CLEAN_WORKTREE',
      `commit or remove all changes before pinning review:\n${changes
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    );
  }
}

function extractGateBlock(reviewText) {
  const matches = [
    ...reviewText.matchAll(
      /<!--\s*openspec-review-gate\s*([\s\S]*?)-->/g,
    ),
  ];

  if (matches.length !== 1) {
    fail(
      'GATE_BLOCK_COUNT',
      `expected exactly one openspec-review-gate block; found ${matches.length}`,
    );
  }

  let gate;
  try {
    gate = JSON.parse(matches[0][1].trim());
  } catch (error) {
    fail('GATE_BLOCK_INVALID_JSON', error.message);
  }

  return gate;
}

function assertExactKeys(object, expectedKeys, context) {
  if (
    object === null ||
    typeof object !== 'object' ||
    Array.isArray(object)
  ) {
    fail('INVALID_GATE_SHAPE', `${context} must be an object`);
  }

  const actual = Object.keys(object).sort();
  const expected = [...expectedKeys].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      'UNEXPECTED_GATE_FIELDS',
      `${context} fields differ\nexpected: ${expected.join(', ')}\nactual:   ${actual.join(', ')}`,
    );
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_GATE_FIELD', `${field} must be a non-empty string`);
  }
}

function validateGateShape(gate) {
  const keys = [
    'contract',
    'schema',
    'rubric',
    'reviewed_commit',
    'reviewed_at',
    'reviewer',
    'verdict',
    'unresolved_p1_count',
    'unassigned_p2_p3_count',
    'invariant_set_changed',
    'authority_allocation_complete',
    'reviewed_artifacts',
  ];
  assertExactKeys(gate, keys, 'review gate');

  if (gate.contract !== CONTRACT) {
    fail(
      'WRONG_GATE_CONTRACT',
      `contract must be ${CONTRACT}; got ${String(gate.contract)}`,
    );
  }
  if (gate.schema !== SCHEMA) {
    fail(
      'WRONG_GATE_SCHEMA',
      `schema must be ${SCHEMA}; got ${String(gate.schema)}`,
    );
  }
  if (gate.rubric !== RUBRIC) {
    fail(
      'WRONG_GATE_RUBRIC',
      `rubric must be ${RUBRIC}; got ${String(gate.rubric)}`,
    );
  }

  if (
    typeof gate.reviewed_commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(gate.reviewed_commit)
  ) {
    fail(
      'INVALID_REVIEWED_COMMIT',
      'reviewed_commit must be a full lowercase 40-hex Git commit',
    );
  }

  assertString(gate.reviewed_at, 'reviewed_at');
  if (Number.isNaN(Date.parse(gate.reviewed_at))) {
    fail('INVALID_REVIEWED_AT', 'reviewed_at must be an RFC 3339 timestamp');
  }

  assertString(gate.reviewer, 'reviewer');
  if (/REPLACE_WITH|TBD|TODO/i.test(gate.reviewer)) {
    fail('PLACEHOLDER_REVIEWER', 'reviewer still contains a placeholder');
  }

  if (gate.verdict !== 'ARCHITECTURE_ACCEPTED') {
    fail(
      'REVIEW_NOT_ACCEPTED',
      `verdict is ${String(gate.verdict)}; expected ARCHITECTURE_ACCEPTED`,
    );
  }

  if (gate.unresolved_p1_count !== 0) {
    fail(
      'UNRESOLVED_P1',
      `unresolved_p1_count must be 0; got ${String(gate.unresolved_p1_count)}`,
    );
  }

  if (gate.unassigned_p2_p3_count !== 0) {
    fail(
      'UNASSIGNED_NON_P1_FINDINGS',
      `unassigned_p2_p3_count must be 0; got ${String(gate.unassigned_p2_p3_count)}`,
    );
  }

  if (gate.invariant_set_changed !== false) {
    fail(
      'INVARIANT_SET_CHANGED',
      'invariant_set_changed must be false for the accepting review',
    );
  }

  if (gate.authority_allocation_complete !== true) {
    fail(
      'AUTHORITY_ALLOCATION_INCOMPLETE',
      'authority_allocation_complete must be true',
    );
  }

  if (!Array.isArray(gate.reviewed_artifacts)) {
    fail(
      'INVALID_ARTIFACT_MANIFEST',
      'reviewed_artifacts must be an array',
    );
  }

  for (const [index, artifact] of gate.reviewed_artifacts.entries()) {
    assertExactKeys(artifact, ['path', 'sha256'], `reviewed_artifacts[${index}]`);
    assertString(artifact.path, `reviewed_artifacts[${index}].path`);

    if (
      path.isAbsolute(artifact.path) ||
      artifact.path.includes('\\') ||
      artifact.path.split('/').includes('..') ||
      artifact.path === REVIEW_FILE ||
      artifact.path.startsWith('reviews/')
    ) {
      fail(
        'INVALID_ARTIFACT_PATH',
        `unsafe or non-planning artifact path: ${artifact.path}`,
      );
    }

    if (
      typeof artifact.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256)
    ) {
      fail(
        'INVALID_ARTIFACT_DIGEST',
        `invalid lowercase SHA-256 for ${artifact.path}`,
      );
    }
  }
}

async function verifyArtifactManifest(changeDir, gate) {
  const actual = await artifactManifest(changeDir);
  const declared = gate.reviewed_artifacts;

  const actualPaths = actual.map((item) => item.path);
  const declaredPaths = declared.map((item) => item.path);

  if (new Set(declaredPaths).size !== declaredPaths.length) {
    fail('DUPLICATE_ARTIFACT_PATH', 'reviewed_artifacts contains duplicates');
  }

  if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
    fail(
      'ARTIFACT_SET_DRIFT',
      `reviewed artifact paths differ\nexpected current ordered set:\n${actualPaths
        .map((item) => `  - ${item}`)
        .join('\n')}\ndeclared:\n${declaredPaths
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    );
  }

  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index].sha256 !== declared[index].sha256) {
      fail(
        'ARTIFACT_BYTES_DRIFT',
        `${actual[index].path} changed after review\nexpected ${declared[index].sha256}\nactual   ${actual[index].sha256}`,
      );
    }
  }

  return actual;
}

function assertReviewBody(reviewText) {
  const requiredHeadings = [
    '## Review Pin',
    '## Independent Review Statement',
    '## Reviewed Artifact Manifest',
    '## Review Method',
    '## Architecture Acceptance Checks',
    '## Severity Calibration',
    '## Findings',
    '## Authority Allocation Assessment',
    '## Repository Feasibility',
    '## Invariant Stability',
    '## Review-Finding Regression Promotion',
    '## Verdict',
    '## Apply Eligibility',
  ];

  for (const heading of requiredHeadings) {
    if (!reviewText.includes(heading)) {
      fail('REVIEW_SECTION_MISSING', `required review section missing: ${heading}`);
    }
  }

  if (/REPLACE_WITH_(?:40_HEX_COMMIT|RFC3339_TIMESTAMP|INDEPENDENT_REVIEWER)/.test(reviewText)) {
    fail('REVIEW_PLACEHOLDER_REMAINS', 'machine-readable gate placeholders remain');
  }

  const verdictStart = reviewText.indexOf('## Verdict');
  const verdictTail = reviewText.slice(verdictStart + '## Verdict'.length);
  const nextHeading = verdictTail.search(/^## /m);
  const verdictSection =
    nextHeading === -1 ? verdictTail : verdictTail.slice(0, nextHeading);

  const acceptedMatches = verdictSection.match(
    /^\*\*ARCHITECTURE_ACCEPTED\*\*\s*$/gm,
  );
  if (acceptedMatches === null || acceptedMatches.length !== 1) {
    fail(
      'HUMAN_VERDICT_MISMATCH',
      'the Verdict section must contain exactly one line: **ARCHITECTURE_ACCEPTED**',
    );
  }

  const applyStart = reviewText.indexOf('## Apply Eligibility');
  const applySection = reviewText.slice(applyStart);
  if (!/^\*\*Unresolved P1 findings:\*\*\s*`none`\s*$/m.test(reviewText)) {
    fail(
      'HUMAN_P1_COUNT_MISMATCH',
      'Findings must contain: **Unresolved P1 findings:** `none`',
    );
  }

  if (!/^\*\*Unassigned P2\/P3 findings:\*\*\s*`0`\s*$/m.test(reviewText)) {
    fail(
      'HUMAN_ASSIGNMENT_COUNT_MISMATCH',
      'Findings must contain: **Unassigned P2/P3 findings:** `0`',
    );
  }

  if (!/^\*\*Authority allocation complete:\*\*\s*`YES`\s*$/m.test(reviewText)) {
    fail(
      'HUMAN_AUTHORITY_STATUS_MISMATCH',
      'Authority Allocation Assessment must contain: **Authority allocation complete:** `YES`',
    );
  }

  if (!/^\*\*Invariant set changed by this review:\*\*\s*`NO`\s*$/m.test(reviewText)) {
    fail(
      'HUMAN_INVARIANT_STATUS_MISMATCH',
      'Invariant Stability must contain: **Invariant set changed by this review:** `NO`',
    );
  }

  if (!/^\*\*Apply eligible:\*\*\s*`YES`\s*$/m.test(applySection)) {
    fail(
      'APPLY_ELIGIBILITY_MISMATCH',
      'Apply Eligibility must contain: **Apply eligible:** `YES`',
    );
  }
}

function assertRepositoryPin({
  repoRoot,
  changeRepoPath,
  reviewedCommit,
}) {
  const commitExists = runGit(
    repoRoot,
    ['cat-file', '-e', `${reviewedCommit}^{commit}`],
    { allowFailure: true },
  );
  if (commitExists === null) {
    fail(
      'REVIEWED_COMMIT_NOT_FOUND',
      `reviewed commit is not available locally: ${reviewedCommit}`,
    );
  }

  const isAncestor = runGit(
    repoRoot,
    ['merge-base', '--is-ancestor', reviewedCommit, 'HEAD'],
    { allowFailure: true },
  );
  if (isAncestor === null) {
    fail(
      'REVIEWED_COMMIT_NOT_ANCESTOR',
      `reviewed commit is not an ancestor of HEAD: ${reviewedCommit}`,
    );
  }

  const allowedReviewPath = `${changeRepoPath}/${REVIEW_FILE}`;
  const allowedHistoryPrefix = `${changeRepoPath}/reviews/`;
  const changed = repositoryChanges(repoRoot, reviewedCommit);
  const forbidden = [...changed]
    .filter(
      (candidate) =>
        candidate !== allowedReviewPath &&
        !candidate.startsWith(allowedHistoryPrefix),
    )
    .sort();

  if (forbidden.length > 0) {
    fail(
      'REPOSITORY_DRIFT_AFTER_REVIEW',
      `paths outside the current review/history changed after the reviewed commit:\n${forbidden
        .map((item) => `  - ${item}`)
        .join('\n')}`,
    );
  }
}

async function manifestMode(context) {
  assertManifestWorktreeClean(context.repoRoot);

  const artifacts = await artifactManifest(context.changeDir);
  const reviewedCommit = runGit(context.repoRoot, ['rev-parse', 'HEAD']);

  const gate = {
    contract: CONTRACT,
    schema: SCHEMA,
    rubric: RUBRIC,
    reviewed_commit: reviewedCommit,
    reviewed_at: new Date().toISOString(),
    reviewer: 'REPLACE_WITH_INDEPENDENT_REVIEWER',
    verdict: 'REVIEW_REQUIRED',
    unresolved_p1_count: null,
    unassigned_p2_p3_count: null,
    invariant_set_changed: null,
    authority_allocation_complete: null,
    reviewed_artifacts: artifacts,
  };

  process.stdout.write(
    `<!-- openspec-review-gate\n${JSON.stringify(gate, null, 2)}\n-->\n`,
  );
}

async function verifyMode(context) {
  await readSchemaSelection(context.changeDir);

  const reviewPath = path.join(context.changeDir, REVIEW_FILE);
  await assertRegularFileInside(context.changeDir, reviewPath, REVIEW_FILE);
  const reviewText = await readFile(reviewPath, 'utf8');

  const gate = extractGateBlock(reviewText);
  validateGateShape(gate);
  const artifacts = await verifyArtifactManifest(context.changeDir, gate);
  assertReviewBody(reviewText);
  assertRepositoryPin({
    repoRoot: context.repoRoot,
    changeRepoPath: context.changeRepoPath,
    reviewedCommit: gate.reviewed_commit,
  });

  process.stdout.write(
    [
      'REVIEW_GATE_VALID',
      `change=${context.changeName}`,
      `reviewed_commit=${gate.reviewed_commit}`,
      `artifacts=${artifacts.length}`,
      `reviewer=${gate.reviewer}`,
      '',
    ].join(' '),
  );
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const context = await resolveContext(parsed);

  if (parsed.mode === 'manifest') {
    await manifestMode(context);
  } else {
    await verifyMode(context);
  }
}

main().catch((error) => {
  if (error instanceof GateError) {
    process.stderr.write(`REVIEW_GATE_REFUSED [${error.code}]: ${error.message}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `REVIEW_GATE_ERROR: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(2);
});
