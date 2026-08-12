# SPIKE-05 — Noninteractive credential injection/isolation

Property: can one noninteractive run authenticate without reusable credential/state surviving workspace, HOME/config/cache, keyring, temp, image, or teardown?

```text
supported: UNDETERMINED
injection_method: documented env precedence COPILOT_GITHUB_TOKEN > GH_TOKEN > GITHUB_TOKEN, and BYOK via COPILOT_PROVIDER_* (no GitHub auth). --secret-env-vars strips named vars from shell/MCP subprocess environments and redacts them from output. The successful hosted runs here used the pre-existing OS credential store (login), not a per-run env token.
persistence_observed: a fresh per-run COPILOT_HOME persisted config.json, session-state/<id>/events.jsonl, session.db + session-store.db/-wal, checkpoints, workspace.yaml — even on an auth-FAILED run. COPILOT_HOME does NOT redirect ~/.cache/copilot: hosted runs wrote ~/.cache/copilot/managed-settings/<hash>.json (self-labeled "safe to delete", response:null, no secret) to the REAL host cache. The pre-existing OS login remained and was reusable across many terminated runs.
cleanup_required: delete per-run COPILOT_HOME, the /tmp workspace, run logs, OTel + share outputs, AND ~/.cache/copilot/managed-settings entries. The pre-existing OS credential is outside per-run cleanup.
post_termination_reuse_possible: YES (observed): repeated fresh-COPILOT_HOME runs re-authenticated from the OS store after prior processes exited; keyring metadata unchanged (reuse, not per-run mint).
unproven_properties: valid-env-token file/keyring persistence (not executed — no safe token custody); OS keyring internals (secret-tool absent; never queried secret bodies); isolation from other same-user processes (a NON-secret marker WAS readable via /proc/<pid>/environ during process life, gone after exit); complete crash/kill + all-temp cleanup; image-layer persistence (NO image experiment authorized by #54).
implications_for_L7: the tested OS-store auth path is NOT per-run ephemeral. A per-run model requires env/BYOK token injection into a throwaway HOME AND cache, on a single-tenant sandbox (same-user /proc inheritance is real), with explicit teardown of COPILOT_HOME + ~/.cache/copilot; image-layer isolation must be proven separately.
```

Safety: no real credential was read, printed, put in argv/prompt, or committed. Only environment-variable NAMES recorded. An intentionally invalid non-secret marker in COPILOT_GITHUB_TOKEN was ignored by the CLI (fell back to OS store) and did not appear in any fresh-state file (incl. SQLite/WAL bytes). Real host ~/.copilot/config.json and login.keyring (mode 600) unchanged in size/mtime.
