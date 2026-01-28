import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
    // Fix for Capacitor packages in Vite
    mainFields: ['module', 'main', 'jsnext:main', 'jsnext'],
  },
  build: {
    commonjsOptions: {
      include: [/@capacitor-community\/background-geolocation/, /node_modules/]
    }
  }
})
