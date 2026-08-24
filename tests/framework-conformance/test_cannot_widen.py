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
        invocation = {**golden_invocation(adapter), **widening}
        run = run_adapter(adapter, json.dumps(invocation), tmp_path)
        assert run.report["outcome"] == "environmental_fault"
        detail = run.report["detail"]
        assert isinstance(detail, str) and "unknown key" in detail


# The L6-evidenced availability→permission mapping (SPIKE-02): the shell
# rule family governs the bash availability identity. Used to check that
# permission rules stay within what the grant implies — and only there.
PERMISSION_FAMILIES = {"bash": "shell"}


def test_argv_narrows_to_the_grant(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    argv = run.recorded_argv
    assert argv, "the stub must have recorded the provider argv"
    granted = golden_invocation(adapter)["grant"]["tools"]
    assert isinstance(granted, list)
    blob = " ".join(argv)
    for tool in granted:
        assert tool in blob, f"granted tool {tool} absent from argv: {argv}"
    # Availability values stay inside the grant; permission rules stay
    # inside the grant's MAPPED families — never a copied availability
    # name, never a family the grant does not imply (review finding 1).
    implied_families = {PERMISSION_FAMILIES[t] for t in granted if t in PERMISSION_FAMILIES}
    for flag in argv:
        if flag.startswith("--available-tools="):
            assert flag[len("--available-tools=") :] in granted, f"ungranted: {flag}"
        if flag.startswith("--allow-tool="):
            value = flag[len("--allow-tool=") :]
            assert value in implied_families, f"permission outside the grant mapping: {flag}"
            assert value not in granted, f"availability identity in permission grammar: {flag}"


def test_out_of_grant_use_is_never_permitted(adapter: Adapter, tmp_path: Path) -> None:
    """The shared property: an out-of-grant attempt must never execute.
    Its OBSERVABLE form is provider-dialect-specific and each dialect is
    asserted faithfully (L6): claude records a reactive permission
    denial; copilot's availability narrowing is preventive — the tool is
    not model-visible, so no call exists at all."""
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path, scenario="denial")
    calls = run.report["observation"]["calls"]
    assert not any(call["disposition"] == "permitted" for call in calls), calls
    if adapter.name == "claude-code":
        assert {"tool": "Bash", "disposition": "denied"} in calls, calls
    else:
        assert calls == [], calls
        claims = run.report["observation"]["claims"]
        assert any("UNAVAILABLE" in claim["content"] for claim in claims), claims


def test_no_credential_value_reaches_argv_or_report(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    assert PLANTED_VALUE not in run.stdout
    assert PLANTED_VALUE not in " ".join(run.recorded_argv)


def test_workspace_refs_stay_opaque(adapter: Adapter, tmp_path: Path) -> None:
    """Review finding 4: the invocation carries runner-control's REAL
    opaque form (`workspace:run-…`), which is not a filesystem path. The
    run succeeding at all proves the adapter no longer resolves it as a
    cwd (spawning with cwd="workspace:…" would fail); the refs also
    appear in no argv token."""
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    assert run.report["outcome"] == "observed", run.report
    blob = " ".join(run.recorded_argv)
    assert "session-0001" not in blob
    assert "workspace:run-conformance-0001" not in blob


def test_platform_fallback_never_becomes_a_provider_surface(
    adapter: Adapter, tmp_path: Path
) -> None:
    """Review finding 3: `fallback` is ADR-0007 platform routing policy
    ("refuse", degrade between classes) — the canonical golden now
    declares it, and it must reach no provider flag or value."""
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    argv = run.recorded_argv
    assert "--fallback-model" not in argv, argv
    assert "refuse" not in argv, argv


def test_credentials_reach_the_evidenced_secrecy_control(adapter: Adapter, tmp_path: Path) -> None:
    """Review finding 2 (copilot): every declared credential reference is
    carried into the L6-evidenced `--secret-env-vars` stripping control.
    The claude CLI evidences no such flag, so none may be invented."""
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    argv = run.recorded_argv
    secret_flags = [flag for flag in argv if flag.startswith("--secret-env-vars=")]
    if adapter.name == "copilot-cli":
        assert secret_flags == ["--secret-env-vars=PROVIDER_TOKEN_REF"], argv
    else:
        assert secret_flags == [], argv


def test_provider_environment_is_allowlisted(adapter: Adapter, tmp_path: Path) -> None:
    """Review finding 1: the provider child must receive the baseline plus
    the DECLARED variables — never the adapter's ambient environment. The
    planted undeclared value exists in the adapter's env and must be
    absent from the child; the declared credential must arrive."""
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
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
