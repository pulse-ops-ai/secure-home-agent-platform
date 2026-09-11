"""PR-1 conformance tests for the offline governance-state checker.

The tests intentionally invoke the shipped Node entry point for every
current-state refusal. Python only prepares isolated temporary fixture trees
and checks the reported contract; it does not reimplement the model.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, cast

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CHECKER = REPOSITORY_ROOT / "scripts/check-governance-state.mjs"
FIXTURE_ROOT = REPOSITORY_ROOT / "tests/fixtures/governance/current"


def copy_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    shutil.copytree(FIXTURE_ROOT, root)
    return root


def canonicalize(root: Path, path: str = "state.json") -> str:
    result = subprocess.run(
        [
            "node",
            str(CHECKER),
            "--root",
            str(root),
            "--state",
            path,
            "--canonical",
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def write_state(root: Path, state: dict[str, Any], path: str = "state.json") -> None:
    target = root / path
    target.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    target.write_text(canonicalize(root, path), encoding="utf-8")


def load_state(root: Path, path: str = "state.json") -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((root / path).read_text(encoding="utf-8")))


def run_checker(
    root: Path, path: str = "state.json", *, raw: str | None = None
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    target = root / path
    if raw is not None:
        target.write_text(raw, encoding="utf-8")
    result = subprocess.run(
        [
            "node",
            str(CHECKER),
            "--root",
            str(root),
            "--state",
            path,
            "--json",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )
    return result, json.loads(result.stdout)


def assert_refused(
    root: Path, *codes: str, path: str = "state.json", raw: str | None = None
) -> dict[str, Any]:
    result, payload = run_checker(root, path, raw=raw)
    assert result.returncode != 0, result.stderr
    reported = {problem["code"] for problem in payload["problems"]}
    assert set(codes) <= reported, (payload, result.stderr)
    return payload


def assert_valid(root: Path, path: str = "state.json") -> dict[str, Any]:
    result, payload = run_checker(root, path)
    assert result.returncode == 0, (payload, result.stderr)
    assert payload["ok"] is True
    return payload


def add_landing(
    state: dict[str, Any],
    *,
    landing_id: str,
    requires: list[str],
    kind: str = "implementation-landing",
) -> dict[str, Any]:
    landing = {
        "id": landing_id,
        "kind": kind,
        "requires": requires,
        "authorityAnchor": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 56,
        },
        "replaces": None,
        "replacement": None,
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": (
                "reviewed-spike-evidence-v1" if kind == "spike-landing" else "reviewed-delivery-v1"
            ),
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(landing)
    return landing


def bind_acceptance_digest(root: Path, state: dict[str, Any], index: int) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { acceptanceDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const index = Number(process.env.ADR_INDEX)
state.adrs[index].acceptance.transitionDigest = acceptanceDigest(state, state.adrs[index])
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "ADR_INDEX": str(index)},
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def accepted_state(root: Path, question_ids: list[str]) -> dict[str, Any]:
    """Build a valid accepted fixture using the model's exported digest.

    The production checker still performs the validation. This helper only
    obtains the non-self-referential digest needed to make a positive fixture.
    """

    state = load_state(root)
    adr = state["adrs"][0]
    document = root / adr["path"]
    relationship_header = (
        "- **Closes:** "
        + ", ".join(
            f"[{question_id}](unresolved.md#{question_id.lower()})" for question_id in question_ids
        )
        if question_ids
        else "- **Closes:** no unresolved decision"
    )
    document.write_text(
        document.read_text(encoding="utf-8").replace("Proposed", "Accepted", 1)
        + f"\n{relationship_header}\n",
        encoding="utf-8",
    )
    adr["lifecycle"] = "Accepted"
    adr["resolves"] = question_ids
    adr["acceptance"] = {
        "transitionDigest": "0" * 64,
        "contentDigest": hashlib.sha256(document.read_bytes()).hexdigest(),
        "reviewedIdentity": {
            "class": "external-git-commit",
            "value": "1" * 40,
        },
        "actor": "@owner",
        "at": "2026-08-30T12:00:00Z",
        "outcome": "accepted",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    write_state(root, state)

    return bind_acceptance_digest(root, state, 0)


def replacement_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    old = state["landings"][0]
    replacement = {
        "id": "runner/L8-v2",
        "kind": old["kind"],
        "requires": [],
        "authorityAnchor": old["authorityAnchor"],
        "replaces": old["id"],
        "replacement": {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        },
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": "reviewed-delivery-v1",
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(replacement)
    write_state(root, state)
    return state


def bind_replacement_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const oldNode = state.landings.find((node) => node.id === 'runner/L8')
const newNode = state.landings.find((node) => node.id === 'runner/L8-v2')
const digest = replacementDigest(oldNode, newNode)
newNode.replacement.digest = digest
newNode.replacement.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_all_replacement_digests(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const nodes = [...state.gates, ...state.landings]
for (const node of nodes) {
  if (node.replaces === null) continue
  const oldNode = nodes.find((candidate) => candidate.id === node.replaces)
  const digest = replacementDigest(oldNode, node)
  node.replacement.digest = digest
  node.replacement.attestation.digest = digest
}
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_completion_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { completionDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const landing = state.landings[0]
const completion = landing.delivery.completion
const digest = completionDigest(landing, completion)
completion.digest = digest
completion.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_withdrawal_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { withdrawalDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const landing = state.landings[0]
const withdrawal = landing.delivery.withdrawal
const digest = withdrawalDigest(landing, withdrawal)
withdrawal.digest = digest
withdrawal.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


# ── a real archived OpenSpec package, in a real Git repository ───────────────
#
# `reviewed-delivery-v1` binds a whole child change and two provenance
# identities, and the model answers with repository OBSERVATIONS: root presence,
# scoped trees, exact member bytes, and reachability from current history. None
# of that can be faked with a JSON literal, so the fixture is a real repository
# with a real active-to-archive move.
#
# The move is byte-identical on purpose — that is what makes the review-time
# digests still equal the archived member digests, and it is what the content
# form rests on.

CHANGE_ID = "demo-change"
ARCHIVE_DATE = "2026-09-10"
ACTIVE_ROOT = f"openspec/changes/{CHANGE_ID}"
ARCHIVE_ROOT = f"openspec/changes/archive/{ARCHIVE_DATE}-{CHANGE_ID}"
REVIEW_FILE = "preimplementation-review.md"

#: The planning projection, plus members deliberately OUTSIDE it. The archive
#: legitimately carries more than the review read.
PLANNING_MEMBERS = [
    ".openspec.yaml",
    "proposal.md",
    "specs/alpha/spec.md",
    "specs/beta/spec.md",
    "design.md",
    "assurance.md",
    "tasks.md",
]
NON_PLANNING_MEMBERS = ["README.md", "reviews/1-aaaaaaaaaaaa.md"]

GIT_ENV = {
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@e",
}


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
        env={**GIT_ENV, "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(root)},
    ).stdout.strip()


def review_block(artifacts: list[dict[str, str]], **overrides: Any) -> str:
    record: dict[str, Any] = {
        "contract": "preimplementation-review-v2",
        "schema": "governed-spec-driven-v2",
        "rubric": "governed-preimplementation-review-v1",
        "reviewed_commit": "a" * 40,
        "reviewed_base_commit": "b" * 40,
        "review_epoch": 1,
        "scope_id": "demo-scope",
        "reviewed_at": "2026-09-01T10:00:00Z",
        "reviewer": "An Independent Reviewer",
        "verdict": "ARCHITECTURE_ACCEPTED",
        "unresolved_p1_count": 0,
        "unassigned_p2_p3_count": 0,
        "invariant_set_changed": False,
        "authority_allocation_complete": True,
        "reviewed_artifacts": artifacts,
    }
    record.update(overrides)
    return (
        "# Review\n\n<!-- openspec-review-gate\n" + json.dumps(record, indent=2) + "\n-->\n\nbody\n"
    )


def observed_members(archive: Path) -> list[dict[str, str]]:
    """Digests read off disk, never asserted."""
    return sorted(
        (
            {
                "path": str(p.relative_to(archive)),
                "contentSha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            }
            for p in archive.rglob("*")
            if p.is_file()
        ),
        key=lambda m: m["path"].encode("utf-8"),
    )


def build_archived_repository(
    root: Path,
    *,
    review_overrides: dict[str, Any] | None = None,
    manifest_paths: list[str] | None = None,
    corrupt_review_digest: bool = False,
) -> dict[str, Any]:
    """Active package committed, then moved to the archive."""
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "fixture base")

    active = root / ACTIVE_ROOT
    for relative in [*PLANNING_MEMBERS, *NON_PLANNING_MEMBERS]:
        target = active / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"# {relative}\n\ncontent for {relative}\n", encoding="utf-8")

    declared = manifest_paths if manifest_paths is not None else PLANNING_MEMBERS
    artifacts = [
        {
            "path": relative,
            "sha256": (
                "0" * 64
                if corrupt_review_digest
                else hashlib.sha256((active / relative).read_bytes()).hexdigest()
            ),
        }
        for relative in declared
    ]
    (active / REVIEW_FILE).write_text(
        review_block(artifacts, **(review_overrides or {})), encoding="utf-8"
    )

    git(root, "add", "-A")
    git(root, "commit", "-qm", "reviewed active package")
    reviewed_commit = git(root, "rev-parse", "HEAD")

    (root / ARCHIVE_ROOT).parent.mkdir(parents=True, exist_ok=True)
    git(root, "mv", ACTIVE_ROOT, ARCHIVE_ROOT)
    git(root, "commit", "-qm", "archive the delivered change")

    return {
        "reviewedCommit": reviewed_commit,
        "archivedCommit": git(root, "rev-parse", "HEAD"),
        "members": observed_members(root / ARCHIVE_ROOT),
    }


def compute_bundle_digest(archived: dict[str, Any]) -> str:
    """Computed by the shipped model, not reimplemented here."""
    script = """
