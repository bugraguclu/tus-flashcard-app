import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { fileURLToPath } from 'node:url';

const websiteTsconfig = fileURLToPath(new URL('./tsconfig.json', import.meta.url));

// Static marketing & product site for TusAnkiM.
// Sitemap is served by src/pages/sitemap.xml.ts (consistent trailing-slash URLs and git lastmod).
// Tailwind runs via PostCSS (postcss.config.mjs + src/styles/tailwind.css) cleanly on Astro 7.
export default defineConfig({
  site: 'https://tusankim.com',
  output: 'static',
  integrations: [],
  compressHTML: true,
  server: { host: true },
  vite: {
    // Pin Vite 8 / Rolldown / Oxc to website/tsconfig.json so standalone builds never walk up into root Expo tsconfig.json.
    tsconfig: websiteTsconfig,
    resolve: {
      tsconfigPaths: false,
    },
    build: {
      // Keep esbuild CSS minifier so paired standard + -webkit-backdrop-filter / mask rules are preserved.
      cssMinify: 'esbuild',
      rolldownOptions: {
        tsconfig: websiteTsconfig,
      },
    },
  },
  markdown: {
    processor: satteri({ features: { smartPunctuation: false } }),
  },
});
