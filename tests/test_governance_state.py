"""PR-1 conformance tests for the offline governance-state checker.

The tests intentionally invoke the shipped Node entry point for every
current-state refusal. Python only prepares isolated temporary fixture trees
and checks the reported contract; it does not reimplement the model.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
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
            "type": "reviewed-delivery-v1",
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
            "type": "reviewed-spike-evidence-v1",
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
            "type": "reviewed-delivery-v1",
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
    # The legacy discriminator alias is refused on its own terms; the evidence
    # branch short-circuits before the digest check, which is why only the
    # shape refusal is asserted here. The digest binding has its own case below.
    state["landings"][0]["delivery"]["completion"]["evidence"]["type"] = "reviewed-delivery"
    write_state(root, state)
    assert_refused(root, "ADV-G30")

    root = copy_fixture(tmp_path / "digest-binding")
    state = complete_state(root)
    # A well-formed digest that is simply not the computed one, so nothing but
    # the preimage binding can refuse it.
    state["landings"][0]["delivery"]["completion"]["digest"] = "9" * 64
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
            "type": "reviewed-spike-evidence-v1",
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
            "type": "reviewed-delivery-v1",
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


def unreachable_commit_carrying_active_package(root: Path, built: dict[str, Any]) -> str:
    """An unreachable commit that would otherwise satisfy every stage rule.

    The point of the durability guard is that this commit is indistinguishable
    from a valid reviewed snapshot except for reachability: the active root is
    present, the archive root is absent, and the scoped tree matches the
    declared members exactly. Anything less and the mutation below would be
    refused by some other rule, proving nothing.
    """
    head = git(root, "rev-parse", "HEAD")
    reviewed = built["reviewedCommit"]
    git(root, "checkout", "-q", "-b", "side", reviewed)
    stray = git(root, "rev-parse", "HEAD")
    git(root, "checkout", "-q", "main")
    git(root, "branch", "-qD", "side")
    assert stray == reviewed, "the side branch must name the reviewed snapshot"
    # Rewrite main so the reviewed snapshot is no longer an ancestor, while the
    # archive it produced stays exactly as it is.
    git(root, "checkout", "-q", "--orphan", "detached")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "re-rooted history without the reviewed snapshot")
    git(root, "branch", "-qM", "main")
    void = git(root, "rev-parse", "HEAD")
    assert void != head
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
    """F12. The load-bearing proof that the owner is SHARED.

    One acceptance rule is weakened inside the shared component and BOTH REAL
    consumers must change their answer: the OpenSpec review gate CLI, and the
    governance checker reading a content-backed reviewed identity. A component
    that only one consumer actually reads is the same defect wearing a better
    name, and it passes every structural check.

    The rule chosen is the unresolved-P1 count, because it is owned ONLY by the
    shared component — the gate's prose checks have no equivalent, so a flip
    cannot come from anywhere else.
    """
    import test_openspec_review_gate as gate_tests

    # Consumer A: the review gate CLI, over a real planning repository.
    gate_repo = gate_tests._planning_repo(tmp_path / "gate")
    gate_tests._accept(gate_repo, gate_overrides={"unresolved_p1_count": 1})

    def ask_gate() -> tuple[int, str]:
        result = gate_tests._gate(gate_repo, "verify")
        return result.returncode, result.stdout + result.stderr

    # Consumer B: the governance checker, over a content-backed reviewed identity.
    state_root = copy_fixture(tmp_path / "governance")
    complete_state(state_root, review_overrides={"unresolved_p1_count": 1})

    def ask_governance() -> int:
        return run_checker(state_root)[0].returncode

    before_gate, before_gate_output = ask_gate()
    before_governance = ask_governance()

    contract = REPOSITORY_ROOT / "scripts/openspec-review-contract.mjs"
    original = contract.read_text(encoding="utf-8")
    anchor = "  if (gate.unresolved_p1_count !== 0) {"
    assert original.count(anchor) == 1
    mutated = original.replace(anchor, "  if (false) {", 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        contract.write_text(mutated, encoding="utf-8")
        after_gate, _ = ask_gate()
        after_governance = ask_governance()
    finally:
        contract.write_text(original, encoding="utf-8")
        assert contract.read_text(encoding="utf-8") == original

    assert before_gate != 0 and "UNRESOLVED_P1" in before_gate_output, before_gate_output
    assert before_governance != 0
    assert after_gate == 0, (
        "the review gate did not respond to the shared rule, so it is not reading the owner"
    )
    assert after_governance == 0, (
        "the governance checker did not respond to the shared rule, so it is not reading the owner"
    )


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
    """MUTATION. Reachability, not presence, is what refuses a fetched PR ref.

    The mutation must make the hostile case ACCEPT. A mutation that merely
    changes which refusal fires proves nothing: the guard could be redundant.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit_carrying_active_package(root, built)
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

    result, _payload = run_mutated_checker(
        tmp_path,
        root,
        REPOSITORY_ROOT / "scripts/governance/git-tree/index.mjs",
        "      const result = run(repoRoot, ['merge-base', '--is-ancestor', oid, head])",
        "      return PRESENT\n      const result = run(repoRoot, "
        "['merge-base', '--is-ancestor', oid, head])",
    )
    assert result.returncode == 0, (
        "presence-only durability did not ACCEPT the fetched-but-unreachable case, so "
        "reachability is not the guard that refuses it"
    )


