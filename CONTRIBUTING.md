# Contributing

This repository is governed. Read this file before your first change; read
[`AGENTS.md`](AGENTS.md) before *any* change, human or automated.

## Instruction precedence

When two sources of guidance disagree, the higher one wins:

1. **Accepted ADRs and governed contracts** — [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md), [`docs/architecture/INDEX.md`](docs/architecture/INDEX.md)
2. **The applicable `AGENTS.md`** — the nearest one above the file you are editing
3. **Provider-specific instruction files** — [`CLAUDE.md`](CLAUDE.md), [`.github/copilot-instructions.md`](.github/copilot-instructions.md), `.github/agents/*.agent.md`
4. **The task prompt or issue**

A task prompt cannot authorize crossing an architectural contract. If a prompt
requires it, the correct output is a new ADR proposal, not a quiet exception.

## Current phase

This repository has landed contracts, the trusted runner core
([`packages/runner-core`](packages/runner-core/)), L4 orchestration
([`services/runner-control`](services/runner-control/)), and the knowledge
toolchain ([`packages/knowledge-toolchain`](packages/knowledge-toolchain/)).
There is intentionally **no deployed or activated runtime**: no launcher, no
process spawn, no household service running anywhere. Landed code is not a
running system, and the distinction is the point.

The ADRs are accepted, so implementation may proceed against them under an
authorizing task contract. **Acceptance is not authorization to deploy.** Of the
tracked set U1–U11, [U6](docs/architecture/unresolved-decisions.md#u6) was closed
by ADR-0013 (2026-08-12) and [U7](docs/architecture/unresolved-decisions.md#u7)
by ADR-0015 (2026-08-15); every other item is open, including
[U11](docs/architecture/unresolved-decisions.md#u11). Do not:

- install or configure Home Assistant,
- add live Docker services or deploy anything,
- stand up Keycloak, OpenFGA, Traefik, or Tailscale,
- create production APIs or a real runner image,
- add provider credentials of any kind,
- connect to the VPS database.

## Before you change anything

1. Read [`AGENTS.md`](AGENTS.md).
2. Read the nearest nested `AGENTS.md` (for example [`services/AGENTS.md`](services/AGENTS.md)).
3. Read the ADRs that govern the area — [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) maps each ADR to the directories it constrains.
4. Read the directory `README.md`. Every directory states what belongs in it and what does not.

## Branching

- Branch from `main`. Never commit to `main` directly.
- Branch names are `<type>/<short-kebab-summary>`, e.g.
  `docs/foundation-architecture-and-monorepo-scaffold`,
  `feat/runner-control-profile-loader`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). Types in use:

| Type | Use for |
|---|---|
| `docs` | documentation, ADRs, READMEs, architecture |
| `feat` | new behaviour in a service, package, or app |
| `fix` | corrected behaviour |
| `chore` | scaffolding, tooling, dependency, workspace plumbing |
| `refactor` | structure change with no behaviour change |
| `test` | tests only |
| `ci` | workflow and automation changes |

Scope is the top-level area: `docs(architecture):`, `chore(uv):`,
`feat(runner-control):`.

## Pull requests

Use [`.github/pull_request_template.md`](.github/pull_request_template.md). Every
PR must state:

- what it changes and why,
- which ADRs and architecture documents govern the change,
- explicit non-goals,
- the validation commands run and their results — **including anything skipped
  and why**,
- whether any trust boundary, identity flow, authorization path, safety policy,
  or degraded-mode behaviour is affected.

Open the PR as a **draft** until validation passes.

## Validation

```sh
# everything (reports skips explicitly, never silently)
bash scripts/check.sh

# individually
bash scripts/validate-scaffold.sh          # structure, indexes, secrets, generated dirs
uv sync --all-packages                     # Python workspace resolves
uv run ruff check .                        # Python lint
uv run ruff format --check .               # Python format
uv run mypy                                # Python types (targets configured in pyproject.toml)
uv run pytest                              # scaffold conformance tests
bash scripts/scan-secrets.sh               # secret-shaped values, all tracked text files
pnpm install --lockfile-only               # TypeScript workspace resolves
pnpm -r --if-present run check             # TypeScript package manifests
```

If a tool is unavailable on your machine, say so in the PR rather than dropping
the check silently.

### The merge gate

[`.github/workflows/checks.yml`](.github/workflows/checks.yml) implements the
ADR-0012 §20 model on every pull request and on `main`:

| Job | When | Runs |
|---|---|---|
| `repository governance` | **always** | scaffold validation · secret and binary scan · `--frozen-lockfile` · Syncpack · formatting · workspace taxonomy and **declared** direction · **source-import** direction |
| `affected-target calculation` | **always** | the tests for target selection itself |
| `select affected targets` | always | computes targets from the **dependency graph** |
| `typescript targets` | when affected | lint · typecheck · test · build, filtered to affected packages |
| `python inference target` | when affected | ruff · format · mypy · pytest |

**Governance jobs are never path-filtered.** They carry no `if:` condition and
are marked `# GOVERNANCE-UNCONDITIONAL`; `tests/test_affected_targets.py`
asserts that. A bug in target selection can therefore never skip them, and a
skipped target job still reports a conclusion so a required check cannot vanish.

Target selection follows the **dependency graph**: a change to
`packages/contracts` runs every dependent. Root configuration —
`pnpm-workspace.yaml`, `package.json`, the lockfile, Syncpack config, shared
`tsconfig` or ESLint packages, the workflow, the classifier — fans out to
everything.

Three properties of that gate are deliberate and must not be eroded:

- **Dependency direction is checked twice, on purpose.**
  `check-workspace.mjs` governs what a manifest may *declare* and excludes
  `devDependencies` from layering — necessary, because every member devDepends
  on `@secure-home/testing`. `check-source-imports.mjs` governs what source may
  *import*, applying the same layer map to every `import` and `require`
  regardless of which field declared it. Without the second, a package could
  devDepend on an outer package and import it from `src/**` with every gate
  green. Neither substitutes for the other; `tests/test_source_imports.py`
  asserts they disagree on a fixture built for that purpose.

- **Every third-party action is pinned to a full commit SHA**, not a moving tag
  like `@v4`. CI is part of the governance boundary; a repointed tag would change
  the code executing in the gate without a change to this repository. Bumps
  arrive as reviewable Dependabot pull requests
  ([`.github/dependabot.yml`](.github/dependabot.yml)).
- **The secret scan has no suppression mechanism except a validated allowlist.**
  It scans every tracked **text** file, including the workflow and the scanner
  itself. Pattern matching cannot read binary content, so the text-only
  assumption is enforced rather than assumed: `validate-scaffold.sh` fails if any
  binary file is tracked. Tracking one requires a reviewed decision that also
  says how it will be checked for embedded credentials.
  There is no file-level exclusion and **no in-line pragma of any spelling** — an
  earlier revision had a sentinel comment that turned out to be a
  repository-wide bypass token, and it is gone. Patterns are assembled from
  fragments so the scanner can scan itself with no exemption at all.
  [`scripts/secret-scan-allowlist.txt`](scripts/secret-scan-allowlist.txt) takes
  `path:line:sha256=<digest> # justification` entries: the digest means no
  credential material is written into the allowlist, and an entry stops applying
  the moment the line changes. Entries under `.github/workflows/`, path-only
  entries, wildcards, stale paths, truncated digests, and missing justifications
  are **rejected in code**, aborting the run before anything is scanned.

**Local evidence does not substitute for it.** Reporting a green run on your own
machine is useful context, but the repository enforces the portable checks
automatically so a later change cannot merge without reproducing them. The two
lockfile-strict flags matter: they fail on a stale `uv.lock` or a
`pnpm-lock.yaml` that no longer matches the manifests, rather than quietly
updating either.

## Review findings that are always worth raising

These are review policy, and they live here — provider-neutrally — rather than in
any provider's instruction file. A provider adapter may point at this section; it
does not own it, and a rule that exists only in an adapter is not repository
policy.

1. **Prose that "reads as enforced" with no mechanism behind it.** A description
   of a control is not a control. If a document says something is prevented,
   something must prevent it.
2. **A test or assertion that cannot fail.** It reports success unconditionally
   and is worse than no test, because it occupies the space where a real one
   would go.
3. **One defect, unswept.** Finding an instance means looking for the class. A
   fix that repairs the reported occurrence and leaves its siblings has not
   finished the work.
4. **A claim stronger than its mechanism.** Where the mechanism has a known
   limit, the limit belongs in the claim — a guarantee stated more broadly than
   it holds is relied on as though it were true.

## Proof quality

This applies **whenever a change or a review claims to have proved a property**.
It is not a requirement to prove everything, and it does not ask for mutation
testing on an ordinary pull request. The obligation is narrower and harder to
evade: **the evidence must actually support whatever claim is made.**

A claimed proof reaches the mechanism it names:

```text
claim
  -> mechanism
  -> contract-valid fixture
  -> valid control
  -> adversarial perturbation / mutant / negative case
  -> expected failure
  -> actual failure FOR THE INTENDED REASON
```

The last line is the one that is usually skipped. A test that fails is not
evidence; a test that fails *for the reason the claim names* is.

1. **A fixture rejected before reaching the named mechanism proves nothing about
   that mechanism.** A malformed input refused by an earlier validator never
   arrived.
2. **A compiler failure caused by an unrelated error is not a compile-time
   proof.** A missing property elsewhere in the object will fail the build while
   saying nothing about the rule under test.
3. **A structural guard is not proven by reading or grepping its own
   implementation.** Scanning the guard's source tests the text, not the
   property. Exercise it against **a planted violation it must catch** and **a
   valid control it must allow**.
4. **A mutant that dies from setup noise, environment failure, or a different
   guard is not evidence** that the named mechanism killed it.
5. **A passing control must establish that the negative fixture reached the
   target boundary** — otherwise the negative may be failing somewhere harmless.
6. **If the intended perturbation survives, investigate which of two things is
   wrong**: the implementation, or the proof. Do not weaken the assertion to make
   it green. A surviving mutant is information, and deleting it destroys the
   information rather than the defect.
7. **Where a review supplies failing (RED) cases, preserve the failing premise
   and the failure reason.** Do not turn a reviewer's test into a different test
   that happens to pass. If the original is itself invalid, prove that and
   document the correction.
8. **Match proof strength to the claim:**

   | Claim | Evidence that supports it |
   |---|---|
   | runtime behaviour | behavioural / adversarial proof |
   | type-level impossibility | compiler-shaped proof |
   | exhaustive structural property | structural proof exercised against a counterexample |
   | replay / idempotency | repeated and cross-path behavioural proof |
   | "a mutant would be caught" | an actually applied mutant, or an equivalent perturbation |

This rule is governance, not architecture: it belongs to how this repository
reviews changes. Provider instruction files may **link** to this section; they
must not restate or own it, because two copies of a rule become two different
rules.

## Issues

Implementation issues and epics are created by the human/ChatGPT planning
workflow **after** the foundational ADRs are reviewed. Contributors and coding
agents do not create GitHub issues as part of a change unless a task explicitly
asks for it.

## Documentation rules

- Do not duplicate content between files. Cross-reference.
- Update the governing `INDEX.md` when you add, rename, or remove a document
  under `docs/architecture/` or `docs/decisions/`. The scaffold validator fails
  on an index entry that points at a missing file.
- Every directory that the validator requires a `README.md` for must explain:
  what belongs there, what does not, the ownership and boundary rules, the
  higher-level document that governs it, and the validation commands it will
  eventually carry.
- ADR-0001 … ADR-0018 are `Accepted` and **immutable**. Never edit an accepted
  ADR; supersede it with a new one and update
  [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) in the same change. The
  index records each acceptance date.
- A new ADR starts `Proposed`. **Do not self-accept it**, and **never change any
  ADR's status without an explicit human-acceptance task**; acceptance is a human
  decision made in its own reviewed change.
- Accepting an ADR never resolves anything in
  [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md).
