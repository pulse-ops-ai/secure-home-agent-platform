"""The three-domain maintenance boundary (task 1.16, trust-critical).

A tool-maintenance candidate is a SUBJECT here, never the verifier. Its new tool
bytes must actually run for the claim to mean anything -- and a candidate that
ran as the verifier could simply report that it passed. So the executable
authority and the thing under test are separated, with an OS boundary between
them.

THE MUTATION THAT MATTERS MOST is the isolation one. A fresh runner with no
token, no credentials, no Docker socket, no shared cache and no trusted writes
still fails if the candidate runs as the launcher's own UID in the launcher's
filesystem: it can reach the plan it is supposed to obey, the artifacts it is
supposed to produce, and the verdict it is not supposed to influence. The two
boundaries are independent, and a perfect boundary 1 does not supply boundary 2.

PR-B cannot obtain authoritative evidence from this protocol. ``repository_
dispatch`` runs the DEFAULT BRANCH definition of the workflow, which only exists
there after PR-B merges, and the classifier separately refuses a predecessor
that does not contain the verifier. So these tests prove the protocol; they do
not represent a maintenance run.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
CHECKER = REPO / "scripts" / "check-toolchain-boundaries.mjs"
WORKFLOW = REPO / ".github" / "workflows" / "toolchain-maintenance-boundary.yml"

SHA_A = "a" * 40
SHA_B = "b" * 40


def _boundary(op: str, payload: dict[str, Any], tmp_path: Path) -> subprocess.CompletedProcess[str]:
    path = tmp_path / f"{op}.json"
    path.write_text(json.dumps(payload))
    return subprocess.run(
        ["node", str(CHECKER), "--boundary", op, str(path)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )


def _pack(policy: dict[str, Any], class_id: str) -> list[dict[str, Any]]:
    entry = next(e for e in policy["subjectCommandPacks"] if e["classId"] == class_id)
    commands: list[dict[str, Any]] = entry["commands"]
    return commands


@pytest.fixture(scope="module")
def policy() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(
        (REPO / "scripts" / "toolchain-boundaries.json").read_text()
    )
    return loaded


@pytest.fixture(scope="module")
def plan(policy: dict[str, Any]) -> dict[str, Any]:
    """A real plan, built by the predecessor-owned planner."""
    pack = _pack(policy, "lint-engine")
    request = {
        "predecessorSha": SHA_A,
        "candidateSha": SHA_B,
        "classId": "lint-engine",
        "candidatePins": {c["binary"]["package"]: "9.9.9" for c in pack},
        "inputDigests": {
            i["path"]: f"pred-{i['path']}"
            for c in pack
            for i in c["inputs"]
            if i["source"] == "predecessor"
        },
        "candidateInputDigests": {
            i["path"]: f"cand-{i['path']}"
            for c in pack
            for i in c["inputs"]
            if i["source"] == "candidate"
        },
    }
    result = subprocess.run(
        ["node", str(CHECKER), "--boundary", "plan-subject", "/dev/stdin"],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stderr
    built: dict[str, Any] = json.loads(result.stdout)["plan"]
    return built


def _envelope(plan: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    # Deep-copied on purpose: sharing the plan's dicts would let a mutation
    # change the expectation as well as the claim, and every substitution test
    # would pass vacuously.
    plan = json.loads(json.dumps(plan))
    envelope = {
        "schemaVersion": 1,
        "planDigest": plan["digest"],
        "predecessorSha": plan["predecessorSha"],
        "candidateSha": plan["candidateSha"],
        "results": [
            {
                "id": command["id"],
                "argv": command["argv"],
                "cwd": command["cwd"],
                "binary": command["binary"],
                "inputs": command["inputs"],
                # The outcome the predecessor expects, so the baseline is a
                # faithful run rather than an accidentally passing one.
                "exitCode": 0 if command["expect"]["outcome"] == "success" else 1,
            }
            for command in plan["commands"]
        ],
        "artifacts": {name: f"digest-of-{name}" for name in plan["expectedArtifacts"]},
    }
    envelope.update(overrides)
    return envelope


def _digests(plan: dict[str, Any]) -> dict[str, str]:
    return {name: f"digest-of-{name}" for name in plan["expectedArtifacts"]}


# --- trusted control: the plan is predecessor-owned --------------------------


def test_the_plan_is_content_addressed(plan: dict[str, Any]) -> None:
    assert len(plan["digest"]) == 64
    assert plan["predecessorSha"] == SHA_A
    assert plan["candidateSha"] == SHA_B


def test_the_candidate_cannot_choose_the_commands(
    plan: dict[str, Any], policy: dict[str, Any]
) -> None:
    """Commands come from the predecessor's CLASS pack, not the candidate."""
    pack = _pack(policy, "lint-engine")
    assert [c["id"] for c in plan["commands"]] == [c["id"] for c in pack]
    assert [c["argv"] for c in plan["commands"]] == [c["argv"] for c in pack]


