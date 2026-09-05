"""Static invariants of the predecessor-bound maintenance authority.

THE CONTRADICTION THIS COVERS. A maintenance class and a protected-authority
list can disagree without either one looking wrong on its own. The boundary
policy protected ``engine-mappings.json`` as a whole file while the
``lint-engine`` class existed precisely to let per-engine mapping rows move. Read
separately both are reasonable; together they mean no lint-engine update can
ever be admitted, and the failure would surface only the first time somebody
tried to respond to an advisory.

The resolution is not an exception carved around a path-level rule. A projection
is a function over content, so the same file is protected under
``mapping-coverage`` -- every policy keeps a mapping for both engines -- and
permitted under ``mapping-detail``. These tests hold that shape in place.

Behavioural two-revision classification lives in
``packages/lint-config/tests/maintenance-class.test.ts``; this module covers the
properties the policy must hold at rest, plus the fact that this repository
cannot admit itself.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
POLICY_PATH = REPO / "scripts" / "toolchain-boundaries.json"
CHECKER = REPO / "scripts" / "check-toolchain-boundaries.mjs"


@pytest.fixture(scope="module")
def policy() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(POLICY_PATH.read_text())
    return loaded


def _run_checker(policy_text: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run the real checker, optionally against a mutated policy copy."""
    if policy_text is None:
        return subprocess.run(["node", str(CHECKER)], capture_output=True, text=True, cwd=REPO)
    original = POLICY_PATH.read_text()
    try:
        POLICY_PATH.write_text(policy_text)
        return subprocess.run(["node", str(CHECKER)], capture_output=True, text=True, cwd=REPO)
    finally:
        POLICY_PATH.write_text(original)


def test_the_committed_policy_is_self_consistent() -> None:
    result = _run_checker()
    assert result.returncode == 0, result.stderr
    assert "closed maintenance classes" in result.stdout


def test_engine_mappings_is_protected_by_coverage_not_bytes(policy: dict[str, Any]) -> None:
    """The exact contradiction this task resolves."""
    floor = {(entry["path"], entry["projection"]) for entry in policy["protectedProjections"]}
    mappings = "packages/lint-config/engine-mappings.json"
    assert (mappings, "mapping-coverage") in floor
    assert (mappings, "bytes") not in floor, (
        "byte-protecting the mapping file contradicts the lint-engine class, "
        "which exists to let per-engine rows move"
    )


def test_semantic_policy_is_protected_wholesale(policy: dict[str, Any]) -> None:
    """Mapping detail may move; semantic policy may not."""
    floor = {(entry["path"], entry["projection"]) for entry in policy["protectedProjections"]}
    assert ("packages/lint-config/policy.json", "bytes") in floor
    assert ("packages/lint-config/tests/fixtures", "tree-bytes") in floor


def test_no_class_admits_a_change_to_its_own_verifier(policy: dict[str, Any]) -> None:
    verifiers = set(policy["maintenanceVerifierAuthorities"])
    assert verifiers, "the judging authority must be named"
    for klass in policy["maintenanceClasses"]:
        for spec in klass["allowedProjections"]:
            assert spec["path"] not in verifiers, (
                f"class {klass['id']} would admit a change to {spec['path']}, "
                "which is the authority that judges it"
            )


def test_the_composite_class_preserves_every_contributing_protection(
    policy: dict[str, Any],
) -> None:
    classes = {k["id"]: k for k in policy["maintenanceClasses"]}
    composites = [k for k in policy["maintenanceClasses"] if k.get("composite")]
    assert composites, "the coupled compiler/typed-lint case needs a named class"
    for klass in composites:
        assert len(klass.get("composedOf", [])) >= 2
        for parent_id in klass["composedOf"]:
            parent = classes[parent_id]
            for spec in parent.get("protectedProjections", []):
                kept = any(
                    s["path"] == spec["path"] and s["projection"] == spec["projection"]
                    for s in klass.get("protectedProjections", [])
                )
                assert kept, (
                    f"composite {klass['id']} drops {spec['projection']} of "
                    f"{spec['path']} which {parent_id} protects"
                )


def test_coupled_pins_are_reachable_only_through_the_composite(policy: dict[str, Any]) -> None:
    """Neither single class may move both pins; that is what the composite is for."""
    single = [
        k
        for k in policy["maintenanceClasses"]
        if not k.get("composite") and k["id"] in {"normal-compiler", "lint-engine"}
    ]
    for klass in single:
        moved = {
            pkg
            for spec in klass["allowedProjections"]
            if spec["projection"] == "catalog-pins"
            for pkg in spec.get("packages", [])
        }
        assert not {"typescript", "oxlint-tsgolint"} <= moved, (
            f"{klass['id']} alone admits the coupled change"
        )


