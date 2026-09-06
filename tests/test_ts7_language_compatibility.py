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


# Compatibility answers a question about TypeScript 7. Lifecycle answers a
# question about the accepted task sequence. They were one field, which made
# "it is going away" a substitute for "it works" -- two different facts, and a
# config can truthfully carry both.
COMPATIBILITY_RESULTS = {
    "TS7_TYPECHECK_PASS": "typecheckedConfigs",
    "TS7_EMIT_PASS": "emittedConfigs",
    "TS7_CONFIG_PARSE_PASS": "configParsedConfigs",
}
LIFECYCLES = {"SURVIVES_TO_TS7", "RETIRES_IN_3_4"}
RETIREMENT_SCOPE = "packages/eslint-config/"


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


def test_a_package_manifest_is_not_a_compiler_config() -> None:
    """The enumeration must be semantic, not a directory-name coincidence."""
    surface = _compiler_config_surface()
    assert "packages/tsconfig/package.json" not in surface
    assert "packages/tsconfig/package.json" not in EVIDENCE["surface"]["compilerConfigs"]
    # Still governed — as a compiler COMMAND, which is where it belongs.
    commands = {manifest for manifest, _ in _compiler_commands()}
    assert "packages/tsconfig/package.json" in commands


def _command_baseline_problems(
    frozen: dict[tuple[str, str], str],
    current: dict[tuple[str, str], str],
    scope_exists: bool,
) -> list[str]:
    """The lifecycle-aware baseline rule, as a function that can be DRIVEN.

    Extracted from the test that used to inline it. A rule that only ever ran
    against the real tree could be asserted true today and be unable to say
    anything about the cases it exists for -- a command outside the retirement
    scope going quiet, or the retired package's command vanishing while the
    package is still there. Both are exercised below.
    """
    problems: list[str] = []

    added = sorted(set(current) - set(frozen))
    if added:
        problems.append(f"compiler commands appeared after the 3.1 baseline: {added}")

    for manifest, script in sorted(set(frozen) - set(current)):
        if not manifest.startswith(RETIREMENT_SCOPE):
            problems.append(
                f"{manifest}:{script} left the compiler surface, and it is not inside the "
                f"{RETIREMENT_SCOPE}** retirement scope. A command disappearing on its own is "
                "a defect, not a lifecycle"
            )
        elif not scope_exists:
            continue
        else:
            problems.append(
                f"{manifest}:{script} is missing while {RETIREMENT_SCOPE} still exists — that "
                "is a script disappearing, not task 3.4 retiring a package"
            )

    changed = sorted(k for k in frozen if k in current and current[k] != frozen[k])
    if changed:
        problems.append(f"compiler command bodies changed: {changed}")
    return problems


def _frozen_commands() -> dict[tuple[str, str], str]:
    return {
        (c["manifest"], c["script"]): c["body"] for c in EVIDENCE["surface"]["compilerCommands"]
    }


def test_the_compiler_commands_are_exactly_the_audited_identities() -> None:
    """Identity AND body: a script kept by name but repointed is a substitution.

    Lifecycle-aware on the same terms as the config baseline, and for the same
    reason: the 3.1 inventory is historical identity and is never rewritten by
    a later task. A command may be absent ONLY because the package it lives in
    was retired, and only once that retirement actually happened. Everything
    else is unchanged -- a command outside the retirement scope must still
    match byte for byte, and a NEW command is still unreviewed surface whether
    or not anything was retired.
    """
    problems = _command_baseline_problems(
        _frozen_commands(), _compiler_commands(), (REPO / RETIREMENT_SCOPE).exists()
    )
    assert not problems, problems


def test_the_retirement_actually_removed_a_frozen_command() -> None:
    """Otherwise every lifecycle test below is about nothing."""
    inside = {k for k in _frozen_commands() if k[0].startswith(RETIREMENT_SCOPE)}
    assert inside, "the retirement scope held no compiler command"
    assert not (REPO / RETIREMENT_SCOPE).exists(), "the retirement has not happened"
    assert not (inside & set(_compiler_commands())), "the retired commands are still present"


def test_a_non_retired_command_disappearing_is_a_failure() -> None:
    """Mutation: a command outside the retirement scope goes quiet.

    The retirement grants an allowance, and the allowance reaches exactly as
    far as the retirement did. This is the case where a real regression would
    otherwise ride along inside a legitimate removal.
    """
    frozen = _frozen_commands()
    current = _compiler_commands()
    victim = next(k for k in current if not k[0].startswith(RETIREMENT_SCOPE))
    mutated = {k: v for k, v in current.items() if k != victim}
    assert mutated != current, "the mutation did not change the command set"

    problems = _command_baseline_problems(frozen, mutated, scope_exists=False)
    assert any("is not inside the" in p and victim[0] in p for p in problems), problems


