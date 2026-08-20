---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Quotes no expected check count, no sample output, no credential or environment value, and no current repository or CI state. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - CONTRIBUTING.md
  - scripts/README.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-20T01:26:06Z
---

# What to run

**Start with the aggregate check.** It runs everything that can run on this
machine and reports what it could not.

Reach for individual checks in two situations: the aggregate reported a failure
and you want to iterate quickly on one thing, or you are mid-change and want
fast feedback before running the whole set. Neither replaces a final aggregate
run.

## Choosing by what you changed

The aggregate check is always correct. This is about which individual check
gives useful feedback soonest:

| You changed | The check that speaks to it |
|---|---|
| added, moved, or removed any file | structural scaffold validation |
| a workspace manifest, or a dependency version | manifest conformance, then the dependency-policy check |
| TypeScript source | the source-import direction check, then lint, types, tests, build |
| Python under the inference boundary | the Python lint, format, type, and test steps |
| a knowledge module's registry entry | knowledge registry conformance |
| authored knowledge bytes | knowledge content admission |
| anything you are unsure about | the aggregate check |

The last row is not a joke. Guessing which checks a change touches is how a
change ships without the one that mattered.

## Two ordering facts worth knowing

**Install with the lockfile held strict, before anything that reads it.** The
strict flags exist so a stale lockfile *fails* rather than being quietly
updated. A run that repairs a lockfile and then reports success has validated a
repository state that did not exist when it started.

**Structural checks come before toolchain-dependent ones.** They need almost
nothing installed, so they still give an answer on a machine where the rest
cannot run.

## Finishing

Report the commands you actually ran and their real results, **including
anything skipped and why**. A skipped check that goes unmentioned reads as a
passing one, and the reader cannot tell silence from success.
