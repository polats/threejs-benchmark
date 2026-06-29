import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, posix, relative, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import showcases from '../showcases.config.mjs';

const ROOT = resolve('public/external-showcases');
const id = process.argv[2];
const showcase = showcases.find((item) => item.id === id);

if (!showcase) {
  console.error(`Usage: npm run showcase:scrape -- <id>\nAvailable: ${showcases.map((item) => item.id).join(', ')}`);
  process.exit(1);
}

function outputPath(rawUrl) {
  const url = new URL(rawUrl);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (!extname(pathname)) pathname += '.html';
  const safePath = pathname
    .split('/')
    .map((part) => part.replaceAll(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');
  const query = url.search
    ? `.${createHash('sha1').update(url.search).digest('hex').slice(0, 10)}`
    : '';
  const extension = extname(safePath);
  const withQuery = query ? `${safePath.slice(0, -extension.length)}${query}${extension}` : safePath;
  return resolve(ROOT, showcase.id, 'sites', url.host, `.${withQuery}`);
}

function isText(contentType, file) {
  return /(?:text|javascript|json|xml|svg|css)/i.test(contentType) ||
    /\.(?:html?|css|m?js|json|svg)$/i.test(file);
}

function localReference(fromFile, toFile) {
  let path = relative(dirname(fromFile), toFile).replaceAll('\\', '/');
  if (!path.startsWith('.')) path = `./${path}`;
  return path;
}

function publicReference(toFile, directory = false) {
  const path = relative(resolve('public'), toFile).replaceAll('\\', '/');
  return `/${path}${directory && !path.endsWith('/') ? '/' : ''}`;
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  ...(executablePath ? { executablePath } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const captured = new Map();

page.on('response', async (response) => {
  const request = response.request();
  if (request.method() !== 'GET' || !response.ok()) return;
  const url = response.url();
  if (!/^https?:/.test(url)) return;
  try {
    const capture = {
      body: await response.body(),
      contentType: response.headers()['content-type'] ?? '',
    };
    captured.set(url, capture);
    let redirectedRequest = request;
    while (redirectedRequest) {
      captured.set(redirectedRequest.url(), capture);
      redirectedRequest = redirectedRequest.redirectedFrom();
    }
  } catch (error) {
    console.warn(`Skipped ${url}: ${error.message}`);
  }
});

try {
  await page.goto(showcase.url, { waitUntil: 'networkidle', timeout: 120_000 });
  if (showcase.readySelector) {
    await page.locator(showcase.readySelector).waitFor({ state: 'visible', timeout: 120_000 });
  }
  await mkdir(resolve(ROOT, showcase.id), { recursive: true });
  await page.screenshot({ path: resolve(ROOT, showcase.id, 'preview.png') });
} finally {
  await browser.close();
}

const destination = resolve(ROOT, showcase.id);
await rm(resolve(destination, 'sites'), { recursive: true, force: true });
const paths = new Map([...captured.keys()].map((url) => [url, outputPath(url)]));
const replacementMap = new Map(paths);
for (const [remote, target] of paths) {
  const url = new URL(remote);
  let remoteDirectory = new URL('.', url).href;
  let targetDirectory = dirname(target);
  while (new URL(remoteDirectory).pathname !== '/') {
    if (!replacementMap.has(remoteDirectory)) {
      replacementMap.set(remoteDirectory, `${targetDirectory}/`);
    }
    remoteDirectory = new URL('..', remoteDirectory).href;
    targetDirectory = dirname(targetDirectory);
  }
}
const replacements = [...replacementMap.entries()].sort(([a], [b]) => b.length - a.length);

for (const [url, response] of captured) {
  const file = paths.get(url);
  let body = response.body;
  if (isText(response.contentType, file)) {
    let text = body.toString('utf8');
    const current = new URL(url);
    for (const [remote, target] of replacements) {
      const remoteUrl = new URL(remote);
      const directory = target.endsWith('/');
      const local = publicReference(target, directory);
      text = text.replaceAll(remote, local);
      text = text.replaceAll(`//${remoteUrl.host}${remoteUrl.pathname}${remoteUrl.search}`, local);
      if (remoteUrl.origin === current.origin && remoteUrl.pathname !== '/') {
        const rootPath = `${remoteUrl.pathname}${remoteUrl.search}`;
        text = text.replaceAll(`"${rootPath}`, `"${local}`);
        text = text.replaceAll(`'${rootPath}`, `'${local}`);
        text = text.replaceAll(`\`${rootPath}`, `\`${local}`);
        text = text.replaceAll(`(${rootPath}`, `(${local}`);
      }
    }
    body = Buffer.from(text);
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
}

const sourceEntry = paths.get(showcase.url) ?? paths.get(new URL(showcase.url).href);
if (!sourceEntry) throw new Error(`The entry document was not captured: ${showcase.url}`);

const entry = localReference(resolve(destination, 'index.html'), sourceEntry);
const wrapper = `<!doctype html><meta charset="utf-8"><title>${showcase.label}</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}body{background:#05060d}</style><iframe src="${entry}" title="${showcase.label}"></iframe>`;
await writeFile(resolve(destination, 'index.html'), wrapper);
await writeFile(
  resolve(destination, 'capture.json'),
  `${JSON.stringify({ ...showcase, capturedAt: new Date().toISOString(), resources: captured.size }, null, 2)}\n`,
);

console.log(`Captured ${captured.size} resources to ${posix.join('public/external-showcases', showcase.id)}`);
