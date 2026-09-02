# Change Proposal: TypeScript 7 and lint-engine resilience

> **Authority boundary:** this artifact owns motivation, scope, impact, and
> non-goals. It does not own exact behavior, architectural mechanics, proof
> strategy, task state, or implementation authorization.

## Why

The repository's compiler, lint engine, and policy are coupled more tightly than
its architecture intends. Current `main` pins TypeScript 6.0.3 because
`typescript-eslint` 8.66.0 refuses TypeScript 7, while the ESLint configuration
contains mandatory typed-defect, static-defect, role, and framework-neutrality
policy. Treating the engine as the policy would make a compiler upgrade or a
security response capable of silently deleting those controls.

The immediate transition is TypeScript 7.0.2. The durable capability is broader:
the repository must own a machine-proven policy contract whose implementation
engine can be replaced without weakening it.

This change is ordered before PR #113. PR #113 is frozen and is not a base,
dependency source, cherry-pick source, or edit target for this work.

> **Remediation note (2026-09-01).** The original planning pull request
> (PR #114 — the PR-A vehicle) merged at `2026-09-01T04:54:43Z`, eleven minutes
> **before** its controlling independent review
> (`pull/114#pullrequestreview-5074082616`, submitted `2026-09-01T04:43:21Z`)
> could be addressed. A merged pull request cannot be reopened, returned to
> draft, or amended, and its branch was deleted. This is therefore an
> **exceptional remedial PR-A correction** that lands the review's bounded
> P1/P2 findings against the planning artifacts now on `main`. It is **not**
> PR-A2: PR-A2 remains the later acceptance-only ADR transition defined below.
> The normative program is still the four-vehicle sequence
> (PR-A → PR-A2 → PR-B → PR-C); this correction re-establishes that contract.

## Problem

Today:

- `typescript` 6.0.3 is both the authoritative compiler and the traditional AST
  API used by `scripts/check-source-imports.mjs`;
- ESLint 10.8.0, `@eslint/js` 10.0.1, `typescript-eslint` 8.66.0, and `globals`
  17.9.0 execute the lint policy;
- the policy is distributed across recommended presets, explicit shared rules,
  role exports, package-root overrides, adapter-entry exceptions, and ignore
  patterns;
- only four deliberately-invalid lint fixtures currently exercise individual
  rules dynamically;
- the normal TypeScript 7 package does not expose the traditional API used by
  the source-import architecture gate; and
- the repository has no engine-independent executable inventory proving that a
  replacement still enforces every existing rule and role difference.

A one-step TypeScript 7 bump fails in two distinct ways verified against the
current tree: `typescript-eslint` refuses TypeScript 7, and
`check-source-imports.mjs` crashes when `ScriptKind` is absent. Removing typed
lint or weakening the architecture gate would make the version update appear
successful by deleting the controls that reject unsafe code.

The supply-chain consequence is equally important. The compiler and linters
parse pull-request-controlled source and configuration. They are security-
relevant even though they are development dependencies. A vulnerability-driven
upgrade must therefore preserve policy, deterministic installation, platform
support, and authority separation rather than being accepted because the new
binary exits zero.

## Proposed Capability

The repository will separate stable policy authorities from replaceable tooling:

```text
formatting                       -> Prettier
compiler/type correctness        -> authoritative TypeScript compiler
static and typed defect policy   -> repository-owned lint-policy contract
lint execution mapping           -> repository-owned engine adapters
lint execution                   -> replaceable engine implementation(s)
package/source architecture      -> dedicated repository gates
traditional TypeScript AST API   -> bounded compatibility seam for admitted tooling
maintenance shortcut admission   -> trusted control  (default-branch invocation,
                                    exact live-predecessor verifier + classes,
                                    read-only metadata credential, subject plan)
                                 -> untrusted subject (isolated candidate-tool
                                    execution: no secret/token/Docker socket/
                                    shared cache/trusted-workspace write;
                                    output is untrusted data)
                                 -> trusted verdict  (fresh predecessor context
                                    re-verifies identities, subject-plan digest,
                                    command identities, envelope schema, and
                                    artifact digests; candidate output is evidence)
```

The selected implementation is Oxlint plus `oxlint-tsgolint`. TypeScript 7.0.2
becomes the authoritative compiler only after a dual-engine parity foundation
has landed. Microsoft’s `@typescript/typescript6` compatibility package is
permitted only for an explicit allowlist of repository tooling, initially
`scripts/check-source-imports.mjs`.

## What Changes

- Add Proposed ADR-0022 and this complete planning/assurance contract without
  changing current toolchain behavior.
- Sequence a separate acceptance-only ADR transition vehicle (PR-A2) between
  planning (PR-A) and the first implementation scope (PR-B), so ADR acceptance
  is an explicit, independently reviewed, implementation-free step rather than
  a self-approval hidden inside the planning or parity work.
- Plan a first implementation scope that establishes the engine-independent
  policy authority, dual ESLint/Oxlint parity, the bounded TS6 API seam, and
  native AMD64/ARM64 evidence while TypeScript 6 remains authoritative.
- Plan a second implementation scope that makes TypeScript 7.0.2 authoritative
  and retires ESLint only after the first scope's parity contract is proven.
- Establish executable security-remediation requirements so future tool
  replacement cannot silently remove policy, including by deleting a policy row
  together with the only fixture that would have exposed its loss.
- Establish a three-domain maintenance-verification boundary — trusted control,
  isolated untrusted subject, and trusted verdict — so the candidate cannot
  supply the checker, workflow, or invocation that decides whether its own
  changes qualify for the shortcut, and so candidate tools execute only in an
  isolated subject with no credential, secret, Docker socket, shared writable
  cache, or write access to any trusted workspace.
- Establish that a successful maintenance run is **point-in-time evidence**, not
  a permanent merge authorization: absent an enforceable ruleset or merge queue,
  a bounded owner merge-freshness control re-confirms head, base, merge-tree,
  and protected-authority identity immediately before merge.
- Keep PR #113 frozen and outside every branch, task, authority, and proof in
  this change.

## Scope

### In scope

This governed change defines a **four-vehicle merge-order sequence**:

1. **PR-A — planning and architecture (this change):** Proposed ADR-0022 and the
   complete governed-spec-driven-v2 contract. No toolchain behavior changes.
2. **PR-A2 — acceptance-only ADR transition:** a separately owner-authorized,
   independently reviewed, implementation-free change that transitions
   ADR-0022 `Proposed -> Accepted` only, bound to the exact accepted ADR byte
   digest, updating the ADR status, `docs/decisions/INDEX.md`, and the
   current-state mirrors atomically. PR-A2 does not by itself authorize PR-B.
3. **PR-B — replacement authority / parity foundation:** retain TypeScript 6 and
   ESLint, add the engine-independent policy authority, Oxlint plus typed lint,
   separate per-engine mappings, the genesis predecessor-bound maintenance
   contract, a default-branch trusted-control/untrusted-subject/trusted-verdict
   maintenance boundary, the TS6 compatibility seam, complete parity evidence, and
   native Linux AMD64/ARM64 proof. Both legacy and replacement lint paths must
   pass; PR-B does not self-classify through the maintenance shortcut it creates.
   PR-B may begin only from the exact post-PR-A2 `main` commit and only after a
   separate external implementation authorization; it cannot begin while
   ADR-0022 is `Proposed`.
4. **PR-C — TypeScript 7 cutover / ESLint retirement:** make TypeScript 7.0.2
   authoritative, preserve the bounded compatibility seam, move every member
   lint entry point to the replacement policy path, and remove ESLint only after
   PR-B's complete parity gate is satisfied.

The change also defines the future security-remediation contract for substituting
one lint/tooling implementation with another without changing repository policy.
That maintenance path is bound to a trusted predecessor: candidate-local schema
and fixture consistency is necessary but not sufficient evidence that policy was
preserved. The candidate is also input, not verifier: its workflow/checker bytes
cannot supply the authoritative invocation or decision.

### Out of scope

- implementing PR-B or PR-C in this planning pull request;
- changing any dependency version, lint command, TypeScript command, source file,
  architecture gate, or CI behavior in PR-A;
- modifying, rebasing, stacking on, cherry-picking, or resolving findings from
  PR #113;
- replacing `check-source-imports.mjs` with regular expressions or with Oxc AST
  APIs as part of this migration;
- using Oxlint type-check mode as a replacement for `pnpm typecheck`;
- adding self-hosted runner infrastructure;
- removing the TypeScript 6 compatibility seam after cutover; and
- expanding lint policy with newly fashionable rules during an engine-parity
  migration. New policy requires its own reviewed change.

## Affected Areas

Expected implementation impact is limited to repository tooling and its
verification surface:

- root dependency catalog, frozen lockfile, root scripts, and CI checks;
- `packages/eslint-config` during parity and retirement;
- a capability-oriented replacement package, planned as `packages/lint-config`;
- member `eslint.config.js` and `package.json` lint entry points during cutover;
- `scripts/check-source-imports.mjs` and a new compatibility-import guard;
- `packages/tsconfig`, every member tsconfig, and every `tsc` invocation as an
  audited compatibility surface; and
- policy fixtures, architecture-gate tests, install-policy tests, and native
  Linux platform proof; and
- a trusted default-branch maintenance-boundary workflow plus trusted-control
  verifier, isolated untrusted-subject execution, trusted-verdict verification,
  candidate-data, subject-isolation, and head/predecessor freshness tests; and
- a documented owner merge-freshness control for consuming point-in-time
  maintenance evidence.

No runtime application API, persisted data, profile, runner, image, credential,
or deployment surface changes.

## Governance

- **ADR-0001** — accepted architecture and repository contracts remain higher
  authority than this change.
- **ADR-0012** — TypeScript, pnpm, dependency direction, frozen installation,
  and CI execution are accepted; the new ADR refines only the lint-engine
  enforcement implementation.
- **ADR-0014** — durable authority-separation and vulnerability-response lessons
  require a canonical provider-neutral home and an explicit promotion
  determination.
- **ADR-0022 (Proposed)** — decouples TypeScript policy enforcement from the
  lint engine. It is non-operative until a separate explicit owner acceptance.

- **Depends on unresolved decisions:** none.
- **Effect:** not blocked by U1–U11. The change does not select persistence,
  runner placement, credentials, authorization, or any other unresolved topic.

This change proposes **no ADR status change**. It adds ADR-0022 as `Proposed` and
must not self-accept it. PR-A is the human-reviewed architecture vehicle; the
acceptance transition is a separate, explicitly owner-authorized,
implementation-free vehicle (PR-A2) with its own independent review and its own
reviewed commit. Neither PR-A nor this remedial correction accepts ADR-0022, and
PR-B implementation cannot be authorized until PR-A2 has merged.

## Trust / Security / Data Considerations

This is a high-risk repository-governance change because the affected tools
parse pull-request-controlled repository bytes and decide whether code is
admissible. It changes no production trust boundary and handles no credential,
PII, persistence, network mutation, or external system write.

The security boundary is:

```text
untrusted candidate source/config
        -> compiler / static linter / typed linter / architecture parser
        -> governed accept or reject decision

maintenance candidate Git tree
        -> trusted control: default-branch workflow, exact live-predecessor
           verifier/classes/command plan, read-only metadata credential,
           content-addressed subject plan
        -> untrusted subject: isolated runner/sandbox executes candidate tools
           with no secret/token/Docker socket/shared cache/trusted-workspace
           write; emits a result envelope as untrusted data
        -> trusted verdict: fresh predecessor context re-verifies predecessor
           SHA, candidate SHA, subject-plan digest, command identities, envelope
           schema, and artifact digests, then admits or refuses
        -> point-in-time maintenance evidence (owner re-confirms freshness at merge)
```

A parser crash, missing rule, default-rule drift, unproven platform binary, or
unapproved compatibility import must fail closed. Dev-dependency status does not
make such a parser security-neutral.

### Preliminary risk signal

`high`

`assurance.md` owns the final classification.

## Existing Evidence

| Evidence | Location / identity | What it establishes | Confidence / limitation |
|---|---|---|---|
| Exact base | `70f23f43a6ca95f128de664c242187ad6026a67d` from live `refs/heads/main` on 2026-08-31, re-resolved unchanged on 2026-09-01 | PR-A starts from current remote main, not PR #113 | Point-in-time; base freshness must be rechecked before review/merge |
| Current versions | `pnpm-workspace.yaml#catalog` | TS 6.0.3; ESLint 10.8.0; `@eslint/js` 10.0.1; `typescript-eslint` 8.66.0; globals 17.9.0 | Current-main fact, not future authority |
| Effective lint inventory | ESLint 10.8 API over current role configs | 117 enabled rule identities across all file/role modes: 46 TypeScript rules, 53 core rules effective on production TS, 18 additional JS-config rules | Registration/options do not prove replacement semantic parity |
| Existing lint fixtures | `packages/eslint-config/tests/` | Valid fixture plus four negative rules; role, framework-neutrality, and formatting-neutrality assertions | Deliberately insufficient for engine retirement |
| Compiler-API inventory | tracked-source import and API-symbol scan | `scripts/check-source-imports.mjs` is the only direct traditional compiler-API consumer | External dependencies may use their own APIs; this inventory concerns repository-owned code |
| TS7 disposable audit | detached copy of this exact base | all 35 tsconfigs resolve; all workspace typechecks/builds pass; shared-tsconfig tests pass; source-import gate and typescript-eslint fail for the expected API/support reasons | Linux AMD64 only |
| Compatibility-seam audit | disposable TS7 copy plus `@typescript/typescript6` | source-import gate passes over 308 files / 18 members; 44 behavioral import tests pass; TS7 remains the normal compiler | Temporary probe, not implementation |
| Package install probe | exact npm packages in a temporary pnpm workspace with `onlyBuiltDependencies: []` | frozen install succeeds; selected and native platform packages declare no install lifecycle scripts | Linux AMD64 execution only |
| Oxlint rule-registration probe | Oxlint 1.80.0 `--type-aware --print-config` | 115 current rule mappings register; `no-dupe-args` and `no-octal` are parser diagnostics; one materialized ESLint default option needs an engine-specific normalization | Rule registration is not fixture parity |
| Maintenance falsification | review of planned post-ESLint checks | deleting a policy row and its fixture together would leave the candidate policy/config/corpus internally consistent | Requires a trusted-predecessor and admitted-delta authority in Scope 1 |
| Trusted-boundary precedent | `.github/workflows/review-boundary.yml` and `scripts/openspec-candidate-workspace.mjs` | repository already proves a default-branch `repository_dispatch` workflow can execute trusted base tooling while materializing candidate Git objects only as inert data | Maintenance boundary must use the same trust shape, not the candidate checkout |
| Current merge controls | GitHub API: zero repository rulesets; `main` branch protection endpoint reports unprotected | no external rule independently anchors candidate workflow/verifier bytes or preserves a green result after branch movement | trusted run-boundary identity/freshness must be explicit; no merge-time-freshness overclaim |
| Native package inventory | npm registry manifests and downloaded tarballs | TS7, Oxlint, and tsgolint publish Linux x64 and ARM64 artifacts; binary formats match each architecture | ARM64 artifacts were inspected, not executed locally |
| Hosted ARM64 path | repository is public; GitHub-hosted standard runner docs list `ubuntu-24.04-arm` | native ARM64 proof can use the repository's existing GitHub-hosted trust model without self-hosted infrastructure | Must be exercised in PR-B and PR-C |

## Dependencies

| Dependency | State | Why needed | Gating? | Evidence / owner |
|---|---|---|---|---|
| ADR-0022 acceptance (via PR-A2) | proposed | makes policy authority independent of lint engine | yes, before PR-B implementation | repository owner |
| governed-spec-driven-v2 review epoch | implemented mechanism | pins planning bytes and scope before each implementation landing | yes | `openspec/AGENTS.md`, v2 schema, review gate |
| TypeScript 7.0.2 | external, verified | authoritative compiler target | yes for PR-C | Microsoft npm distribution |
| `@typescript/typescript6` 6.0.2 | external, verified | bounded traditional AST API seam | yes for PR-B | Microsoft package README and executable probe |
| Oxlint 1.80.0 | external, verified | selected static lint engine | yes for PR-B | Oxc npm distribution and executable probe |
| `oxlint-tsgolint` 7.0.2001 | external, verified | selected typed lint backend | yes for PR-B | Oxc package README and executable probe |
| Native Linux ARM64 hosted runner | available, not yet exercised | proves package install and execution on required architecture | yes before each implementation landing completes | GitHub-hosted `ubuntu-24.04-arm` |

## Success

The program succeeds when the repository can answer all of these from executable
evidence:

- exactly which compiler is authoritative;
- exactly which static and typed policies are mandatory;
- which engine mapping currently enforces each policy without making that
  mapping part of the semantic policy identity;
- whether an engine upgrade or substitution preserves every accept/reject case;
- whether the candidate preserved the trusted predecessor's policy/config/corpus
  rather than presenting a smaller self-consistent replacement;
- which exact workflow and verifier bytes made that decision, and why the
  candidate could not replace or skip them;
- why the architecture import gate remains independent and fail-closed;
- where the temporary TypeScript 6 API may be imported;
- whether frozen installation and required commands work on Linux AMD64 and
  ARM64; and
- why removing ESLint did not remove policy.

## Non-Goals

This change does not make Oxlint an architectural authority. It does not treat a
clean lint run as proof of compiler correctness. It does not permit automatic
install-script approval. It does not infer ARM64 execution from package metadata.
It does not create a general exception for legacy TypeScript APIs. It does not
resolve any unrelated architectural decision or alter PR #113.

## Decision Questions

### Gating decisions

| ID | Question | Owner | Required by | Status |
|---|---|---|---|---|
| GQ-TS7-001 | Is policy or the selected lint binary authoritative? | ADR-0022 reviewer/owner | PR-A acceptance | closed: policy is authoritative; engines are replaceable |
| GQ-TS7-002 | How does the source-import gate retain the traditional AST API? | architecture review | PR-B | closed: Microsoft `@typescript/typescript6`, allowlisted tooling only |
| GQ-TS7-003 | What provides native ARM64 proof without new self-hosted infrastructure? | architecture review | PR-B | closed: standard GitHub-hosted `ubuntu-24.04-arm` in this public repository |
| GQ-TS7-004 | How does the merge-order sequence respect explicit ADR acceptance? | repository owner | before PR-B authorization | closed: a dedicated acceptance-only vehicle (PR-A2) transitions ADR-0022 `Proposed -> Accepted` between PR-A and PR-B; PR-B may begin only from the exact post-PR-A2 `main` and only after separate implementation authorization |
| GQ-TS7-005 | What happens if any current rule or option lacks semantic parity? | implementation reviewer | PR-B completion | closed: PR-B stops, ESLint remains, PR-C is not authorized, and architecture is revisited only if no engine/repository/compiler allocation can preserve the policy |
| GQ-TS7-006 | What proves a tool-only security update preserved the predecessor's contract after the legacy oracle is gone? | architecture review | PR-B | closed by design: semantic policy/corpus and other protected authorities are compared with a trusted predecessor; only maintenance-class implementation deltas are admitted; unknown base or protected drift fails closed |
| GQ-TS7-007 | Whose executable bytes decide whether a candidate qualifies for maintenance? | architecture review | PR-B | closed by design: a trusted-control `repository_dispatch` definition from the default branch resolves the exact live predecessor, executes that predecessor's verifier/dependencies/command plan, and a trusted verdict re-verifies identities and digests; the candidate never supplies deciding bytes |
| GQ-TS7-008 | Where do candidate tools execute, and what may they touch? | architecture review | PR-B | closed by design: candidate tools execute only in an isolated untrusted subject domain with no credential, secret, `GITHUB_TOKEN`, Docker socket, shared writable cache, or trusted-workspace write; their output crosses back only as verified untrusted data |
| GQ-TS7-009 | Does a successful maintenance run authorize merge indefinitely? | repository owner | before each maintenance merge | closed: no; the run is point-in-time evidence, and a bounded owner merge-freshness control re-confirms head, base, merge-tree, and protected-authority identity at merge because no enforceable ruleset/merge-queue exists |

### Non-gating questions

| ID | Question | Owning task / landing | Why non-gating |
|---|---|---|---|
| NQ-TS7-001 | Exact JSON field names and generator implementation for the policy manifest | PR-B contract-first tasks | authority path/type and required facts are fixed; serialization details do not change behavior |
| NQ-TS7-002 | Whether member lint commands call a wrapper directly or through a root script | PR-B/PR-C entry-point tasks | `pnpm lint`, role coverage, dual-run, and separation outcomes are fixed |
| NQ-TS7-003 | Whether individual equivalent fixtures share a source file | PR-B fixture task | every policy-to-proof mapping remains explicit and executable |
| NQ-TS7-004 | Exact Git plumbing/API used to resolve the maintenance comparison base | PR-B maintenance-boundary task | trusted predecessor identity, fail-closed resolution, protected semantic projections, and allowed deltas are fixed |
| NQ-TS7-005 | Whether candidate data is streamed directly from Git objects or materialized as regular non-executable files | PR-B trusted-boundary task | candidate cannot supply executable verifier/invocation bytes either way; only predecessor code interprets it |

## Exactness Excluded from This Artifact

This proposal does not own the future policy-entry schema, engine mapping rows,
fixture inventory, maintenance-class rows, trusted-boundary implementation
details, package lock resolution, member-path inventory, or CI matrix.
`assurance.md` allocates those exact facts to one authority and `tasks.md`
creates them contract-first. `design.md` records current-main evidence only and
labels it as a snapshot, not a future policy source.
