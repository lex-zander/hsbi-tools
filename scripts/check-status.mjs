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
    // Some servers reject HEAD outright — fall through to GET for those.
    // 404 is not in this list: it is a real answer, not a rejected method.
    if ([403, 405, 501].includes(res.status)) throw new Error('HEAD not allowed');
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

function parseField(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'));
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
    const url = parseField(content, 'url');
    const internal = parseField(content, 'internal') === 'true';

    if (!url) {
      result[id] = existing[id] ?? { statusCode: null, checkedAt };
      return;
    }

    // Tools behind the HSBI network are unreachable from a GitHub runner —
    // checking them would report every one of them as down.
    if (internal) {
      result[id] = { statusCode: null, skipped: true, checkedAt };
      console.log(`${id}: skipped (internal)`);
      return;
    }

    const statusCode = await fetchStatus(url);
    result[id] = { statusCode, checkedAt };
    console.log(`${id}: ${statusCode ?? 'unreachable'}`);
  }));

  // Keep the file key-stable so the diff stays readable between runs.
  const sorted = Object.fromEntries(Object.keys(result).sort().map(k => [k, result[k]]));

  await writeFile(statusFile, JSON.stringify(sorted, null, 2) + '\n');
  console.log('Done:', checkedAt);
}

main().catch(err => { console.error(err); process.exit(1); });
