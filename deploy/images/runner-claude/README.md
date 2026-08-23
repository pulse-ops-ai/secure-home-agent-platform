# deploy/images/runner-claude/

`secure-home-runner-claude` — the **reference derived runner image**: the
exact pinned `secure-home-runner-base` plus **one** provider runtime
([ADR-0011](../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md):
one coding agent per derived image; a multi-provider image is prohibited).

## What this image adds, exactly

| Addition | Pin | Why |
|---|---|---|
| Claude Code CLI | `@anthropic-ai/claude-code@2.1.241` + its platform executable package, both verified against their recorded registry integrity before installation | the one runtime |
| Node.js | `24.18.1`, SHA-256-verified release archive | the runtime's engine |
| `git` | exact archive version (`1:2.47.3-0+deb13u1`) | repository operation is the runtime's function |

Nothing else. `npm install --offline` makes any *additional* dependency a
build failure rather than an unpinned download, so a future runtime version
that grows requirements changes the reviewed definition — never the build's
supply chain silently.

## The parent chain

The `FROM secure-home-runner-base` line is a logical name with no registry
resolution path. The governed build resolves it to the **exact digest**
recorded as `parent_digest` in [`../image-lock.yaml`](../image-lock.yaml)
via an OCI-layout build context; the lineage checker refuses a
`parent_digest` that does not equal the base's recorded digest, so a
rebuilt base cannot leave this image claiming a stale parent.

## What it deliberately does not contain

- **No credential, no provider configuration.** Credentials are
  provisioned at run time from the execution profile — never baked
  (credential-shaped `ENV`/`ARG` names are refused mechanically).
- **No second runtime of any kind.** The Copilot derived image is L7/#55,
  from this same base, in its own directory.
- **No knowledge content** (issue #93 owns runtime knowledge integration;
  an image stays reusable across profiles and knowledge releases).
- No adapter code: adapters live in `agents/adapters/` (L7) and are not
  image content.

## Failure mode and verification

Inert until a profile pins it and L9 can launch it — neither exists. Same
validation as the base: `scripts/check-images.mjs` +
`.github/workflows/images.yml` rebuild-and-compare. The build additionally
asserts wiring locally (`claude --version`) with no network and no
credential.

## Resource limits

Declared by the execution profile and enforced at L9, per run — see the
base README's note.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
ADR-0003, ADR-0011, ADR-0013 · issue #53 (L5)