def test_the_plan_binds_the_candidate_binary_identity(plan: dict[str, Any]) -> None:
    """A bare tool name would be satisfied by anything on PATH."""
    for command in plan["commands"]:
        assert command["binary"]["version"] == "9.9.9"
        assert command["binary"]["package"]
        assert command["cwd"], "relative argv paths are meaningless without a cwd"


def test_the_plan_pins_inputs_with_their_provenance(plan: dict[str, Any]) -> None:
    """A predecessor-sourced input must match; a candidate-sourced one may move.

    Pinning everything to the predecessor deadlocks the legitimate update: the
    pin a class exists to change is also an input, so the subject would
    truthfully report a digest the plan called wrong.
    """
    for command in plan["commands"]:
        assert command["inputs"], f"{command['id']} pins no inputs"
        for entry in command["inputs"]:
            assert entry["source"] in {"predecessor", "candidate"}
            assert entry["digest"]
    sources = {e["source"] for c in plan["commands"] for e in c["inputs"]}
    assert sources == {"predecessor", "candidate"}, (
        "the lint-engine pack must exercise both provenances: the generated "
        "config may move, the conformance corpus may not"
    )


def test_every_class_pack_exercises_the_tool_that_class_moves(
    policy: dict[str, Any],
) -> None:
    """A compiler update proved by running the lint engine proves nothing."""
    for klass in policy["maintenanceClasses"]:
        movable = {
            pkg
            for spec in klass["allowedProjections"]
            if spec["projection"] == "catalog-pins"
            for pkg in spec.get("packages", [])
        }
        exercised = {c["binary"]["package"] for c in _pack(policy, klass["id"])}
        assert movable <= exercised, f"{klass['id']} may move {movable - exercised} unexercised"


def test_every_pack_command_declares_an_expected_outcome(policy: dict[str, Any]) -> None:
    for entry in policy["subjectCommandPacks"]:
        for command in entry["commands"]:
            assert command["expect"]["outcome"] in {"success", "rejection"}, entry["classId"]


@pytest.mark.parametrize(
    ("label", "plan_request"),
    [
        (
            "a short candidate sha",
            {"predecessorSha": SHA_A, "candidateSha": "abc", "classId": "lint-engine"},
        ),
        (
            "a branch name instead of a sha",
            {"predecessorSha": SHA_A, "candidateSha": "main", "classId": "lint-engine"},
        ),
        (
            "the candidate as its own predecessor",
            {"predecessorSha": SHA_A, "candidateSha": SHA_A, "classId": "lint-engine"},
        ),
        (
            "an unknown class",
            {"predecessorSha": SHA_A, "candidateSha": SHA_B, "classId": "anything-goes"},
        ),
    ],
)
def test_planning_refuses_an_unresolved_identity(
    tmp_path: Path, label: str, plan_request: dict[str, Any]
) -> None:
    result = _boundary("plan-subject", plan_request, tmp_path)
    assert result.returncode != 0, label


# --- the two independent isolation boundaries -------------------------------

FULL_CONTROLS = [
    "non-root",
    "read-only trusted mounts",
    "no-new-privileges",
    "cap-drop-all",
    "explicit network policy",
    "resource limits",
    "isolated scratch",
]


