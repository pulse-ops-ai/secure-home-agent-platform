import { z } from 'zod'

/**
 * Credential reference: an environment-variable NAME. There is no field in
 * any runner contract designated for credential-value transport.
 */
export const CredentialRef = z.strictObject({
  env_var: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'environment-variable name'),
})

export type CredentialRefT = z.infer<typeof CredentialRef>