# ── independent-review closure regressions (F01-F16) ────────────────────────
#
# Each reproduces a finding against the pre-fix implementation and pins the
# refusal the production fix now produces. They drive the shipped checker over
# real Git repositories and a real checkout; none asserts from source alone.


def substitute_review_bytes(root: Path, **overrides: Any) -> str:
    """Replace the CHECKED-OUT review artifact with a different accepting one."""
    archive = root / ARCHIVE_ROOT
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in PLANNING_MEMBERS
    ]
    substituted = review_block(artifacts, **({"reviewer": "Someone Else", **overrides}))
    (archive / REVIEW_FILE).write_text(substituted, encoding="utf-8")
    return hashlib.sha256(substituted.encode("utf-8")).hexdigest()


def test_f01_worktree_review_substitution_is_refused(tmp_path: Path) -> None:
    """F01. The content identity and the member bytes must be the SAME bytes.

    Pre-fix this returned ok:true: the member manifest and every Git-tree
    observation proved artifact A while the identity was the digest of whatever
    the read returned — B — and the accepting record validated was the one the
    archive does not contain.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)

    digest_b = substitute_review_bytes(root)
    archived = state["landings"][0]["delivery"]["completion"]["evidence"]["archivedOpenSpec"]
    declared = next(m for m in archived["members"] if m["path"] == REVIEW_FILE)
    assert declared["contentSha256"] != digest_b, "the substitution changed no bytes"
    archived["reviewedIdentity"]["value"] = digest_b
    bind_completion_digest(root, state)

    assert_refused(root, "ADV-G85")


def test_f01_the_identity_must_equal_the_declared_member_digest(tmp_path: Path) -> None:
    """F01, at the seam.

    The whole-package comparison above refuses the substitution first, so the
    specific chain link — identity == declared member digest — is driven
    directly against the semantic owner with observations that AGREE with the
    manifest and a read that does not.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)
    archived = state["landings"][0]["delivery"]["completion"]["evidence"]["archivedOpenSpec"]

    script = """
import fs from 'node:fs'
import { validateArchivedOpenSpec } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const archived = JSON.parse(raw)
const problems = []
validateArchivedOpenSpec(archived, '$', problems, {
  // Observations AGREE with the manifest; only the read disagrees.
  observe: {
    commitExists: () => 'PRESENT',
    isReachable: () => 'PRESENT',
    pathExistsAt: (_o, p) => (p === archived.archiveRoot ? 'PRESENT' : 'ABSENT'),
    treeAt: () => ({ status: 'PRESENT', entries: toEntries(archived.members) }),
    currentTree: () => ({ status: 'PRESENT', entries: toEntries(archived.members) }),
    currentPathExists: () => 'ABSENT',
  },
  checkout: {
    tree: () => toEntries(archived.members),
    pathExists: () => false,
  },
  readBytes: () => Buffer.from(process.env.SUBSTITUTE, 'utf8'),
})
function toEntries(members) {
  return new Map(members.map((m) => [m.path, { mode: '100644', sha256: m.contentSha256 }]))
}
process.stdout.write(JSON.stringify(problems))
"""
    substitute = review_block(
        [
            {
                "path": p,
                "sha256": hashlib.sha256((root / ARCHIVE_ROOT / p).read_bytes()).hexdigest(),
            }
            for p in PLANNING_MEMBERS
        ],
        reviewer="Someone Else Entirely",
    )
    substitute_digest = hashlib.sha256(substitute.encode("utf-8")).hexdigest()
    assert substitute_digest != next(
        m["contentSha256"] for m in archived["members"] if m["path"] == REVIEW_FILE
    ), "the substitute must not be the archived bytes, or the case proves nothing"
    archived["reviewedIdentity"]["value"] = substitute_digest
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archived),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "SUBSTITUTE": substitute},
    ).stdout
    problems = json.loads(out)
    assert any("are not the declared" in p["message"] for p in problems), problems


