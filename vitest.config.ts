import { defineConfig } from 'vitest/config'

// Core tests are pure (encoder + SVG geometry produce strings/arrays) → node env.
// PDF fidelity is checked in the headless-browser live check, not here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