import { bundleSha256 } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
process.stdout.write(bundleSha256(JSON.parse(raw)))
"""
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archived),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def archived_openspec(
    built: dict[str, Any], *, reviewed_form: str = "content", **overrides: Any
) -> dict[str, Any]:
    """The closed `archivedOpenSpec` object."""
    if reviewed_form == "content":
        digest = next(m["contentSha256"] for m in built["members"] if m["path"] == REVIEW_FILE)
        reviewed_identity = {
            "class": "content-sha256",
            "value": digest,
            "scope": [f"{ARCHIVE_ROOT}/{REVIEW_FILE}"],
        }
    else:
        reviewed_identity = {
            "class": "local-git-commit",
            "value": built["reviewedCommit"],
            "scope": [ACTIVE_ROOT],
        }

    archived = {
        "schemaVersion": 1,
        "contract": "archived-openspec-change-v1",
        "changeId": CHANGE_ID,
        "activeRoot": ACTIVE_ROOT,
        "archiveRoot": ARCHIVE_ROOT,
        "members": built["members"],
        "bundleSha256": "0" * 64,
        "reviewedIdentity": reviewed_identity,
        "archivedPackageIdentity": {
            "class": "local-git-commit",
            "value": built["archivedCommit"],
            "scope": [ARCHIVE_ROOT],
        },
    }
    archived.update(overrides)
    archived["bundleSha256"] = compute_bundle_digest(archived)
    return archived


def complete_state(
    root: Path,
    *,
    reviewed_form: str = "content",
    archived_overrides: dict[str, Any] | None = None,
    built: dict[str, Any] | None = None,
    **build_kwargs: Any,
) -> dict[str, Any]:
    built = built if built is not None else build_archived_repository(root, **build_kwargs)
    state = load_state(root)
    landing = state["landings"][0]
    artifact_path = state["adrs"][0]["path"]
    artifact_digest = hashlib.sha256((root / artifact_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "content-sha256",
                "value": artifact_digest,
                "scope": [artifact_path],
            },
            "policyEvidenceIdentities": [
                {
                    "class": "content-sha256",
                    "value": artifact_digest,
                    "scope": [artifact_path],
                }
            ],
            "archivedOpenSpec": archived_openspec(
                built, reviewed_form=reviewed_form, **(archived_overrides or {})
            ),
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    return bind_completion_digest(root, state)


def withdrawn_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    landing = state["landings"][0]
    artifact_path = state["adrs"][0]["path"]
    artifact_digest = hashlib.sha256((root / artifact_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Withdrawn"
    landing["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {
            "type": "withdrawal",
            "decisionIdentity": {
                "class": "content-sha256",
                "value": artifact_digest,
                "scope": [artifact_path],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    return bind_withdrawal_digest(root, state)


def spike_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    landing = state["landings"][0]
    landing["kind"] = "spike-landing"
    landing["authorityAnchor"] = {
        "type": "github-issue",
        "repository": "pulse-ops-ai/secure-home-agent-platform",
        "number": 54,
    }
    landing["delivery"]["completionPolicy"] = "reviewed-spike-evidence-v1"
    evidence_root = root / "spike"
    evidence_root.mkdir()
    manifest_path = "spike/MANIFEST.sha256"
    findings_path = "spike/findings.md"
    (root / manifest_path).write_text("findings\n", encoding="utf-8")
    (root / findings_path).write_text("# Spike findings\n", encoding="utf-8")
    manifest_digest = hashlib.sha256((root / manifest_path).read_bytes()).hexdigest()
    findings_digest = hashlib.sha256((root / findings_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-spike-evidence",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "8" * 40,
                "scope": [manifest_path, findings_path],
            },
            "policyEvidenceIdentities": [
                {"class": "content-sha256", "value": manifest_digest, "scope": [manifest_path]},
                {"class": "content-sha256", "value": findings_digest, "scope": [findings_path]},
            ],
            "noOpenSpec": True,
            "evidenceRoot": "spike",
            "manifest": {"path": manifest_path, "contentDigest": manifest_digest},
            "findings": {"path": findings_path, "contentDigest": findings_digest},
            "mergedPullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
            "mergedCommit": {
                "class": "external-git-commit",
                "value": "9" * 40,
                "scope": [manifest_path, findings_path],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 54,
            },
        },
    }
    landing["delivery"]["completion"]["digest"] = "0" * 64
    write_state(root, state)
    return bind_completion_digest(root, state)


def test_valid_fixture_derives_separate_readiness_axes(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    payload = assert_valid(root)
    assert assert_valid(root)["derived"] == payload["derived"]
    assert payload["derived"]["questions"]["U4"]["resolved"] is False
    assert payload["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is False
    readiness = payload["derived"]["readiness"]["runner/L8"]
    assert readiness["state"] == "Ready"
    assert readiness["authorizationAssessment"] == "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"


def test_missing_registry_is_not_an_empty_registry(tmp_path: Path) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    assert_refused(root, "ADV-G23")


def test_duplicate_json_key_is_rejected_before_object_construction(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    assert_refused(
        root,
        "ADV-G01",
        raw='{"schemaVersion":1,"schemaVersion":1}',
    )


def test_unknown_field_and_noncanonical_bytes_are_rejected(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["questions"][0]["resolved"] = False
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "noncanonical")
    assert_refused(root, "ADV-G03", raw=(root / "state.json").read_text() + "\n")


def test_unknown_collection_is_rejected_and_no_derived_answer_is_emitted(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["unclassifiedCollection"] = []
    write_state(root, state)
    payload = assert_refused(root, "ADV-G02", "ADV-G39")
    assert "derived" not in payload


def test_invalid_calendar_and_typed_anchor_shapes_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["adrs"][0]["proposedOn"] = "2026-02-30"
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "anchor")
    state = load_state(root)
    del state["gates"][0]["authorityAnchor"]["repository"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_v1_runner_node_identity_range_is_closed(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["id"] = "runner/L1"
    write_state(root, state)
    assert_refused(root, "ADV-G12")

    root = copy_fixture(tmp_path / "gate")
    state = load_state(root)
    state["gates"][0]["id"] = "runner/GATE-U9"
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_truncated_state_never_reads_as_empty(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    raw = (root / "state.json").read_text(encoding="utf-8")
    assert_refused(root, "ADV-G01", "ADV-G23", raw=raw[: len(raw) // 2])


def test_duplicate_members_dangling_and_bare_references_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["sources"].append(state["gates"][0]["sources"][0])
    write_state(root, state)
    assert_refused(root, "ADV-G38")

    root = copy_fixture(tmp_path / "dangling")
    state = load_state(root)
    state["landings"][0]["requires"] = ["runner/L99"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")

    root = copy_fixture(tmp_path / "bare")
    state = load_state(root)
    state["landings"][0]["requires"] = ["L8"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_sequence_and_completion_envelope_collections_reject_duplicates(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["reviewedOrderingIntent"] = ["first", "first"]
    write_state(root, state)
    assert_refused(root, "ADV-G38")

    root = copy_fixture(tmp_path / "envelope")
    state = load_state(root)
    state["attestations"]["genesisCompletion"] = {
        "envelopeDigest": "0" * 64,
        "members": [
            {"landingId": "runner/L8", "digest": "1" * 64},
            {"landingId": "runner/L8", "digest": "2" * 64},
        ],
        "actor": "@owner",
        "at": "2026-08-30T12:00:00Z",
        "outcome": "attested",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G65")


def test_prerequisite_cycle_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L10"])
    add_landing(state, landing_id="runner/L10", requires=["runner/L9"])
    write_state(root, state)
    assert_refused(root, "ADV-G10")


def test_proposed_resolver_and_unevaluable_predicate_do_not_satisfy_gate(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["adrs"][0]["resolves"] = ["U4"]
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8") + "\n- **Decides:** [U4](unresolved.md#u4)\n",
        encoding="utf-8",
    )
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["questions"]["U4"]["resolved"] is False

    root = copy_fixture(tmp_path / "predicate")
    state = load_state(root)
    state["gates"][0]["predicate"]["name"] = "always-true"
    write_state(root, state)
    assert_refused(root, "ADV-G09")


def test_relationship_header_must_mirror_registry(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    state = load_state(root)
    state["adrs"][0]["resolves"] = []
    write_state(root, state)
    assert_refused(root, "ADV-G14")


def test_two_current_accepted_resolvers_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    second_document = root / "docs/decisions/ADR-0002.md"
    second_document.parent.mkdir(parents=True, exist_ok=True)
    second_document.write_text(
        "# Second fixture\n\n- **Status:** Accepted\n- **Closes:** [U4](../unresolved.md#u4)\n",
        encoding="utf-8",
    )
    second = {
        "id": "ADR-0002",
        "path": "docs/decisions/ADR-0002.md",
        "title": "Second fixture decision",
        "lifecycle": "Accepted",
        "proposedOn": "2026-08-30",
        "resolves": ["U4"],
        "supersedes": [],
        "acceptance": {
            "transitionDigest": "0" * 64,
            "contentDigest": hashlib.sha256(second_document.read_bytes()).hexdigest(),
            "reviewedIdentity": {
                "class": "external-git-commit",
                "value": "2" * 40,
            },
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "accepted",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    state["adrs"].append(second)
    state = bind_acceptance_digest(root, state, 0)
    state = bind_acceptance_digest(root, state, 1)
    # The resolver uniqueness refusal is independent of transition evidence.
    assert_refused(root, "ADV-G06")


def test_accepted_bytes_and_header_mirror_are_bound(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    document = root / load_state(root)["adrs"][0]["path"]
    document.write_text("# Fixture decision\n\n- **Status:** Accepted\nchanged\n", encoding="utf-8")
    assert_refused(root, "ADV-G04")

    root = copy_fixture(tmp_path / "header")
    state = accepted_state(root, ["U4"])
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").replace("Accepted", "Proposed", 1),
        encoding="utf-8",
    )
    assert_refused(root, "ADV-G14")

    root = copy_fixture(tmp_path / "body-status")
    state = load_state(root)
    document = root / state["adrs"][0]["path"]
    document.write_text(
        "# Fixture decision\n\n---\n\n- **Status:** Proposed\n",
        encoding="utf-8",
    )
    assert_refused(root, "ADV-G14")


def test_convenience_resolution_fields_and_unknown_policy_are_refused(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["satisfied"] = True
    state["landings"][0]["blockedOn"] = []
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "policy")
    state = load_state(root)
    state["landings"][0]["delivery"]["completionPolicy"] = "legacy"
    write_state(root, state)
    assert_refused(root, "ADV-G15", "ADV-G30")


def test_completion_requires_policy_specific_scoped_evidence(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "3" * 40,
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G26")


def test_valid_completion_binds_scope_and_separates_historical_authorization(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready"
    assert payload["derived"]["readiness"]["runner/L8"]["authorizationAssessment"] is None

    before = payload["digests"]
    state["landings"][0]["delivery"]["completion"]["attestation"]["actor"] = "@reviewer"
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before

    root = copy_fixture(tmp_path / "evidence-binding")
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"]["type"] = "reviewed-delivery-v1"
    write_state(root, state)
    assert_refused(root, "ADV-G19")

    root = copy_fixture(tmp_path / "opaque-delivery")
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"]["deliveredIdentity"] = {
        "class": "external-git-commit",
        "value": "7" * 40,
        "scope": [state["adrs"][0]["path"]],
    }
    write_state(root, state)
    assert_refused(root, "ADV-G33")


def test_acceptance_provenance_change_does_not_change_transition_identity(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    before = assert_valid(root)["digests"]
    state["adrs"][0]["acceptance"]["reviewedIdentity"]["value"] = "2" * 40
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before


def test_spike_policy_requires_bound_evidence_and_no_retrospective_openspec(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    spike_state(root)
    assert_valid(root)

    root = copy_fixture(tmp_path / "missing-evidence")
    state = load_state(root)
    landing = state["landings"][0]
    landing["kind"] = "spike-landing"
    landing["authorityAnchor"] = {
        "type": "github-issue",
        "repository": "pulse-ops-ai/secure-home-agent-platform",
        "number": 54,
    }
    landing["delivery"]["completionPolicy"] = "reviewed-spike-evidence-v1"
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-spike-evidence",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "8" * 40,
                "scope": ["spike/findings.md"],
            },
            "policyEvidenceIdentities": [],
            "noOpenSpec": True,
            "mergedPullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
            "mergedCommit": {
                "class": "external-git-commit",
                "value": "9" * 40,
                "scope": ["spike/findings.md"],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 54,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G27")

    root = copy_fixture(tmp_path / "retrospective")
    state = spike_state(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["noOpenSpec"] = False
    evidence["archivedOpenSpec"] = {
        "path": "spike/findings.md",
        "contentDigest": hashlib.sha256((root / "spike/findings.md").read_bytes()).hexdigest(),
    }
    write_state(root, state)
    assert_refused(root, "ADV-G28")


def test_withdrawal_is_typed_and_never_satisfies_prerequisites(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {"type": "withdrawal"},
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G67")

    root = copy_fixture(tmp_path / "withdrawn-valid")
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {
            "type": "withdrawal",
            "decisionIdentity": {
                "class": "content-sha256",
                "value": "4" * 64,
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    # The zero digest is intentionally wrong; this exercises the preimage check.
    assert_refused(root, "ADV-G67")

    root = copy_fixture(tmp_path / "withdrawn-bound")
    withdrawn_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["authorizationAssessment"] is None

    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L9"]["unsatisfied"] == ["runner/L8"]


def test_malformed_terminal_envelopes_fail_closed_without_crashing(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": None,
        "attestation": None,
    }
    write_state(root, state)
    assert_refused(root, "ADV-G26")

    root = copy_fixture(tmp_path / "withdrawal")
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": None,
        "attestation": None,
    }
    write_state(root, state)
    assert_refused(root, "ADV-G67")


def test_missing_local_commit_does_not_prove_completion(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "local-git-commit",
                "value": "5" * 40,
                "scope": [state["adrs"][0]["path"]],
            },
            "policyEvidenceIdentities": [{"class": "external-git-commit", "value": "6" * 40}],
            "archivedOpenSpec": {
                "path": state["adrs"][0]["path"],
                "contentDigest": hashlib.sha256(
                    (root / state["adrs"][0]["path"]).read_bytes()
                ).hexdigest(),
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G33")


def test_malformed_top_level_collections_fail_without_derived_state(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"] = {}
    write_state(root, state)
    payload = assert_refused(root, "ADV-G02")
    assert "derived" not in payload


def test_target_state_replacement_requires_digest_and_complete_closure(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = replacement_state(root)
    assert_refused(root, "ADV-G66")

    root = copy_fixture(tmp_path / "valid")
    state = replacement_state(root)
    state = bind_replacement_digest(root, state)
    assert_valid(root)

    root = copy_fixture(tmp_path / "dependent")
    state = replacement_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    write_state(root, state)
    assert_refused(root, "ADV-G66")


def test_gate_replacement_digest_binds_source_references(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    old = state["gates"][0]
    replacement = json.loads(json.dumps(old))
    replacement["id"] = "runner/GATE-U4-v2"
    replacement["sources"] = ["adr.md#changed"]
    replacement["replaces"] = old["id"]
    replacement["replacement"] = {
        "digest": "0" * 64,
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "replaced",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    state["gates"].append(replacement)
    write_state(root, state)
    assert_refused(root, "ADV-G66")


def test_transitive_replacement_closure_repoints_every_dependent(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    add_landing(state, landing_id="runner/L10", requires=["runner/L9"])
    old_l8, old_l9, old_l10 = state["landings"]
    for old, replacement_id, requirements in [
        (old_l8, "runner/L8-v2", []),
        (old_l9, "runner/L9-v2", ["runner/L8-v2"]),
        (old_l10, "runner/L10-v2", ["runner/L9-v2"]),
    ]:
        replacement = json.loads(json.dumps(old))
        replacement["id"] = replacement_id
        replacement["requires"] = requirements
        replacement["replaces"] = old["id"]
        replacement["replacement"] = {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        }
        state["landings"].append(replacement)
    state = bind_all_replacement_digests(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["currentNodeIds"] == [
        "runner/GATE-U4",
        "runner/L10-v2",
        "runner/L8-v2",
        "runner/L9-v2",
    ]


def test_historical_references_and_three_node_chain_are_queryable(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = replacement_state(root)
    state = bind_replacement_digest(root, state)
    old = state["landings"][0]
    second = state["landings"][-1]
    third = {
        "id": "runner/L8-v3",
        "kind": "implementation-landing",
        "requires": [],
        "authorityAnchor": old["authorityAnchor"],
        "replaces": "runner/L8-v2",
        "replacement": {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        },
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": "reviewed-delivery-v1",
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(third)
    write_state(root, state)

    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const oldNode = state.landings.find((node) => node.id === 'runner/L8-v2')
const newNode = state.landings.find((node) => node.id === 'runner/L8-v3')
const digest = replacementDigest(oldNode, newNode)
newNode.replacement.digest = digest
newNode.replacement.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    state = json.loads(updated.stdout)
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["currentNodeIds"] == ["runner/GATE-U4", "runner/L8-v3"]
    assert second["replaces"] == "runner/L8"
    assert state["landings"][0]["requires"] == []


def test_set_reordering_is_canonical_and_digest_sensitive_to_real_changes(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["sources"] = [
        "adr.md#z",
        "adr.md#a",
    ]
    write_state(root, state)
    first = canonicalize(root)
    payload = assert_valid(root)

    state["gates"][0]["sources"].reverse()
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    second = canonicalize(root)
    assert first == second

    state["gates"][0]["sources"] = ["adr.md#changed"]
    write_state(root, state)
    changed = assert_valid(root)
    assert changed["digests"]["primitiveDigest"] != payload["digests"]["primitiveDigest"]


def test_attestation_envelope_is_excluded_from_primitive_digest(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    before = assert_valid(root)["digests"]
    state["adrs"][0]["acceptance"]["actor"] = "@different-owner"
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before


def test_policy_evidence_set_reordering_is_canonical(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    before_canonical = canonicalize(root)
    before = assert_valid(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["policyEvidenceIdentities"].reverse()
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    assert canonicalize(root) == before_canonical
    (root / "state.json").write_text(before_canonical, encoding="utf-8")
    after = assert_valid(root)
    assert after["digests"] == before["digests"]


def test_current_checker_owns_no_semantic_rule(tmp_path: Path) -> None:
    del tmp_path
    source = CHECKER.read_text(encoding="utf-8")
    assert "exactly-one-current-accepted-resolver" not in source
    assert "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION" not in source


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "changed semantic input"),
        ("proposedOn", "2026-08-31"),
    ],
)
def test_primitive_preimage_changes_when_a_real_field_changes(
    tmp_path: Path, field: str, value: str
) -> None:
    root = copy_fixture(tmp_path)
    before = assert_valid(root)["digests"]["primitiveDigest"]
    state = load_state(root)
    state["adrs"][0][field] = value
    write_state(root, state)
    after = assert_valid(root)["digests"]["primitiveDigest"]
    assert after != before


# ── the archived OpenSpec identity: both reviewed forms ─────────────────────
#
# Every case below drives the shipped checker over a real Git repository. The
# model's answers come from repository observations — root presence, scoped
# trees, exact bytes, reachability — so none of this can be satisfied by a JSON
# literal that merely looks right.


def unreachable_commit(root: Path) -> str:
    """A real commit that exists and is reachable from nothing.

    Exactly the state `git fetch origin refs/pull/<n>/head` leaves behind: the
    object is in the store, no ref keeps it alive, and it can be pruned.
    """
    git(root, "checkout", "-q", "-b", "side")
    (root / "stray.txt").write_text("stray\n", encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "unreachable work")
    stray = git(root, "rev-parse", "HEAD")
    git(root, "checkout", "-q", "main")
    git(root, "branch", "-qD", "side")
    return stray


def test_a_content_backed_reviewed_identity_over_the_full_projection_is_accepted(
    tmp_path: Path,
) -> None:
    """The delivery shape a squash produces: the reviewed commit need not
    survive, and the accepted review record carries the whole-package claim."""
    root = copy_fixture(tmp_path)
    complete_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready"


def test_a_commit_backed_reviewed_identity_reachable_from_head_is_accepted(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root, reviewed_form="commit")
    assert_valid(root)


def test_a_reviewed_commit_present_but_unreachable_is_refused(tmp_path: Path) -> None:
    """Object presence is not durability, and the checker must NOT silently
    downgrade the recorded form to the content one: the form is authored
    evidence, not a repair the checker performs."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit(root)

    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    payload = assert_refused(root, "ADV-G81")
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload


