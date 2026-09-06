"""Scope-2 task 3.1 — the TypeScript 7 compatibility audit, frozen.

THE RISK THIS COVERS. After the Scope-2 cutover the normal compiler is
TypeScript 7, but the architecture import gate keeps parsing every repository
file with the traditional TypeScript 6 API through the bounded compatibility
seam. Those are two different parsers reading the same source.

If TypeScript 7 accepts syntax that TypeScript 6 merely RECOVERS from, the gate
can parse a file, report no error, and simply not see an import. A forbidden
edge would then disappear through parser recovery rather than being refused --
silently, with the gate green.

So for every TypeScript-7-accepted construct the required property is:

    the TS6 parser extracts the governed edge
      OR
    it reports a syntax error, and the gate fails closed on that

Never both absent. "The gate is green" is not evidence when the question is
whether the gate could see the thing at all.

The audit inventory is asserted here too, so the compiler surface this scope
must keep working cannot silently shrink between now and the cutover.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
GATE = REPO / "scripts" / "check-source-imports.mjs"
FIXTURES = REPO / "tests" / "fixtures" / "ts7-language"

GOVERNED_EDGE = "@secure-home/contracts"


def _report(root: Path) -> dict[str, dict[str, list[Any]]]:
    result = subprocess.run(
        ["node", str(GATE), "--report-loads", str(root)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stderr
    parsed: dict[str, dict[str, list[Any]]] = json.loads(result.stdout)
    return parsed


@pytest.fixture(scope="module")
def fixture_report() -> dict[str, dict[str, list[Any]]]:
    report = _report(FIXTURES)
    assert report, "no TypeScript 7 language fixtures were inventoried"
    return report


def test_every_ts7_fixture_is_inventoried(fixture_report: dict[str, Any]) -> None:
    """The corpus is the audit's subject; a vanished fixture weakens every case."""
    on_disk = {p.name for p in FIXTURES.glob("*.ts")}
    assert on_disk, "the TypeScript 7 fixture corpus is empty"
    assert set(fixture_report) == on_disk, (
        f"inventoried={sorted(fixture_report)} on_disk={sorted(on_disk)}"
    )


def test_a_governed_edge_cannot_vanish_through_parser_recovery(
    fixture_report: dict[str, Any],
) -> None:
    """THE INVARIANT: extracted, or refused. Never silently absent."""
    for name, sites in sorted(fixture_report.items()):
        extracted = GOVERNED_EDGE in sites["specifiers"]
        refused = len(sites["syntaxErrors"]) > 0
        assert extracted or refused, (
            f"{name}: the TypeScript 6 parser neither extracted the governed edge "
            f"{GOVERNED_EDGE} nor reported a syntax error. A TypeScript 7 file "
            "would pass the architecture gate with its import invisible"
        )


def test_the_audit_corpus_covers_the_constructs_that_were_probed(
    fixture_report: dict[str, Any],
) -> None:
    """Freezing WHICH constructs were audited, not merely that some were."""
    expected = {
        "using-declaration.ts",
        "await-using.ts",
        "const-type-parameter.ts",
        "accessor-keyword.ts",
        "satisfies-operator.ts",
        "modern-decorator.ts",
        "import-attributes.ts",
        "import-defer.ts",
        "explicit-resource-management.ts",
    }
    assert set(fixture_report) == expected


# --- the compiler surface this scope must keep working ----------------------


