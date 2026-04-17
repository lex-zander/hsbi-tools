import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, '../src/content/tools');
const statusFile = join(__dirname, '../src/data/status.json');

async function fetchStatus(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    // Some servers reject HEAD — fall through to GET on 405
    if (res.status === 405) throw new Error('HEAD not allowed');
    return res.status;
  } catch {
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      return res.status;
    } catch {
      return null;
    }
  }
}

function parseUrl(content) {
  const match = content.match(/^url:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

async function main() {
  const files = (await readdir(toolsDir)).filter(f => f.endsWith('.md'));
  const existing = JSON.parse(await readFile(statusFile, 'utf-8').catch(() => '{}'));
  const checkedAt = new Date().toISOString();
  const result = {};

  await Promise.all(files.map(async (file) => {
    const id = file.replace(/\.md$/, '');
    const content = await readFile(join(toolsDir, file), 'utf-8');
    const url = parseUrl(content);

    if (!url) {
      result[id] = existing[id] ?? { statusCode: null, checkedAt };
      return;
    }

    const statusCode = await fetchStatus(url);
    result[id] = { statusCode, checkedAt };
    console.log(`${id}: ${statusCode ?? 'unreachable'}`);
  }));

  await writeFile(statusFile, JSON.stringify(result, null, 2) + '\n');
  console.log('Done:', checkedAt);
}

main().catch(err => { console.error(err); process.exit(1); });