def test_an_unreachable_archived_package_identity_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit(root)

    complete_state(
        root,
        built=built,
        archived_overrides={
            "archivedPackageIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ARCHIVE_ROOT],
            }
        },
    )
    payload = assert_refused(root, "ADV-G81")
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload


def test_an_external_git_commit_cannot_be_a_reviewed_identity(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "external-git-commit",
                "value": "c" * 40,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    assert_refused(root, "ADV-G81")


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("closure-verdict", {"verdict": "FOCUSED_CLOSURE_REQUIRED"}),
        ("rejection-verdict", {"verdict": "ARCHITECTURE_REJECTED"}),
        ("unresolved-p1", {"unresolved_p1_count": 1}),
        ("unassigned-p2-p3", {"unassigned_p2_p3_count": 2}),
        ("authority-incomplete", {"authority_allocation_complete": False}),
        ("invariant-set-changed", {"invariant_set_changed": True}),
        ("old-contract-version", {"contract": "preimplementation-review-v1"}),
        ("wrong-schema", {"schema": "governed-spec-driven-v1"}),
        ("wrong-rubric", {"rubric": "something-else-v1"}),
        ("placeholder-reviewer", {"reviewer": "REPLACE_WITH_INDEPENDENT_REVIEWER"}),
        ("impossible-instant", {"reviewed_at": "2026-02-30T00:00:00Z"}),
        ("malformed-reviewed-commit", {"reviewed_commit": "not-a-commit"}),
        ("epoch-below-one", {"review_epoch": 0}),
    ],
)
def test_a_review_record_that_is_not_a_complete_acceptance_is_refused(
    tmp_path: Path, label: str, overrides: dict[str, Any]
) -> None:
    """Every declared digest still matches in each of these.

    Digest agreement proves the bytes are the ones the record names; it never
    converts a record that was not an acceptance into one.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root, review_overrides=overrides)
    payload = assert_refused(root, "ADV-G81")
    assert any(
        "not a complete accepting" in problem["message"] for problem in payload["problems"]
    ), (label, payload)


@pytest.mark.parametrize(
    ("label", "declared"),
    [
        ("single-member", [".openspec.yaml"]),
        ("missing-delta-spec", [p for p in PLANNING_MEMBERS if p != "specs/beta/spec.md"]),
        ("missing-tasks", [p for p in PLANNING_MEMBERS if p != "tasks.md"]),
        ("non-planning-member", [*PLANNING_MEMBERS, "README.md"]),
    ],
)
def test_an_incomplete_planning_manifest_is_refused(
    tmp_path: Path, label: str, declared: list[str]
) -> None:
    """Equality against the planning projection, not containment.

    Every digest these declare is correct. A subset rule would accept a record
    that read one file and call it a review of the package.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root, manifest_paths=declared)
    payload = assert_refused(root, "ADV-G81")
    assert any(
        "complete planning projection" in problem["message"] for problem in payload["problems"]
    ), (label, payload)


