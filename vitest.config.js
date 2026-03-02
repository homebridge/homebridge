import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**'],
    },
    pool: 'threads',
    testTimeout: 10000,
  },
})