@pytest.mark.parametrize("label", ["dirty", "deleted", "extra"])
def test_f02_the_current_checkout_is_proved_not_just_head(tmp_path: Path, label: str) -> None:
    """F02. `ls-tree` answers what a COMMIT contains.

    Pre-fix all three returned ok:true, because the "current" observation was
    HEAD. A checker that cannot see its own working tree is checking a different
    repository from the one it is running in.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root)
    archive = root / ARCHIVE_ROOT
    if label == "dirty":
        (archive / "design.md").write_text("# tampered\n", encoding="utf-8")
    elif label == "deleted":
        (archive / "design.md").unlink()
    else:
        (archive / "sneaked.md").write_text("# extra\n", encoding="utf-8")

    assert_refused(root, "ADV-G85")


def test_f03_a_symlinked_ancestor_cannot_escape_the_repository(tmp_path: Path) -> None:
    """F03. Lexical containment is not containment.

    The archive is moved outside the repository and an ancestor replaced with a
    symlink; pre-fix the bytes were read as though they were inside, because
    only the FINAL entry was checked for a symlink.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built)

    outside = tmp_path / "outside"
    outside.mkdir()
    parent = (root / ARCHIVE_ROOT).parent
    moved = outside / parent.name
    parent.rename(moved)
    parent.symlink_to(moved)

    payload = assert_refused(root, "ADV-G84")
    assert any("symlink" in p["message"] for p in payload["problems"]), payload


def test_f03_a_symlinked_final_member_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built)
    target = root / ARCHIVE_ROOT / "design.md"
    target.unlink()
    target.symlink_to(tmp_path / "elsewhere.md")
    (tmp_path / "elsewhere.md").write_text("# elsewhere\n", encoding="utf-8")

    assert_refused(root, "ADV-G84")


