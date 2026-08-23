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
ARG RUNTIME_PACKAGE=@example/agent
ARG RUNTIME_VERSION=1.2.3
RUN install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}
LABEL io.secure-home.lineage="runner-derived" \\
      io.secure-home.runtime.version="1.2.3"
USER nobody
"""

GATES_DOCKERFILE = f"""FROM docker.io/library/debian:trixie-slim@{BASE_DIGEST}
ARG SOURCE_DATE_EPOCH=0
ARG NODE_VERSION=1.0.0
ARG PNPM_VERSION=2.0.0
ARG UV_VERSION=3.0.0
RUN install-toolchain node@${{NODE_VERSION}} \\
    pnpm@${{PNPM_VERSION}} uv@${{UV_VERSION}} && uv python install 9.9
LABEL io.secure-home.lineage="gates-toolchain"
USER nobody
"""

# The neutrality vocabulary the fixture checker derives — a stub of the
# platform proof's own list, so tests can also falsify the derivation.
FIXTURE_HELPERS = """export const FORBIDDEN_STRUCTURAL_NAMES = [
  'claude',
  'copilot',
  'codex',
  'anthropic',
  'openai',
  'langgraph',
  'pydantic',
  'docker',
  'containerd',
  'kata',
  'runc',
  'gvisor',
]
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
        "deploy/images/gates-toolchain/toolchain.json": (
            '{ "tools": [\n'
            '  { "name": "node", "provedBy": "arg", "arg": "NODE_VERSION",\n'
            '    "versionSource": "checks.yml NODE_VERSION" },\n'
            '  { "name": "pnpm", "provedBy": "arg", "arg": "PNPM_VERSION",\n'
            '    "versionSource": "package.json packageManager" },\n'
            '  { "name": "uv", "provedBy": "arg", "arg": "UV_VERSION",\n'
            '    "versionSource": "checks.yml UV_VERSION" },\n'
            '  { "name": "python", "provedBy": "uv-managed", "value": "9.9" }\n'
            "] }\n"
        ),
        "deploy/runtime/README.md": "# runtime taxonomy only\n",
        "profiles/README.md": "# profiles placeholder\n",
        "services/runner-control/src/run.ts": "export const run = 1\n",
        "packages/contracts/src/conformance/helpers.ts": FIXTURE_HELPERS,
        ".github/workflows/checks.yml": "env:\n  NODE_VERSION: '1.0.0'\n  UV_VERSION: '3.0.0'\n",
        "package.json": '{ "packageManager": "pnpm@2.0.0" }\n',
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
        "FROM secure-home-runner-base\n"
        "ARG RUNTIME_PACKAGE=@example/second\n"
        "ARG RUNTIME_VERSION=2.0.0\n"
        "RUN install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}\n"
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


def test_a_runtime_identity_smuggling_a_second_providers_tokens_is_refused(
    tmp_path: Path,
) -> None:
    """The falsification review's counter-fixture: runtime.package free text
    must not launder a second provider's tokens into the owned set. A runtime
    identity resolving to more than one provider family is two runtimes."""
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    lock.write_text(
        lock.read_text().replace(
            'package: "@example/agent"', 'package: "@example/agent-codex-copilot"', 1
        )
    )
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "RUN install-codex copilot-helper\n")
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "resolves to more than one provider" in result.stderr


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        (
            'package: "@example/agent"',
            "package: not one single package",
            "single npm package name",
        ),
        ("      version: 1.2.3", "      version: 2.x", "exact MAJOR.MINOR.PATCH"),
        ("integrity: sha512-AAAA", "integrity: md5-abc", "sha512 integrity"),
        ("name: example-agent", "name: Example-Agent", "lowercase kebab"),
    ],
)
def test_runtime_value_grammars_are_enforced(
    tmp_path: Path, old: str, new: str, message: str
) -> None:
    """The owned-token computation reads these values, so they carry a value
    grammar, not just a key shape."""
    root = _fixture(tmp_path)
    lock = root / "deploy/images/image-lock.yaml"
    text = lock.read_text()
    assert old in text, old
    lock.write_text(text.replace(old, new, 1))
    result = _check(root)
    assert result.returncode == 1, (old, result.stdout)
    assert message in result.stderr, (old, result.stderr)


def test_a_version_drifting_from_the_lock_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text().replace("ARG RUNTIME_VERSION=1.2.3", "ARG RUNTIME_VERSION=9.9.9")
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


