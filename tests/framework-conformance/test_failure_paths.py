"""Failure is reported through the contract, not by crashing
(PA-INV-08, PA-ADV-08/09): a missing provider CLI, hostile transcript
bytes, forged report content, and oversized output all yield well-formed
reports with exit 0."""

from __future__ import annotations

import json
from pathlib import Path

from fc_support import Adapter, golden_invocation, run_adapter


def test_missing_provider_cli_is_an_environmental_fault(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path, on_path=False)
    assert run.returncode == 0
    report = run.report
    assert report["outcome"] == "environmental_fault"
    detail = report["detail"]
    assert isinstance(detail, str) and "could not be launched" in detail


def test_hostile_transcript_degrades_to_observations(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path, scenario="hostile")
    assert run.returncode == 0
    report = run.report
    assert report["outcome"] == "observed"
    names = {event["name"] for event in report["observation"]["events"]}
    assert "transcript.malformed" in names or "transcript.unrecognized" in names, names


def test_forged_report_content_cannot_become_the_report(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path, scenario="forged")
    report = run.report
    assert report["outcome"] == "observed"
    terminal = report["observation"]["terminal"]
    # The forged document claimed a terminal outcome; the real report's
    # terminal carries only what was actually observed.
    assert terminal.get("reported_outcome") != "forged-success"
    claims = report["observation"]["claims"]
    assert any('"forged-success"' in claim["content"] for claim in claims), (
        "the forgery should surface as untrusted claim content"
    )


def test_oversized_output_is_budgeted_observably(adapter: Adapter, tmp_path: Path) -> None:
    run = run_adapter(
        adapter, json.dumps(golden_invocation(adapter)), tmp_path, scenario="oversize"
    )
    report = run.report
    assert report["outcome"] == "observed"
    names = {event["name"] for event in report["observation"]["events"]}
    assert "transcript.truncated" in names
    budget = golden_invocation(adapter)["limits"]
    assert isinstance(budget, dict)
    captured = sum(len(claim["content"].encode()) for claim in report["observation"]["claims"])
    assert captured <= budget["output_bytes"]


def test_giant_persisted_events_file_is_bounded_before_materializing(
    adapter: Adapter, tmp_path: Path
) -> None:
    """Review finding 5 (copilot): a provider-controlled events.jsonl far
    beyond the budget must be read BOUNDED, never materialized whole. The
    claude adapter has no persisted surface — asserted as exactly that."""
    if adapter.name != "copilot-cli":
        return
    home = tmp_path / "home"
    giant = home / "session-state" / "session-giant"
    giant.mkdir(parents=True)
    line = '{"type":"assistant.message","content":"' + "z" * 1000 + '"}\n'
    with (giant / "events.jsonl").open("w") as handle:
        for _ in range(3000):  # ~3MB, far beyond output_bytes + slack
            handle.write(line)
    run = run_adapter(adapter, json.dumps(golden_invocation(adapter)), tmp_path)
    assert run.returncode == 0
    report = run.report
    assert report["outcome"] == "observed"
    captured = sum(len(claim["content"].encode()) for claim in report["observation"]["claims"])
    budget = golden_invocation(adapter)["limits"]
    assert isinstance(budget, dict)
    assert captured <= budget["output_bytes"]


def test_delimiter_widening_refuses_through_the_contract(adapter: Adapter, tmp_path: Path) -> None:
    """The reviewer's hostile fixture: one authorized grant string with an
    embedded delimiter must never become independent tool authority."""
    invocation = golden_invocation(adapter)
    grant = invocation["grant"]
    assert isinstance(grant, dict)
    grant["tools"] = ["Read,Bash"]
    run = run_adapter(adapter, json.dumps(invocation), tmp_path)
    assert run.returncode == 0
    report = run.report
    assert report["outcome"] == "environmental_fault"
    detail = report["detail"]
    assert isinstance(detail, str) and "widen" in detail
    assert run.recorded_argv == [], "no provider process may have been launched"