def test_the_bootstrap_condition_is_a_fact_not_a_status_bit(policy: dict[str, Any]) -> None:
    """PR-B creates this authority under the full proof; it does not use it.

    The condition is that the executable authority must EXIST at the
    predecessor, which becomes true by merging. A ``genesisState`` flag was
    tried first and was wrong: no accepted task defines the transition that
    flips it, so it would have refused the first real candidate forever and
    deadlocked the authority it was meant to protect.
    """
    assert "genesisState" not in policy
    assert policy["maintenanceVerifierAuthorities"], "the bootstrap fact needs named paths"


def test_every_protected_path_exists_or_is_the_planned_verifier(policy: dict[str, Any]) -> None:
    planned = {".github/workflows/toolchain-maintenance-boundary.yml"}
    for entry in policy["protectedProjections"]:
        path = REPO / entry["path"]
        assert path.exists() or entry["path"] in planned, (
            f"the floor protects {entry['path']}, which does not exist"
        )


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        (
            "a class admits a change to the verifier",
            lambda p: p["maintenanceClasses"][0]["allowedProjections"].append(
                {"path": "scripts/check-toolchain-boundaries.mjs", "projection": "bytes"}
            ),
        ),
        (
            "the floor byte-protects a file a class must move",
            lambda p: p["protectedProjections"].append(
                {
                    "path": "packages/lint-config/engine-mappings.json",
                    "projection": "bytes",
                }
            ),
        ),
        (
            "the composite drops a contributing protection",
            lambda p: p["maintenanceClasses"][3].__setitem__("protectedProjections", []),
        ),
        (
            "a composite names a class that does not exist",
            lambda p: p["maintenanceClasses"][3].__setitem__(
                "composedOf", ["normal-compiler", "no-such-class"]
            ),
        ),
        (
            "no verifier authority is named",
            lambda p: p.__setitem__("maintenanceVerifierAuthorities", []),
        ),
    ],
)
def test_the_checker_refuses_a_contradictory_policy(
    label: str, mutate: Callable[[dict[str, Any]], None]
) -> None:
    """Each mutation must be REFUSED. A checker that passes them checks nothing."""
    mutated = json.loads(POLICY_PATH.read_text())
    mutate(mutated)
    assert mutated != json.loads(POLICY_PATH.read_text()), (
        f"{label}: the mutation did not change the policy, so it is not evidence"
    )
    result = _run_checker(json.dumps(mutated, indent=2))
    assert result.returncode != 0, f"{label} survived: {result.stdout}"


# --- two-revision classification -------------------------------------------
#
# Driven through the real CLI rather than by importing the module. `scripts/` is
# not a workspace member, so a package test that reached into it would breach the
# architecture import gate -- and a plan file is what the trusted boundary will
# actually hand over in task 1.16: candidate content as inert data.

LC = "packages/lint-config/"
MAINTENANCE_WORKFLOW = ".github/workflows/toolchain-maintenance-boundary.yml"


def _mappings(replacement_rule: str, rows: tuple[str, ...] = ("no-var",)) -> str:
    return json.dumps(
        {
            "mappings": [
                row
                for policy in rows
                for row in (
                    {
                        "policy": policy,
                        "engine": "legacy",
                        "mechanism": "rule",
                        "ruleName": policy,
                    },
                    {
                        "policy": policy,
                        "engine": "replacement",
                        "mechanism": "rule",
                        "ruleName": replacement_rule,
                    },
                )
            ]
        }
    )


def _catalog(pins: dict[str, str]) -> str:
    body = "\n".join(f"  {name}: {version}" for name, version in pins.items())
    return f"packages:\n  - packages/*\n\ncatalog:\n{body}\n"


DIRECT_DEPENDENCIES = {"oxlint", "oxlint-tsgolint", "typescript", "eslint"}


