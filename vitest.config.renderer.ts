import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/renderer/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.renderer.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.{ts,tsx}'],
      exclude: ['src/renderer/main.tsx', 'src/renderer/types/**']
    }
  }
})
