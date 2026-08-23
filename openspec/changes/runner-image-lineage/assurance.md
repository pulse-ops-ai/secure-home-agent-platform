# Assurance Plan: runner-image-lineage

## Purpose

How the L5 specification and design are proven before this change is
complete. It creates no new product requirements.

## Risk classification

**Risk: `high`.**

- Runner machinery: this authors the untrusted workload substrate's
  definitions and the digest chain every later landing consumes.
- Supply chain: the pins recorded here become the provenance story for
  every future run's `image_digest`.
- Not `trust-critical` *as a change*: the images are inert — no authority
  is granted or flipped, nothing executes, no credential exists, no
  contract changes. The trust-critical consumers (profile activation, L9
  launch) arrive under their own authority and re-verify (PROP-006).
- The trust-critical standing posture is adopted voluntarily where it
  fits: the digest chain is documented as an authority-chain table below.

## Invariants

| ID | Invariant | Class |
|---|---|---|
| IL-INV-01 | The image inventory is closed and bidirectionally registered: every definition locked, every lock entry backed by a definition, exactly the three L5 images | review/governance |
| IL-INV-02 | The base definition contains no provider/framework/runtime token in any position, and the token vocabulary is shared data with the platform neutrality proof | trust (inherits INV-002) |
| IL-INV-03 | No image contains decision-bearing platform code or authority: no COPY/ADD from `services/**` or `packages/**`; bootstrap and conventions only | trust |
| IL-INV-04 | The derived image adds exactly one runtime at one exact version equal to the lock's record, and no second provider token | trust (ADR-0011) |
| IL-INV-05 | The gates image is an independent lineage with no provider runtime and no derivation from runner-base | trust (D7) |
| IL-INV-06 | Every external OCI reference is pinned by immutable sha256 digest | trust / supply chain |
| IL-INV-07 | Every locked identity distinguishes index digest from per-platform manifest digests; no other digest kind is recorded | data |
| IL-INV-08 | The derived entry's `parent_digest` equals the base entry's `digest` exactly | trust (inherits INV-015) |
| IL-INV-09 | Digests are produced only by the governed CI build path; the bootstrap sentinel always fails governed verification; a recorded digest is re-proved by rebuild at head | trust (inherits INV-015 / PROP-006) |
| IL-INV-10 | The images are inert: no `profiles/**` reference, no launcher/socket token in runner-control, `deploy/runtime/` README-only, no knowledge content in any image | review/governance |
| IL-INV-11 | No platform contract changes; the landed structural-neutrality corpus proof holds at the completion head | compatibility (INV-002 / INV-012) |
| IL-INV-12 | No secret or credential-shaped material in any authored file; no credential-shaped ENV/ARG name in any Dockerfile | trust |

## Authority chain (digest provenance)

| Object | Authority source | Captured when | Agent-mutable after capture? | Transformation | Final verifier / consumer |
|---|---|---|---|---|---|
| external base identity | Docker Hub manifest index (`debian:trixie-slim`) | resolved 2026-08-23, inlined in Dockerfiles + lock | no — inline `@sha256` refuses drift | none (pull by digest) | buildkit digest check at build |
| apt packages | exact archive versions (trixie), resolved 2026-08-23 | pinned as Dockerfile ARGs | no — a vanished pin fails install; transitive drift fails the rebuild comparison | apt install `pkg=version` from the signed live archive | apt signature check at build; governed rebuild-and-compare at head |
| Node / uv archives | published SHASUMS / release checksums | SHA-256 inlined in Dockerfiles | no | extract | `sha256sum -c` at build |
| provider CLI | registry.npmjs.org exact version + `dist.integrity` | recorded in lock + Dockerfile | no | tarball verified then installed | integrity check at build; refusal if deps resolve |
| image identities | governed CI build (OCI export digests) | recorded in lock from CI evidence | any edit is refused by rebuild comparison | none | `images.yml` verify at exact head; future profile/L9 consumption (deferred, named) |

## State-space model

Dimensions that materially affect behavior:

| Dimension | Values |
|---|---|
| lock digest state | recorded / bootstrap sentinel / malformed |
| chain state | consistent / base-moved-unpropagated / derived-claims-foreign-parent |
| definition registration | registered / unregistered definition / entry-without-definition |
| external reference | digest-pinned / tag-only / logical-base-name |
| runtime count in derived | one / zero / two |
| neutrality state | clean / provider token in base / provider token in gates / runtime token in image name |
| inertness | inert / profile reference / runtime dir content / launcher token |
| build verification | match / mismatch / bootstrap / build failure (operational) |

Interactions requiring proof (not a Cartesian sweep):

- **bootstrap sentinel × governed verification** — must fail loudly with
  evidence, never pass, never read as complete (IL-INV-09).
- **base digest moved × derived unpropagated** — must refuse statically
  before any build runs (IL-INV-08).
- **logical base name × external-pin rule** — the derived `FROM` must be
  admitted as the one non-external reference and only when it equals the
  lock's `parent` (IL-INV-06 × IL-INV-08).
- **future image added × checker vocabulary** — a conforming fourth entry
  validates with no structural change (IL-INV-11, extension scenario).
