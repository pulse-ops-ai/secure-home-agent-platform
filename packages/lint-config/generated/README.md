# `generated/` — do not edit

Replacement-engine configuration, generated from two authorities and nothing
else:

```text
../policy.json            what the repository enforces
../engine-mappings.json   which engine rule realises it
        ↓
src/generate-oxlint-config.mjs
        ↓
oxlintrc.<role>.json      one per role
```

Editing a file here would create a **second semantic policy** that drifts from
the first, which is precisely what
[ADR-0022](../../../docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md)
separates policy from engine to prevent. The package's test suite regenerates
and compares, so an edit here fails rather than persists.

## What these files deliberately contain

- **`categories: {}`** — every ambient engine default is off. An engine default
  is not repository policy: if a rule is not in `policy.json` nobody decided it,
  and a lint failure nobody decided is indistinguishable from a bug in the gate.
- **Severity from the policy**, never from the engine. A rule the repository
  blocks on blocks, whatever the engine would have chosen.
- **No formatting rule.** Prettier is the single formatting authority.

## Why one file per role

Applicability is policy, and the roles differ by up to 29 rules. A single config
would have to pick one role and be wrong for the other six.

Two policies — `no-dupe-args` and `no-octal` — appear in no config at all. The
replacement engine enforces them at parse level, before any rule runs, so there
is nothing to enable. Their mappings record `mechanism: "parser"`.
