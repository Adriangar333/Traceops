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
      "socket.io-client": "socket.io-client/dist/socket.io.js",
    },
    // Fix for Capacitor packages in Vite
    mainFields: ['module', 'main', 'jsnext:main', 'jsnext'],
  },
  build: {
    commonjsOptions: {
      include: [/@capacitor-community\/background-geolocation/, /node_modules/]
    },
    rollupOptions: {
      // Mark Capacitor plugins as external for web builds
      // These are only available at runtime on native platforms
      external: [
        '@capacitor/geolocation',
        '@capacitor/local-notifications',
        '@capacitor-community/background-geolocation'
      ],
      output: {
        // Provide empty modules for external dependencies
        globals: {
          '@capacitor/geolocation': 'CapacitorGeolocation',
          '@capacitor/local-notifications': 'CapacitorLocalNotifications',
          '@capacitor-community/background-geolocation': 'BackgroundGeolocation'
        }
      }
    }
  }
})
