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

import hashlib
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
#
# Frozen as EXACT IDENTITIES, never as counts. `len(tracked) >= 40` is satisfied
# by a surface with one config deleted and another added, which is precisely the
# substitution the audit exists to notice. A probe result that says "everything
# passed" ages into a claim about whatever files happen to exist later; naming
# them keeps it a claim about the files that were actually probed.

EVIDENCE = json.loads((REPO / "tests" / "evidence" / "ts7-compatibility-audit.json").read_text())

# Package FAMILIES, not exact names. TypeScript 7 exposes the traditional API
# behind `typescript/unstable/*`, so a subpath import is a real consumer of the
# normal compiler API and an exact-name check would not see it.
NORMAL_COMPILER = "typescript"
COMPATIBILITY_SEAM = "@typescript/typescript6"


def _family(specifier: str, package: str) -> bool:
    return specifier == package or specifier.startswith(f"{package}/")


def _tracked(pattern: str) -> list[str]:
    return subprocess.run(
        ["git", "ls-files", pattern],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    ).stdout.split()


def _compiler_commands() -> dict[tuple[str, str], str]:
    found = {}
    for rel in _tracked("*package.json"):
        for name, body in json.loads((REPO / rel).read_text()).get("scripts", {}).items():
            if re.search(r"\btsc\b", body):
                found[(rel, name)] = body
    return found


VALID_DISPOSITIONS = {
    "TS7_TYPECHECK_PASS",
    "TS7_EMIT_PASS",
    "TS7_CONFIG_PARSE_PASS",
    "COVERED_TRANSITIVELY_BY_PROBED_CONFIG",
    "RETIRED_BEFORE_TS7_CUTOVER",
}


def _compiler_config_surface() -> set[str]:
    """The compiler-config surface, built semantically.

    A glob like `*tsconfig*.json` matches on the whole path, so
    `packages/tsconfig/package.json` was being counted as a TypeScript config
    because of its DIRECTORY name. It is a package manifest; the compiler-command
    inventory governs it. The surface is instead: tracked files whose BASENAME is
    `tsconfig*.json`, plus the shared config JSONs `packages/tsconfig` exports.
    """
    tracked = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.split()
    by_basename = {
        t for t in tracked if Path(t).name.startswith("tsconfig") and t.endswith(".json")
    }
    exports = json.loads((REPO / "packages" / "tsconfig" / "package.json").read_text())["exports"]
    shared = {"packages/tsconfig/" + v.lstrip("./") for v in exports.values()}
    return by_basename | shared


def test_the_compiler_config_surface_is_exactly_the_audited_set() -> None:
    frozen = set(EVIDENCE["surface"]["compilerConfigs"])
    current = _compiler_config_surface()
    assert current == frozen, (
        f"added={sorted(current - frozen)} removed={sorted(frozen - current)} — "
        "the audited compiler surface moved; re-run the 3.1 probe"
    )


def test_a_package_manifest_is_not_a_compiler_config() -> None:
    """The enumeration must be semantic, not a directory-name coincidence."""
    surface = _compiler_config_surface()
    assert "packages/tsconfig/package.json" not in surface
    assert set(EVIDENCE["surface"]["compilerConfigs"]).isdisjoint(
        {"packages/tsconfig/package.json"}
    )
    # It is still governed — as a compiler COMMAND, which is where it belongs.
    commands = {manifest for manifest, _ in _compiler_commands()}
    assert "packages/tsconfig/package.json" in commands


def test_every_frozen_config_has_exactly_one_disposition() -> None:
    """THE COMPLETENESS RULE.

    3.1 completes only when no used compiler surface is untested. A config in the
    frozen surface with no recorded disposition is precisely an untested surface
    that looks audited because it appears in the inventory.
    """
    surface = set(EVIDENCE["surface"]["compilerConfigs"])
    dispositions = EVIDENCE["configDispositions"]

    undispositioned = sorted(surface - set(dispositions))
    assert not undispositioned, f"frozen configs with no coverage disposition: {undispositioned}"
    orphaned = sorted(set(dispositions) - surface)
    assert not orphaned, f"dispositions for configs not in the surface: {orphaned}"

    for path, record in sorted(dispositions.items()):
        assert record["disposition"] in VALID_DISPOSITIONS, (
            f"{path}: unknown disposition {record['disposition']}"
        )
        assert record.get("reason", "").strip(), f"{path}: disposition has no reason"


