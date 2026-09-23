import { defineConfig } from 'vitest/config'

// Standalone config: the app's vite.config.ts loads the TanStack Start and
// nitro plugins, which keep the Vitest process alive after tests finish.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
