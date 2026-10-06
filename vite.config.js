import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/alarmsounds/**'],
    },
    proxy: {
      '/api/pagasa-weather': {
        target: 'https://pagasa.dost.gov.ph',
        changeOrigin: true,
        rewrite: () => '/api/NearestAWS',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('Accept', 'application/json, text/javascript, */*; q=0.01');
            proxyRequest.setHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            proxyRequest.setHeader('Origin', 'https://pagasa.dost.gov.ph');
            proxyRequest.setHeader('Referer', 'https://pagasa.dost.gov.ph/');
            proxyRequest.setHeader('Sec-Fetch-Dest', 'empty');
            proxyRequest.setHeader('Sec-Fetch-Mode', 'cors');
            proxyRequest.setHeader('Sec-Fetch-Site', 'same-origin');
            proxyRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.250 Safari/537.36');
            proxyRequest.setHeader('X-Requested-With', 'XMLHttpRequest');
          });
        },
      },
      '/api/earthquake-bulletin': {
        target: 'https://earthquake.phivolcs.dost.gov.ph',
        changeOrigin: true,
        rewrite: (requestPath) => {
          const bulletinPath = new URL(requestPath, 'http://localhost').searchParams.get('path');
          if (!bulletinPath || !/^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.html$/.test(bulletinPath)) {
            return '/';
          }
          return bulletinPath;
        },
      },
      '/api/earthquake-map': {
        target: 'https://earthquake.phivolcs.dost.gov.ph',
        changeOrigin: true,
        rewrite: (requestPath) => {
          const imagePath = new URL(requestPath, 'http://localhost').searchParams.get('path');
          if (!imagePath || !/^\/\d{4}_Earthquake_Information\/[A-Za-z]+\/\d{4}(?:_\d{4})?_\d{4,}_B1F?\.jpg$/.test(imagePath)) {
            return '/';
          }
          return imagePath;
        },
      },
    },
  },
});
