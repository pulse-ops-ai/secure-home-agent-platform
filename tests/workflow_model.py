"""Parse ``.github/workflows/checks.yml`` into job sections.

Several tests assert that a gate is unconditional. Those assertions are only
worth anything if the text they inspect really is the job — an extraction that
silently yields an empty string makes ``assert "if:" not in block`` pass for
every workflow ever written, which is the "reads as enforced while enforcing
nothing" failure this repository keeps finding in its own work.

So the split is done once, here, and both test modules use it.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "checks.yml"

GOVERNANCE_MARKER = "# GOVERNANCE-UNCONDITIONAL"

#: A job name is the only key at exactly two spaces of indentation under `jobs:`.
_JOB_KEY = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")


def job_sections(workflow: str | None = None) -> dict[str, str]:
    """Map each job name to its YAML, including the comment banner above it.

    The banner is included because ``# GOVERNANCE-UNCONDITIONAL`` is written
    above the job it describes, not inside it.
    """
    text = workflow if workflow is not None else WORKFLOW.read_text()
    body = text.split("\njobs:\n", 1)[1]
    lines = body.splitlines(keepends=True)

    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        match = _JOB_KEY.match(line)
        if not match:
            continue
        first = index
        while first > 0 and lines[first - 1].lstrip().startswith("#"):
            first -= 1
        starts.append((first, match.group(1)))

    sections: dict[str, str] = {}
    for position, (first, name) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        sections[name] = "".join(lines[first:end])
    return sections


def governance_jobs(workflow: str | None = None) -> dict[str, str]:
    """The job sections marked ``# GOVERNANCE-UNCONDITIONAL``."""
    return {
        name: section
        for name, section in job_sections(workflow).items()
        if GOVERNANCE_MARKER in section
    }


def has_condition(section: str) -> bool:
    """Whether a job section carries a job-level ``if:``."""
    return any(line.startswith("    if:") for line in section.splitlines())


#: A step begins at exactly six spaces followed by "- ", inside a `steps:` list.
_STEP_START = re.compile(r"^      - (?:name|uses):", re.M)


def workflow_steps(text: str, job: str) -> list[str]:
    """Split one job's ``steps:`` list into per-step blocks.

    Line-based for the same reason ``job_sections`` is: this repository does not
    carry a YAML parser in the Python test environment, and a security assertion
    that SKIPS when a parser is missing enforces nothing. ``steps_are_not_vacuous``
    below is the guard that keeps this honest.
    """
    section = job_sections(text)[job]
    body = section.split("\n    steps:\n", 1)[1]

    starts = [match.start() for match in _STEP_START.finditer(body)]
    if not starts:
        return []
    bounds = [*starts, len(body)]
    return [body[bounds[i] : bounds[i + 1]] for i in range(len(starts))]


def step_field(step: str, key: str) -> str | None:
    """A scalar field of a step, ignoring occurrences inside comments."""
    for line in step.splitlines():
        stripped = line.strip().lstrip("- ").strip()
        if stripped.startswith("#"):
            continue
        if stripped.startswith(f"{key}:"):
            return stripped[len(key) + 1 :].strip().strip("'\"")
    return None


def step_run(step: str) -> str:
    """Everything a step actually executes, with comment lines removed."""
    if "run:" not in step:
        return ""
    after = step.split("run:", 1)[1]
    return "\n".join(line for line in after.splitlines() if not line.strip().startswith("#"))
