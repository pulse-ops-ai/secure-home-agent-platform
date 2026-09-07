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


def _run(root: Path, phase: str = "static") -> subprocess.CompletedProcess[str]:
    """Run one phase of the retirement gate against a tree.

    The gate is split because its two halves need different things. `static`
    reads bytes and runs on a host with no workspace; `imports` parses each
    file through the structural load-site authority, which resolves the
    `@typescript/typescript6` seam from THIS checkout's node_modules. The
    parser is a trusted tool and the subject tree is data, which is why a clone
    with no install can still be judged.
    """
    return subprocess.run(
        ["node", str(CHECK), f"--phase={phase}", str(root)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )


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


@pytest.mark.parametrize("phase", ["static", "imports"])
def test_the_committed_tree_has_no_residue(clone: Path, phase: str) -> None:
    """The baseline, in both phases. Every mutation below is measured against
    this passing."""
    result = _run(clone, phase)
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


# --- lock residue: every identity-bearing section of pnpm-lock v9 -----------
#
# Four sections name packages, and they name them differently. A scan that read
# only the resolved records would pass a lockfile that still pins the retired
# engine in the catalog and still declares it from a member -- which is a
# lockfile that reinstalls it on the next `--frozen-lockfile`.
#
# Every mutation below keeps the document WELL FORMED. The gate must refuse the
# package identity, not the YAML.


def _lock_identities(lock: Path) -> list[dict[str, str]]:
    """Every package identity the gate's own reader finds in a lockfile."""
    script = (
        "import {lockPackageIdentities} from "
        f"{str(CHECK)!r};"
        "import {readFileSync} from 'node:fs';"
        f"console.log(JSON.stringify(lockPackageIdentities(readFileSync({str(lock)!r},'utf8'))))"
    )
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    )
    identities: list[dict[str, str]] = json.loads(out.stdout)
    return identities


def _assert_only_added(original: Path, mutated: Path, name: str) -> None:
    """The mutation must be a LOCKFILE, not a broken file.

    Without this a test could pass because the document fell apart and the
    reader lost its footing, which would prove nothing about identifying a
    retired package. So the mutated document is read with the gate's own
    reader: every identity that was there before must still be there, and the
    only new one is the injected package.

    That is a stronger check than "the YAML still parses". A document can parse
    and still have lost a section to a botched edit.
    """
    before = _lock_identities(original)
    after = _lock_identities(mutated)
    assert len(after) == len(before) + 1, (
        f"the mutation changed {len(after) - len(before)} identities, not 1 — "
        "the lockfile structure did not survive the edit"
    )
    added = [entry for entry in after if entry not in before]
    assert [entry["name"] for entry in added] == [name], added


def test_a_catalog_pin_left_in_the_lock_is_caught(clone: Path) -> None:
    """`catalogs.default` pins a version before anything resolves it.

    Removing the package everywhere else and leaving this behind still hands
    the next install a version to fetch.
    """
    lock = clone / "pnpm-lock.yaml"
    pristine = clone / "pnpm-lock.pristine.yaml"
    text = lock.read_text()
    pristine.write_text(text)
    _mutate(
        lock,
        text.replace(
            "catalogs:\n  default:\n",
            "catalogs:\n  default:\n    eslint:\n      specifier: 10.8.0\n      version: 10.8.0\n",
            1,
        ),
    )
    _assert_only_added(pristine, lock, "eslint")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'catalogs.default still names the retired package "eslint"' in _output(result)


def test_an_importer_dependency_left_in_the_lock_is_caught(clone: Path) -> None:
    """An importer entry is a member's declared edge, recorded independently of
    that member's manifest. The two can disagree, and this is the half a
    manifest scan cannot see."""
    lock = clone / "pnpm-lock.yaml"
    pristine = clone / "pnpm-lock.pristine.yaml"
    text = lock.read_text()
    pristine.write_text(text)
    _mutate(
        lock,
        text.replace(
            "importers:\n\n  .:\n    devDependencies:\n",
            "importers:\n\n  .:\n    devDependencies:\n"
            "      eslint:\n        specifier: 'catalog:'\n        version: 10.8.0\n",
            1,
        ),
    )
    _assert_only_added(pristine, lock, "eslint")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'importer "." devDependencies still names the retired package "eslint"' in _output(
        result
    )


def test_a_resolved_package_record_left_in_the_lock_is_caught(clone: Path) -> None:
    """The versioned form: a dependency removed from every manifest but still
    resolved still describes an install."""
    lock = clone / "pnpm-lock.yaml"
    pristine = clone / "pnpm-lock.pristine.yaml"
    text = lock.read_text()
    pristine.write_text(text)
    _mutate(
        lock,
        text.replace(
            "\npackages:\n",
            "\npackages:\n\n  eslint@10.8.0:\n    resolution: {integrity: sha512-deadbeef}\n",
            1,
        ),
    )
    _assert_only_added(pristine, lock, "eslint")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'packages still names the retired package "eslint"' in _output(result)