def test_the_retired_command_disappearing_alone_is_a_failure() -> None:
    """Mutation: the ESLint typecheck command goes, but its package stays.

    The exact shape of a script being deleted and called a lifecycle. The
    allowance is granted BY the package retirement; with the package still
    present there is no retirement to grant it.
    """
    frozen = _frozen_commands()
    retired = next(k for k in frozen if k[0].startswith(RETIREMENT_SCOPE))
    current = {k: v for k, v in frozen.items() if k != retired}
    assert current != frozen, "the mutation did not change the command set"

    problems = _command_baseline_problems(frozen, current, scope_exists=True)
    assert any("still exists" in p and retired[0] in p for p in problems), problems

    # And the same absence is accepted once the package is genuinely gone.
    assert _command_baseline_problems(frozen, current, scope_exists=False) == []


def test_a_surviving_command_may_not_be_edited_by_a_retirement() -> None:
    """Mutation: a body repointed under cover of the removal.

    Retirement removes commands; it does not license editing the ones that
    remain. A script kept by name and repointed is a substitution, which is the
    property the body comparison exists for.
    """
    frozen = _frozen_commands()
    victim = next(k for k in frozen if not k[0].startswith(RETIREMENT_SCOPE))
    current = dict(frozen)
    current[victim] = f"{frozen[victim]} --different"
    assert current[victim] != frozen[victim], "the mutation did not change the body"

    problems = _command_baseline_problems(frozen, current, scope_exists=False)
    assert any("bodies changed" in p for p in problems), problems


def test_a_new_command_is_unreviewed_surface_even_after_a_retirement() -> None:
    """Mutation: a compiler command appears. Removal does not open the door."""
    frozen = _frozen_commands()
    current = dict(frozen)
    current[("packages/brand-new/package.json", "typecheck")] = "tsc --noEmit"
    assert current != frozen, "the mutation did not change the command set"

    problems = _command_baseline_problems(frozen, current, scope_exists=False)
    assert any("appeared after the 3.1 baseline" in p for p in problems), problems


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


@pytest.mark.parametrize(("compatibility", "result_set"), sorted(COMPATIBILITY_RESULTS.items()))
def test_each_compatibility_claim_matches_its_probe_result_set(
    compatibility: str, result_set: str
) -> None:
    """ONE authority for what was probed.

    `probeResults` and `configDispositions` were two representations of the same
    fact and had already diverged: 18 in one, 20 in the other, kept apart by
    filtering that existed only to preserve the older number. Neither side may
    now claim a success the other does not record.
    """
    claimed = {
        path
        for path, record in EVIDENCE["configDispositions"].items()
        if record["compatibility"] == compatibility
    }
    probed = set(EVIDENCE["probeResults"][result_set])
    assert claimed == probed, (
        f"{compatibility}: claimed-but-not-probed={sorted(claimed - probed)} "
        f"probed-but-not-claimed={sorted(probed - claimed)}"
    )


def test_every_frozen_config_has_exactly_one_compatibility_and_one_lifecycle() -> None:
    """3.1 completes only when no used compiler surface is untested."""
    baseline = set(EVIDENCE["surface"]["compilerConfigs"])
    dispositions = EVIDENCE["configDispositions"]

    assert sorted(dispositions) == sorted(baseline), (
        f"undispositioned={sorted(baseline - set(dispositions))} "
        f"orphaned={sorted(set(dispositions) - baseline)}"
    )
    for path, record in sorted(dispositions.items()):
        assert record["compatibility"] in COMPATIBILITY_RESULTS, path
        assert record["lifecycle"] in LIFECYCLES, path
        assert record.get("compatibilityReason", "").strip(), path


def test_the_probe_result_sets_partition_the_baseline() -> None:
    """Exactly once each: no config probed twice, none missed."""
    baseline = EVIDENCE["surface"]["compilerConfigs"]
    sets = [set(EVIDENCE["probeResults"][name]) for name in COMPATIBILITY_RESULTS.values()]
    union: set[str] = set()
    for s in sets:
        assert union.isdisjoint(s), f"config appears in two probe-result sets: {sorted(union & s)}"
        union |= s
    assert union == set(baseline), (
        f"unprobed={sorted(set(baseline) - union)} extra={sorted(union - set(baseline))}"
    )
    assert len(baseline) == len(set(baseline)), "duplicate identities in the baseline"