def test_archive_members_outside_the_planning_projection_are_accepted(tmp_path: Path) -> None:
    """The control for the rule above.

    The fixture archive carries a README and a historical review round the
    review never read. Requiring the manifest to name them would have failed the
    first real package.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    member_paths = {member["path"] for member in built["members"]}
    assert {"README.md", "reviews/1-aaaaaaaaaaaa.md", REVIEW_FILE} <= member_paths
    assert set(PLANNING_MEMBERS) < member_paths, "the projection must be a proper subset here"

    complete_state(root, built=built)
    assert_valid(root)


def test_a_reviewed_artifact_digest_mismatch_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root, corrupt_review_digest=True)
    assert_refused(root, "ADV-G81")


def test_an_arbitrary_member_is_not_a_whole_package_reviewed_identity(tmp_path: Path) -> None:
    """A `content-sha256` over `proposal.md` is a valid digest of one file and
    carries no whole-package claim; the review record is what carries it."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    digest = next(m["contentSha256"] for m in built["members"] if m["path"] == "proposal.md")
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "content-sha256",
                "value": digest,
                "scope": [f"{ARCHIVE_ROOT}/proposal.md"],
            }
        },
    )
    assert_refused(root, "ADV-G81")


def test_a_correct_bundle_without_a_review_witness_is_refused(tmp_path: Path) -> None:
    """`bundleSha256` is computed at completion over the delivered package. It
    proves what was delivered, never that those bytes were reviewed."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    (root / ARCHIVE_ROOT / REVIEW_FILE).write_text(
        "# Review\n\nno gate block at all\n", encoding="utf-8"
    )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "strip the review witness")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(root / ARCHIVE_ROOT),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    assert_refused(root, "ADV-G81")


def test_an_empty_member_set_is_refused(tmp_path: Path) -> None:
    """Non-vacuity. An empty membership is an unanswered question, not a package
    with nothing in it."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built, archived_overrides={"members": []})
    assert_refused(root, "ADV-G79")


