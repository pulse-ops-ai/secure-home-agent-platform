# Governance state model

This directory contains the dependency-light PR-1/PR-2 model for strict parsing,
canonicalization, digest construction, derived governance state, and
current-snapshot validation. It is repository tooling only; it is not runtime
code and does not contain the canonical governance registry.

`history.mjs` owns pairwise rules; the Git adapters only supply observations.
`decision-evidence.mjs` owns the D12 calendar-date/encoded-Git-metadata
distinction, complete reviewed-transition audit, closed source rows and
authoritative date/actor agreement. The historical bridge is observed evidence,
never a new acceptance path. ADR metadata remains excluded from causal digests
but immutable in history and byte-bound by the candidate/source manifest.
`validate.mjs` owns source equivalence, historical completion dispatch, candidate
freeze/freshness validation, and the requirement for both genesis attestations.
`archived-openspec.mjs` permits only explicitly absent minimum artifacts under
the historical profile; all existing-member, identity, stage, and witness rules
still apply. Ordinary completions never inherit that profile.

`consumers.mjs` discovers governance surfaces across tracked bytes and validates
the five-disposition inventory; counts are derived, not authored. The
[extraction entry points](../genesis/README.md) call this model and cannot add an
activation exception. Candidate/test artifacts are not canonical authority.
