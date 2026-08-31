import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const clientRoot = path.resolve('dist/client');

const requireFile = async (relativePath, minimumBytes = 1) => {
  const target = path.join(clientRoot, relativePath);
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size < minimumBytes) {
    throw new Error(`${relativePath} must be a file of at least ${minimumBytes} bytes.`);
  }
  return target;
};

const manifestPath = await requireFile('manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const exactFields = {
  name: 'Goalflow',
  short_name: 'Goalflow',
  display: 'standalone',
  start_url: '/',
  scope: '/'
};
for (const [field, expected] of Object.entries(exactFields)) {
  if (manifest[field] !== expected) {
    throw new Error(`manifest.webmanifest ${field} must be ${JSON.stringify(expected)}; received ${JSON.stringify(manifest[field])}.`);
  }
}

if (!Array.isArray(manifest.icons)) throw new Error('manifest.webmanifest icons must be an array.');
for (const [src, sizes] of [['/icons/icon-192.png', '192x192'], ['/icons/icon-512.png', '512x512']]) {
  const declared = manifest.icons.find(icon => icon?.src === src && icon?.sizes === sizes && icon?.type === 'image/png');
  if (!declared) throw new Error(`manifest.webmanifest must declare ${src} as ${sizes} image/png.`);
  await requireFile(src.replace(/^\//, ''), 100);
}

await requireFile('index.html', 100);
await requireFile('sw.js', 100);

const javascriptFiles = [];
const collectJavascript = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectJavascript(target);
    else if (entry.name.endsWith('.js')) javascriptFiles.push(target);
  }
};
await collectJavascript(clientRoot);

const javascript = (await Promise.all(javascriptFiles.map(file => readFile(file, 'utf8')))).join('\n');
for (const forbidden of ['__storageService', '__STORES', '123456']) {
  if (javascript.includes(forbidden)) {
    throw new Error(`Production client bundle contains forbidden test-only marker ${forbidden}.`);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  manifest: exactFields,
  requiredIcons: 2,
  javascriptFiles: javascriptFiles.length,
  testBackdoors: 'absent'
}));
