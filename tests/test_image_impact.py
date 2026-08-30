"""Governed-image CI impact, closure, planning, and workflow tests.

The expensive build may disappear only behind a positive proof. These tests
exercise the real git-diff classifier against committed fixture revisions,
including its denial paths, then inspect the real Bake plan and workflow so a
selection bug cannot silently turn into a green skipped build.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypedDict, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
CLASSIFIER = REPO_ROOT / "scripts" / "image-impact.mjs"
PLANNER = REPO_ROOT / "deploy" / "images" / "scripts" / "build-plan.mjs"
VERIFY = REPO_ROOT / "deploy" / "images" / "scripts" / "verify.sh"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "images.yml"

BASE = "secure-home-runner-base"
CLAUDE = "secure-home-runner-claude"
COPILOT = "secure-home-runner-copilot"
GATES = "secure-home-gates-toolchain"
ALL_IMAGES = [BASE, CLAUDE, COPILOT, GATES]


class Impact(TypedDict):
    decision: str
    marker: str
    selectionMode: str
    buildRequired: bool
    affected: list[str]
    direct: list[str]
    inventory: list[str]
    reasons: dict[str, list[str]]
    unknownReasons: list[str]
    pathNotes: list[str]


def _run(
    *args: str, cwd: Path, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _git(root: Path, *args: str) -> str:
    result = _run("git", *args, cwd=root)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def _copy(root: Path, relative: str) -> None:
    source = REPO_ROOT / relative
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


@pytest.fixture
def image_repo(tmp_path: Path) -> Path:
    """A committed image-governance tree using the repository's real bytes."""
    root = tmp_path / "repo"
    root.mkdir()
    for relative in (
        "deploy/images",
        "deploy/runtime",
        "packages/contracts/src/conformance/helpers.ts",
        "profiles",
        "services/runner-control/src",
        ".github/workflows/checks.yml",
        ".github/workflows/images.yml",
        "package.json",
        "scripts/check.sh",
        "scripts/check-images.mjs",
        "scripts/image-impact.mjs",
        "scripts/pr-merge-plan.mjs",
        "README.md",
        "docs/README.md",
    ):
        _copy(root, relative)
    review_gate = root / ".github/workflows/review-boundary.yml"
    review_gate.write_text("name: review-boundary\n")
    source = root / "apps/web/src/unrelated.ts"
    source.parent.mkdir(parents=True)
    source.write_text("export const unrelated = true\n")

    _git(root, "init", "-q")
    _git(root, "config", "user.name", "Image Impact Tests")
    _git(root, "config", "user.email", "image-impact@example.invalid")
    _git(root, "add", ".")
    _git(root, "commit", "-qm", "fixture base")
    return root


def _commit(root: Path, message: str = "candidate") -> tuple[str, str]:
    base = _git(root, "rev-parse", "HEAD")
    _git(root, "add", "-A")
    _git(root, "commit", "-qm", message)
    return base, _git(root, "rev-parse", "HEAD")


