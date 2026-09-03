"""Historical review pins on a trusted boundary runner.

THE DEFECT THIS COVERS. ``admittedEpochs`` admits an archived review round only
if its ``reviewed_commit`` resolves to a real commit::

    git cat-file -e <reviewed_commit>^{commit}

That is a question about the OBJECT DATABASE, and the trusted boundary's is
deliberately minimal: it checks out the live base and fetches exactly two
commits, the candidate head and that base. After a SQUASH merge the reviewed
commit is no longer an ancestor of the default branch, so it is in neither --
and a valid historical round is refused because the runner never fetched it.

Why the existing squash test does not catch it: it builds one repository, so the
orphaned commit is still sitting in ``.git/objects``. It proves the ancestry
rule, not the object-availability rule. Every test here therefore builds a
SEPARATE consumer repository that provably does NOT have the object, which is
what a fresh runner looks like.

The fix must not weaken "reviewed_commit must be a real commit". It makes the
trusted boundary obtain the objects that rule needs, as inert data.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from test_openspec_review_gate import (
    BASE,
    SCOPE,
    _accept,
    _accepted_gate,
    _git,
    _manifest,
    _planning_repo,
    _review_text,
)
from workflow_model import step_field, step_run, workflow_steps

REPO_ROOT = Path(__file__).resolve().parents[1]
GATE = REPO_ROOT / "scripts" / "openspec-review-gate.mjs"
PINS = REPO_ROOT / "scripts" / "openspec-review-pins.mjs"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "review-boundary.yml"

CHANGE_DIR = ("openspec", "changes", "demo")


# ── helpers ──────────────────────────────────────────────────────────────────


def _pins(
    repo: Path, *, ref: str = "refs/boundary/head", change: str = "demo"
) -> subprocess.CompletedProcess[str]:
    """Run the real enumerator as a subprocess, like the workflow does."""
    return subprocess.run(
        ["node", str(PINS), "--ref", ref, "--change", change],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def _pin_refusal(result: subprocess.CompletedProcess[str]) -> str:
    assert result.returncode != 0, f"enumerator accepted when it should refuse:\n{result.stdout}"
    match = re.search(r"review pins \[([A-Z_0-9]+)\]", result.stderr)
    assert match is not None, f"no refusal code in:\n{result.stderr}"
    return match.group(1)


def _verify(repo: Path, base_sha: str) -> subprocess.CompletedProcess[str]:
    """The real gate against fetched refs -- exactly the boundary's invocation."""
    return subprocess.run(
        [
            "node",
            str(GATE),
            "verify",
            "--change",
            "demo",
            "--ref",
            "refs/boundary/head",
            "--base",
            "refs/boundary/base",
            "--base-sha",
            base_sha,
        ],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def _gate_block(text: str) -> dict[str, object]:
    block = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", text)
    assert block is not None, "no gate block"
    parsed: dict[str, object] = json.loads(block.group(1))
    return parsed


def _squash_merge(repo: Path, branch_head: str, onto: str, message: str) -> str:
    """A real squash merge: new commit, single parent, branch tree."""
    _git(repo, "checkout", "-q", "-B", "trunk", onto)
    _git(repo, "read-tree", branch_head)
    _git(repo, "checkout-index", "-a", "-f")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", message)
    return _git(repo, "rev-parse", "HEAD").strip()


def _archive(repo: Path, epoch: int, review_text: str) -> str:
    """The real admission ceremony: reviews/<epoch>-<sha12>.md, byte-for-byte."""
    change = repo.joinpath(*CHANGE_DIR)
    (change / "reviews").mkdir(exist_ok=True)
    reviewed = str(_gate_block(review_text)["reviewed_commit"])
    (change / "reviews" / f"{epoch}-{reviewed[:12]}.md").write_text(review_text)
    current = change / "preimplementation-review.md"
    if current.exists():
        current.unlink()
    return reviewed


def _fresh_consumer(tmp_path: Path, name: str = "runner") -> Path:
    """A runner-shaped repository: real, empty of the upstream's objects."""
    consumer = tmp_path / name
    consumer.mkdir()
    _git(consumer, "init", "-q", "-b", "trusted")
    (consumer / "trusted.md").write_text("# the default branch's own tooling\n")
    _git(consumer, "add", "-A")
    _git(consumer, "commit", "-qm", "trusted context")
    return consumer


def _has_object(repo: Path, sha: str) -> bool:
    return (
        subprocess.run(
            ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
            cwd=repo,
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )


def _squashed_history_upstream(
    tmp_path: Path, *, extra: dict[str, str] | None = None
) -> tuple[Path, str, str, str]:
    """Epoch 1 accepted, squash-merged, archived; epoch 2 accepted over it.

    `extra` places additional files in the REVIEWED commit, so a test can prove
    what does and does not reach the runner when that commit is fetched.

    Returns (upstream, epoch1_reviewed_commit, candidate_head, base_sha).
    """
    upstream = _planning_repo(tmp_path)
    # The real pull-request shape: the base is trunk, and the reviewed commit is
    # a DESCENDANT of it on the branch. Reviewing the base commit itself would
    # leave the pin an ancestor of the squash and prove nothing.
    trunk = _git(upstream, "rev-parse", "HEAD").strip()
    upstream.joinpath(*CHANGE_DIR, "design.md").write_text("# design\n\nrevised on the branch\n")
    for name, body in (extra or {}).items():
        target = upstream / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)
        if name.endswith(".sh"):
            target.chmod(0o755)
    _git(upstream, "add", "-A")
    _git(upstream, "commit", "-qm", "planning work on the branch")

    _accept(upstream)
    assert _verify_in_place(upstream), "epoch 1 must verify on the planning branch"

    branch_head = _git(upstream, "rev-parse", "HEAD").strip()
    review_text = upstream.joinpath(*CHANGE_DIR, "preimplementation-review.md").read_text()
    epoch1 = str(_gate_block(review_text)["reviewed_commit"])

    squashed = _squash_merge(upstream, branch_head, trunk, "squash the planning package (#N)")
    parents = _git(upstream, "rev-list", "--parents", "-n", "1", squashed).split()
    assert len(parents) == 2, f"a squash merge has exactly one parent: {parents}"
    assert not _is_ancestor(upstream, epoch1, squashed), (
        "the squash must orphan the REVIEWED commit, or this fixture proves nothing"
    )

    _git(upstream, "branch", "-f", BASE, squashed)
    archived = _archive(upstream, 1, review_text)
    assert archived == epoch1
    _git(upstream, "add", "-A")
    _git(upstream, "commit", "-qm", "archive review epoch 1")
    _git(upstream, "branch", "-f", BASE, "HEAD")

    gate = _accepted_gate(_manifest(upstream, scope=SCOPE, epoch=2))
    upstream.joinpath(*CHANGE_DIR, "preimplementation-review.md").write_text(_review_text(gate))
    _git(upstream, "add", "-A")
    _git(upstream, "commit", "-qm", "accepting review epoch 2")

    head = _git(upstream, "rev-parse", "HEAD").strip()
    base_sha = _git(upstream, "rev-parse", f"{BASE}^{{commit}}").strip()
    return upstream, epoch1, head, base_sha


def _verify_in_place(repo: Path) -> bool:
    base_sha = _git(repo, "rev-parse", f"{BASE}^{{commit}}").strip()
    return (
        subprocess.run(
            [
                "node",
                str(GATE),
                "verify",
                "--change",
                "demo",
                "--base",
                BASE,
                "--base-sha",
                base_sha,
            ],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        == 0
    )


def _is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    return (
        subprocess.run(
            ["git", "merge-base", "--is-ancestor", ancestor, descendant],
            cwd=repo,
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )


def _boundary_fetch(consumer: Path, upstream: Path, head: str, base_sha: str) -> None:
    """Exactly what the workflow fetches today: head and base, nothing else."""
    _git(consumer, "fetch", "-q", str(upstream), f"+{head}:refs/boundary/head")
    _git(consumer, "fetch", "-q", str(upstream), f"+{base_sha}:refs/boundary/base")


# ── the regression: a fresh runner, an object it does not have ───────────────


def test_a_fresh_runner_lacks_the_squashed_reviewed_commit_and_the_gate_refuses(
    tmp_path: Path,
) -> None:
    """The defect itself, reproduced rather than described.

    This is the assertion the existing squash test cannot make: it keeps one
    repository, so the orphaned commit never actually goes missing.
    """
    upstream, epoch1, head, base_sha = _squashed_history_upstream(tmp_path)
    consumer = _fresh_consumer(tmp_path)
    _boundary_fetch(consumer, upstream, head, base_sha)

    assert not _has_object(consumer, epoch1), (
        "the fixture must start WITHOUT the epoch-1 reviewed commit, "
        "or it is not reproducing a fresh runner"
    )

    result = _verify(consumer, base_sha)
    assert result.returncode != 0, "the missing object must be refused, not ignored"
    assert "UNADMISSIBLE_REVIEW_HISTORY" in result.stderr
    assert epoch1 in result.stderr
    assert "is not a commit in this repository" in result.stderr


def test_prefetching_the_named_pins_lets_the_gate_admit_the_squashed_epoch(
    tmp_path: Path,
) -> None:
    """The fix, end to end, on the runner-shaped repository.

    Enumerate -> fetch exactly those objects -> the existing gate admits epoch 1
    and verifies epoch 2. The identity rule is untouched; the object is present.
    """
    upstream, epoch1, head, base_sha = _squashed_history_upstream(tmp_path)
    consumer = _fresh_consumer(tmp_path)
    _boundary_fetch(consumer, upstream, head, base_sha)
    assert not _has_object(consumer, epoch1)

    listed = _pins(consumer)
    assert listed.returncode == 0, listed.stdout + listed.stderr
    assert listed.stdout.split() == [epoch1], "exactly the one pin the history cites"

    for sha in listed.stdout.split():
        _git(consumer, "fetch", "-q", str(upstream), f"+{sha}:refs/boundary/reviews/{sha}")

    assert _has_object(consumer, epoch1), "the prefetch must actually acquire the object"

    result = _verify(consumer, base_sha)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "REVIEW_GATE_VALID" in result.stdout
    assert "epoch=2" in result.stdout
    assert f"scope={SCOPE}" in result.stdout

    # The reviewed commit is present as an OBJECT and is still not an ancestor:
    # the fix supplied availability, it did not launder the ancestry rule.
    assert not _is_ancestor(consumer, epoch1, "refs/boundary/head")


def test_the_prefetched_commit_is_never_materialized_as_files(tmp_path: Path) -> None:
    """Fetching an object is not checking it out.

    The reviewed commit deliberately carries an executable, a hook, and a
    package manifest with a lifecycle script. The boundary needs its identity
    and nothing else, so none of it may exist on the runner as files.
    """
    upstream, epoch1, head, base_sha = _squashed_history_upstream(
        tmp_path,
        extra={
            "danger.sh": "#!/bin/sh\necho pwned\n",
            "package.json": '{"name":"x","scripts":{"prepare":"echo pwned"}}\n',
            ".githooks/post-checkout": "#!/bin/sh\necho pwned\n",
        },
    )
    consumer = _fresh_consumer(tmp_path)
    _boundary_fetch(consumer, upstream, head, base_sha)
    assert not _has_object(consumer, epoch1), "the fixture must start without the pin"

    _git(consumer, "fetch", "-q", str(upstream), f"+{epoch1}:refs/boundary/reviews/{epoch1}")
    assert _has_object(consumer, epoch1)

    # The object is present. Not one byte of it is on disk.
    for path in ("danger.sh", "package.json", ".githooks", "openspec"):
        assert not (consumer / path).exists(), f"{path} was materialised from a fetched commit"
    assert _git(consumer, "ls-files").split() == ["trusted.md"]
    assert _git(consumer, "status", "--porcelain").strip() == ""

    result = _verify(consumer, base_sha)
    assert result.returncode == 0, result.stdout + result.stderr


# ── hostile input to the enumerator ──────────────────────────────────────────


def _history_repo(tmp_path: Path, filename: str, review_text: str) -> tuple[Path, str]:
    """A candidate whose reviews/ holds one attacker-chosen file."""
    upstream = _planning_repo(tmp_path)
    change = upstream.joinpath(*CHANGE_DIR)
    target = change / "reviews" / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(review_text)
    _git(upstream, "add", "-A")
    _git(upstream, "commit", "-qm", "history")
    head = _git(upstream, "rev-parse", "HEAD").strip()

    consumer = _fresh_consumer(tmp_path)
    _git(consumer, "fetch", "-q", str(upstream), f"+{head}:refs/boundary/head")
    return consumer, head


def test_a_malformed_reviewed_commit_is_refused_before_any_fetch(tmp_path: Path) -> None:
    """The value becomes a git refspec, so its shape is checked first."""
    text = _review_text(_accepted_gate({"reviewed_commit": "not-a-sha"}))
    consumer, _ = _history_repo(tmp_path, "1-aaaaaaaaaaaa.md", text)
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_INVALID_COMMIT"


@pytest.mark.parametrize(
    "value",
    [
        "AAE33FDD217D66DE8D9127576F203C115ABC37EB",  # uppercase
        "aae33fdd217d66de8d9127576f203c115abc37e",  # 39 chars
        "aae33fdd217d66de8d9127576f203c115abc37ebb",  # 41 chars
        "aae33fd",  # abbreviated
        "--upload-pack=touch /tmp/pwned",  # option-shaped
    ],
)
def test_every_non_canonical_commit_identity_is_refused(tmp_path: Path, value: str) -> None:
    """Lowercase full 40-hex, or nothing. An abbreviation is ambiguous and an
    option-shaped string must never reach a git command line."""
    text = _review_text(_accepted_gate({"reviewed_commit": value}))
    consumer, _ = _history_repo(tmp_path, "1-aaaaaaaaaaaa.md", text)
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_INVALID_COMMIT"


def test_a_filename_disagreeing_with_its_gate_block_is_refused(tmp_path: Path) -> None:
    """The filename is the human identity, the block the machine one.

    If they disagree the round lies to one of its readers, and prefetching
    either value would ratify the lie.
    """
    sha = "b" * 40
    text = _review_text(_accepted_gate({"reviewed_commit": sha}))
    consumer, _ = _history_repo(tmp_path, "1-aaaaaaaaaaaa.md", text)
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_FILENAME_MISMATCH"


def test_two_gate_blocks_in_one_round_are_refused(tmp_path: Path) -> None:
    """Two pins, no rule for which wins: refuse instead of guessing."""
    sha = "c" * 40
    text = _review_text(_accepted_gate({"reviewed_commit": sha}))
    text += "\n<!-- openspec-review-gate\n" + json.dumps({"reviewed_commit": "d" * 40}) + "\n-->\n"
    consumer, _ = _history_repo(tmp_path, f"1-{sha[:12]}.md", text)
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_GATE_BLOCK_COUNT"


def test_a_round_with_no_gate_block_is_refused(tmp_path: Path) -> None:
    consumer, _ = _history_repo(tmp_path, "1-eeeeeeeeeeee.md", "# a round with no pin\n")
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_GATE_BLOCK_COUNT"


def test_an_unparseable_gate_block_is_refused(tmp_path: Path) -> None:
    consumer, _ = _history_repo(
        tmp_path, "1-ffffffffffff.md", "<!-- openspec-review-gate\n{not json}\n-->\n"
    )
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_GATE_BLOCK_INVALID_JSON"


def test_a_misnamed_history_file_is_refused(tmp_path: Path) -> None:
    """Same filename rule the gate applies, so the two see one set of rounds."""
    text = _review_text(_accepted_gate({"reviewed_commit": "a" * 40}))
    consumer, _ = _history_repo(tmp_path, "round-one.md", text)
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_MALFORMED_FILENAME"


def test_a_nested_round_is_refused_before_a_pin_is_produced(tmp_path: Path) -> None:
    """The enumerator mirrors `admittedEpochs`, so it must mirror this too.

    A nested round is refused BEFORE a pin is extracted, so no SHA reaches the
    workflow, no refspec is built, and no fetch is attempted for a path the gate
    will refuse anyway.
    """
    sha = "a" * 40
    text = _review_text(_accepted_gate({"reviewed_commit": sha}))
    consumer, _ = _history_repo(tmp_path, "nested/1-" + sha[:12] + ".md", text)

    result = _pins(consumer)
    assert _pin_refusal(result) == "REVIEW_PIN_NESTED_ROUND"
    assert sha not in result.stdout, "no fetchable SHA may be emitted for a nested round"


def test_a_nested_non_markdown_file_is_refused_by_the_enumerator(tmp_path: Path) -> None:
    consumer, _ = _history_repo(tmp_path, "nested/notes.txt", "scratch\n")
    assert _pin_refusal(_pins(consumer)) == "REVIEW_PIN_NESTED_ROUND"


def test_a_direct_child_non_markdown_file_is_still_skipped(tmp_path: Path) -> None:
    """The same boundary the gate keeps, so the two enumerate one path set."""
    consumer, _ = _history_repo(tmp_path, "notes.txt", "scratch\n")
    result = _pins(consumer)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip() == ""


def test_shell_metacharacters_in_review_bytes_stay_inert(tmp_path: Path) -> None:
    """The review is DATA. Nothing in it is evaluated by a shell."""
    marker = tmp_path / "pwned"
    sha = "a" * 40
    hostile = f"$(touch {marker}); `touch {marker}`; $(( 1 )); ${{IFS}}; rm -rf /"
    text = _review_text(_accepted_gate({"reviewed_commit": sha, "reviewer": hostile}))
    consumer, _ = _history_repo(tmp_path, f"1-{sha[:12]}.md", text)

    result = _pins(consumer)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.split() == [sha]
    assert not marker.exists(), "review bytes were evaluated by a shell"


def test_an_unfetchable_pin_is_a_refusal_not_a_skip(tmp_path: Path) -> None:
    """The enumerator names it; the fetch fails; the gate still refuses.

    Falling back to the review's own assertion would delete the identity proof,
    so the end state must remain a refusal.
    """
    upstream, epoch1, head, base_sha = _squashed_history_upstream(tmp_path)
    consumer = _fresh_consumer(tmp_path)
    _boundary_fetch(consumer, upstream, head, base_sha)

    listed = _pins(consumer)
    assert listed.stdout.split() == [epoch1]

    # An origin that cannot serve the object, exactly like a garbage-collected
    # or unreachable historical commit.
    empty = tmp_path / "empty-origin"
    empty.mkdir()
    _git(empty, "init", "-q", "-b", "main")
    (empty / "x.md").write_text("x\n")
    _git(empty, "add", "-A")
    _git(empty, "commit", "-qm", "root")

    failed = subprocess.run(
        [
            "git",
            "fetch",
            "--no-tags",
            "-q",
            str(empty),
            f"+{epoch1}:refs/boundary/reviews/{epoch1}",
        ],
        cwd=consumer,
        capture_output=True,
        text=True,
        check=False,
    )
    assert failed.returncode != 0, "fetching an absent object must fail"
    assert not _has_object(consumer, epoch1)
    assert _verify(consumer, base_sha).returncode != 0


def test_an_absent_reviews_directory_yields_no_pins(tmp_path: Path) -> None:
    """The common case -- a first epoch -- is not an error."""
    upstream = _planning_repo(tmp_path)
    _accept(upstream)
    head = _git(upstream, "rev-parse", "HEAD").strip()
    consumer = _fresh_consumer(tmp_path)
    _git(consumer, "fetch", "-q", str(upstream), f"+{head}:refs/boundary/head")

    result = _pins(consumer)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip() == ""


def test_an_unresolvable_ref_is_refused(tmp_path: Path) -> None:
    consumer = _fresh_consumer(tmp_path)
    assert _pin_refusal(_pins(consumer, ref="refs/boundary/nope")) == "REVIEW_PIN_REF_UNRESOLVABLE"


def test_an_invalid_change_name_is_refused(tmp_path: Path) -> None:
    """Validated before it is used as a path segment."""
    consumer = _fresh_consumer(tmp_path)
    assert _pin_refusal(_pins(consumer, change="../../etc")) == "REVIEW_PIN_INVALID_CHANGE_NAME"


def test_the_enumerator_reads_objects_not_the_working_tree(tmp_path: Path) -> None:
    """A local edit cannot change which pins the boundary fetches."""
    upstream, epoch1, head, base_sha = _squashed_history_upstream(tmp_path)
    consumer = _fresh_consumer(tmp_path)
    _boundary_fetch(consumer, upstream, head, base_sha)

    # A planted worktree file with a different pin must have no effect: the
    # enumerator never reads the filesystem.
    planted = consumer.joinpath(*CHANGE_DIR, "reviews")
    planted.mkdir(parents=True)
    (planted / "1-999999999999.md").write_text(
        _review_text(_accepted_gate({"reviewed_commit": "9" * 40}))
    )

    result = _pins(consumer)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.split() == [epoch1], "the worktree must not influence the pin set"


# ── the trusted workflow wiring ──────────────────────────────────────────────


def _boundary_steps() -> list[str]:
    return workflow_steps(WORKFLOW.read_text(), "boundary")


def _step_named(prefix: str) -> str:
    for step in _boundary_steps():
        name = step_field(step, "name")
        if name is not None and name.startswith(prefix):
            return step
    raise AssertionError(f"no boundary step named {prefix!r}")


def test_the_boundary_prefetches_pins_before_it_runs_the_gate() -> None:
    """Order is the contract: the gate demands the objects, so they precede it."""
    names = [step_field(step, "name") or "" for step in _boundary_steps()]
    prefetch = next(i for i, n in enumerate(names) if n.startswith("Prefetch historical review"))
    gate = next(i for i, n in enumerate(names) if n.startswith("Review gate"))
    assert prefetch < gate, names


def test_the_prefetch_step_uses_the_trusted_enumerator_against_the_candidate_ref() -> None:
    run = step_run(_step_named("Prefetch historical review"))
    assert "scripts/openspec-review-pins.mjs" in run
    assert "--ref refs/boundary/head" in run.replace("\\\n", "").replace("  ", " ")
    assert "refs/boundary/reviews/" in run


def test_the_enumerator_is_required_from_the_default_branch() -> None:
    """Trusted tooling is proved present before it decides anything."""
    run = step_run(_step_named("Refuse if the default branch"))
    assert "scripts/openspec-review-pins.mjs" in run


def test_the_prefetch_step_never_checks_out_a_historical_commit() -> None:
    run = step_run(_step_named("Prefetch historical review"))
    for forbidden in ("git checkout", "git switch", "git restore", "checkout-index", "read-tree"):
        assert forbidden not in run, f"the prefetch step must not run {forbidden}"


def test_the_prefetch_step_never_installs_or_executes_candidate_content() -> None:
    run = step_run(_step_named("Prefetch historical review"))
    for forbidden in ("pnpm install", "npm install", "corepack", "bash ", "sh -c", "eval "):
        assert forbidden not in run, f"the prefetch step must not run {forbidden}"


def test_a_pin_that_cannot_be_fetched_fails_the_step() -> None:
    """No `|| true`, no `continue`: an unservable pin is a refusal."""
    run = step_run(_step_named("Prefetch historical review"))
    assert "set -euo pipefail" in run
    assert "|| true" not in run
    assert "exit 1" in run
    assert "rev-parse --verify" in run


def test_the_prefetch_step_revalidates_each_sha_before_building_a_refspec() -> None:
    """Defence in depth, in the step that actually calls git."""
    run = step_run(_step_named("Prefetch historical review"))
    assert "[0-9a-f]{40}" in run


def test_the_candidate_ref_is_fetched_as_objects_and_never_checked_out() -> None:
    """The pre-existing threat model, still intact after this change."""
    run = step_run(_step_named("Fetch the pull request as OBJECTS"))
    assert "refs/boundary/head" in run
    assert "git checkout" not in run


def test_only_the_reviewed_base_is_ever_checked_out() -> None:
    """One checkout in the job, and it is the trusted default-branch base."""
    checkouts = [
        step for step in _boundary_steps() if "actions/checkout" in (step_field(step, "uses") or "")
    ]
    assert len(checkouts) == 1, "the boundary checks out exactly one tree"
    assert "steps.pr.outputs.base" in checkouts[0]