def _lock(
    packages: dict[str, list[str]],
    catalog: dict[str, str] | None = None,
    integrity: dict[str, str] | None = None,
    settings: str = "  autoInstallPeers: true",
) -> str:
    """A lockfile in real pnpm shape.

    The earlier fixture emitted only ``snapshots:``, which is why an entire
    class of hostile edit was invisible: ``packages:`` carries the resolution
    and integrity that decide what is actually fetched, ``catalogs:`` and
    ``importers:`` move when a pin moves, and the settings decide how resolution
    behaves. None of that is dependency topology.
    """
    integrity = integrity or {}
    if catalog is None:
        # Only DIRECT dependencies appear in `catalogs:` and `importers:`. A
        # transitive package like a native binding is resolved, not declared,
        # so listing it here would make an authorized bump look like unrelated
        # catalog drift.
        catalog = {}
        for key in packages:
            at = key.rfind("@")
            name = key[:at]
            if name in DIRECT_DEPENDENCIES:
                catalog[name] = key[at + 1 :]

    lines = ["lockfileVersion: '9.0'", "", "settings:", settings, "", "catalogs:", "  default:"]
    for name, version in catalog.items():
        lines += [f"    {name}:", f"      specifier: {version}", f"      version: {version}"]

    lines += ["", "importers:", "  .:", "    devDependencies:"]
    for name, version in catalog.items():
        lines += [f"      {name}:", "        specifier: 'catalog:'", f"        version: {version}"]

    lines += ["", "packages:"]
    for key in packages:
        digest = integrity.get(key, f"sha512-{key.replace('@', '-')}==")
        lines += [f"  {key}:", f"    resolution: {{integrity: {digest}}}"]

    lines += ["", "snapshots:"]
    for key, deps in packages.items():
        if not deps:
            lines.append(f"  {key}: {{}}")
            continue
        lines.append(f"  {key}:")
        lines.append("    dependencies:")
        for dep in deps:
            at = dep.rfind("@")
            lines.append(f"      {dep[:at]}: {dep[at + 1 :]}")
    return "\n".join(lines) + "\n"


MERGED_POLICY: dict[str, Any] = {
    "schemaVersion": 1,
    "maintenanceVerifierAuthorities": [
        "scripts/check-toolchain-boundaries.mjs",
        ".github/workflows/toolchain-maintenance-boundary.yml",
    ],
    "protectedProjections": [
        {"path": f"{LC}policy.json", "projection": "bytes"},
        {"path": f"{LC}engine-mappings.json", "projection": "mapping-coverage"},
        {"path": f"{LC}tests/fixtures", "projection": "tree-bytes"},
        {"path": "packages/tsconfig", "projection": "tree-bytes"},
        {"path": "scripts/toolchain-boundaries.json", "projection": "bytes"},
    ],
    "maintenanceClasses": [
        {
            "id": "lint-engine",
            "allows": ["engine pin", "mapping rows"],
            "allowedProjections": [
                {
                    "path": f"{LC}engine-mappings.json",
                    "projection": "mapping-detail",
                    "engines": ["replacement"],
                },
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "catalog-pins",
                    "packages": ["oxlint"],
                },
                {
                    "path": "pnpm-lock.yaml",
                    "projection": "lock-closure",
                    "packages": ["oxlint"],
                },
                {"path": f"{LC}generated", "projection": "tree-bytes"},
            ],
            "protectedProjections": [
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "file-except-catalog-pins",
                    "packages": ["oxlint"],
                },
                {
                    "path": "pnpm-lock.yaml",
                    "projection": "lock-except-closure",
                    "packages": ["oxlint"],
                },
            ],
            "lockRoots": ["oxlint"],
        },
        {
            "id": "normal-compiler",
            "allows": ["compiler pin"],
            "allowedProjections": [
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "catalog-pins",
                    "packages": ["typescript"],
                }
            ],
            "protectedProjections": [
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "file-except-catalog-pins",
                    "packages": ["typescript"],
                }
            ],
        },
        {
            "id": "normal-compiler-and-typed-lint",
            "composite": True,
            "composedOf": ["normal-compiler", "lint-engine"],
            "allows": ["coupled pins"],
            "allowedProjections": [
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "catalog-pins",
                    "packages": ["typescript", "oxlint-tsgolint"],
                }
            ],
            "protectedProjections": [
                {
                    "path": "pnpm-workspace.yaml",
                    "projection": "file-except-catalog-pins",
                    "packages": ["typescript", "oxlint-tsgolint"],
                }
            ],
        },
    ],
}


def _base_files() -> dict[str, str]:
    return {
        "scripts/toolchain-boundaries.json": json.dumps(MERGED_POLICY),
        f"{LC}policy.json": json.dumps({"policies": [{"id": "no-var", "roles": ["library"]}]}),
        f"{LC}engine-mappings.json": _mappings("no-var"),
        f"{LC}generated/oxlintrc.library.json": '{"rules":{"no-var":"error"}}',
        f"{LC}tests/fixtures/core-policy/invalid/no-var.ts": "var x = 1\n",
        f"{LC}tests/fixtures/_negative-controls/invalid/no-var.ts": "var y = 2\n",
        "packages/tsconfig/base.json": '{"compilerOptions":{"strict":true}}',
        "pnpm-workspace.yaml": _catalog(
            {
                "typescript": "6.0.3",
                "oxlint": "1.80.0",
                "oxlint-tsgolint": "7.0.2001",
                "eslint": "10.8.0",
            }
        ),
        "pnpm-lock.yaml": _lock(
            {
                "oxlint@1.80.0": ["oxc-parser@1.0.0"],
                "oxc-parser@1.0.0": [],
                "eslint@10.8.0": [],
            }
        ),
        "scripts/check-toolchain-boundaries.mjs": "// verifier bytes\n",
        f"{LC}src/check-install-posture.mjs": "// native identity checker\n",
        MAINTENANCE_WORKFLOW: "# trusted boundary bytes\n",
    }


