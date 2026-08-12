# L6 Copilot CLI Spike Findings

## Environment
- base SHA: 2ed3282a02b77720ff4d0be7427306efeb5a47eb (origin/main; unchanged during spike)
- branch: spike/copilot-l6-capabilities (isolated /tmp worktree)
- OS: Ubuntu 22.04.5 LTS, Linux 6.8
- architecture: x86_64
- Copilot CLI version: 1.0.79 (embedded Node runtime v24.18.1; host Node v20.19.0)
- GitHub CLI: 2.64.0 (its stored token was invalid and was not used)
- model: hosted gpt-5.4, explicitly pinned for every evidence run; Auto never used
- auth mechanism category: pre-existing OS credential store (login); no credential value read, printed, or committed

## SPIKE-01 — Structured output
Verdict: NO.
Evidence: `--output-format json` frames the event transcript only; no response-schema option exists (`--response-schema` rejected at arg parse). Prompt-only valid JSON complied; an adversarial prompt produced malformed prose-prefixed content with exit 0 and no rejection.
Limitations: one CLI version, one pinned model; undocumented internals not treated as guarantees.
L7/U6 implication: structured-output enforcement must live in the platform (validate + reject/repair), not the CLI.

## SPIKE-02 — Tool allowlisting
Verdict: PARTIAL (fail-closed for availability/deny/unknown/unapproved-write; NOT a positive allowlist for read-only shell).
Evidence: --available-tools removed other tools; unknown tool name disabled all tools; deny beat allow; injected bypass of --deny-tool(cat) denied; unapproved touch denied via permission.completed under --no-ask-user; but unlisted read-only pwd auto-approved.
Limitations: command-identifier granularity (stem + :* wildcard), not arbitrary argv; process exit 0 even after a denied tool.
L7/U6 implication: model tool availability and permission approval are separate controls; express grants as a closed --available-tools set plus explicit deny; read tool disposition from events, not exit code.

## SPIKE-03 — Transcript
Verdict: PARTIAL.
Evidence: stdout JSONL + automatic events.jsonl + SQLite + optional OTel; toolCallId correlates request/start/complete with exact args/result/truncation and machine-readable denial. Permission events only in persisted events, not stdout. External SIGTERM gave process exit 124 while CLI result.exitCode=0 / routine shutdown / abort events / no tool-completion.
Limitations: per-field public stability undetermined; share.md is human-only; provider metadata needs OTel.
L7/U6 implication: multi-surface capture; runner owns terminal truth; deliberate redaction (default OTel omits content; opt-in captures everything).

## SPIKE-04 — Usage/cost
Verdict: PARTIAL.
Evidence: per-run tokens (input/output/reasoning/cache), request counts, nano_aiu, premium requests, model/provider, durations, tool/inference counts in result.usage + session.shutdown + OTel. No monetary amount. Cost fields inconsistent across surfaces (shutdown requests.cost mostly 0 vs OTel cost ~1/call; premium=1 only for unknown-tool).
Limitations: credits/premium units, not currency; session limit is a soft post-hoc cap; termination skews stdout totals.
L7/U6 implication: record native credit/token units per run, never as money; choose one authoritative surface; handle termination gaps.

## SPIKE-05 — Credential injection/isolation
Verdict: UNDETERMINED.
Evidence: documented env precedence (COPILOT_GITHUB_TOKEN>GH_TOKEN>GITHUB_TOKEN) + BYOK + --secret-env-vars (confirmed: L6_MARKER absent from shell tool). Successful runs reused the OS store, reusable after termination. Fresh COPILOT_HOME persisted config/DB/events even on auth failure; ~/.cache/copilot/managed-settings written to REAL host cache (non-secret, "safe to delete"). Invalid non-secret token marker ignored and never persisted. Same-user /proc/<pid>/environ readable during process life.
Limitations: valid-env-token persistence not executed (no safe custody); keyring internals not queried; crash/all-temp cleanup and image layers unproven (no image experiment authorized).
L7/U6 implication: OS-store auth is not per-run ephemeral; a per-run design needs env/BYOK injection into throwaway HOME+cache on a single-tenant sandbox with explicit teardown; image-layer isolation proven separately.