def _isolation(**overrides: Any) -> dict[str, Any]:
    spec = {
        "grantedToSubject": [],
        "canWriteTrustedWorkspace": False,
        "scratch": "isolated",
        "processBoundary": "container",
        "containerControls": list(FULL_CONTROLS),
    }
    spec.update(overrides)
    return spec


def test_a_fully_isolated_subject_is_admitted(tmp_path: Path) -> None:
    assert _boundary("check-isolation", _isolation(), tmp_path).returncode == 0


def test_mut_maint_009_same_uid_refuses_despite_a_perfect_boundary_one(
    tmp_path: Path,
) -> None:
    """THE decisive case: boundary 1 is flawless and the run is still refused.

    No token, no credentials, no socket, no shared cache, no trusted writes,
    isolated scratch -- and the candidate still runs in the launcher's own
    execution context, where the plan, the artifacts and the verdict all live.
    """
    result = _boundary(
        "check-isolation", _isolation(processBoundary="same-uid", containerControls=[]), tmp_path
    )
    assert result.returncode != 0
    problems = json.loads(result.stderr)["problems"]
    assert any("boundary 2" in p for p in problems)
    assert not any("boundary 1" in p for p in problems), (
        "boundary 1 was clean; the refusal must come from the OS boundary alone"
    )


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("a token is handed to the subject", {"grantedToSubject": ["GITHUB_TOKEN"]}),
        ("persisted credentials survive", {"grantedToSubject": ["persisted credentials"]}),
        ("the Docker socket is mounted", {"grantedToSubject": ["Docker socket"]}),
        ("a shared build cache is reused", {"grantedToSubject": ["shared build cache"]}),
        ("repository secrets are present", {"grantedToSubject": ["repository secrets"]}),
        ("the subject can write the trusted workspace", {"canWriteTrustedWorkspace": True}),
        ("scratch is shared", {"scratch": "shared"}),
        (
            "the subject runs as root",
            {"containerControls": [c for c in FULL_CONTROLS if c != "non-root"]},
        ),
        (
            "capabilities are not dropped",
            {"containerControls": [c for c in FULL_CONTROLS if c != "cap-drop-all"]},
        ),
        (
            "privileges may be escalated",
            {"containerControls": [c for c in FULL_CONTROLS if c != "no-new-privileges"]},
        ),
        (
            "trusted mounts are writable",
            {"containerControls": [c for c in FULL_CONTROLS if c != "read-only trusted mounts"]},
        ),
        (
            "network policy is unstated",
            {"containerControls": [c for c in FULL_CONTROLS if c != "explicit network policy"]},
        ),
        (
            "resources are unbounded",
            {"containerControls": [c for c in FULL_CONTROLS if c != "resource limits"]},
        ),
    ],
)
def test_isolation_refuses_a_missing_control(
    tmp_path: Path, label: str, overrides: dict[str, Any]
) -> None:
    result = _boundary("check-isolation", _isolation(**overrides), tmp_path)
    assert result.returncode != 0, f"{label} was admitted"


# --- trusted verdict: the subject's claim has no authority ------------------


def test_a_faithful_envelope_verifies(tmp_path: Path, plan: dict[str, Any]) -> None:
    result = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": _envelope(plan), "artifactDigests": _digests(plan)},
        tmp_path,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        (
            "the subject ran a different plan",
            lambda e, d: e.__setitem__("planDigest", "0" * 64),
        ),
        (
            "the subject claims a different candidate",
            lambda e, d: e.__setitem__("candidateSha", "c" * 40),
        ),
        (
            "the subject claims a different predecessor",
            lambda e, d: e.__setitem__("predecessorSha", "d" * 40),
        ),
        (
            "the envelope schema is unrecognised",
            lambda e, d: e.__setitem__("schemaVersion", 99),
        ),
        (
            "a planned command was dropped",
            lambda e, d: e["results"].pop(),
        ),
        (
            "a command ran different arguments",
            lambda e, d: e["results"][0].__setitem__("argv", ["oxlint", "--version"]),
        ),
        (
            "an exit code was not captured",
            lambda e, d: e["results"][0].__setitem__("exitCode", "fine"),
        ),
        (
            "an artifact digest is forged",
            lambda e, d: e["artifacts"].__setitem__(next(iter(e["artifacts"])), "f" * 64),
        ),
        (
            "an artifact was never produced",
            lambda e, d: d.__setitem__(next(iter(d)), None),
        ),
    ],
)
def test_the_verdict_refuses_a_tampered_envelope(
    tmp_path: Path, plan: dict[str, Any], label: str, mutate: Any
) -> None:
    envelope = _envelope(plan)
    digests = _digests(plan)
    before = json.dumps([envelope, digests], sort_keys=True)
    mutate(envelope, digests)
    assert json.dumps([envelope, digests], sort_keys=True) != before, (
        f"{label}: the mutation changed nothing, so it is not evidence"
    )
    result = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": envelope, "artifactDigests": digests},
        tmp_path,
    )
    assert result.returncode != 0, f"{label} was accepted"


