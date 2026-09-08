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
from typing import Any

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
    _mutate(workspace, text.replace("  typescript: 7.0.2", "  eslint: 10.8.0\n  typescript: 7.0.2"))
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


# --- P2-B: the configuration, metadata and SCRIPT surfaces, exhaustively -----
#
# The committed tree is clean; the question these answer is whether the checker
# would still report clean over a candidate that was not. A subset of the
# configuration forms, or a scan of only the canonical `lint` script, is a hole
# with the shape of exactly the residue someone would leave.


def _exported(name: str) -> list[str]:
    """Read a set the checker itself owns, so the test cannot drift from it."""
    out = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            f"import {{{name}}} from {str(CHECK)!r}; process.stdout.write(JSON.stringify({name}))",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    ).stdout
    parsed: list[str] = json.loads(out)
    return parsed


#: Every filename the engine resolved, across both configuration eras. Written
#: out here rather than read from the checker, because the point is that the
#: checker must cover a surface defined by the ENGINE, not by itself.
REQUIRED_CONFIG_FORMS = [
    ".eslintignore",
    ".eslintrc",
    ".eslintrc.cjs",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.cjs",
    "eslint.config.cts",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.mts",
    "eslint.config.ts",
]


def test_the_configuration_surface_is_complete() -> None:
    """A missing form is not a smaller claim; it is a false one.

    The checker asserts that no engine configuration survives, so an unlisted
    filename is a place a candidate keeps one while the gate reports clean.
    """
    covered = set(_exported("RETIRED_CONFIG_BASENAMES"))
    missing = sorted(set(REQUIRED_CONFIG_FORMS) - covered)
    assert not missing, f"the checker does not refuse these engine config forms: {missing}"


@pytest.mark.parametrize("basename", REQUIRED_CONFIG_FORMS)
def test_every_engine_configuration_form_is_caught(clone: Path, basename: str) -> None:
    _mutate(clone / "packages" / "contracts" / basename, "// engine configuration residue\n")
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0, f"{basename} was admitted"
    assert "is a configuration file for the retired engine" in _output(result)


def _edit_manifest(root: Path, rel: str, **changes: Any) -> None:
    path = root / rel
    manifest: dict[str, Any] = json.loads(path.read_text())
    for key, value in changes.items():
        if key == "scripts":
            manifest.setdefault("scripts", {}).update(value)
        else:
            manifest[key] = value
    _mutate(path, json.dumps(manifest, indent=2) + "\n")


@pytest.mark.parametrize("key", ["eslintConfig", "eslintIgnore"])
def test_legacy_configuration_carried_in_package_metadata_is_caught(clone: Path, key: str) -> None:
    """The legacy era let a package configure the engine with no config FILE at
    all, so a filename scan alone leaves the hole where completeness is claimed."""
    value: Any = {"extends": []} if key == "eslintConfig" else ["dist"]
    _edit_manifest(clone, "packages/contracts/package.json", **{key: value})
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0, f"{key} was admitted"
    assert "is configuration for the retired engine" in _output(result)


@pytest.mark.parametrize(
    ("label", "script"),
    [
        ("a bare invocation", "eslint ."),
        ("a package-manager prefix", "pnpm exec eslint ."),
        ("an npx prefix", "npx eslint --fix ."),
        ("an explicit package entry path", "node node_modules/eslint/bin/eslint.js ."),
        ("a bin shim", "./node_modules/.bin/eslint ."),
        ("a second command in a chain", "tsc --noEmit && eslint ."),
        ("an environment-prefixed invocation", "NODE_OPTIONS=--no-warnings eslint ."),
        ("the retired workspace config package", "node packages/eslint-config/index.js"),
    ],
)
def test_any_script_running_the_retired_engine_is_caught(
    clone: Path, label: str, script: str
) -> None:
    """And it must be caught with NO dependency on the engine anywhere.

    The clone has no `eslint` in any manifest, catalog or lock -- that is the
    committed state. A script is a second, independent way to reach the engine,
    and the checker looked only at the canonical `lint` command, which is the
    one command nobody would use to keep it.
    """
    _edit_manifest(clone, "packages/contracts/package.json", scripts={"lint:legacy": script})
    _stage(clone)

    result = _run(clone)
    assert result.returncode != 0, f"{label} was admitted"
    assert "runs the retired lint engine" in _output(result)


