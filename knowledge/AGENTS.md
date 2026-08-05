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
3. [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

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
- **Do not invent an OKF schema.** The format is experimental and unvalidated
  ([U7](../docs/architecture/unresolved-decisions.md#u7)).
- **No secrets in examples either.** An example token is still a token-shaped
  string in the repository.

## Do not

- Author a real bundle. **The validator does not exist yet**, so nothing can be
  checked and the prohibited-content rule would be unenforced.
  [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
  is accepted, which makes *building* the validator in scope under a task
  contract — the validator still comes first.
- Choose the knowledge format — that is
  [U7](../docs/architecture/unresolved-decisions.md#u7) and requires an ADR.
- Copy household member names, device identifiers, or network addresses into
  this directory.

## Adding a knowledge domain

1. Create the directory with a `README.md` stating what belongs in it, what does
   not, who owns it, and how freshness is judged for that domain.
2. Add it to [`README.md`](README.md).
3. Do not author content until the validator exists.

## Validation

```sh
bash scripts/validate-scaffold.sh
```

Future: `validate` fails on prohibited content, missing metadata, or schema
violations — as a gate, not a warning.
