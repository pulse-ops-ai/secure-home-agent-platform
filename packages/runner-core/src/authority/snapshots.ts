/**
 * The snapshot set eligibility decides from. Members are the L2 authority
 * contracts, captured; an absent member means the orchestrator supplied
 * nothing for it — which eligibility treats as missing authority, never
 * as permission.
 */
import type { ExecutionProfileT, GateRegistryT, PathPolicyT } from '@secure-home/contracts'
import type { CapturedAuthority } from './capture.js'

export interface AuthoritySnapshots {
  readonly profile?: CapturedAuthority<ExecutionProfileT>
  readonly path_policy?: CapturedAuthority<PathPolicyT>
  readonly gate_registry?: CapturedAuthority<GateRegistryT>
}