def test_only_configs_inside_the_retirement_scope_may_claim_retirement() -> None:
    """Task 3.4 owns exactly `packages/eslint-config/**`."""
    for path, record in sorted(EVIDENCE["configDispositions"].items()):
        if record["lifecycle"] == "RETIRES_IN_3_4":
            assert path.startswith(RETIREMENT_SCOPE), (
                f"{path} claims retirement but is outside {RETIREMENT_SCOPE}, which is the "
                "exact scope task 3.4 owns"
            )
            assert record.get("lifecycleReason", "").strip(), path
    assert EVIDENCE["lifecycle"]["retirementScope"] == "packages/eslint-config/**"
    assert EVIDENCE["lifecycle"]["retiringTask"] == "3.4"


def test_the_frozen_baseline_still_holds_against_the_working_tree() -> None:
    """The 3.1 baseline is historical identity and is never rewritten later.

    Before 3.4 every baseline config exists. After 3.4 a config may be absent
    ONLY if its lifecycle is `RETIRES_IN_3_4` AND the package retirement it
    belongs to actually happened -- one file vanishing on its own is a defect
    wearing a lifecycle's clothes.
    """
    baseline = EVIDENCE["surface"]["compilerConfigs"]
    dispositions = EVIDENCE["configDispositions"]
    current = _compiler_config_surface()

    unknown = sorted(current - set(baseline))
    assert not unknown, (
        f"compiler configs appeared after the 3.1 baseline with no probe evidence: {unknown}"
    )

    eslint_package_retired = not (REPO / "packages" / "eslint-config").exists()
    for path in baseline:
        if path in current:
            continue
        record = dispositions[path]
        assert record["lifecycle"] == "RETIRES_IN_3_4", (
            f"{path} left the surface but is marked {record['lifecycle']}"
        )
        assert eslint_package_retired, (
            f"{path} is missing while packages/eslint-config still exists — that is a file "
            "disappearing, not task 3.4 retiring a package"
        )

    for path, record in dispositions.items():
        if record["lifecycle"] == "SURVIVES_TO_TS7":
            assert path in current, f"{path} must survive to the cutover but is absent"


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


def test_the_live_compiler_input_of_the_config_package_is_probed() -> None:
    """`packages/tsconfig` runs `tsc --noEmit`, which consumes its own tsconfig.

    It sat in the frozen surface but outside the probe set — an inventory entry
    standing in for evidence, and the reason this closure exists.
    """
    assert ("packages/tsconfig/package.json", "typecheck") in _compiler_commands()
    record = EVIDENCE["configDispositions"]["packages/tsconfig/tsconfig.json"]
    assert record["compatibility"] == "TS7_TYPECHECK_PASS"
    assert record["lifecycle"] == "SURVIVES_TO_TS7"
    assert "packages/tsconfig/tsconfig.json" in EVIDENCE["probeResults"]["typecheckedConfigs"]


@pytest.mark.parametrize(
    "config",
    [
        "packages/tsconfig/base.json",
        "packages/tsconfig/test.json",
        "packages/tsconfig/tsconfig.json",
        "packages/eslint-config/tsconfig.json",
        "packages/eslint-config/tests/fixtures/tsconfig.json",
        "packages/lint-config/tests/fixtures/tsconfig.json",
        "packages/lint-config/tests/lint-subject/tsconfig.json",
    ],
)
def test_each_named_config_is_explicitly_resolved(config: str) -> None:
    """Named because each was ambiguous until it was probed or dispositioned."""
    record = EVIDENCE["configDispositions"][config]
    assert record["compatibility"] in COMPATIBILITY_RESULTS
    assert record["lifecycle"] in LIFECYCLES
    # Compatibility is a measured fact even for a config that will retire.
    assert config in EVIDENCE["probeResults"][COMPATIBILITY_RESULTS[record["compatibility"]]]


def test_retiring_configs_still_carry_measured_compatibility() -> None:
    """Retirement is not an excuse for not knowing.

    `packages/eslint-config/**` leaves before the cutover, but "it is going
    away" answers a lifecycle question, not a compatibility one. Both configs
    were probed anyway.
    """
    retiring = {
        path
        for path, record in EVIDENCE["configDispositions"].items()
        if record["lifecycle"] == "RETIRES_IN_3_4"
    }
    assert retiring == {
        "packages/eslint-config/tsconfig.json",
        "packages/eslint-config/tests/fixtures/tsconfig.json",
    }
    for path in retiring:
        record = EVIDENCE["configDispositions"][path]
        assert path in EVIDENCE["probeResults"][COMPATIBILITY_RESULTS[record["compatibility"]]]
