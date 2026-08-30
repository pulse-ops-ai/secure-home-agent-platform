import { createHash } from 'node:crypto'

import { canonicalSerialize } from './canonical.mjs'

const HEX64 = /^[0-9a-f]{64}$/u

const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone)
  if (value === null || typeof value !== 'object') return value
  const output = Object.create(null)
  for (const [key, member] of Object.entries(value)) output[key] = clone(member)
  return output
}

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1)

const withoutKeys = (value, keys) => {
  if (Array.isArray(value)) return value.map((member) => withoutKeys(member, keys))
  if (value === null || typeof value !== 'object') return value
  const output = Object.create(null)
  for (const [key, member] of Object.entries(value)) {
    if (!keys.has(key)) output[key] = withoutKeys(member, keys)
  }
  return output
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, 'utf8'))
}

export function digestPreimage(preimage) {
  return sha256Text(canonicalSerialize(preimage))
}

export function isSha256(value) {
  return typeof value === 'string' && HEX64.test(value)
}

export function contentDigest(bytes) {
  return sha256Bytes(bytes)
}

/**
 * The primitive digest includes current primitive values but never includes
 * an attestation envelope. This is the digest used by a transition preimage;
 * the evidence and history checks separately protect the excluded envelopes.
 */
export function primitiveProjection(state) {
  const projection = clone(state)
  delete projection.attestations

  for (const adr of projection.adrs ?? []) {
    if (adr.acceptance) {
      // reviewedIdentity is supporting provenance for the human act, not part
      // of the causal transition preimage. A later provenance correction must
      // not change the transition identity it documents.
      delete adr.acceptance.reviewedIdentity
      delete adr.acceptance.actor
      delete adr.acceptance.at
      delete adr.acceptance.outcome
      delete adr.acceptance.authority
      delete adr.acceptance.transitionDigest
    }
  }

  for (const landing of projection.landings ?? []) {
    for (const name of ['completion', 'withdrawal']) {
      const envelope = landing.delivery?.[name]
      if (envelope) delete envelope.attestation
    }
    if (landing.replacement) delete landing.replacement.attestation
  }

  for (const gate of projection.gates ?? []) {
    if (gate.replacement) delete gate.replacement.attestation
  }

  return projection
}

export function primitiveDigest(state) {
  return digestPreimage(primitiveProjection(state))
}

export function relationshipTuples(state) {
  const tuples = []
  for (const adr of state.adrs ?? []) {
    for (const question of adr.resolves ?? []) {
      tuples.push({ subject: adr.id, relationship: 'resolves', object: question })
    }
    for (const superseded of adr.supersedes ?? []) {
      tuples.push({ subject: adr.id, relationship: 'supersedes', object: superseded })
    }
  }
  return tuples.sort((left, right) => {
    const a = left.subject + '\u0000' + left.relationship + '\u0000' + left.object
    const b = right.subject + '\u0000' + right.relationship + '\u0000' + right.object
    return compareText(a, b)
  })
}

export function relationshipDigest(state) {
  return digestPreimage({ relationships: relationshipTuples(state) })
}

export function transitionPreimage({
  schemaVersion,
  priorStateDigest = null,
  targetPrimitiveDigest,
  subject,
  from,
  to,
  contentDigest: bytesDigest,
  relationshipDigest: relationships,
}) {
  return {
    schemaVersion,
    priorStateDigest,
    targetPrimitiveDigest,
    subject,
    from,
    to,
    contentDigest: bytesDigest,
    relationshipDigest: relationships,
  }
}

export function transitionDigest(fields) {
  return digestPreimage(transitionPreimage(fields))
}

export function semanticIdentity(node) {
  const isGate = node.kind === 'gate'
  const delivery = node.delivery
  return {
    schemaVersion: 1,
    id: node.id,
    kind: node.kind,
    predicate: isGate ? node.predicate : null,
    sources: isGate ? node.sources : null,
    requires: isGate ? null : node.requires,
    authorityAnchor: node.authorityAnchor ?? null,
    completionPolicy: isGate ? null : (delivery?.completionPolicy ?? null),
    reviewedOrderingIntent: node.reviewedOrderingIntent ?? null,
  }
}

export function semanticIdentityDigest(node) {
  return digestPreimage(semanticIdentity(node))
}

export function replacementPreimage(oldNode, newNode) {
  return {
    schemaVersion: 1,
    oldId: oldNode.id,
    newId: newNode.id,
    oldSemanticIdentityDigest: semanticIdentityDigest(oldNode),
    newSemanticIdentityDigest: semanticIdentityDigest(newNode),
  }
}

export function replacementDigest(oldNode, newNode) {
  return digestPreimage(replacementPreimage(oldNode, newNode))
}

export function completionPreimage(landing, completion) {
  const evidence = completion.evidence
  return {
    landingId: landing.id,
    from: completion.from,
    to: completion.to,
    authorityAnchor: landing.authorityAnchor,
    evidence,
    completionPolicy: landing.delivery.completionPolicy,
  }
}

export function completionDigest(landing, completion) {
  return digestPreimage(completionPreimage(landing, completion))
}

export function withdrawalPreimage(landing, withdrawal) {
  return {
    schemaVersion: 1,
    landingId: landing.id,
    from: withdrawal.from,
    to: 'Withdrawn',
    authorityAnchor: landing.authorityAnchor,
    withdrawalEvidence: withdrawal.evidence,
  }
}

export function withdrawalDigest(landing, withdrawal) {
  return digestPreimage(withdrawalPreimage(landing, withdrawal))
}

export function genesisCompletionEnvelopeDigest(members) {
  const tuples = [...members]
    .map((member) => ({ landingId: member.landingId, digest: member.digest }))
    .sort((left, right) => compareText(left.landingId, right.landingId))
  return digestPreimage(tuples)
}

export function acceptancePreimage(state, adr) {
  const target = primitiveDigest(state)
  const relationships = relationshipDigest(state)
  return transitionPreimage({
    schemaVersion: state.schemaVersion,
    priorStateDigest: null,
    targetPrimitiveDigest: target,
    subject: adr.id,
    from: 'Proposed',
    to: adr.lifecycle,
    contentDigest: adr.acceptance.contentDigest,
    relationshipDigest: relationships,
  })
}

export function acceptanceDigest(state, adr) {
  return digestPreimage(acceptancePreimage(state, adr))
}

export function policyEvidenceMembers(evidence) {
  return evidence?.policyEvidenceIdentities ?? []
}

export function stableDigestSummary(state) {
  return {
    primitiveDigest: primitiveDigest(state),
    relationshipDigest: relationshipDigest(state),
  }
}

export { HEX64, withoutKeys }
