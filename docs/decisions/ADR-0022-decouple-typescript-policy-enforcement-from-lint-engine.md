# ADR-0022: Decouple TypeScript policy enforcement from the lint engine

- **Status:** Proposed
- **Date:** 2026-08-31
- **Deciders:** @mikegtech (repository owner) — acceptance is a separate explicit human act
- **Refines in part:** [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) §§15, 19, and 20 **only where they assign enforcement to a selected lint implementation**. It preserves TypeScript as the primary language, pnpm/catalog/frozen-lock governance, the inward dependency rule, repository taxonomy, dedicated source/manifest checks, and the CI execution model
- **Supersedes:** no ADR in full. ADR-0012 remains accepted and immutable
- **Preserves:** [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — policy and vulnerability-response truths have a provider-neutral canonical home
- **Closes:** no unresolved decision
- **Gates:** the TypeScript 7 / lint-engine resilience implementation scopes. Neither may begin while this ADR is Proposed, the governed v2 review is incomplete, or external implementation authority is absent
- **Related change:** [`openspec/changes/typescript-7-lint-engine-resilience/`](../../openspec/changes/typescript-7-lint-engine-resilience/)

---

## Context

### The present coupling

ADR-0012 correctly made TypeScript the primary implementation language, made
package/source direction enforceable, and made root tooling changes fan out
through CI. Its §15 wording names ESLint as one enforcement mechanism because
ESLint was the selected implementation when the decision was written.

The repository now has more specific mechanisms than that sentence implies:

- `scripts/check-workspace.mjs` governs manifest declaration direction;
- `scripts/check-source-imports.mjs` parses actual source imports and enforces
  package/source architecture independently;
- Prettier is explicitly the sole formatting authority;
- the TypeScript compiler owns type correctness and build output; and
- `packages/eslint-config` owns a substantial typed/static lint policy.

The architecture has therefore evolved into distinct authorities even though one
accepted sentence still names the lint implementation beside the architecture
rule.

The current tool versions make the coupling operationally visible. TypeScript
6.0.3 is pinned because `typescript-eslint` 8.66.0 refuses TypeScript 7.0. A
straight bump to TypeScript 7.0.2 makes the current type-aware lint package fail
to load.

That is not a reason to delete typed lint. It is evidence that the repository
must separate the policy from the implementation executing it.

### The policy is load-bearing

The effective current lint policy includes rules inherited from ESLint and
`typescript-eslint` recommended presets, explicit promise/unsafe/type-import/
suppression/console policies, role differences, process-boundary restrictions,
JavaScript/config behavior, ignore patterns, framework neutrality, and narrow
adapter-entry exceptions.

Only a small representative subset has dedicated negative fixtures today.
Removing ESLint because a replacement “supports most rules” would not prove that
all current policy survived. Engine configuration text and rule registration are
not semantic parity.

### TypeScript 7 separates compiler and API questions

TypeScript 7.0.2 supplies the normal compiler through native platform packages.
Its root programmatic export does not provide the traditional API currently used
by `scripts/check-source-imports.mjs`: `ScriptKind`, `createSourceFile`, node type
guards, AST walking, diagnostics flattening, and related values are absent.

Microsoft publishes `@typescript/typescript6` for side-by-side use: it exposes a
`tsc6` command and reexports the TypeScript 6 traditional API. Repository
inspection finds one direct owned consumer of that API:
`scripts/check-source-imports.mjs`.

The compatibility seam is therefore bounded and safer than either weakening the
architecture gate or rewriting it during the compiler migration.

### Tooling dependencies are security-relevant

The compiler, linters, and compatibility parser process pull-request-controlled
source/configuration and decide whether it may merge. They are development
dependencies, but they execute on untrusted bytes in CI. A vulnerability in one
is not security-neutral because its package field says `devDependency`.

A security response may need an urgent version upgrade or an implementation
substitution. If policy authority equals one binary, either action reopens
architecture or silently changes policy. The repository needs the opposite:
replaceable engines behind a stable executable contract.

## Decision

### 1. The repository owns a capability model, not a lint brand

The authority topology is:

```text
Formatting
    -> Prettier

Compiler/type correctness and emitted output
    -> the authoritative TypeScript compiler

Typed and static defect policy
    -> a repository-owned machine-readable lint-policy contract

Lint execution
    -> repository-owned per-engine mappings
    -> one or more replaceable engine implementations

Package/source architectural direction
    -> dedicated repository-owned architecture gates

Traditional TypeScript compiler API
    -> bounded compatibility dependency for admitted repository tooling only

Tool-maintenance shortcut admission
    -> default-branch invocation authority
    -> verifier executable loaded from the exact live predecessor
    -> candidate tree supplied as data, never as the deciding verifier
```

An engine config is a projection of policy. It is not the policy's architectural
source.

### 2. TypeScript compiler diagnostics are authoritative for compiler correctness

At Scope 2 cutover, the normal `typescript` package at exactly TypeScript 7.0.2
is the one answer to “what compiler does this repository use?”

`pnpm typecheck`, member `typecheck`, member `build`, and generator compilation
continue to use that normal package. Compiler success and lint success are
separate results.

Oxlint's type-check option is not the compiler authority and may not substitute
for the independent TypeScript gate.

The exact 7.0.2 pin is the initial cutover identity, not a permanent ban on a
later security or compatibility update. After cutover, one exact normal compiler
pin remains authoritative. A later exact TypeScript version may replace 7.0.2
without a new ADR only through the predecessor-bound maintenance contract in
§10, with compiler configuration, negative/positive conformance, architecture
gates, installation posture, and supported platforms preserved. Replacing the
normal compiler authority with `tsc6`, a lint type-check mode, or another
authority is an architecture change.

### 3. Typed and static lint policy remains mandatory

Every effective existing lint policy must receive one explicit disposition:

```text
MIGRATED_TO_NEW_LINT_ENGINE
REPLACED_BY_TYPESCRIPT_COMPILER
REPLACED_BY_DEDICATED_REPOSITORY_GATE
```

`DROPPED`, omitted, and “the new engine does not support it” are not dispositions.

The canonical executable policy must include stable engine-neutral policy IDs,
role/path applicability, policy semantics/options, blocking posture, and proof
references. Per-engine rule/parser mappings are a separate implementation
authority joined to those stable IDs. Historical ESLint origin may be retained
as bootstrap provenance, but it is not a required permanent identity for a
future policy.

Engine defaults are disabled: a new default rule is a policy proposal, not an
automatic upgrade benefit.

### 4. Prettier remains the single formatting authority

No lint engine may gain formatting authority during this migration. Existing
Prettier config, ignore policy, and format gate remain independent.

A lint-engine migration must not reformat unrelated source or introduce
stylistic rules through default categories.

### 5. Package/source architecture remains independently enforced

The inward rule remains unchanged:

```text
contracts  <-  domain  <-  application  <-  adapters  <-  apps
```

No package imports a service or application. Production source does not reach
outward through a devDependency, across another member's filesystem, into direct
knowledge bytes, or into build tooling.

`check-workspace.mjs` and `check-source-imports.mjs` remain dedicated repository
gates. Their authority does not move into Oxlint merely because an engine and an
architecture gate may share parser technology.

This refines ADR-0012's enforcement topology, not its dependency direction.

### 6. Lint execution engines are replaceable implementation details

The selected initial replacement implementation is:

- Oxlint for static/syntax policy; and
- `oxlint-tsgolint` / tsgolint through `oxlint --type-aware` for typed policy.

Their exact versions are implementation pins in the pnpm catalog and frozen
lockfile, not permanent architectural identities. The audited initial versions
are recorded by the governed change; a conforming future exact version or
replacement may be selected without a new ADR when §10 is satisfied.

Engine mappings are repository-owned implementation data separate from the
semantic policy and conformance corpus. Replacing an engine may change its pin,
its mapping, and generated engine projections. It may not redefine a stable
policy ID, role, option, blocking posture, or fixture merely to make the
replacement pass.

### 7. Removing the legacy engine requires executable parity

The migration has two independently releasable implementation scopes.

**Scope 1 — replacement authority / parity foundation**

- TypeScript 6.0.3 remains the normal compiler temporarily.
- ESLint/typescript-eslint remain installed and blocking.
- The repository-owned policy authority is created from the complete resolved
  current policy with a drift check.
- Oxlint + tsgolint are introduced.
- Legacy and replacement paths both execute and block.
- Every policy and role has positive/negative executable evidence.
- The TS6 compatibility seam and native platform proof land.

**Scope 2 — TypeScript 7 cutover / ESLint retirement**

- begins only after Scope 1 is merged and independently reviewed;
- repeats the compiler compatibility audit against then-current main;
- makes TypeScript 7.0.2 authoritative;
- preserves the compatibility-backed source-import gate;
- switches every lint entry point to the capability package; and
- removes ESLint packages/config only when complete parity remains green.

A green repository lint on ordinary source is insufficient. The replacement must
kill deliberate defect mutations.

### 8. The TypeScript 6 compatibility API is narrow and non-authoritative

`@typescript/typescript6` is permitted only for exact paths in a machine-checked
allowlist. The initial admitted set contains only:

```text
scripts/check-source-imports.mjs
```

The package's `tsc6` command may not appear in any typecheck, build, or generator
entry point. Applications, services, reusable libraries, adapters, and arbitrary
new scripts may not import it.

The compatibility package and the actual TypeScript 6 API version it resolves
must be lock-bound and executable-version checked.

A later stable TypeScript 7 API may replace this seam only in a separate change
with behavioral equivalence proof. Its removal is not a completion criterion for
this program.

### 9. ESLint may be reintroduced when policy requires it

This decision does not prohibit ESLint. It removes ESLint's architectural
identity.

If a future accepted policy cannot be enforced by the selected engine and
executable evidence shows ESLint is the safest conforming implementation, ESLint
may be reintroduced behind the same policy contract.

### 10. Security remediation may replace tools without deleting policy

A vulnerability-driven implementation update or substitution does not require a
new architecture decision when all of these remain true:

- the maintenance claim is compared with a trusted predecessor selected by the
  repository workflow, not only with candidate-authored state;
- the authoritative admission decision executes workflow and verifier bytes from
  that exact predecessor, never from the candidate being judged;
- positive policy fixtures pass;
- negative policy fixtures fail for the intended policy;
- required compiler/lint/architecture commands remain separate;
- frozen install succeeds from exact pins;
- install-script policy remains satisfied;
- supported native platforms execute the required command pack; and
- every canonical policy entry retains one enforcing disposition.

The maintenance transition is a closed, fail-closed classification:

| Maintenance class | Candidate may change | Candidate must preserve from the trusted predecessor |
|---|---|---|
| lint engine | exact engine pins, only their derived transitive lock subgraph, the selected engine's mapping, generated engine config/adapter | semantic lint policy, roles/options/blocking posture, conformance fixture bytes and harness, compiler policy, formatter, architecture gates, install posture, platform set, predecessor maintenance classes, and trusted verifier authority |
| normal TypeScript compiler | exact normal-compiler pin, only its derived transitive lock subgraph, version expectations, audit evidence/adapter required by the new compiler | shared compiler configuration, compiler conformance fixtures/harness, lint policy/corpus, TS6 consumer boundary, formatter, architecture gates, install posture, platform set, predecessor maintenance classes, and trusted verifier authority |
| TS6 compatibility parser | exact compatibility-package pin, only its derived transitive lock subgraph, expected resolved API identity, and the bounded package-import adapter | admitted consumer allowlist, source-import semantics/corpus/harness, normal compiler authority, lint policy/corpus, install posture, platform set, predecessor maintenance classes, and trusted verifier authority |

The exact allowed/protected authority sets are machine-readable and
history-checked. The predecessor's maintenance class defines the comparison; a
candidate may not widen its own allowed set or alter the trusted verifier
authority. Lockfile change is limited to the selected package roots and their
deterministically derived transitive closure; unrelated graph movement fails.

The verifier is a separate authority from those classes:

```text
repository_dispatch
        -> workflow definition from the default branch
        -> resolve exact candidate head + exact live default-branch predecessor
        -> require dispatch workflow SHA == live predecessor SHA
        -> check out only that predecessor as executable code
        -> execute its verifier and dependencies
        -> supply candidate Git objects / inert materialized files as data
        -> re-resolve candidate head + live predecessor
        -> movement or disagreement = REFUSE
```

The candidate's workflow, checker, package scripts, and helper programs have no
authority over this admission decision. A candidate may contain a changed
`scripts/check-toolchain-boundaries.mjs` or a workflow that exits successfully;
the trusted boundary does not execute either copy. If candidate implementation
binaries must run for conformance, the predecessor-owned command plan launches
them only as subjects under test after structural admission; their output cannot
decide whether the trusted verifier ran.

The trusted boundary is a run-boundary proof. It records one exact predecessor
and one exact candidate head and refuses if either moves while it runs. The
repository currently has no ruleset or branch protection that preserves that
freshness indefinitely after success; merge-time freshness remains an external
repository-policy concern rather than a promise of this ADR.

Scope 1 creates this maintenance authority under the full dual-engine,
architecture-review, and native-platform proof. It is the genesis contract and
does not self-classify PR-B as maintenance. Its candidate workflow/verifier
copies are not trusted merely because they implement the future boundary. Only a
later candidate may claim a maintenance class after the trusted workflow and
verifier have merged into the live predecessor.

Accordingly, PR-B proves the protocol with executable fixtures and ordinary
hosted CI but records no authoritative maintenance admission: a
`repository_dispatch` definition cannot execute from the default branch before
it has merged there. Every later maintenance candidate must provide the real
predecessor-hosted boundary run as part of its own evidence.

A missing or ambiguous predecessor, unreadable diff, malformed maintenance
policy, missing predecessor verifier, candidate-controlled invocation, changed
protected authority, unrelated lock movement, head/predecessor movement, or
candidate that deletes a policy row together with its fixture is **not** a
successful maintenance update. It fails closed and is routed to the separately
reviewed policy or architecture path.

The initial TypeScript 7.0.2 cutover is still mandatory for this program.
Subsequent exact compiler updates do not reopen the authority decision when the
normal `typescript` package remains the sole compiler and the compiler
maintenance row above is satisfied.

If remediation requires changing policy, authority allocation, trust boundary,
supported-platform set, or install-script posture, it is not merely a version
update and receives the appropriate review.

Urgency never authorizes a silent policy drop.

### 11. Vulnerability response distinguishes exposure classes

At minimum, tooling is classified as:

| Class | Security interpretation |
|---|---|
| runtime production dependency | part of deployed runtime attack surface |
| CI/build parser consuming pull-request-controlled bytes | security-relevant execution and merge-admission surface even as a devDependency |
| local-only development utility with no untrusted-input path | separately assessed; not automatically equivalent to the two classes above |

The classification follows actual data/execution flow, not package.json field.
This ADR sets no remediation SLA.

### 12. Frozen install and platform proof are mandatory

Exact versions live in the pnpm catalog; the lockfile owns resolved package and
native artifact identities. `onlyBuiltDependencies: []` remains in force. This
change creates no permission to approve an install script.

Linux AMD64 and Linux ARM64 must each execute the required frozen install, lint,
typecheck, architecture-import, and test command packs before the relevant scope
is complete. Package metadata or an ARM64 tarball is evidence of distribution,
not execution.

The repository is public and already trusts GitHub-hosted runners; the standard
`ubuntu-24.04-arm` runner is the selected native ARM64 proof path. No self-hosted
runner is introduced by this decision.

### 13. The implementation sequence is three pull requests

```text
PR-A  planning + Proposed ADR (this change)
  -> PR-B  Scope 1 parity foundation
  -> PR-C  Scope 2 TypeScript 7 cutover / ESLint retirement
```

Each implementation scope gets its own governed-spec-driven-v2 review epoch and
external authorization.

PR-A starts with this ADR Proposed. Only explicit repository-owner action may
accept it. If the owner requires ADR acceptance in a separate pull request rather
than within the reviewed PR-A vehicle, the three-PR constraint is no longer safe;
the program stops and reports that governance prerequisite instead of hiding a
fourth transition.

PR #113 is frozen and outside this sequence. It is rebased separately after the
program, not used as input to it.

## Consequences

### Positive

- TypeScript 7 can become the compiler without deleting typed lint.
- A lint-engine CVE can be remediated through a reusable conformance corpus.
- A tool-update PR cannot delete a policy and its only failing fixture together
  while still claiming the predecessor's contract.
- The repository can prove every old policy survived rather than comparing rule
  counts or config strings.
- Compiler, lint, formatter, and architecture-gate responsibilities are explicit.
- Legacy compiler API use cannot spread into product code.
- Native Linux ARM64 becomes execution evidence, not package-metadata optimism.
- A capability-oriented `packages/lint-config` may survive future engine changes.

### Negative

- Scope 1 temporarily runs two lint engines and carries two compiler packages.
- Complete per-policy fixture coverage is materially more work than migrating
  the currently tested four rules.
- Native ARM64 CI adds time and a hosted-runner dependency to toolchain changes.
- A policy manifest, schema, generator, and drift checks add repository tooling
  that must themselves be maintained.
- Security updates cannot bypass conformance even when urgent.

### Neutral

- No production runtime behavior, package API, profile, credential, datastore,
  device control, or deployment changes.
- The selected engine may change later without changing this decision.
- The TypeScript 6 compatibility package may remain after program completion.

## Alternatives considered

### Keep TypeScript 6 until typescript-eslint supports TypeScript 7

Reasonable and rejected as the durable answer. It avoids the immediate migration
but leaves policy authority coupled to one engine ecosystem and does not improve
vulnerability-response resilience.

### Upgrade TypeScript 7 and disable type-aware lint

Rejected. It achieves the version number by deleting promise/unsafe/type-aware
policy. Compiler strictness does not replace those semantics.

### Remove ESLint and trust Oxlint's supported-rule list

Rejected. Registration and documentation do not prove options, roles, ignores,
or accept/reject behavior. One audited mismatch already exists in a materialized
rule option.

### Validate only the candidate's policy and fixtures during tool maintenance

Rejected. After ESLint retirement, a candidate could delete a policy row and its
only negative fixture together, leaving a self-consistent smaller corpus. A
maintenance claim must therefore bind protected policy/config/corpus bytes to a
trusted predecessor and permit only the implementation-specific deltas declared
for that maintenance class.

### Execute the candidate's checker against trusted predecessor data

Rejected. Trusting the predecessor data while executing a candidate-controlled
checker leaves the candidate in charge of its own admission. It can replace the
checker with unconditional success, delete policy and evidence together, and
have its own workflow skip the real comparison. The workflow definition,
verifier executable, its dependencies, and invocation plan must come from the
exact live predecessor; the candidate is data and a subject under test, never
the maintenance-admission authority.

### Make Oxlint configuration the policy authority

Rejected. Engine defaults, rule names, and option schemas would become
architecture. Replacing Oxlint would then require translating authority rather
than implementing it.

### Use Oxlint `--type-check` instead of `tsc --noEmit`

Rejected. The mode is experimental and would collapse compiler and lint
authority into one result.

### Rewrite `check-source-imports.mjs` onto Oxc or regexes

Rejected for this migration. Regex parsing has already been falsified in this
repository, while an Oxc rewrite changes the architecture gate at the same time
as the compiler. The Microsoft TS6 compatibility package preserves the existing
semantic seam with less change.

### Use TypeScript 7 unstable APIs

Rejected. Their namespace states the stability boundary. The architecture gate
is unconditional governance infrastructure and should not depend on an unstable
API when a supported compatibility package exists.

### Approve install scripts for native tools

Rejected. The audited packages distribute platform artifacts and install with
`onlyBuiltDependencies: []`; there is no evidence-based need for an exception.

### Accept ARM64 package metadata as proof

Rejected. The native binary can exist and still fail to install, load, configure,
or execute the repository command pack.

### One implementation pull request

Rejected. It would remove the legacy oracle in the same review that claims
parity. The two implementation scopes are independently safe and rollbackable.

### More than two implementation pull requests

Not supported by current evidence. The policy foundation and compiler cutover
are the two authority transitions. Further splitting is warranted only by a
newly discovered independent release boundary, not task size alone.

## Security implications

This decision strengthens a CI trust boundary: untrusted candidate bytes are
parsed only by exact, frozen, platform-proven tools whose output is checked
against repository policy. For the maintenance shortcut specifically, the
default-branch workflow and exact live-predecessor verifier decide admission;
the candidate cannot authorize its own checker or invocation path.

The key risk is native parser execution. A compromised compiler/linter can read
the checkout and influence merge admission. Exact pins and no-install-script
posture reduce drift but do not make the binary trustworthy; vulnerability
monitoring and rapid replacement remain necessary. The conformance corpus makes
replacement possible without sacrificing controls.

The compatibility parser is intentionally constrained because a legacy API
package that spreads through production code becomes a second compiler ecosystem
rather than a migration seam.

No secret, provider credential, household data, authorization decision, or live
external mutation is involved.

## Availability implications

CI on toolchain-affecting changes gains native ARM64 work and dual lint during
Scope 1, increasing wall-clock/resource cost. This is accepted because those
changes can alter every repository gate. Ordinary runtime/household availability
is unaffected.

A hosted ARM64 outage is an operational failure: the affected implementation
scope remains incomplete and may retry. It is not reclassified as platform
support.

Rollback is repository-only: Scope 1 rolls back to the pre-migration tree; Scope
2 rolls back to the complete dual-engine Scope 1 tree. No persisted/external
effect needs reconciliation.

## Acceptance criteria

This ADR may be accepted when a reviewer and repository owner agree that:

1. policy authority is correctly separated from engine identity;
2. every current lint rule/role must have an executable disposition and parity
   proof before ESLint retirement;
3. compiler typecheck, lint, Prettier, and architecture gates remain independent;
4. the TS6 compatibility seam is bounded to admitted tooling and cannot become
   compiler authority;
5. exact package, install-script, and native-platform obligations are sufficient
   for supply-chain resilience;
6. engine mappings are separate from engine-neutral policy and fixture
   authority;
7. security-remediation substitution is predecessor-bound and cannot remove a
   policy together with its evidence;
8. the candidate being judged cannot supply the authoritative maintenance
   verifier or invocation boundary, and head/predecessor movement is refused;
9. the two implementation scopes and review epochs are the correct atomic seams;
10. no unrelated ADR, unresolved decision, runtime, or PR #113 scope is changed.

## Validation and follow-up obligations

1. PR-A keeps this ADR `Proposed`, validates the complete v2 package strictly,
   updates `docs/decisions/INDEX.md`, and opens as a draft. No implementation.
2. An independent governed review evaluates the exact planning bytes. The
   author may not self-accept.
3. Repository-owner acceptance is explicit and precedes PR-B authorization.
4. PR-B lands the engine-neutral policy schema/manifest, separate per-engine
   mappings, full current-policy extraction, generated replacement config,
   complete fixture corpus, dual blocking engines, predecessor-bound maintenance
   classifier, trusted default-branch maintenance-verification boundary, bounded
   TS6 seam, and native AMD64/ARM64 proof while retaining TypeScript 6 and
   ESLint.
5. If any current policy lacks semantic parity, PR-B stops; ESLint remains and
   PR-C is not authorized.
6. PR-B proves an allowed
   pin/mapping-only update passes while row-plus-fixture deletion,
   shared-tsconfig relaxation, protected-corpus drift, and unresolved predecessor
   identity fail.
7. PR-B proves that replacing the candidate checker with unconditional success,
   deleting its path, or editing the candidate workflow cannot bypass the
   predecessor verifier, and that candidate/predecessor movement refuses the
   run.
8. PR-C repeats the TS7 audit against current main, establishes TS7 compiler
   identity, removes all ESLint residue atomically, retains the compatibility
   seam, and proves native AMD64/ARM64 full commands.
9. Every future tooling security substitution executes the same policy,
   installation, platform, separation, and predecessor-continuity contract.
10. `onlyBuiltDependencies: []` remains; any exception requires separate review.
11. Promotion determination: this ADR is the canonical architectural home. After
   acceptance, existing portable implementation/review knowledge may be updated
   as a subordinate projection under a separately authorized change; no new
   module is required by this proposal.
12. This ADR resolves no item in `unresolved-decisions.md` and authorizes no
    deployment, credential, or device access.

## Links

- [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
- [`openspec/changes/typescript-7-lint-engine-resilience/`](../../openspec/changes/typescript-7-lint-engine-resilience/)
- [`packages/eslint-config/`](../../packages/eslint-config/)
- [`packages/tsconfig/`](../../packages/tsconfig/)
- [`scripts/check-source-imports.mjs`](../../scripts/check-source-imports.mjs)
- [`scripts/check-workspace.mjs`](../../scripts/check-workspace.mjs)

---

**Proposed only.** It decides nothing until an explicit human acceptance change.
Do not implement either scope from this file or its OpenSpec package alone.
