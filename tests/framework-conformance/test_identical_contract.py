"""ADR-0003's central claim, tested: the same logical run through ANY
adapter produces the identical contract (PA-INV-11). Identical means:
same report grammar, same observation field inventory, same call
dispositions for the same logical events, same adapter-owned event
vocabulary and claim kinds. Provider-native DATA differs by design —
usage stays in native units (ADR-0013 decision 6)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fc_support import ADAPTERS, Adapter, golden_invocation, require_built, run_adapter

# Event names the ADAPTERS own (normalization vocabulary), as opposed to
# names carried through from provider surfaces.
ADAPTER_OWNED_PREFIXES = ("transcript.", "call.")


def _golden_report(adapter: Adapter, tmp_path: Path) -> dict[str, Any]:
    require_built(adapter)
    workspace = tmp_path / f"ws-{adapter.name}"
    workspace.mkdir()
    run = run_adapter(
        adapter, json.dumps(golden_invocation(adapter, workspace)), tmp_path / adapter.name
    )
    report = run.report
    assert report["outcome"] == "observed", report
    return report


@pytest.fixture(scope="module")
def golden_reports(tmp_path_factory: pytest.TempPathFactory) -> dict[str, dict[str, Any]]:
    root = tmp_path_factory.mktemp("golden")
    reports = {}
    for entry in ADAPTERS:
        (root / entry.name).mkdir()
        reports[entry.name] = _golden_report(entry, root)
    return reports


def test_same_report_grammar(golden_reports: dict[str, dict[str, Any]]) -> None:
    shapes = {
        name: (sorted(report.keys()), sorted(report["observation"].keys()))
        for name, report in golden_reports.items()
    }
    first, *rest = shapes.values()
    for other in rest:
        assert other == first, f"report grammar differs across adapters: {shapes}"


def test_same_observation_field_inventory(golden_reports: dict[str, dict[str, Any]]) -> None:
    def inventory(report: dict[str, Any]) -> dict[str, object]:
        observation = report["observation"]
        return {
            "call_fields": sorted({key for call in observation["calls"] for key in call}),
            "claim_fields": sorted({key for claim in observation["claims"] for key in claim}),
            "event_fields": sorted({key for event in observation["events"] for key in event}),
            "usage_fields": sorted({key for measure in observation["usage"] for key in measure}),
            "terminal_fields": sorted(observation["terminal"].keys()),
        }

    inventories = {name: inventory(report) for name, report in golden_reports.items()}
    first, *rest = inventories.values()
    for other in rest:
        assert other == first, f"observation inventory differs: {inventories}"


def test_same_call_dispositions_for_the_same_logical_run(
    golden_reports: dict[str, dict[str, Any]],
) -> None:
    """The golden run is: one granted call succeeds, one ungranted tool is
    denied. Every adapter must surface exactly that disposition sequence —
    the tool NAMES are provider-native data and may differ."""
    dispositions = {
        name: [call["disposition"] for call in report["observation"]["calls"]]
        for name, report in golden_reports.items()
    }
    for name, sequence in dispositions.items():
        assert sequence == ["permitted", "denied"], f"{name}: {sequence}"


def test_same_claim_kinds(golden_reports: dict[str, dict[str, Any]]) -> None:
    kinds = {
        name: sorted({claim["kind"] for claim in report["observation"]["claims"]})
        for name, report in golden_reports.items()
    }
    first, *rest = kinds.values()
    for other in rest:
        assert other == first, f"claim kinds differ: {kinds}"


def test_adapter_owned_event_vocabulary_is_shared(
    golden_reports: dict[str, dict[str, Any]],
) -> None:
    """Names under the adapters' own normalization vocabulary must come
    from one shared set — a per-adapter spelling is contract drift."""
    owned = {
        name: {
            event["name"]
            for event in report["observation"]["events"]
            if event["name"].startswith(ADAPTER_OWNED_PREFIXES)
        }
        for name, report in golden_reports.items()
    }
    shared = {
        "transcript.malformed",
        "transcript.truncated",
        "transcript.unrecognized",
        "transcript.surface_missing",
        "call.unresolved",
        "call.uncorrelated",
    }
    for name, names in owned.items():
        assert names.issubset(shared), f"{name} emits unshared vocabulary: {names - shared}"


def test_usage_stays_native_and_moneyless(golden_reports: dict[str, dict[str, Any]]) -> None:
    for name, report in golden_reports.items():
        units = [measure["unit"] for measure in report["observation"]["usage"]]
        assert units, f"{name}: the golden run reports usage"
        for unit in units:
            assert "usd" not in unit.lower() and "cost" not in unit.lower(), (
                f"{name}: monetary unit {unit!r} — money is not modeled"
            )