def test_f04_an_unanswerable_observation_never_satisfies_absence(tmp_path: Path) -> None:
    """F04. Absence and failure are different answers.

    Pre-fix every nonzero Git exit became `undefined`, so a corrupt store — or
    any unexpected failure — was reported as "this path is absent", which is
    exactly what several stage rules REQUIRE.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    objects = root / ".git" / "objects"
    moved = root / ".git" / "objects-moved"
    objects.rename(moved)
    try:
        payload = assert_refused(root, "ADV-G81")
        assert any("could not be observed" in p["message"] for p in payload["problems"]), payload
    finally:
        moved.rename(objects)


def test_f04_the_observer_reports_three_distinct_answers() -> None:
    """The adapter's own contract, driven rather than read."""
    script = """
import { createGitTreeObserver } from './scripts/governance/git-tree/index.mjs'
const good = createGitTreeObserver(process.cwd())
const broken = createGitTreeObserver('/')
process.stdout.write(
  JSON.stringify({
    present: good.currentPathExists('package.json'),
    absent: good.currentPathExists('definitely-not-here-xyz'),
    error: broken.currentPathExists('package.json'),
    errorTree: broken.currentTree('package.json').status,
  }),
)
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert json.loads(out) == {
        "present": "PRESENT",
        "absent": "ABSENT",
        "error": "OBSERVATION_ERROR",
        "errorTree": "OBSERVATION_ERROR",
    }


@pytest.mark.parametrize(
    ("label", "lifecycle", "field"),
    [
        ("complete-with-withdrawal", "Complete", "withdrawal"),
        ("withdrawn-with-completion", "Withdrawn", "completion"),
    ],
)
def test_f05_mutually_exclusive_terminal_envelopes_are_refused(
    tmp_path: Path, label: str, lifecycle: str, field: str
) -> None:
    """F05. An early return that records nothing is indistinguishable from
    acceptance.

    Pre-fix a `Complete` landing carrying both envelopes produced no problem at
    all and went on to satisfy a prerequisite.
    """
    root = copy_fixture(tmp_path / label)
    state = complete_state(root) if lifecycle == "Complete" else withdrawn_state(root)
    state["landings"][0]["delivery"][field] = {}
    write_state(root, state)

    payload = assert_refused(root, "ADV-G67")
    assert any("mutually exclusive" in p["message"] for p in payload["problems"]), payload
    assert payload["ok"] is False


def test_f06_an_identity_whose_scope_does_not_resolve_is_refused(tmp_path: Path) -> None:
    """F06. Object existence proves only that some commit exists."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)
    state["landings"][0]["delivery"]["completion"]["evidence"]["deliveredIdentity"] = {
        "class": "local-git-commit",
        "value": built["archivedCommit"],
        "scope": ["does/not/exist.md"],
    }
    bind_completion_digest(root, state)

    payload = assert_refused(root, "ADV-G33")
    assert any("does not exist at the bound commit" in p["message"] for p in payload["problems"])


@pytest.mark.parametrize(
    ("label", "scope"),
    [
        ("traversal", ["../escape"]),
        ("absolute", ["/etc/passwd"]),
        ("duplicate", ["a.md", "a.md"]),
        ("non-string", [123]),
    ],
)
def test_f07_nested_scopes_use_the_shared_canonical_path_set_rule(
    tmp_path: Path, label: str, scope: list[Any]
) -> None:
    """F07. One owner for canonical path sets.

    The nested archive identities checked only "non-empty array", so traversal,
    absolute paths, duplicates and non-strings reached the observation layer
    through that door while every other scope refused them.
    """
    root = copy_fixture(tmp_path / label)
    built = build_archived_repository(root)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "archivedPackageIdentity": {
                "class": "local-git-commit",
                "value": built["archivedCommit"],
                "scope": scope,
            }
        },
    )
    assert_refused(root, "ADV-G84")


def test_f07_canonical_ordering_is_owned_by_the_shared_path_set_rule() -> None:
    """Ordering is proved at the seam: the canonical writer sorts a scope on
    its way into the registry, so an unsorted one cannot be expressed through a
    state file — but the rule the archive identity shares must still have it."""
    script = """
import { canonicalPathSetProblems } from './scripts/governance/model/paths.mjs'
process.stdout.write(
  JSON.stringify({
    unsorted: canonicalPathSetProblems(['b.md', 'a.md']),
    sorted: canonicalPathSetProblems(['a.md', 'b.md']),
    duplicate: canonicalPathSetProblems(['a.md', 'a.md']),
    traversal: canonicalPathSetProblems(['../x']),
  }),
)
"""
    out = json.loads(
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    assert out["sorted"] == []
    assert out["unsorted"] and "canonical path order" in out["unsorted"][0]
    assert out["duplicate"] and "duplicate" in out["duplicate"][0]
    assert out["traversal"], out


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("legacy-alias", {"type": "reviewed-delivery"}),
        ("cross-branch-field", {"evidenceRoot": "docs/spikes/x/"}),
        ("unknown-field", {"somethingElse": True}),
    ],
)
def test_f08_evidence_branches_are_closed_per_policy(
    tmp_path: Path, label: str, mutate: dict[str, Any]
) -> None:
    """F08. A broad union let a delivery carry spike fields, and accepted a
    legacy discriminator alias as a compatibility path."""
    root = copy_fixture(tmp_path / label)
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"].update(mutate)
    write_state(root, state)

    result, payload = run_checker(root)
    assert result.returncode != 0, (label, payload)


