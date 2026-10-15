/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'A Dois — finanças do casal',
        short_name: 'A Dois',
        description: 'Finanças compartilhadas para casais',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#14532D',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só o "casco" do app vai para o cache. Dados financeiros nunca são
        // servidos do cache: sem conexão, o app avisa em vez de mostrar números velhos.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Só as fontes latinas vão para o cache offline; as demais o navegador
        // baixa sob demanda (unicode-range) se algum texto precisar.
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