def test_the_live_compiler_input_of_the_config_package_is_probed() -> None:
    """`packages/tsconfig` runs `tsc --noEmit`, which consumes its own tsconfig.

    That file was in the frozen surface but absent from the probe set — an
    inventory entry standing in for evidence.
    """
    commands = _compiler_commands()
    assert ("packages/tsconfig/package.json", "typecheck") in commands
    record = EVIDENCE["configDispositions"]["packages/tsconfig/tsconfig.json"]
    assert record["disposition"] == "TS7_TYPECHECK_PASS"


@pytest.mark.parametrize(
    "config",
    [
        "packages/tsconfig/base.json",
        "packages/tsconfig/test.json",
        "packages/tsconfig/tsconfig.json",
        "packages/eslint-config/tests/fixtures/tsconfig.json",
        "packages/lint-config/tests/fixtures/tsconfig.json",
        "packages/lint-config/tests/lint-subject/tsconfig.json",
    ],
)
def test_each_named_config_is_explicitly_resolved(config: str) -> None:
    record = EVIDENCE["configDispositions"][config]
    assert record["disposition"] in VALID_DISPOSITIONS


def test_a_surviving_lint_fixture_config_carries_compatibility_evidence() -> None:
    """Only a config the sequencing RETIRES may skip TypeScript 7 evidence.

    `packages/eslint-config/**` is removed by 3.4, which precedes 3.2, so its
    fixture config never meets TypeScript 7. The lint-config fixture configs
    survive the cutover, so retirement is not available to them.
    """
    dispositions = EVIDENCE["configDispositions"]
    assert (
        dispositions["packages/eslint-config/tests/fixtures/tsconfig.json"]["disposition"]
        == "RETIRED_BEFORE_TS7_CUTOVER"
    )
    for surviving in (
        "packages/lint-config/tests/fixtures/tsconfig.json",
        "packages/lint-config/tests/lint-subject/tsconfig.json",
    ):
        assert dispositions[surviving]["disposition"] != "RETIRED_BEFORE_TS7_CUTOVER", (
            f"{surviving} survives the cutover and cannot be dispositioned as retired"
        )
        assert dispositions[surviving]["disposition"].startswith("TS7_")


def test_the_compiler_commands_are_exactly_the_audited_identities() -> None:
    """Identity AND body: a script kept by name but repointed is a substitution."""
    frozen = {
        (c["manifest"], c["script"]): c["body"] for c in EVIDENCE["surface"]["compilerCommands"]
    }
    current = _compiler_commands()
    assert set(current) == set(frozen), (
        f"added={sorted(set(current) - set(frozen))} removed={sorted(set(frozen) - set(current))}"
    )
    changed = {k for k in frozen if current[k] != frozen[k]}
    assert not changed, f"compiler command bodies changed: {sorted(changed)}"


def test_the_compiler_options_are_exactly_the_audited_set() -> None:
    frozen = set(EVIDENCE["surface"]["compilerOptions"])
    current: set[str] = set()
    for rel in sorted(_compiler_config_surface()):
        text = re.sub(r"/\*[\s\S]*?\*/", "", (REPO / rel).read_text())
        text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        try:
            current |= set(json.loads(text).get("compilerOptions", {}))
        except json.JSONDecodeError:
            continue
    assert current == frozen, (
        f"added={sorted(current - frozen)} removed={sorted(frozen - current)} — "
        "an option the cutover must keep working entered or left the surface"
    )


def test_the_generator_commands_are_exactly_the_audited_identities() -> None:
    frozen = {(g["manifest"], g["script"]) for g in EVIDENCE["surface"]["generatorCommands"]}
    current = {k for k in _compiler_commands() if k[1].startswith("generate")}
    assert current == frozen, f"generator surface changed: {sorted(current)}"


def test_the_traditional_compiler_api_has_exactly_one_consumer() -> None:
    """The seam stays a singleton, matched by package FAMILY.

    TypeScript 7's package main exports only `version`/`versionMajorMinor`; the
    traditional API it needs is behind `./unstable/*`. Matching exact names only
    would let `typescript/unstable/sync` become a direct compiler-API consumer
    without being seen.
    """
    report = _report(REPO)
    seam = sorted(
        name
        for name, sites in report.items()
        if any(_family(s, COMPATIBILITY_SEAM) for s in sites["specifiers"])
    )
    assert seam == ["scripts/check-source-imports.mjs"], seam

    direct = sorted(
        name
        for name, sites in report.items()
        if any(
            _family(s, NORMAL_COMPILER) and not _family(s, COMPATIBILITY_SEAM)
            for s in sites["specifiers"]
        )
    )
    assert direct == [], f"direct normal-compiler API consumers exist: {direct}"