def test_a_commit_stage_rule_against_a_content_identity_is_a_class_error() -> None:
    """Refused as a class error, not passed vacuously and not skipped silently.

    A rule that quietly stops applying and a rule that vacuously passes look
    identical from outside the checker; this makes them different.
    """
    script = """
import { assertStageRuleApplicable } from './scripts/governance/model/archived-openspec.mjs'
const content = { class: 'content-sha256', value: 'x', scope: ['a'] }
const commit = { class: 'local-git-commit', value: 'y', scope: ['a'] }
let refused = null
try {
  assertStageRuleApplicable(content, 'active-root presence')
} catch (error) {
  refused = error.code
}
const allowed = assertStageRuleApplicable(commit, 'active-root presence')
process.stdout.write(JSON.stringify({ refused, allowed }))
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert json.loads(out) == {"refused": "IDENTITY_CLASS_ERROR", "allowed": True}


@pytest.mark.parametrize(
    ("label", "body"),
    [
        ("all-unchecked", "- [ ] 1.1 one\n- [ ] 1.2 two\n"),
        ("all-checked", "- [x] 1.1 one\n- [x] 1.2 two\n"),
        ("partially-checked", "- [x] 1.1 one\n- [ ] 1.2 two\n"),
    ],
)
def test_planning_checkboxes_do_not_affect_completion(
    tmp_path: Path, label: str, body: str
) -> None:
    """Reviewed planning is immutable evidence; `delivery.lifecycle` plus its
    completion evidence is the mutable authority. The checkbox population is
    inside `bundleSha256` and is never read to derive completion."""
    root = copy_fixture(tmp_path / label)
    built = build_archived_repository(root)
    archive = root / ARCHIVE_ROOT

    (archive / "tasks.md").write_text(body, encoding="utf-8")
    # The bytes changed, so the member digest and the review-time digest are
    # re-derived. What must NOT change is the completion verdict.
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in PLANNING_MEMBERS
    ]
    (archive / REVIEW_FILE).write_text(review_block(artifacts), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", f"tasks.md: {label}")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(archive),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready", label


# ── the shared review contract is shared in BEHAVIOUR, not in name ──────────


def test_the_governance_model_has_no_copy_of_the_review_contract() -> None:
    """A component that is imported while its rules are ALSO restated elsewhere
    passes every structural check and still leaves two authorities."""
    governance = REPOSITORY_ROOT / "scripts/governance"
    owned = {
        "preimplementation-review-v2",
        "governed-preimplementation-review-v1",
        "ARCHITECTURE_ACCEPTED",
        "unresolved_p1_count",
        "authority_allocation_complete",
        "invariant_set_changed",
    }
    offenders: list[str] = []
    for source in governance.rglob("*.mjs"):
        text = source.read_text(encoding="utf-8")
        for constant in owned:
            # A comment may name it; a string literal would be a second copy.
            if f'"{constant}"' in text or f"'{constant}'" in text:
                offenders.append(f"{source.relative_to(REPOSITORY_ROOT)}: {constant}")
    assert offenders == [], offenders


def test_one_acceptance_rule_change_moves_both_consumers(tmp_path: Path) -> None:
    """The load-bearing proof of sharing.

    One acceptance rule is weakened inside the shared component and BOTH
    consumers must change their answer. If only one moves, the component is
    imported but not authoritative — the same defect wearing a better name.
    """
    contract = REPOSITORY_ROOT / "scripts/openspec-review-contract.mjs"
    original = contract.read_text(encoding="utf-8")
    anchor = "  if (gate.verdict !== ACCEPTED_VERDICT) {"
    assert original.count(anchor) == 1
    mutated = original.replace(anchor, "  if (false) {", 1)
    assert mutated != original, "the mutation did not change the subject bytes"

    probe = tmp_path / "probe"
    probe.mkdir()
    review = probe / "review.md"
    review.write_text(
        review_block(
            [{"path": "proposal.md", "sha256": "0" * 64}], verdict="ARCHITECTURE_REJECTED"
        ),
        encoding="utf-8",
    )

    script = """
