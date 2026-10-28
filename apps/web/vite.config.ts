import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          'motion-vendor': ['framer-motion', 'framer-motion-3d'],
          'ui-vendor': ['lucide-react', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