def test_f09_the_bundle_identity_is_order_insensitive() -> None:
    """F09. `archivedOpenSpec.members[]` is an entity set keyed by path.

    Pre-fix, reversing the members changed the bundle digest — turning a
    presentational difference into a different delivery.
    """
    script = """
import { bundleSha256 } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const archived = JSON.parse(raw)
const forward = bundleSha256(archived)
const reverse = bundleSha256({ ...archived, members: [...archived.members].reverse() })
process.stdout.write(JSON.stringify({ forward, reverse }))
"""
    archived = {
        "schemaVersion": 1,
        "contract": "archived-openspec-change-v1",
        "changeId": "demo-change",
        "activeRoot": "openspec/changes/demo-change",
        "archiveRoot": "openspec/changes/archive/2026-09-10-demo-change",
        "members": [
            {"path": "a.md", "contentSha256": "1" * 64},
            {"path": "b.md", "contentSha256": "2" * 64},
        ],
    }
    out = json.loads(
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPOSITORY_ROOT,
            input=json.dumps(archived),
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    assert out["forward"] == out["reverse"], out


def test_f09_duplicate_member_paths_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    duplicated = [*built["members"], built["members"][0]]
    duplicated.sort(key=lambda m: m["path"].encode("utf-8"))
    complete_state(root, built=built, archived_overrides={"members": duplicated})
    assert_refused(root, "ADV-G79")


#: An INDEPENDENT golden vector: the expected digest is computed here by a
#: literal canonical serialization, never by the production preimage function.
#: A bundle rule that silently dropped a field would agree with itself forever.
GOLDEN_BUNDLE_INPUT: dict[str, Any] = {
    "schemaVersion": 1,
    "contract": "archived-openspec-change-v1",
    "changeId": "golden-change",
    "activeRoot": "openspec/changes/golden-change",
    "archiveRoot": "openspec/changes/archive/2026-01-02-golden-change",
    "members": [
        {"path": "a.md", "contentSha256": "a" * 64},
        {"path": "b.md", "contentSha256": "b" * 64},
    ],
}
#: Written out BY HAND in the repository's canonical form, never produced by
#: `bundlePreimage`. A preimage function compared only with itself agrees
#: forever, including about a field it silently stopped including.
GOLDEN_BUNDLE_PREIMAGE = """{
  "schemaVersion": 1,
  "activeRoot": "openspec/changes/golden-change",
  "archiveRoot": "openspec/changes/archive/2026-01-02-golden-change",
  "changeId": "golden-change",
  "contract": "archived-openspec-change-v1",
  "members": [
    {
      "contentSha256": "AAAA",
      "path": "a.md"
    },
    {
      "contentSha256": "BBBB",
      "path": "b.md"
    }
  ]
}
""".replace("AAAA", "a" * 64).replace("BBBB", "b" * 64)


def production_bundle_digest(archived: dict[str, Any]) -> str:
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


def test_f12_the_bundle_matches_an_independently_derived_golden_vector() -> None:
    expected = hashlib.sha256(GOLDEN_BUNDLE_PREIMAGE.encode("utf-8")).hexdigest()
    assert production_bundle_digest(GOLDEN_BUNDLE_INPUT) == expected


@pytest.mark.parametrize(
    "field",
    ["schemaVersion", "contract", "changeId", "activeRoot", "archiveRoot"],
)
def test_f12_removing_any_identity_bearing_bundle_field_fails_the_golden_vector(
    tmp_path: Path, field: str
) -> None:
    """F12. Removing `activeRoot` from the preimage left every focused test
    green, because nothing compared the digest to anything but itself."""
    expected = hashlib.sha256(GOLDEN_BUNDLE_PREIMAGE.encode("utf-8")).hexdigest()
    source = REPOSITORY_ROOT / "scripts/governance/model/archived-openspec.mjs"
    original = source.read_text(encoding="utf-8")
    anchor = {
        "schemaVersion": "    schemaVersion: 1,\n",
        "contract": "    contract: ARCHIVED_CONTRACT,\n",
        "changeId": "    changeId: archived.changeId,\n",
        "activeRoot": "    activeRoot: archived.activeRoot,\n",
        "archiveRoot": "    archiveRoot: archived.archiveRoot,\n",
    }[field]
    assert original.count(anchor) == 1, field
    mutated = original.replace(anchor, "", 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        assert production_bundle_digest(GOLDEN_BUNDLE_INPUT) != expected, field
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original


@pytest.mark.parametrize("index", [0, 1])
def test_f12_changing_any_member_changes_the_bundle(index: int) -> None:
    base = production_bundle_digest(GOLDEN_BUNDLE_INPUT)
    for key, replacement in (("path", "z.md"), ("contentSha256", "c" * 64)):
        members = [
            dict(member) for member in cast(list[dict[str, str]], GOLDEN_BUNDLE_INPUT["members"])
        ]
        members[index][key] = replacement
        assert production_bundle_digest({**GOLDEN_BUNDLE_INPUT, "members": members}) != base


def test_f10_a_bom_prefixed_registry_is_refused(tmp_path: Path) -> None:
    """F10. The canonical form is a BYTE contract.

    `TextDecoder` strips a leading U+FEFF, so the decoded text was canonical
    while the bytes were not.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    target = root / "state.json"
    target.write_bytes(b"\xef\xbb\xbf" + target.read_bytes())

    assert_refused(root, "ADV-G03")


def test_f11_a_package_without_a_delta_spec_is_refused(tmp_path: Path) -> None:
    """F11. Two different questions, deliberately not merged: the review
    planning projection covers every `specs/**/*.md`; the minimum package
    requires at least one `specs/**/spec.md`."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    archive = root / ARCHIVE_ROOT
    for stale in list(archive.glob("specs/*/spec.md")):
        stale.rename(stale.with_name("notes.md"))
    planning = [
        p if not p.endswith("/spec.md") else p[: -len("spec.md")] + "notes.md"
        for p in PLANNING_MEMBERS
    ]
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in planning
    ]
    (archive / REVIEW_FILE).write_text(review_block(artifacts), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "specs carry notes.md only")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(archive),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    payload = assert_refused(root, "ADV-G78")
    assert any("specs/**/spec.md" in p["message"] for p in payload["problems"]), payload


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("proposedOn", ["2026-08-30"]),
        ("id", 1234),
        ("path", {"x": 1}),
        ("title", ["t"]),
        ("lifecycle", ["Proposed"]),
        ("resolves", "U4"),
        ("supersedes", {"a": 1}),
    ],
)
def test_f14_wrong_json_types_become_refusals_not_crashes(
    tmp_path: Path, field: str, value: Any
) -> None:
    """F14. A RegExp coerces its argument, so `DATE.test(["2026-08-30"])` was
    TRUE and the next line threw a TypeError out of the checker.

    A crash is not a verdict: it exits nonzero with no problem list, which is
    indistinguishable from a tooling failure.
    """
    root = copy_fixture(tmp_path / field)
    state = load_state(root)
    state["adrs"][0][field] = value
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert "TypeError" not in result.stderr, result.stderr
    assert payload["problems"], payload


