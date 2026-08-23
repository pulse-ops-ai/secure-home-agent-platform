"""L5 image lineage — the lock, the chain, and the neutrality rules.

Every case exercises the REAL checker (``scripts/check-images.mjs``) against
a fixture tree: a minimal valid inventory as the passing control, then one
planted violation per rule. A fixture that never reaches the named rule
proves nothing about it, so each hostile case asserts the rule's own
refusal text.
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "check-images.mjs"

BASE_DIGEST = "sha256:" + "0" * 64
SENTINEL = "pending-first-governed-build"

BASE_DOCKERFILE = f"""FROM docker.io/library/debian:trixie-slim@{BASE_DIGEST}
ARG SOURCE_DATE_EPOCH=0
LABEL io.secure-home.lineage="runner-base"
USER nobody
"""

DERIVED_DOCKERFILE = """FROM secure-home-runner-base
ARG EXAMPLE_VERSION=1.2.3
LABEL io.secure-home.lineage="runner-derived" \\
      io.secure-home.runtime.version="1.2.3"
USER nobody
"""

GATES_DOCKERFILE = f"""FROM docker.io/library/debian:trixie-slim@{BASE_DIGEST}
ARG SOURCE_DATE_EPOCH=0
LABEL io.secure-home.lineage="gates-toolchain"
USER nobody
"""


def _lock(
    base_digest: str = SENTINEL,
    derived_digest: str = SENTINEL,
    parent_digest: str = SENTINEL,
) -> str:
    return f"""version: 1
images:
  - name: secure-home-runner-base
    lineage: runner-base
    definition: deploy/images/runner-base/Dockerfile
    platforms:
      - linux/amd64
    external_base:
      reference: docker.io/library/debian:trixie-slim
      digest: {BASE_DIGEST}
    digest: {base_digest}
    manifests:
      - platform: linux/amd64
        digest: {base_digest}
  - name: secure-home-runner-example
    lineage: runner-derived
    definition: deploy/images/runner-example/Dockerfile
    platforms:
      - linux/amd64
    parent: secure-home-runner-base
    parent_digest: {parent_digest}
    runtime:
      name: example-agent
      package: "@example/agent"
      version: 1.2.3
      integrity: sha512-AAAA
    digest: {derived_digest}
    manifests:
      - platform: linux/amd64
        digest: {derived_digest}
  - name: secure-home-gates-toolchain
    lineage: gates-toolchain
    definition: deploy/images/gates-toolchain/Dockerfile
    platforms:
      - linux/amd64
    external_base:
      reference: docker.io/library/debian:trixie-slim
      digest: {BASE_DIGEST}
    digest: {SENTINEL}
    manifests:
      - platform: linux/amd64
        digest: {SENTINEL}
"""


def _fixture(tmp_path: Path) -> Path:
    """A minimal valid tree: the passing control every hostile case mutates."""
    root = tmp_path / "root"
    for rel, content in {
        "deploy/images/runner-base/Dockerfile": BASE_DOCKERFILE,
        "deploy/images/runner-example/Dockerfile": DERIVED_DOCKERFILE,
        "deploy/images/gates-toolchain/Dockerfile": GATES_DOCKERFILE,
        "deploy/images/image-lock.yaml": _lock(),
        "deploy/runtime/README.md": "# runtime taxonomy only\n",
        "profiles/README.md": "# profiles placeholder\n",
        "services/runner-control/src/run.ts": "export const run = 1\n",
    }.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return root


def _check(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(SCRIPT), "--root", str(root)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


# ── controls ─────────────────────────────────────────────────────────────────


def test_the_live_repository_passes_its_own_lineage_gate() -> None:
    """The control. A gate failing on the real tree would prove nothing."""
    result = subprocess.run(
        ["node", str(SCRIPT)], cwd=REPO_ROOT, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "3 image(s)" in result.stdout


def test_the_fixture_control_passes(tmp_path: Path) -> None:
    result = _check(_fixture(tmp_path))
    assert result.returncode == 0, result.stdout + result.stderr


def test_a_conforming_fourth_image_needs_no_vocabulary_change(tmp_path: Path) -> None:
    """Extension property: a future derived image is one directory plus one
    lock entry — the checker's structural vocabulary is closed over it."""
    root = _fixture(tmp_path)
    extra = root / "deploy/images/runner-second/Dockerfile"
    extra.parent.mkdir(parents=True)
    extra.write_text(
        "FROM secure-home-runner-base\nARG SECOND_VERSION=2.0.0\n"
        'LABEL io.secure-home.lineage="runner-derived" \\\n'
        '      io.secure-home.runtime.version="2.0.0"\n'
    )
    lock = root / "deploy/images/image-lock.yaml"
    lock.write_text(
        lock.read_text()
        + f"""  - name: secure-home-runner-second
    lineage: runner-derived
    definition: deploy/images/runner-second/Dockerfile
    platforms:
      - linux/amd64
    parent: secure-home-runner-base
    parent_digest: {SENTINEL}
    runtime:
      name: second-agent
      package: "@example/second"
      version: 2.0.0
      integrity: sha512-BBBB
    digest: {SENTINEL}
    manifests:
      - platform: linux/amd64
        digest: {SENTINEL}
"""
    )
    result = _check(root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "4 image(s)" in result.stdout


# ── neutrality ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("planted", ["claude", "copilot", "anthropic", "langgraph"])
def test_a_provider_token_in_the_base_definition_is_refused(tmp_path: Path, planted: str) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + f"# {planted} helper\n")
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "images.neutrality" in result.stderr
    assert planted in result.stderr


