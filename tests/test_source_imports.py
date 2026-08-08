"""Tests for ``scripts/check-source-imports.mjs``.

Manifest policy cannot prove import direction, and this is the check that says
so out loud.

``check-workspace.mjs`` excludes ``devDependencies`` from architectural layering
for a good reason — every member devDepends on ``@secure-home/testing`` (layer
6), so counting that as an architectural edge would make the layer map unusable.
The cost of that exclusion is a hole: a package may declare an outer package as
a ``devDependency`` and then import it from ``src/**``. TypeScript resolves it,
``tsc`` builds it, and manifest validation permits it.

So the two checks are separate and neither substitutes for the other. These
tests prove the separation rather than assuming it — including one that runs
*both* checks over the same fixture and asserts they disagree.

Every fixture is built in ``tmp_path``. Proving a rule by mutating this
repository's own manifests is how a manifest gets left mutated.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from workflow_model import governance_jobs, has_condition, job_sections

REPO_ROOT = Path(__file__).resolve().parent.parent
IMPORT_CHECK = REPO_ROOT / "scripts" / "check-source-imports.mjs"
WORKSPACE_CHECK = REPO_ROOT / "scripts" / "check-workspace.mjs"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "checks.yml"

STANDARD_SCRIPTS = dict.fromkeys(("lint", "typecheck", "test", "build"), "true")


class Workspace:
    """A fixture repository laid out like the real one.

    Directory names match the real layer map, so the fixtures exercise the
    *actual* layering rather than a parallel one invented for the tests.
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def member(self, rel: str, name: str, **fields: dict[str, str]) -> Workspace:
        directory = self.root / rel
        directory.mkdir(parents=True, exist_ok=True)
        manifest: dict[str, object] = {
            "name": name,
            "version": "0.0.0",
            "private": True,
            "description": f"fixture boundary for {name}",
            "scripts": dict(STANDARD_SCRIPTS),
        }
        manifest.update(fields)
        (directory / "package.json").write_text(json.dumps(manifest, indent=2) + "\n")
        return self

    def source(self, rel: str, body: str) -> Workspace:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body if body.endswith("\n") else body + "\n")
        return self


def _run(script: Path, root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(script), str(root)],
        capture_output=True,
        text=True,
        check=False,
    )


def _imports(root: Path) -> subprocess.CompletedProcess[str]:
    return _run(IMPORT_CHECK, root)


def _output(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


def _base(tmp_path: Path, name: str = "ws") -> Workspace:
    """contracts(1) · query-model(2) · logging(4) · testing(6) · a service."""
    ws = Workspace(tmp_path / name)
    ws.member(
        "packages/contracts",
        "@secure-home/contracts",
        devDependencies={
            "@secure-home/eslint-config": "workspace:*",
            "@secure-home/logging": "workspace:*",
            "@secure-home/testing": "workspace:*",
        },
    )
    ws.member("packages/eslint-config", "@secure-home/eslint-config")
    ws.member("packages/logging", "@secure-home/logging")
    ws.member("packages/observability", "@secure-home/observability")
    ws.member("packages/testing", "@secure-home/testing")
    ws.member(
        "packages/query-model",
        "@secure-home/query-model",
        dependencies={"@secure-home/contracts": "workspace:*"},
    )
    ws.member(
        "services/control-plane",
        "@secure-home/control-plane",
        dependencies={"@secure-home/contracts": "workspace:*"},
        devDependencies={"@secure-home/testing": "workspace:*"},
    )
    ws.source("packages/contracts/src/index.ts", "export {}")
    ws.source("packages/logging/src/index.ts", "export {}")
    ws.source("packages/testing/src/index.ts", "export {}")
    ws.source("services/control-plane/src/index.ts", "export {}")
    return ws


# --- the reported hole ------------------------------------------------------


def test_a_devdependency_does_not_license_an_outward_source_import(tmp_path: Path) -> None:
    """THE finding: manifest layering ignores devDependencies, so source must not.

    `contracts` (layer 1) declares `logging` (layer 4) as a devDependency —
    which manifest policy permits — and then imports it from `src/**`. Node and
    TypeScript both resolve it. Only a source-level check can see it.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/index.ts",
        "import { log } from '@secure-home/logging'\nexport const a = log",
    )

    result = _imports(ws.root)
    assert result.returncode != 0, "an outward import via a devDependency must be rejected"
    assert "direction is inward only" in _output(result)
    assert "devDependency does not make the import inward" in _output(result)


def test_the_two_checks_are_independent_and_disagree_on_this_fixture(tmp_path: Path) -> None:
    """The proof that neither check substitutes for the other.

    The same fixture must PASS manifest validation and FAIL source validation.
    If manifest validation ever started rejecting it, the two checks would have
    collapsed into one and this test would say so.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/index.ts",
        "import { log } from '@secure-home/logging'\nexport const a = log",
    )

    manifest_result = _run(WORKSPACE_CHECK, ws.root)
    import_result = _imports(ws.root)

    assert manifest_result.returncode == 0, (
        "the manifest is legal by manifest policy — that is exactly the gap:\n"
        + _output(manifest_result)
    )
    assert import_result.returncode != 0, "the source import must still be rejected"


