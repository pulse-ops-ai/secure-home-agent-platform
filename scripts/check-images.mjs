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
 * The lock is a STRICT CLOSED SUBSET of YAML: two-space indents, block
 * collections only, `key: value` scalars (double quotes admitted, no
 * escapes), full-line comments only, fixed key order. Everything else —
 * tabs, flow collections, anchors, aliases, inline comments, duplicate keys,
 * single-quoted scalars — is refused. The guarantee is exactly ONE LOGICAL
 * READING of the admitted bytes — not byte-level canonicality: a scalar may
 * be bare or double-quoted and trailing whitespace is trimmed, which is
 * acceptable precisely because the lock's bytes are not themselves an
 * identity; the digests inside it are.
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

// The structural-neutrality vocabulary is DERIVED from the platform proof's
// own list (packages/contracts/src/conformance/helpers.ts
// FORBIDDEN_STRUCTURAL_NAMES) at run time — the platform owns exactly ONE
// vocabulary, and a token added there is enforced here with no second
// hand-maintained copy to drift. If the list cannot be derived, this checker
// refuses rather than guessing.
//
// Two pieces of interpretation remain checker data, applied OVER the derived
// vocabulary:
//   - ISOLATION_SET names which tokens are isolation runtimes (refused in
//     image names and lock keys; `docker` additionally exempted from
//     build-file prose because a Dockerfile is inherently one);
//   - FAMILY_GROUPS names which provider tokens are one identity (product +
//     vendor). Tokens outside every group form singleton families
//     automatically, so a vocabulary addition needs no change here.
//
// Token scans are SECONDARY hardening. The primary exactly-one-runtime
// mechanism is structural: the lock registers exactly one runtime per
// derived image, and the definition must install exactly that registered
// package at the registered version.
const HELPERS_PATH = 'packages/contracts/src/conformance/helpers.ts'
// The ONE reviewed authority for every Debian artifact any governed image
// installs. Each image's packages.<arch>.manifest is a projection of it; a
// projection naming anything this file does not is refused.
const CLOSURE_PATH = 'deploy/images/debian-closure.lock.json'
// The canonical checksum artifact each image PROJECTS FROM its selected
// manifest and then verifies. Naming it is what lets the gate below bind
// the verification to the Debian artifacts rather than to any checksum
// command that happens to share the instruction.
const SELECTED_SUMS = '/tmp/pkg/.sums'
const ISOLATION_SET = new Set(['docker', 'containerd', 'kata', 'runc', 'gvisor'])
const FAMILY_GROUPS = [
  ['claude', 'anthropic'],
  ['codex', 'openai'],
]

const structuralVocabulary = (root) => {
  const path = join(root, HELPERS_PATH)
  if (!existsSync(path)) return undefined
  const match = readFileSync(path, 'utf8').match(/FORBIDDEN_STRUCTURAL_NAMES\s*=\s*\[([^\]]*)\]/)
  if (match === null) return undefined
  const tokens = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
  return tokens.length > 0 ? tokens : undefined
}

// The governed gate toolchain pins, derived from the sources that RUN the
// gate: the merge-gate env (Node, uv) and the repository's packageManager
// (pnpm). The gates-toolchain image must mirror these exactly — a pin moved
// at the source while the image stays stale refuses in the always-on
// governance gate, not in a path-filtered workflow.
const gatePins = (root) => {
  const checksPath = join(root, '.github', 'workflows', 'checks.yml')
  const manifestPath = join(root, 'package.json')
  if (!existsSync(checksPath) || !existsSync(manifestPath)) return undefined
  const checks = readFileSync(checksPath, 'utf8')
  const node = checks.match(/NODE_VERSION:\s*'([^']+)'/)?.[1]
  const uv = checks.match(/UV_VERSION:\s*'([^']+)'/)?.[1]
  let pnpm
  try {
    // packageManager may carry corepack's integrity suffix
    // (pnpm@1.2.3+sha512.<hex>). The image mirrors the VERSION; the artifact
    // itself is pinned separately, by ARG PNPM_SHA256 over the same tarball.
    pnpm = JSON.parse(readFileSync(manifestPath, 'utf8')).packageManager?.match(
      /^pnpm@([^+]+)/,
    )?.[1]
  } catch {
    pnpm = undefined
  }
  if (node === undefined || uv === undefined || pnpm === undefined) return undefined
  return { node, uv, pnpm }
}

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

