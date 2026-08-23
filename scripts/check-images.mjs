#!/usr/bin/env node
/**
 * IMAGE LINEAGE, MECHANICALLY REFUSABLE.
 *
 * deploy/images/image-lock.yaml is the machine-readable record of what every
 * image IS: its lineage class, its definition, its immutable identity, and —
 * for a derived image — the exact parent digest and the one pinned runtime.
 * This file is the ONE parser and the one rule authority for it; a README
 * sentence is not a control, and a second parser would be a second grammar.
 *
 * The lock is a STRICT CANONICAL SUBSET of YAML: two-space indents, block
 * collections only, `key: value` scalars (double quotes admitted, no
 * escapes), full-line comments only, fixed key order. Everything else —
 * tabs, flow collections, anchors, aliases, inline comments, duplicate keys
 * — is refused, so the committed bytes have exactly one reading.
 *
 * What is enforced here (the L5 invariant net, IL-INV-01…08/10/12):
 *   - closed lineage classes; bidirectional registration of definitions;
 *   - immutable external references (every external FROM digest-pinned);
 *   - the derived chain: parent registered, parent_digest byte-equal to the
 *     base entry's digest — an unpropagated base rebuild cannot merge;
 *   - index digest and per-platform manifest digests both recorded, so
 *     "image digest" is never ambiguous;
 *   - provider/framework/runtime neutrality of the base and gates
 *     definitions, with the derived image allowed exactly its own declared
 *     runtime's tokens and nothing else;
 *   - no decision-bearing platform code copied into any image;
 *   - no credential-shaped ENV/ARG names;
 *   - inertness: no profiles/** reference to a registered image, no
 *     launcher/socket token in services/runner-control, deploy/runtime/
 *     README-only.
 *
 * What is NOT proved here: that a digest matches a real build. That proof
 * belongs to the governed build path (.github/workflows/images.yml), which
 * rebuilds every definition and compares. The bootstrap sentinel
 * `pending-first-governed-build` is valid syntax here and a loud failure
 * there — bootstrap is visible, never complete.
 */
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LOCK_PATH = 'deploy/images/image-lock.yaml'
const IMAGES_DIR = 'deploy/images'
const RUNTIME_DIR = 'deploy/runtime'
const SENTINEL = 'pending-first-governed-build'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const PLATFORMS = ['linux/amd64', 'linux/arm64']
const LINEAGES = ['runner-base', 'runner-derived', 'gates-toolchain']

// Mirrors the platform neutrality proof's vocabulary
// (packages/contracts/src/conformance/helpers.ts FORBIDDEN_STRUCTURAL_NAMES)
// as DATA, grouped by provider FAMILY: a derived runtime may own its own
// family's tokens (product + vendor) and no other family's. The grouping is
// what makes "exactly one runtime" checkable against the lock's own text —
// a runtime identity matching two families is two runtimes, refused, so
// free text in the lock cannot launder a second provider's tokens into the
// allowed set. Providers and isolation runtimes are split because a
// Dockerfile is inherently a container build definition: `docker` is
// refused in image NAMES and lock KEYS (identity conflation), not in
// build-file prose.
const PROVIDER_FAMILIES = [
  ['claude', 'anthropic'],
  ['copilot'],
  ['codex', 'openai'],
  ['langgraph'],
  ['pydantic'],
]
const PROVIDER_TOKENS = PROVIDER_FAMILIES.flat()
const ISOLATION_TOKENS = ['kata', 'runc', 'gvisor', 'containerd']
const NAME_TOKENS = [...ISOLATION_TOKENS, 'docker']
const CREDENTIAL_NAME = /(TOKEN|SECRET|PASSWORD|CREDENTIAL|API_?KEY)/i
const REPO_DIRS = ['services', 'packages', 'knowledge', 'profiles']

/**
 * COPY/ADD arguments, parsed the way BuildKit reads them: flags first
 * (`--from`, `--chown`, `--chmod`, `--link`, `--exclude`, …), then either the
 * JSON exec form or whitespace-separated paths, destination last. Every
 * SOURCE spelling must be normalized before the repo-directory rule applies:
 * `./services/x`, `././services/x`, and `["services/x", …]` name the same
 * bytes as `services/x` — the falsification review demonstrated eight bypass
 * spellings against the original single-pattern rule. An instruction the
 * parser cannot read is refused, never skipped.
 */
