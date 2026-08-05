# Runbook: Raspberry Pi bootstrap

Prepares the Raspberry Pi 5 to *become* the household control-plane host.

> **This runbook deliberately stops before installing anything.** It ends where
> the repository's current scope ends: prerequisites verified, working copy in
> place, validation passing. It does **not** install Home Assistant, start any
> service, provision credentials, or connect to the VPS. Those steps are blocked
> on ADR acceptance — see [`INDEX.md`](INDEX.md).

## Audience

A human operator with physical or SSH access to the Pi.

## Target host

| Property | Value |
|---|---|
| Hardware | Raspberry Pi 5, 8 GB RAM, 256 GB NVMe |
| OS | Debian 13 (trixie), ARM64 |
| Container runtime | Docker with Compose (not installed by this runbook) |
| Connectivity | Tailscale (not configured by this runbook) |
| Role | Household control plane — L6/L7 for both ingress paths |

## Prerequisites

- Debian 13 ARM64 installed and updated.
- A non-root user with `sudo`.
- Network reachability sufficient to clone the repository.
- **Nothing else.** In particular, do not pre-install Home Assistant.

## 1. Confirm the host is what you think it is

```sh
cat /etc/os-release          # expect: Debian GNU/Linux 13 (trixie)
uname -m                     # expect: aarch64
nproc                        # expect: 4
free -h                      # expect: ~8 GiB total
df -h /                      # confirm the NVMe is the root device
```

If any of these differ, stop. The architecture documents assume this host shape,
and resource limits for the runner substrate are sized against it
([`../architecture/runner-model.md`](../architecture/runner-model.md)).

## 2. Baseline updates

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates
```

## 3. Clone the repository

```sh
mkdir -p ~/src && cd ~/src
git clone https://github.com/pulse-ops-ai/secure-home-agent-platform.git
cd secure-home-agent-platform
```

## 4. Install the toolchains

Nothing here touches system Python or system Node.

### uv — Python workspace

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
# restart the shell, or:
export PATH="$HOME/.local/bin:$PATH"
uv --version
```

### Node and Corepack — TypeScript workspace

Debian's packaged Node is older than this workspace targets. Use a version
manager:

```sh
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install --lts
node --version                # expect v22 or newer
corepack --version            # ships with Node
corepack enable
```

`packageManager` in [`../../package.json`](../../package.json) pins the pnpm
version; Corepack provisions it. Do not `npm install -g pnpm`.

## 5. Verify the working copy

```sh
bash scripts/check.sh
```

This runs the scaffold validator, the Python workspace checks, and the
TypeScript workspace checks, and **reports anything it skipped**. A skipped check
is reported, never silent.

Individually:

```sh
bash scripts/validate-scaffold.sh
uv sync --all-packages
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest
pnpm install --lockfile-only
pnpm -r --if-present run check
```

## 6. Read before going further

Before installing anything on this host:

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../architecture/INDEX.md`](../architecture/INDEX.md)
3. [`../decisions/INDEX.md`](../decisions/INDEX.md)
4. [`../architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)

## Where this runbook stops

The governing ADRs are accepted, but **acceptance is not authorization to
deploy**. Everything below still needs its own reviewed work, and several steps
depend on a decision that is still open:

| Step | Blocked on |
|---|---|
| Install Docker and Compose | a deployment task contract |
| Join the tailnet and configure ACLs | a deployment task contract |
| Install Home Assistant Container | [U10](../architecture/unresolved-decisions.md#u10) credential strategy |
| Provision any credential | [U2](../architecture/unresolved-decisions.md#u2), [U10](../architecture/unresolved-decisions.md#u10) |
| Connect to the VPS database | a deployment task contract |
| Build or pull a runner image | the base-image contract |
| Start any service | service implementations exist |

## Undo

Nothing in this runbook modifies system state beyond package updates and
user-scoped toolchain installs.

```sh
rm -rf ~/src/secure-home-agent-platform
rm -rf ~/.local/bin/uv ~/.local/bin/uvx      # uv
rm -rf ~/.nvm                                 # nvm and its Node versions
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `uv: command not found` | `~/.local/bin` not on `PATH` | `export PATH="$HOME/.local/bin:$PATH"` and add it to your shell profile |
| `corepack: command not found` | system Node predates Corepack, or nvm not sourced | source nvm, then `nvm install --lts` |
| `pnpm` resolves to an unexpected version | a globally installed pnpm shadows Corepack | uninstall the global pnpm; let `packageManager` decide |
| `uv run mypy` reports missing packages | workspace not synced | `uv sync --all-packages` first |
| `check.sh` reports skipped checks | a toolchain is missing | install it, or report the skip explicitly in your PR |
