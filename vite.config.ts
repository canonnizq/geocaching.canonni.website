import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr";
import { defineConfig } from 'vite'
import { localApi } from './scripts/local-api.mjs'

// https://vite.dev/config/
export default defineConfig({
  // localApi serves the card images and the cache API that the Vercel function
  // runs in production, so development and preview need no generated files.
  plugins: [react(), svgr(), localApi()],
})