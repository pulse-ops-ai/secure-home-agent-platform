# deploy/images/runner-copilot/

`secure-home-runner-copilot` — a **derived runner image**: the exact pinned
`secure-home-runner-base` plus **one** provider runtime
([ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md):
one coding agent per derived image; a multi-provider image is prohibited).
Landed by L7 (#55), pairing the
[`copilot-cli` adapter](../../../agents/adapters/coding/copilot-cli/).

## What this image adds, exactly

| Addition | Pin | Why |
|---|---|---|
| GitHub Copilot CLI | `@github/copilot@1.0.79` + its platform executable package, both verified against their recorded registry integrity before installation | the one runtime |
| `detect-libc` | `2.1.2`, sha512-verified | the runtime's ONE required helper dependency (platform-package selection) — an install input of the registered runtime, not a second runtime |
| Node.js | `24.18.1`, SHA-256-verified release archive | runs npm for the offline install and the launcher shim (the CLI executes on its own embedded runtime) |
| `git` | exact archive version (`1:2.47.3-0+deb13u1`) | repository operation is the runtime's function |

Nothing else. `npm install --offline` makes any *additional* dependency a
build failure rather than an unpinned download — `detect-libc` is supplied
as an explicitly verified tarball precisely because offline npm refuses to
resolve it from mutable registry metadata.

The version is **1.0.79 deliberately, not latest**: it is the version the
[L6 spike evidence](../../../docs/spikes/l6-copilot-cli/) was gathered
against, and the paired adapter's normalization basis must match the binary
this image carries.

## The parent chain

The `FROM secure-home-runner-base` line is a logical name with no registry
resolution path. The governed build resolves it to the **exact digest**
recorded as `parent_digest` in [`../image-lock.yaml`](../image-lock.yaml)
via an OCI-layout build context; the lineage checker refuses a
`parent_digest` that does not equal the base's recorded digest.

## What it deliberately does not contain

- **No credential, no provider configuration.** Credentials are
  provisioned at run time from the execution profile — never baked
  (credential-shaped `ENV`/`ARG` names are refused mechanically). The
  CLI's `COPILOT_HOME` state isolation is a launcher (L9) obligation,
  recorded in the adapter README — not image content.
- **No second runtime of any kind.**
- **No knowledge content** (issue #93 owns runtime knowledge integration).
- No adapter code: adapters live in `agents/adapters/` (L7) and are not
  image content.

## Failure mode and verification

Inert until a profile pins it and L9 can launch it — neither exists. Same
validation as every image: `scripts/check-images.mjs` +
`.github/workflows/images.yml` rebuild-and-compare. The build additionally
asserts wiring locally (`copilot --version`) with no network and no
credential.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
ADR-0011 · ADR-0013 · issue #55
