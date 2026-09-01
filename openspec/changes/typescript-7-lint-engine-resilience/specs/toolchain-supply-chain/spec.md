# Toolchain Supply Chain

## Purpose

Define deterministic installation, native-platform execution, and vulnerability-
response behavior for the compiler and lint toolchain.

---

## ADDED Requirements

### Requirement: Toolchain versions and resolution are exact

**Requirement ID:** `REQ-SC-001`

**Canonical authority references:** `AUTH-ENGINE-PINS`, `AUTH-TS-PINS`,
`AUTH-INSTALL-POLICY`

Selected compiler, lint, typed-lint, and compatibility packages SHALL be pinned
exactly in the pnpm catalog and resolved by the frozen lockfile. `latest`, ranges,
ambient global binaries, and unreviewed transitive substitution SHALL NOT be
accepted as repository identity.

The initial audited implementation versions are TypeScript 7.0.2, Oxlint 1.80.0,
`oxlint-tsgolint` 7.0.2001, and `@typescript/typescript6` 6.0.2. The compatibility
wrapper's resolved TypeScript 6 API version SHALL also be recorded and checked by
executable evidence.

#### Scenario: Frozen install resolves the audited graph

- **GIVEN** an empty `node_modules` and the committed lockfile
- **WHEN** `pnpm install --frozen-lockfile` runs
- **THEN** the installed package and native-platform versions SHALL match the
  committed identities
- **AND** no lockfile mutation SHALL occur

#### Scenario: Catalog uses a range or latest

- **GIVEN** any selected tool declaration is changed to a range, tag, or
  non-catalog version
- **WHEN** dependency governance runs
- **THEN** validation SHALL fail

#### Scenario: Compatibility wrapper resolves a different TS6 API

- **GIVEN** `@typescript/typescript6` reexports a TS6 dependency selected through
  its package dependency
- **WHEN** the frozen graph is validated
- **THEN** the actual `ts.version` SHALL match the expected locked identity
- **AND** drift SHALL require a reviewed dependency update and conformance run

### Requirement: Install-script prohibition remains intact

**Requirement ID:** `REQ-SC-002`

**Canonical authority references:** `AUTH-INSTALL-POLICY`

`onlyBuiltDependencies: []` SHALL remain the repository install policy. The
migration SHALL NOT add a lifecycle-script exception merely because a selected
package fails to install.

Before any exception is considered, implementation SHALL identify the package,
script, reason, trust consequence, and whether published platform packages avoid
scripts. An exception requires its own explicit review and is not authorized by
this change.

#### Scenario: Exact audited packages install without scripts

- **GIVEN** the selected exact versions and an empty install tree
- **WHEN** frozen installation runs with `onlyBuiltDependencies: []`
- **THEN** installation SHALL succeed without executing or approving lifecycle
  scripts

#### Scenario: A future engine introduces an install script

- **GIVEN** an upgrade or replacement declares or requires a lifecycle script
- **WHEN** dependency validation runs
- **THEN** adoption SHALL stop
- **AND** no automatic approval, allowlist mutation, or bypass flag SHALL be
  introduced under this change

### Requirement: Required Linux architectures execute the toolchain

**Requirement ID:** `REQ-SC-003`

**Canonical authority references:** `AUTH-PLATFORM-MATRIX`, `AUTH-ENGINE-PINS`,
`AUTH-INSTALL-POLICY`

Before Scope 1 and Scope 2 are complete, native Linux AMD64 and native Linux
ARM64 environments SHALL each prove frozen install and the commands owned by
that scope. Package metadata, tarball architecture, or cross-compilation alone
SHALL NOT count as execution proof.

Scope 1 SHALL prove both lint engines, typed lint, typecheck under TypeScript 6,
the compatibility-backed architecture gate, and tests. Scope 2 SHALL prove
TypeScript 7 typecheck/build, replacement lint, the compatibility-backed
architecture gate, and tests.

#### Scenario: Only AMD64 executes

- **GIVEN** package manifests publish ARM64 artifacts but no ARM64 runner executes
  them
- **WHEN** scope completion is evaluated
- **THEN** platform proof SHALL remain incomplete
- **AND** the scope SHALL not merge as complete

#### Scenario: Native ARM64 hosted runner executes

- **GIVEN** the repository's existing GitHub-hosted trust model and the standard
  `ubuntu-24.04-arm` runner
