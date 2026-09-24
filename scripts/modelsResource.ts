/**
 * Downloads asset zips from The Models Resource (https://models.spriters-resource.com/).
 *
 * The site sits behind a Cloudflare check that plain scripted requests often fail. When that happens, the
 * download falls back to driving the installed Chrome or Edge (via puppeteer-core): a browser window opens,
 * passes the check like a normal visit, and fetches the zips from inside the page.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Browser, Page } from 'puppeteer-core';

export const SITE = 'https://models.spriters-resource.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const isZip = (d: Uint8Array) => d[0] === 0x50 && d[1] === 0x4b;
const isChallenge = (html: string) => /<title>Just a moment/i.test(html);

let browser: Browser | null = null;
let page: Page | null = null;

/** Download the zip behind an asset page such as `/wii/mkwii/asset/310115/`. */
export async function download(path: string): Promise<Uint8Array> {
  if (!page) {
    const direct = await downloadDirect(path);
    if (direct) return direct;
    console.log('The site asked for a browser check, so continuing in a Chrome window…');
  }
  return downloadWithBrowser(path);
}

/** Close the browser if a download needed one. */
export async function finish() {
  await browser?.close();
  browser = page = null;
}

/** Plain HTTP. Returns null when Cloudflare blocks it. */
async function downloadDirect(path: string): Promise<Uint8Array | null> {
  const url = SITE + path;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  if (isChallenge(html)) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const file = /data-file="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!file) throw new Error(`${url}: no download link found`);
  // The media server only serves the zip to a browser session that has visited the asset page.
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const zip = await fetch(SITE + file, { headers: { 'User-Agent': UA, Referer: url, Cookie: cookie } });
  const data = new Uint8Array(await zip.arrayBuffer());
  if (!zip.ok || !isZip(data)) return null;
  return data;
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome or Edge is needed to get past the site\'s browser check. Set CHROME_PATH to its executable.');
  return found;
}

async function downloadWithBrowser(path: string): Promise<Uint8Array> {
  if (!page) {
    const puppeteer = (await import('puppeteer-core')).default;
    // A visible window: Cloudflare's check doesn't pass in headless mode.
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: false,
      defaultViewport: null,
      userDataDir: join(tmpdir(), 'kart-racer-models-resource'),
      // The check fails browsers that announce they're automated.
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--no-first-run', '--no-default-browser-check', '--window-size=900,700', '--disable-blink-features=AutomationControlled'],
      protocolTimeout: 600_000,
    });
    page = (await browser.pages())[0] ?? (await browser.newPage());
  }
  const url = SITE + path;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  // Wait out the check (it reloads the page when it passes).
  await page.waitForSelector('[data-file]', { timeout: 120_000 }).catch(() => {});
  const b64 = await page
    .evaluate(async () => {
      const file = document.querySelector('[data-file]')?.getAttribute('data-file');
      if (!file) return null;
      const res = await fetch(file);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    })
    .catch(() => null);
  if (!b64) throw new Error(`${url}: no download link found (is the browser check still showing?)`);
  const data = new Uint8Array(Buffer.from(b64, 'base64'));
  if (!isZip(data)) throw new Error(`${url}: download was not a zip file`);
  return data;
}
