"""Shared machinery for the framework-conformance suite (fc_support).

One suite, applied to every adapter (tests parameterize over ADAPTERS —
never copy an assertion per adapter). Offline and deterministic: the
provider CLIs are the committed stubs in ./stubs, resolved via a
temporary PATH; no credential, no network, no real provider.

The suite runs each adapter's BUILT process entry. When dist/ is absent
it fails loudly with the build command rather than skipping — the
repository's stated philosophy (checks.yml classifier job): a gate
verified conditionally is not verified.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SUITE_DIR = Path(__file__).resolve().parent
STUB_DIR = SUITE_DIR / "stubs"

FROZEN_SPI = REPO_ROOT / "services" / "runner-control" / "src" / "ports" / "values.ts"


@dataclass(frozen=True)
class Adapter:
    """One adapter under conformance."""

    name: str
    package: str
    package_dir: Path
    provider_command: str
    pinned_version: str
    lock_image: str

    @property
    def bin_path(self) -> Path:
        return self.package_dir / "dist" / "bin.js"

    @property
    def stub_path(self) -> Path:
        return STUB_DIR / f"{self.provider_command}.cjs"


ADAPTERS: tuple[Adapter, ...] = (
    Adapter(
        name="claude-code",
        package="@secure-home/adapter-claude-code",
        package_dir=REPO_ROOT / "agents" / "adapters" / "coding" / "claude-code",
        provider_command="claude",
        pinned_version="2.1.241",
        lock_image="secure-home-runner-claude",
    ),
    Adapter(
        name="copilot-cli",
        package="@secure-home/adapter-copilot-cli",
        package_dir=REPO_ROOT / "agents" / "adapters" / "coding" / "copilot-cli",
        provider_command="copilot",
        pinned_version="1.0.79",
        lock_image="secure-home-runner-copilot",
    ),
)


def require_built(adapter: Adapter) -> None:
    if not adapter.bin_path.is_file():
        pytest.fail(
            f"{adapter.package} is not built ({adapter.bin_path} missing). "
            f"Run: corepack pnpm --filter {adapter.package} run build — "
            "this suite fails rather than skips, so an unbuilt adapter "
            "cannot read as a conforming one."
        )


def golden_invocation(adapter: Adapter, workspace: Path | None = None) -> dict[str, Any]:
    """The one golden logical run, expressed profile-realistically.

    Canonical routing (`R3` — coding inference under ADR-0007 — with the
    canonical declared fallback `refuse`), an OPAQUE workspace reference
    exactly as runner-control constructs one (`workspace:<run>` — never a
    filesystem path; the sandbox cwd is the harness's, standing in for
    the L9 session substrate), same task, same limits, same grant SHAPE;
    only the provider-native tool identity differs (claude names built-in
    tools, copilot names availability identities) — which is exactly the
    neutrality claim: the contract out must be identical anyway.

    The `workspace` parameter is accepted for call-site compatibility and
    deliberately unused: the reference below must stay opaque.
    """
    del workspace
    tool = "Read" if adapter.name == "claude-code" else "bash"
    return {
        "run_id": "run-conformance-0001",
        "generation": 1,
        "adapter": adapter.name,
        "profile": {
            "name": "coding-default",
            "version": "1.0.0",
            "digest": "sha256:" + "a" * 64,
        },
        "input": {
            "kind": "task",
            "task": "list the repository README titles",
            "parameters": {},
        },
        "grant": {
            "tools": [tool],
            "mounts": [{"path": "/workspace", "posture": "read_write"}],
            "network": {"default": "deny", "granted_destinations": []},
            "credentials": [{"env_var": "PROVIDER_TOKEN_REF"}],
        },
        "routing": {"routing_class": "R3", "model_route": "route-a", "fallback": "refuse"},
        "limits": {
            "wall_clock_seconds": 600,
            "cpu_cores": 2,
            "memory_bytes": 1_073_741_824,
            "pids": 128,
            "output_bytes": 65_536,
        },
        "credentials": [{"env_var": "PROVIDER_TOKEN_REF"}],
        "workspace": {"session_ref": "session-0001", "root_ref": "workspace:run-conformance-0001"},
    }


def _isolated_path(tmp_path: Path, *, with_stub_dir: Path | None) -> str:
    """A PATH on which NO real provider CLI can resolve — ever.

    The host may carry real `claude`/`copilot` binaries (this exact
    hazard was observed: the nvm default bin dir ships both), so the
    suite never inherits the ambient PATH. Only three entries exist: the
    per-test stub dir (when the provider should resolve at all), a shim
    dir holding a symlink to the exact node running this suite, and the
    system dirs for /bin/sh.
    """
    node = shutil.which("node")
    assert node is not None, "node is required to run the adapter entries"
    node_shim = tmp_path / "node-shim"
    node_shim.mkdir(exist_ok=True)
    link = node_shim / "node"
    if not link.exists():
        link.symlink_to(node)
    entries = [str(node_shim), "/usr/bin", "/bin"]
    if with_stub_dir is not None:
        entries.insert(0, str(with_stub_dir))
    for entry in entries:
        if with_stub_dir is not None and entry == str(with_stub_dir):
            continue  # the stub dir is the one place a provider name SHOULD resolve
        for command in ("claude", "copilot"):
            candidate = Path(entry) / command
            assert not candidate.is_file(), (
                f"a real provider CLI is reachable at {candidate} — refusing to run"
            )
    return os.pathsep.join(entries)


PLANTED_VALUE = "planted-credential-value-do-not-emit"
DECLARED_CREDENTIAL_VALUE = "declared-credential-reference-material"


def _write_shim(
    adapter: Adapter,
    bin_dir: Path,
    scenario: str,
    argv_file: Path,
    env_file: Path,
    *,
    marker: Path | None = None,
) -> None:
    """The provider shim. Stub harness variables are BAKED INTO the shim
    rather than passed through the adapter: the adapter's child
    environment is allowlisted (review finding 1), so nothing undeclared
    can arrive that way — which is exactly the property under test."""
    exports = [
        f'STUB_SCENARIO="{scenario}"',
        f'STUB_ARGV_FILE="{argv_file}"',
        f'STUB_ENV_FILE="{env_file}"',
    ]
    if marker is not None:
        exports.append(f'STUB_RUNNING_MARKER="{marker}"')
    shim = bin_dir / adapter.provider_command
    shim.write_text("#!/bin/sh\n" + " ".join(exports) + f' exec node "{adapter.stub_path}" "$@"\n')
    shim.chmod(0o755)


@dataclass(frozen=True)
class AdapterRun:
    """One adapter-entry execution, fully captured."""

    stdout: str
    stderr: str
    returncode: int
    argv_file: Path
    env_file: Path

    @property
    def report(self) -> dict[str, Any]:
        document = json.loads(self.stdout)
        assert isinstance(document, dict)
        return document

    @property
    def child_env(self) -> dict[str, str]:
        """The environment the provider process actually saw."""
        if not self.env_file.is_file():
            return {}
        loaded = json.loads(self.env_file.read_text())
        assert isinstance(loaded, dict)
        return {str(k): str(v) for k, v in loaded.items()}

    @property
    def recorded_argv(self) -> list[str]:
        if not self.argv_file.is_file():
            return []
        loaded = json.loads(self.argv_file.read_text())
        assert isinstance(loaded, list)
        return [str(item) for item in loaded]


def run_adapter(
    adapter: Adapter,
    invocation_bytes: str,
    tmp_path: Path,
    *,
    scenario: str = "golden",
    on_path: bool = True,
    timeout: float = 30.0,
) -> AdapterRun:
    """Drive one adapter entry exactly as a substrate would: stdin in,
    stdout out, the provider resolved on PATH (the stub, unless on_path
    is False to prove the missing-CLI failure path)."""
    bin_dir = tmp_path / "bin"
    home = tmp_path / "home"
    argv_file = tmp_path / "argv.json"
    env_file = tmp_path / "child-env.json"
    bin_dir.mkdir(exist_ok=True)
    home.mkdir(exist_ok=True)

    if on_path:
        _write_shim(adapter, bin_dir, scenario, argv_file, env_file)

    env = {
        "PATH": _isolated_path(tmp_path, with_stub_dir=bin_dir if on_path else None),
        # The substrate-provisioned surface: the DECLARED credential (its
        # value is deliberately reference-shaped, not secret-shaped) and
        # the isolation home the copilot plan declares.
        "PROVIDER_TOKEN_REF": DECLARED_CREDENTIAL_VALUE,
        "COPILOT_HOME": str(home),
        # A planted UNDECLARED value in the adapter's environment: the
        # cannot-widen tests assert it never reaches argv, the report, or
        # the provider child environment (review finding 1).
        "PLANTED_SECRET_VALUE": PLANTED_VALUE,
    }

    # The harness stands in for the L9 session substrate: it establishes
    # the sandbox working directory and launches the adapter INSIDE it.
    # The adapter must inherit — never resolve — a cwd (review finding 4).
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir(exist_ok=True)
    completed = subprocess.run(
        ["node", str(adapter.bin_path)],
        input=invocation_bytes,
        capture_output=True,
        text=True,
        env=env,
        cwd=sandbox,
        timeout=timeout,
    )
    return AdapterRun(
        stdout=completed.stdout,
        stderr=completed.stderr,
        returncode=completed.returncode,
        argv_file=argv_file,
        env_file=env_file,
    )


def run_adapter_cancelling(
    adapter: Adapter,
    invocation_bytes: str,
    tmp_path: Path,
    *,
    timeout: float = 30.0,
) -> AdapterRun:
    """Drive the hang scenario and deliver SIGTERM once the stub signals
    (via marker file) that the provider process is actually running —
    cancellation must be proven effective, not raced."""
    import signal
    import time

    bin_dir = tmp_path / "bin"
    home = tmp_path / "home"
    argv_file = tmp_path / "argv.json"
    env_file = tmp_path / "child-env.json"
    marker = tmp_path / "stub-running.marker"
    bin_dir.mkdir(exist_ok=True)
    home.mkdir(exist_ok=True)

    _write_shim(adapter, bin_dir, "hang", argv_file, env_file, marker=marker)

    env = {
        "PATH": _isolated_path(tmp_path, with_stub_dir=bin_dir),
        "PROVIDER_TOKEN_REF": DECLARED_CREDENTIAL_VALUE,
        "COPILOT_HOME": str(home),
        "PLANTED_SECRET_VALUE": PLANTED_VALUE,
    }

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir(exist_ok=True)
    process = subprocess.Popen(
        ["node", str(adapter.bin_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        cwd=sandbox,
    )
    assert process.stdin is not None
    process.stdin.write(invocation_bytes)
    process.stdin.close()

    deadline = time.monotonic() + timeout
    while not marker.is_file():
        if time.monotonic() > deadline:
            process.kill()
            pytest.fail("stub never reported running; cannot prove cancellation")
        if process.poll() is not None:
            pytest.fail(
                "adapter exited before cancellation could be delivered: "
                f"stdout={process.stdout.read() if process.stdout else ''!r} "
                f"stderr={process.stderr.read() if process.stderr else ''!r}"
            )
        time.sleep(0.02)

    process.send_signal(signal.SIGTERM)
    # Not communicate(): stdin is already closed, and communicate() would
    # try to flush it. The report is small, so a post-wait read cannot
    # deadlock on a full pipe.
    returncode = process.wait(timeout=timeout)
    assert process.stdout is not None and process.stderr is not None
    return AdapterRun(
        stdout=process.stdout.read(),
        stderr=process.stderr.read(),
        returncode=returncode,
        argv_file=argv_file,
        env_file=env_file,
    )