const parseCopySources = (instruction) => {
  let rest = instruction.replace(/^(COPY|ADD)\s+/i, '')
  let fromValue
  for (;;) {
    const flag = rest.match(/^--([a-z-]+)(=\S+)?\s+/i)
    if (flag === null) break
    if (flag[1].toLowerCase() === 'from') fromValue = (flag[2] ?? '=').slice(1)
    rest = rest.slice(flag[0].length)
  }
  let args
  if (rest.startsWith('[')) {
    try {
      args = JSON.parse(rest)
    } catch {
      return { error: 'unparseable JSON exec form' }
    }
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      return { error: 'unparseable JSON exec form' }
    }
  } else {
    args = rest.split(/\s+/).filter((a) => a !== '')
  }
  if (args.length < 2) return { error: 'missing source or destination' }
  return { fromValue, sources: args.slice(0, -1) }
}
const LAUNCHER_TOKENS = [
  'dockerode',
  'docker.sock',
  '/var/run/docker',
  'containerd.sock',
  'testcontainers',
]

const token = (t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, 'i')

// --- the canonical-subset parser --------------------------------------------

export function parseLock(text) {
  const problems = []
  const lines = text.split('\n')
  const rows = []
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const where = `line ${i + 1}`
    if (raw.includes('\t')) problems.push(`${where}: tab characters are not part of the grammar`)
    if (raw.includes('\r')) problems.push(`${where}: CR is not part of the grammar`)
    const stripped = raw.trimEnd()
    if (stripped === '' || /^\s*#/.test(stripped)) continue
    if (/[{}[\]]/.test(stripped)) {
      problems.push(`${where}: flow collections are not part of the grammar`)
    }
    if (/(^|\s)[&*][A-Za-z]/.test(stripped)) {
      problems.push(`${where}: anchors and aliases are not part of the grammar`)
    }
    if (/\s#/.test(stripped)) {
      problems.push(`${where}: inline comments are not part of the grammar (full-line only)`)
    }
    const indent = raw.length - raw.trimStart().length
    if (indent % 2 !== 0) problems.push(`${where}: indentation must be a multiple of two spaces`)
    rows.push({ indent, text: stripped.trim(), where })
  }
  if (problems.length > 0) return { problems }

  const unquote = (value) => {
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      const inner = value.slice(1, -1)
      if (inner.includes('"') || inner.includes('\\')) return undefined
      return inner
    }
    // Exactly one quoting form. A single-quoted scalar would silently keep
    // its quote characters as value bytes — a second reading, refused.
    if (value.startsWith("'") || value.startsWith('"')) return undefined
    return value
  }

  let at = 0
  const parseMap = (indent) => {
    const map = new Map()
    while (at < rows.length && rows[at].indent === indent && !rows[at].text.startsWith('- ')) {
      const row = rows[at]
      const sep = row.text.indexOf(': ')
      const bare = row.text.endsWith(':') ? row.text.slice(0, -1) : undefined
      const key = sep !== -1 ? row.text.slice(0, sep) : bare
      if (key === undefined || key === '' || /[:\s"]/.test(key)) {
        problems.push(`${row.where}: expected "key: value" or "key:"`)
        return map
      }
      if (map.has(key)) {
        problems.push(`${row.where}: duplicate key "${key}"`)
        return map
      }
      at += 1
      if (sep !== -1) {
        const value = unquote(row.text.slice(sep + 2).trim())
        if (value === undefined || value === '') {
          problems.push(`${row.where}: malformed scalar value`)
          return map
        }
        map.set(key, value)
      } else {
        if (at >= rows.length || rows[at].indent !== indent + 2) {
          problems.push(`${row.where}: "${key}:" must be followed by an indented block`)
          return map
        }
        map.set(key, rows[at].text.startsWith('- ') ? parseList(indent + 2) : parseMap(indent + 2))
      }
    }
    return map
  }
  const parseList = (indent) => {
    const list = []
    while (at < rows.length && rows[at].indent === indent && rows[at].text.startsWith('- ')) {
      const row = rows[at]
      const rest = row.text.slice(2)
      const sep = rest.indexOf(': ')
      if (sep === -1) {
        const value = unquote(rest.trim())
        if (value === undefined || value === '')
          problems.push(`${row.where}: malformed list scalar`)
        else list.push(value)
        at += 1
        continue
      }
      // A list item opening a map: rewrite the item line as its first key at
      // the item body indent, then parse the map.
      rows[at] = { indent: indent + 2, text: rest, where: row.where }
      list.push(parseMap(indent + 2))
    }
    return list
  }

  const root = parseMap(0)
  if (at < rows.length) problems.push(`${rows[at].where}: unexpected structure`)
  if (problems.length > 0) return { problems }
  return { root }
}