- **operational build failure × digest claims** — a failed CI build
  records nothing and reclassifies nothing as success.

## Decision tables

Lock verification outcome:

| Observable state | Proof available | Required outcome | Classification |
|---|---|---|---|
| all digests recorded, rebuild matches | CI verify at head | pass | — |
| any digest ≠ rebuilt digest | CI verify at head | fail, both digests named | change-attributable |
| any sentinel present | CI verify at head | fail, built digests reported for recording | change-attributable (bootstrap) |
| sentinel present | static checker only | structurally valid, loudly reported; completion gate blocked | — |
| chain inequality, malformed grammar, unregistered definition, tag-only FROM, second runtime, provider token, profile reference, runtime-dir content, launcher token, credential-shaped name | static checker | fail, position named | change-attributable |
| archive/mirror unreachable during build | CI build log | build fails; no digest recorded | operational |

An undecidable state never maps to success.

## Cross-requirement interactions

- IL-INV-04 × IL-INV-02: the derived image's own runtime tokens are
  permitted exactly there and nowhere else — the neutrality scan must not
  be weakened globally to admit them (per-image allow set, data-driven).
- IL-INV-08 × IL-INV-09: static chain equality and CI rebuild equality are
  different defenses; removing either must still leave the other refusing
  (mutation targets both).
- IL-INV-10 × IL-INV-01: registration must not itself activate anything —
  the lock records identity, grants nothing, and the profile-reference
  scan proves the absence of consumers.
- IL-INV-11 × IL-INV-04: provider identity in lock/labels is values-only;
  the key-name scan proves the lock never grows a provider-named key.

## Proof obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| IL-EX-01 | IL-INV-01 | deterministic (real checker on real tree) | checker passes on the authored inventory; `check.sh` row |
| IL-EX-02 | IL-INV-09 | governed CI evidence | `images.yml` verify at the exact PR head: rebuilt digests equal the lock |
| IL-EX-03 | IL-INV-11 | schema/contract validation | existing adapter-neutrality conformance suite green at head with zero `schemas/**` diff |
| IL-PROP-01 | IL-INV-07 / lock grammar | property-shaped fixtures | canonical grammar refuses flow/anchors/tabs/duplicate keys/reordered keys; accepts the canonical form |
| IL-PROP-02 | IL-INV-11 extension | fixture extension | a conforming fourth image entry validates with no checker vocabulary change |
| IL-ADV-01 | IL-INV-02 | hostile fixture | provider token planted in base Dockerfile → refused, token named |
| IL-ADV-02 | IL-INV-04 | hostile fixture | second provider runtime planted in derived → refused |
| IL-ADV-03 | IL-INV-04 | hostile fixture | Dockerfile runtime version ≠ lock version → refused |
| IL-ADV-04 | IL-INV-05 | hostile fixture | provider CLI planted in gates image → refused |
| IL-ADV-05 | IL-INV-06 | hostile fixture | tag-only external FROM → refused |
| IL-ADV-06 | IL-INV-08 | hostile fixture | base digest moved, derived unpropagated → refused naming both |
| IL-ADV-07 | IL-INV-01 | hostile fixture | unregistered `runner-codex/Dockerfile` → refused; lock entry with missing definition → refused |
| IL-ADV-08 | IL-INV-10 | hostile fixture | profile file naming an image → refused; non-README file under `deploy/runtime/` → refused; socket token in runner-control fixture → refused |
| IL-ADV-09 | IL-INV-03 | hostile fixture | `COPY services/runner-control …` planted → refused |
| IL-ADV-10 | IL-INV-12 | hostile fixture | `ENV ANTHROPIC_API_KEY=…`-shaped name planted → refused |
| IL-ADV-11 | IL-INV-09 | governed CI evidence (bootstrap run) | first CI run with sentinels fails and reports built digests |
| IL-ADV-12 | IL-INV-03 | hostile fixture corpus (review round) | nine equivalent COPY/ADD spellings of a platform-code copy (`./`, `././`, flags, JSON exec form) all refused; remote-URL ADD, `..` escape, absolute path, unpinned `--from`, and a backslash-continuation hiding a source likewise refused |
| IL-ADV-13 | IL-INV-04 | hostile fixture (review round) | a lock `runtime.package` carrying a second provider's tokens (`@example/agent-codex-copilot`) refused as resolving to more than one provider; value grammars on name/package/version/integrity refused per field |
| IL-MUT-01…07 | checker guards | hand-applied mutation | see Mutation targets |

## Property tests

Grammar canonicality (IL-PROP-01): for the admitted subset, parse → the
one canonical reading; for each refused construct class, refusal with the
line named. Extension property (IL-PROP-02): adding a conforming entry is
closed under the existing vocabulary. Exercised as parametrized fixture
suites in `tests/test_image_lineage.py` against the real checker — not a
generative fuzzer, and not claimed as one.

## Hostile corpus

IL-ADV-01 … IL-ADV-11 above, each exercised through the actual
`check-images.mjs` (or, for IL-ADV-11, the actual CI verify), never
through a reimplementation. Each hostile fixture is paired with the
passing control so the refusal is attributable to the planted violation.

