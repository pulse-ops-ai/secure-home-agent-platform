---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Contains nothing about specific people or review history. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - CONTRIBUTING.md
  - .github/pull_request_template.md
  - docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md
  - profiles/README.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T18:53:35Z
---

# When a proof actually proves something

This applies whenever a change **claims to have proved** a property. It is not a
demand to prove everything; it is that evidence must support whatever claim was
made.

```text
claim
  -> mechanism
  -> contract-valid fixture
  -> valid control
  -> adversarial perturbation / mutant / negative case
  -> expected failure
  -> ACTUAL failure, for the INTENDED reason
```

The last line is the one that gets skipped. A test that fails is not evidence; a
test that fails **for the reason the claim names** is.

## The ways a proof misses its mechanism

- **The fixture never arrived.** Something rejected it earlier — a malformed
  input caught by an unrelated validator proves nothing about the rule under
  test.
- **The failure was incidental.** A build error caused by an unrelated missing
  property fails loudly while saying nothing about the property claimed.
- **The guard was read, not exercised.** Scanning a check's own source tests its
  text. Run it against a planted violation it must catch **and** a valid control
  it must allow.
- **The mutant died of something else.** Setup noise, an environment failure, or
  a different guard killing it is not evidence that this mechanism did.
- **The assertion was circular.** If the expected value is derived from the same
  place as the actual one, the test passes without the mechanism running.

## When the perturbation survives

Something is wrong: either the implementation or the proof. **Investigate which.**
Do not weaken the assertion to make it green — a surviving mutant is information,
and deleting it destroys the information rather than the defect.

## Match the evidence to the claim

| Claim | What supports it |
|---|---|
| runtime behaviour | behavioural, adversarial proof |
| impossible by construction | a proof at the level that makes it impossible |
| an exhaustive structural property | the guard exercised against a counterexample |
| replay or idempotency | repeated and cross-path behaviour |
| "this would be caught" | an actually applied perturbation |

## What this module will not tell you

It prescribes no tool and no framework, and it does not require mutation testing
on ordinary work.