@pytest.mark.parametrize(
    "instruction",
    [
        "COPY services/runner-control /opt/control",
        "COPY ./services/runner-control/dist /opt/c",
        "COPY ././services/runner-control/dist /opt/c",
        "COPY --chown=runner:runner ./services/runner-control/dist /opt/c",
        'COPY ["services/runner-control/dist", "/opt/c"]',
        "COPY ./packages/contracts /opt/c",
        "COPY ./knowledge /opt/c",
        "ADD ./services/runner-control/dist /opt/c",
        "COPY ./profiles /opt/c",
    ],
)
def test_every_spelling_of_a_platform_code_copy_is_refused(
    tmp_path: Path, instruction: str
) -> None:
    """The falsification review ran nine equivalent spellings; eight bypassed
    the original single-pattern rule. Docker treats them identically, so the
    checker must too: sources are parsed and normalized, never
    pattern-matched against one spelling."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + instruction + "\n")
    result = _check(root)
    assert result.returncode == 1, instruction
    assert "images.decision-bearing" in result.stderr, instruction


@pytest.mark.parametrize(
    ("instruction", "message"),
    [
        ("ADD https://example.com/tool.tgz /opt/t", "remote URL"),
        ("COPY ../secrets /opt/s", "escapes the build context"),
        ("COPY /etc/passwd /opt/p", "absolute host path"),
        (
            "COPY --from=docker.io/library/busybox:latest /bin/busybox /opt/bb",
            "neither a declared build stage nor pinned",
        ),
    ],
)
def test_unpinned_or_escaping_copy_inputs_are_refused(
    tmp_path: Path, instruction: str, message: str
) -> None:
    """Same guard, same class: remote fetches, context escapes, host paths,
    and unpinned --from images are all inputs the lock cannot explain."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + instruction + "\n")
    result = _check(root)
    assert result.returncode == 1, instruction
    assert message in result.stderr, instruction


def test_a_continuation_cannot_hide_a_copy_source(tmp_path: Path) -> None:
    """Instruction rules read logical lines: a backslash continuation must
    not hide the argument from the scan."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "COPY \\\n  ./services/x /opt/c\n")
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


def test_a_credential_shaped_name_in_a_multi_key_env_is_refused(tmp_path: Path) -> None:
    """The review's bypass: `ENV SAFE=1 API_KEY=x` is one instruction with
    two keys, and only the first was inspected. Every key is now parsed."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-base/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text() + "ENV SAFE_VALUE=1 PLATFORM_API_KEY=placeholder\n"
    )
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "PLATFORM_API_KEY" in result.stderr


# ── the gates inventory is a manifest, both directions ───────────────────────


def test_a_missing_gates_toolchain_manifest_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "deploy/images/gates-toolchain/toolchain.json").unlink()
    result = _check(root)
    assert result.returncode == 1
    assert "toolchain.json is missing" in result.stderr


def test_a_manifested_tool_missing_from_the_definition_is_refused(tmp_path: Path) -> None:
    """The inventory is the reviewed authority; a tool the manifest declares
    must be evidenced in the definition."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(dockerfile.read_text().replace("ARG UV_VERSION=3.0.0\n", ""))
    result = _check(root)
    assert result.returncode == 1
    assert "which the definition does not declare" in result.stderr


def test_a_declared_pin_no_run_consumes_is_refused(tmp_path: Path) -> None:
    """The review's counterexample: GIT_VERSION-style ARG survives while its
    `pkg=${ARG}` usage is accidentally removed — the manifest still claims
    the tool, the ARG still exists, and the property "the tool is carried"
    is lost. A pin nothing executes carries nothing."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(dockerfile.read_text().replace("node@${NODE_VERSION} ", ""))
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "consumed by no RUN instruction" in result.stderr
    assert "NODE_VERSION" in result.stderr


def test_an_unknown_proof_type_is_refused(tmp_path: Path) -> None:
    """provedBy is a closed vocabulary; an unknown proof type must refuse,
    never silently skip — a skipped proof is an unproved tool reading as
    proved."""
    root = _fixture(tmp_path)
    manifest = root / "deploy/images/gates-toolchain/toolchain.json"
    manifest.write_text(
        manifest.read_text().replace('"provedBy": "uv-managed"', '"provedBy": "magic"')
    )
    result = _check(root)
    assert result.returncode == 1
    assert 'unknown provedBy "magic"' in result.stderr


def test_a_missing_uv_managed_install_is_refused(tmp_path: Path) -> None:
    """The manifest claims a uv-managed interpreter; the definition must
    perform the literal `uv python install <value>`."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(dockerfile.read_text().replace(" && uv python install 9.9", ""))
    result = _check(root)
    assert result.returncode == 1
    assert "uv python install 9.9" in result.stderr


def test_a_uv_managed_tool_without_a_value_is_refused(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    manifest = root / "deploy/images/gates-toolchain/toolchain.json"
    manifest.write_text(manifest.read_text().replace(', "value": "9.9"', ""))
    result = _check(root)
    assert result.returncode == 1
    assert 'needs an explicit "value"' in result.stderr


def test_an_unmanifested_version_pin_is_refused(tmp_path: Path) -> None:
    """Inventory drift in the other direction: a version ARG the manifest
    does not name is a tool nobody reviewed into the governed environment."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/gates-toolchain/Dockerfile"
    dockerfile.write_text(dockerfile.read_text() + "ARG JQ_VERSION=1.7.1\n")
    result = _check(root)
    assert result.returncode == 1
    assert "not named by" in result.stderr
    assert "JQ_VERSION" in result.stderr


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