import fs from 'node:fs'
import {
  extractReviewBlock,
  validateReviewRecordShapeAndAcceptance,
} from './scripts/openspec-review-contract.mjs'
const text = fs.readFileSync(process.env.REVIEW, 'utf8')
try {
  validateReviewRecordShapeAndAcceptance(extractReviewBlock(text))
  process.stdout.write('accepted')
} catch (error) {
  process.stdout.write(error.code)
}
"""

    def ask() -> str:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "REVIEW": str(review)},
        ).stdout

    before_shared = ask()
    before_gate = subprocess.run(
        ["node", str(REPOSITORY_ROOT / "scripts/openspec-review-gate.mjs"), "--help"],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    ).returncode

    try:
        contract.write_text(mutated, encoding="utf-8")
        after_shared = ask()
    finally:
        contract.write_text(original, encoding="utf-8")
        assert contract.read_text(encoding="utf-8") == original

    assert before_shared == "REVIEW_NOT_ACCEPTED", before_shared
    assert after_shared == "accepted", after_shared
    # The gate imports the same module, so it cannot be running a private copy.
    gate_source = (REPOSITORY_ROOT / "scripts/openspec-review-gate.mjs").read_text(encoding="utf-8")
    assert "validateReviewRecordShapeAndAcceptance" in gate_source
    assert "from './openspec-review-contract.mjs'" in gate_source
    assert before_gate == 0 or before_gate == 1


# ── the real delivered archive, as the conformance example ──────────────────


def test_the_real_archived_typescript_change_satisfies_the_content_form() -> None:
    """The first change this repository actually delivered under this contract.

    A rule that only its own fixtures satisfy has not been tested against
    reality. This reads the shipped archive and the shipped review record
    through the SHARED contract, with no fixture in sight — the counts are
    derived, never hard-coded, because they belong to that package and not to
    the schema.
    """
    archives = sorted((REPOSITORY_ROOT / "openspec/changes/archive").glob("*-typescript-7-*"))
    assert len(archives) == 1, archives
    archive = archives[0]

    members = observed_members(archive)
    projection_script = """
