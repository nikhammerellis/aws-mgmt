import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/main/**/__tests__/**/*.test.ts',
      'src/shared/**/__tests__/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/main/index.ts']
    }
  }
})
