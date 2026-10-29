import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works from any folder (CrazyGames upload, file hosting)
  build: { target: 'es2019', chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.js'] },
});