def test_f15_an_unparseable_relationship_claim_is_not_no_relationship(tmp_path: Path) -> None:
    """F15. Parse failure must not collapse to the same value as "no
    relationship".

    A plain `Closes: U4` line is not the structural form, so it parsed to
    nothing — and nothing is exactly what an empty registry relation looks like.
    """
    root = copy_fixture(tmp_path)
    accepted_state(root, [])
    document = root / load_state(root)["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").rstrip("\n") + "\n\nCloses: U4\n", encoding="utf-8"
    )
    state = load_state(root)
    state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
        document.read_bytes()
    ).hexdigest()
    write_state(root, bind_acceptance_digest(root, state, 0))

    payload = assert_refused(root, "ADV-G14")
    assert any("cannot read structurally" in p["message"] for p in payload["problems"]), payload


def test_f15_the_structural_relationship_form_still_passes(tmp_path: Path) -> None:
    """The control. Tightening the parser must not refuse the form the
    repository actually authors."""
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    assert_valid(root)


def test_f16_a_resolved_question_names_its_acceptance_date(tmp_path: Path) -> None:
    """F16. The contract's resolution scenario requires the resolver AND its
    acceptance date."""
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    payload = assert_valid(root)
    question = payload["derived"]["questions"]["U4"]
    assert question["resolved"] is True
    assert question["resolver"] == "ADR-0001"
    assert question["resolvedAt"] == "2026-08-30T12:00:00Z", question


