/**
 * The PR-1 canonical representation.
 *
 * This module deliberately does not use JSON.parse for repository state. JSON
 * objects are constructed only after every object member has been scanned, so
 * a duplicate key cannot be silently replaced by the last occurrence.
 */

import { TextDecoder } from 'node:util'

const decoder = new TextDecoder('utf-8', { fatal: true })

const SET_ARRAY_KEYS = new Set([
  'resolves',
  'supersedes',
  'requires',
  'sources',
  'scope',
  'policyEvidenceIdentities',
])

const ENTITY_ARRAY_KEYS = new Set(['adrs', 'questions', 'gates', 'landings', 'externalReferences'])

const OBJECT_ORDERS = new Map([
  [
    'root',
    [
      'schemaVersion',
      'adrs',
      'questions',
      'gates',
      'landings',
      'externalReferences',
      'attestations',
    ],
  ],
  [
    'adr',
    ['id', 'path', 'title', 'lifecycle', 'proposedOn', 'resolves', 'supersedes', 'acceptance'],
  ],
  ['question', ['id', 'anchor', 'title', 'severity']],
  [
    'gate',
    [
      'id',
      'kind',
      'predicate',
      'authorityAnchor',
      'sources',
      'reviewedOrderingIntent',
      'replaces',
      'replacement',
    ],
  ],
  [
    'landing',
    [
      'id',
      'kind',
      'requires',
      'authorityAnchor',
      'reviewedOrderingIntent',
      'replaces',
      'replacement',
      'delivery',
    ],
  ],
  ['predicate', ['name', 'question']],
  ['anchor', ['type', 'repository', 'number', 'id']],
  ['delivery', ['lifecycle', 'completionPolicy', 'completion', 'withdrawal']],
  ['completion', ['digest', 'evidence', 'attestation']],
  ['withdrawal', ['digest', 'evidence', 'attestation']],
  ['replacement', ['digest', 'attestation']],
  ['attestation', ['digest', 'actor', 'at', 'outcome', 'authority']],
  ['identity', ['class', 'value', 'scope']],
])

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const compareText = (left, right) => (left === right ? 0 : left < right ? -1 : 1)

const objectKind = (object, path) => {
  const key = path.at(-1)
  if (path.length === 0) return 'root'
  if (key === 'predicate') return 'predicate'
  if (key === 'authorityAnchor' || key === 'authority') return 'anchor'
  if (key === 'delivery') return 'delivery'
  if (key === 'completion') return 'completion'
  if (key === 'withdrawal') return 'withdrawal'
  if (key === 'replacement') return 'replacement'
  if (key === 'attestation') return 'attestation'
  if (key === 'identity' || key === 'deliveredIdentity') return 'identity'
  if (path.includes('adrs')) return 'adr'
  if (path.includes('questions')) return 'question'
  if (path.includes('gates')) return 'gate'
  if (path.includes('landings')) return 'landing'
  return undefined
}

const compareCanonical = (left, right) => {
  const a = JSON.stringify(left)
  const b = JSON.stringify(right)
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Canonicalize a parsed state without asserting that it is semantically valid.
 * Semantic validation belongs to validate.mjs; keeping this operation total is
 * useful for tests that prove order independence before the strict checker is
 * invoked.
 */
export function canonicalizeValue(value, path = []) {
  if (Array.isArray(value)) {
    const members = value.map((member, index) =>
      canonicalizeValue(member, [...path, String(index)]),
    )
    const key = path.at(-1)

    if (ENTITY_ARRAY_KEYS.has(key)) {
      return [...members].sort((left, right) => compareText(String(left?.id), String(right?.id)))
    }
    if (key === 'members' && path.includes('genesisCompletion')) {
      return [...members].sort((left, right) =>
        compareText(String(left?.landingId), String(right?.landingId)),
      )
    }
    if (SET_ARRAY_KEYS.has(key)) {
      return [...members].sort(compareCanonical)
    }
    if (key === 'evidenceIdentities' || key === 'policyEvidence') {
      return [...members].sort(compareCanonical)
    }
    return members
  }

  if (!isObject(value)) return value

  const kind = objectKind(value, path)
  const preferred = OBJECT_ORDERS.get(kind)
  const keys = Object.keys(value).sort((left, right) => {
    if (preferred) {
      const li = preferred.indexOf(left)
      const ri = preferred.indexOf(right)
      if (li !== -1 || ri !== -1) {
        const leftRank = li === -1 ? Number.MAX_SAFE_INTEGER : li
        const rightRank = ri === -1 ? Number.MAX_SAFE_INTEGER : ri
        return leftRank - rightRank
      }
    }
    return compareText(left, right)
  })

  const result = Object.create(null)
  for (const key of keys) result[key] = canonicalizeValue(value[key], [...path, key])
  return result
}

const PRINT_WIDTH = 100

function renderCanonical(value, indentation) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const inlineMembers = value.map((member) => renderCanonical(member, indentation + '  '))
    const inline = '[' + inlineMembers.join(', ') + ']'
    if (
      value.every((member) => member === null || typeof member !== 'object') &&
      indentation.length + inline.length <= PRINT_WIDTH
    ) {
      return inline
    }
    return (
      '[\n' +
      inlineMembers.map((member) => indentation + '  ' + member).join(',\n') +
      '\n' +
      indentation +
      ']'
    )
  }
  const keys = Object.keys(value)
  if (keys.length === 0) return '{}'
  const childIndentation = indentation + '  '
  return (
    '{\n' +
    keys
      .map((key) => JSON.stringify(key) + ': ' + renderCanonical(value[key], childIndentation))
      .map((member) => childIndentation + member)
      .join(',\n') +
    '\n' +
    indentation +
    '}'
  )
}