def test_a_subject_claiming_success_it_did_not_earn_changes_nothing(
    tmp_path: Path, plan: dict[str, Any]
) -> None:
    """The envelope reports what happened. It does not decide what it means.

    A subject that reports exitCode 0 for every command while running a
    different plan is still refused, because identity is checked before any
    claim in the envelope is read as a result.
    """
    envelope = _envelope(plan, planDigest="0" * 64)
    for result in envelope["results"]:
        result["exitCode"] = 0
    outcome = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": envelope, "artifactDigests": _digests(plan)},
        tmp_path,
    )
    assert outcome.returncode != 0


# --- point-in-time freshness ------------------------------------------------


def test_freshness_admits_two_stable_identities(tmp_path: Path) -> None:
    same = {"candidateSha": SHA_B, "predecessorSha": SHA_A}
    assert _boundary("check-freshness", {"start": same, "end": same}, tmp_path).returncode == 0


@pytest.mark.parametrize(
    ("label", "end"),
    [
        ("the candidate moved", {"candidateSha": "c" * 40, "predecessorSha": SHA_A}),
        ("the predecessor moved", {"candidateSha": SHA_B, "predecessorSha": "d" * 40}),
        ("both moved", {"candidateSha": "c" * 40, "predecessorSha": "d" * 40}),
    ],
)
def test_freshness_refuses_independent_movement(
    tmp_path: Path, label: str, end: dict[str, str]
) -> None:
    start = {"candidateSha": SHA_B, "predecessorSha": SHA_A}
    result = _boundary("check-freshness", {"start": start, "end": end}, tmp_path)
    assert result.returncode != 0, label


# --- the workflow topology --------------------------------------------------
#
# The workflow is declarative data, so these are assertions about the trust
# topology itself rather than about prose describing it. PR-B cannot obtain
# authoritative evidence from running it -- ``repository_dispatch`` executes the
# DEFAULT BRANCH definition, which only exists there once PR-B merges -- so the
# topology is proved by inspection plus the executable tests above.


def _jobs() -> dict[str, str]:
    """Split the workflow into per-job text blocks."""
    text = WORKFLOW.read_text()
    body = text.split("\njobs:\n", 1)[1]
    blocks: dict[str, str] = {}
    current: str | None = None
    for line in body.split("\n"):
        header = line[2:-1] if line.startswith("  ") and line.endswith(":") else None
        if header and not line.startswith("    ") and header.replace("-", "").isalpha():
            current = header
            blocks[current] = ""
        elif current is not None:
            blocks[current] += line + "\n"
    return blocks


def test_only_a_repository_dispatch_can_start_the_boundary() -> None:
    """A candidate must not be able to trigger the authority that judges it.

    ``repository_dispatch`` always runs the default-branch definition. A
    ``pull_request`` trigger would run the CANDIDATE's copy of this file.
    """
    header = WORKFLOW.read_text().split("\njobs:\n", 1)[0]
    assert "repository_dispatch:" in header
    assert "pull_request:" not in header
    assert "pull_request_target:" not in header
    assert "workflow_dispatch:" not in header


def test_the_three_domains_exist_and_are_ordered() -> None:
    jobs = _jobs()
    assert set(jobs) == {"trusted-control", "untrusted-subject", "trusted-verdict"}
    assert "needs: trusted-control" in jobs["untrusted-subject"]
    assert "needs: [trusted-control, untrusted-subject]" in jobs["trusted-verdict"]


