import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor a host-assigned port (e.g. preview harness) when provided.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