@pytest.mark.parametrize(
    ("label", "script"),
    [
        ("prose that prints the word", "echo 'eslint was retired in task 3.4'"),
        ("the replacement capability", "secure-home-lint"),
        ("a script named for the retired era", "pnpm -r --if-present run lint"),
    ],
)
def test_a_script_that_only_mentions_the_engine_is_not_residue(
    clone: Path, label: str, script: str
) -> None:
    """The control that keeps this an IDENTITY check rather than a grep.

    The retirement is deliberately provable without searching for the word,
    because the word legitimately survives in the retained legacy rule
    identities, in the surviving engine's own diagnostic codes, and in prose
    that has to be able to name what was retired.
    """
    _edit_manifest(clone, "packages/contracts/package.json", scripts={"note": script})
    _stage(clone)

    result = _run(clone)
    assert result.returncode == 0, f"{label} was refused: {_output(result)}"


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


# --- the ownership boundary -------------------------------------------------
#
# The retirement import phase consumes `check-source-imports.mjs --report-loads`
# and owns exactly one question about it: does a LITERAL specifier resolve to a
# retired package. Whether a module may be loaded through a COMPUTED specifier
# is the other gate's question, and it answers by zone — production source must
# import by literal specifier; test and tooling files deliberately need not.
#
# This phase briefly refused every non-literal site in every zone. That is
# stricter than the authority it reads from: a second, quieter module-loading
# policy owned by a task about retiring a lint engine, disagreeing with the real
# one. The matrix below pins both gates over the same fixtures, so neither can
# drift into the other's question — and so "already refused by the other gate"
# stays a checked claim rather than a comment.

NON_LITERAL = "export const load = (n: string) => import(n)\n"
LITERAL_RETIRED = "import 'eslint'\nexport const a = 1\n"


