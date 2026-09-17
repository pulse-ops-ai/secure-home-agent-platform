"""Historical cutover proof must not freeze ordinary source or admit tool updates."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

import pytest

from workflow_model import governance_jobs, has_condition, step_field, step_run, workflow_steps

REPO = Path(__file__).resolve().parents[1]
HISTORY = REPO / "scripts/check-emit-history.mjs"
REPLAY = REPO / "scripts/emit-conformance.mjs"
CUTOVER = "4de51a4ea30a2480fb003143fc7374218689225d"
ARTIFACTS = (
    "tests/evidence/ts6-emit-baseline.json",
    "tests/evidence/ts6-migration-projection.json",
    "tests/evidence/ts6-migration-projection-v2.json",
)


def run(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=240)


def checked(root: Path, *args: str) -> str:
    result = run(root, *args)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def clone(tmp_path: Path, revision: str = "HEAD") -> Path:
    root = tmp_path / "subject"
    checked(tmp_path, "git", "clone", "--shared", "--quiet", "--no-checkout", str(REPO), str(root))
    checked(root, "git", "checkout", "--quiet", "--detach", revision)
    return root


def history(root: Path) -> subprocess.CompletedProcess[str]:
    return run(
        REPO,
        "node",
        "--input-type=module",
        "-e",
        f"import {{verifyHistoricalEvidence}} from {json.dumps(HISTORY.as_uri())};"
        f"verifyHistoricalEvidence({json.dumps(str(root))});",
    )


def replay(root: Path) -> subprocess.CompletedProcess[str]:
    return run(REPO, "node", str(REPLAY), "--verify", f"--from={root}")


def artifact_digests(root: Path) -> dict[str, str]:
    return {file: hashlib.sha256((root / file).read_bytes()).hexdigest() for file in ARTIFACTS}


def test_ordinary_emitted_source_can_change_without_rewriting_history(tmp_path: Path) -> None:
    """Drive the false-freeze case with real TS7 emission, outside the working tree."""
    root = clone(tmp_path)
    before_evidence = artifact_digests(root)
    source = root / "packages/logging/src/index.ts"
    compiler = REPO / "node_modules/.bin/tsc"
    output = tmp_path / "output"

    def emit() -> bytes:
        checked(
            tmp_path,
            str(compiler),
            str(source),
            "--target",
            "es2023",
            "--module",
            "esnext",
            "--outDir",
            str(output),
        )
        return (output / "index.js").read_bytes()

    before_output = emit()
    source.write_text(source.read_text() + "\nexport const lifecycleProbe = 42\n")
    after_output = emit()
    assert before_output != after_output
    assert b"lifecycleProbe = 42" in after_output
    result = history(root)
    assert result.returncode == 0, result.stderr
    assert artifact_digests(root) == before_evidence == artifact_digests(REPO)
    refused = replay(root)
    assert refused.returncode != 0
    assert "replay requires cutover revision" in refused.stderr


@pytest.mark.parametrize("file", ARTIFACTS)
@pytest.mark.parametrize("mutation", ["edit", "reseal", "delete", "symlink"])
def test_frozen_artifact_mutation_is_refused(tmp_path: Path, file: str, mutation: str) -> None:
    root = clone(tmp_path)
    target = root / file
    if mutation == "delete":
        target.unlink()
    elif mutation == "symlink":
        target.unlink()
        target.symlink_to(REPO / file)
    else:
        document = json.loads(target.read_text())
        document["capturedAtHead"] = "0" * 40
        if mutation == "reseal":
            body = {key: value for key, value in document.items() if key != "manifestSha256"}
            document["manifestSha256"] = hashlib.sha256(
                (json.dumps(body, indent=2) + "\n").encode()
            ).hexdigest()
        target.write_text(json.dumps(document, indent=2) + "\n")
    refused = history(root)
    assert refused.returncode != 0
    expected = {
        "delete": "ENOENT",
        "symlink": "frozen historical artifact must be a regular file",
        "edit": "frozen historical blob changed",
        "reseal": "frozen historical blob changed",
    }
    assert expected[mutation] in refused.stderr


def test_missing_historical_objects_is_a_refusal(tmp_path: Path) -> None:
    root = tmp_path / "no-history"
    root.mkdir()
    checked(root, "git", "init", "--quiet")
    for file in ARTIFACTS:
        target = root / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((REPO / file).read_bytes())
    refused = history(root)
    assert refused.returncode != 0
    assert "cat-file" in refused.stderr


@pytest.mark.parametrize("mutation", ["tracked", "untracked", "ignored"])
def test_dirty_historical_source_is_refused_before_compilation(
    tmp_path: Path, mutation: str
) -> None:
    root = clone(tmp_path, CUTOVER)
    if mutation == "tracked":
        source = root / "packages/logging/src/index.ts"
        source.write_text(source.read_text() + "\nexport const unexpected = 42\n")
    else:
        name = "packages/logging/src/unexpected.ts"
        if mutation == "ignored":
            (root / ".git/info/exclude").write_text(name + "\n")
        (root / name).write_text("export const unexpected = 42\n")
    assert not (root / "node_modules").exists(), "must refuse BEFORE executing any compiler"
    refused = replay(root)
    assert refused.returncode != 0
    assert (
        "ignored source" if mutation == "ignored" else "clean historical checkout"
    ) in refused.stderr


def test_future_compiler_cannot_be_substituted_into_historical_replay(tmp_path: Path) -> None:
    root = clone(tmp_path, CUTOVER)
    manifest = root / "node_modules/typescript/package.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(json.dumps({"version": "7.0.3"}))
    refused = replay(root)
    assert refused.returncode != 0
    assert "replay requires installed cutover compiler TypeScript 7.0.2" in refused.stderr


@pytest.mark.parametrize("flag", ["--assume-unchanged", "--skip-worktree"])
def test_git_index_flags_cannot_hide_replay_source_drift(tmp_path: Path, flag: str) -> None:
    root = clone(tmp_path, CUTOVER)
    file = "packages/logging/src/index.ts"
    checked(root, "git", "update-index", flag, file)
    source = root / file
    source.write_text(source.read_text() + "\ntype HiddenSourceEdit = number\n")
    assert checked(root, "git", "status", "--porcelain") == "", "control must hide the edit"
    refused = replay(root)
    assert refused.returncode != 0
    assert f"{file}: historical checkout bytes differ" in refused.stderr


def test_replay_must_name_its_historical_subject() -> None:
    refused = run(REPO, "node", str(REPLAY), "--verify")
    assert refused.returncode == 2
    assert "historical replay requires" in refused.stderr


def test_historical_cutover_differential_replays_with_unchanged_evidence(tmp_path: Path) -> None:
    """Actual historical workspace rebuild, offline, with the frozen lockfile.

    No TS6 capture command runs. Only TS7 output is produced, in this disposable
    checkout, then compared in memory with the original TS6 evidence.
    """
    root = clone(tmp_path, CUTOVER)
    before = artifact_digests(root)
    checked(root, "pnpm", "install", "--frozen-lockfile", "--offline")
    result = replay(root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"historical emitted-output conformance at {CUTOVER}" in result.stdout
    assert "not compiler-maintenance admission" in result.stdout
    assert artifact_digests(root) == before == artifact_digests(REPO)
    assert checked(root, "git", "status", "--porcelain") == ""


@pytest.mark.parametrize(
    "protected", ["packages/tsconfig/base.json", "scripts/check-toolchain-boundaries.mjs"]
)
def test_future_compiler_cannot_bypass_predecessor_maintenance(
    tmp_path: Path, protected: str
) -> None:
    root = clone(tmp_path)
    predecessor = checked(root, "git", "rev-parse", "HEAD")
    # Actual Git revisions and the actual predecessor planner/checker. This is
    # an offline classification fixture, never a real maintenance admission.
    planner = tmp_path / "planner.mjs"
    checker = tmp_path / "checker.mjs"
    planner.write_text(
        checked(root, "git", "show", f"{predecessor}:scripts/build-maintenance-plan.mjs")
    )
    checker.write_text(
        checked(root, "git", "show", f"{predecessor}:scripts/check-toolchain-boundaries.mjs")
    )
    for file in ["pnpm-workspace.yaml", "pnpm-lock.yaml"]:
        target = root / file
        text = target.read_text()
        updated = re.sub(r"7\.0\.2(?!\d)", "7.0.3", text)
        assert updated != text
        target.write_text(updated)

    def commit() -> str:
        checked(root, "git", "add", ".")
        checked(
            root,
            "git",
            "-c",
            "user.name=Lifecycle fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=/dev/null",
            "commit",
            "--quiet",
            "-m",
            "test: compiler candidate",
        )
        return checked(root, "git", "rev-parse", "HEAD")

    def classify(candidate: str) -> subprocess.CompletedProcess[str]:
        plan = checked(
            root,
            "node",
            str(planner),
            "--predecessor",
            predecessor,
            "--candidate",
            candidate,
            "--class",
            "normal-compiler",
        )
        return subprocess.run(
            ["node", str(checker), "--plan", "/dev/stdin"],
            input=plan,
            capture_output=True,
            text=True,
            cwd=root,
            timeout=60,
        )

    pin_only = classify(commit())
    assert pin_only.returncode == 0, pin_only.stderr
    # The positive control proves this fixture reaches protected-delta checking;
    # the exact-pin/lock-only result is structural eligibility, not admission.
    target = root / protected
    if protected.endswith(".mjs"):
        target.write_text("process.exit(0)\n")
        assert run(root, "node", str(target)).returncode == 0
    else:
        document = json.loads(target.read_text())
        document["compilerOptions"]["strict"] = False
        target.write_text(json.dumps(document))
    candidate = commit()
    assert history(root).returncode == 0, "historical success must not imply maintenance admission"
    refused = classify(candidate)
    assert refused.returncode != 0
    refusal = json.loads(refused.stderr)
    assert refusal["code"] == "UNDECLARED_CHANGE"
    assert protected in refusal["message"]


def test_only_historical_integrity_is_an_unconditional_emit_gate() -> None:
    workflow = (REPO / ".github/workflows/checks.yml").read_text()
    jobs = governance_jobs(workflow)
    owners = [name for name, text in jobs.items() if "pnpm run check:emit-history" in text]
    assert len(owners) == 1
    assert not has_condition(jobs[owners[0]])
    steps = workflow_steps(workflow, owners[0])
    integrity = [step for step in steps if "pnpm run check:emit-history" in step_run(step)]
    assert len(integrity) == 1
    assert step_field(integrity[0], "if") is None
    assert step_field(integrity[0], "continue-on-error") is None
    assert all("check:emit-conformance" not in step_run(step) for step in steps)
    aggregate = (REPO / "scripts/check.sh").read_text()
    assert 'run "typescript: emit history" pnpm run check:emit-history' in aggregate
    assert "check:emit-conformance" not in aggregate
    scripts = json.loads((REPO / "package.json").read_text())["scripts"]
    assert scripts["check:emit-conformance"] == "node scripts/emit-conformance.mjs --verify"
    assert scripts["check:emit-history"] == "node scripts/check-emit-history.mjs"
