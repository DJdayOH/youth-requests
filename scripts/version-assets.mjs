import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const page = new URL('index.html', root);
let html = await readFile(page, 'utf8');
for (const [file, attribute] of [['style.css', 'href'], ['app.js', 'src']]) {
  const content = await readFile(new URL(file, root));
  const version = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const pattern = new RegExp(`${attribute}="${file.replace('.', '\\.')}([?][^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`Missing ${file} reference in index.html`);
  html = html.replace(pattern, `${attribute}="${file}?v=${version}"`);
}
await writeFile(page, html);