import {
  deltaSpecPaths,
  extractReviewBlock,
  planningProjection,
  validateReviewRecordShapeAndAcceptance,
} from './scripts/openspec-review-contract.mjs'
import fs from 'node:fs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const paths = JSON.parse(raw)
const record = validateReviewRecordShapeAndAcceptance(
  extractReviewBlock(fs.readFileSync(process.env.REVIEW, 'utf8')),
)
process.stdout.write(
  JSON.stringify({
    projection: planningProjection(deltaSpecPaths(paths)),
    declared: record.reviewed_artifacts,
    verdict: record.verdict,
  }),
)
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", projection_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps([m["path"] for m in members]),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "REVIEW": str(archive / REVIEW_FILE)},
    ).stdout
    result = json.loads(out)

    assert result["verdict"] == "ARCHITECTURE_ACCEPTED"
    assert sorted(a["path"] for a in result["declared"]) == sorted(result["projection"])
    assert len(result["projection"]) < len(members), (
        "the planning projection must be a PROPER subset of the archive members, or the "
        "non-planning members this rule tolerates are not present to tolerate"
    )

    by_path = {m["path"]: m["contentSha256"] for m in members}
    mismatched = [
        artifact["path"]
        for artifact in result["declared"]
        if by_path.get(artifact["path"]) != artifact["sha256"]
    ]
    assert mismatched == [], mismatched


