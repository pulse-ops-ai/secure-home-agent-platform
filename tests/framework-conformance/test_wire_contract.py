"""One wire contract, byte-format identical across adapters: one JSON
report on stdout and nothing else, exit 0 whenever a report was emitted,
refusals THROUGH the contract (PA-INV-04/05, PA-MUT-04/05)."""

from __future__ import annotations

import json
from pathlib import Path

from fc_support import Adapter, golden_invocation, run_adapter

OBSERVATION_FIELDS = {"calls", "claims", "events", "terminal", "usage"}


def test_valid_invocation_yields_exactly_one_report(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)

    assert run.returncode == 0, f"stderr: {run.stderr}"
    documents = [line for line in run.stdout.splitlines() if line.strip()]
    assert len(documents) == 1, f"stdout must carry exactly one document: {run.stdout!r}"
    report = json.loads(documents[0])
    assert report["outcome"] == "observed"
    observation = report["observation"]
    assert isinstance(observation, dict)
    assert OBSERVATION_FIELDS.issubset(observation.keys())


def test_report_vocabulary_is_closed(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    assert run.report["outcome"] in {"observed", "environmental_fault", "stale_fence"}
    # No field exists through which an adapter can assert success: the
    # observation carries observations, and nothing else is present.
    assert set(run.report.keys()) == {"outcome", "observation"}


def test_malformed_invocation_refuses_through_the_contract(
    adapter: Adapter, tmp_path: Path
) -> None:
    for hostile in (
        "not json {",
        json.dumps({"unexpected": True}),
        json.dumps({**golden_invocation(adapter, tmp_path), "image": "sneaky:latest"}),
    ):
        run = run_adapter(adapter, hostile, tmp_path)
        assert run.returncode == 0, "a refusal is a report, not a crash"
        report = run.report
        assert report["outcome"] == "environmental_fault"
        detail = report["detail"]
        assert isinstance(detail, str) and detail.startswith("invocation refused:")


def test_stderr_is_never_part_of_the_contract(adapter: Adapter, tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path)
    # Whatever diagnostics exist, the report parses from stdout alone.
    assert json.loads(run.stdout)["outcome"] == "observed"