def _impact(
    root: Path,
    base: str,
    head: str = "HEAD",
    *,
    env: dict[str, str] | None = None,
) -> Impact:
    result = _run(
        "node",
        str(CLASSIFIER),
        "--root",
        str(root),
        "--base",
        base,
        "--head",
        head,
        "--json",
        # Keep Volta anchored to this repository's valid package.json. The
        # candidate root is passed explicitly and may intentionally contain a
        # malformed manifest in fail-closed tests.
        cwd=REPO_ROOT,
        env=env,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    parsed: Impact = json.loads(result.stdout)
    return parsed


def _mutated_impact(image_repo: Path, mutate: Callable[[Path], None]) -> Impact:
    mutate(image_repo)
    base, head = _commit(image_repo)
    return _impact(image_repo, base, head)


def _append(path: Path, text: str = "\n# image-impact test\n") -> None:
    path.write_text(path.read_text() + text)


def _replace(path: Path, before: str, after: str) -> None:
    text = path.read_text()
    assert before in text
    path.write_text(text.replace(before, after))


# ── no-impact proof ----------------------------------------------------------


def test_empty_diff_requires_no_build(image_repo: Path) -> None:
    head = _git(image_repo, "rev-parse", "HEAD")
    result = _impact(image_repo, head, head)
    assert result["decision"] == "none"
    assert result["affected"] == []


@pytest.mark.parametrize(
    ("relative", "mutation"),
    [
        ("docs/README.md", lambda path: _append(path, "\nImage CI prose only.\n")),
        ("apps/web/src/unrelated.ts", lambda path: _append(path, "export const next = 2\n")),
        (
            ".github/workflows/review-boundary.yml",
            lambda path: _append(path, "\n# review-only gate change\n"),
        ),
        ("scripts/check.sh", lambda path: _append(path, "\n# mounted gate behavior only\n")),
        (
            ".github/workflows/checks.yml",
            lambda path: _append(path, "\n# no governed tool version changed\n"),
        ),
    ],
)
def test_unconsumed_repository_changes_require_no_build(
    image_repo: Path,
    relative: str,
    mutation: Callable[[Path], None],
) -> None:
    result = _mutated_impact(image_repo, lambda root: mutation(root / relative))
    assert result["decision"] == "none"
    assert result["affected"] == []


def test_unrelated_package_json_dependency_requires_no_build(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        manifest = json.loads((root / "package.json").read_text())
        manifest["devDependencies"]["unrelated-example"] = "1.0.0"
        (root / "package.json").write_text(json.dumps(manifest, indent=2) + "\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "none"
    assert result["affected"] == []
    assert any("consumed pnpm version unchanged" in note for note in result["pathNotes"])


def test_unconsumed_package_manager_integrity_suffix_requires_no_build(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        manifest = root / "package.json"
        text = manifest.read_text()
        marker = "+sha512."
        prefix, digest = text.split(marker, 1)
        manifest.write_text(prefix + marker + ("0" if digest[0] != "0" else "1") + digest[1:])

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "none"
    assert result["affected"] == []


def test_file_inside_context_but_not_copied_requires_no_build(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        path = root / "deploy/images/runner-claude/notes.txt"
        path.write_text("not selected by COPY or ADD\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "none"
    assert any("not selected by Dockerfile COPY/ADD" in note for note in result["pathNotes"])


# ── direct and transitive impact --------------------------------------------


def test_leaf_dockerfile_change_selects_only_that_leaf(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append(root / "deploy/images/runner-claude/Dockerfile"),
    )
    assert result["decision"] == "affected"
    assert result["direct"] == [CLAUDE]
    assert result["affected"] == [CLAUDE]


def test_copied_manifest_change_selects_its_image(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        manifest = root / "deploy/images/runner-copilot/packages.amd64.manifest"
        text = manifest.read_text()
        manifest.write_text(text.replace("  ", "   ", 1))

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "affected"
    assert result["affected"] == [COPILOT]


def test_base_change_selects_every_dependent_but_not_gates(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append(root / "deploy/images/runner-base/Dockerfile"),
    )
    assert result["direct"] == [BASE]
    assert result["affected"] == [BASE, CLAUDE, COPILOT]
    assert GATES not in result["affected"]


def test_child_change_does_not_select_its_sibling(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append(root / "deploy/images/runner-copilot/Dockerfile"),
    )
    assert result["affected"] == [COPILOT]
    assert CLAUDE not in result["affected"]


def test_gates_change_is_independent_of_runner_lineage(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append(root / "deploy/images/gates-toolchain/Dockerfile"),
    )
    assert result["affected"] == [GATES]
    assert BASE not in result["affected"]


def test_package_manager_version_change_selects_gates(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        package = root / "package.json"
        _replace(package, "pnpm@11.18.0+", "pnpm@11.19.0+")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "affected"
    assert result["affected"] == [GATES]
    assert any(
        "packageManager pnpm version changed" in reason for reason in result["reasons"][GATES]
    )


@pytest.mark.parametrize(
    ("source", "replacement"),
    [
        ("NODE_VERSION: '24.18.1'", "NODE_VERSION: '24.19.0'"),
        ("UV_VERSION: '0.12.1'", "UV_VERSION: '0.12.2'"),
    ],
)
def test_checks_tool_pin_change_selects_gates(
    image_repo: Path,
    source: str,
    replacement: str,
) -> None:
    def mutate(root: Path) -> None:
        checks = root / ".github/workflows/checks.yml"
        _replace(checks, source, replacement)

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == [GATES]


def test_runtime_pin_change_selects_only_owning_leaf(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        dockerfile = root / "deploy/images/runner-claude/Dockerfile"
        lock = root / "deploy/images/image-lock.yaml"
        _replace(dockerfile, "2.1.241", "2.1.242")
        _replace(lock, "version: 2.1.241", "version: 2.1.242")

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == [CLAUDE]


def test_external_base_change_selects_base_closure(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        old = "3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258"
        new = "1" * 64
        dockerfile = root / "deploy/images/runner-base/Dockerfile"
        lock = root / "deploy/images/image-lock.yaml"
        _replace(dockerfile, old, new)
        # Replace only the runner-base lock occurrence, not gates-toolchain.
        text = lock.read_text()
        first = text.index(old)
        lock.write_text(text[:first] + new + text[first + len(old) :])

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == [BASE, CLAUDE, COPILOT]


def test_image_lock_identity_change_selects_owning_leaf(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        lock = root / "deploy/images/image-lock.yaml"
        old = "sha256:62b699f72c0fedf832721a8d74e94007f00f359585e606efd352130d5c9c5721"
        _replace(lock, old, "sha256:" + "2" * 64)

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == [CLAUDE]


def test_toolchain_inventory_change_selects_gates(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        inventory = root / "deploy/images/gates-toolchain/toolchain.json"
        data = json.loads(inventory.read_text())
        data["$comment"] += " Impact-model evidence."
        inventory.write_text(json.dumps(data, indent=2) + "\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == [GATES]


@pytest.mark.parametrize(
    "relative",
    [
        ".github/workflows/images.yml",
        "scripts/check-images.mjs",
        "scripts/image-impact.mjs",
        "deploy/images/scripts/build.sh",
        "deploy/images/scripts/build-plan.mjs",
        "deploy/images/scripts/verify.sh",
        "deploy/images/debian-closure.lock.json",
    ],
)
def test_global_build_or_proof_input_selects_full_set(
    image_repo: Path,
    relative: str,
) -> None:
    result = _mutated_impact(image_repo, lambda root: _append(root / relative))
    assert result["affected"] == ALL_IMAGES


def test_overlapping_impacts_are_deduplicated_in_lock_order(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        _append(root / "deploy/images/runner-base/Dockerfile")
        _append(root / "deploy/images/runner-claude/Dockerfile")
        _append(root / "deploy/images/gates-toolchain/Dockerfile")

    result = _mutated_impact(image_repo, mutate)
    assert result["affected"] == ALL_IMAGES
    assert len(result["affected"]) == len(set(result["affected"]))


# ── fail-closed behavior -----------------------------------------------------


def test_invalid_base_ref_selects_full_set(image_repo: Path) -> None:
    result = _impact(image_repo, "not-a-real-ref")
    assert result["decision"] == "unknown"
    assert result["selectionMode"] == "all"
    assert result["affected"] == ALL_IMAGES
    assert any("cannot be resolved" in reason for reason in result["unknownReasons"])


def test_failed_git_diff_selects_full_set(image_repo: Path, tmp_path: Path) -> None:
    wrapper = tmp_path / "git-wrapper"
    real_git = shutil.which("git")
    assert real_git is not None
    wrapper.write_text(
        "#!/usr/bin/env bash\n"
        'if [ "$1" = "diff" ]; then echo "forced diff failure" >&2; exit 42; fi\n'
        f'exec "{real_git}" "$@"\n'
    )
    wrapper.chmod(0o755)
    env = os.environ.copy()
    env["IMAGE_IMPACT_GIT"] = str(wrapper)
    head = _git(image_repo, "rev-parse", "HEAD")
    result = _impact(image_repo, head, env=env)
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any("git diff" in reason for reason in result["unknownReasons"])


def test_malformed_image_lock_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        _append(root / "deploy/images/image-lock.yaml", "\ninvalid: [flow]\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert result["selectionMode"] == "all"


def test_malformed_toolchain_metadata_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        (root / "deploy/images/gates-toolchain/toolchain.json").write_text("{\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES


def test_malformed_shared_closure_metadata_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        (root / "deploy/images/debian-closure.lock.json").write_text("{\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any(
        "debian-closure.lock.json is malformed" in reason for reason in result["unknownReasons"]
    )


def test_unknown_shared_image_input_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        (root / "deploy/images/new-shared-input.lock").write_text("unknown relationship\n")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any("unclassified shared" in reason for reason in result["unknownReasons"])


def test_missing_governed_dependency_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        lock = root / "deploy/images/image-lock.yaml"
        _replace(lock, "parent: secure-home-runner-base", "parent: secure-home-missing")

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert any("missing governed dependency" in reason for reason in result["unknownReasons"])


def test_dependency_cycle_selects_full_set(image_repo: Path) -> None:
    def mutate(root: Path) -> None:
        lock = root / "deploy/images/image-lock.yaml"
        text = lock.read_text()
        first = text.index("parent: secure-home-runner-base")
        text = text[:first] + text[first:].replace(
            "parent: secure-home-runner-base", f"parent: {COPILOT}", 1
        )
        second = text.index("parent: secure-home-runner-base", first)
        text = text[:second] + text[second:].replace(
            "parent: secure-home-runner-base", f"parent: {CLAUDE}", 1
        )
        lock.write_text(text)

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert any("dependency cycle" in reason for reason in result["unknownReasons"])


@pytest.mark.parametrize(
    ("relative", "content"),
    [
        ("package.json", "{\n"),
        (".github/workflows/checks.yml", "name: checks\n"),
    ],
)
def test_semantic_extraction_failure_selects_full_set(
    image_repo: Path,
    relative: str,
    content: str,
) -> None:
    def mutate(root: Path) -> None:
        (root / relative).write_text(content)

    result = _mutated_impact(image_repo, mutate)
    assert result["decision"] == "unknown"
    assert result["selectionMode"] == "all"
    assert any("semantic extraction failed" in reason for reason in result["unknownReasons"])


# ── P1-1 closed Dockerfile grammar -------------------------------------------
#
# Every logical Dockerfile instruction is modeled as an input, proven not to
# consume the build context, or refused (IMAGE_IMPACT_UNKNOWN → full build).
# There is no silent skip for an unmodeled context consumer, so a no-build proof
# is always positive. These drive the real classifier through Git fixtures.

CLAUDE_DOCKERFILE = "deploy/images/runner-claude/Dockerfile"
CLAUDE_DIR = "deploy/images/runner-claude"


def _append_dockerfile(root: Path, relative: str, line: str) -> None:
    path = root / relative
    path.write_text(path.read_text() + line + "\n")


def _two_commits(
    image_repo: Path,
    at_a: Callable[[Path], None],
    at_b: Callable[[Path], None],
) -> Impact:
    """Commit A (establish the construct), commit B (the isolated change)."""
    at_a(image_repo)
    _git(image_repo, "add", "-A")
    _git(image_repo, "commit", "-qm", "A")
    a = _git(image_repo, "rev-parse", "HEAD")
    at_b(image_repo)
    _git(image_repo, "add", "-A")
    _git(image_repo, "commit", "-qm", "B")
    b = _git(image_repo, "rev-parse", "HEAD")
    return _impact(image_repo, a, b)


def test_run_mount_bind_payload_change_cannot_be_none(image_repo: Path) -> None:
    """MUTATION A: a file consumed only by RUN --mount must never yield NONE."""

    def at_a(root: Path) -> None:
        (root / CLAUDE_DIR / "payload.txt").write_text("payload-v1\n")
        _append_dockerfile(
            root,
            CLAUDE_DOCKERFILE,
            "RUN --mount=type=bind,source=payload.txt,target=/tmp/payload cat /tmp/payload",
        )

    def at_b(root: Path) -> None:
        (root / CLAUDE_DIR / "payload.txt").write_text("payload-v2\n")

    result = _two_commits(image_repo, at_a, at_b)
    assert result["decision"] != "none"
    assert result["marker"] != "IMAGE_IMPACT_NONE"
    assert result["affected"] == ALL_IMAGES
    assert any(
        "RUN --mount bind reads the build context" in reason for reason in result["unknownReasons"]
    )


def test_run_mount_bind_without_type_reads_context_and_fails_closed(image_repo: Path) -> None:
    # type= defaults to bind, so an omitted type still reads the build context.
    result = _mutated_impact(
        image_repo,
        lambda root: _append_dockerfile(
            root, CLAUDE_DOCKERFILE, "RUN --mount=target=/tmp/ctx ls /tmp/ctx"
        ),
    )
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES


@pytest.mark.parametrize(
    "mount",
    [
        "RUN --mount=type=cache,target=/root/.cache echo cache",
        "RUN --mount=type=secret,id=tok echo secret",
        "RUN --mount=type=ssh echo ssh",
        "RUN --mount=type=tmpfs,target=/scratch echo tmpfs",
        "RUN --mount=type=bind,from=secure-home-runner-base,source=/x,target=/y cat /y",
    ],
)
def test_safe_run_mounts_do_not_poison_the_classifier(image_repo: Path, mount: str) -> None:
    # A non-context mount (cache/secret/ssh/tmpfs) or a bind FROM the registered
    # parent is not a repository input: the classifier must still resolve a
    # normal leaf change rather than failing closed.
    def at_a(root: Path) -> None:
        _append_dockerfile(root, CLAUDE_DOCKERFILE, mount)

    def at_b(root: Path) -> None:
        _append(root / "deploy/images/runner-copilot/Dockerfile")

    result = _two_commits(image_repo, at_a, at_b)
    assert result["decision"] == "affected"
    assert result["affected"] == [COPILOT]


def test_ambiguous_copy_from_named_context_fails_closed(image_repo: Path) -> None:
    # --from that is neither a declared stage nor the registered parent could be
    # a repository-backed named context; the closed grammar refuses it.
    result = _mutated_impact(
        image_repo,
        lambda root: _append_dockerfile(
            root, CLAUDE_DOCKERFILE, "COPY --from=some-named-context /a /b"
        ),
    )
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any("--from=some-named-context" in reason for reason in result["unknownReasons"])


def test_copy_from_registered_parent_is_internal_not_a_new_input(image_repo: Path) -> None:
    # --from=<registered parent> resolves to the OCI-layout parent context the
    # build plan wires; it is internal, not a new repository input.
    def at_a(root: Path) -> None:
        _append_dockerfile(
            root, CLAUDE_DOCKERFILE, "COPY --from=secure-home-runner-base /etc/os-release /tmp/o"
        )

    def at_b(root: Path) -> None:
        _append(root / "deploy/images/runner-copilot/Dockerfile")

    result = _two_commits(image_repo, at_a, at_b)
    assert result["decision"] == "affected"
    assert result["affected"] == [COPILOT]


def test_copy_from_declared_stage_is_internal(image_repo: Path) -> None:
    def at_a(root: Path) -> None:
        _append_dockerfile(
            root,
            CLAUDE_DOCKERFILE,
            "FROM secure-home-runner-base AS helper\nCOPY --from=helper /etc/os-release /tmp/o",
        )

    def at_b(root: Path) -> None:
        _append(root / "deploy/images/runner-copilot/Dockerfile")

    result = _two_commits(image_repo, at_a, at_b)
    assert result["decision"] == "affected"
    assert result["affected"] == [COPILOT]


def test_onbuild_fails_closed(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append_dockerfile(root, CLAUDE_DOCKERFILE, "ONBUILD COPY extra /extra"),
    )
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any("ONBUILD" in reason for reason in result["unknownReasons"])


def test_unrecognized_instruction_fails_closed(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append_dockerfile(root, CLAUDE_DOCKERFILE, "FROBNICATE payload.txt"),
    )
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES
    assert any(
        "unrecognized instruction FROBNICATE" in reason for reason in result["unknownReasons"]
    )


def test_unrecognized_run_flag_fails_closed(image_repo: Path) -> None:
    result = _mutated_impact(
        image_repo,
        lambda root: _append_dockerfile(root, CLAUDE_DOCKERFILE, "RUN --frobnicate=1 echo hi"),
    )
    assert result["decision"] == "unknown"
    assert result["affected"] == ALL_IMAGES


def test_pr_merge_plan_change_selects_full_set(image_repo: Path) -> None:
    # The merge-composition proof machinery is a global build input.
    result = _mutated_impact(image_repo, lambda root: _append(root / "scripts/pr-merge-plan.mjs"))
    assert result["affected"] == ALL_IMAGES


# ── deterministic build plan -------------------------------------------------


def _plan(
    tmp_path: Path,
    *,
    selection: str,
    images: list[str],
    cache: str = "gha",
) -> dict[str, Any]:
    out = tmp_path / "out"
    result = _run(
        "node",
        str(PLANNER),
        "plan",
        "--root",
        str(REPO_ROOT),
        "--out",
        str(out),
        "--selection",
        selection,
        "--images-json",
        json.dumps(images),
        "--cache",
        cache,
        cwd=REPO_ROOT,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    plan = json.loads((out / "build-plan.json").read_text())
    plan["rootsBake"] = json.loads((out / "roots-bake.json").read_text())
    plan["derivedBake"] = json.loads((out / "derived-bake.json").read_text())
    return cast(dict[str, Any], plan)


def test_full_plan_parallelizes_roots_then_children(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="all", images=[])
    assert plan["support"] == []
    assert plan["phases"]["roots"] == [BASE, GATES]
    assert plan["phases"]["parents"] == [BASE]
    assert plan["phases"]["derived"] == [CLAUDE, COPILOT]
    assert plan["rootsBake"]["group"]["selected"]["targets"] == [BASE, GATES]
    assert plan["derivedBake"]["group"]["selected"]["targets"] == [CLAUDE, COPILOT]


def test_leaf_plan_adds_only_verified_parent_support(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="selected", images=[CLAUDE])
    assert plan["selected"] == [CLAUDE]
    assert plan["support"] == [BASE]
    assert plan["outputs"] == [BASE, CLAUDE]
    assert COPILOT not in plan["outputs"]
    assert GATES not in plan["outputs"]


def test_base_plan_adds_transitive_children_not_independent_gates(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="selected", images=[BASE])
    assert plan["selected"] == [BASE, CLAUDE, COPILOT]
    assert plan["outputs"] == [BASE, CLAUDE, COPILOT]
    assert GATES not in plan["outputs"]


def test_gates_plan_does_not_materialize_runner_base(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="selected", images=[GATES])
    assert plan["outputs"] == [GATES]
    assert plan["phases"]["derived"] == []


def test_build_plan_deduplicates_and_preserves_lock_order(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="selected", images=[GATES, CLAUDE, CLAUDE])
    assert plan["requested"] == [CLAUDE, GATES]
    assert plan["outputs"] == [BASE, CLAUDE, GATES]


def test_each_image_has_distinct_multi_platform_cache_scope(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="all", images=[])
    scopes = list(plan["cacheScopes"].values())
    assert len(scopes) == len(set(scopes)) == 4
    assert all(
        platforms == ["linux/amd64", "linux/arm64"] for platforms in plan["platforms"].values()
    )
    for bake in (plan["rootsBake"], plan["derivedBake"]):
        for target in bake["target"].values():
            assert target["cache-to"][0].endswith(",mode=max")


def test_derived_plan_uses_exact_locked_parent_digest(tmp_path: Path) -> None:
    plan = _plan(tmp_path, selection="selected", images=[CLAUDE])
    context = plan["derivedBake"]["target"][CLAUDE]["contexts"][BASE]
    assert context.startswith("oci-layout:///")
    assert context.endswith(
        "@sha256:344b59fa8a1ec66535fea31b44dc3912accdbd68c981982d641a7c753261a1b8"
    )


def test_unknown_plan_image_is_refused(tmp_path: Path) -> None:
    out = tmp_path / "out"
    result = _run(
        "node",
        str(PLANNER),
        "plan",
        "--root",
        str(REPO_ROOT),
        "--out",
        str(out),
        "--selection",
        "selected",
        "--images-json",
        '["secure-home-not-real"]',
        cwd=REPO_ROOT,
    )
    assert result.returncode == 1
    assert "unknown governed image" in result.stderr


# ── selected-output digest verification -------------------------------------


def _verification_fixture(tmp_path: Path) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    out = tmp_path / "verification"
    out.mkdir()
    projection = _run(
        "node",
        str(REPO_ROOT / "scripts/check-images.mjs"),
        "--print",
        cwd=REPO_ROOT,
    )
    assert projection.returncode == 0, projection.stdout + projection.stderr
    lock = cast(dict[str, Any], json.loads(projection.stdout))
    by_name = {image["name"]: image for image in lock["images"]}
    plan: dict[str, Any] = {
        "version": 1,
        "selectionMode": "selected",
        "requested": [CLAUDE],
        "selected": [CLAUDE],
        "support": [BASE],
        "outputs": [BASE, CLAUDE],
        "phases": {
            "roots": [BASE],
            "parents": [BASE],
            "derived": [CLAUDE],
        },
    }
    built = {
        name: {
            "digest": by_name[name]["digest"],
            "manifests": {
                manifest["platform"]: manifest["digest"] for manifest in by_name[name]["manifests"]
            },
        }
        for name in plan["outputs"]
    }
    (out / "lock.json").write_text(json.dumps(lock))
    (out / "build-plan.json").write_text(json.dumps(plan))
    (out / "digests.json").write_text(json.dumps(built))
    return out, lock, built


def _verify(out: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update({"CI": "true", "IMAGES_OUT": str(out)})
    return _run("bash", str(VERIFY), *args, cwd=REPO_ROOT, env=env)


def test_partial_proof_verifies_selected_outputs_without_assuming_siblings(tmp_path: Path) -> None:
    out, _, _ = _verification_fixture(tmp_path)
    result = _verify(out)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "every selected identity equals" in result.stdout


def test_missing_selected_output_is_refused(tmp_path: Path) -> None:
    out, _, built = _verification_fixture(tmp_path)
    built.pop(CLAUDE)
    (out / "digests.json").write_text(json.dumps(built))
    result = _verify(out)
    assert result.returncode == 1
    assert f"{CLAUDE}: selected but not built" in result.stderr


def test_parent_digest_mismatch_is_refused(tmp_path: Path) -> None:
    out, _, built = _verification_fixture(tmp_path)
    built[BASE]["digest"] = "sha256:" + "f" * 64
    (out / "digests.json").write_text(json.dumps(built))
    result = _verify(out)
    assert result.returncode == 1
    assert "parent_digest" in result.stderr


def test_bootstrap_parent_can_continue_only_in_intermediate_phase(tmp_path: Path) -> None:
    out, lock, built = _verification_fixture(tmp_path)
    for image in lock["images"]:
        if image["name"] == BASE:
            image["digest"] = "pending-first-governed-build"
            for manifest in image["manifests"]:
                manifest["digest"] = "pending-first-governed-build"
        if image["name"] == CLAUDE:
            image["parent_digest"] = "pending-first-governed-build"
    (out / "lock.json").write_text(json.dumps(lock))

    (out / "digests.json").write_text(json.dumps({BASE: built[BASE]}))
    intermediate = _verify(out, "--phase", "parents", "--allow-pending")
    assert intermediate.returncode == 0, intermediate.stdout + intermediate.stderr
    (out / "digests.json").write_text(json.dumps(built))
    final = _verify(out)
    assert final.returncode == 1
    assert "pending-first-governed-build" in final.stderr


def test_digest_evidence_outside_plan_is_refused(tmp_path: Path) -> None:
    out, lock, built = _verification_fixture(tmp_path)
    gates = next(image for image in lock["images"] if image["name"] == GATES)
    built[GATES] = {
        "digest": gates["digest"],
        "manifests": {manifest["platform"]: manifest["digest"] for manifest in gates["manifests"]},
    }
    (out / "digests.json").write_text(json.dumps(built))
    result = _verify(out)
    assert result.returncode == 1
    assert "outside the build plan" in result.stderr


# ── workflow construction ----------------------------------------------------


def test_workflow_keeps_broad_paths_and_adds_semantic_classifier() -> None:
    workflow = WORKFLOW.read_text()
    for path in (
        "deploy/images/**",
        ".github/workflows/images.yml",
        "scripts/check-images.mjs",
        "scripts/image-impact.mjs",
        ".github/workflows/checks.yml",
        "package.json",
        "scripts/check.sh",
    ):
        assert workflow.count(f"'{path}'") >= 2 or path == "deploy/images/**"


def test_no_impact_exits_before_qemu_or_buildx() -> None:
    workflow = WORKFLOW.read_text()
    no_build = workflow.index("- name: No governed build required")
    qemu = workflow.index("- name: Set up QEMU")
    buildx = workflow.index("- name: Set up Buildx")
    assert no_build < qemu < buildx
    assert workflow.count("if: steps.impact.outputs.build_required == 'true'") >= 6


def test_built_outputs_are_verified_before_and_after_derived_phase() -> None:
    workflow = WORKFLOW.read_text()
    roots = workflow.index("- name: Governed root builds")
    verify_parent = workflow.index("- name: Verify parent identities")
    derived = workflow.index("- name: Governed derived builds")
    verify_final = workflow.index("- name: Verify selected digests")
    assert roots < verify_parent < derived < verify_final
    assert "verify.sh --phase parents --allow-pending" in workflow
    assert "bash deploy/images/scripts/verify.sh\n" in workflow


def test_pr_runs_cancel_but_push_and_dispatch_runs_do_not() -> None:
    workflow = WORKFLOW.read_text()
    assert (
        "group: images-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}"
        in workflow
    )
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in workflow
    assert "push:\n    branches: [main]" in workflow
    assert "workflow_dispatch:" in workflow


def test_required_image_check_name_is_preserved() -> None:
    workflow = WORKFLOW.read_text()
    assert "name: images" in workflow
    assert "name: build and verify image identities" in workflow


def test_pr_run_proves_the_composed_live_base_plus_head_tree() -> None:
    workflow = WORKFLOW.read_text()
    # Full history, and the checkout starts at the exact PR head.
    assert "fetch-depth: 0" in workflow
    assert "github.event.pull_request.head.sha" in workflow
    # The live base ref (not base.sha) drives resolution, the merge is composed
    # by the plan module, and the composed tree is checked out for the proof.
    assert "github.event.pull_request.base.ref" in workflow
    assert "node scripts/pr-merge-plan.mjs plan" in workflow
    assert "git checkout --quiet --detach" in workflow
    # The previous-head fast path still requires an exact-SHA successful proof.
    assert "status=success" in workflow
    assert "--previous-proven" in workflow
    # base.sha is NOT consumed as the live-base authority anywhere (it may only
    # be mentioned in prose explaining why it is not used).
    assert "${{ github.event.pull_request.base.sha" not in workflow
    assert "steps.comparison.outputs.base " not in workflow


def test_pr_run_rechecks_head_and_base_for_toctou() -> None:
    workflow = WORKFLOW.read_text()
    assert "node scripts/pr-merge-plan.mjs verify" in workflow
    assert "--expected-live-base" in workflow
    assert "--expected-pr-head" in workflow
    toctou = workflow.index("node scripts/pr-merge-plan.mjs verify")
    verify_final = workflow.index("- name: Verify selected digests")
    # The TOCTOU boundary check runs after the digest proof.
    assert verify_final < toctou


def test_workflow_does_not_claim_branch_protection() -> None:
    workflow = WORKFLOW.read_text().lower()
    assert "protected/default-branch" not in workflow
    assert "main is protected" not in workflow


def test_manual_or_unknown_comparison_forces_full_selection() -> None:
    workflow = WORKFLOW.read_text()
    assert "manual invocation has no trusted comparison; full verification required" in workflow
    assert 'args+=(--force-all "$COMPARISON_NOTE")' in workflow
    assert "IMAGE_SELECTION_MODE: ${{ steps.impact.outputs.selection_mode }}" in workflow


def test_workflow_preserves_both_platforms_and_immutable_build_machinery() -> None:
    workflow = WORKFLOW.read_text()
    assert "platforms: arm64" in workflow
    assert "v0.36.1" in workflow
    assert (
        "docker.io/moby/buildkit:v0.32.2@sha256:"
        "28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8" in workflow
    )
    for line in workflow.splitlines():
        if "uses:" not in line:
            continue
        reference = line.split("uses:", 1)[1].split("#", 1)[0].strip()
        assert "@" in reference
        assert len(reference.rsplit("@", 1)[1]) == 40


def test_documented_build_entry_point_still_defaults_to_full_build() -> None:
    build = (REPO_ROOT / "deploy/images/scripts/build.sh").read_text()
    assert 'COMMAND="${1:-run}"' in build
    assert 'local selection="${IMAGE_SELECTION_MODE:-all}"' in build
    assert 'local images="${IMAGE_SELECTION_JSON:-[]}"' in build