def test_a_snapshot_left_in_the_lock_is_caught(clone: Path) -> None:
    """The installed form, whose key carries a peer suffix with its own `@`."""
    lock = clone / "pnpm-lock.yaml"
    pristine = clone / "pnpm-lock.pristine.yaml"
    text = lock.read_text()
    pristine.write_text(text)
    _mutate(
        lock,
        text.replace(
            "\nsnapshots:\n",
            "\nsnapshots:\n\n  eslint@10.8.0(typescript@6.0.3):\n    dependencies: {}\n",
            1,
        ),
    )
    _assert_only_added(pristine, lock, "eslint")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0
    assert 'snapshots still names the retired package "eslint"' in _output(result)


def test_a_key_name_is_read_past_its_version_and_peer_suffix(clone: Path) -> None:
    """A snapshot key carries a peer suffix with its own `@`.

    `oxlint@1.80.0(oxlint-tsgolint@7.0.2001)` must resolve to `oxlint`. Reading
    from the last `@` instead would yield `7.0.2001)` — the classifier would be
    comparing version strings against package names, and would never match
    anything at all. A scan that cannot match is a scan that always passes.
    """
    identities = _lock_identities(clone / "pnpm-lock.yaml")
    names = {entry["name"] for entry in identities}
    assert "oxlint" in names
    assert not any("(" in name or name[1:].count("@") for name in names), sorted(names)[:5]

    # And the four sections are all actually being read, so the tests above are
    # not all exercising one code path.
    assert {entry["where"] for entry in identities} >= {
        "catalogs.default",
        "packages",
        "snapshots",
    }
    assert any(entry["where"].startswith("importer ") for entry in identities)


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


# --- import residue: every syntactic form the AST authority reports ---------
#
# This scan was regex-based and missed a whole form. `import \'eslint\'` has no
# binding and no `from`, so a pattern keyed on `from`, `import(` or `require(`
# saw nothing -- and a side-effect import is the one that most plainly executes
# the package. The fix was to consume the structural load-site report rather
# than to widen the pattern, so these exercise the FORMS.


@pytest.mark.parametrize(
    ("label", "body", "expected"),
    [
        (
            "side-effect import of the engine",
            "import 'eslint'\nexport const a = 1\n",
            'loads the retired package "eslint"',
        ),
        (
            "side-effect import of a retired subpath",
            "import '@secure-home/eslint-config/library'\nexport const a = 1\n",
            'loads the retired package "@secure-home/eslint-config"',
        ),
        (
            "default import, the form that was already refused",
            "import config from '@secure-home/eslint-config/library'\nexport default config\n",
            'loads the retired package "@secure-home/eslint-config"',
        ),
        (
            "named import from the retired family",
            "import { x } from '@typescript-eslint/utils'\nexport const a = x\n",
            'loads the retired package "@typescript-eslint/utils"',
        ),
        (
            "dynamic import",
            "export const load = async () => import('eslint')\n",
            'loads the retired package "eslint"',
        ),
        (
            "require call",
            "const e = require('eslint')\nexport default e\n",
            'loads the retired package "eslint"',
        ),
        (
            "re-export, which is an edge in the other direction",
            "export { Linter } from 'eslint'\n",
            'loads the retired package "eslint"',
        ),
        (
            "type-only import, which still names the package",
            "import type { Linter } from 'eslint'\nexport type L = Linter\n",
            'loads the retired package "eslint"',
        ),
    ],
)
def test_a_load_of_the_retired_package_is_caught(
    clone: Path, label: str, body: str, expected: str
) -> None:
    """Import residue, which no dependency scan sees.

    A source file can load a package no manifest declares -- it resolves
    through the workspace root, and the load is what actually runs.
    """
    source = clone / "packages" / "contracts" / "src" / "residue.ts"
    _mutate(source, body)
    _stage(clone)

    result = _run(clone, "imports")
    assert result.returncode != 0, f"{label} was not refused"
    assert expected in _output(result), label


def test_a_side_effect_import_is_invisible_to_a_from_keyed_scan(clone: Path) -> None:
    """The defect itself, pinned as a claim about the SHAPE.

    This body contains no `from`, no `import(` and no `require(`, so any scan
    keyed on those three tokens reports nothing. The structural authority
    reports it because the AST holds an ImportDeclaration either way.
    """
    body = "import 'eslint'\nexport const a = 1\n"
    assert " from " not in body
    assert "import(" not in body
    assert "require(" not in body

    source = clone / "packages" / "contracts" / "src" / "residue.ts"
    _mutate(source, body)
    _stage(clone)

    result = _run(clone, "imports")
    assert result.returncode != 0
    assert 'loads the retired package "eslint"' in _output(result)


def test_an_unreadable_load_site_fails_closed(clone: Path) -> None:
    """A specifier that cannot be read without running the code cannot be
    proved free of the retired engine."""
    source = clone / "packages" / "contracts" / "src" / "residue.ts"
    _mutate(source, "const n = 'esl' + 'int'\nexport const load = () => import(n)\n")
    _stage(clone)

    result = _run(clone, "imports")
    assert result.returncode != 0
    assert "non-literal specifier" in _output(result)


def test_a_file_that_does_not_parse_fails_closed(clone: Path) -> None:
    """Parser recovery must not be able to make an edge disappear."""
    source = clone / "packages" / "contracts" / "src" / "residue.ts"
    _mutate(source, "export const broken = (\n")
    _stage(clone)

    result = _run(clone, "imports")
    assert result.returncode != 0
    assert "did not parse" in _output(result)


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
