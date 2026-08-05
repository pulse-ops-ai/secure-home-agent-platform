# scripts/

Repository tooling: validation and aggregate checks. Dependency-light by design.

> **Naming note.** "Scripts" here means *developer and CI tooling*. Agent-callable
> tools are [`../packages/python/tools/`](../packages/python/tools/) — a
> completely different thing.

## Contents

| Script | Purpose |
|---|---|
| [`validate-scaffold.sh`](validate-scaffold.sh) | Structural validation: navigation files, index integrity, required READMEs, workspace manifests, tracked secrets, forbidden generated directories |
| [`check.sh`](check.sh) | Aggregate check — runs everything and **reports what it skipped** |
| [`scan-secrets.sh`](scan-secrets.sh) | Scans **every tracked text file** for secret-shaped values — no file-level exclusions |
| [`secret-scan-allowlist.txt`](secret-scan-allowlist.txt) | Narrow, commented exceptions for the scanner |
| [`check-ts-package.mjs`](check-ts-package.mjs) | Validates one TypeScript workspace package manifest; invoked by each package's `check` script |

## What belongs here

- Validation and check tooling for the repository itself.
- Small, readable, dependency-light scripts.

## What does not belong here

- **Anything that deploys, starts, stops, or configures a service.** No
  `docker compose up`, no `tailscale up`, no service management.
- **Anything that touches a credential** or reads a secret store.
- **Anything that contacts Home Assistant, the VPS, or the shared edge.**
- **Application or service code** — [`../services/`](../services/).
- **Agent-callable tools** — [`../packages/python/tools/`](../packages/python/tools/).
- **Heavy dependencies.** These scripts must run on a freshly-prepared Pi with
  nothing installed beyond a shell and the workspace toolchains.

## Ownership and boundary rules

1. **Read-only.** A script here inspects the repository; it does not mutate the
   system.
2. **Dependency-light.** `validate-scaffold.sh` uses POSIX-ish shell and
   coreutils only — no `jq`, no Python, no network. It must run before any
   toolchain is installed.
3. **Skips are reported, never silent.** `check.sh` prints a skipped check and
   exits non-zero on a genuine failure. A check that quietly disappears is how a
   broken repository looks healthy.
4. **The secret scan has exactly one suppression mechanism, and it is
   enforced.** `scan-secrets.sh` scans every tracked text file, including
   `.github/workflows/` and itself. There is no file-level exclusion and **no
   in-line pragma of any spelling** — an earlier revision used a sentinel
   comment, which was a repository-wide bypass token. Self-matching is handled by
   assembling patterns from fragments, so the scanner scans itself with no
   exemption. The allowlist takes `path:line:sha256=<digest> # justification`
   entries and rejects broad, stale, unjustified, or workflow-scoped ones **in
   code**, failing closed before scanning. Regression tests live in
   [`../tests/test_secret_scanner.py`](../tests/test_secret_scanner.py).
5. **Fail loudly and specifically.** A validator that says "failed" without
   saying what and where is not useful at 11pm.

## Governed by

[`../AGENTS.md`](../AGENTS.md)

## Validation

```sh
bash scripts/validate-scaffold.sh
bash scripts/scan-secrets.sh
bash scripts/check.sh          # runs both, plus the workspaces
```

The same checks run as the repository merge gate —
[`../.github/workflows/checks.yml`](../.github/workflows/checks.yml).
