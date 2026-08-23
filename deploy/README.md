# deploy/

Deployment **assets** — the declarative definitions of how the platform would
run on the Pi.

> **Status: image definitions are landed (L5, issue #53) and inert; nothing
> is deployed.** [`images/`](images/) carries the three validated L5 image
> definitions and their lineage lock — built and verified only through the
> governed CI path, referenced by no profile, launched by nothing. Every
> other directory is a documented placeholder: no Compose file, no proxy
> configuration, no tailnet policy, and no execution runtime is selected.

> **Writing a deployment asset is not deploying it.** Authoring a file here is in
> scope once the governing ADR is accepted. **Running it is not**, and is never
> authorized by a coding-agent task.

## Layout

| Path | Contains |
|---|---|
| [`images/`](images/) | Runner image definitions, the gates-toolchain image, and `image-lock.yaml` — the validated lineage/pinning record |
| [`runtime/`](runtime/) | The boundary for **future** execution-runtime integration — taxonomy only; no runtime is selected (U4 open, L9 not landed) |
| [`compose/`](compose/) | Docker Compose definitions for the Pi control plane |
| [`traefik/`](traefik/) | Local ingress and internal routing configuration |
| [`tailscale/`](tailscale/) | Tailnet connectivity and ACL documentation |

## What belongs here

- Dockerfiles and image build definitions.
- Compose files and their documented service topology.
- Reverse-proxy and routing configuration.
- Tailnet policy documentation.
- Documented, obviously-fake example environment files.

## What does not belong here

- **Secrets of any kind.** No `.env` with real values, no tokens, no keys, no
  certificates, no realistic-looking fakes. Placeholders must be unmistakably
  fake.
- **Application or service code** — [`../services/`](../services/).
- **Anything for the shared platform edge.** L1–L5 for the remote path is
  `platform-edge`, a separate repository. Do not mirror it here.
- **Kubernetes.** Out of scope. The target is Docker Compose on one Pi.
- **Home Assistant configuration.** Home Assistant is not installed and its
  configuration is not managed from this repository.

## Ownership and boundary rules

1. **A Docker network is not authority.** Compose topology conveys reachability
   only. Every service still verifies the internal identity envelope
   ([`../docs/architecture/trust-boundaries.md`](../docs/architecture/trust-boundaries.md)).
2. **The runner sandbox is untrusted**, even on the same host and the same
   network.
3. **One coding agent per derived image.** A multi-provider image is prohibited
   ([ADR-0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
4. **Images are digest-pinned** wherever they are referenced.
5. **Local household operation must not depend on the WAN, the shared edge, the
   VPS, or the Exxact workstation.** A Compose topology that breaks this is wrong
   regardless of how convenient it is.
6. **Tailscale is connectivity, never identity or authorization.** ACLs restrict
   reachability; they do not grant permission.
7. **Resource limits are part of the deployment.** The Pi carries the household
   control path alongside runners.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) · ADRs
[0002](../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md),
[0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

Future: Compose file linting, a build-time check that a derived image contains
exactly one coding agent, a check that no secret is present, and a check that no
service is published beyond its intended interface.
