# PR-3 activation intent — identity allocation only

This branch exists only to allocate the stable draft pull-request identity
required by genesis under [task 8.0](tasks.md#8-activation). This note is
intentionally non-authoritative: it carries no governance authority and grants
no activation authority.

At this intent-only stage:

- Canonical `governance/state.json` does not exist; no candidate has been promoted.
- No genesis attestation has been performed.
- No external authority handoff has occurred.
- ADR-0020 remains Proposed, U4 remains open, and GATE-U4 remains unsatisfied.
- PR #101 remains untouched.

Task 8.1 is a repository-owner human step and is still pending. Tasks 8.1a–8.8
have not started.

This note will be deleted inside the later atomic activation-seam commit under
tasks 8.2a/8.5a; it must not survive into `main`.