def test_an_isolation_runtime_token_in_a_definition_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "# tuned for kata\n")
    result = _check(root)
    assert result.returncode == 1
    assert "isolation-runtime token" in result.stderr


def test_a_second_provider_runtime_in_the_derived_image_is_refused(tmp_path: Path) -> None:
    """The derived image owns exactly its declared runtime's tokens; any
    other provider token is a second runtime, prohibited by ADR-0011."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "RUN install-copilot-cli\n")
    result = _check(root)
    assert result.returncode == 1
    assert "copilot" in result.stderr


def test_a_provider_runtime_in_the_gates_image_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "RUN npm install -g codex\n")
    result = _check(root)
    assert result.returncode == 1
    assert "codex" in result.stderr


def test_a_runtime_conflated_image_name_is_refused(tmp_path: Path) -> None:
    """`runner-kata` would name WHAT executes after HOW it is isolated."""
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    (root / "deploy/images/runner-base/Dockerfile").rename(
        root / "deploy/images/runner-base/Dockerfile.bak"
    )
    kata_dir = root / "deploy/images/runner-kata"
    kata_dir.mkdir()
    (root / "deploy/images/runner-base/Dockerfile.bak").rename(kata_dir / "Dockerfile")
    text = lock.read_text().replace(
        "name: secure-home-runner-base", "name: secure-home-runner-kata", 1
    )
    text = text.replace(
        "definition: deploy/images/runner-base/Dockerfile",
        "definition: deploy/images/runner-kata/Dockerfile",
        1,
    )
    lock.write_text(text)
    result = _check(root)
    assert result.returncode == 1
    assert "conflates workload identity with isolation runtime" in result.stderr


# ── identity and the chain ───────────────────────────────────────────────────


def test_a_floating_external_base_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text().replace(
            f"FROM docker.io/library/debian:trixie-slim@{BASE_DIGEST}",
            "FROM docker.io/library/debian:trixie-slim",
        )
    )
    result = _check(root)
    assert result.returncode == 1
    assert "images.from-unpinned" in result.stderr


def test_an_unpropagated_base_digest_is_refused(tmp_path: Path) -> None:
    """The chain rule: a rebuilt base whose digest moved cannot leave the
    derived entry claiming the old parent."""
    real_a = "sha256:" + "a" * 64
    real_b = "sha256:" + "b" * 64
    root = _fixture(tmp_path)
    (root / "deploy/images/image-lock.yaml").write_text(
        _lock(base_digest=real_a, parent_digest=real_b)
    )
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "images.parent-chain" in result.stderr
    assert real_a in result.stderr
    assert real_b in result.stderr


def test_a_consistent_recorded_chain_passes(tmp_path: Path) -> None:
    """Control for the chain rule, with real-form digests on both sides."""
    real_a = "sha256:" + "a" * 64
    root = _fixture(tmp_path)
    (root / "deploy/images/image-lock.yaml").write_text(
        _lock(base_digest=real_a, parent_digest=real_a)
    )
    result = _check(root)
    assert result.returncode == 0, result.stdout + result.stderr


def test_a_version_drifting_from_the_lock_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text().replace("ARG EXAMPLE_VERSION=1.2.3", "ARG EXAMPLE_VERSION=9.9.9")
    )
    result = _check(root)
    assert result.returncode == 1
    assert "images.runtime-pin" in result.stderr


# ── registration ─────────────────────────────────────────────────────────────


def test_an_unregistered_image_definition_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    rogue = root / "deploy/images/runner-rogue/Dockerfile"
    rogue.parent.mkdir(parents=True)
    rogue.write_text(BASE_DOCKERFILE)
    result = _check(root)
    assert result.returncode == 1
    assert "images.unregistered" in result.stderr
    assert "runner-rogue" in result.stderr


def test_a_lock_entry_without_a_definition_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "deploy/images/gates-toolchain/Dockerfile").unlink()
    result = _check(root)
    assert result.returncode == 1
    assert "does not exist" in result.stderr


# ── inertness ────────────────────────────────────────────────────────────────


def test_a_profile_referencing_an_image_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    profile = root / "profiles/coding/example.yaml"
    profile.parent.mkdir(parents=True)
    profile.write_text("image: secure-home-runner-example\n")
    result = _check(root)
    assert result.returncode == 1
    assert "images.profile-reference" in result.stderr


def test_runtime_directory_content_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "deploy/runtime/config.toml").write_text("x = 1\n")
    result = _check(root)
    assert result.returncode == 1
    assert "images.runtime-dir" in result.stderr


def test_a_launcher_token_in_runner_control_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "services/runner-control/src/launch.ts").write_text(
        "const socket = '/var/run/docker.sock'\n"
    )
    result = _check(root)
    assert result.returncode == 1
    assert "images.launcher" in result.stderr


def test_platform_code_copied_into_an_image_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "COPY services/runner-control /opt/control\n")
    result = _check(root)
    assert result.returncode == 1
    assert "images.decision-bearing" in result.stderr


def test_a_credential_shaped_env_name_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "ENV PLATFORM_API_KEY=placeholder\n")
    result = _check(root)
    assert result.returncode == 1
    assert "images.credential-shape" in result.stderr


# ── the lock grammar is canonical ────────────────────────────────────────────


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("tab", lambda t: t.replace("  - name:", "\t- name:", 1)),
        (
            "flow",
            lambda t: t.replace("platforms:\n      - linux/amd64", "platforms: [linux/amd64]", 1),
        ),
        ("anchor", lambda t: t.replace("version: 1", "version: &v 1", 1)),
        ("inline-comment", lambda t: t.replace("version: 1", "version: 1  # one", 1)),
        (
            "duplicate-key",
            lambda t: t.replace(
                "    lineage: runner-base\n",
                "    lineage: runner-base\n    lineage: runner-base\n",
                1,
            ),
        ),
        (
            # The hazard a repo-wide formatter actually produced during this
            # landing: single-quoting a scalar. Refused, not silently reread.
            "single-quote",
            lambda t: t.replace('package: "@example/agent"', "package: '@example/agent'", 1),
        ),
    ],
)
def test_non_canonical_lock_representations_are_refused(
    tmp_path: Path, label: str, mutate: Callable[[str], str]
) -> None:
    """One grammar, one reading: a representation a general YAML parser would
    admit is refused here rather than silently normalized."""
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    lock.write_text(mutate(lock.read_text()))
    result = _check(root)
    assert result.returncode == 1, label
    assert "images.grammar" in result.stderr, label


def test_reordered_entry_keys_are_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    lock.write_text(
        lock.read_text().replace(
            "    lineage: runner-base\n    definition: deploy/images/runner-base/Dockerfile\n",
            "    definition: deploy/images/runner-base/Dockerfile\n    lineage: runner-base\n",
            1,
        )
    )
    result = _check(root)
    assert result.returncode == 1
    assert "images.key-order" in result.stderr


def test_a_hand_edited_digest_form_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    lock.write_text(lock.read_text().replace(SENTINEL, "sha256:not-a-digest", 1))
    result = _check(root)
    assert result.returncode == 1
    assert "images.digest" in result.stderr


# ── the CLI refuses to guess ─────────────────────────────────────────────────


def test_an_unknown_option_is_refused() -> None:
    result = subprocess.run(
        ["node", str(SCRIPT), "--rooot", "x"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "unknown option" in result.stderr


def test_a_root_flag_without_a_value_is_refused() -> None:
    result = subprocess.run(
        ["node", str(SCRIPT), "--root"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "requires a value" in result.stderr