def test_the_subject_job_receives_no_repository_permission() -> None:
    """Boundary 1, at the job level: no token is minted for the subject at all."""
    assert "permissions: {}" in _jobs()["untrusted-subject"]


def test_the_subject_job_declares_no_job_level_container() -> None:
    """The launcher must be OUTSIDE the boundary it creates.

    A job-level ``container:`` runs every ordinary step inside that container,
    so the code owning the timeout, the exit codes, the artifact hashes and the
    envelope would share a UID and filesystem with the candidate it judges --
    and a candidate that daemonizes outlives its own process there.
    """
    subject = _jobs()["untrusted-subject"]
    assert "\n    container:" not in subject
    assert "run-subject-launcher.mjs" in subject


def test_the_launcher_creates_the_boundary_beneath_itself() -> None:
    """The controls live in the launcher, where docker actually enforces them.

    ``--network`` in particular is NOT supported as a job-level container
    option, so asserting it there would prove nothing about enforcement.
    """
    launcher = (REPO / "scripts" / "run-subject-launcher.mjs").read_text()
    for control in [
        "--user=",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--read-only",
        "--network=none",
        "--memory=",
        "--pids-limit=",
        ":/subject:ro",
    ]:
        assert control in launcher, f"missing container control: {control}"


def test_the_candidate_never_receives_the_docker_socket() -> None:
    launcher = (REPO / "scripts" / "run-subject-launcher.mjs").read_text()
    assert "docker.sock" not in launcher
    assert "/var/run/docker" not in launcher


def test_the_launcher_owns_timeout_exit_code_and_envelope() -> None:
    launcher = (REPO / "scripts" / "run-subject-launcher.mjs").read_text()
    assert "timeout: COMMAND_TIMEOUT_MS" in launcher
    assert "run.status === null ? 124 : run.status" in launcher
    assert "envelope.json" in launcher


def test_the_control_domain_pins_itself_to_the_live_predecessor() -> None:
    """The definition running must BE the commit the repository trusts."""
    control = _jobs()["trusted-control"]
    assert "github.sha" in control
    assert "the live predecessor is" in control


def test_the_candidate_is_never_checked_out() -> None:
    """It arrives as Git objects, materialized by a predecessor-owned program.

    ``tar -x`` is not this: tar restores whatever the archive describes, and the
    archive is candidate-controlled.
    """
    control = _jobs()["trusted-control"]
    assert "materialize-candidate.mjs" in control
    assert "git archive" not in control
    assert "ref: ${{ steps.identity.outputs.predecessor }}" in control
    assert "ref: ${{ steps.identity.outputs.candidate }}" not in control


def test_candidate_dependencies_are_installed_without_running_them() -> None:
    control = _jobs()["trusted-control"]
    assert "--ignore-scripts" in control


def test_every_action_is_pinned_to_a_commit_sha() -> None:
    """A tag is mutable, and these are executable dependencies of the root of trust."""
    import re

    for line in WORKFLOW.read_text().split("\n"):
        if "uses:" not in line:
            continue
        ref = line.split("uses:")[1].strip().split("#")[0].strip()
        assert re.search(r"@[0-9a-f]{40}$", ref), f"unpinned action: {ref}"


def test_the_verdict_requires_the_candidates_native_platform_proof() -> None:
    verdict = _jobs()["trusted-verdict"]
    assert "toolchain platform" in verdict
    assert "no successful native platform proof" in verdict


def test_the_verdict_emits_canonical_point_in_time_evidence() -> None:
    verdict = _jobs()["trusted-verdict"]
    assert "maintenance-evidence.json" in verdict
    for field in [
        "candidateSha",
        "predecessorSha",
        "executionSha",
        "runId",
        "verifierWorkflow",
        "classId",
        "planDigest",
        "POINT_IN_TIME",
    ]:
        assert field in verdict, f"evidence omits {field}"


