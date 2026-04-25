// @ts-check
import { defineConfig } from 'astro/config';
import screenshotsIntegration from './src/integrations/screenshots.js';

// https://astro.build/config
export default defineConfig({
    integrations: [screenshotsIntegration()],
    vite: {
        css: {
            transformer: "lightningcss",
            lightningcss: {
                drafts: {
                    customMedia: true,
                },
            },
        },
    },
});
