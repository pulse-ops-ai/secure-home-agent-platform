/**
 * The final-consumer trust boundary (requirement "Verifying an
 * intermediate never authorizes a later artifact"; INV-015). A consumer
 * verifies the digest-bound identity of the artifact it ACTUALLY
 * consumes, at the point of consumption: an earlier successful
 * verification authorizes nothing here. Mutation between verification
 * and consumption is caught because the digest is recomputed from the
 * consumed bytes themselves.
 */
import { type Decision, proceed, refuse } from '../decision/index.js'
import { digestOf } from '../primitives/index.js'
import type { ConsumedArtifact } from './verify.js'

export const consumeVerified = (
  artifact: { readonly path: string; readonly content: string },
  expectedDigest: string,
): Decision<ConsumedArtifact> => {
  const actual = digestOf(artifact.content)
  if (actual !== expectedDigest) {
    return refuse(
      'consumption_digest_mismatch',
      { element: artifact.path, observed: actual },
      `consumed bytes digest ${actual} but ${expectedDigest} was expected — the artifact changed after its last verification, and that verification authorizes nothing`,
    )
  }
  return proceed({ path: artifact.path, digest: actual })
}
