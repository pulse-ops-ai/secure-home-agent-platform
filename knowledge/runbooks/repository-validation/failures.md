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

# Reading a result that is not a plain pass

The aggregate check distinguishes three outcomes, and the third is the one that
gets misread:

| Exit | Meaning |
|---|---|
| `0` | everything that could run, ran and passed |
| `1` | something failed — skips, if any, are still listed |
| `2` | nothing failed, but a check was skipped because a toolchain is missing |

## A skip is not a green repository

Exit `2` exists precisely so an incomplete run cannot be read as a passing one.
It separates *"this repository is sound"* from *"this machine could not check
it"*, and those are different claims.

So when a toolchain is missing: **say so, name the check, and name the reason.**
Do not drop the line. A skipped check that goes unmentioned reads as a passing
one, and the reader has no way to distinguish silence from success — which makes
silence the more damaging of the two.

Installing the missing toolchain is the better answer where that is available.
Reporting the skip honestly is the acceptable one. Omitting it is neither.

## Read the failure you actually got

A failing check names something specific. Address that.

The reason a thing failed is the whole content of the signal: a failure tells
you about the mechanism it names and nothing else. Treating any red result as a
generic "validation failed" throws away the part that was informative, and the
fix that follows is aimed at nothing in particular.

Two habits this rules out:

- **Reporting "validation failed" without the specific failure.** The reader
  cannot act on it, and neither can you.
- **Concluding the check is wrong before reading what it said.** Sometimes it
  is. That is a finding worth raising with evidence, not a reason to route
  around the check.

## When the failure looks unrelated

It may be. A check can fail for a reason that has nothing to do with the rule
you were thinking about — an unrelated error earlier in the same run, or a
missing prerequisite. That does not make the failure noise; it makes it a
different failure, and the specific one it names is still what to address.

The same care applies in the other direction. A check that passes because it
never reached the thing it was supposed to examine has told you nothing, and a
result must be read for what it actually established rather than for what was
hoped from it.

## Finishing

Report the real output, not the expected one. Report every skip with its reason.
If a check failed, show the failure — a report that omits one is worse than no
report, because it invites a decision made on evidence that does not exist.
