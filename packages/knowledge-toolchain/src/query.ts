/**
 * QUERY — the ONLY read path for an agent or service (ADR-0010).
 *
 * OKF's own consumption model is `cat` the file. This repository forbids that,
 * which is what keeps an unvalidated format from becoming load-bearing. So the
 * seam takes a packaged artifact and never a repository path: nothing here
 * accepts a filesystem location, and nothing here reads one.
 *
 * TOLERANT, deliberately — the opposite posture from `admit.ts`, and correct at
 * this layer. OKF requires a consumer not to reject for an unknown `type`, an
 * unknown additional key, a missing optional field, or a broken link. Our own
 * admitted packages have stronger guarantees because admission already ran; a
 * FOREIGN bundle has none, and reading one must still work.
 *
 * Trust, provenance, and content-review signals are returned as DESCRIPTIVE data
 * and confer exactly zero authority (ADR-0015 §10).
 */
import type { PackagedBundle } from './packaging.js'
import type { CompiledBundle } from './types.js'

export interface Concept {
  readonly path: string
  readonly type: string | undefined
  readonly title: string | undefined
  readonly body: string
  /** Descriptive only. Never an input to capability, authorization, or safety. */
  readonly trust: Readonly<Record<string, unknown>>
}

const TRUST_FIELDS = ['generated', 'verified', 'status', 'stale_after', 'sources', 'usage_window']

const toConcept = (document: {
  path: string
  frontmatter: Readonly<Record<string, unknown>>
  body: string
}): Concept => {
  const trust: Record<string, unknown> = {}
  for (const field of TRUST_FIELDS) {
    if (document.frontmatter[field] !== undefined) trust[field] = document.frontmatter[field]
  }
  return {
    path: document.path,
    // Unknown `type` values are tolerated: reported as-is, never rejected.
    type:
      typeof document.frontmatter['type'] === 'string' ? document.frontmatter['type'] : undefined,
    title:
      typeof document.frontmatter['title'] === 'string' ? document.frontmatter['title'] : undefined,
    body: document.body,
    trust: Object.freeze(trust),
  }
}

export interface KnowledgeQuery {
  list(): readonly string[]
  read(path: string): Concept | undefined
  byType(type: string): readonly Concept[]
}

const open = (
  documents: readonly {
    path: string
    frontmatter: Readonly<Record<string, unknown>>
    body: string
  }[],
): KnowledgeQuery => {
  const concepts = new Map(documents.map((document) => [document.path, toConcept(document)]))
  return {
    list: () => [...concepts.keys()].sort(),
    // A missing optional field, an unknown key, or a broken link never throws:
    // a reader that rejected would be a non-conformant OKF consumer.
    read: (path) => concepts.get(path),
    byType: (type) => [...concepts.values()].filter((concept) => concept.type === type),
  }
}

/**
 * Read ADMITTED repository knowledge. Takes a packaged artifact, never a path.
 */
export const query = (bundle: PackagedBundle): KnowledgeQuery => open(bundle.documents)

/**
 * Read FOREIGN OKF this repository never admitted.
 *
 * A separate entry point with a separate input type, so tolerance is preserved
 * without laundering unadmitted bytes into the artifact that carries admitted
 * knowledge. Foreign input has none of admission's guarantees, and this is the
 * path where that is true.
 *
 * PACKAGE-INTERNAL. Deliberately not re-exported from `index.ts`: a
 * `CompiledBundle` carries no provenance saying its bytes are foreign, so a
 * public export would let consumer code compile repository-candidate bytes that
 * admission refuses and read them anyway. It exists here to prove OKF
 * consumer-tolerance in the conformance suite. Exposing foreign ingress to
 * consumers needs a governed provenance boundary, which is not invented here.
 */
export const readForeign = (bundle: CompiledBundle): KnowledgeQuery => open(bundle.documents)