def test_no_job_checks_out_the_candidate_ref() -> None:
    """Every checkout in every domain resolves to the predecessor."""
    for name, block in _jobs().items():
        assert "ref: ${{ needs.trusted-control.outputs.candidate }}" not in block, name
        for section in block.split("uses: actions/checkout")[1:]:
            ref_line = next(
                (line for line in section.split("\n") if line.strip().startswith("ref:")), ""
            )
            assert "candidate" not in ref_line, f"{name} checks out the candidate: {ref_line}"


def test_the_verdict_runs_even_when_the_subject_fails() -> None:
    """A missing verdict must never read as a pass."""
    verdict = _jobs()["trusted-verdict"]
    assert "if: always()" in verdict
    assert "needs.untrusted-subject.result != 'success'" in verdict


def test_the_verdict_re_runs_classification_rather_than_trusting_the_subject() -> None:
    verdict = _jobs()["trusted-verdict"]
    assert "--boundary verify-envelope" in verdict
    assert "build-maintenance-plan.mjs" in verdict
    assert "--plan /tmp/classification-plan.json" in verdict
    assert "--boundary check-freshness" in verdict


def test_the_run_is_recorded_as_point_in_time_evidence() -> None:
    assert "MAN-TS7-01" in _jobs()["trusted-verdict"]


# --- the expected outcome is part of the verdict ----------------------------
#
# Classification proves admissible DATA DIFFERENCE. It says nothing about
# whether the new tool works. Without an expected outcome a candidate could fail
# every subject command and still be admitted, because every check downstream
# was about the shape of the diff.


def test_a_candidate_that_fails_every_command_is_refused(
    tmp_path: Path, plan: dict[str, Any]
) -> None:
    envelope = _envelope(plan)
    for result in envelope["results"]:
        result["exitCode"] = 1
    outcome = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": envelope, "artifactDigests": _digests(plan)},
        tmp_path,
    )
    assert outcome.returncode != 0
    assert "expected to succeed" in outcome.stderr


def test_an_engine_that_accepts_what_the_predecessor_rejects_is_refused(
    tmp_path: Path, plan: dict[str, Any]
) -> None:
    """The sharp regression: the candidate engine stops catching a violation.

    Its exit code is 0 and every identity matches. Only the predecessor's
    expected outcome distinguishes "passed" from "stopped enforcing".
    """
    envelope = _envelope(plan)
    rejecting = [
        index
        for index, command in enumerate(plan["commands"])
        if command["expect"]["outcome"] == "rejection"
    ]
    assert rejecting, "the lint-engine pack must contain a rejection case"
    for index in rejecting:
        envelope["results"][index]["exitCode"] = 0
    outcome = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": envelope, "artifactDigests": _digests(plan)},
        tmp_path,
    )
    assert outcome.returncode != 0
    assert "expected to REJECT" in outcome.stderr


def _relabel_a_predecessor_input(envelope: dict[str, Any]) -> None:
    """Relabel a PREDECESSOR-sourced input as candidate-sourced.

    That is the interesting forgery: it would turn "must match the predecessor"
    into "whatever the candidate says", so it must not be accepted.
    """
    for result in envelope["results"]:
        for entry in result["inputs"]:
            if entry["source"] == "predecessor":
                entry["source"] = "candidate"
                return
    raise AssertionError("no predecessor-sourced input to relabel")


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        (
            "a different binary version ran",
            lambda e: e["results"][0]["binary"].__setitem__("version", "0.0.0"),
        ),
        (
            "a different package ran",
            lambda e: e["results"][0]["binary"].__setitem__("package", "something-else"),
        ),
        (
            "the command ran in a different directory",
            lambda e: e["results"][0].__setitem__("cwd", "/"),
        ),
        (
            "protected inputs were swapped",
            lambda e: e["results"][0]["inputs"][0].__setitem__("digest", "0" * 64),
        ),
        (
            "an input's provenance was relabelled",
            _relabel_a_predecessor_input,
        ),
    ],
)
def test_the_verdict_refuses_a_substituted_execution(
    tmp_path: Path, plan: dict[str, Any], label: str, mutate: Any
) -> None:
    envelope = _envelope(plan)
    before = json.dumps(envelope, sort_keys=True)
    mutate(envelope)
    assert json.dumps(envelope, sort_keys=True) != before, f"{label}: not evidence"
    result = _boundary(
        "verify-envelope",
        {"plan": plan, "envelope": envelope, "artifactDigests": _digests(plan)},
        tmp_path,
    )
    assert result.returncode != 0, f"{label} was accepted"