def _source_imports(root: Path) -> subprocess.CompletedProcess[str]:
    """The gate that owns non-literal loads, run over the same tree."""
    return subprocess.run(
        ["node", str(REPO / "scripts" / "check-source-imports.mjs"), str(root)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )


@pytest.mark.parametrize(
    ("label", "rel", "body", "source_imports_refuses", "retirement_refuses"),
    [
        # A computed specifier is the OTHER gate's question, and only in
        # production. Retirement says nothing about any of these.
        (
            "non-literal in production",
            "packages/contracts/src/probe.ts",
            NON_LITERAL,
            True,
            False,
        ),
        (
            "non-literal in a test file",
            "packages/contracts/src/probe.test.ts",
            NON_LITERAL,
            False,
            False,
        ),
        (
            "non-literal in a build config",
            "packages/contracts/vitest.config.ts",
            NON_LITERAL,
            False,
            False,
        ),
        # A literal retired package is THIS gate's question, in every zone --
        # including the two the other gate deliberately relaxes, which is
        # exactly where residue would otherwise sit unseen.
        (
            "literal retired import in a test file",
            "packages/contracts/src/probe.test.ts",
            LITERAL_RETIRED,
            False,
            True,
        ),
        (
            "literal retired import in a build config",
            "packages/contracts/vitest.config.ts",
            LITERAL_RETIRED,
            False,
            True,
        ),
        (
            "literal retired import in production",
            "packages/contracts/src/probe.ts",
            LITERAL_RETIRED,
            False,
            True,
        ),
    ],
)
def test_each_gate_refuses_only_its_own_question(
    clone: Path,
    label: str,
    rel: str,
    body: str,
    source_imports_refuses: bool,
    retirement_refuses: bool,
) -> None:
    _mutate(clone / rel, body)
    _stage(clone)

    imports_gate = _source_imports(clone)
    assert (imports_gate.returncode != 0) is source_imports_refuses, (
        f"{label}: check-source-imports\n{_output(imports_gate)}"
    )

    retirement = _run(clone, "imports")
    assert (retirement.returncode != 0) is retirement_refuses, (
        f"{label}: retirement import phase\n{_output(retirement)}"
    )
    if retirement_refuses:
        assert 'loads the retired package "eslint"' in _output(retirement), label


def test_the_retirement_checker_holds_no_zone_classifier(clone: Path) -> None:
    """Deferral, not reimplementation.

    The boundary above would also hold if this checker had grown its own copy
    of `zoneOf` and happened to agree today. Two classifiers agree until one is
    edited, and the copy is the one that would silently win -- so the checker
    must not contain one at all.
    """
    checker = (REPO / "scripts" / "check-engine-retirement.mjs").read_text()
    code = "\n".join(
        line for line in checker.splitlines() if not line.lstrip().startswith(("*", "/*", "//"))
    )
    for borrowed in ("zoneOf", "TEST_DIR", "TEST_FILE", "ROOT_CONFIG", "production"):
        assert borrowed not in code, f"the retirement checker reimplements {borrowed}"


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


# --- the gate must actually be invoked -------------------------------------
#
# A gate nothing calls is a gate nothing enforces. The first version of this
# verifier was wired into `scripts/check.sh` alone, and CI does not run
# check.sh — it runs the steps individually — so the whole proof was local-only
# and every hosted run passed without it. These pin the invocation.


def _workflow() -> str:
    return (REPO / ".github" / "workflows" / "checks.yml").read_text()


def _check_script() -> str:
    return (REPO / "scripts" / "check.sh").read_text()


@pytest.mark.parametrize("phase", ["static", "imports"])
def test_the_local_gate_runs_both_phases(phase: str) -> None:
    assert f"--phase={phase}" in _check_script(), f"scripts/check.sh does not run the {phase} phase"


@pytest.mark.parametrize("phase", ["static", "imports"])
def test_ci_runs_both_phases(phase: str) -> None:
    """Either directly or through the root script that carries the flag."""
    workflow = _workflow()
    root_scripts = json.loads((REPO / "package.json").read_text())["scripts"]
    invocations = [line.strip() for line in workflow.splitlines() if "run:" in line]
    reached = any(
        f"--phase={phase}" in line
        or any(
            name in line and f"--phase={phase}" in body
            for name, body in root_scripts.items()
            if name.startswith("check:")
        )
        for line in invocations
    )
    assert reached, f"checks.yml never runs the {phase} phase of the retirement gate"


def test_the_static_phase_runs_before_the_install_in_ci() -> None:
    """It refuses a lockfile that would reinstall the retired engine, so it has
    to be asked before the install acts on that lockfile.

    It is also stdlib-only, which is what makes running it that early possible
    at all — the import phase is not, and must not be moved here.
    """
    workflow = _workflow()
    assert "--phase=static" in workflow, "checks.yml never runs the static phase"
    assert "pnpm install --frozen-lockfile" in workflow, "checks.yml never installs"
    assert workflow.index("--phase=static") < workflow.index("pnpm install --frozen-lockfile"), (
        "the static phase must run before the install"
    )


def test_the_import_phase_runs_after_the_install_in_ci() -> None:
    """It parses through `@typescript/typescript6`, which is installed. Running
    it earlier would fail for the wrong reason on a clean host."""
    workflow = _workflow()
    assert "check:retirement-imports" in workflow, "checks.yml never runs the import phase"
    assert "pnpm install --frozen-lockfile" in workflow, "checks.yml never installs"
    assert workflow.index("pnpm install --frozen-lockfile") < workflow.index(
        "check:retirement-imports"
    ), "the import phase must run after the install"
