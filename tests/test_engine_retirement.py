"""Task 3.4: the retired lint engine leaves nothing behind, and that is PROVED.

The check under test scans for package identities and paths, never for the word
"eslint" -- the string is still legitimately present in the retained legacy rule
identities, in the replacement engine's own diagnostic codes, and in prose that
has to be able to name what was retired.

Every test here is a mutation: it puts a specific piece of residue back into a
throwaway workspace and requires the check to find it. A test that only ran the
check against the clean tree would pass just as happily if the check did
nothing at all.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
CHECK = REPO / "scripts" / "check-engine-retirement.mjs"


def _run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["node", str(CHECK), str(root)], capture_output=True, text=True, cwd=REPO)


def _output(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


def _clone(tmp_path: Path) -> Path:
    """A tracked-file copy of the repository, cheap enough to mutate.

    `git ls-files` is the check's own notion of the tree, so the clone has to be
    a real git repository with the same files staged -- a plain directory copy
    would make every scan see nothing and every mutation test pass vacuously.
    """
    root = tmp_path / "clone"
    root.mkdir()
    tracked = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.split("\n")
    for rel in tracked:
        if not rel:
            continue
        source = REPO / rel
        if not source.is_file():
            continue
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    return root


def _stage(root: Path) -> None:
    """Residue is only residue if the tree actually carries it."""
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)


def _mutate(path: Path, write: bytes | str) -> None:
    """Write, and PROVE the bytes changed.

    A mutation that did not change the subject proves nothing about the check;
    it just re-runs the clean tree under a different name.
    """
    before = path.read_bytes() if path.exists() else None
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(write, str):
        path.write_text(write)
    else:
        path.write_bytes(write)
    assert path.read_bytes() != before, f"the mutation did not change {path}"


@pytest.fixture
def clone(tmp_path: Path) -> Path:
    return _clone(tmp_path)


def test_the_committed_tree_has_no_residue(clone: Path) -> None:
    """The baseline. Every mutation below is measured against this passing."""
    result = _run(clone)
    assert result.returncode == 0, _output(result)


# --- mutation 1: the dependency survives ------------------------------------


def test_an_eslint_dependency_left_in_a_manifest_is_caught(clone: Path) -> None:
    manifest = clone / "packages" / "contracts" / "package.json"
    parsed = json.loads(manifest.read_text())
    parsed.setdefault("devDependencies", {})["eslint"] = "catalog:"
    _mutate(manifest, json.dumps(parsed, indent=2) + "\n")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "devDependencies.eslint is a retired lint-engine package" in _output(result)


def test_a_typescript_eslint_dependency_is_caught_by_family(clone: Path) -> None:
    """Not by an exact name list: the whole scope went with the engine."""
    manifest = clone / "packages" / "contracts" / "package.json"
    parsed = json.loads(manifest.read_text())
    parsed.setdefault("devDependencies", {})["@typescript-eslint/utils"] = "^8.0.0"
    _mutate(manifest, json.dumps(parsed, indent=2) + "\n")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "@typescript-eslint/utils is a retired lint-engine package" in _output(result)


def test_a_catalog_pin_left_behind_is_caught(clone: Path) -> None:
    workspace = clone / "pnpm-workspace.yaml"
    text = workspace.read_text()
    _mutate(workspace, text.replace("  typescript: 6.0.3", "  eslint: 10.8.0\n  typescript: 6.0.3"))
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'the catalog still pins "eslint"' in _output(result)


def test_a_lock_entry_left_behind_is_caught(clone: Path) -> None:
    """The one a manifest scan alone would miss.

    A dependency removed from every manifest but still resolved in the lockfile
    still describes an install -- the engine would come back on the next
    `pnpm install --frozen-lockfile`.
    """
    lock = clone / "pnpm-lock.yaml"
    text = lock.read_text()
    _mutate(lock, text.replace("\npackages:\n", "\npackages:\n\n  eslint@10.8.0:\n", 1))
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'pnpm-lock.yaml: still resolves "eslint"' in _output(result)


# --- mutation 2: a projection survives --------------------------------------


def test_a_surviving_eslint_config_projection_is_caught(clone: Path) -> None:
    _mutate(
        clone / "packages" / "contracts" / "eslint.config.js",
        "export default []\n",
    )
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "is a configuration file for the retired engine" in _output(result)


def test_a_legacy_rc_file_is_caught_too(clone: Path) -> None:
    """The older configuration form. Retiring one spelling is not retiring the
    engine's configuration surface."""
    _mutate(clone / "apps" / "web" / ".eslintrc.json", '{"extends": []}\n')
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "is a configuration file for the retired engine" in _output(result)


# --- mutation 3: the package partially survives -----------------------------


def test_a_partially_surviving_package_is_caught(clone: Path) -> None:
    """Half a package is a package.

    One stray file under the retired path is exactly the shape a retirement
    takes when it is done file-by-file and someone stops early.
    """
    _mutate(clone / "packages" / "eslint-config" / "base.js", "export default []\n")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "survives inside the retired packages/eslint-config/ package" in _output(result)


def test_a_readme_alone_still_counts_as_survival(clone: Path) -> None:
    """Not only executable residue. A package directory that still exists is a
    place for the rest of it to come back to."""
    _mutate(clone / "packages" / "eslint-config" / "README.md", "# eslint-config\n")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "survives inside the retired packages/eslint-config/ package" in _output(result)


def test_an_import_of_the_retired_package_is_caught(clone: Path) -> None:
    """Import residue, which no dependency scan sees.

    A source file can import a package no manifest declares -- it resolves
    through the workspace root, and the import is what actually runs.
    """
    source = clone / "packages" / "contracts" / "src" / "residue.ts"
    _mutate(
        source, "import config from '@secure-home/eslint-config/library'\nexport default config\n"
    )
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'imports the retired package "@secure-home/eslint-config"' in _output(result)


def test_a_layer_classification_left_behind_is_caught(clone: Path) -> None:
    """The classification is a claim that the package exists and has a place."""
    model = clone / "scripts" / "workspace-model.mjs"
    text = model.read_text()
    _mutate(
        model,
        text.replace(
            "export const BUILD_TOOLING_PACKAGES = new Set([",
            "export const BUILD_TOOLING_PACKAGES = new Set([\n  '@secure-home/eslint-config',",
        ),
    )
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert "BUILD_TOOLING_PACKAGES still holds" in _output(result)


# --- the check must not fire on what the retirement deliberately KEPT -------


def test_the_retained_legacy_rule_identities_are_not_residue(clone: Path) -> None:
    """The mapping authority still records what each policy meant on the engine
    it was migrated from. Task 3.4 explicitly does not own deleting policy, and
    a check that forced their deletion would be destroying the record of the
    migration to make itself pass.
    """
    mappings = json.loads((clone / "packages" / "lint-config" / "engine-mappings.json").read_text())
    legacy = [m for m in mappings["mappings"] if m["engine"] == "legacy"]
    assert len(legacy) == 117, "the legacy identities must survive the engine"

    result = _run(clone)
    assert result.returncode == 0, _output(result)


def test_the_replacement_engines_own_diagnostic_codes_are_not_residue(
    clone: Path, tmp_path: Path
) -> None:
    """The surviving engine reports rules as `eslint(no-var)`, because that is
    the rule's upstream name. A word-scan would demand deleting the harness that
    reads its output."""
    harness = clone / "packages" / "lint-config" / "src" / "run-parity.mjs"
    assert "eslint" in harness.read_text()

    result = _run(clone)
    assert result.returncode == 0, _output(result)
