# AGENTS.md — `services/`

Scoped rules for the Pi control plane. Inherits everything from
[`../AGENTS.md`](../AGENTS.md); this file adds only what is specific to
`services/`.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md) — what each service owns
3. [`../docs/architecture/trust-boundaries.md`](../docs/architecture/trust-boundaries.md)
4. [`../docs/architecture/identity-and-authorization-flow.md`](../docs/architecture/identity-and-authorization-flow.md)
5. ADRs **0002, 0004, 0005, 0008, 0009**

## Rules

- **Never trust network position.** Not the Docker network, not the tailnet, not
  co-location on the Pi. Every service verifies the internal identity envelope
  on every request.
- **Only `action-gateway` holds Home Assistant credentials.** Do not add a Home
  Assistant client to any other service, and do not give one to a runner.
- **Never pass a request body, household payload, or device command to the
  policy decision point.** It answers relationship questions; it is not a proxy.
- **Order is authorization, then safety policy.** Do not reorder them and do not
  merge them.
- **Bind the approval to the action, and verify it before dispatch.** A decision
  identifier alone is a bearer credential. Never write a path where the gateway
  actuates on an unverified or unbound approval. A mismatch is a **binding
  failure** — audited as its own outcome, not as a generic denial.
- **Never promise physical atomicity.** Model the observable lifecycle and treat
  `indeterminate` as a first-class terminal state. Never emit an automatic
  inverse command.
- **No model in the deterministic policy path.** No LLM, no learned ranker, no
  probabilistic component in `policy-engine`'s decision path.
- **Fail closed on sensitive actions.** `unknown` is never `permit`. Consult
  [`../docs/architecture/degraded-mode.md`](../docs/architecture/degraded-mode.md)
  for the classification, which is **(operation × requester)** — a physically-safe
  direction is not authorization-free. An unclassified combination fails closed.
- **Keep both ingress paths equivalent.** A control added for the remote path
  must exist on the local path, and vice versa.
- **No household dependency on the WAN, the shared edge, the VPS, or the Exxact
  workstation.**
- **Every denial is audited** and names the deciding control.

## Do not

- Implement a service. **No ADR is accepted yet**, so there is no authorized
  implementation work here.
- Add a dependency. These packages are dependency-free on purpose.
- Write a stub that appears to work.
- Decide [U3](../docs/architecture/unresolved-decisions.md#u3) (which service
  mints the envelope), [U4](../docs/architecture/unresolved-decisions.md#u4)
  (runner-control placement),
  [U5](../docs/architecture/unresolved-decisions.md#u5) (automation
  persistence), [U9](../docs/architecture/unresolved-decisions.md#u9) (decision
  caching), or [U10](../docs/architecture/unresolved-decisions.md#u10) (Home
  Assistant credentials) by writing code.

## Adding a service

1. It needs an accepted ADR or task contract. Say which.
2. Create the directory with a `pyproject.toml` and a `README.md` stating what
   it owns, what it does **not** own, which layer it is, and its failure mode.
3. The root workspace glob picks it up automatically.
4. Add it to [`README.md`](README.md).
5. Run `uv sync --all-packages` and the rest of the Python checks.

## Validation

```sh
uv sync --all-packages
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
bash scripts/validate-scaffold.sh
```
