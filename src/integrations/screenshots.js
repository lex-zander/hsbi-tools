import { chromium } from 'playwright';
import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fm[key] = value;
  }
  return fm;
}

export default function screenshotsIntegration() {
  return {
    name: 'tool-screenshots',
    hooks: {
      'astro:build:start': async ({ logger }) => {
        const root = process.cwd();
        const toolsDir = join(root, 'src/content/tools');
        const screenshotsDir = join(root, 'public/screenshots');
        const force = process.env.SCREENSHOTS_FORCE === '1';

        await mkdir(screenshotsDir, { recursive: true });

        const files = (await readdir(toolsDir)).filter(f => f.endsWith('.md'));
        const tools = [];

        for (const file of files) {
          const id = basename(file, '.md');
          const content = await readFile(join(toolsDir, file), 'utf-8');
          const fm = parseFrontmatter(content);
          if (fm.url) tools.push({ id, url: fm.url });
        }

        logger.info(`Generating screenshots for ${tools.length} tools...`);

        let browser = null;

        for (const { id, url } of tools) {
          const outPath = join(screenshotsDir, `${id}.jpg`);

          if (!force) {
            try {
              await access(outPath);
              logger.info(`  skip ${id} (cached)`);
              continue;
            } catch {}
          }

          try {
            if (!browser) browser = await chromium.launch();
            const page = await browser.newPage();
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.goto(url, { waitUntil: 'load', timeout: 12000 });
            await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });
            await page.close();
            logger.info(`  ok ${id}`);
          } catch (err) {
            logger.warn(`  failed ${id} (${url}): ${err.message}`);
          }
        }

        if (browser) await browser.close();
        logger.info('Screenshots done.');
      },
    },
  };
}