# ── inertness is digest-aware ────────────────────────────────────────────────

REAL_CLAUDE_INDEX = "sha256:7495ff8c70927c27b93cb6ac0e854134a95246613f6a750c4c540baa14ab026d"


def test_a_profile_pinning_a_locked_digest_is_refused(tmp_path: Path) -> None:
    """The review's bypass: the profile contract consumes runtime.image_digest
    — a digest, not a name — so a profile can reference the Claude image
    without ever spelling `secure-home-runner-claude`. The digest scan is the
    primary inertness rule; this fixture uses the exact recorded Claude index
    digest."""
    real_a = "sha256:" + "a" * 64
    root = _fixture(tmp_path)
    (root / "deploy/images/image-lock.yaml").write_text(
        _lock(base_digest=real_a, parent_digest=real_a, derived_digest=REAL_CLAUDE_INDEX)
    )
    profile = root / "profiles/coding/example.yaml"
    profile.parent.mkdir(parents=True)
    profile.write_text(f"runtime:\n  image_digest: {REAL_CLAUDE_INDEX}\n  adapter: example\n")
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "references locked image identity" in result.stderr
    assert REAL_CLAUDE_INDEX in result.stderr


def test_a_profile_pinning_a_bare_hex_identity_is_refused(tmp_path: Path) -> None:
    """The scan searches by bare hex, so dropping the `sha256:` prefix is not
    an escape."""
    real_a = "sha256:" + "a" * 64
    root = _fixture(tmp_path)
    (root / "deploy/images/image-lock.yaml").write_text(
        _lock(base_digest=real_a, parent_digest=real_a)
    )
    profile = root / "profiles/coding/example.yaml"
    profile.parent.mkdir(parents=True)
    profile.write_text(f"image: {real_a.removeprefix('sha256:')}\n")
    result = _check(root)
    assert result.returncode == 1
    assert "references locked image identity" in result.stderr


# ── the gates image mirrors the governed gate mechanically ───────────────────


def test_a_gate_pin_moved_at_the_source_refuses_while_the_image_is_stale(
    tmp_path: Path,
) -> None:
    """checks.yml is the source that RUNS the gate; the image must mirror it.
    A pin moved there while the Dockerfile stays stale refuses in the
    always-on governance gate."""
    root = _fixture(tmp_path)
    checks = root / ".github/workflows/checks.yml"
    checks.write_text(checks.read_text().replace("NODE_VERSION: '1.0.0'", "NODE_VERSION: '9.9.9'"))
    result = _check(root)
    assert result.returncode == 1, result.stdout
    assert "images.gates-pin" in result.stderr
    assert "9.9.9" in result.stderr
    assert "1.0.0" in result.stderr


def test_missing_gate_pin_sources_fail_closed(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "package.json").unlink()
    result = _check(root)
    assert result.returncode == 1
    assert "could not be derived" in result.stderr


# ── the lock registration is the one-runtime authority ───────────────────────


def test_a_missing_runtime_declaration_is_refused(tmp_path: Path) -> None:
    """No ARG RUNTIME_PACKAGE declaration at all — a comment mentioning the
    package is not a declaration."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text()
        .replace("ARG RUNTIME_PACKAGE=@example/agent\n", "# ships @example/agent\n")
        .replace("RUN install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}\n", "")
    )
    result = _check(root)
    assert result.returncode == 1
    assert "must declare ARG RUNTIME_PACKAGE=@example/agent" in result.stderr


def test_a_declaration_no_run_consumes_is_refused(tmp_path: Path) -> None:
    """The review's ARG-only bypass: the package mentioned only in an ARG,
    with no installation operation. A declaration nothing executes installs
    nothing."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text().replace(
            "RUN install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}\n", ""
        )
    )
    result = _check(root)
    assert result.returncode == 1
    assert "no RUN instruction consumes" in result.stderr


def test_a_run_consuming_the_package_across_a_commented_continuation_passes(
    tmp_path: Path,
) -> None:
    """BuildKit strips full-line comments inside a continuation; the fold
    must too, or a real installation detaches from its RUN and reads as
    unconsumed — the false refusal the real Claude definition exposed."""
    root = _fixture(tmp_path)
    dockerfile = root / "deploy/images/runner-example/Dockerfile"
    dockerfile.write_text(
        dockerfile.read_text().replace(
            "RUN install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}\n",
            "RUN set -eux; \\\n"
            "    # mid-block comment, as the real definition has\n"
            "    install-runtime ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}\n",
        )
    )
    result = _check(root)
    assert result.returncode == 0, result.stdout + result.stderr


def test_an_underivable_neutrality_vocabulary_fails_closed(tmp_path: Path) -> None:
    """The platform proof owns the one vocabulary; if it cannot be derived,
    the checker refuses rather than falling back to a second list."""
    root = _fixture(tmp_path)
    (root / "packages/contracts/src/conformance/helpers.ts").write_text("export const x = 1\n")
    result = _check(root)
    assert result.returncode == 1
    assert "images.vocabulary" in result.stderr
