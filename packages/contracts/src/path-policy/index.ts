/**
 * Contract family: the path policy (capability `runner-verification`).
 * The public surface is version 2.0.0; the frozen `v1.ts` module exists
 * only for superseded-artifact regeneration and is deliberately not
 * re-exported (runner-contract-corrections D4).
 */
export {
  PATH_POLICY_ID,
  PATH_POLICY_VERSION,
  PathPolicy,
  ProhibitedPathRule,
  RelativePathPrefix,
} from './path-policy.js'
export type { PathPolicyT, ProhibitedPathRuleT } from './path-policy.js'