# --- candidate materialization refuses non-regular entries ------------------

MATERIALIZER = REPO / "scripts" / "materialize-candidate.mjs"


def _repo_with(tmp_path: Path, build: Any, after_add: Any = None) -> Path:
    root = tmp_path / "hostile"
    root.mkdir()
    subprocess.run(["git", "init", "-q", "."], cwd=root, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=root, check=True)
    (root / "ok.txt").write_text("fine\n")
    build(root)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    # Entries with no on-disk counterpart must be staged after `git add -A`,
    # which would otherwise stage their removal.
    if after_add is not None:
        after_add(root)
    subprocess.run(["git", "commit", "-qm", "candidate"], cwd=root, check=True)
    return root


def _materialize(root: Path, out: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(MATERIALIZER), "HEAD", str(out)],
        cwd=root,
        capture_output=True,
        text=True,
    )


def test_a_clean_tree_materializes_as_regular_files(tmp_path: Path) -> None:
    root = _repo_with(tmp_path, lambda r: (r / "sub").mkdir())
    out = tmp_path / "out"
    result = _materialize(root, out)
    assert result.returncode == 0, result.stderr
    for file in out.rglob("*"):
        if file.is_file():
            assert oct(file.stat().st_mode)[-3:] == "644"
            assert not file.is_symlink()


def test_a_symlink_refuses_the_whole_materialization(tmp_path: Path) -> None:
    """A partial tree is not a safe subset of a hostile one."""

    def build(root: Path) -> None:
        (root / "sneaky").symlink_to("/etc/passwd")

    root = _repo_with(tmp_path, build)
    out = tmp_path / "out"
    result = _materialize(root, out)
    assert result.returncode != 0
    assert "symlink" in result.stderr
    assert not out.exists(), "nothing may be written when an entry is refused"


def test_a_submodule_gitlink_is_refused(tmp_path: Path) -> None:
    def build(root: Path) -> None:
        # A gitlink entry written directly into the index, without needing a
        # real submodule checkout.
        subprocess.run(
            ["git", "update-index", "--add", "--cacheinfo", f"160000,{'a' * 40},vendor"],
            cwd=root,
            check=True,
        )

    root = _repo_with(tmp_path, lambda r: None, after_add=build)
    listing = subprocess.run(
        ["git", "ls-tree", "-r", "HEAD"], cwd=root, capture_output=True, text=True
    ).stdout
    assert "160000" in listing, f"the gitlink was not committed: {listing}"
    result = _materialize(root, tmp_path / "out")
    assert result.returncode != 0
    assert "submodule" in result.stderr or "gitlink" in result.stderr


def test_an_executable_bit_does_not_survive(tmp_path: Path) -> None:
    def build(root: Path) -> None:
        script = root / "tool.sh"
        script.write_text("#!/bin/sh\necho hi\n")
        script.chmod(0o755)

    root = _repo_with(tmp_path, build)
    out = tmp_path / "out"
    assert _materialize(root, out).returncode == 0
    assert oct((out / "tool.sh").stat().st_mode)[-3:] == "644"


# --- the typed backend must really execute ----------------------------------
#
# Naming `oxlint-tsgolint` in `binary.package` is metadata. The engine shells out
# to the typed backend, and when that backend is unreachable it does not crash --
# it reports what the STATIC rules found. So a pack command can pass while all 24
# typed policies silently do not run, which is exactly the failure task 1.12
# closed for the production runner.
#
# Measured on this corpus:
#
#   typed INVALID corpus   backend present -> 1   backend absent -> 1
#   typed VALID   corpus   backend present -> 0   backend absent -> 1
#
# So the invalid corpus proves nothing about the backend, and the VALID corpus
# with `expect: success` is the discriminator. This test runs the pack's own
# command rather than a parallel invention, so the pack cannot drift away from
# the proof.

LINT_CONFIG = REPO / "packages" / "lint-config"
TSGOLINT_BIN = LINT_CONFIG / "node_modules" / ".bin" / "tsgolint"


