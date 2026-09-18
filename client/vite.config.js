import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/* Ports de test imposes par l'environnement :
   - client Vite : 40071
   - API Express : 40007 (proxy /api et /ws) */
const API_TARGET = 'http://localhost:40007';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 40071,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      /* Collaboration temps reel : le WebSocket est proxifie comme l'API,
         sinon la poignee de main /ws echouerait en dev. */
      '/ws': {
        target: API_TARGET.replace('http://', 'ws://'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
