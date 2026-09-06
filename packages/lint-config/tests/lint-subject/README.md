# `lint-subject/` — a member-shaped subject for the runner

The dual-engine runner is proved by running it, not by reading it: an engine
that was deleted and replaced with a hardcoded pass is invisible to source
inspection.

Running it needs a member with real source and a real TypeScript project, and
the obvious choice — an actual workspace member — is the wrong one. Writing a
deliberate violation into `packages/contracts/src` mutates shared state that
other members' conformance suites scan while they run in parallel, and it did:
`runner-core` reported two import-direction problems caused by a file that
existed for a few hundred milliseconds.

So the subject lives here. It is member-shaped and belongs to no workspace glob,
so nothing else ever sees it.
