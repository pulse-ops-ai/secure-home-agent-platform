/**
 * The base-identity comparison — L3's half of ADV-004. Whether the
 * observed workspace base matches the pinned identity is decided HERE;
 * asserting the comparison at workspace creation, before any model
 * invocation, is an ordering property and is L4's half.
 */
import { type Decision, proceed, refuse } from '../decision/index.js'

export interface BaseIdentityMatch {
  readonly digest: string
}

export const compareBaseIdentity = (
  pinned: string,
  observed: string,
): Decision<BaseIdentityMatch> => {
  if (typeof pinned !== 'string' || pinned.length === 0) {
    return refuse(
      'undecidable',
      { element: 'pinned base identity' },
      'no pinned base identity was supplied — the comparison cannot be established',
    )
  }
  if (pinned !== observed) {
    return refuse(
      'base_identity_mismatch',
      { element: pinned, observed },
      'the observed base identity does not match the pinned identity — the workspace is not the declared base',
    )
  }
  return proceed({ digest: pinned })
}