def _typed_pack_command(policy: dict[str, Any]) -> dict[str, Any]:
    pack = _pack(policy, "normal-compiler-and-typed-lint")
    return next(c for c in pack if c["id"] == "typed-backend-accepts-valid")


def _run_pack_command(command: dict[str, Any]) -> int:
    binary = LINT_CONFIG / "node_modules" / ".bin" / command["binary"]["bin"]
    return subprocess.run(
        [str(binary), *command["argv"]],
        cwd=REPO / command["cwd"],
        capture_output=True,
        text=True,
    ).returncode


@pytest.mark.skipif(not TSGOLINT_BIN.exists(), reason="typed backend not installed")
def test_the_typed_pack_command_fails_when_the_backend_is_removed(
    policy: dict[str, Any],
) -> None:
    command = _typed_pack_command(policy)
    assert command["expect"]["outcome"] == "success"

    with_backend = _run_pack_command(command)
    assert with_backend == 0, "the planned command must succeed with the backend present"

    hidden = TSGOLINT_BIN.with_suffix(".hidden")
    TSGOLINT_BIN.rename(hidden)
    try:
        without_backend = _run_pack_command(command)
    finally:
        hidden.rename(TSGOLINT_BIN)
    assert TSGOLINT_BIN.exists(), "the backend must be restored"

    assert without_backend != 0, (
        "removing the typed backend did not change the planned command's outcome, "
        "so this command is not execution proof for oxlint-tsgolint"
    )


@pytest.mark.skipif(not TSGOLINT_BIN.exists(), reason="typed backend not installed")
def test_the_typed_invalid_corpus_alone_would_not_prove_the_backend_ran(
    policy: dict[str, Any],
) -> None:
    """Why the VALID corpus carries the proof and the invalid one does not."""
    pack = _pack(policy, "normal-compiler-and-typed-lint")
    rejecting = next(c for c in pack if c["id"] == "typed-backend-rejects-typed-violation")

    hidden = TSGOLINT_BIN.with_suffix(".hidden")
    TSGOLINT_BIN.rename(hidden)
    try:
        without_backend = _run_pack_command(rejecting)
    finally:
        hidden.rename(TSGOLINT_BIN)

    assert without_backend != 0, (
        "the invalid corpus fails with or without the backend, which is why the "
        "pack cannot rely on it alone"
    )


def test_the_subject_receives_a_predecessor_owned_path() -> None:
    """The subject's PATH is chosen by the predecessor, not inherited."""
    launcher = (REPO / "scripts" / "run-subject-launcher.mjs").read_text()
    assert "--env=PATH=" in launcher
    assert "/subject/node_modules/.bin" in launcher


def test_the_subject_image_is_pinned_by_digest(policy: dict[str, Any]) -> None:
    """A tag can move underneath a proof; the image supplies the interpreter."""
    import re

    image = policy["subjectIsolation"]["image"]
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", image["digest"])
    launcher = (REPO / "scripts" / "run-subject-launcher.mjs").read_text()
    assert "plan.isolation?.image" in launcher
    assert "node:24-bookworm-slim'" not in launcher, "the tag must not be hard-coded"


def test_candidate_data_is_classified_before_it_reaches_a_package_manager() -> None:
    """Order matters: resolution reads candidate-controlled configuration.

    A candidate that fails classification must never reach the install step.
    """
    control = _jobs()["trusted-control"]
    classify_at = control.index("Classify the candidate before any of its data is installed")
    # The CANDIDATE install, not the predecessor's own dependency install.
    install_at = control.index("pnpm install --frozen-lockfile --ignore-scripts")
    assert classify_at < install_at, "installation precedes classification"


def test_candidate_install_hooks_are_disabled() -> None:
    """`--ignore-scripts` alone does not make pnpm installation inert.

    pnpm supports executable `.pnpmfile.cjs`/`.pnpmfile.mjs` install hooks --
    readPackage, updateConfig, preResolution, custom resolvers and fetchers --
    which run during resolution regardless of that flag.
    """
    control = _jobs()["trusted-control"]
    assert "--ignore-scripts" in control
    assert "--ignore-pnpmfile" in control
