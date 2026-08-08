/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any sub-path. GitHub Pages serves a project
  // site from /<repo>/ rather than the domain root, and absolute '/assets/...' URLs would
  // 404 there — the classic "deployed site is a blank page" failure. Relative paths also
  // survive renaming the repo, which a hardcoded '/ascii-forge/' base would not.
  // Safe here only because the app has no client-side router.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
