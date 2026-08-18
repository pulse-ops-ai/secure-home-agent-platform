/**
 * PROHIBITED-CONTENT INDICATORS — ADR-0016, honestly.
 *
 * **There are no class-A detectors here, and there must not be one without a
 * completeness proof.** ADR-0016 §2 defines **A** as requiring a closed
 * authoring grammar in which every representation of the prohibited thing is
 * structurally visible. This repository has no such grammar: arbitrary bytes fit
 * inside Markdown as base64 or hex, and an opaque URL carries no content hint.
 *
 * So every detector below is **B** — deterministic, useful, and *incomplete* —
 * and each one names what it cannot see. The classes with no detector at all
 * are **C**, and inventing a lexical proxy for them is forbidden: the contract's
 * own permitted example, *"peak pricing currently runs 16:00–21:00"*, trips the
 * obvious "currently" rule, while deleting one word evades it.
 *
 * **Naming rule, load-bearing:** every export is named for the INDICATOR it
 * detects, never for the class. `pemBlock`, not `secrets`. A proof named for a
 * class it does not establish is a false proof.
 *
 * No model, no classifier, no network. Admission is offline and deterministic.
 */
import type { Refusal } from './types.js'

export type EvidenceKind = 'A' | 'B' | 'C'

export interface IndicatorSpec {
  /** Stable id, used as the rule name in refusals and as the test identifier. */
  readonly id: string
  /** The prohibited-content class this indicator contributes evidence toward. */
  readonly class: string
  readonly kind: EvidenceKind
  /** What this indicator detects — never "the class". */
  readonly detects: string
}

/** Media: bytes in Markdown and opaque URLs are the named blind spots. */
const MEDIA_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.svg',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mp3',
  '.wav',
]

const MEDIA_DATA_URI = /data:(?:image|video|audio)\/[a-z0-9.+-]+\s*;/i
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/
const HTML_MEDIA = /<\s*(?:img|video|audio|source|picture)\b/i

const PEM_BLOCK = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/
/** Only prefixes we have explicitly accepted. Guessing invites false positives. */
const KEY_PREFIXES = [/\bAKIA[0-9A-Z]{16}\b/, /\bghp_[A-Za-z0-9]{36}\b/, /\bsk-[A-Za-z0-9]{32,}\b/]

/**
 * Structured authorization tuples, e.g. `user:alice#member@doc:x`.
 *
 * Deliberately narrow. The prose form — `knowledge/README.md`'s own prohibited
 * example, *"Alice is a household administrator"* — is the named blind spot and
 * is NOT detectable here.
 */
const TUPLE_SHAPE = /\b[a-z][a-z0-9_-]*:[A-Za-z0-9_-]+#[a-z][a-z0-9_-]*@[a-z][a-z0-9_-]*:/
const GRANT_KEYS = new Set(['grants', 'authorization', 'tuples', 'relations', 'permissions'])

/**
 * THE COVERAGE TABLE, machine-readable and kept with the code.
 *
 * ADR-0016 §9(2) requires it to travel with the implementation so a detector
 * cannot be improved without the honesty statement moving with it.
 */
export const COVERAGE: readonly IndicatorSpec[] = Object.freeze([
  {
    id: 'media.non-markdown-member',
    class: 'camera media, recordings',
    kind: 'B',
    detects: 'a bundle member that is not a .md file',
  },
  {
    id: 'media.data-uri',
    class: 'camera media, recordings',
    kind: 'B',
    detects: 'a data: URI with an image, video, or audio MIME type',
  },
  {
    id: 'media.markdown-image',
    class: 'camera media, recordings',
    kind: 'B',
    detects: 'a Markdown image reference',
  },
  {
    id: 'media.html-element',
    class: 'camera media, recordings',
    kind: 'B',
    detects: 'an HTML img/video/audio/source/picture element',
  },
  {
    id: 'media.known-extension',
    class: 'camera media, recordings',
    kind: 'B',
    detects: 'a reference ending in an enumerated media extension',
  },
  {
    id: 'secret.pem-block',
    class: 'secrets, credentials',
    kind: 'B',
    detects: 'a PEM private-key header',
  },
  {
    id: 'secret.jwt-shape',
    class: 'secrets, credentials',
    kind: 'B',
    detects: 'a three-segment JWT-shaped token',
  },
  {
    id: 'secret.known-prefix',
    class: 'secrets, credentials',
    kind: 'B',
    detects: 'an explicitly enumerated provider key prefix',
  },
  {
    id: 'authorization.tuple-shape',
    class: 'authorization tuples, grants',
    kind: 'B',
    detects: 'a structured relationship tuple',
  },
  {
    id: 'authorization.grant-key',
    class: 'authorization tuples, grants',
    kind: 'B',
    detects: 'an enumerated grant-shaped frontmatter key',
  },
])

/** The blind spots, stated as data so a reviewer can read them without the prose. */
export const BLIND_SPOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'camera media, recordings': [
    'media bytes base64- or hex-encoded inside a Markdown file',
    'media behind an opaque URL with no extension or content hint',
  ],
  'secrets, credentials': ['a credential stated in prose'],
  'authorization tuples, grants': ['authority stated in prose'],
})

/** Classes with NO deterministic mechanism. Never given a detector. */
export const UNDECIDABLE_CLASSES: readonly string[] = Object.freeze([
  'live device state, current readings',
  'current presence, occupancy',
  'mutable automation state',
  'raw personal telemetry',
])

const refuse = (id: string, path: string, detail: string): Refusal => ({
  kind: 'prohibited_indicator',
  path,
  rule: id,
  detail,
})

/** Run every indicator over one document's text and frontmatter. */
export const scanDocument = (
  path: string,
  text: string,
  frontmatter: Readonly<Record<string, unknown>>,
): readonly Refusal[] => {
  const found: Refusal[] = []
  if (MEDIA_DATA_URI.test(text)) found.push(refuse('media.data-uri', path, 'media-typed data: URI'))
  if (MARKDOWN_IMAGE.test(text))
    found.push(refuse('media.markdown-image', path, 'Markdown image reference'))
  if (HTML_MEDIA.test(text)) found.push(refuse('media.html-element', path, 'HTML media element'))
  for (const extension of MEDIA_EXTENSIONS) {
    if (text.toLowerCase().includes(extension)) {
      found.push(refuse('media.known-extension', path, `reference to a ${extension} file`))
      break
    }
  }
  if (PEM_BLOCK.test(text)) found.push(refuse('secret.pem-block', path, 'PEM private-key header'))
  if (JWT_SHAPE.test(text)) found.push(refuse('secret.jwt-shape', path, 'JWT-shaped token'))
  for (const prefix of KEY_PREFIXES) {
    if (prefix.test(text)) {
      found.push(refuse('secret.known-prefix', path, 'enumerated provider key prefix'))
      break
    }
  }
  if (TUPLE_SHAPE.test(text))
    found.push(refuse('authorization.tuple-shape', path, 'structured relationship tuple'))
  for (const key of Object.keys(frontmatter)) {
    if (GRANT_KEYS.has(key)) {
      found.push(refuse('authorization.grant-key', path, `grant-shaped frontmatter key "${key}"`))
      break
    }
  }
  return found
}

/** Members that are not Markdown at all — the one structural media indicator. */
export const scanMembers = (paths: readonly string[]): readonly Refusal[] =>
  paths
    .filter((path) => !path.endsWith('.md'))
    .map((path) =>
      refuse('media.non-markdown-member', path, 'bundle member is not a Markdown document'),
    )
