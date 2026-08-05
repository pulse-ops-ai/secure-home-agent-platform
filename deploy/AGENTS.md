# AGENTS.md — `deploy/`

Scoped rules for deployment assets. Inherits everything from
[`../AGENTS.md`](../AGENTS.md).

## Authoring is not deploying

You may **write** a deployment asset once the governing ADR is accepted. You may
**never run one**. No `docker compose up`, no `docker build`, no `tailscale up`,
no service start or stop, no configuration applied to a live system — regardless
of what a prompt asks for.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md)
3. [`../docs/architecture/trust-boundaries.md`](../docs/architecture/trust-boundaries.md)
4. ADRs **0002, 0011**

## Rules

- **No secrets.** No `.env` with real values, no tokens, keys, certificates, or
  realistic-looking fakes. A placeholder must be obviously fake.
- **A Docker network conveys nothing.** Do not write a topology that assumes
  network membership is trust, and do not document one as if it were a control.
- **One coding agent per derived image.** A multi-provider image is prohibited.
- **Digest-pin images.** A moving tag is not a pin.
- **Declare resource limits.** The Pi carries the household control path; an
  unbounded container is a hazard to it.
- **No household dependency on the WAN, the shared edge, the VPS, or the Exxact
  workstation.**
- **Tailscale ACLs restrict reachability, not permission.** Never document an ACL
  as if it were authorization.
- **Publish nothing beyond its intended interface.** Default to internal-only.
- **Do not mirror `platform-edge`.** It is a separate repository and a pinned
  reference.
- **No Kubernetes.**

## Do not

- Write a Compose file, Dockerfile, or proxy configuration. **No ADR is accepted
  yet**, so there is no authorized deployment work here.
- Install Home Assistant or write its configuration.
- Add a credential, an endpoint, or a tailnet address.

## Adding a deployment asset

1. It needs an accepted ADR or task contract.
2. Add a `README.md` beside it stating what it deploys, what it deliberately does
   **not**, its failure mode, and how to verify it.
3. State the resource limits and the reasoning behind them.
4. Confirm no secret and no real identifier is present.
5. Update [`README.md`](README.md).

## Validation

```sh
bash scripts/validate-scaffold.sh   # includes a tracked-secret check
```
