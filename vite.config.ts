import { defineConfig } from 'vite'

// Relative base so the built app works on any path / custom domain.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
})
