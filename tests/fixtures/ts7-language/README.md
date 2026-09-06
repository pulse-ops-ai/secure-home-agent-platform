# TypeScript 7 language fixtures

Subjects for the Scope-2 compatibility audit (task 3.1), not repository source.

Each file is accepted by the TypeScript 7.0.2 parser and carries a **governed
import edge** — a `@secure-home/*` specifier the architecture gate must see.

The bounded compatibility seam parses every repository file with the traditional
TypeScript 6 API. If TypeScript 7 accepts syntax that TypeScript 6 merely
*recovers* from, the gate could parse the file, report no error, and silently
not see the import — a forbidden edge disappearing through parser recovery
rather than being refused.

So the required property for every fixture is:

    the TS6 parser extracts the governed edge
      OR
    it reports a syntax error and the gate fails closed

Never both absent. `tests/test_ts7_language_compatibility.py` asserts it.

These live under `tests/fixtures/` deliberately: the architecture gate's walker
skips that directory, so they are subjects of the audit rather than source it
governs.