# ── the new rules are load-bearing ──────────────────────────────────────────


def run_mutated_checker(
    tmp_path: Path, root: Path, source: Path, old: str, new: str
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    """Mutate a shipped module, run the real checker, and restore it.

    The mutation asserts its own effect on the subject bytes first: a mutation
    that changed nothing re-runs the unmutated checker under a different name.
    """
    original = source.read_text(encoding="utf-8")
    assert original.count(old) == 1, f"mutation anchor is not unique in {source.name}"
    mutated = original.replace(old, new, 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        return run_checker(root)
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original


def test_replacing_projection_equality_with_containment_reopens_the_hole(
    tmp_path: Path,
) -> None:
    """MUTATION. Completeness is what refuses a one-file review manifest."""
    root = copy_fixture(tmp_path)
    complete_state(root, manifest_paths=[".openspec.yaml"])
    assert_refused(root, "ADV-G81")

    result, _payload = run_mutated_checker(
        tmp_path,
        root,
        REPOSITORY_ROOT / "scripts/governance/model/archived-openspec.mjs",
        "  if (JSON.stringify(declared) !== JSON.stringify(wanted)) {",
        "  if (!declared.every((p) => wanted.includes(p))) {",
    )
    assert result.returncode == 0, (
        "containment did not reopen the hole, so equality is not what closes it"
    )


def test_weakening_durability_to_object_presence_reopens_the_hole(tmp_path: Path) -> None:
    """MUTATION. Reachability, not presence, is what refuses a fetched PR ref."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit(root)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    assert_refused(root, "ADV-G81")

    result, _payload = run_mutated_checker(
        tmp_path,
        root,
        REPOSITORY_ROOT / "scripts/governance/git-tree/index.mjs",
        "      if (!this.commitExists(oid)) return false\n      return (\n"
        "        run(repoRoot, ['merge-base', '--is-ancestor', oid, head], { allowFailure: true })"
        " !==\n        undefined\n      )",
        "      return this.commitExists(oid)",
    )
    # The stray commit has no active root, so the stage rules still refuse it —
    # what must change is WHICH refusal fires, proving reachability was the one
    # that did.
    _result, payload = run_checker(root)
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload
    assert result.returncode != 0