def test_contracts_cannot_import_outer_packages_from_production_source(tmp_path: Path) -> None:
    """Required by review: logging, observability, and testing are all out."""
    for index, dep in enumerate(
        ("@secure-home/logging", "@secure-home/observability", "@secure-home/testing")
    ):
        ws = _base(tmp_path, f"ws-{index}")
        # Declared as a devDependency, which manifest policy allows.
        manifest = ws.root / "packages" / "contracts" / "package.json"
        pkg = json.loads(manifest.read_text())
        pkg["devDependencies"][dep] = "workspace:*"
        manifest.write_text(json.dumps(pkg, indent=2) + "\n")
        ws.source("packages/contracts/src/index.ts", f"import '{dep}'\nexport {{}}")

        result = _imports(ws.root)
        assert result.returncode != 0, f"contracts/src importing {dep} must be rejected"


def test_no_production_source_may_import_the_test_only_package(tmp_path: Path) -> None:
    """Required by review — including from a service, not only from a package."""
    for index, (member, source) in enumerate(
        (
            ("packages/contracts", "packages/contracts/src/index.ts"),
            ("services/control-plane", "services/control-plane/src/index.ts"),
        )
    ):
        ws = _base(tmp_path, f"ws-testonly-{index}")
        ws.source(
            source, "import { fixture } from '@secure-home/testing'\nexport const a = fixture"
        )

        result = _imports(ws.root)
        assert result.returncode != 0, f"{member} may not import the test-only package"
        assert "test-only package" in _output(result)


def test_build_tooling_may_not_be_imported_from_production_source(tmp_path: Path) -> None:
    """Layer 0 is *below* everything, so layering alone would allow this.

    Direction is not the only property that matters: an ESLint config has no
    business resolving inside a deployed artifact regardless of its layer.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/index.ts",
        "import cfg from '@secure-home/eslint-config/library'\nexport default cfg",
    )

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "build-tooling package" in _output(result)


# --- what must remain allowed -----------------------------------------------


def test_services_and_apps_may_import_inner_packages(tmp_path: Path) -> None:
    """Required by review: the rule must not block the legitimate direction."""
    ws = _base(tmp_path)
    ws.source(
        "services/control-plane/src/index.ts",
        "import { c } from '@secure-home/contracts'\nexport const a = c",
    )
    ws.source(
        "packages/query-model/src/index.ts",
        "import { c } from '@secure-home/contracts'\nexport const a = c",
    )

    result = _imports(ws.root)
    assert result.returncode == 0, _output(result)


def test_test_files_and_build_configs_may_reach_their_tooling(tmp_path: Path) -> None:
    """A test may use a test helper; a vitest config may load one.

    Neither ships in the compiled artifact, so applying production layering to
    them would forbid the setup every package in this repository already uses.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/tests/contract.test.ts",
        "import { fixture } from '@secure-home/testing'\nexport const a = fixture",
    )
    ws.source(
        "packages/contracts/vitest.config.ts",
        "import { definePackageConfig } from '@secure-home/testing/vitest'\n"
        "export default definePackageConfig()",
    )
    ws.source(
        "packages/contracts/eslint.config.js",
        "import config from '@secure-home/eslint-config/library'\nexport default config",
    )

    result = _imports(ws.root)
    assert result.returncode == 0, _output(result)