## Mutation targets

Hand-applied to the checker, verified killed by the named test, restored:

| ID | Guard weakened | Killing test |
|---|---|---|
| IL-MUT-01 | parent/base chain equality | IL-ADV-06 fixture |
| IL-MUT-02 | exactly-one-runtime rule | IL-ADV-02 fixture |
| IL-MUT-03 | unregistered-definition sweep | IL-ADV-07 fixture |
| IL-MUT-04 | external-FROM digest pin | IL-ADV-05 fixture |
| IL-MUT-05 | base neutrality token scan | IL-ADV-01 fixture |
| IL-MUT-06 | COPY source normalization (`./` stripping) | IL-ADV-12 `./services` spelling |
| IL-MUT-07 | runtime provider-family exclusivity | IL-ADV-13 smuggling fixture (fails for the named reason, not a downstream one) |

The CI rebuild-and-compare guard cannot be mutated locally without running
Docker; its refusal behavior is proven by the bootstrap run itself
(IL-ADV-11), which is a real mismatch exercised end-to-end.

## Traceability plan

| Requirement (spec delta) | Invariants | Proof | Task group |
|---|---|---|---|
| inventory is exactly three | IL-INV-01 | IL-EX-01, IL-ADV-07, IL-MUT-03 | 2, 4 |
| base neutrality | IL-INV-02 | IL-ADV-01, IL-MUT-05 | 1, 4 |
| no decision-bearing authority | IL-INV-03 | IL-ADV-09 | 1, 4 |
| one pinned runtime | IL-INV-04 | IL-ADV-02/03, IL-MUT-02 | 1, 4 |
| gates independence | IL-INV-05 | IL-ADV-04 | 1, 4 |
| immutable identity, digest kinds | IL-INV-06/07 | IL-ADV-05, IL-PROP-01, IL-MUT-04 | 2, 4 |
| lock chain cannot drift | IL-INV-08 | IL-ADV-06, IL-MUT-01 | 2, 4 |
| governed build path only | IL-INV-09 | IL-EX-02, IL-ADV-11 | 3, 5 |
| inert | IL-INV-10 | IL-ADV-08 | 4 |
| contracts neutral through landing | IL-INV-11 | IL-EX-03, IL-PROP-02 | 4, 5 |
| (cross-cutting) no secrets | IL-INV-12 | IL-ADV-10 + repository secret scan | 1, 4 |

Deferred re-proofs, named: consumption-side PROP-006 at profile
activation and the L9 launch boundary; container-content verification of
one-runtime at L9; PROP-004/EX-002 re-run at L7/L8 when adapters exist.

## Landing plan

One PR (one landing, inert throughout), with an explicit in-PR digest
bootstrap sequence:

1. authoring seam — definitions, lock (sentinels), checker, tests, docs,
   workflow; every static gate green;
2. first governed build — CI fails the verify loudly, emitting the built
   digests as evidence;
3. recording seam — the digests land in the lock from CI evidence only;
4. re-verification — CI at the exact final head rebuilds and matches, and
   that run is the completion evidence.

No component is split across PRs; the verification net lands with the
checker it proves. Authority posture: inert — nothing activates.

## Review plan

- Deterministic gates continuously: scaffold, secret scan, workspace and
  import direction, full TS/python suites, strict OpenSpec validation.
- Evidence review at the seam: the CI build/verify runs at the exact head,
  the lock's recorded identities, and the pin-resolution provenance.
- **Review round (performed):** the owner-side falsification review of
  `7445070` confirmed the digest provenance and returned three P2 findings —
  eight bypass spellings of the decision-bearing COPY rule, lock free text
  laundering a second provider's tokens into the owned set, and two standing
  governance documents contradicting the landed artifacts. All three are
  fixed with the review's own counter-fixtures turned into IL-ADV-12/13 and
  killed mutants IL-MUT-06/07.
- A fresh falsification-oriented pass against the frozen final head
  focused on: base neutrality, authority leakage into images, false
  reproducibility claims, index/manifest ambiguity, chain breakage,
  co-resident runtimes, gates contamination, lock drift, accidental
  activation, deployment-rule bypass, premature runtime selection, stale
  status prose.
- Owner review of the draft PR is the human gate; nothing merges from this
  change without it.

## Rollout and rollback

`not_applicable` — inert artifacts; the constitution's posture for L5 is
"rollback is non-reference". No activation semantics exist to roll back;
removing the lock entries and definitions would fully revert.

## Assurance completeness

- Unresolved state-model questions: none for this landing.
- Requirements lacking proof: none — every invariant has a named
  obligation above.
- Scenarios intentionally deferred, with owners: consumption verification
  (profile activation; L9 launch), container-content scans (L9),
  neutrality re-runs with adapters present (L7/L8), rebuild cadence
  (operational, post-U4).
- Design assumptions requiring human confirmation: the owner accepts CI
  (`images.yml`) as the governed build mechanism by reviewing/merging this
  change; if that is declined, the recorded fallback is the #53 stop —
  sentinel lock, no digest claims.
