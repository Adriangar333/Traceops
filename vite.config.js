import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Plugin to provide empty stubs for Capacitor modules in web builds
function capacitorStubPlugin() {
  const capacitorModules = [
    '@capacitor/geolocation',
    '@capacitor/local-notifications',
    '@capacitor-community/background-geolocation'
  ];

  return {
    name: 'capacitor-stub',
    resolveId(id) {
      if (capacitorModules.includes(id)) {
        return id; // Mark as resolved
      }
      return null;
    },
    load(id) {
      if (capacitorModules.includes(id)) {
        // Return empty stub module
        return `
          export const Geolocation = { 
            watchPosition: () => Promise.resolve(null),
            getCurrentPosition: () => Promise.resolve(null),
            checkPermissions: () => Promise.resolve({ location: 'denied' }),
            requestPermissions: () => Promise.resolve({ location: 'denied' }),
            clearWatch: () => Promise.resolve()
          };
          export const LocalNotifications = {
            schedule: () => Promise.resolve()
          };
          export default {};
        `;
      }
      return null;
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    capacitorStubPlugin(), // Must be first
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
      "socket.io-client": "socket.io-client/dist/socket.io.js",
    },
    mainFields: ['module', 'main', 'jsnext:main', 'jsnext'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/]
    }
  }
})