- **WHEN** the required matrix job runs
- **THEN** the same frozen install and scope commands SHALL execute natively
- **AND** no self-hosted runner or new infrastructure authority SHALL be inferred

#### Scenario: One native optional package is absent

- **GIVEN** the lockfile lacks the selected engine's required platform artifact
  for AMD64 or ARM64
- **WHEN** the platform job installs or executes
- **THEN** it SHALL fail rather than fall back to a downloaded ambient binary or
  skip typed lint

### Requirement: Vulnerability response preserves policy authority

**Requirement ID:** `REQ-SC-004`

**Canonical authority references:** `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
`AUTH-INSTALL-POLICY`, `AUTH-PLATFORM-MATRIX`,
`AUTH-MAINTENANCE-CLASSES`, `AUTH-MAINTENANCE-VERIFIER`

Dependency vulnerability response SHALL classify tooling by exposure:

- runtime production dependency;
- CI/build parser that consumes pull-request-controlled bytes; or
- local-only development utility with no untrusted-input path.

A development dependency in the second class SHALL be treated as security-
relevant. No response SLA is created by this requirement.

#### Scenario: Parser dependency has a security advisory

- **GIVEN** TypeScript, Oxlint, tsgolint, the compatibility parser, or another
  PR-byte parser receives an advisory
- **WHEN** remediation changes or replaces it
- **THEN** positive fixtures, negative fixtures, supported-platform execution,
  frozen install, install-script policy, and authority separation SHALL all pass
- **AND** no canonical policy entry may disappear
- **AND** maintenance classification SHALL prove the protected contract matches
  a trusted predecessor rather than only the candidate's own reduced corpus

#### Scenario: Local-only utility advisory

- **GIVEN** a tooling package has no path to production or untrusted repository
  bytes
- **WHEN** it is assessed
- **THEN** it MAY be classified separately from a CI parser
- **AND** the classification SHALL be evidence-based rather than inferred from
  `devDependency` placement alone

### Requirement: Implementation versions may change without changing policy

**Requirement ID:** `REQ-SC-005`

**Canonical authority references:** `AUTH-ENGINE-PINS`, `AUTH-LINT-POLICY`,
`AUTH-LINT-ENGINE-MAPPINGS`, `AUTH-LINT-CONFORMANCE`,
`AUTH-MAINTENANCE-CLASSES`, `AUTH-MAINTENANCE-VERIFIER`

A reviewed package-version update or engine substitution MAY occur without a new
architecture decision when it preserves the accepted authority model, is
admitted by the predecessor-bound maintenance class, and passes the complete
executable contract.

The initial Scope 2 compiler identity is TypeScript 7.0.2. A later exact version
of the normal `typescript` package MAY replace it as compiler maintenance when
the compiler authority remains the normal package and protected compiler-policy
and conformance inputs match the trusted predecessor. Replacing the compiler
authority with `tsc6`, lint type-check mode, or another authority is not a
package-version update.

A change to semantic policy, authority allocation, trust boundary,
supported-platform set, install-script posture, or compiler authority SHALL
require the appropriate architecture or policy review.

#### Scenario: Patch upgrade preserves the contract

- **GIVEN** a new exact engine version
- **WHEN** the trusted-predecessor maintenance comparison admits only the
  class-specific pin/mapping/projection changes
- **AND** all policy, install, platform, and authority proofs pass unchanged
- **THEN** the update MAY proceed as an implementation/security-maintenance
  change

#### Scenario: Upgrade requires removing a policy

- **GIVEN** a new engine version cannot satisfy a canonical policy entry
- **WHEN** adoption is evaluated
- **THEN** it SHALL be rejected under this contract
- **AND** policy removal SHALL require a separate explicit policy decision

### Requirement: Maintenance substitutions are predecessor-bound

**Requirement ID:** `REQ-SC-006`

**Canonical authority references:** `AUTH-MAINTENANCE-CLASSES`,
`AUTH-MAINTENANCE-VERIFIER`,
`AUTH-LINT-POLICY`, `AUTH-LINT-ENGINE-MAPPINGS`,
`AUTH-LINT-CONFORMANCE`, `AUTH-TS-CONFIGS`, `AUTH-TS-CONFORMANCE`,
`AUTH-TS6-CONSUMERS`, `AUTH-FORMAT-POLICY`, `AUTH-ARCH-LAYERS`,
`AUTH-ARCH-IMPORT-GATE`, `AUTH-INSTALL-POLICY`, `AUTH-PLATFORM-MATRIX`

A tool-only security-maintenance claim SHALL compare the candidate with a
trusted predecessor selected by the trusted maintenance boundary. The
maintenance-class authority SHALL define a closed set of maintenance classes,
the exact implementation authorities each class may change, and the
semantic/config/conformance authorities each class must preserve.

The predecessor's maintenance-class definition SHALL govern the allowed and
protected data projections; the separate trusted execution contract in
`REQ-SC-007` SHALL apply it. The candidate SHALL NOT widen its own admitted
delta, change the class or verifier under the same maintenance claim, or treat
the whole lockfile as freely mutable. Resolved-graph change SHALL be limited to
the selected exact package roots and their deterministically derived transitive
closure; unrelated importer or package movement SHALL fail.

Scope 1 SHALL establish the initial maintenance authority under the complete
dual-engine and platform proof. That genesis landing SHALL NOT classify itself
as a maintenance update. Maintenance classification is available only to a
later candidate whose trusted predecessor already contains the accepted class
and trusted verification contract.

The maintenance classes SHALL be a closed set. A candidate SHALL NOT compose or
union two or more separate classes to widen its admitted delta. A change that
requires more than one implementation authority to move together — for example a
normal-compiler update that requires a matching typed-lint (`oxlint-tsgolint`)
backend pin — SHALL be admitted only through a single closed composite
maintenance class defined for that coupling, or SHALL be routed to full policy
or architecture review. The composite class SHALL still preserve every protected
authority of each contributing class.

Candidate-local schema validity, fixture referential integrity, generated-config
drift, and a green candidate corpus SHALL be necessary but SHALL NOT be
sufficient evidence of continuity.

If predecessor identity cannot be resolved, repository diff cannot be read, the
maintenance policy is malformed, or a protected authority differs, maintenance
classification SHALL fail closed. The change MAY proceed only through the
separately reviewed policy or architecture path appropriate to the differing
authority.

#### Scenario: Lint engine pin and mapping change only

- **GIVEN** a trusted predecessor whose semantic policy and conformance corpus
  are complete
- **WHEN** a candidate changes only the admitted lint-engine pin, resolved graph,
  selected-engine mapping, and generated engine projection
- **AND** the complete policy/install/platform/separation proof passes
- **THEN** the change MAY be classified as lint-engine maintenance
- **AND** semantic policy and fixture bytes SHALL remain predecessor-identical
- **AND** lockfile differences SHALL be confined to the selected engine closure

#### Scenario: Policy row and its only fixture are deleted together

- **GIVEN** a candidate changes an engine pin
- **WHEN** it also deletes policy row R and the only negative fixture assigned to
  R
- **THEN** predecessor comparison SHALL fail before candidate-only conformance
  can authorize the update
- **AND** deleting both sides of the candidate's internal reference SHALL NOT
  make the maintenance claim valid

#### Scenario: Compiler update relaxes compiler policy

- **GIVEN** a candidate changes the exact normal TypeScript pin
- **WHEN** it also relaxes a shared tsconfig option or deletes/weakens its
  compiler conformance fixture
- **THEN** compiler-maintenance classification SHALL fail
- **AND** the change SHALL require the separately reviewed compiler-policy path

#### Scenario: Compatibility parser update preserves its boundary

- **GIVEN** a candidate changes only the exact compatibility package or its
  expected locked API identity
- **WHEN** the admitted consumer allowlist, source-import behavior/corpus, normal
  compiler authority, install posture, and platform set match the trusted
  predecessor
- **THEN** the change MAY be classified as compatibility-parser maintenance
- **AND** the full source-import and native-platform proof SHALL still run

#### Scenario: Trusted predecessor is unavailable or ambiguous

- **GIVEN** a candidate requests maintenance classification
- **WHEN** the comparison base cannot be resolved exactly, the diff cannot be
  read, or identities disagree unexpectedly
- **THEN** maintenance classification SHALL fail closed
- **AND** candidate-local success SHALL NOT be translated into policy continuity

#### Scenario: Candidate widens its own maintenance class

- **GIVEN** the predecessor admits only engine pin, derived lock closure,
  selected mapping, and generated adapter changes
- **WHEN** the candidate edits the maintenance class or checker to permit policy,
  fixture, platform, or unrelated lockfile changes
- **THEN** predecessor comparison SHALL fail
- **AND** the candidate's widened class SHALL have no authority over its own
  admission

#### Scenario: Coupled compiler and typed-lint update uses the closed composite class

- **GIVEN** a trusted predecessor whose closed maintenance classes include a
  `normal-compiler-and-typed-lint` composite class
- **WHEN** a candidate changes the exact normal TypeScript pin together with the
  matching `oxlint-tsgolint` typed-lint pin, their derived lock closures, and
  the required adapters, while every protected semantic/config/corpus/harness
  authority remains predecessor-identical
- **THEN** the change MAY be classified under that single composite class
- **AND** the full compiler, typed-lint, install, platform, and separation
  proofs SHALL still run

#### Scenario: Candidate unions two separate classes to widen authority

- **GIVEN** a predecessor that defines separate lint-engine and normal-compiler
  classes but no composite permitting both plus additional deltas
- **WHEN** a candidate composes those classes to change compiler, typed-lint,
  and a protected authority together
- **THEN** maintenance classification SHALL fail closed
- **AND** the coupled change SHALL be routed to full policy or architecture review

### Requirement: Maintenance evidence executes trusted verifier bytes

**Requirement ID:** `REQ-SC-007`

**Canonical authority references:** `AUTH-MAINTENANCE-VERIFIER`,
`AUTH-MAINTENANCE-CLASSES`, `AUTH-MAINTENANCE-SUBJECT-ISOLATION`

Trusted point-in-time maintenance evidence SHALL be produced across three
explicit trust domains, and no candidate-supplied byte SHALL cross a domain
boundary as executable authority.

1. **Trusted control.** A default-branch `repository_dispatch` workflow
   definition SHALL check out the exact live predecessor and load its verifier
   executable, verifier dependencies, maintenance classes, and command plan
   from that one predecessor commit. It MAY use only a least-privilege
   read-only GitHub metadata credential to resolve identities. It SHALL compute
   a content-addressed **subject plan** naming the exact commands, subject
   binaries, and input digests the subject domain must run.
2. **Untrusted subject.** Candidate tools SHALL execute only in a separate
   fresh hosted runner or an explicitly hardened sandbox governed by
   `REQ-SC-008`. That domain SHALL receive no secret, no usable `GITHUB_TOKEN`,
   no persisted checkout credential, no shared writable cache, and no Docker
   socket, and SHALL have no write access to the predecessor checkout, policy,
   verifier, command plan, or verdict workspace. Its output SHALL be treated as
   untrusted data — a **result envelope** written only inside its isolated
   scratch/output area.
3. **Trusted verdict.** A fresh exact-predecessor execution context SHALL
   verify the predecessor SHA, candidate SHA, subject-plan digest, command
   identities, result-envelope schema, and output-artifact digests, and SHALL
   re-resolve the candidate head and live predecessor before emitting the
   maintenance result. It SHALL treat candidate output only as evidence.

A trusted host-side launcher owned by the trusted domains SHALL own command
selection, timeout and process cleanup, exit-code capture, artifact hashing, and
result-envelope construction outside any candidate-writable path.

The candidate SHALL be supplied to the trusted domains as Git-object data or as
regular non-executable files materialized from those objects. Symlinks,
submodules, path escapes, and other non-regular candidate entries SHALL be
refused rather than materialized. The candidate's workflow, checker, package
scripts, helpers, or altered invocation path SHALL NOT decide whether the
candidate qualifies for maintenance.

A candidate implementation binary MAY execute only as an explicitly selected
subject under test in the untrusted subject domain, launched and interpreted by
the predecessor-owned command plan after structural admission. Its exit status
or emitted bytes SHALL NOT prove that the trusted verifier ran or authorize
skipping any predecessor-owned check.

At the beginning of the run, the boundary SHALL resolve the exact candidate head
and the current exact tip of the default target branch and SHALL require the
workflow execution identity to equal that live predecessor. At the end, it SHALL
re-resolve both identities. If either moved, the proof SHALL fail as stale.

Missing trusted workflow/verifier bytes, failure to resolve either identity,
candidate-controlled execution, unreadable candidate objects, or any start/end
identity disagreement, or any subject-produced envelope whose schema, subject-plan
digest, command identity, or artifact digest does not verify SHALL fail closed.
An ordinary candidate workflow or local checker run MAY provide developer
feedback but SHALL NOT substitute for this authority.

#### Scenario: Candidate replaces its checker with unconditional success

- **GIVEN** the trusted predecessor checker rejects protected policy drift
- **WHEN** the candidate changes an engine pin, deletes one policy row and its
  only fixture, and changes its own checker to exit successfully
- **THEN** the predecessor's verifier SHALL still execute
- **AND** the maintenance claim SHALL be refused for protected drift
- **AND** the candidate checker's exit status SHALL have no authority

#### Scenario: Candidate deletes the checker path

- **GIVEN** the exact live predecessor contains the trusted checker
- **WHEN** the candidate deletes that path
- **THEN** the trusted predecessor checker SHALL still execute from the
  predecessor checkout
- **AND** the candidate deletion SHALL be classified as protected drift or an
  otherwise non-maintenance change

#### Scenario: Candidate workflow skips verification

- **GIVEN** the candidate changes or removes its copy of the maintenance
  workflow
- **WHEN** authoritative maintenance verification is dispatched
- **THEN** the default branch's workflow definition SHALL run
- **AND** the candidate workflow SHALL NOT suppress or replace the trusted
  invocation

#### Scenario: Candidate head moves during verification

- **GIVEN** verification began for exact candidate head H1
- **WHEN** the pull-request head advances to H2 before the final identity check
- **THEN** the run SHALL fail as stale
- **AND** a new run SHALL be required for H2

#### Scenario: Live predecessor moves during verification

- **GIVEN** verification began against exact live predecessor B1
- **WHEN** the default target branch advances to B2 before the final identity
  check
- **THEN** the run SHALL fail as stale
- **AND** a new run SHALL be required against B2

#### Scenario: Trusted verifier is unavailable

- **GIVEN** the default-branch workflow cannot load the verifier or its required
  dependencies from the exact live predecessor
- **WHEN** maintenance admission is attempted
- **THEN** the run SHALL fail closed
- **AND** it MUST NOT fall back to the candidate's checker or package scripts

#### Scenario: Subject tampering cannot influence the verdict

- **GIVEN** a candidate tool runs in the untrusted subject domain
- **WHEN** it attempts any of: overwriting the verifier or predecessor
  workspace; writing `GITHUB_ENV` or `GITHUB_OUTPUT`; forging or replacing
  result-envelope files; reading a token or secret; leaving a background
  process; poisoning a shared cache; escaping its allowed output directory;
  modifying the command plan; or emitting a result that claims a different
  head or base
- **THEN** the isolation contract SHALL prevent the write/read/escape, or the
  trusted verdict SHALL reject the resulting evidence
- **AND** none of these actions SHALL change the emitted maintenance result

#### Scenario: Subject forges a successful result envelope

- **GIVEN** the subject domain emits a result envelope claiming every command
  passed
- **WHEN** the trusted verdict evaluates it
- **THEN** the verdict SHALL recompute and require the predecessor SHA,
  candidate SHA, subject-plan digest, command identities, envelope schema, and
  output-artifact digests to match the trusted-control expectations
- **AND** any mismatch SHALL refuse maintenance rather than trust the
  subject's self-report

### Requirement: Candidate tool execution is isolated

**Requirement ID:** `REQ-SC-008`

**Canonical authority references:** `AUTH-MAINTENANCE-SUBJECT-ISOLATION`,
`AUTH-MAINTENANCE-VERIFIER`

Candidate tools invoked during maintenance verification SHALL execute only in an
isolated untrusted subject domain: a fresh hosted runner or an explicitly
hardened sandbox. That domain SHALL NOT receive any secret, usable
`GITHUB_TOKEN`, or persisted checkout credential, SHALL NOT mount a shared
writable cache, and SHALL NOT expose a Docker socket. It SHALL have no write
access to the predecessor checkout, policy, verifier, command plan, or verdict
workspace, and SHALL be given only an isolated writable scratch/output area.
Candidate output SHALL be treated as untrusted data.

A container-based subject implementation SHALL be acceptable only when its
contract includes read-only mounts of any trusted input, an explicit network
policy, a non-root user, all Linux capabilities dropped, `no-new-privileges`,
process/time/CPU/memory limits, an isolated writable scratch, and no path to the
host Docker socket or any trusted workspace.

#### Scenario: Subject requests a credential or secret

- **GIVEN** a candidate tool in the subject domain attempts to read a token,
  secret, or persisted checkout credential
- **WHEN** the maintenance run executes
- **THEN** no such credential SHALL be present in the subject domain
- **AND** a command that requires one SHALL fail closed rather than acquire it

#### Scenario: Containerized subject omits a required control

- **GIVEN** the subject is implemented as a container
- **WHEN** the isolation contract is evaluated
- **THEN** read-only trusted mounts, explicit network policy, non-root user,
  dropped capabilities, `no-new-privileges`, resource limits, isolated scratch,
  and absence of the host Docker socket and trusted-workspace paths SHALL all be
  present
- **AND** a missing control SHALL refuse the run rather than execute candidate
  tools with weaker isolation

#### Scenario: Subject has no write path to a trusted workspace

- **GIVEN** a candidate tool attempts to write outside its isolated scratch/output
- **WHEN** it targets the predecessor checkout, verifier, command plan, or
  verdict workspace
- **THEN** the write SHALL be denied by the isolation boundary
- **AND** the trusted verdict SHALL remain computed from trusted-domain state only

### Requirement: Maintenance evidence is consumed under owner merge-freshness control

**Requirement ID:** `MAN-TS7-01`

**Canonical authority references:** `AUTH-MAINTENANCE-VERIFIER`,
`AUTH-MAINTENANCE-CLASSES`

A successful maintenance-boundary run SHALL be recorded as point-in-time
evidence, not as a permanent merge authorization. The repository currently has
no ruleset or merge-queue integration that preserves that freshness, so this
contract SHALL NOT claim machine-authoritative merge admission.

Immediately before merging a maintenance candidate, the repository owner SHALL
verify that: the current candidate head equals the run's candidate head; the
current `refs/heads/main` equals the run's predecessor; the successful run ID
names those exact identities; the exact synthetic merge-tree identity matches the
tree intended to merge; and no protected authority changed after the run. Any
head, base, merge-tree, or protected-authority movement SHALL invalidate the
evidence and require a new run.

If the repository later adopts an enforceable no-bypass ruleset or merge-queue
integration, that mechanism MAY replace this manual control; until then the
manual control is the only freshness gate at merge time.

#### Scenario: Evidence is still fresh at merge

- **GIVEN** a successful maintenance run for candidate head H against live
  predecessor B and synthetic merge tree T
- **WHEN** the owner re-confirms H, B, T, the run ID identities, and unchanged
  protected authorities immediately before merge
- **THEN** the point-in-time evidence MAY be consumed for that merge

#### Scenario: The target branch advanced after the run

- **GIVEN** a successful maintenance run whose predecessor was B
- **WHEN** `refs/heads/main` has advanced to B2 before merge
- **THEN** the recorded evidence SHALL be treated as invalid
- **AND** a new maintenance run against B2 SHALL be required before merge

#### Scenario: The candidate head or merge tree moved after the run

- **GIVEN** a successful maintenance run for candidate head H and merge tree T
- **WHEN** the current candidate head is not H or the synthetic merge tree is
  not T at merge time
- **THEN** the recorded evidence SHALL be treated as invalid
- **AND** a new maintenance run SHALL be required

## Failure Semantics

| Condition class | Requirement / scenario | Required observable outcome |
|---|---|---|
| change-attributable | range, missing platform package, install exception, or policy loss | deterministic refusal |
| change-attributable | missing subject-isolation control, forged/mismatched result envelope, or class composition widening authority | deterministic refusal; candidate output is evidence only |
| environmental / operational | native runner unavailable | proof incomplete; retry later, do not claim support |
| ambiguous / undecidable | dependency exposure class, resolved identity, trusted predecessor/verifier unknown, or head/predecessor movement | treat as security-relevant / fail closed pending evidence |
| ambiguous / undecidable (merge time) | candidate head, live base, merge tree, or protected authority moved after a successful run | point-in-time evidence invalid; require a fresh run before merge (MAN-TS7-01) |

## Compatibility

The selected package versions are implementation pins, not architectural
identities. Their replacements must satisfy the same requirements.

## Deferred Behavior

| Behavior | Due landing / task | Reason deferred | Current-scope boundary |
|---|---|---|---|
| retirement of the TS6 compatibility package | future lifecycle change | stable TS7 API equivalence is not available/proven | bounded dependency remains |