def test_f13_the_extraction_preserved_the_review_gate_answer(tmp_path: Path) -> None:
    """F13. The extraction was required to preserve the gate's answers.

    A Windows-style drive path is the case that exposed a change. On POSIX
    `path.isAbsolute('C:/outside')` is FALSE, so pre-extraction such a path fell
    through the artifact-path check and surfaced later as ARTIFACT_SET_DRIFT.
    Adding a drive-letter test during the extraction turned that into
    INVALID_ARTIFACT_PATH — stricter, and still a behaviour change the refactor
    had no authority to make.

    Both implementations are run over the SAME fixture, so this compares
    answers rather than asserting one from source.
    """
    import test_openspec_review_gate as gate_tests

    pre_source = subprocess.run(
        [
            "git",
            "show",
            "fc1b9f4eef748f7cd0f6af7818bec94d3045f46e:scripts/openspec-review-gate.mjs",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout

    def answer(repo: Path, script: Path) -> str:
        result = subprocess.run(
            [
                "node",
                str(script),
                "verify",
                "--change",
                "demo",
                "--base",
                gate_tests.BASE,
                "--base-sha",
                subprocess.run(
                    ["git", "rev-parse", f"{gate_tests.BASE}^{{commit}}"],
                    cwd=repo,
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout.strip(),
            ],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0, result.stdout
        # The refusal CODE, the way the gate's own tests read it.
        match = re.search(r"REVIEW_GATE_REFUSED \[([A-Z_0-9]+)\]", result.stderr)
        assert match is not None, result.stderr + result.stdout
        return match.group(1)

    for name, script_path in (
        ("pre", None),
        ("post", REPOSITORY_ROOT / "scripts/openspec-review-gate.mjs"),
    ):
        repo = gate_tests._planning_repo(tmp_path / name)
        manifest = gate_tests._manifest(repo)
        gate_tests._accept(
            repo,
            gate_overrides={
                "reviewed_artifacts": [
                    *manifest["reviewed_artifacts"],
                    {"path": "C:/outside", "sha256": "0" * 64},
                ]
            },
        )
        if script_path is None:
            script_path = tmp_path / "pre-gate.mjs"
            script_path.write_text(pre_source, encoding="utf-8")
        globals().setdefault("_f13_answers", {})[name] = answer(repo, script_path)

    answers = globals()["_f13_answers"]
    assert answers["pre"] == answers["post"], (
        f"the extraction changed the gate's answer: pre={answers['pre']} post={answers['post']}"
    )
    assert answers["pre"] == "ARTIFACT_SET_DRIFT", answers


# ── F16b: a noncanonical registry is told what canonical would have been ────


def run_checker_human(root: Path) -> subprocess.CompletedProcess[str]:
    """The human-mode CLI, which is where the original finding was observed."""
    return subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "scripts/check-governance-state.mjs"),
            "--root",
            str(root),
            "--state",
            "state.json",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def write_noncanonical(root: Path) -> str:
    """Re-encode the SAME logical state with different whitespace.

    Logically identical, byte-different: the one case the contract names, and
    the one where "not canonical" is useless without saying what canonical is.
    Returns the canonical form the checker must report.
    """
    target = root / "state.json"
    canonical = target.read_text(encoding="utf-8")
    logical = json.loads(canonical)
    target.write_text(json.dumps(logical, indent=4) + "\n", encoding="utf-8")
    assert target.read_text(encoding="utf-8") != canonical, "the re-encoding changed no bytes"
    return canonical


def test_f16b_json_mode_reports_the_expected_canonical_form(tmp_path: Path) -> None:
    """F16b. The model already produced `canonical`; the CLI dropped it.

    Pre-fix the JSON payload carried only `ok` and `problems`, so a refusal said
    the bytes were wrong without ever saying what right looked like.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    canonical = write_noncanonical(root)

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert any(problem["code"] == "ADV-G03" for problem in payload["problems"]), payload
    assert payload["canonical"] == canonical, "the reported canonical form is not the exact bytes"


def test_f16b_human_mode_reports_the_expected_canonical_form(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root)
    canonical = write_noncanonical(root)

    result = run_checker_human(root)
    assert result.returncode != 0
    assert "ADV-G03" in result.stderr, result.stderr
    assert "Expected canonical state:" in result.stderr, result.stderr
    emitted = result.stderr.split("Expected canonical state:\n", 1)[1]
    assert emitted.rstrip("\n") == canonical.rstrip("\n"), "human mode emitted different bytes"


def test_f16b_a_canonical_registry_still_succeeds(tmp_path: Path) -> None:
    """The positive control. A checker that refused everything would satisfy
    the requirement above and be useless."""
    root = copy_fixture(tmp_path)
    complete_state(root)

    assert_valid(root)
    human = run_checker_human(root)
    assert human.returncode == 0, human.stderr
    assert "Expected canonical state:" not in human.stderr + human.stdout


def test_f16b_unparseable_input_does_not_pretend_a_canonical_form_exists(
    tmp_path: Path,
) -> None:
    """The negative control.

    When parsing fails there is no logical state to serialize, so reporting a
    canonical form would mean inventing one. Absence here is the correct answer,
    not an omission.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    (root / "state.json").write_text("{ this is not json", encoding="utf-8")

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert payload["problems"], payload
    assert "canonical" not in payload, payload

    human = run_checker_human(root)
    assert human.returncode != 0
    assert "Expected canonical state:" not in human.stderr, human.stderr


def test_f16b_the_reported_canonical_form_comes_from_the_model(tmp_path: Path) -> None:
    """MUTATION. The CLI must pass the model's serialization through, not hold a
    second opinion about canonical form.

    Changing the model's serializer must change what the checker reports. If it
    did not, the CLI would be canonicalizing on its own and the two could
    disagree about exactly the thing being reported.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    write_noncanonical(root)
    before = run_checker(root)[1]["canonical"]

    source = REPOSITORY_ROOT / "scripts/governance/model/canonical.mjs"
    original = source.read_text(encoding="utf-8")
    anchor = "  return renderCanonical(canonicalizeValue(value), '') + '\\n'"
    assert original.count(anchor) == 1, "the serializer anchor moved"
    mutated = original.replace(
        anchor, "  return renderCanonical(canonicalizeValue(value), '') + '\\n\\n'", 1
    )
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        after = run_checker(root)[1]["canonical"]
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original

    assert after != before, (
        "the checker did not follow the model's serializer, so it is reporting a canonical form "
        "of its own"
    )
