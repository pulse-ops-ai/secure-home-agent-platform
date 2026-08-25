# Change Proposal: runner-platform-adapters

## Why

L5 (#53, image lineage, merged PR #94) landed the runner image inventory:
a provider-neutral base, the Claude reference derived image, and the
gates-toolchain image, all digest-locked under `deploy/images/image-lock.yaml`
with a governed CI build path. The program's runner critical path names
**L7 / #55** next, and the owner's instruction on closing #53 authorizes it:
"lets move to the runner critical path to #55 / L7."

Everything the platform says about adapters today is prose plus a frozen
interface:

- ADR-0013 (accepted, GATE-U6) fixes ten decisions about what an adapter is:
  it translates and reports, never decides or enforces; capability control is
  cross-layer; terminal state is observational; model output is an untrusted
  claim; provider events are normalized at the boundary against a pinned
  provider version; usage is native units; credentials are references;
  cancellation is substrate-effected; the SPI is structurally neutral.
- The SPI itself is **frozen at L4** in
  `services/runner-control/src/ports/values.ts`, deliberately outside L7's
  authorized scope: "L7's authorized scope is `adapters/` and images — not
  this service."
- `agents/adapters/coding/claude-code/` and
  `agents/adapters/coding/copilot-cli/` are README-only ("Status: not
  implemented").
- `tests/framework-conformance/` is README-only ("Status: empty. No adapter
  exists yet."), while ADR-0003's central neutrality claim — the platform's
  properties belong to the substrate, not the runtime — is exactly the claim
  that suite exists to test.
- The L6 spike (`docs/spikes/l6-copilot-cli/`) produced the empirical basis
  for the Copilot adapter's shape against Copilot CLI 1.0.79, and ADR-0013
  cites it.
- `secure-home-runner-claude` exists with `@anthropic-ai/claude-code@2.1.241`
  pinned; there is no Copilot derived image, so the second adapter would have
  no paired image (ADR-0011: one coding agent per derived image).

Evidence motivating this change:

- GitHub issue **#55** — the external authority anchor for L7: the Claude
  reference adapter and the Copilot adapter against accepted ADR-0013, the
  Copilot derived image (depends on the L5 base), the L2 neutrality proofs
  (EX-002, PROP-004) re-run, and the PROP-006 re-proof for transcript
  consumption. Prerequisites all satisfied: L5 merged, GATE-U6/ADR-0013
  accepted, the L6 spike done.
- The owner's explicit instruction closing the #53 review, quoted above.
- `openspec/specs/runner-adoption/spec.md` — the constitution whose INV-002
  (structural neutrality), INV-012 (container-runtime neutrality), and
  INV-015 (trust preserved to the final consumer) L7 inherits, with PROP-004
  and PROP-006 named for re-proof "at L5, L7, L9" by the archived assurance
  traceability.

## Problem

The platform claims framework neutrality and has zero adapters. Concretely:

1. **The SPI is unexercised.** `AdapterInvocationPort` has exactly one
   implementation, the deterministic in-memory fake inside `runner-control`.
   No code anywhere translates a real `CapabilityGrantT` into a real
   provider's tool surface, or a real provider transcript into
   `AdapterObservation`. Every ADR-0013 decision is therefore untested
   against the CLIs it was decided about.
2. **The neutrality claim is unfalsifiable.** "Every adapter emits an
   identical event and evidence contract" cannot be tested with fewer than
   two adapters. The conformance suite is empty because there is nothing to
   conform.
3. **The adapter boundary is undefended.** Nothing today would refuse an
   adapter that decides terminal state, holds a credential value, or leaks a
   provider-native event shape upward — the refusals exist only as ADR prose.
4. **The Copilot runtime has no image.** ADR-0011 pairs each coding adapter
   with exactly one pinned derived image; the Copilot adapter cannot land
   without `secure-home-runner-copilot` in the same governed lineage as the
   Claude image.
5. **A structural constraint makes the obvious implementation wrong.** The
   workspace direction rules forbid ANY package from importing a deployable
   (`nothing may import a service or an app` — enforced in all zones,
   including tests), yet the SPI types live inside the `runner-control`
   deployable, which L7 must not touch. The seam needs an explicit, proven
   design, not an accident.

## Proposed Capability

One new capability, `platform-adapters`, plus a delta to the existing
`runner-image-lineage` capability:

- **platform-adapters** — two workspace packages,
  `@secure-home/adapter-claude-code`
  (`agents/adapters/coding/claude-code/`) and
  `@secure-home/adapter-copilot-cli`
  (`agents/adapters/coding/copilot-cli/`), each a pure translation core plus
  a process entry implementing one shared wire contract; a structural mirror
  of the frozen SPI with a mechanical drift tether; and the
  framework-conformance suite at `tests/framework-conformance/` proving both
  adapters emit the identical contract, offline, against stub CLIs.
- **runner-image-lineage (delta)** — the registered inventory grows from
  three to four: `secure-home-runner-copilot`, a second `runner-derived`
  image carrying exactly `@github/copilot@1.0.79`, digest-bootstrapped
  through the same governed CI path as the Claude image.

## Scope

### In scope

- Workspace admission for the adapter tier: a `agents/adapters/coding/*`
  member glob in `pnpm-workspace.yaml`, the matching `MEMBER_GLOBS` entry and
  two explicit `LAYERS` placements (layer 3) in `scripts/workspace-model.mjs`.
- `@secure-home/adapter-claude-code`: SPI wire mirror, invocation → launch
  plan translation for the pinned `@anthropic-ai/claude-code@2.1.241` CLI,
  transcript → observation mapping, process entry, unit tests including a
  hostile-transcript corpus.
- `@secure-home/adapter-copilot-cli`: the same architecture for the pinned
  `@github/copilot@1.0.79` CLI, with every mapping decision traced to the L6
  spike findings.
- `tests/framework-conformance/`: the shared pytest suite — SPI tether,
  identical-contract proof, effective cancellation, cannot-widen,
  failure-through-contract, unlaunchability — driving both adapter process
  entries against offline stub CLIs.
- `deploy/images/runner-copilot/Dockerfile`, its `image-lock.yaml` entry
  (bootstrap sentinel, then recorded CI digests), and the L5 checker
  admitting it (the checker's rules are class-based; the copilot entry must
  pass them unmodified except where the closed inventory count is asserted).
- CI wiring: one build step for the adapter packages in the `classifier` job
  of `.github/workflows/checks.yml`, so the governance pytest suite (which
  already runs with the full TypeScript toolchain) can execute the
  conformance tests unconditionally.
- Documentation reconciliation: the two adapter READMEs, the adapters tier
  README, `tests/framework-conformance/README.md`, `deploy/images/README.md`,
  the architecture status boxes, and the root README status row.

### Out of scope

- **Any change under `services/runner-control/`** — the SPI stays frozen
  exactly as L4 wrote it; the deterministic port remains the only
  implementation wired into the service.
- **Launching an adapter from the platform** (L9 / #57, behind U4/#9): no
  launcher, no runtime selection, no `deploy/runtime/` content, no profile
  activation, no container execution of any produced image.
- **Credentials**: no credential value, store, or acquisition path anywhere;
  the SPI's reference-only shape is preserved and proven.
- **Provider SDKs**: neither adapter takes any external runtime dependency;
  the provider surface is the pinned CLI, driven as a subprocess.
- **The codex adapter** (`agents/adapters/coding/codex/` stays README-only)
  and every `agents/adapters/frameworks/` entry.
- **Knowledge wiring** (ADR-0010): no knowledge content or query surface
  reaches an adapter or an image.
- **Contract changes**: `packages/contracts` schemas are untouched — adding
  two adapters with zero schema diff is itself the EX-002/PROP-004 re-proof.

## Affected Areas

| Area | Change |
|---|---|
| `agents/adapters/coding/claude-code/` | README → full workspace package |
| `agents/adapters/coding/copilot-cli/` | README → full workspace package |
| `tests/framework-conformance/` | README → pytest suite + stubs + goldens |
| `deploy/images/runner-copilot/` | new derived image definition |
| `deploy/images/image-lock.yaml` | fourth entry (sentinel → CI digests) |
| `scripts/check-images.mjs` | only where an inventory count is asserted |
| `pnpm-workspace.yaml`, `scripts/workspace-model.mjs` | adapter tier admission |
| `.github/workflows/checks.yml` | classifier job: build adapters before pytest |
| `pnpm-lock.yaml` | two new members (workspace-internal edges only) |
| READMEs, status boxes | reconciliation sweep |

## Governance

- **ADR-0013** (accepted) — every adapter behavior traces to one of its ten
  decisions; the design document carries the trace table.
- **ADR-0003** — framework-neutral profiles; the substrate launches adapters
  as isolated processes; the conformance suite is this ADR's test.
- **ADR-0006** — agent implementation / profile / run / automation stay
  separate; adapters are implementations, not identities.
- **ADR-0011** — one coding agent per derived image; the Copilot image pairs
  the Copilot adapter.
- **ADR-0012** — TypeScript workspace rules: catalog pins, explicit layer
  placement, direction inward only.
- **ADR-0010** — no knowledge into adapters or images.
- Constitution invariants INV-002, INV-012, INV-015; PROP-004 and PROP-006
  re-proof at L7 (named by the archived runner-adoption assurance).
- `agents/AGENTS.md` — no credentials, no new dependencies without a task
  contract, adapter must not reach around the substrate, identical contract
  out.
- `deploy/AGENTS.md` — deployment assets are authored, never run locally;
  image digests come only from the governed CI path.
- `openspec/AGENTS.md` — this change is planning + recorded authority; the
  implementation authority is issue #55 and the owner's instruction,
  recorded in `tasks.md`.

## Trust / Security / Data Considerations

- **Untrusted input, by construction.** Everything an adapter reads from a
  provider CLI — stdout, event files, exit metadata — is untrusted bytes.
  The adapters parse defensively: malformed input degrades to recorded
  observations or an `environmental_fault` report, never a crash and never
  an escalation. This is the PROP-006 re-proof surface at L7.
- **No credential can exist here.** The SPI carries env-var *names* only;
  the wire mirror preserves that shape; the conformance suite asserts no
  credential-shaped value appears in any launch plan, report, or fixture;
  the repository secret scan covers every authored file.
- **Capability narrowing is defense in depth, not the boundary.** Adapters
  translate the grant into the provider's visible tool surface
  (`--allowedTools`/`--disallowedTools`, `--available-tools`/`--deny-tool`)
  exactly as ADR-0013 decision 2 frames it; enforcement stays with the
  substrate at L9. Nothing in this landing relies on provider-side controls
  for a security property.
- **Terminal truth is not the provider's.** The L6 spike's exit-124 versus
  `exitCode: 0` disagreement is carried as two observations, not resolved by
  the adapter (decision 3).
- **Supply chain**: the Copilot image pins the exact npm identities
  (`@github/copilot@1.0.79`, its per-platform executable package, and its
  one helper dependency `detect-libc@2.1.2`) with sha512 verification before
  installation, mirroring the Claude image's posture; the image digest chain
  extends the recorded base digest; nothing floats.
- **Inertness**: no platform code path invokes an adapter; the packages have
  zero runtime dependencies; importing them has no side effects; the
  conformance suite proves no member outside `agents/adapters/` references
  them.

## Existing Evidence

- Frozen SPI: `services/runner-control/src/ports/values.ts` ("THE ADAPTER
  SPI, frozen to ADR-0013"), re-exported via `src/adapter/index.ts`.
- L6 spike: `docs/spikes/l6-copilot-cli/L6-Copilot-CLI-Spike-Findings.md` —
  verdicts for structured output, tool allowlisting, transcript surfaces,
  usage units, credential isolation, against Copilot CLI 1.0.79 pinned to
  `gpt-5.4`.
- L5 conventions: `deploy/images/runner-claude/Dockerfile` (declaration +
  consumption of `RUNTIME_PACKAGE`/`RUNTIME_VERSION`, offline verified npm
  install, wiring assertion), `image-lock.yaml` grammar, the digest
  bootstrap protocol in `.github/workflows/images.yml`.
- Neutrality corpus proof: `packages/contracts/src/conformance/` (C-EX-002 /
  C-ADV-005 / C-PROP-002 / C-PROP-004), which must pass unchanged at this
  change's completion head.
