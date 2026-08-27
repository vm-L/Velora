import { defineConfig } from 'vite'
import path from 'path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) {
              return 'codemirror';
            }
            if (id.includes('hls.js')) {
              return 'hls';
            }
            if (id.includes('dexie')) {
              return 'dexie';
            }
            if (id.includes('vue') || id.includes('vue-router')) {
              return 'vue-vendor';
            }
          }
        }
      }
    }
  }
})
