import { definePackageConfig } from './vitest.base.js'

export default definePackageConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