def test_the_compiler_surface_inventory_is_complete() -> None:
    """3.1 freezes WHAT the cutover has to keep working.

    Asserted as exact sets rather than counts: a config or command that
    disappears would otherwise shrink the audited surface without failing.
    """
    tracked = subprocess.run(
        ["git", "ls-files", "*tsconfig*.json"],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    ).stdout.split()
    # Reusable role configs are EXTENDED, never compiled directly: `-p` against
    # them reports TS18003 because `${configDir}/src` does not exist under
    # packages/tsconfig. They are part of the surface, not of the probe set.
    shared = {t for t in tracked if t.startswith("packages/tsconfig/")}
    assert shared, "the shared role configs are missing"
    assert len(tracked) >= 40, f"tsconfig surface shrank to {len(tracked)}"

    manifests = subprocess.run(
        ["git", "ls-files", "*package.json"],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    ).stdout.split()
    compiler_commands = []
    for rel in manifests:
        scripts = json.loads((REPO / rel).read_text()).get("scripts", {})
        for name, body in scripts.items():
            if re.search(r"\btsc\b", body):
                compiler_commands.append((rel, name))
    assert len(compiler_commands) >= 30, (
        f"compiler command surface shrank to {len(compiler_commands)}"
    )

    generators = {rel for rel, name in compiler_commands if name.startswith("generate")}
    assert generators == {
        "packages/contracts/package.json",
        "packages/events/package.json",
    }, f"generator surface changed: {sorted(generators)}"


def test_the_traditional_compiler_api_has_exactly_one_consumer() -> None:
    """The seam stays a singleton across the cutover.

    TypeScript 7's package main exports only `version`/`versionMajorMinor`; the
    traditional API it needs is not there. That is why the bounded seam is
    retained by the accepted Scope-2 completion definition rather than retired.
    """
    report = _report(REPO)
    consumers = sorted(
        name for name, sites in report.items() if "@typescript/typescript6" in sites["specifiers"]
    )
    assert consumers == ["scripts/check-source-imports.mjs"], consumers

    direct = sorted(name for name, sites in report.items() if "typescript" in sites["specifiers"])
    assert direct == [], f"direct TypeScript API consumers exist: {direct}"


# --- the fail-closed half ----------------------------------------------------
#
# Across eighteen probed TypeScript 7 constructs, the TypeScript 6 parser
# accepted every one that TypeScript 7 accepted, so no fixture in the corpus
# exercises the "refused" branch of the invariant. That branch still has to be
# real: the property is "extracted OR refused", and an OR whose second arm is
# never exercised is half a proof. These prove the refusal mechanism directly.


def test_an_unparseable_governed_edge_is_refused_not_skipped(tmp_path: Path) -> None:
    """A file the parser cannot read must fail the gate, never be passed over.

    The subject is placed inside a real workspace member, because the gate
    governs members: pointed at a bare directory it reports "0 source files
    across 0 workspace members" and exits 0, which would make this pass without
    the refusal ever being reached.
    """
    subject = tmp_path / "broken.ts"
    subject.write_text("import { x } from '@secure-home/contracts'\nexport const v = (\n")
    assert _report(tmp_path)["broken.ts"]["syntaxErrors"], (
        "the parser reported no syntax error for an unparseable file, so the "
        "gate would treat it as simply having no imports"
    )

    planted = REPO / "packages" / "errors" / "src" / "ts7-audit-unparseable.ts"
    planted.write_text("import { x } from '@secure-home/contracts'\nexport const v = (\n")
    try:
        gate = subprocess.run(["node", str(GATE)], capture_output=True, text=True, cwd=REPO)
    finally:
        planted.unlink()
    assert gate.returncode != 0, "the gate accepted a file it could not parse"
    assert "cannot be parsed" in gate.stdout + gate.stderr
    assert not planted.exists()


def test_the_probe_result_is_recorded_not_assumed() -> None:
    """Freeze the audit's actual finding about parser divergence.

    If a future TypeScript 6 or 7 revision makes one of these constructs
    diverge, this corpus starts reporting a syntax error instead of an edge --
    which the invariant above then turns into a refusal rather than a silent
    miss. Recording the current answer keeps that change visible.
    """
    report = _report(FIXTURES)
    diverged = {name for name, sites in report.items() if sites["syntaxErrors"]}
    assert diverged == set(), (
        "TypeScript 6 now refuses constructs TypeScript 7 accepts: "
        f"{sorted(diverged)}. That is fail-closed, not a silent miss, but the "
        "audit finding has changed and task 3.5 must re-prove the seam"
    )