def _with(overrides: Mapping[str, str | None]) -> dict[str, str]:
    files = _base_files()
    for key, value in overrides.items():
        if value is None:
            files.pop(key, None)
        else:
            files[key] = value
    return files


def _classify(
    tmp_path: Path,
    candidate_files: dict[str, str],
    class_id: str = "lint-engine",
    predecessor_files: dict[str, str] | None = None,
    universe: list[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    predecessor = _base_files() if predecessor_files is None else predecessor_files
    plan = {
        "classId": class_id,
        "predecessor": {"id": "predecessor", "files": predecessor},
        "candidate": {"id": "candidate", "files": candidate_files},
        "universe": sorted(set(predecessor) | set(candidate_files))
        if universe is None
        else universe,
    }
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(json.dumps(plan))
    return subprocess.run(
        ["node", str(CHECKER), "--plan", str(plan_path)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )


def test_admits_an_engine_pin_with_a_legitimate_mapping_update(tmp_path: Path) -> None:
    result = _classify(
        tmp_path,
        _with(
            {
                "pnpm-workspace.yaml": _catalog(
                    {
                        "typescript": "6.0.3",
                        "oxlint": "1.81.0",
                        "oxlint-tsgolint": "7.0.2001",
                        "eslint": "10.8.0",
                    }
                ),
                f"{LC}engine-mappings.json": _mappings("no-var-renamed"),
                "pnpm-lock.yaml": _lock(
                    {
                        "oxlint@1.81.0": ["oxc-parser@1.1.0"],
                        "oxc-parser@1.1.0": [],
                        "eslint@10.8.0": [],
                    }
                ),
            }
        ),
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["classId"] == "lint-engine"


def test_admits_a_change_that_moves_nothing(tmp_path: Path) -> None:
    result = _classify(tmp_path, _base_files())
    assert result.returncode == 0, result.stderr


def test_admits_the_coupled_change_only_through_the_composite(tmp_path: Path) -> None:
    coupled = _with(
        {
            "pnpm-workspace.yaml": _catalog(
                {
                    "typescript": "7.0.3",
                    "oxlint": "1.80.0",
                    "oxlint-tsgolint": "7.0.2002",
                    "eslint": "10.8.0",
                }
            )
        }
    )
    for single in ("normal-compiler", "lint-engine"):
        refused = _classify(tmp_path, coupled, class_id=single)
        assert refused.returncode != 0, f"{single} alone admitted the coupled change"

    admitted = _classify(tmp_path, coupled, class_id="normal-compiler-and-typed-lint")
    assert admitted.returncode == 0, admitted.stderr
    assert json.loads(admitted.stdout)["composite"] is True


@pytest.mark.parametrize(
    ("label", "candidate", "class_id", "expected_code"),
    [
        (
            "policy row and its only fixture deleted together",
            lambda: _with(
                {
                    f"{LC}policy.json": json.dumps({"policies": []}),
                    f"{LC}engine-mappings.json": _mappings("no-var", ()),
                    f"{LC}tests/fixtures/core-policy/invalid/no-var.ts": None,
                    f"{LC}tests/fixtures/_negative-controls/invalid/no-var.ts": None,
                }
            ),
            "lint-engine",
            "UNDECLARED_CHANGE",
        ),
        (
            "a policy loses its mapping while the file legitimately changes",
            lambda: _with(
                {
                    f"{LC}engine-mappings.json": json.dumps(
                        {
                            "mappings": [
                                {
                                    "policy": "no-var",
                                    "engine": "legacy",
                                    "mechanism": "rule",
                                    "ruleName": "no-var",
                                }
                            ]
                        }
                    )
                }
            ),
            "lint-engine",
            "PROTECTED_DRIFT",
        ),
        (
            "a weakened semantic role assignment",
            lambda: _with(
                {f"{LC}policy.json": json.dumps({"policies": [{"id": "no-var", "roles": []}]})}
            ),
            "lint-engine",
            "UNDECLARED_CHANGE",
        ),
        (
            "a protected fixture byte changes",
            lambda: _with({f"{LC}tests/fixtures/core-policy/invalid/no-var.ts": "let x = 1\n"}),
            "lint-engine",
            "UNDECLARED_CHANGE",
        ),
        (
            "a compiler pin that also relaxes compiler policy",
            lambda: _with(
                {
                    "pnpm-workspace.yaml": _catalog(
                        {"typescript": "6.0.4", "oxlint": "1.80.0", "eslint": "10.8.0"}
                    ),
                    "packages/tsconfig/base.json": '{"compilerOptions":{"strict":false}}',
                }
            ),
            "normal-compiler",
            "UNDECLARED_CHANGE",
        ),
        (
            "an unknown class",
            _base_files,
            "whatever-i-like",
            "UNKNOWN_CLASS",
        ),
        (
            "the candidate edits its own class to widen authority",
            lambda: _with(
                {
                    "scripts/toolchain-boundaries.json": json.dumps(
                        {
                            **MERGED_POLICY,
                            "maintenanceClasses": [
                                {
                                    **MERGED_POLICY["maintenanceClasses"][0],
                                    "allowedProjections": [
                                        *MERGED_POLICY["maintenanceClasses"][0][
                                            "allowedProjections"
                                        ],
                                        {"path": f"{LC}policy.json", "projection": "bytes"},
                                    ],
                                },
                                *MERGED_POLICY["maintenanceClasses"][1:],
                            ],
                        }
                    ),
                    f"{LC}policy.json": json.dumps({"policies": []}),
                }
            ),
            "lint-engine",
            "UNDECLARED_CHANGE",
        ),
        (
            "lockfile movement outside the derived closure",
            lambda: _with(
                {
                    "pnpm-workspace.yaml": _catalog(
                        {
                            "typescript": "6.0.3",
                            "oxlint": "1.81.0",
                            "oxlint-tsgolint": "7.0.2001",
                            "eslint": "10.8.0",
                        }
                    ),
                    "pnpm-lock.yaml": _lock(
                        {
                            "oxlint@1.81.0": ["oxc-parser@1.0.0"],
                            "oxc-parser@1.0.0": [],
                            "eslint@10.8.0": ["something-new@9.9.9"],
                            "something-new@9.9.9": [],
                        }
                    ),
                }
            ),
            "lint-engine",
            "LOCK_MOVEMENT_OUTSIDE_CLOSURE",
        ),
        (
            "a change to the authority that judges it",
            lambda: _with({"scripts/check-toolchain-boundaries.mjs": "// rewritten\n"}),
            "lint-engine",
            "UNDECLARED_CHANGE",
        ),
    ],
)
def test_a_maintenance_claim_fails_closed(
    tmp_path: Path,
    label: str,
    candidate: Callable[[], dict[str, str]],
    class_id: str,
    expected_code: str,
) -> None:
    result = _classify(tmp_path, candidate(), class_id=class_id)
    assert result.returncode != 0, f"{label} was admitted"
    assert json.loads(result.stderr)["code"] == expected_code, label


def test_the_verifier_is_protected_even_if_the_caller_omits_it(tmp_path: Path) -> None:
    """The caller supplies the universe, so a narrow one must not hide tampering."""
    result = _classify(
        tmp_path,
        _with({"scripts/check-toolchain-boundaries.mjs": "// rewritten\n"}),
        universe=[p for p in _base_files() if p != "scripts/check-toolchain-boundaries.mjs"],
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_an_unresolvable_predecessor_fails_closed(tmp_path: Path) -> None:
    result = _classify(tmp_path, _base_files(), predecessor_files={})
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "UNREADABLE_AUTHORITY"


def test_an_unreadable_predecessor_policy_fails_closed(tmp_path: Path) -> None:
    result = _classify(
        tmp_path,
        _base_files(),
        predecessor_files={"scripts/toolchain-boundaries.json": "{ not json"},
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "MALFORMED_AUTHORITY"


def test_a_predecessor_without_the_verifier_admits_nothing(tmp_path: Path) -> None:
    """The bootstrap condition, and the reason PR-B cannot self-admit.

    PR-B is judged against a predecessor that does not yet contain the
    maintenance workflow, because that workflow only reaches the default branch
    by merging PR-B. So there is no revision at which PR-B can be admitted by
    the authority it is creating.
    """
    predecessor = _base_files()
    del predecessor[MAINTENANCE_WORKFLOW]
    result = _classify(tmp_path, _base_files(), predecessor_files=predecessor)
    assert result.returncode != 0
    refusal = json.loads(result.stderr)
    assert refusal["code"] == "PREDECESSOR_LACKS_VERIFIER"
    assert MAINTENANCE_WORKFLOW in refusal["message"]


def test_the_same_claim_is_admitted_once_the_verifier_has_merged(tmp_path: Path) -> None:
    """The deadlock check: the refusal above must be resolvable BY MERGING.

    A status bit would not be -- nothing in the accepted tasks flips it -- so
    the first real maintenance candidate could never be admitted.
    """
    result = _classify(tmp_path, _base_files())
    assert result.returncode == 0, result.stderr


def test_roots_that_resolve_to_nothing_fail_closed(tmp_path: Path) -> None:
    policy = json.loads(json.dumps(MERGED_POLICY))
    policy["maintenanceClasses"][0]["lockRoots"] = ["not-a-real-package"]
    predecessor = {**_base_files(), "scripts/toolchain-boundaries.json": json.dumps(policy)}
    candidate = {
        **predecessor,
        "pnpm-lock.yaml": _lock({"oxlint@1.81.0": [], "eslint@10.8.0": []}),
    }
    result = _classify(tmp_path, candidate, predecessor_files=predecessor)
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "MALFORMED_AUTHORITY"


# --- the readers, grounded in the repository's own lockfile -----------------


@pytest.fixture(scope="module")
def real_lock() -> dict[str, Any]:
    result = subprocess.run(
        [
            "node",
            str(CHECKER),
            "--inspect-lock",
            "pnpm-lock.yaml",
            "--roots",
            "oxlint,typescript,oxlint-tsgolint,@typescript/typescript6",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stderr
    parsed: dict[str, Any] = json.loads(result.stdout)
    return parsed


def test_the_real_lockfile_parses_with_no_dangling_edge(real_lock: dict[str, Any]) -> None:
    """Synthetic fixtures hid an inline-empty snapshot form and an alias edge."""
    assert real_lock["snapshots"] > 300
    assert real_lock["dangling"] == []


@pytest.mark.parametrize(
    ("root", "expected_member"),
    [
        ("oxlint", "oxlint@1.80.0(oxlint-tsgolint@7.0.2001)"),
        ("typescript", "typescript@6.0.3"),
        ("oxlint-tsgolint", "oxlint-tsgolint@7.0.2001"),
        ("@typescript/typescript6", "@typescript/typescript6@6.0.2"),
    ],
)
def test_real_roots_derive_a_non_empty_closure(
    real_lock: dict[str, Any], root: str, expected_member: str
) -> None:
    closure = real_lock["closure"][root]
    assert closure, f"{root} resolved to nothing"
    assert expected_member in closure


def test_an_aliased_dependency_resolves_to_its_real_target(real_lock: dict[str, Any]) -> None:
    """The compatibility package aliases the real compiler."""
    assert real_lock["closure"]["@typescript/typescript6"] == [
        "@typescript/typescript6@6.0.2",
        "typescript@6.0.3",
    ]


def test_a_union_of_two_classes_is_refused(tmp_path: Path) -> None:
    """Classes are a CLOSED set. A coupled change needs one named composite,
    not two classes added together -- otherwise every protection is escapable
    by naming a second class that happens to permit the thing the first forbids.
    """
    plan = {
        "classId": ["lint-engine", "normal-compiler"],
        "predecessor": {"id": "predecessor", "files": _base_files()},
        "candidate": {"id": "candidate", "files": _base_files()},
        "universe": sorted(_base_files()),
    }
    plan_path = tmp_path / "union.json"
    plan_path.write_text(json.dumps(plan))
    result = subprocess.run(
        ["node", str(CHECKER), "--plan", str(plan_path)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "CLASS_COMPOSITION_REFUSED"


# --- the canonical instance is bound to its schema --------------------------
#
# A stale top-level ``protectedAuthorities`` from the superseded path-level model
# survived an entire landing. The schema forbade it (``additionalProperties:
# false``) and all 25 gates stayed green, because the checker parsed the JSON and
# checked its internal consistency without ever validating it against the schema,
# and the schema suite validated synthetic minimal documents instead of this one.


def test_the_committed_document_validates_against_its_schema() -> None:
    result = _run_checker()
    assert result.returncode == 0, result.stderr


def test_no_field_from_the_superseded_path_level_model_remains(policy: dict[str, Any]) -> None:
    assert "protectedAuthorities" not in policy, (
        "the path-level model is superseded; keeping the field recreates the "
        "ambiguity that projections resolved, and 1.16's trusted verifier could "
        "start consulting it"
    )
    assert "protectedProjections" in policy


@pytest.mark.parametrize(
    ("label", "mutate", "expected"),
    [
        (
            "an unknown top-level field is reintroduced",
            lambda p: p.__setitem__("protectedAuthorities", ["packages/lint-config/policy.json"]),
            "protectedAuthorities",
        ),
        (
            "a required projection field is deleted",
            lambda p: p["protectedProjections"][0].pop("projection"),
            "projection",
        ),
        (
            "an unknown projection property is added",
            lambda p: p["protectedProjections"][0].__setitem__("exceptWhen", "convenient"),
            "exceptWhen",
        ),
        (
            "a class loses its exact projections",
            lambda p: p["maintenanceClasses"][0].pop("allowedProjections"),
            "allowedProjections",
        ),
        (
            "an unknown projection kind is used",
            lambda p: p["protectedProjections"][0].__setitem__("projection", "trust-me"),
            "trust-me",
        ),
    ],
)
def test_the_checker_refuses_a_schema_invalid_instance(
    label: str, mutate: Callable[[dict[str, Any]], None], expected: str
) -> None:
    mutated = json.loads(POLICY_PATH.read_text())
    mutate(mutated)
    assert mutated != json.loads(POLICY_PATH.read_text()), (
        f"{label}: the mutation did not change the document, so it is not evidence"
    )
    result = _run_checker(json.dumps(mutated, indent=2))
    assert result.returncode != 0, f"{label} was accepted"
    assert expected in result.stderr, f"{label}: {result.stderr}"


# --- legitimate maintenance must be ADMITTED --------------------------------
#
# A boundary that refuses everything is not a boundary, it is an outage. These
# are the updates the classes exist to permit, and they were missing: pinning
# every command input to the predecessor deadlocked exactly the change each
# class is for, because the pin a class may move is also an input it was told
# not to move.


def test_a_real_lint_engine_update_is_admitted(tmp_path: Path) -> None:
    """Engine pin + mapping detail + regenerated config, all at once."""
    result = _classify(
        tmp_path,
        _with(
            {
                "pnpm-workspace.yaml": _catalog(
                    {
                        "typescript": "6.0.3",
                        "oxlint": "1.81.0",
                        "oxlint-tsgolint": "7.0.2001",
                        "eslint": "10.8.0",
                    }
                ),
                f"{LC}engine-mappings.json": _mappings("no-var-renamed"),
                # The generated projection is explicitly allowed to move.
                f"{LC}generated/oxlintrc.library.json": '{"rules":{"no-var":"deny"}}',
                "pnpm-lock.yaml": _lock(
                    {
                        "oxlint@1.81.0": ["oxc-parser@1.1.0"],
                        "oxc-parser@1.1.0": [],
                        "eslint@10.8.0": [],
                    }
                ),
            }
        ),
    )
    assert result.returncode == 0, result.stderr


def test_a_real_compiler_pin_update_is_admitted(tmp_path: Path) -> None:
    result = _classify(
        tmp_path,
        _with(
            {
                "pnpm-workspace.yaml": _catalog(
                    {
                        "typescript": "6.0.4",
                        "oxlint": "1.80.0",
                        "oxlint-tsgolint": "7.0.2001",
                        "eslint": "10.8.0",
                    }
                )
            }
        ),
        class_id="normal-compiler",
    )
    assert result.returncode == 0, result.stderr


# --- trusted control installs from this file, so all of it is bound ---------


def test_a_non_catalog_workspace_change_is_refused(tmp_path: Path) -> None:
    """Only the selected pin VALUES may move.

    Trusted control runs a package manager against this file, so workspace
    globs, install posture and configuration-plugin settings are as
    security-relevant as the pins. Comparing catalog entries alone left every
    other byte unbound.
    """
    moved = _catalog(
        {
            "typescript": "6.0.3",
            "oxlint": "1.81.0",
            "oxlint-tsgolint": "7.0.2001",
            "eslint": "10.8.0",
        }
    )
    result = _classify(
        tmp_path,
        _with(
            {"pnpm-workspace.yaml": moved.replace("  - packages/*", "  - packages/*\n  - evil/*")}
        ),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_moving_an_unselected_pin_is_refused(tmp_path: Path) -> None:
    result = _classify(
        tmp_path,
        _with(
            {
                "pnpm-workspace.yaml": _catalog(
                    {
                        "typescript": "7.0.0",
                        "oxlint": "1.81.0",
                        "oxlint-tsgolint": "7.0.2001",
                        "eslint": "10.8.0",
                    }
                )
            }
        ),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_a_candidate_pnpmfile_is_refused_before_installation(tmp_path: Path) -> None:
    """`--ignore-scripts` does not make installation inert.

    pnpm supports executable `.pnpmfile.cjs`/`.pnpmfile.mjs` install hooks --
    readPackage, updateConfig, preResolution, custom resolvers and fetchers --
    which run during resolution regardless of that flag. Trusted control now
    classifies BEFORE installing, so a candidate carrying hook code never
    reaches the package manager; `--ignore-pnpmfile` is the second layer.
    """
    result = _classify(
        tmp_path,
        _with({".pnpmfile.mjs": "export function readPackage(pkg) { return pkg }\n"}),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "UNDECLARED_CHANGE"
    assert ".pnpmfile.mjs" in json.loads(result.stderr)["message"]


def test_adding_a_brand_new_catalog_pin_is_refused(tmp_path: Path) -> None:
    """Selecting a package permits moving its VALUE, not introducing it.

    A new catalog entry is a new dependency, which is a policy decision rather
    than tool maintenance.
    """
    result = _classify(
        tmp_path,
        _with(
            {
                "pnpm-workspace.yaml": _catalog(
                    {
                        "typescript": "6.0.3",
                        "oxlint": "1.80.0",
                        "oxlint-tsgolint": "7.0.2001",
                        "eslint": "10.8.0",
                        "something-new": "1.0.0",
                    }
                )
            }
        ),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


# --- the lockfile binds what gets INSTALLED, not just dependency topology ----
#
# Trusted control now installs from candidate lock bytes, so the records that
# decide what is fetched are security-relevant. The earlier projection compared
# only the `snapshots:` dependency graph, and the earlier fixture emitted only
# that section -- so a candidate could repoint an unrelated package's integrity
# while every edge stayed identical, and nothing looked at it.

BINDING = "@oxlint/binding-linux-x64"


def _engine_update(**overrides: str) -> dict[str, str]:
    """An authorized oxlint bump, with its derived native binding."""
    files = {
        "pnpm-workspace.yaml": _catalog(
            {
                "typescript": "6.0.3",
                "oxlint": "1.81.0",
                "oxlint-tsgolint": "7.0.2001",
                "eslint": "10.8.0",
            }
        ),
        "pnpm-lock.yaml": _lock(
            {
                "oxlint@1.81.0": [f"{BINDING}@1.81.0"],
                f"{BINDING}@1.81.0": [],
                "eslint@10.8.0": [],
            }
        ),
    }
    files.update(overrides)
    return _with(files)


def _base_with_binding() -> dict[str, str]:
    files = _base_files()
    files["pnpm-lock.yaml"] = _lock(
        {
            "oxlint@1.80.0": [f"{BINDING}@1.80.0"],
            f"{BINDING}@1.80.0": [],
            "eslint@10.8.0": [],
        }
    )
    return files


def test_an_engine_bump_moves_its_derived_native_binding(tmp_path: Path) -> None:
    """Inside the authorized closure, resolution and integrity may move."""
    result = _classify(tmp_path, _engine_update(), predecessor_files=_base_with_binding())
    assert result.returncode == 0, result.stderr


def test_an_unrelated_integrity_change_is_refused(tmp_path: Path) -> None:
    """Snapshots unchanged, one integrity repointed -- the hostile shape.

    This is what dependency-edge comparison could not see.
    """
    hostile = _lock(
        {
            "oxlint@1.81.0": [f"{BINDING}@1.81.0"],
            f"{BINDING}@1.81.0": [],
            "eslint@10.8.0": [],
        },
        integrity={"eslint@10.8.0": "sha512-FORGEDFORGEDFORGED=="},
    )
    result = _classify(
        tmp_path,
        _engine_update(**{"pnpm-lock.yaml": hostile}),
        predecessor_files=_base_with_binding(),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_an_unrelated_importer_change_is_refused(tmp_path: Path) -> None:
    smuggled = _lock(
        {
            "oxlint@1.81.0": [f"{BINDING}@1.81.0"],
            f"{BINDING}@1.81.0": [],
            "eslint@10.8.0": [],
        },
        catalog={"oxlint": "1.81.0", "eslint": "10.8.0", "something-new": "9.9.9"},
    )
    result = _classify(
        tmp_path,
        _engine_update(**{"pnpm-lock.yaml": smuggled}),
        predecessor_files=_base_with_binding(),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_a_lockfile_settings_change_is_refused(tmp_path: Path) -> None:
    """Settings decide how resolution behaves, so they are predecessor-bound."""
    relaxed = _lock(
        {
            "oxlint@1.81.0": [f"{BINDING}@1.81.0"],
            f"{BINDING}@1.81.0": [],
            "eslint@10.8.0": [],
        },
        settings="  autoInstallPeers: false",
    )
    result = _classify(
        tmp_path,
        _engine_update(**{"pnpm-lock.yaml": relaxed}),
        predecessor_files=_base_with_binding(),
    )
    assert result.returncode != 0
    assert json.loads(result.stderr)["code"] == "PROTECTED_DRIFT"


def test_tampering_with_the_native_identity_checker_is_refused(tmp_path: Path) -> None:
    """The checker is data-driven from the catalog, so it must be unwritable.

    Otherwise a candidate could move a pin and edit the checker that verifies
    it, instead of moving the declaration the checker reads.
    """
    result = _classify(
        tmp_path,
        _with({f"{LC}src/check-install-posture.mjs": "// expectations relaxed\n"}),
    )
    assert result.returncode != 0
    refusal = json.loads(result.stderr)
    assert refusal["code"] in {"UNDECLARED_CHANGE", "PROTECTED_DRIFT"}
    assert "check-install-posture" in refusal["message"]