// --- validation --------------------------------------------------------------

const keysOf = (map) => [...map.keys()]
const isMap = (v) => v instanceof Map

const walkFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

export function checkImages(root = DEFAULT_ROOT) {
  const problems = []
  const fail = (rule, detail) => problems.push(`images.${rule} — ${detail}`)
  const lockPath = join(root, LOCK_PATH)
  if (!existsSync(lockPath)) {
    fail('lock-missing', `${LOCK_PATH} is missing`)
    return { problems, images: [], pending: 0 }
  }

  const parsed = parseLock(readFileSync(lockPath, 'utf8'))
  if (parsed.problems !== undefined) {
    for (const p of parsed.problems) fail('grammar', p)
    return { problems, images: [], pending: 0 }
  }
  const lock = parsed.root

  if (keysOf(lock).join(',') !== 'version,images') {
    fail(
      'schema',
      `top level must be exactly "version" then "images", found: ${keysOf(lock).join(', ')}`,
    )
    return { problems, images: [], pending: 0 }
  }
  if (lock.get('version') !== '1') fail('schema', `"version" must be 1`)
  const entries = lock.get('images')
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('schema', '"images" must be a non-empty list')
    return { problems, images: [], pending: 0 }
  }

  // Provider identity may appear only as a VALUE. A provider-named KEY is a
  // structural position — the exact thing INV-002 forbids.
  const scanKeys = (node, path) => {
    if (isMap(node)) {
      for (const [k, v] of node) {
        for (const t of [...PROVIDER_TOKENS, ...NAME_TOKENS]) {
          if (token(t).test(k))
            fail(
              'lock-structural-name',
              `key "${path}${k}" carries "${t}" in a structural position`,
            )
        }
        scanKeys(v, `${path}${k}.`)
      }
    } else if (Array.isArray(node)) {
      for (const item of node) scanKeys(item, path)
    }
  }
  scanKeys(lock, '')

  const ORDER = {
    'runner-base': [
      'name',
      'lineage',
      'definition',
      'platforms',
      'external_base',
      'digest',
      'manifests',
    ],
    'gates-toolchain': [
      'name',
      'lineage',
      'definition',
      'platforms',
      'external_base',
      'digest',
      'manifests',
    ],
    'runner-derived': [
      'name',
      'lineage',
      'definition',
      'platforms',
      'parent',
      'parent_digest',
      'runtime',
      'digest',
      'manifests',
    ],
  }

  const byName = new Map()
  const registeredDefinitions = new Set()
  let pending = 0
  const digestOk = (value) => value === SENTINEL || DIGEST.test(value)

  for (const entry of entries) {
    if (!isMap(entry)) {
      fail('schema', 'every images[] item must be a map')
      continue
    }
    const name = entry.get('name')
    const lineage = entry.get('lineage')
    const id = typeof name === 'string' ? name : '(unnamed)'
    if (typeof name !== 'string' || !/^secure-home-[a-z0-9-]+$/.test(name)) {
      fail('name', `"${id}": name must match secure-home-<kebab>`)
      continue
    }
    if (byName.has(name)) {
      fail('name', `"${name}" appears twice`)
      continue
    }
    byName.set(name, entry)
    for (const t of NAME_TOKENS) {
      // An image name that carries an isolation-runtime identity conflates
      // WHAT executes with HOW it is isolated (runner-kata, runner-runc).
      if (name.split('-').includes(t))
        fail(
          'name-runtime-conflation',
          `"${name}" conflates workload identity with isolation runtime "${t}"`,
        )
    }
    if (!LINEAGES.includes(lineage)) {
      fail('lineage', `"${name}": lineage must be one of ${LINEAGES.join(', ')}`)
      continue
    }
    const expected = ORDER[lineage]
    if (keysOf(entry).join(',') !== expected.join(',')) {
      fail(
        'key-order',
        `"${name}": keys must be exactly [${expected.join(', ')}] in order, found [${keysOf(entry).join(', ')}]`,
      )
      continue
    }

    const definition = entry.get('definition')
    if (
      typeof definition !== 'string' ||
      !definition.startsWith(`${IMAGES_DIR}/`) ||
      !definition.endsWith('/Dockerfile')
    ) {
      fail('definition', `"${name}": definition must be a Dockerfile under ${IMAGES_DIR}/`)
      continue
    }
    if (registeredDefinitions.has(definition))
      fail('definition', `"${name}": definition "${definition}" is already registered`)
    registeredDefinitions.add(definition)
    if (!existsSync(join(root, definition))) {
      fail('definition', `"${name}": definition "${definition}" does not exist`)
      continue
    }

    const platforms = entry.get('platforms')
    if (
      !Array.isArray(platforms) ||
      platforms.length === 0 ||
      !platforms.every((p) => PLATFORMS.includes(p))
    ) {
      fail(
        'platforms',
        `"${name}": platforms must be a non-empty subset of ${PLATFORMS.join(', ')}`,
      )
    }
    const digest = entry.get('digest')
    if (typeof digest !== 'string' || !digestOk(digest))
      fail('digest', `"${name}": digest must be sha256:<64 hex> or the bootstrap sentinel`)
    if (digest === SENTINEL) pending += 1
    const manifests = entry.get('manifests')
    if (!Array.isArray(manifests)) {
      fail('manifests', `"${name}": manifests must be a list`)
    } else {
      const listed = manifests.map((m) => (isMap(m) ? m.get('platform') : undefined))
      if (Array.isArray(platforms) && listed.join(',') !== platforms.join(',')) {
        fail(
          'manifests',
          `"${name}": manifests platforms [${listed.join(', ')}] must equal platforms [${(platforms ?? []).join(', ')}] in order`,
        )
      }
      for (const m of manifests) {
        if (!isMap(m) || keysOf(m).join(',') !== 'platform,digest') {
          fail('manifests', `"${name}": each manifest entry must be exactly {platform, digest}`)
          continue
        }
        if (!digestOk(m.get('digest')))
          fail(
            'manifests',
            `"${name}": manifest digest for ${m.get('platform')} must be sha256:<64 hex> or the bootstrap sentinel`,
          )
        if (m.get('digest') === SENTINEL) pending += 1
      }
    }

    if (lineage === 'runner-derived') {
      const runtime = entry.get('runtime')
      if (!isMap(runtime) || keysOf(runtime).join(',') !== 'name,package,version,integrity') {
        fail('runtime', `"${name}": runtime must be exactly {name, package, version, integrity}`)
      } else {
        // Value grammars, because runtime.name/package feed the owned-token
        // computation in the neutrality scan: free text here would launder a
        // second provider's tokens into the allowed set — the exact
        // counter-fixture the falsification review planted.
        if (!/^[a-z][a-z0-9-]*$/.test(runtime.get('name'))) {
          fail('runtime', `"${name}": runtime.name must be a lowercase kebab identifier`)
        }
        if (!/^(@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/.test(runtime.get('package'))) {
          fail('runtime', `"${name}": runtime.package must be a single npm package name`)
        }
        if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(runtime.get('version'))) {
          fail('runtime', `"${name}": runtime.version must be an exact MAJOR.MINOR.PATCH version`)
        }
        if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(runtime.get('integrity'))) {
          fail('runtime', `"${name}": runtime.integrity must be an npm sha512 integrity value`)
        }
        const identity = `${runtime.get('name')} ${runtime.get('package')}`.toLowerCase()
        const families = PROVIDER_FAMILIES.filter((f) => f.some((t) => token(t).test(identity)))
        if (families.length > 1) {
          fail(
            'runtime',
            `"${name}": runtime identity "${identity}" resolves to more than one provider ` +
              `(${families.map((f) => f[0]).join(', ')}); a derived image carries exactly one runtime`,
          )
        }
      }
    } else {
      const external = entry.get('external_base')
      if (!isMap(external) || keysOf(external).join(',') !== 'reference,digest') {
        fail('external-base', `"${name}": external_base must be exactly {reference, digest}`)
      } else if (!DIGEST.test(external.get('digest'))) {
        // The external identity is known at authoring time; a sentinel here
        // would be an unpinned upstream, which is never acceptable.
        fail('external-base', `"${name}": external_base.digest must be a real sha256 digest`)
      }
    }
  }

  // --- bidirectional registration -------------------------------------------
  const imagesRoot = join(root, IMAGES_DIR)
  if (existsSync(imagesRoot)) {
    for (const entry of readdirSync(imagesRoot)) {
      const dir = join(imagesRoot, entry)
      if (!statSync(dir).isDirectory() || entry === 'scripts') continue
      const dockerfile = join(dir, 'Dockerfile')
      if (
        existsSync(dockerfile) &&
        !registeredDefinitions.has(`${IMAGES_DIR}/${entry}/Dockerfile`)
      ) {
        fail(
          'unregistered',
          `${IMAGES_DIR}/${entry}/Dockerfile exists but is not registered in the lock`,
        )
      }
      if (!existsSync(dockerfile) && entry !== 'scripts') {
        fail(
          'unregistered',
          `${IMAGES_DIR}/${entry}/ carries no Dockerfile — an image directory without a definition is unexplainable`,
        )
      }
    }
  }

  // --- per-definition rules ---------------------------------------------------
  for (const [name, entry] of byName) {
    const lineage = entry.get('lineage')
    const path = join(root, entry.get('definition'))
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    // Instruction-level rules read LOGICAL lines: a backslash continuation
    // must not be able to hide an argument from any scan below.
    const lines = []
    let carry = ''
    for (const raw of text.split('\n')) {
      const joined = carry + raw
      if (/\\\s*$/.test(joined) && !/^\s*#/.test(joined)) {
        carry = joined.replace(/\\\s*$/, ' ')
        continue
      }
      lines.push(joined)
      carry = ''
    }
    if (carry !== '') lines.push(carry)

    const fromLines = lines.map((l) => l.trim()).filter((l) => /^FROM\s/i.test(l))
    const stageAliases = new Set(
      fromLines.map((l) => l.match(/\sAS\s+(\S+)$/i)?.[1]).filter((a) => a !== undefined),
    )
    const fromRefs = fromLines.map((l) =>
      l
        .replace(/^FROM\s+/i, '')
        .replace(/\s+AS\s+\S+$/i, '')
        .trim(),
    )
    if (fromRefs.length === 0) fail('from', `"${name}": definition has no FROM`)
    for (const ref of fromRefs) {
      const externallyPinned = /^[^\s@]+@sha256:[0-9a-f]{64}$/.test(ref)
      if (lineage === 'runner-derived' && ref === entry.get('parent')) continue
      if (!externallyPinned) {
        fail(
          'from-unpinned',
          `"${name}": FROM "${ref}" is not pinned by an immutable sha256 digest${lineage === 'runner-derived' ? ' and is not the registered parent' : ''}`,
        )
      }
    }
    if (lineage === 'runner-derived') {
      const parent = entry.get('parent')
      const parentEntry = byName.get(parent)
      if (parentEntry === undefined || parentEntry.get('lineage') !== 'runner-base') {
        fail('parent', `"${name}": parent "${parent}" is not a registered runner-base image`)
      } else if (entry.get('parent_digest') !== parentEntry.get('digest')) {
        // The chain rule. A rebuilt base whose digest moved cannot leave a
        // derived entry claiming the old parent — both digests are named so
        // the fix is mechanical.
        fail(
          'parent-chain',
          `"${name}": parent_digest ${entry.get('parent_digest')} does not equal ${parent}'s digest ${parentEntry.get('digest')}`,
        )
      }
      if (!fromRefs.includes(parent)) {
        fail('from', `"${name}": definition must FROM its registered parent "${parent}"`)
      }
    }
    // external_base.digest must appear as the inline FROM pin.
    if (lineage !== 'runner-derived') {
      const external = entry.get('external_base')
      if (isMap(external) && DIGEST.test(external.get('digest') ?? '')) {
        const pinned = fromRefs.some((ref) => ref.endsWith(`@${external.get('digest')}`))
        if (!pinned)
          fail(
            'external-base',
            `"${name}": the Dockerfile FROM pin does not carry external_base.digest`,
          )
      }
    }

    // Neutrality. The derived image is allowed exactly the tokens its own
    // declared runtime carries; the base and gates definitions are allowed
    // none. Comments included: a provider name anywhere in the definition is
    // a lineage violation (#53), so the definitions are written without one.
    const runtime = entry.get('runtime')
    // The owned set is the ONE provider family the runtime identity resolves
    // to — never a raw substring sweep, which would let lock free text
    // launder a second provider's tokens into the allowed set. Multi-family
    // identities were already refused in the schema pass; `find` takes the
    // single legitimate match.
    const owned =
      lineage === 'runner-derived' && isMap(runtime)
        ? (PROVIDER_FAMILIES.find((f) =>
            f.some((t) =>
              token(t).test(`${runtime.get('name')} ${runtime.get('package')}`.toLowerCase()),
            ),
          ) ?? [])
        : []
    for (const t of PROVIDER_TOKENS) {
      if (owned.includes(t)) continue
      if (token(t).test(text))
        fail('neutrality', `"${name}": definition carries provider/framework token "${t}"`)
    }
    for (const t of ISOLATION_TOKENS) {
      if (token(t).test(text))
        fail('neutrality', `"${name}": definition carries isolation-runtime token "${t}"`)
    }

    if (lineage === 'runner-derived' && isMap(runtime)) {
      const version = runtime.get('version')
      const pin = new RegExp(`^ARG [A-Z0-9_]*VERSION=${version.replaceAll('.', '\\.')}$`, 'm')
      if (!pin.test(text)) {
        fail(
          'runtime-pin',
          `"${name}": definition does not pin the runtime version ${version} in an ARG`,
        )
      }
      if (!text.includes(`io.secure-home.runtime.version="${version}"`)) {
        fail('runtime-pin', `"${name}": runtime version label does not match the lock (${version})`)
      }
    }
    if (!text.includes(`io.secure-home.lineage="${lineage}"`)) {
      fail('lineage-label', `"${name}": definition must carry io.secure-home.lineage="${lineage}"`)
    }

    for (const line of lines) {
      const t = line.trim()
      if (/^(COPY|ADD)\s/i.test(t)) {
        const parsed = parseCopySources(t)
        if (parsed.error !== undefined) {
          fail(
            'decision-bearing',
            `"${name}": ${t.slice(0, 60)} — ${parsed.error}; an instruction the checker cannot parse cannot be proven inert`,
          )
        } else {
          const fromStage = parsed.fromValue !== undefined
          if (
            fromStage &&
            !stageAliases.has(parsed.fromValue) &&
            !/^\d+$/.test(parsed.fromValue) &&
            !/@sha256:[0-9a-f]{64}$/.test(parsed.fromValue)
          ) {
            // --from can name an arbitrary external image — an unpinned
            // input through the side door the FROM rule already closed.
            fail(
              'from-unpinned',
              `"${name}": COPY/ADD --from="${parsed.fromValue}" is neither a declared build stage nor pinned by an immutable sha256 digest`,
            )
          }
          for (const rawSource of parsed.sources) {
            let source = rawSource
            while (source.startsWith('./')) source = source.slice(2)
            const problem = /^[a-z][a-z0-9+.-]*:\/\//i.test(source)
              ? 'fetches a remote URL — an unpinned input'
              : source.split('/').includes('..')
                ? 'escapes the build context with ".."'
                : !fromStage && source.startsWith('/')
                  ? 'copies an absolute host path'
                  : !fromStage && REPO_DIRS.includes(source.split('/')[0])
                    ? 'reaches platform code or repository state'
                    : undefined
            if (problem !== undefined) {
              fail(
                'decision-bearing',
                `"${name}": ${t.split(/\s+/).slice(0, 4).join(' ')} ${problem}; images carry no decision-bearing content and no unpinned input`,
              )
            }
          }
        }
      }
      const declared = t.match(/^(?:ENV|ARG)\s+([A-Za-z0-9_]+)=?/)
      if (declared && CREDENTIAL_NAME.test(declared[1])) {
        fail(
          'credential-shape',
          `"${name}": ${declared[1]} is a credential-shaped ENV/ARG name; images carry no credential handling`,
        )
      }
    }
  }

  // --- inertness --------------------------------------------------------------
  const runtimeDir = join(root, RUNTIME_DIR)
  if (existsSync(runtimeDir)) {
    for (const file of walkFiles(runtimeDir)) {
      const rel = file.slice(root.length).replace(/^\//, '')
      if (rel !== `${RUNTIME_DIR}/README.md`) {
        fail(
          'runtime-dir',
          `${rel}: ${RUNTIME_DIR}/ is taxonomy only until a governed landing selects a runtime — README.md is its entire permitted content`,
        )
      }
    }
  }
  const profilesDir = join(root, 'profiles')
  for (const file of walkFiles(profilesDir)) {
    const content = readFileSync(file, 'utf8')
    for (const name of byName.keys()) {
      if (content.includes(name)) {
        fail(
          'profile-reference',
          `${file.slice(root.length).replace(/^\//, '')} references "${name}"; L5 images are inert and no profile may point at one`,
        )
      }
    }
  }
  const controlDir = join(root, 'services', 'runner-control', 'src')
  for (const file of walkFiles(controlDir)) {
    // Production source only: runner-control's own architecture guard test
    // legitimately NAMES these tokens in order to forbid them, and this
    // sweep is the out-of-package echo of that same rule.
    if (file.endsWith('.test.ts')) continue
    const content = readFileSync(file, 'utf8')
    for (const t of LAUNCHER_TOKENS) {
      if (content.includes(t)) {
        fail(
          'launcher',
          `${file.slice(root.length).replace(/^\//, '')} carries launcher/container-socket token "${t}"; the concrete launcher is L9, behind U4`,
        )
      }
    }
  }

  return { problems, images: [...byName.keys()], pending }
}

