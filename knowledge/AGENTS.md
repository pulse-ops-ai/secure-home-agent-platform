# AGENTS.md — `knowledge/`

Scoped rules for knowledge bundles. Inherits everything from
[`../AGENTS.md`](../AGENTS.md).

## The one rule that matters

**A knowledge bundle is portable, non-sensitive, and safe to copy anywhere —
including to a third-party model provider.**

Everything below follows from that. If a fact would be unsafe to send to a cloud
model, it does not belong in a bundle.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md)
3. [`INDEX.md`](INDEX.md) — the registry of modules and sets
4. [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Selection is governed, and it grants nothing

A profile selects a named **set**; the runner resolves it to exact module
versions and records the result in run evidence. A profile never names a
repository file path, and a module being selected never means the run may act on
what it knows — see
[`../docs/architecture/knowledge-selection-model.md`](../docs/architecture/knowledge-selection-model.md).

**Least context is a control, not a preference.** A coding set receives no
household modules, and a household set receives no developer-platform
conventions. When adding a module, decide which sets deny it as deliberately as
which sets require it.

## Never put in a bundle

- secrets, tokens, keys, credentials
- live device state or any current reading
- current presence or occupancy
- authorization tuples or grants
- mutable automation state
- camera media or recordings
- raw personal telemetry

If you are unsure whether something is semantics or state, ask: **would this
value be different in ten minutes?** If yes, it is state.

## Rules

- **Semantics, not state.** Equipment ratings, zone relationships, tariff
  meanings — not readings.
- **Knowledge is not an authority.** It never authorizes and never evaluates
  safety. If knowledge and live state disagree, live state wins.
- **Every bundle declares owner, as-of date, and limitations.**
- **Nothing reads a bundle file directly.** Access is through the `query`
  interface, so the format stays replaceable.
- **Do not invent an OKF schema.** The format is decided by ADR-0015 and the
  repository profile is enforced by `packages/knowledge-toolchain`. Extend it
  there, under an accepted decision — never by writing a new shape here.
- **No secrets in examples either.** An example token is still a token-shaped
  string in the repository.

## Do not

- Author a real bundle. The toolchain now exists and content admission runs in
  CI, but **`blockedByToolchain` is still true**: the integration has not passed
  independent review, and authoring eligibility requires both gates open.
  [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
  is accepted, which makes *building* the validator in scope under a task
  contract — the validator still comes first.
- Choose the knowledge format — that is
  the ADR-0010 toolchain gate and requires an ADR.
- Copy household member names, device identifiers, or network addresses into
  this directory.

## Adding a knowledge module

1. Create `<group>/<name>/README.md` stating intended facts, prohibited facts,
   intended consumers, expected queries, governing sources, and the update
   trigger — plus a registry block naming its status and owner.
2. Register it in [`catalog.json`](catalog.json) with every required field.
3. Add it to [`INDEX.md`](INDEX.md).
4. Add it to the sets that should receive it, **and to the `deny` list of the
   sets that should not.**
5. Do not author content until the validator exists.

An unregistered module directory fails validation. That is deliberate: a module
no profile can select is invisible, and invisible things do not get reviewed.

## Validation

```sh
bash scripts/validate-scaffold.sh
node scripts/check-knowledge.mjs
```

`check-knowledge.mjs` validates the **specification** — registry coherence,
metadata completeness, set references, status claims, and that no specification
directory contains authored content while its toolchain gate is true. **It owns
no content rules.**

Content admission is the separate canonical command
`pnpm run check:knowledge-content`, which hands real bytes to
`packages/knowledge-toolchain`. Prohibited content is enforced there under the
ADR-0016 A/B/C model — class B indicators with named blind spots, class C
classes with no detector by design — plus Proof A. It is not a full machine
check, and the code says so in `COVERAGE` and `BLIND_SPOTS`.

`admit` already fails on prohibited-content indicators, missing or wrongly-typed
metadata, envelope violations, unresolvable references, and an attestation that
does not bind the exact bytes — as a gate, not a warning. What remains is
independent review of the integration and a governed Proof B producer.
