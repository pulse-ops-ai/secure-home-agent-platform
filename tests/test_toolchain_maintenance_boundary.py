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


@pytest.fixture(scope="module")
def plan() -> dict[str, Any]:
    """A real plan, built by the predecessor-owned planner."""
    result = subprocess.run(
        ["node", str(CHECKER), "--boundary", "plan-subject", "/dev/stdin"],
        input=json.dumps(
            {"predecessorSha": SHA_A, "candidateSha": SHA_B, "classId": "lint-engine"}
        ),
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stderr
    built: dict[str, Any] = json.loads(result.stdout)["plan"]
    return built


def _envelope(plan: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    envelope = {
        "schemaVersion": 1,
        "planDigest": plan["digest"],
        "predecessorSha": plan["predecessorSha"],
        "candidateSha": plan["candidateSha"],
        "results": [
            {"id": command["id"], "argv": command["argv"], "exitCode": 0}
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


def test_the_candidate_cannot_choose_the_commands(plan: dict[str, Any]) -> None:
    """Commands come from the predecessor's policy, not the candidate."""
    policy = json.loads((REPO / "scripts" / "toolchain-boundaries.json").read_text())
    assert [c["id"] for c in plan["commands"]] == [c["id"] for c in policy["subjectCommands"]]
    assert [c["argv"] for c in plan["commands"]] == [c["argv"] for c in policy["subjectCommands"]]


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


def test_the_subject_runs_behind_an_os_boundary_with_every_control() -> None:
    subject = _jobs()["untrusted-subject"]
    assert "container:" in subject
    for control in [
        "--user 10001:10001",
        "--cap-drop ALL",
        "--security-opt no-new-privileges",
        "--read-only",
        "--network none",
        "--memory",
        "--pids-limit",
    ]:
        assert control in subject, f"missing container control: {control}"


def test_the_control_domain_pins_itself_to_the_live_predecessor() -> None:
    """The definition running must BE the commit the repository trusts."""
    control = _jobs()["trusted-control"]
    assert "github.sha" in control
    assert "the live predecessor is" in control


def test_the_candidate_is_never_checked_out() -> None:
    """It arrives as Git objects, materialized as regular files."""
    control = _jobs()["trusted-control"]
    assert "git archive" in control
    assert "chmod 0644" in control
    assert "ref: ${{ steps.identity.outputs.predecessor }}" in control
    assert "ref: ${{ steps.identity.outputs.candidate }}" not in control


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
