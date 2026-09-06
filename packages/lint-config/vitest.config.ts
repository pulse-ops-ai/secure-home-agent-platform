import { definePackageConfig } from '@secure-home/testing/vitest'

export default definePackageConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
