# Assurance: runner-platform-adapters

## Posture

Everything an adapter consumes is untrusted, and everything an adapter
could get wrong is either refused by an existing repository gate, proven
by a committed test, or named here as deferred with an owner. Two proof
planes:

- **Static/governance**: workspace admission, direction, framework guard,
  secret scan, image lineage checker, zero-diff assertions.
- **Behavioral**: package unit tests (vitest) for the pure cores, and the
  shared framework-conformance suite (pytest) driving the built process
  entries against stub CLIs.

The trust-critical consumers (profile activation, L9 launch) arrive under
their own authority and re-verify (PROP-006); this landing's own PROP-006
surface is the transcript parser, proven by the hostile corpus.

## Invariants

| ID | Invariant | Class |
|---|---|---|
| PA-INV-01 | Exactly two adapter packages exist, explicitly placed at layer 3, with zero runtime dependencies and the four standard scripts | review/governance |
| PA-INV-02 | No adapter source, in any zone, imports a deployable; the only internal type source is `@secure-home/contracts`, type-only, declared devDependency | mechanical (source-import + workspace checks) |
| PA-INV-03 | Each adapter's SPI mirror field-agrees with the frozen SPI source, derived at test run time; underivable frozen source is a refusal | behavioral (tether) |
| PA-INV-04 | The wire contract is identical across adapters: one stdin JSON in, one stdout report out, stderr diagnostics, exit 0 iff a report was emitted, SIGTERM cancellation observed in the report | behavioral |
| PA-INV-05 | The report vocabulary is closed (`observed`/`environmental_fault`/`stale_fence`); no shape exists through which an adapter asserts success | behavioral + review |
| PA-INV-06 | The grant narrows the provider tool surface; no launch plan names a tool outside the grant; substrate remains the enforcement boundary in every document | behavioral |
| PA-INV-07 | No credential value slot exists on the wire, in a plan, in a report, or in any fixture; the secret scan passes with no adapter-scoped allowlist entry | mechanical + behavioral |
| PA-INV-08 | Transcript consumption is total: the hostile corpus produces well-formed reports, never uncaught exceptions, never adapter-stdout forgery; capture respects the output budget | behavioral (PROP-006) |
| PA-INV-09 | Terminal observations carry disagreement unreconciled (the L6 124/0 case reproduces through the Copilot adapter) | behavioral |
| PA-INV-10 | Usage is native units only; no monetary field anywhere | behavioral + review |
| PA-INV-11 | The same golden logical run through both adapters yields the identical contract (grammar, observation field inventory, dispositions, adapter-owned event vocabulary) | behavioral |
| PA-INV-12 | Adapters are unlaunchable: no member outside `agents/adapters/` declares or imports them; `services/runner-control/` diff against base is empty; importing an adapter has no side effects | mechanical + behavioral |
| PA-INV-13 | Zero platform contract change: `packages/contracts/schemas/` diff against base is empty and the L2 conformance suite passes at head (EX-002 / PROP-002 / PROP-004 re-run) | mechanical |
| PA-INV-14 | The image inventory is exactly four, bidirectionally registered; the Copilot entry's `parent_digest` equals the base digest byte-for-byte; its runtime is `@github/copilot@1.0.79` with recorded integrity; all L5 checker rules hold unmodified in force | mechanical (check-images) |
| PA-INV-15 | Copilot image digests exist only from governed CI evidence; the sentinel always fails governed verification; base/claude/gates digests do not move in this landing | trust (inherits INV-015) |
| PA-INV-16 | Adapter target versions equal their paired image lock pins (claude-code 2.1.241, copilot 1.0.79) | behavioral |

## Authority chain (Copilot digest provenance)

| Object | Authority source | Captured when | Agent-mutable after capture? | Transformation | Final verifier / consumer |
|---|---|---|---|---|---|
| `@github/copilot` npm identities (main, per-platform, detect-libc) | registry.npmjs.org metadata, resolved 2026-08-23 | authored into Dockerfile ARGs + lock | no — sha512 verified before install; a moved registry artifact fails the build | tarball → verified bytes → offline install | governed CI build |
| Copilot image index + per-platform digests | `images.yml` governed build output (RECORD THESE) | recorded into the lock from CI evidence | no — verify.sh compares every later build to the lock | none (recorded verbatim) | `verify.sh` at every PR touching image inputs |
| Base parent digest | already-recorded L5 base entry | copied byte-for-byte into `parent_digest` | no — checker compares to the base entry | none | `check-images.mjs` |
| Frozen SPI field inventory | `services/runner-control/src/ports/values.ts` at head | derived at every conformance run | no — derivation refuses if absent/unparseable | source-text field extraction | conformance tether |
| L6 mapping basis | `docs/spikes/l6-copilot-cli/` findings (committed) | cited per mapping row in the Copilot README | no — the findings are landed evidence | none | review + the traced README table |

## Adversarial probes

Executed and recorded in `tasks.md` during implementation; each names the
mechanism that kills it.