export function canonicalSerialize(value) {
  return renderCanonical(canonicalizeValue(value), '') + '\n'
}

class StrictJsonParser {
  constructor(text) {
    this.text = text
    this.index = 0
  }

  error(message) {
    throw new Error(message + ' at byte ' + this.index)
  }

  skipWhitespace() {
    while (this.index < this.text.length && /[ \t\r\n]/u.test(this.text[this.index]))
      this.index += 1
  }

  expect(character) {
    if (this.text[this.index] !== character) this.error('expected "' + character + '"')
    this.index += 1
  }

  parse() {
    this.skipWhitespace()
    const value = this.parseValue()
    this.skipWhitespace()
    if (this.index !== this.text.length) this.error('trailing content')
    return value
  }

  parseValue() {
    const character = this.text[this.index]
    if (character === '{') return this.parseObject()
    if (character === '[') return this.parseArray()
    if (character === '"') return this.parseString()
    if (character === 't' && this.text.startsWith('true', this.index)) {
      this.index += 4
      return true
    }
    if (character === 'f' && this.text.startsWith('false', this.index)) {
      this.index += 5
      return false
    }
    if (character === 'n' && this.text.startsWith('null', this.index)) {
      this.index += 4
      return null
    }
    return this.parseNumber()
  }

  parseObject() {
    this.expect('{')
    const result = Object.create(null)
    const keys = new Set()
    this.skipWhitespace()
    if (this.text[this.index] === '}') {
      this.index += 1
      return result
    }

    while (true) {
      this.skipWhitespace()
      if (this.text[this.index] !== '"') this.error('object key must be a string')
      const key = this.parseString()
      if (keys.has(key)) this.error('duplicate object key "' + key + '"')
      keys.add(key)
      this.skipWhitespace()
      this.expect(':')
      this.skipWhitespace()
      result[key] = this.parseValue()
      this.skipWhitespace()
      if (this.text[this.index] === '}') {
        this.index += 1
        return result
      }
      this.expect(',')
    }
  }

  parseArray() {
    this.expect('[')
    const result = []
    this.skipWhitespace()
    if (this.text[this.index] === ']') {
      this.index += 1
      return result
    }

    while (true) {
      this.skipWhitespace()
      result.push(this.parseValue())
      this.skipWhitespace()
      if (this.text[this.index] === ']') {
        this.index += 1
        return result
      }
      this.expect(',')
    }
  }

  parseString() {
    const start = this.index
    this.expect('"')
    while (this.index < this.text.length) {
      const code = this.text.charCodeAt(this.index)
      if (code < 0x20) this.error('control character in string')
      if (this.text[this.index] === '"') {
        this.index += 1
        return decodeJsonString(this.text.slice(start, this.index))
      }
      if (this.text[this.index] === '\\') {
        this.index += 1
        if (this.index >= this.text.length) this.error('truncated string escape')
        if (this.text[this.index] === 'u') {
          this.index += 1
          for (let count = 0; count < 4; count += 1) {
            if (!/[0-9a-f]/iu.test(this.text[this.index])) this.error('invalid unicode escape')
            this.index += 1
          }
        } else {
          if (!/["\\/bfnrt]/u.test(this.text[this.index])) this.error('invalid string escape')
          this.index += 1
        }
      } else {
        this.index += 1
      }
    }
    this.error('unterminated string')
  }

  parseNumber() {
    const rest = this.text.slice(this.index)
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(rest)
    if (!match) this.error('invalid value')
    const raw = match[0]
    const value = Number(raw)
    if (!Number.isFinite(value)) this.error('non-finite number')
    this.index += raw.length
    return value
  }
}

function decodeJsonString(raw) {
  let result = ''
  for (let index = 1; index < raw.length - 1; index += 1) {
    const character = raw[index]
    if (character !== '\\') {
      result += character
      continue
    }
    index += 1
    const escaped = raw[index]
    const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
    if (hasOwn(simple, escaped)) {
      result += simple[escaped]
      continue
    }
    const code = Number.parseInt(raw.slice(index + 1, index + 5), 16)
    result += String.fromCharCode(code)
    index += 4
  }
  return result
}

export function parseStrictJson(text) {
  if (typeof text !== 'string') throw new TypeError('state input must be text')
  return new StrictJsonParser(text).parse()
}

export function decodeUtf8(bytes) {
  return decoder.decode(bytes)
}

export function parseStrictJsonBytes(bytes) {
  return parseStrictJson(decodeUtf8(bytes))
}

export function isCanonicalStateText(text, value) {
  return text === canonicalSerialize(value)
}

export { hasOwn, isObject }
