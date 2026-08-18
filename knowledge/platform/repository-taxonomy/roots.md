---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. Names roots and their roles, never a file inventory. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md
  - AGENTS.md
  - agents/README.md
  - profiles/README.md
  - knowledge/README.md
  - deploy/README.md
  - docs/README.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T18:53:35Z
---

# The roots, and the test that decides each one

**Role is decided by what a thing *is*, not by what language it is written in.**
A Python file does not belong somewhere because it is Python; it belongs where
its role puts it.

| Root | Contains | The test |
|---|---|---|
| `services/` | deployable backend processes | it has its own lifecycle, process, and deployment identity, and no person uses it directly |
| `apps/` | human-facing applications | a person opens it |
| `packages/` | reusable libraries | it is imported, and has **no runtime identity of its own** |
| `agents/` | agent implementations and runtime adapters | it runs *inside* a sandbox, launched from a profile |
| `profiles/` | execution authority declarations | it says what a run may do |
| `knowledge/` | portable context | it informs reasoning and grants nothing |
| `schemas/` | published contract artifacts | it is generated from an authored contract, not written by hand |
| `deploy/` | deployment material | it describes how something is stood up |
| `docs/` | architecture, operations, and governance material | a person reads it to understand or decide |

## Using the test, not the list

The table above is a set of **tests**, not an inventory. New members appear under
these roots regularly, and the module does not enumerate them — a list of today's
packages would be wrong by next week, while the tests keep working.

So ask the test:

- *"Does a person open it?"* → `apps/`, not `services/`.
- *"Does it have its own process and deployment identity?"* → `services/`.
- *"Is it only ever imported?"* → `packages/`. A library that quietly grows a
  process has stopped being a library.
- *"Is this generated from something authored elsewhere?"* → `schemas/`, and the
  authored source stays where it was authored.

## Two mistakes worth naming

**Placing by language.** An inference worker written in Python is a *service*
because it is a deployable process, not a `packages/` member because of its
language.

**Placing by convenience.** Putting a deployable process under `packages/`
because that is where its code already lived inverts the boundary the roots
exist to hold. If the placement test says the role changed, the change is to move
it — or to reconsider whether it should have that role at all.

## Two rules that decide the boundary inside a root

**A directory's README owns that directory's boundary.** It says what belongs
there and — usually more usefully — what does not. Read it before adding a file
to a directory you have not worked in; the placement question is often already
answered there.

**The nearest applicable `AGENTS.md` governs the file you are editing.** Walk up
from the file: the first one you find wins for its subtree, and the root one
governs everything else. Editing files under two subtrees means both apply.

Neither of these is an inventory, and neither goes stale when a member is added.

## What this module will not tell you

It does not list the current members of any root, name a specific service or
package, or describe deployment topology. Those change; the roles do not.
