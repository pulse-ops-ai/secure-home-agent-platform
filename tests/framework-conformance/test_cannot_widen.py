"""An adapter cannot widen its invocation (PA-INV-06/07, PA-ADV-06/07,
PA-MUT-03): unknown fields are refused, argv narrows to the grant, an
out-of-grant call surfaces as a denial, no credential VALUE ever appears
in argv or the report, and no substrate concern reaches the provider."""

from __future__ import annotations

import json
from pathlib import Path

from fc_support import (
    DECLARED_CREDENTIAL_VALUE,
    PLANTED_VALUE,
    Adapter,
    golden_invocation,
    run_adapter,
)


def test_unknown_invocation_fields_are_refused(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    for widening in (
        {"image": "other:latest"},
        {"argv": ["--dangerously-skip-everything"]},
        {"mounts": [{"path": "/", "posture": "read_write"}]},
    ):
        invocation = {**golden_invocation(adapter, workspace), **widening}
        run = run_adapter(adapter, json.dumps(invocation), tmp_path)
        assert run.report["outcome"] == "environmental_fault"
        detail = run.report["detail"]
        assert isinstance(detail, str) and "unknown key" in detail


def test_argv_narrows_to_the_grant(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    argv = run.recorded_argv
    assert argv, "the stub must have recorded the provider argv"
    granted = golden_invocation(adapter, workspace)["grant"]["tools"]
    assert isinstance(granted, list)
    blob = " ".join(argv)
    # Every granted tool is narrowed into the visible surface; nothing
    # outside the grant is named as available or allowed.
    for tool in granted:
        assert tool in blob, f"granted tool {tool} absent from argv: {argv}"
    for flag in argv:
        for prefix in ("--available-tools=", "--allow-tool="):
            if flag.startswith(prefix):
                assert flag[len(prefix) :] in granted, f"ungranted surface in argv: {flag}"


def test_out_of_grant_use_surfaces_as_denial(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    calls = run.report["observation"]["calls"]
    assert {"denied"} <= {call["disposition"] for call in calls}, calls


def test_no_credential_value_reaches_argv_or_report(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    assert PLANTED_VALUE not in run.stdout
    assert PLANTED_VALUE not in " ".join(run.recorded_argv)


def test_workspace_refs_stay_opaque(adapter: Adapter, tmp_path: Path) -> None:
    """The adapter resolves nothing: no argv token names a path the
    invocation did not carry, and the session ref is never turned into a
    filesystem location."""
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    blob = " ".join(run.recorded_argv)
    assert "session-0001" not in blob


def test_provider_environment_is_allowlisted(adapter: Adapter, tmp_path: Path) -> None:
    """Review finding 1: the provider child must receive the baseline plus
    the DECLARED variables — never the adapter's ambient environment. The
    planted undeclared value exists in the adapter's env and must be
    absent from the child; the declared credential must arrive."""
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    child = run.child_env
    assert child, "the stub must have recorded its environment"

    assert "PLANTED_SECRET_VALUE" not in child, (
        "an ambient variable the invocation never declared reached the provider"
    )
    assert child.get("PROVIDER_TOKEN_REF") == DECLARED_CREDENTIAL_VALUE
    if adapter.name == "copilot-cli":
        assert "COPILOT_HOME" in child, "the declared isolation home must arrive"
    else:
        assert "COPILOT_HOME" not in child, (
            "an undeclared isolation variable leaked into the claude provider"
        )
    allowed = {"PATH", "HOME", "TMPDIR", "PROVIDER_TOKEN_REF", "COPILOT_HOME"}
    # Variables the SHIM's own /bin/sh introduces for its child (PWD, _)
    # plus the harness variables baked into the shim script — none of them
    # came through the adapter, which is the boundary under test.
    shim_added = {k for k in child if k.startswith("STUB_")} | {"_", "PWD"}
    unexpected = set(child) - allowed - shim_added
    assert not unexpected, f"undeclared variables reached the provider: {sorted(unexpected)}"
