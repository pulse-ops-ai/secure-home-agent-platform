import { z } from 'zod'

/** Exact semantic revision, e.g. "1.0.0". */
export const SemVer = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'exact semver')
