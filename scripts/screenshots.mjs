import { chromium } from 'playwright';
import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, '../src/content/tools');
const screenshotsDir = join(__dirname, '../public/screenshots');

export function parseFrontmatter(content) {
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

// Screenshots are committed to the repo. Existing ones are kept — that is what
// keeps the HSBI-internal tools working, since a GitHub runner cannot reach them.
export async function generateScreenshots({ log = console } = {}) {
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

  const pending = [];
  for (const tool of tools) {
    if (force) {
      pending.push(tool);
      continue;
    }
    try {
      await access(join(screenshotsDir, `${tool.id}.jpg`));
      log.info(`  skip ${tool.id} (cached)`);
    } catch {
      pending.push(tool);
    }
  }

  if (pending.length === 0) {
    log.info('Screenshots up to date.');
    return { generated: [], failed: [] };
  }

  log.info(`Generating screenshots for ${pending.length} tool(s)...`);

  const browser = await chromium.launch();
  const generated = [];
  const failed = [];

  for (const { id, url } of pending) {
    const outPath = join(screenshotsDir, `${id}.jpg`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    try {
      // 'load' waits for every subresource and times out on slow sites, which
      // loses an otherwise usable shot — settle on the DOM instead.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });
      generated.push(id);
      log.info(`  ok ${id}`);
    } catch (err) {
      failed.push(id);
      log.warn(`  failed ${id} (${url}): ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  log.info(`Screenshots done: ${generated.length} generated, ${failed.length} failed.`);
  return { generated, failed };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  generateScreenshots().catch(err => { console.error(err); process.exit(1); });
}