def test_a_package_name_in_a_doc_comment_is_not_an_import(tmp_path: Path) -> None:
    """Only import-shaped constructs count, or every README-ish comment fails."""
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/index.ts",
        "/**\n"
        " * Consumed by @secure-home/logging and @secure-home/testing.\n"
        " * See @secure-home/observability for the counters.\n"
        " */\n"
        "export {}",
    )

    result = _imports(ws.root)
    assert result.returncode == 0, _output(result)


def test_generated_output_is_not_scanned(tmp_path: Path) -> None:
    """`dist/` holds the compiled copy of a violation already reported in `src/`."""
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/dist/index.js",
        "import { log } from '@secure-home/logging'\nexport const a = log",
    )

    result = _imports(ws.root)
    assert result.returncode == 0, _output(result)


# --- every import form is seen ----------------------------------------------


def test_every_import_form_creates_an_edge(tmp_path: Path) -> None:
    """A rule that only sees `import ... from` is a rule with five bypasses.

    Type-only imports count too: `import type` is erased at runtime, but
    `contracts` knowing `logging`'s types is still `contracts` depending on
    `logging`, which is what ADR-0012 §15 forbids.
    """
    forms = {
        "static": "import { log } from '@secure-home/logging'\nexport const a = log",
        "type-only": "import type { L } from '@secure-home/logging'\nexport type A = L",
        "side-effect": "import '@secure-home/logging'\nexport {}",
        "re-export": "export { log } from '@secure-home/logging'",
        "star-re-export": "export * from '@secure-home/logging'",
        "dynamic": "export const a = () => import('@secure-home/logging')",
        "require": "const l = require('@secure-home/logging')\nexport default l",
        "subpath": "import { log } from '@secure-home/logging/child'\nexport const a = log",
        "multiline": (
            "import {\n  log,\n  warn,\n} from '@secure-home/logging'\nexport const a = log"
        ),
    }
    for index, (label, body) in enumerate(forms.items()):
        ws = _base(tmp_path, f"ws-form-{index}")
        ws.source("packages/contracts/src/index.ts", body)

        result = _imports(ws.root)
        assert result.returncode != 0, f"the {label} import form was not seen as an edge"
        assert "direction is inward only" in _output(result), label