@pytest.mark.parametrize(
    ("label", "specifier"),
    [
        ("a TypeScript 7 unstable subpath", "typescript/unstable/sync"),
        ("the normal compiler package", "typescript"),
        ("a compatibility-seam subpath", "@typescript/typescript6/lib/typescript.js"),
        ("the compatibility seam itself", "@typescript/typescript6"),
    ],
)
def test_an_unadmitted_compiler_api_consumer_is_detected(label: str, specifier: str) -> None:
    """Placed in a real member, since that is where the gate governs."""
    planted = REPO / "packages" / "errors" / "src" / "ts7-audit-consumer.ts"
    planted.write_text(f"import * as api from '{specifier}'\nexport const v = api\n")
    try:
        report = _report(REPO)
        rel = "packages/errors/src/ts7-audit-consumer.ts"
        assert rel in report, f"{label}: the planted consumer was not inventoried"
        seen = report[rel]["specifiers"]
        assert specifier in seen, f"{label}: specifier not extracted, got {seen}"
        assert _family(specifier, NORMAL_COMPILER) or _family(specifier, COMPATIBILITY_SEAM), (
            f"{label}: the family match does not classify {specifier}"
        )
    finally:
        planted.unlink()
    assert not planted.exists()


# --- the frozen TypeScript 7.0.2 probe --------------------------------------


def test_the_probe_records_the_exact_compiler_version() -> None:
    assert EVIDENCE["probe"]["version"] == "7.0.2"
    assert EVIDENCE["probe"]["compiler"] == "typescript"


def test_typescript_7_is_not_in_the_repository_dependency_graph() -> None:
    """3.1 audits; it does not adopt. Task 3.2 moves the pin."""
    catalog = (REPO / "pnpm-workspace.yaml").read_text()
    assert re.search(r"^  typescript: 6\.0\.3$", catalog, re.M), (
        "the normal compiler pin moved during the audit task"
    )


def test_the_probed_member_configs_still_exist_exactly() -> None:
    frozen = set(EVIDENCE["probeResults"]["memberTsconfigsTypechecked"])
    tracked = _compiler_config_surface()
    assert frozen <= tracked, f"probed configs no longer tracked: {sorted(frozen - tracked)}"
    current = {
        t
        for t in tracked
        if t.endswith("/tsconfig.json")
        and not t.startswith("packages/tsconfig/")
        and "tests/fixtures" not in t
        and "lint-subject" not in t
    }
    assert current == frozen, (
        f"the member set the probe covered changed: added={sorted(current - frozen)} "
        f"removed={sorted(frozen - current)}"
    )


def test_the_probed_build_configs_still_exist_exactly() -> None:
    frozen = set(EVIDENCE["probeResults"]["buildTsconfigsEmitted"])
    current = {t for t in _compiler_config_surface() if t.endswith("tsconfig.build.json")}
    assert current == frozen, f"added={sorted(current - frozen)} removed={sorted(frozen - current)}"


def test_the_probed_generators_still_exist_exactly() -> None:
    frozen = {(g["manifest"], g["script"]) for g in EVIDENCE["probeResults"]["generatorsCompiled"]}
    current = {k for k in _compiler_commands() if k[1].startswith("generate")}
    assert current == frozen


def test_the_probed_fixture_bytes_are_unchanged() -> None:
    """The probe accepted THESE bytes. Editing a fixture silently re-points it."""
    frozen = EVIDENCE["probeResults"]["ts7LanguageFixtures"]
    current = {
        f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(FIXTURES.glob("*.ts"))
    }
    assert current == frozen, (
        "TypeScript 7 language fixtures changed after the probe accepted them; "
        "re-run the 3.1 probe and update the frozen evidence together"
    )


def test_every_probe_disposition_is_recorded() -> None:
    """The two probe artefacts and the API-shape finding stay written down."""
    subjects = " ".join(d["subject"] for d in EVIDENCE["dispositions"])
    assert "packages/tsconfig/" in subjects
    assert "apps/web" in subjects
    assert "typescript@7.0.2" in subjects
