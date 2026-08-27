# AGENTS.md — `services/`

Scoped rules for **deployable backend processes**. Inherits everything from
[`../AGENTS.md`](../AGENTS.md); this file adds only what is specific to
`services/`.

**TypeScript is the language here** — NestJS on Fastify
([ADR-0012](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
Python is permitted **only** inside `services/workers/*`, for an isolated
specialist inference worker, and never for anything on the household request
path.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md) — what each service owns
3. [`../docs/architecture/trust-boundaries.md`](../docs/architecture/trust-boundaries.md)
4. [`../docs/architecture/identity-and-authorization-flow.md`](../docs/architecture/identity-and-authorization-flow.md)
5. ADRs **0002, 0004, 0005, 0008, 0009**, and **0012** — the taxonomy, the
   NestJS/Fastify shape, the Zod contract model, and the dependency and CI rules
6. [`../docs/architecture/api-contract-model.md`](../docs/architecture/api-contract-model.md)
   — thin controllers, projection configs, envelopes, metadata routes

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

- Implement a service without an authorizing issue or task contract. The
  governing ADRs — including [ADR-0012](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md),
  which fixes the taxonomy, the NestJS/Fastify shape, and the contract model —
  are accepted, but acceptance alone authorizes nothing.
- Write persistence code of any kind. No toolkit is selected
  ([U11](../docs/architecture/unresolved-decisions.md#u11)); most remaining
  service work is still blocked on U2, U3, U5, U9, or U10. (U4 closed on
  2026-08-26 — that decided placement and authorized no deployment; the
  launcher is L9, still behind L8 and its own task contract.)
- Add a dependency **the task contract does not name**. The workspace is
  dependency-free *today* by default, not by prohibition: ADR-0012 commits to
  NestJS, Fastify, Zod, and Winston, so an authorizing contract may add them.
  Declare shared versions through the **pnpm catalog**, use `workspace:*`
  internally, and never mutate a manifest or lockfile beyond what the contract
  authorizes.
- Write a stub that appears to work.
- Decide [U3](../docs/architecture/unresolved-decisions.md#u3) (which service
  mints the envelope),
  [U5](../docs/architecture/unresolved-decisions.md#u5) (automation
  persistence), [U9](../docs/architecture/unresolved-decisions.md#u9) (decision
  caching), or [U10](../docs/architecture/unresolved-decisions.md#u10) (Home
  Assistant credentials) by writing code.

## Adding a service

1. It needs an accepted ADR **and** an authorizing task contract. Say which.
2. Create the directory with a **`package.json`** (private, `@secure-home/*`,
   `workspace:*` for internal deps, `catalog:` for external ones), a
   `tsconfig.json` extending `@secure-home/tsconfig/service.json`, an
   `eslint.config.js`, and a `README.md` stating what it owns, what it does
   **not** own, which layer it is, and its failure mode.
3. Declare the four standard scripts — `lint`, `typecheck`, `test`, `build` — so
   the root commands and CI target selection reach it.
4. The `pnpm-workspace.yaml` glob picks it up. Add any new shared dependency
   version to the **catalog** in `pnpm-workspace.yaml`, never to the manifest.
5. Add it to [`README.md`](README.md).
6. Run the validation below, including `pnpm run check:workspace`, which
   verifies taxonomy, naming, scripts, and dependency direction.

**A worker** additionally builds on
[`packages/worker-base`](../packages/README.md) rather than implementing its own
lifecycle, shutdown, retry, or health handling
([ADR-0012 §18](../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).

**A Python inference worker** under `services/workers/*` uses `pyproject.toml`
and joins the `uv` workspace instead — and is still bound by every prohibition
above.

## Validation

```sh
bash scripts/validate-scaffold.sh
bash scripts/scan-secrets.sh

# TypeScript — the primary stack for services
pnpm install --frozen-lockfile
pnpm run deps:check          # Syncpack manifest policy
pnpm run check:workspace     # taxonomy + dependency direction
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# Python — only if the change touches the inference boundary
uv sync --all-packages --locked
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```

Report anything skipped, and why.
