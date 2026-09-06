# scripts/

Repository tooling: validation and aggregate checks. Dependency-light by design.

> **Naming note.** "Scripts" here means *developer and CI tooling*. Agent-callable
> tools are the governed tool-surface package, which does not exist yet — a
> completely different thing.

## Contents

| Script | Purpose |
|---|---|
| [`validate-scaffold.sh`](validate-scaffold.sh) | Structural validation: navigation files, index integrity, required READMEs, workspace manifests, tracked secrets, forbidden generated directories |
| [`check.sh`](check.sh) | Aggregate check — runs everything and **reports what it skipped** |
| [`scan-secrets.sh`](scan-secrets.sh) | Scans **every tracked text file** for secret-shaped values — no file-level exclusions |
| [`secret-scan-allowlist.txt`](secret-scan-allowlist.txt) | Narrow, commented exceptions for the scanner |
| [`workspace-model.mjs`](workspace-model.mjs) | The workspace's shape — taxonomy, the **layer map**, package roles. Imported by the two checks below so they cannot disagree. No side effects |
| [`check-workspace.mjs`](check-workspace.mjs) | What a manifest may **declare**: taxonomy, naming, script surface, dependency direction, `catalog:`/`workspace:*` |
| [`check-source-imports.mjs`](check-source-imports.mjs) | What source may **import**: parses each file with the TypeScript compiler and enforces direction on the real import nodes |
| [`affected-targets.mjs`](affected-targets.mjs) | Computes which CI target gates must run, by **dependency graph** — never by directory alone |
| [`check-knowledge.mjs`](check-knowledge.mjs) | Knowledge **registry** conformance: modules, sets, statuses, gates, and README-only while a module's toolchain gate is closed. **Not** the content validator |
| [`check-knowledge-content.mjs`](check-knowledge-content.mjs) | Invokes the knowledge toolchain over **real authored bytes** — admission, prohibited-content indicators, and the review attestation bound to the exact source digest |
| [`check-set-releases.mjs`](check-set-releases.mjs) | Hands **real release-manifest bytes** to the toolchain: canonical form, digest, review binding, family/version agreement. Deliberately **one revision** — it never re-derives a release from the catalog |
| [`check-release-history.mjs`](check-release-history.mjs) | The **two-revision** properties, compared against the prior governed revision: no released identity deleted or re-identified, only `Released → Deprecated → Retired`, and a **new** release must satisfy the ADR-0019 §6 member preconditions |
| [`openspec-review-gate.mjs`](openspec-review-gate.mjs) | The governed-spec-driven-v2 **pre-apply** review gate: binds an accepting review to one planning commit and the exact bytes of every planning artifact. Run **once**, immediately before the first implementation change — **never** as a continuous check, because it refuses repository change after the reviewed commit |
| [`check-openspec-review-history.mjs`](check-openspec-review-history.mjs) | The **two-revision** companion: admitted rounds are append-only. Adding is allowed; modifying, deleting, or renaming one is refused; a byte-identical move into `changes/archive/**` is allowed. A round is a **direct child** of `reviews/` named `<epoch>-<reviewed-sha12>.md` — a nested path is refused rather than skipped, because it is the only shape whose admission provenance this check can prove. Runs always |
| [`openspec-candidate-workspace.mjs`](openspec-candidate-workspace.mjs) | Assembles an isolated OpenSpec validation tree: **trusted** config and schemas from the current context, **candidate** change directory read from git objects at a ref. Only regular blobs, always `0644`, so nothing the candidate carries executes or escapes. Used by the trusted review boundary, which never checks the candidate out |
| [`openspec-review-pins.mjs`](openspec-review-pins.mjs) | Enumerates the historical `reviewed_commit` identities a candidate's `reviews/` rounds cite, read from git objects, so the trusted boundary can fetch those commits **as inert objects** before the gate's `cat-file` identity proof needs them. Necessary after a **squash merge**, which orphans a reviewed commit so a fresh runner has never fetched it. Decides nothing about acceptance — it reads one field and refuses anything but lowercase full 40-hex, a filename that disagrees with its block, or an ambiguous round |
| [`build-maintenance-plan.mjs`](build-maintenance-plan.mjs) | Assembles a classification plan from two Git **revisions**, read out of the object database as inert file maps — neither side is checked out and nothing from the candidate executes. The path universe is **derived** here (what changed, plus everything the predecessor's protected projections cover) rather than taken from either revision, because a candidate that could shrink the universe could hide a change inside it |
| [`check-toolchain-boundaries.mjs`](check-toolchain-boundaries.mjs) | The **predecessor-bound** maintenance classifier. Decides admissible *data difference* between a trusted predecessor and a candidate under one of the **closed** maintenance classes in [`toolchain-boundaries.json`](toolchain-boundaries.json), and nothing else — it never resolves, selects, or trusts a revision, because a candidate that could choose its own predecessor could authorize itself. Comparison is by **projection**, a named function over content, so one file can be protected and permitted at once: `engine-mappings.json` is protected under `mapping-coverage` (no policy may lose a mapping) and permitted under `mapping-detail` (vendor rule identity may move). Resolved-graph movement is bounded by the **derived** transitive closure of the selected roots, never a declared one. Run with no arguments it checks the policy's own consistency at rest. Missing or unreadable predecessor, malformed class, unknown class, an undeclared changed path, protected drift, class union, or a class touching its own verifier all **fail closed** |
| [`check-images.mjs`](check-images.mjs) | Image **lock and lineage** invariants (`deploy/images/image-lock.yaml`): closed lineage classes, immutable external pins, the base→derived digest chain, provider-neutral base/gates definitions, and image inertness. Structural only — real digests come from the governed images workflow |
| [`image-impact.mjs`](image-impact.mjs) | Fail-closed semantic image-impact analysis: compares a trusted Git revision with the candidate, derives build inputs and dependency closure from the image lock/Dockerfiles/toolchain inventory, and selects no build only when irrelevance is positively proved. Exports `GLOBAL_BUILD_INPUTS`, the repository-level inputs that force the complete set; each must appear on the workflow's outer `paths` perimeter (structurally enforced) or the checker never runs |
| [`pr-merge-plan.mjs`](pr-merge-plan.mjs) | Composed-tree PR proof planning: resolves the **live** target-branch tip, composes a synthetic `merge(live base, PR head)` with Git plumbing (no branch mutated), gates the previous-head fast path on base incorporation, and re-checks both identities at run end (TOCTOU). The synthetic `MERGE_SHA` is deterministic — fixed identity, input-derived commit dates, and normalized UTF-8 commit encoding — so identical inputs reproduce the same evidence SHA despite ambient clock or Git encoding configuration. Fails closed on an unresolvable base/head or a merge conflict. A global image-proof input, so it is on the `images.yml` perimeter |

## What belongs here

- Validation and check tooling for the repository itself.
- Small, readable, dependency-light scripts.

## What does not belong here

- **Anything that deploys, starts, stops, or configures a service.** No
  `docker compose up`, no `tailscale up`, no service management.
- **Anything that touches a credential** or reads a secret store.
- **Anything that contacts Home Assistant, the VPS, or the shared edge.**
- **Application or service code** — [`../services/`](../services/).
- **Agent-callable tools** — the governed tool surface, a package that arrives
  with the issue that needs it.
- **Heavy dependencies.** These scripts must run on a freshly-prepared Pi with
  nothing installed beyond a shell and the workspace toolchains.

## Ownership and boundary rules

1. **Read-only.** A script here inspects the repository; it does not mutate the
   system.
2. **Dependency-light.** `validate-scaffold.sh` uses POSIX-ish shell and
   coreutils only — no `jq`, no Python, no network. It must run before any
   toolchain is installed. `scan-secrets.sh`, `check-workspace.mjs`,
   `workspace-model.mjs`, and `affected-targets.mjs` are likewise dependency-free;
   `affected-targets.mjs` in particular runs in a CI job that never installs.

   **One deliberate exception:** `check-source-imports.mjs` imports `typescript`
   to parse source. Deciding whether a token is an import requires a lexer, and
   a governance gate that guesses is a governance gate with bypasses. It runs
   after `pnpm install --frozen-lockfile` in both CI and `check.sh`, and
   `tests/test_source_imports.py` asserts that ordering and that this is the
   only third-party import any of these scripts takes.

   **A second, first-party exception:** `check-set-releases.mjs` and
   `check-release-history.mjs` import `@secure-home/knowledge-toolchain` — the
   package that owns every release semantic rule, deliberately not reimplemented
   here. The cost is a prerequisite: both need `pnpm install --frozen-lockfile`
   and `pnpm --filter @secure-home/knowledge-toolchain run build` first, and a
   bare `node` invocation on a fresh host fails with a module-resolution error
   rather than a governed refusal. CI and `check.sh` build the toolchain before
   running either.
3. **Skips are reported, never silent.** `check.sh` prints every skipped check
   with its reason. A check that quietly disappears is how a broken repository
   looks healthy.

   Its exit status distinguishes three outcomes, and the third is the one worth
   knowing:

   | Exit | Meaning |
   |---|---|
   | `0` | everything that could run, ran and passed |
   | `1` | something failed — skips, if any, are still listed |
   | `2` | nothing failed, but a check was skipped because a toolchain is missing |

   **A skip-only run is not a pass.** `2` exists so an incomplete run cannot be
   read as a green one, and so a caller can tell "this repository is sound" from
   "this machine could not check it".

4. **The secret scan has exactly one suppression mechanism, and it is
   enforced.** `scan-secrets.sh` scans every tracked text file, including
   `.github/workflows/` and itself. There is no file-level exclusion and **no
   in-line pragma of any spelling** — an earlier revision used a sentinel
   comment, which was a repository-wide bypass token. Self-matching is handled by
   assembling patterns from fragments, so the scanner scans itself with no
   exemption. The allowlist takes `path:line:sha256=<digest> # justification`
   entries and rejects broad, stale, unjustified, or workflow-scoped ones **in
   code**, failing closed before scanning. Regression tests live in
   [`../tests/test_secret_scanner.py`](../tests/test_secret_scanner.py).
5. **Fail loudly and specifically.** A validator that says "failed" without
   saying what and where is not useful at 11pm.

## Governed by

[`../AGENTS.md`](../AGENTS.md)

## Validation

```sh
bash scripts/validate-scaffold.sh   # structure, taxonomy, indexes, secrets, binaries
bash scripts/scan-secrets.sh        # secret-shaped values in tracked text
node scripts/check-workspace.mjs       # manifest conformance and declared direction
node scripts/check-source-imports.mjs  # direction as source actually imports it
node scripts/check-knowledge.mjs       # knowledge registry conformance

# The two release checkers import the built knowledge toolchain — run
#   pnpm install --frozen-lockfile
#   pnpm --filter @secure-home/knowledge-toolchain run build
# first, or they fail with a module-resolution error instead of a verdict.
node scripts/check-set-releases.mjs    # real release records and manifest bytes
node scripts/check-release-history.mjs # what changed since the prior revision
node scripts/check-openspec-review-history.mjs  # reviews/ rounds are append-only
#   (stdlib-only: check.sh runs it beside the other node checks, not behind pnpm)

# Pre-apply only — once, before the first implementation change of a v2 change:
pnpm run review:manifest -- --change <change-name>
pnpm run review:verify   -- --change <change-name>
node scripts/check-images.mjs          # image lock and lineage invariants
node scripts/image-impact.mjs --base <trusted-commit> --head HEAD
node scripts/affected-targets.mjs <changed-files...>
bash scripts/check.sh               # all of the above, plus both workspaces
```

## The division of labour

Each mechanism has one job — conflating them is how drift becomes invisible:

| Mechanism | Governs | Dependency fields |
|---|---|---|
| **pnpm catalog** (`pnpm-workspace.yaml`) | canonical declared versions | — |
| **Syncpack** (`.syncpackrc.json`) | manifest policy, consistency, formatting | `dependencies`, `devDependencies`, `peerDependencies` |
| **`check-workspace.mjs`** | taxonomy, naming, scripts, **declared** direction | **all four**, including `optionalDependencies`; layering applies to the runtime three |
| **`check-source-imports.mjs`** | **imported** direction, read from source | not applicable — it reads `import`/`require`, not manifests |
| **`pnpm-lock.yaml`** | the exact resolved graph | — |

Two gaps make `check-workspace.mjs` load-bearing rather than decorative:

- **Syncpack does not enforce import direction.** It would happily approve a
  manifest in which `contracts` depends on an application.
- **Syncpack has no `optional` dependency type** — verified against syncpack
  15.3.2, which rejects it outright. `optionalDependencies` are therefore
  governed only by `check-workspace.mjs`.

Direction is checked against an **explicit per-package layer map** in
[`workspace-model.mjs`](workspace-model.mjs), not a per-directory one. A
per-directory layer would put every package on one level, so `contracts` could
depend on `logging` and still pass — the rule would read as enforced while
enforcing nothing. A package absent from the map is an error, so placing a new
package must be a decision. The map lives in one file because two copies would
stop agreeing about what "inward" means without anything failing.

### Why manifest direction is not enough

`check-workspace.mjs` excludes `devDependencies` from layering on purpose: every
member devDepends on `@secure-home/testing` (layer 6) and
`@secure-home/eslint-config` (layer 0), so counting those as architectural edges
would make the layer map unusable while preventing nothing.

That exclusion is correct for manifest policy and **false as a claim about the
repository**, because nothing in a manifest stops production source from
importing a devDependency:

```jsonc
// packages/contracts/package.json — accepted by manifest policy
"devDependencies": { "@secure-home/logging": "workspace:*" }
```

```ts
// packages/contracts/src/index.ts — layer 1 reaching outward to layer 4
import { log } from '@secure-home/logging'
```

TypeScript resolves it, `tsc` builds it, and manifest validation permits it. So
`check-source-imports.mjs` reads the source instead, applies the same layer map
to every import regardless of which field declared it, and additionally forbids
production source from importing a **test-only** or **build-tooling** package —
both of which sit at a layer the direction rule alone would allow.

Neither check substitutes for the other, and removing either re-opens a
direction hole the other cannot see. `tests/test_source_imports.py` runs both
over one fixture and asserts they *disagree*, so a future change that collapses
them into one fails rather than passing quietly.

Three deliberate properties of the source check:

- **It parses; it does not pattern-match.** An earlier revision matched
  import-shaped regular expressions against raw text. That is unsafe for a gate
  that runs unconditionally, in both directions: it reported commented-out
  imports, and it missed real ones written as
  `import { log } from /* c */ '@secure-home/logging'`. Masking comments and
  strings by hand fixes those two and leaves regular-expression literals
  containing quotes, template substitutions, and JSX text containing an
  apostrophe. So the checker uses TypeScript's own parser and walks the AST —
  a construct either is an import node or it is not. A file whose syntax the
  parser rejects **fails**; a file that cannot be parsed cannot be verified,
  and skipping it would restore the bypass.
- **Production is the default zone.** Only `tests/`, `__tests__/`, `*.test.*`,
  `*.spec.*`, and member-root `*.config.*` are relaxed. Code placed outside
  `src/` does not escape the rules by choosing a directory name.
- **A non-literal `import(expr)` in production source is a failure.** A computed
  specifier cannot be resolved statically, so permitting one would be a silent
  bypass of every rule above. The blind spot is closed by prohibition rather
  than left open — the same treatment the secret scanner gives binary files.

The same checks run as the repository merge gate —
[`../.github/workflows/checks.yml`](../.github/workflows/checks.yml).

## Maintenance-boundary lifecycle state

This repository has produced **no authoritative maintenance evidence**, and PR-B
(the landing that creates the boundary) cannot produce any. That is the explicit
genesis-only record, and it is a fact about where the executable authority comes
from rather than a status field:

- `repository_dispatch` always runs the **default-branch** definition of
  [`toolchain-maintenance-boundary.yml`](../.github/workflows/toolchain-maintenance-boundary.yml).
  Until that file is on the default branch there is no authoritative run to have.
- `classifyMaintenance()` separately refuses a predecessor that does not contain
  the verifier authorities (`PREDECESSOR_LACKS_VERIFIER`). PR-B is judged against
  a predecessor that lacks them, so no revision exists at which it admits itself.

An earlier draft encoded this as a `genesisState: GENESIS_ONLY` field the
classifier read. That was wrong, and removing it was a correction rather than a
relaxation: no accepted task defines the transition that would flip such a flag
to `OPERATIONAL`, so it would have refused the *first real maintenance candidate*
forever — deadlocking the authority it existed to protect. The presence of the
verifier at the predecessor expresses the same condition and becomes true simply
by merging.

The protocol is proved here by executable fixtures and ordinary hosted CI. Those
results are **not** predecessor-hosted maintenance evidence and are not
represented as such. The first authoritative run belongs to a later candidate
whose predecessor already contains this boundary.
