"""Cancellation is EFFECTIVE, not advisory, for every adapter
(PA-INV-04, PA-MUT-12): SIGTERM reaches the provider process, and the
adapter still emits a well-formed report recording the signal. The
copilot stub reproduces the L6 termination finding — CLI-claimed
exitCode 0 beside a 124 process exit — and both must survive
normalization unreconciled (PA-INV-09, PA-ADV-10)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fc_support import Adapter, golden_invocation, run_adapter_cancelling


def _cancelled_report(adapter: Adapter, tmp_path: Path) -> dict[str, Any]:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter_cancelling(
        adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path
    )
    assert run.returncode == 0, f"cancellation must still produce a report: {run.stderr}"
    report = run.report
    assert report["outcome"] == "observed"
    return report


def test_sigterm_reaches_the_provider_and_is_observed(adapter: Adapter, tmp_path: Path) -> None:
    report = _cancelled_report(adapter, tmp_path)
    terminal = report["observation"]["terminal"]
    assert terminal.get("signalled") == "SIGTERM", terminal


def test_terminal_disagreement_is_carried_unreconciled(adapter: Adapter, tmp_path: Path) -> None:
    report = _cancelled_report(adapter, tmp_path)
    terminal = report["observation"]["terminal"]
    if adapter.name == "copilot-cli":
        # The L6 finding, end to end: the stub prints result.exitCode 0,
        # then the PROCESS exits 124. Both facts land, neither wins.
        assert terminal.get("exit_code") == 124, terminal
        assert terminal.get("reported_outcome") == "0", terminal
    else:
        # The claude stub dies silently on SIGTERM: an exit code is
        # observed, and no provider-reported outcome is invented for it.
        assert terminal.get("exit_code") == 143, terminal
        assert "reported_outcome" not in terminal, terminal
