# L6 Copilot CLI Capability and Credential Spike

Sanitized empirical evidence for Runner landing L6, authorized by GitHub issue
#54.

## Scope

This directory records what GitHub Copilot CLI 1.0.79 demonstrated for the five
L6 questions when tested on August 12, 2026, with the primary hosted model
explicitly pinned to `gpt-5.4`:

| Evidence | Question |
|---|---|
| [`SPIKE-01-structured-output.md`](SPIKE-01-structured-output.md) | Caller-schema enforcement for structured assistant output |
| [`SPIKE-02-tool-allowlisting.md`](SPIKE-02-tool-allowlisting.md) | Fail-closed tool availability and permission behavior |
| [`SPIKE-03-transcript.md`](SPIKE-03-transcript.md) | Machine-readable per-run transcript completeness |
| [`SPIKE-04-usage-cost.md`](SPIKE-04-usage-cost.md) | Per-run usage and cost reporting |
| [`SPIKE-05-credential-isolation.md`](SPIKE-05-credential-isolation.md) | Noninteractive credential injection and isolation |

The consolidated findings are
[`L6-Copilot-CLI-Spike-Findings.md`](L6-Copilot-CLI-Spike-Findings.md).
The pre-probe requirements matrix, sanitized invocation record, and
machine-readable usage table are
[`requirements-and-cases.md`](requirements-and-cases.md),
[`COMMAND-RESULTS.txt`](COMMAND-RESULTS.txt), and
[`usage-summary.tsv`](usage-summary.tsv).

## Evidence properties

- Results are empirical observations of the recorded CLI version and
  environment, not platform contracts or adapter-SPI decisions.
- Negative and undetermined findings are retained; they are inputs to U6/#11,
  not failed spike outcomes.
- No credential value, authentication header, session secret, realistic fake
  secret, or raw credential-bearing artifact is included.
- [`MANIFEST.sha256`](MANIFEST.sha256) covers every preserved candidate artifact
  except this directory README, which was added only to satisfy repository
  documentation convention.

Verify the preserved evidence payload:

```sh
cd docs/spikes/l6-copilot-cli
sha256sum -c MANIFEST.sha256
```

## Non-goals

This evidence does not:

- modify a platform contract or shared schema;
- decide U6 or accept an ADR;
- implement a Copilot adapter;
- create or modify a runner image;
- authorize deployment or credential provisioning;
- claim properties that the spike lists as unproven.

## Related

- [Runner model](../../architecture/runner-model.md)
- [Unresolved decision U6](../../architecture/unresolved-decisions.md#u6)
- [ADR-0003](../../decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
- [ADR-0011](../../decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
- [Repository documentation rules](../../AGENTS.md)