def test_a_non_literal_dynamic_import_is_rejected_in_production_source(tmp_path: Path) -> None:
    """The static-analysis blind spot is closed by prohibition, not left open.

    A computed specifier cannot be resolved without running the program, so
    permitting one would be a silent bypass of every rule above.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/index.ts",
        "export const load = (name) => import(name)",
    )

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "non-literal" in _output(result)


# --- lexical structure: what a regex could not see ---------------------------
#
# The checker reads TypeScript's AST rather than matching patterns against raw
# text. These tests are the reason. Each one is a construct that a regular
# expression gets wrong in one of the two possible directions: reporting an
# import that is not there, or missing one that is.


def _contracts_source(tmp_path: Path, label: str, body: str) -> subprocess.CompletedProcess[str]:
    ws = _base(tmp_path, f"ws-lex-{label}")
    ws.source("packages/contracts/src/index.ts", body)
    return _imports(ws.root)


def test_a_commented_out_import_is_not_an_import(tmp_path: Path) -> None:
    """False positive: inert text must not fail the build."""
    inert = {
        "line": "// import { log } from '@secure-home/logging'\nexport {}",
        "block": "/* import { log } from '@secure-home/logging' */\nexport {}",
        "jsdoc": ("/**\n * import { log } from '@secure-home/logging'\n */\nexport {}"),
        "trailing": "export {} // import { log } from '@secure-home/logging'",
        "nested-in-code": ("export const a = 1 /* import { log } from '@secure-home/logging' */"),
    }
    for label, body in inert.items():
        result = _contracts_source(tmp_path, f"inert-{label}", body)
        assert result.returncode == 0, (
            f"a {label} comment was read as an import:\n{_output(result)}"
        )


def test_a_comment_between_tokens_does_not_hide_an_import(tmp_path: Path) -> None:
    """False negative — the dangerous direction. Valid syntax, still an edge."""
    evasive = {
        "before-specifier": "import { log } from /* c */ '@secure-home/logging'\nexport {}",
        "after-import": "import /* c */ { log } from '@secure-home/logging'\nexport {}",
        "everywhere": ("import/* a */{ log }/* b */from/* c */'@secure-home/logging'\nexport {}"),
        "newline-comment": (
            "import { log }\n  // which layer?\n  from '@secure-home/logging'\nexport {}"
        ),
        "side-effect": "import /* c */ '@secure-home/logging'\nexport {}",
        "dynamic": "export const a = () => import(/* c */ '@secure-home/logging')",
    }
    for label, body in evasive.items():
        result = _contracts_source(tmp_path, f"evasive-{label}", body)
        assert result.returncode != 0, f"a comment between tokens hid the {label} import"
        assert "direction is inward only" in _output(result), label


def test_an_import_inside_a_literal_is_text_not_an_import(tmp_path: Path) -> None:
    """False positive: quoting an import statement does not perform it."""
    quoted = {
        "double": "export const doc = \"import { log } from '@secure-home/logging'\"",
        "single": "export const doc = 'import { log } from \"@secure-home/logging\"'",
        "template": "export const doc = `import { log } from '@secure-home/logging'`",
        "template-substitution": (
            "const x = 1\nexport const doc = `import ${x} from '@secure-home/logging'`"
        ),
    }
    for label, body in quoted.items():
        result = _contracts_source(tmp_path, f"quoted-{label}", body)
        assert result.returncode == 0, (
            f"a {label} literal was read as an import:\n{_output(result)}"
        )


def test_a_regex_literal_containing_quotes_does_not_desynchronise_the_scan(
    tmp_path: Path,
) -> None:
    """The construct that breaks quote-tracking scanners.

    A scanner that tracks quotes without tracking syntax treats the `'` inside
    `/['"]/` as the start of a string, runs past the real import, and reports
    nothing. That is a silent bypass, so it gets its own test.
    """
    body = (
        "const quoted = /['\"]/g\n"
        "const divided = 10 / 2 / 1\n"
        "import { log } from '@secure-home/logging'\n"
        "export const a = [quoted, divided, log]"
    )
    result = _contracts_source(tmp_path, "regex", body)
    assert result.returncode != 0, "a regex literal hid the import that followed it"
    assert "direction is inward only" in _output(result)


def test_jsx_text_containing_an_apostrophe_does_not_hide_an_import(tmp_path: Path) -> None:
    """`don't` in JSX text is not an unterminated string, and `//` is not a comment."""
    ws = _base(tmp_path, "ws-jsx")
    ws.member(
        "apps/web",
        "@secure-home/web",
        dependencies={"@secure-home/contracts": "workspace:*"},
        devDependencies={"@secure-home/testing": "workspace:*"},
    )
    ws.source(
        "apps/web/src/page.tsx",
        "import { fixture } from '@secure-home/testing'\n"
        "export const Page = () => <p>don't visit http://example.test</p>\n"
        "export const a = fixture",
    )

    result = _imports(ws.root)
    assert result.returncode != 0, "JSX text hid the import above it"
    assert "test-only package" in _output(result)


def test_typescript_only_import_forms_are_edges(tmp_path: Path) -> None:
    """`import x = require()` and `typeof import()` are imports too."""
    forms = {
        "import-equals": ("import log = require('@secure-home/logging')\nexport const a = log"),
        "import-type-node": "export type A = typeof import('@secure-home/logging')",
        "import-type-member": "export type A = import('@secure-home/logging').Logger",
    }
    for label, body in forms.items():
        result = _contracts_source(tmp_path, f"ts-{label}", body)
        assert result.returncode != 0, f"the {label} form was not seen as an edge"


def test_a_file_that_does_not_parse_is_reported(tmp_path: Path) -> None:
    """A file that cannot be parsed cannot be verified, so it must not pass.

    This also pins the parser-diagnostic behaviour: the checker reads
    `parseDiagnostics`, which is not published API. If a future TypeScript
    release stops providing it, this test fails rather than the gate going quiet.
    """
    result = _contracts_source(
        tmp_path,
        "broken",
        "import { log from '@secure-home/logging'\nexport const a = (",
    )
    assert result.returncode != 0
    assert "cannot be parsed" in _output(result)


def test_a_deeply_nested_import_is_still_found(tmp_path: Path) -> None:
    """Walking the whole tree, not just the top level."""
    body = (
        "export function outer() {\n"
        "  return {\n"
        "    async inner() {\n"
        "      if (globalThis) {\n"
        "        return await import('@secure-home/logging')\n"
        "      }\n"
        "      return null\n"
        "    },\n"
        "  }\n"
        "}"
    )
    result = _contracts_source(tmp_path, "nested", body)
    assert result.returncode != 0, "a dynamic import nested in a closure was missed"
    assert "direction is inward only" in _output(result)


def test_an_export_without_a_source_is_not_an_import(tmp_path: Path) -> None:
    """`export { a }` has no module specifier and creates no edge."""
    result = _contracts_source(tmp_path, "local-export", "const a = 1\nexport { a }")
    assert result.returncode == 0, _output(result)


# --- fail-closed structure --------------------------------------------------


def test_production_is_the_default_zone(tmp_path: Path) -> None:
    """Code outside `src/` must not escape the rules by choosing a directory.

    An allowlist of production paths would let a package opt out by moving a
    file. The zone rules name the exemptions instead: tests and build configs.
    """
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/lib/helper.ts",
        "import { log } from '@secure-home/logging'\nexport const a = log",
    )

    result = _imports(ws.root)
    assert result.returncode != 0, "a file outside src/ is still production source"


def test_an_undeclared_internal_import_is_rejected(tmp_path: Path) -> None:
    """An import that resolves only by hoisting breaks the moment layout changes."""
    ws = _base(tmp_path)
    ws.source(
        "packages/query-model/src/index.ts",
        "import { o } from '@secure-home/observability'\nexport const a = o",
    )

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "without declaring it" in _output(result)


def test_nothing_may_import_a_service_or_an_app(tmp_path: Path) -> None:
    ws = _base(tmp_path)
    ws.source(
        "packages/logging/src/index.ts",
        "import { cp } from '@secure-home/control-plane'\nexport const a = cp",
    )

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "nothing may import a service or an app" in _output(result)


def test_a_package_missing_from_the_layer_map_is_rejected(tmp_path: Path) -> None:
    """Fail closed, exactly as the manifest checker does."""
    ws = _base(tmp_path)
    ws.member("packages/zz-unplaced", "@secure-home/zz-unplaced")
    ws.source("packages/zz-unplaced/src/index.ts", "export {}")

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "layer map" in _output(result)


def test_a_package_may_not_import_its_own_name_from_production_source(tmp_path: Path) -> None:
    """Self-reference through `exports` resolves differently before and after build."""
    ws = _base(tmp_path)
    ws.source(
        "packages/contracts/src/other.ts",
        "import { a } from '@secure-home/contracts'\nexport const b = a",
    )

    result = _imports(ws.root)
    assert result.returncode != 0
    assert "relative path" in _output(result)


# --- the check is wired in --------------------------------------------------


def test_the_layer_map_has_exactly_one_definition() -> None:
    """Two copies of the layer map would silently stop agreeing."""
    definitions = [
        path.name
        for path in (REPO_ROOT / "scripts").glob("*.mjs")
        if "const LAYERS = {" in path.read_text()
    ]
    assert definitions == ["workspace-model.mjs"], (
        f"the layer map must be defined once, in workspace-model.mjs; found in {definitions}"
    )


def test_the_source_import_check_runs_in_ci_and_in_the_aggregate_check() -> None:
    """A check that runs nowhere enforces nothing."""
    assert "check:imports" in (REPO_ROOT / "package.json").read_text()
    assert "check:imports" in (REPO_ROOT / "scripts" / "check.sh").read_text()

    assert "check:imports" in WORKFLOW.read_text(), "the merge gate must run the check"

    # It must sit in a GOVERNANCE-UNCONDITIONAL job: an import-direction gate
    # that path filtering can skip is a gate a bad change turns off.
    hosting = {
        name: section for name, section in governance_jobs().items() if "check:imports" in section
    }
    assert hosting, "the source import check must sit in a GOVERNANCE-UNCONDITIONAL job"
    for name, section in hosting.items():
        assert not has_condition(section), f"job {name} acquired an `if:` condition"


def _external_imports(script: str) -> list[str]:
    """Third-party module specifiers in a script, ignoring its documentation."""
    specifier = re.compile(r"""(?:from|import)\s*['"]([^'"]+)['"]""")
    block_comment = re.compile(r"/\*.*?\*/", re.DOTALL)
    line_comment = re.compile(r"^\s*//.*$", re.MULTILINE)

    text = (REPO_ROOT / "scripts" / script).read_text()
    code = line_comment.sub("", block_comment.sub("", text))
    return [
        found for found in specifier.findall(code) if not found.startswith(("node:", "./", "../"))
    ]


def test_the_pre_install_checks_stay_dependency_free() -> None:
    """These run before any `pnpm install`, so a dependency would break them.

    `affected-targets.mjs` runs in the `select` job, which never installs, and
    `workspace-model.mjs` is imported by `check-workspace.mjs`. A third-party
    import in either would fail on a freshly-prepared Pi.
    """
    for script in ("workspace-model.mjs", "check-workspace.mjs", "affected-targets.mjs"):
        assert not _external_imports(script), (
            f"{script} runs before install and may use only the Node standard library"
        )


def test_the_gate_takes_one_dependency_and_runs_after_install() -> None:
    """The parser is worth a dependency; the ordering that makes it safe is not optional.

    Reading the AST instead of matching patterns costs one import, `typescript`.
    That is only sound if the gate runs after the lockfile install — so the
    ordering is asserted rather than assumed, in CI and in the aggregate check.
    """
    assert _external_imports("check-source-imports.mjs") == ["typescript"], (
        "the source import gate should need the TypeScript parser and nothing else"
    )

    # Declared at the pinned catalog version, like every other external dependency.
    root_manifest = json.loads((REPO_ROOT / "package.json").read_text())
    assert root_manifest["devDependencies"]["typescript"] == "catalog:"

    governance = governance_jobs()["governance"]
    assert governance.index("pnpm install --frozen-lockfile") < governance.index("check:imports"), (
        "the merge gate must install before running the source import check"
    )

    check_sh = (REPO_ROOT / "scripts" / "check.sh").read_text()
    assert check_sh.index("pnpm install --frozen-lockfile") < check_sh.index("check:imports")


def test_the_governance_test_suite_is_not_path_gated() -> None:
    """Regression: these tests ran only when a Python fan-out path changed.

    `tests/test_source_imports.py` guards an unconditional gate, but the
    unconditional job ran a hand-listed subset that did not include it — so it
    executed only when something happened to touch `pyproject.toml`, `uv.lock`,
    or the workflow. A test for a governance gate that itself runs conditionally
    is not a governance test.
    """
    classifier = governance_jobs()["classifier"]
    assert "uv run pytest -q" in classifier, (
        "the unconditional job must run the whole suite, not a hand-maintained list "
        "that a new governance test can be forgotten from"
    )

    # These tests invoke the real checks as subprocesses, and the source-import
    # check parses with TypeScript. Skipping them when the module is absent
    # would verify an unconditional gate conditionally, so the job installs the
    # toolchain instead.
    assert "pnpm install --frozen-lockfile" in classifier, (
        "the governance suite runs the real checks, so its job must install them"
    )

    # And the path-gated Python job must not be where the suite lives.
    python_job = job_sections()["python"]
    assert "uv run pytest" not in python_job, (
        "the governance suite must not run behind a path filter — that is strictly "
        "weaker than the unconditional job that already runs it"
    )