// --- the closed-subset parser ------------------------------------------------

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

  const vocabulary = structuralVocabulary(root)
  if (vocabulary === undefined) {
    fail(
      'vocabulary',
      `the structural-neutrality vocabulary could not be derived from ${HELPERS_PATH}; ` +
        'the platform proof owns the one list, and this checker refuses to guess a second one',
    )
    return { problems, images: [], pending: 0 }
  }
  const isolationTokens = vocabulary.filter((t) => ISOLATION_SET.has(t))
  const providerTokens = vocabulary.filter((t) => !ISOLATION_SET.has(t))
  const contentIsolationTokens = isolationTokens.filter((t) => t !== 'docker')
  const providerFamilies = (() => {
    const grouped = new Set(FAMILY_GROUPS.flat())
    const families = FAMILY_GROUPS.map((g) => g.filter((tk) => providerTokens.includes(tk))).filter(
      (g) => g.length > 0,
    )
    for (const tk of providerTokens) if (!grouped.has(tk)) families.push([tk])
    return families
  })()

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
        for (const t of vocabulary) {
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
  // Every recorded OCI identity (index and per-platform manifests): the
  // identities a profile actually consumes through runtime.image_digest.
  const lockedIdentities = new Set()
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
    for (const t of isolationTokens) {
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
    else if (typeof digest === 'string' && DIGEST.test(digest)) lockedIdentities.add(digest)
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
        else if (DIGEST.test(m.get('digest'))) lockedIdentities.add(m.get('digest'))
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
        const families = providerFamilies.filter((f) => f.some((t) => token(t).test(identity)))
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

  // --- the shared Debian closure authority ------------------------------------
  //
  // Validated ONCE, here, so that a defect in the authority is reported as a
  // defect in the authority rather than N times as a projection mismatch.
  const closureIndex = new Map()
  {
    const abs = join(root, CLOSURE_PATH)
    if (!existsSync(abs)) {
      fail(
        'packages',
        `${CLOSURE_PATH} is missing -- the package closure is a reviewed manifest, not prose`,
      )
    } else {
      let doc
      try {
        doc = JSON.parse(readFileSync(abs, 'utf8'))
      } catch {
        fail('packages', `${CLOSURE_PATH} is not parseable JSON`)
      }
      const artifacts = doc?.artifacts
      if (!Array.isArray(artifacts) || artifacts.length === 0) {
        if (doc !== undefined) {
          fail('packages', `${CLOSURE_PATH} must carry a non-empty "artifacts" list`)
        }
      } else {
        const ARCHES = new Set(['amd64', 'arm64', 'all'])
        for (const a of artifacts) {
          if (a === null || typeof a !== 'object') {
            fail('packages', `${CLOSURE_PATH}: every artifact must be a map`)
            continue
          }
          const where = `${CLOSURE_PATH}: "${a.package}" ${a.version} (${a.architecture})`
          // A version names a request; a SHA-256 names the bytes.
          if (!/^[0-9a-f]{64}$/.test(String(a.sha256))) {
            fail('packages', `${where} carries no sha256:<64 hex> -- a version is not a pin`)
          }
          // Positive byte size, checked against the fetched artifact at build
          // time. Zero or absent can never be verified against anything.
          if (!Number.isInteger(a.size) || a.size <= 0) {
            fail('packages', `${where} carries no positive byte size`)
          }
          if (!ARCHES.has(String(a.architecture))) {
            fail(
              'packages',
              `${where} declares architecture "${a.architecture}"; expected one of ${[...ARCHES].join(', ')}`,
            )
          }
          if (!/^https:\/\//.test(String(a.url))) {
            fail('packages', `${where} carries no https URL to fetch the pinned artifact from`)
          }
          // The URL must name the artifact the manifest names -- otherwise the
          // reviewed row and the fetched bytes are describing different files.
          const basename = String(a.url).split('/').pop()
          if (basename !== String(a.filename)) {
            fail(
              'packages',
              `${where}: URL basename "${basename}" is not the declared filename "${a.filename}"`,
            )
          }
          // package/version/filename agreement. Debian's pool drops the epoch
          // that a version string carries, so both spellings are admitted --
          // and nothing else is.
          const m = /^([^_]+)_([^_]+)_([^_]+)\.deb$/.exec(String(a.filename))
          if (m === null) {
            fail(
              'packages',
              `${where}: filename "${a.filename}" is not <package>_<version>_<arch>.deb`,
            )
          } else {
            const noEpoch = String(a.version).replace(/^\d+:/, '')
            const escaped = String(a.version).replace(/:/g, '%3a')
            if (m[1] !== a.package) {
              fail('packages', `${where}: filename encodes package "${m[1]}"`)
            } else if (m[2] !== a.version && m[2] !== noEpoch && m[2] !== escaped) {
              fail('packages', `${where}: filename encodes version "${m[2]}"`)
            } else if (m[3] !== String(a.architecture)) {
              fail('packages', `${where}: filename encodes architecture "${m[3]}"`)
            }
          }
          const key = `${a.package} ${a.version}`
          if (!closureIndex.has(key)) closureIndex.set(key, [])
          closureIndex.get(key).push(a)
        }
        // One package at two versions would let two images install different
        // bytes under one reviewed authority.
        const versions = new Map()
        for (const a of artifacts) {
          const k = `${a.package} ${a.architecture}`
          if (!versions.has(k)) versions.set(k, new Set())
          versions.get(k).add(a.version)
        }
        for (const [k, vs] of versions) {
          if (vs.size > 1) {
            fail(
              'packages',
              `${CLOSURE_PATH}: "${k}" is declared at ${vs.size} versions (${[...vs].join(', ')}); the authority admits one`,
            )
          }
        }
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
      // BuildKit strips full-line comments INSIDE a continuation; the fold
      // must too, or a real instruction detaches at its first mid-block
      // comment and the tail's arguments escape every instruction scan.
      if (carry !== '' && /^\s*#/.test(raw)) continue
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
    if (lineage === 'gates-toolchain') {
      // Two inputs here were named by VERSION and fetched over the network,
      // which is a request, not a pin. Both are now artifacts.
      const runText = lines.filter((l) => /^RUN\s/i.test(l.trim())).join('\n')
      if (/\bcorepack\s+install\b/.test(runText)) {
        fail(
          'gates-toolchain',
          `"${name}": "corepack install" fetches a package manager named only by version; the tarball must be pinned by SHA-256 and installed offline`,
        )
      }
      if (/\buv\s+python\s+install\b/.test(runText)) {
        fail(
          'gates-toolchain',
          `"${name}": "uv python install" resolves an interpreter at build time; the CPython artifact must be pinned by SHA-256 like node and uv`,
        )
      }
      for (const pin of [
        'PNPM_SHA256',
        'PYTHON_VERSION',
        'PYTHON_SHA256_AMD64',
        'PYTHON_SHA256_ARM64',
      ]) {
        if (!new RegExp(`^ARG ${pin}=`, 'm').test(text)) {
          fail('gates-toolchain', `"${name}": ARG ${pin} is not declared; that input is unpinned`)
        } else if (!new RegExp(`\\$\\{?${pin}\\}?\\b`).test(runText)) {
          fail(
            'gates-toolchain',
            `"${name}": ARG ${pin} is declared but consumed by no RUN instruction; a pin nothing executes carries nothing`,
          )
        }
      }
      if (!/^ARG PYTHON_VERSION=\d+\.\d+\.\d+$/m.test(text)) {
        fail(
          'gates-toolchain',
          `"${name}": PYTHON_VERSION must be an exact MAJOR.MINOR.PATCH build; "3.13" is a range, not an artifact`,
        )
      }
      // The image's INVENTORY is a canonical machine-readable manifest
      // (toolchain.json beside the definition); its version pins mirror the
      // sources that RUN the gate. Both directions are enforced in the
      // ALWAYS-ON governance gate: every arg-proved manifest entry must be
      // declared by the definition (at the mirrored version where a source
      // is named), and every version ARG in the definition must be named by
      // the manifest — an unmanifested pin is inventory drift in the other
      // direction. Inferring a dependency inventory from shell text would be
      // fragile by construction; the manifest is the reviewed authority for
      // what the governed gate environment intentionally carries.
      const inventoryRel = entry.get('definition').replace(/Dockerfile$/, 'toolchain.json')
      const inventoryPath = join(root, inventoryRel)
      const pins = gatePins(root)
      if (!existsSync(inventoryPath)) {
        fail(
          'gates-toolchain',
          `"${name}": ${inventoryRel} is missing — the toolchain inventory is a manifest, not prose`,
        )
      } else if (pins === undefined) {
        fail(
          'gates-pin',
          `"${name}": the governed gate pins could not be derived from .github/workflows/checks.yml and package.json, so the toolchain mirror cannot be verified`,
        )
      } else {
        let tools
        try {
          tools = JSON.parse(readFileSync(inventoryPath, 'utf8')).tools
        } catch {
          tools = undefined
        }
        if (!Array.isArray(tools) || tools.length === 0) {
          fail('gates-toolchain', `"${name}": ${inventoryRel} must carry a non-empty "tools" list`)
        } else {
          const SOURCES = {
            'checks.yml NODE_VERSION': pins.node,
            'checks.yml UV_VERSION': pins.uv,
            'package.json packageManager': pins.pnpm,
          }
          // The proof vocabulary is CLOSED, and every proof type carries an
          // executed mechanism — "evidenced" means the same thing here as it
          // does for the runtime package: declaration + executed consumption,
          // never declaration alone.
          //   debian-base  carried by the digest-pinned external base; the
          //                FROM-pin rule is its proof.
          //   arg          the exact ARG declaration AND a RUN consuming it —
          //                a pin nothing executes carries nothing.
          //   uv-managed   an explicit "value" AND the literal
          //                `uv python install <value>` in a RUN.
          const PROOF_TYPES = new Set(['debian-base', 'arg', 'package-manifest'])
          const manifestArgs = new Set()
          for (const tool of tools) {
            if (
              typeof tool !== 'object' ||
              tool === null ||
              typeof tool.name !== 'string' ||
              typeof tool.provedBy !== 'string'
            ) {
              fail(
                'gates-toolchain',
                `"${name}": every ${inventoryRel} entry needs "name" and "provedBy"`,
              )
              continue
            }
            if (!PROOF_TYPES.has(tool.provedBy)) {
              fail(
                'gates-toolchain',
                `"${name}": inventory tool "${tool.name}" has unknown provedBy "${tool.provedBy}"; the proof vocabulary is closed (${[...PROOF_TYPES].join(', ')}) and an unproved entry never silently passes`,
              )
              continue
            }
            if (tool.provedBy === 'debian-base') continue
            if (tool.provedBy === 'package-manifest') {
              if (typeof tool.package !== 'string' || tool.package === '') {
                fail(
                  'gates-toolchain',
                  `"${name}": package-manifest tool "${tool.name}" needs an explicit "package" (the Debian package the manifest pins)`,
                )
                continue
              }
              const dir = entry.get('definition').replace(/\/Dockerfile$/, '')
              for (const pl of entry.get('platforms') ?? []) {
                const arch = String(pl).split('/')[1]
                const abs = join(root, `${dir}/packages.${arch}.manifest`)
                const present =
                  existsSync(abs) &&
                  readFileSync(abs, 'utf8')
                    .split('\n')
                    .some((row) => row.split(/\s+/)[2] === tool.package)
                if (!present) {
                  fail(
                    'gates-toolchain',
                    `"${name}": inventory tool "${tool.name}" claims package "${tool.package}", which ${dir}/packages.${arch}.manifest does not pin`,
                  )
                }
              }
              continue
            }
            if (tool.provedBy === 'uv-managed') {
              if (typeof tool.value !== 'string' || tool.value === '') {
                fail(
                  'gates-toolchain',
                  `"${name}": uv-managed tool "${tool.name}" needs an explicit "value" (the interpreter spec uv installs)`,
                )
              } else if (
                !lines.some(
                  (l) => /^RUN\s/i.test(l.trim()) && l.includes(`uv python install ${tool.value}`),
                )
              ) {
                fail(
                  'gates-toolchain',
                  `"${name}": inventory tool "${tool.name}" is uv-managed at ${tool.value}, but no RUN instruction performs \`uv python install ${tool.value}\``,
                )
              }
              continue
            }
            if (typeof tool.arg !== 'string' || !/^[A-Z0-9_]+$/.test(tool.arg)) {
              fail(
                'gates-toolchain',
                `"${name}": inventory tool "${tool.name}" needs an "arg" naming an uppercase ARG identifier`,
              )
              continue
            }
            manifestArgs.add(tool.arg)
            const declared = text.match(new RegExp(`^ARG ${tool.arg}=(.+)$`, 'm'))?.[1]
            if (declared === undefined) {
              fail(
                'gates-toolchain',
                `"${name}": inventory tool "${tool.name}" is proved by ARG ${tool.arg}, which the definition does not declare`,
              )
              continue
            }
            if (
              !lines.some(
                (l) => /^RUN\s/i.test(l.trim()) && new RegExp(`\\$\\{?${tool.arg}\\}?\\b`).test(l),
              )
            ) {
              fail(
                'gates-toolchain',
                `"${name}": ARG ${tool.arg} (tool "${tool.name}") is declared but consumed by no RUN instruction; a pin nothing executes carries nothing`,
              )
            }
            if (tool.versionSource !== undefined) {
              const expected = SOURCES[tool.versionSource]
              if (expected === undefined) {
                fail(
                  'gates-toolchain',
                  `"${name}": inventory tool "${tool.name}" names unknown versionSource "${tool.versionSource}"`,
                )
              } else if (declared !== expected) {
                fail(
                  'gates-pin',
                  `"${name}": ARG ${tool.arg}=${declared} does not mirror the governed gate (${tool.versionSource} declares ${expected})`,
                )
              }
            }
          }
          for (const m of text.matchAll(/^ARG ([A-Z0-9_]+_VERSION)=/gm)) {
            if (!manifestArgs.has(m[1])) {
              fail(
                'gates-toolchain',
                `"${name}": ARG ${m[1]} is not named by ${inventoryRel}; an unmanifested pin is inventory drift`,
              )
            }
          }
        }
      }
    }
    // --- the pinned package closure -----------------------------------------
    //
    // A version string names what was ASKED of the archive; a SHA-256 names
    // the bytes that came back. The live defect (#102) was that only the
    // top-level names were pinned, so the archive moved openssl 3.5.6 -> 3.5.7
    // beneath unchanged Dockerfiles and every image identity moved with it.
    //
    // deploy/images/debian-closure.lock.json is the ONE reviewed authority for
    // every Debian artifact any governed image installs. Each image carries a
    // projection of it -- packages.<arch>.manifest, the file the build
    // actually consumes -- and the two may not disagree.
    {
      const dir = entry.get('definition').replace(/\/Dockerfile$/, '')
      const platforms = entry.get('platforms') ?? []
      const arches = platforms.map((pl) => String(pl).split('/')[1]).filter((a) => a !== undefined)
      const runText = lines
        .filter((l) => /^RUN\s/i.test(l.trim()))
        .join('\n')
        .toLowerCase()
      const installsPackages = /\bapt(-get)?\s/.test(runText)

      // Dependency RESOLUTION is the defect. `apt-get download` fetches
      // exactly what it is told; `apt-get install` decides for itself what
      // else to bring, and what it decides depends on the day.
      if (/\bapt(-get)?\s+(-[^\s]+\s+)*install\b/.test(runText)) {
        fail(
          'packages',
          `"${name}": an apt install resolves dependencies at build time; the closure must be fetched by pinned artifact and verified against ${dir}/packages.<arch>.manifest`,
        )
      }
      // The checksum proof must be BOUND to the artifacts being installed.
      //
      // Requiring merely that some `sha256sum -c` appears is not enough: these
      // definitions legitimately checksum node, uv, pnpm, CPython and the
      // runtime tarballs, so a regression could delete the Debian verification
      // and still satisfy a bare presence check while installing unverified
      // .deb files. The chain below is proved end to end, in order, inside the
      // ONE instruction that downloads them:
      //
      //   selected manifest -> download specs -> count -> byte size
      //     -> checksum projection OF THAT MANIFEST -> sha256sum -c OF THAT
      //     -> dpkg --install of that same set
      if (installsPackages) {
        const flat = lines
          .filter((l) => /^RUN\s/i.test(l.trim()))
          .map((l) => l.replace(/\s+/g, ' '))
        const instruction = flat.find((l) => /apt-get download/.test(l))
        if (instruction === undefined) {
          fail(
            'packages',
            `"${name}": no RUN instruction downloads the selected artifacts with "apt-get download"; an apt that resolves is the defect this replaces`,
          )
        } else {
          const sums = SELECTED_SUMS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          // Each link names the selected manifest, so none of them can be
          // satisfied by an unrelated artifact's verification.
          const STEPS = [
            {
              key: 'specs',
              re: /apt-get download[^;]*\$\(awk '\{print \$3 "=" \$4\}' "\$\{manifest\}"\)/,
              why: 'the download specs must be read from the selected manifest, so only reviewed artifacts are fetched',
            },
            {
              key: 'count',
              // The manifest count is not proof by itself. The fetched .deb
              // count must be the left operand of the equality test.
              re: /\[\s*"\$\(ls -1 \*\.deb \| wc -l\)"\s*=\s*"\$\(wc -l < "\$\{manifest\}"\)"\s*\]/,
              why: 'the fetched artifact count must be compared with the selected manifest count',
            },
            {
              key: 'size',
              // The stat must feed the actual-vs-declared equality inside the
              // manifest-driven loop. A loop that only reads sizes is not a
              // byte-size proof.
              re: /while read -r sha size pkg ver name; do actual="\$\(stat -c %s "\$\{name\}"\)";\s*\[\s*"\$\{actual\}"\s*=\s*"\$\{size\}"\s*\][\s\S]*done < "\$\{manifest\}"/,
              why: 'the fetched byte size must be compared with the manifest declaration for every selected artifact',
            },
            {
              key: 'projection',
              // The instruction is whitespace-normalised before matching, so
              // the awk program's own separator is matched loosely.
              re: new RegExp(`awk '\\{print \\$1 "\\s*" \\$5\\}' "\\$\\{manifest\\}" > ${sums}`),
              why: `the checksum list must be projected FROM the selected manifest into ${SELECTED_SUMS}`,
            },
            {
              key: 'verify',
              re: new RegExp(`sha256sum -c ${sums}`),
              why: `the verification must name ${SELECTED_SUMS}; any other "sha256sum -c" verifies some other artifact`,
            },
            {
              key: 'install',
              re: /dpkg --install \$\(awk '\{print \$5\}' "\$\{manifest\}"\)/,
              why: 'dpkg must install exactly the selected set, read from the same manifest',
            },
          ]
          const at = {}
          for (const step of STEPS) {
            const m = step.re.exec(instruction)
            if (m === null) {
              fail(
                'packages',
                `"${name}": the package-manifest proof is broken at "${step.key}" — ${step.why}`,
              )
            } else {
              at[step.key] = m.index
            }
          }
          // Order matters as much as presence: verifying after installing
          // proves nothing about what was installed.
          const ORDER = [
            ['specs', 'projection'],
            ['projection', 'verify'],
            ['verify', 'install'],
          ]
          for (const [before, after] of ORDER) {
            if (at[before] !== undefined && at[after] !== undefined && at[before] >= at[after]) {
              fail(
                'packages',
                `"${name}": the package-manifest proof runs "${after}" before "${before}"; the selected artifacts must be verified before they are installed`,
              )
            }
          }
        }
      }

      if (installsPackages) {
        for (const arch of arches) {
          const rel = `${dir}/packages.${arch}.manifest`
          const abs = join(root, rel)
          if (!existsSync(abs)) {
            fail(
              'packages',
              `"${name}": ${rel} is missing -- the build consumes it by name, and the closure is a manifest, not prose`,
            )
            continue
          }
          const rows = readFileSync(abs, 'utf8')
            .trim()
            .split('\n')
            .filter((l) => l !== '')
          if (rows.length === 0) {
            fail('packages', `"${name}": ${rel} declares no artifacts`)
            continue
          }
          for (const row of rows) {
            const cols = row.split(/\s+/)
            if (cols.length !== 5) {
              fail(
                'packages',
                `"${name}": ${rel}: every line is "<sha256> <size> <package> <version> <filename>", found ${cols.length} column(s)`,
              )
              continue
            }
            const [sha, size, pkg, version, filename] = cols
            const declared = closureIndex.get(`${pkg} ${version}`)
            if (declared === undefined) {
              fail(
                'packages',
                `"${name}": ${rel}: ${pkg}=${version} is not in ${CLOSURE_PATH} -- the build would consume an artifact no review covers`,
              )
              continue
            }
            const match = declared.find((a) => a.filename === filename)
            if (match === undefined) {
              fail(
                'packages',
                `"${name}": ${rel}: ${CLOSURE_PATH} declares no "${filename}" for ${pkg}=${version}`,
              )
              continue
            }
            // Projection agreement: the file the BUILD reads must carry
            // exactly what the file REVIEW reads.
            if (match.sha256 !== sha || String(match.size) !== size) {
              fail(
                'packages',
                `"${name}": ${rel}: "${filename}" does not match ${CLOSURE_PATH} -- the verified set and the reviewed set have drifted`,
              )
            }
            if (match.architecture !== 'all' && match.architecture !== arch) {
              fail(
                'packages',
                `"${name}": ${rel}: "${filename}" is architecture "${match.architecture}" but appears in the ${arch} projection`,
              )
            }
          }
        }
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
        ? (providerFamilies.find((f) =>
            f.some((t) =>
              token(t).test(`${runtime.get('name')} ${runtime.get('package')}`.toLowerCase()),
            ),
          ) ?? [])
        : []
    for (const t of providerTokens) {
      if (owned.includes(t)) continue
      if (token(t).test(text))
        fail('neutrality', `"${name}": definition carries provider/framework token "${t}"`)
    }
    for (const t of contentIsolationTokens) {
      if (token(t).test(text))
        fail('neutrality', `"${name}": definition carries isolation-runtime token "${t}"`)
    }

    if (lineage === 'runner-derived' && isMap(runtime)) {
      // The explicit runtime installation declaration, consumed by both this
      // checker and the build definition: exact ARG names, exact lock
      // values, and at least one RUN instruction that actually CONSUMES the
      // package variable. Text presence proves a mention; a declaration
      // nothing executes installs nothing — the review's ARG-only and
      // comment-only fixtures both pass a mention test and both must fail.
      // The claim, precisely: the registered identity flows into an executed
      // build instruction. Whether that instruction semantically installs is
      // proven by the governed build itself (the wiring assertion runs the
      // installed runtime), never by static text.
      const version = runtime.get('version')
      const versionEscaped = String(version).replaceAll('.', '\\.')
      if (!new RegExp(`^ARG RUNTIME_VERSION=${versionEscaped}$`, 'm').test(text)) {
        fail(
          'runtime-pin',
          `"${name}": definition must declare ARG RUNTIME_VERSION=${version} (the lock's runtime.version)`,
        )
      }
      if (!text.includes(`io.secure-home.runtime.version="${version}"`)) {
        fail('runtime-pin', `"${name}": runtime version label does not match the lock (${version})`)
      }
      const registeredPackage = runtime.get('package')
      if (typeof registeredPackage === 'string') {
        const packageEscaped = registeredPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (!new RegExp(`^ARG RUNTIME_PACKAGE=${packageEscaped}$`, 'm').test(text)) {
          fail(
            'runtime-pin',
            `"${name}": definition must declare ARG RUNTIME_PACKAGE=${registeredPackage} (the lock's runtime.package)`,
          )
        } else if (
          !lines.some((l) => /^RUN\s/i.test(l.trim()) && /\$\{?RUNTIME_PACKAGE\}?\b/.test(l))
        ) {
          fail(
            'runtime-pin',
            `"${name}": no RUN instruction consumes \${RUNTIME_PACKAGE}; a declaration nothing executes installs nothing`,
          )
        }
      }
      // The VERSION must flow into an executed instruction for the same
      // reason as the package: a literal version beside a decorative ARG
      // would let the declared pin and the installed bytes drift apart
      // (found live by mutation PA-MUT-10 at L7 — the package-only rule
      // passed a definition whose every ${RUNTIME_VERSION} use had been
      // replaced by a literal).
      if (!lines.some((l) => /^RUN\s/i.test(l.trim()) && /\$\{?RUNTIME_VERSION\}?\b/.test(l))) {
        fail(
          'runtime-pin',
          `"${name}": no RUN instruction consumes \${RUNTIME_VERSION}; the registered version must flow into the executed install, not sit beside it as a literal`,
        )
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
      const declared = t.match(/^(ENV|ARG)\s+(.+)$/i)
      if (declared) {
        // EVERY declared key, not the first: `ENV SAFE=1 API_KEY=x` is one
        // instruction with two keys, and only inspecting the first was a
        // bypass. ARG takes one name; ENV takes many (and a legacy
        // space-separated single pair).
        const keys = []
        if (declared[1].toUpperCase() === 'ARG') {
          keys.push(declared[2].trim().split('=')[0].trim())
        } else if (!declared[2].includes('=')) {
          keys.push(declared[2].trim().split(/\s+/)[0])
        } else {
          for (const m of declared[2].matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g)) {
            keys.push(m[1])
          }
        }
        for (const key of keys) {
          if (CREDENTIAL_NAME.test(key)) {
            fail(
              'credential-shape',
              `"${name}": ${key} is a credential-shaped ENV/ARG name; images carry no credential handling`,
            )
          }
        }
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
    const rel = file.slice(root.length).replace(/^\//, '')
    // The identity a profile actually consumes is runtime.image_digest — a
    // digest, not a name. The digest scan is therefore the primary inertness
    // rule (searched by bare hex, so `sha256:<hex>`, `@sha256:<hex>`, and an
    // unprefixed spelling all refuse); the name scan stays as defense in
    // depth for prose references.
    for (const identity of lockedIdentities) {
      if (content.includes(identity.slice('sha256:'.length))) {
        fail(
          'profile-reference',
          `${rel} references locked image identity ${identity}; L5 images are inert and no profile may pin one`,
        )
      }
    }
    for (const name of byName.keys()) {
      if (content.includes(name)) {
        fail(
          'profile-reference',
          `${rel} references "${name}"; L5 images are inert and no profile may point at one`,
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
