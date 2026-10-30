import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const guideNames = [
  'SmartWater_VSCode_Git_Guide.pdf',
  'SmartWater_Development_Guide.pdf'
];
const guidePath = name => join(projectRoot, 'docs', name);

// The PDFs in docs/ are the only guide copies maintained by students.
// Serve them directly during development; Vite bundles HTML-linked PDFs for production.
function studentGuides() {
  return {
    name: 'student-guides-from-docs',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (!pathname.startsWith('/docs/')) return next();
        const name = decodeURIComponent(pathname.slice('/docs/'.length));
        if (!guideNames.includes(name)) return next();
        try {
          const pdf = readFileSync(guidePath(name));
          response.setHeader('Content-Type', 'application/pdf');
          response.setHeader('Content-Length', pdf.length);
          response.setHeader('Cache-Control', 'no-store');
          response.end(pdf);
        } catch (error) {
          next(error);
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [studentGuides()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { index: join(projectRoot, 'index.html'), app: join(projectRoot, 'app.html') } }
  }
});
