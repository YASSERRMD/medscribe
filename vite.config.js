import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    // Remove COOP/COEP headers - they block HuggingFace model downloads
    // These headers are only needed for WebGPU with shared memory
    // Whisper works fine on WASM without them
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  preview: {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