// --- CLI ---------------------------------------------------------------------

// process.argv[1] preserves a symlinked invocation path; the ESM loader
// realpaths import.meta.url. Compared raw, a symlinked invocation matches
// nothing, runs nothing, and exits 0 — a silent no-op where exit 0 reads as
// PASS. Both sides are therefore resolved to REAL paths, and an entry path
// that cannot be resolved is some other module importing this one.
const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const refuseUsage = (message) => {
    console.error(`✗ image lineage — ${message}`)
    console.error('    usage: check-images.mjs [--root <path>] [--print]')
    process.exit(1)
  }
  const options = new Map()
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]
    if (flag === '--print') {
      if (options.has(flag)) refuseUsage(`${flag} was supplied twice`)
      options.set(flag, true)
      continue
    }
    if (flag !== '--root') refuseUsage(`unknown option "${flag}"`)
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) refuseUsage(`${flag} requires a value`)
    if (options.has(flag)) refuseUsage(`${flag} was supplied twice`)
    options.set(flag, value)
    i += 1
  }

  const root = options.get('--root') ?? DEFAULT_ROOT
  const { problems, images, pending } = checkImages(root)
  if (problems.length > 0) {
    console.error(`✗ image lineage — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  if (options.get('--print') === true) {
    // Machine-readable projection for the governed build scripts: ONE parser
    // (this file) feeds them, so the build cannot read the lock differently.
    const parsed = parseLock(readFileSync(join(root, LOCK_PATH), 'utf8'))
    const plain = (node) => {
      if (node instanceof Map) return Object.fromEntries([...node].map(([k, v]) => [k, plain(v)]))
      if (Array.isArray(node)) return node.map(plain)
      return node
    }
    process.stdout.write(JSON.stringify(plain(parsed.root), null, 2))
    process.stdout.write('\n')
  } else {
    const note =
      pending > 0
        ? ` — ${pending} identity value(s) still ${SENTINEL}; the governed build path fails until real digests are recorded`
        : ''
    console.log(`✓ image lineage — ${images.length} image(s), lineage validated${note}`)
  }
}