## Cross-cutting findings
- `--output-format json` is transcript framing, not response-schema enforcement.
- Tool availability (--available-tools) and permission approval (--allow-tool/--deny-tool) are independent; deny always wins; read-only shell auto-approves.
- Tool denial and overall run success are independent: denied tool + process/result exit 0.
- Transcript, usage, and credential state all persist under COPILOT_HOME; ~/.cache/copilot persists OUTSIDE COPILOT_HOME.
- Richest telemetry (opt-in OTel content capture) is also most sensitive (prompts, system instructions, tool defs, args, results).
- External termination degrades transcript completeness and usage truth at the same time.

## Required inputs to U6/#11
- No native caller-schema enforcement in Copilot CLI 1.0.79.
- Availability vs permission are two controls; --allow-tool is not deny-by-default.
- Explicit deny precedence held under prompt injection; unknown/unavailable tools fail closed; unapproved writes fail closed noninteractively.
- Machine events correlate by toolCallId with exact args/results/denials and a closed permission-result enum.
- CLI terminal result is not authoritative under external termination.
- Native per-run usage is in tokens + AI-credit/premium units, not currency.
- OS-store auth persists and is reusable after run termination; COPILOT_HOME does not cover ~/.cache/copilot.

## Unproven claims
- Public/compat stability of individual JSONL event fields.
- Any undocumented structured-response enforcement.
- Arbitrary full-argv command policy.
- Monetary cost per run.
- Valid env-token (non-)persistence in config/cache/keyring/DB.
- Credential isolation from other same-user processes.
- Complete crash-path/all-temp cleanup.
- Image-layer credential isolation (no image experiment authorized).

## Checks run
- `copilot --version` — passed: GitHub Copilot CLI `1.0.79`.
- Installed CLI help/topic inventory — passed; structured output, permission, transcript, billing/usage, telemetry, and credential surfaces recorded.
- 16 hosted `gpt-5.4` probe runs plus one argument-parser negative — completed; Auto was never used; all captured JSONL parsed without error.
- Candidate artifact SHA-256 manifest verification — passed.
- Candidate evidence secret-shape scan — clean.
- `bash scripts/validate-scaffold.sh` — 82 checks passed.
- `bash scripts/scan-secrets.sh` — no secret-shaped tracked values.
- Full aggregate command under installed Node 24.18.1, pnpm 11.18.0, Python 3.13.3, and writable `/tmp` caches: `bash scripts/check.sh` — **all 17 checks passed**.
- TypeScript: lockfile, manifests, formatting, workspace/import direction, lint, type-check, tests, and builds all passed. Test totals included 20 testing-package, 17 ESLint-config, 20 tsconfig, 54 contracts, 33 events, and 121 runner-core tests; no-test packages exited successfully by declared configuration.
- Python: sync, Ruff lint/format, mypy, and pytest passed; `127 passed`.
- Initial Node 22 validation attempt: every gate except TypeScript tests passed; one test explicitly required Node 24 (`expected 22 >= 24`). This was an environment-version mismatch, not a code defect; the complete Node 24 rerun passed all 17 gates.
- Real host `~/.copilot/config.json` and OS keyring metadata remained unchanged; credential contents were never read.

## Skips
- Valid real-token env injection: skipped (no safe credential custody; env/process inspection risk).
- OS keyring content query: skipped (secret-tool absent; must not reveal secrets).
- Docker/image-layer experiment: skipped (not authorized by #54).
- Strict OpenSpec validation: skipped (no OpenSpec change created).
- Repository commit/push/PR: skipped (evidence landing path undefined -> explicit STOP).

## Workspace integrity
- origin/main before/after: 2ed3282a02b77720ff4d0be7427306efeb5a47eb (unchanged)
- spike HEAD: 2ed3282a02b77720ff4d0be7427306efeb5a47eb; spike dirty: clean (0)
- launched review worktree: `spec/early-terminal-record-eq-closures` at final observed HEAD `93e2323698e57041dfc6e4242360b0f95e76df0d`; clean and untouched by the spike; its HEAD advanced independently during the ongoing review