| ID | Probe | Expected kill |
|---|---|---|
| PA-ADV-01 | Adapter test file imports `@secure-home/runner-control` "just for types" | `check-source-imports.mjs` fails: deployable import, zone-independent |
| PA-ADV-02 | Adapter declares `zod` (or any external) as a runtime dependency | conformance zero-runtime-deps assertion fails; syncpack/catalog policy governs the spelling |
| PA-ADV-03 | Adapter declares `@nestjs/common` as a devDependency | framework guard at layer ≤ 3 fails the workspace check |
| PA-ADV-04 | Mirror silently drops `TerminalObservations.signalled` | tether fails naming the field |
| PA-ADV-05 | Frozen SPI file moved/renamed in a hostile fixture tree | tether refuses (derivation failure), does not pass |
| PA-ADV-06 | Invocation smuggles `image`, `argv`, or `mount` keys | closed wire parser refuses unknown keys → `environmental_fault` |
| PA-ADV-07 | Grant omits a tool; stub provider calls it anyway | report shows `disposition: 'denied'`; plan argv never named it |
| PA-ADV-08 | Stub provider output embeds a syntactically valid `AdapterReport` | emitted report is the adapter's own; embedded document appears only as claim/event data |
| PA-ADV-09 | Stub emits malformed JSONL, prose-prefixed JSON, truncated document, oversized line | every case: well-formed report, malformed-transcript observation, no crash |
| PA-ADV-10 | Stub ignores SIGTERM briefly / reproduces exit 124 with `exitCode: 0` | report emitted with `signalled` recorded; both terminal facts carried unreconciled |
| PA-ADV-11 | Credential-shaped value planted in a fixture | repository secret scan fails (no adapter allowlist entry exists to hide it) |
| PA-ADV-12 | A service manifest gains a dependency on an adapter package | unlaunchability scan fails naming the manifest |
| PA-ADV-13 | Copilot Dockerfile runtime identity laundered to a second family (`@github/copilot-claude`) | check-images family refusal (multi-family runtime identity) |
| PA-ADV-14 | detect-libc replaced by an unpinned range or floating tarball | Dockerfile verifies recorded sha512 before install → build fails; review gate on the ARG set |
| PA-ADV-15 | Fifth image directory added without a lock entry (and the reverse) | check-images bidirectional registration fails |
| PA-ADV-16 | Adapter source hardcodes a model identifier constant | model-identifier scan in the conformance suite fails |
| PA-ADV-17 | A per-adapter copy of a shared conformance assertion | suite-structure assertion (one parameterized suite) fails |

## Mutation targets

Hand-applied mutations that must each be killed by a named proof; results
recorded in `tasks.md`.

| ID | Mutation | Killed by |
|---|---|---|
| PA-MUT-01 | Wire parser accepts unknown keys | PA-ADV-06 test |
| PA-MUT-02 | `observe` rethrows on malformed JSONL | hostile-corpus tests (PA-INV-08) |
| PA-MUT-03 | Plan passes the full tool universe when grant is empty | grant-narrowing tests (PA-INV-06) |
| PA-MUT-04 | Bin prints a diagnostic line to stdout | stdout-purity conformance test (PA-INV-04) |
| PA-MUT-05 | Bin exits nonzero on `environmental_fault` | exit-semantics conformance test |
| PA-MUT-06 | Tether compares against a hardcoded field list instead of deriving | tether-refusal test (PA-ADV-05: derivation failure must refuse) |
| PA-MUT-07 | Copilot observe resolves 124/0 to a single value | disagreement test (PA-INV-09) |
| PA-MUT-08 | Usage mapped to a `usd` unit | native-units test (PA-INV-10) |
| PA-MUT-09 | Lock entry `parent_digest` off by one hex char | check-images chain equality |
| PA-MUT-10 | `RUNTIME_VERSION` consumed nowhere in the Copilot Dockerfile | check-images declaration+consumption rule |
| PA-MUT-11 | Unlaunchability scan scoped to `dependencies` only | scan covers all manifest fields + source imports; mutation test asserts a devDependency reference is caught |
| PA-MUT-12 | SIGTERM handler emits no report | cancellation conformance test |

## Traceability

| Spec requirement (platform-adapters) | Invariants | Probes / proofs |
|---|---|---|
| Admitted workspace packages, no runtime surface | PA-INV-01, PA-INV-02 | PA-ADV-02, PA-ADV-03 |
| Frozen-SPI conformance without importing the deployable | PA-INV-02, PA-INV-03 | PA-ADV-01, PA-ADV-04, PA-ADV-05, PA-MUT-06 |
| One wire contract | PA-INV-04, PA-INV-05 | PA-MUT-04, PA-MUT-05, PA-MUT-12 |
| Translate, never decide | PA-INV-05, PA-INV-06, PA-INV-09, PA-INV-10 | PA-ADV-07, PA-ADV-16, PA-MUT-03, PA-MUT-07, PA-MUT-08 |
| Credentials as references | PA-INV-07 | PA-ADV-11 |
| Defensive transcript consumption | PA-INV-08 | PA-ADV-08, PA-ADV-09, PA-MUT-01, PA-MUT-02 |
| One shared conformance suite | PA-INV-11 | PA-ADV-17 |
| Unlaunchable and inert | PA-INV-12, PA-INV-13 | PA-ADV-12, PA-MUT-11 |
| Pinned provider basis | PA-INV-16 | version-agreement test; README trace table review |
| Copilot image (runner-image-lineage delta) | PA-INV-14, PA-INV-15 | PA-ADV-13, PA-ADV-14, PA-ADV-15, PA-MUT-09, PA-MUT-10 |

## Deferred re-proofs, named

- Consumption-side PROP-006 at profile activation and the L9 launch
  boundary (the launcher re-verifies image digests and profile bytes).
- Fence semantics across the process boundary (`stale_fence` emission by a
  live launcher) — L9.
- Container-content verification of exactly-one-runtime — L9.
- Credential custody (per-run `COPILOT_HOME`, cache teardown, image-layer
  isolation) — L9, informed by SPIKE-05's UNDETERMINED verdicts.
- EX-002 / PROP-004 re-run again at L8/L9 heads when the launcher exists.
