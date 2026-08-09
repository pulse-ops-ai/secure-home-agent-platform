/**
 * Schema machinery — the PURE slice only. The artifact catalog is safe on
 * the runtime import graph; the renderer (`generation.ts`, needs Prettier)
 * and the identity-ledger guard (`ledger-history.ts`, build/CI tooling)
 * are deliberately NOT re-exported here or from the package index (D8:
 * the package's only runtime dependency is Zod).
 */
export { artifactPath, CONTRACT_ARTIFACTS, contractUrn } from './contract-artifacts.js'
export type { ContractArtifact } from './contract-artifacts.js'
