# Conformance fixtures — deliberately invalid

Every file under `invalid/` exists to make a policy fire. Several are syntax
errors on purpose. They are **evidence**, not source, and four separate
authorities exclude them for four separate reasons:

| Authority                       | Why it excludes them                        |
| ------------------------------- | ------------------------------------------- |
| lint discovery (`base.js`)      | linting them fails the build on the very violations they prove |
| Prettier (`.prettierignore`)    | formatting repairs the violation and destroys the evidence |
| the package `tsconfig.json`     | type-checking them fails on deliberate type errors |
| `check-source-imports.mjs`      | a syntax error has no parseable imports to govern |

Those four strings are a mechanically checked projection
(`checkFixtureProjection` in `src/check-policy.mjs`, task 1.11): each reader's
exclusion is verified as written, the parity harness is verified to still point
HERE, and the test mutates each projection alone so a lost exclusion — or the
harness quietly losing the corpus — names the reader that changed. The class
includes `_negative-controls/` and `roles/`.

## `roles/`

The rule shards prove each policy under one role. `roles/` holds sources that
are linted under EVERY role on both engines against a matrix of which role must
reject them — the behavioural proof that a policy reaches the right files and
not the wrong ones. See `roles/README.md`.

## `tsconfig.json` in this directory

The **typed lint harness** needs real type information: `await-thenable` cannot
be decided without knowing whether a value is a promise. So the corpus has its
own type environment, loaded explicitly by the harness.

This is deliberately NOT the same thing as putting fixtures back into ordinary
`pnpm typecheck`. The normal compiler still excludes them. One environment
exists so typed lint can run; the other continues to keep deliberately-invalid
evidence out of the repository's build.

If the typed backend cannot initialize, the harness FAILS. It never falls back
to static lint, because a static run that reports nothing is indistinguishable
from a typed run that found nothing.
