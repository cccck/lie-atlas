#!/usr/bin/env node
// Headless smoke test for Lie Atlas routes.
//
//   node scripts/smoke.mjs                      # all routes (home + every module)
//   node scripts/smoke.mjs so3 loops            # selected routes
//   node scripts/smoke.mjs su2 --chaos          # also fuzz the controls (sliders, buttons, selects, drags)
//   node scripts/smoke.mjs su2 --theme=light    # light theme (default: dark)
//   node scripts/smoke.mjs su2 --wait=4000      # let animations run longer before the screenshot
//   node scripts/smoke.mjs su2 --width=420 --height=900   # narrow/mobile layout check
//   node scripts/smoke.mjs su2 --url=http://localhost:5173  # use a running dev server
//   node scripts/smoke.mjs su2 --click="Rotate 4π" --wait=3000  # click a button by its text first
//   node scripts/smoke.mjs su2 --full           # full-page screenshot (includes the notes)
//
// If --url is not given it uses http://localhost:5173 when that serves Lie Atlas, otherwise it starts
// a private Vite dev server on a free port. Screenshots go to ./screenshots/<route>[.<tag>].png.
// Exit code 1 when any page error / console error / failed request / overflow is found.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
let routes = args.filter((a) => !a.startsWith('--'));

const WAIT = Number(flags.wait ?? 1800);
const WIDTH = Number(flags.width ?? 1440);
const HEIGHT = Number(flags.height ?? 900);
const THEME = flags.theme === 'light' ? 'light' : 'dark';
const OUT = path.resolve(ROOT, flags.out ?? 'screenshots');
const TAG = flags.tag ? '.' + flags.tag : flags.chaos ? '' : '';

function findBrowser() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return cands.find((p) => fs.existsSync(p));
}

async function isAtlas(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const txt = await r.text();
    return txt.includes('Lie Atlas');
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function main() {
  const { modules, hidden } = await import(pathToFileURL(path.join(ROOT, 'src/registry.js')).href);
  const allIds = ['home', ...modules.map((m) => m.id)];
  if (!routes.length) routes = allIds;
  const unknown = routes.filter((r) => r !== 'home' && !modules.some((m) => m.id === r) && !hidden.some((m) => m.id === r));
  if (unknown.length) console.warn('Unknown routes (will still try):', unknown.join(', '));

  let base = flags.url;
  let server = null;
  if (!base) {
    if (await isAtlas('http://127.0.0.1:5173/')) base = 'http://127.0.0.1:5173';
    else if (await isAtlas('http://localhost:5173/')) base = 'http://localhost:5173';
    else {
      const { createServer } = await import('vite');
      const port = await freePort();
      server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port, strictPort: true, hmr: false }, logLevel: 'error' });
      await server.listen();
      base = `http://localhost:${port}`;
      console.log(`(started private Vite server at ${base})`);
    }
  }
  base = base.replace(/\/$/, '');

  const exe = findBrowser();
  if (!exe) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');
  const puppeteer = (await import('puppeteer-core')).default;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lie-smoke-'));
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    userDataDir,
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check', `--window-size=${WIDTH},${HEIGHT}`],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
  });
  fs.mkdirSync(OUT, { recursive: true });

  let failures = 0;
  const report = [];
  for (const id of routes) {
    const res = await testRoute(browser, base, id);
    report.push(res);
    const bad = res.pageErrors.length + res.consoleErrors.length + res.failedRequests.length + (res.overflow ? 1 : 0) + (res.ready ? 0 : 1);
    if (bad) failures++;
    const status = bad ? 'FAIL' : 'ok  ';
    console.log(`${status} ${id.padEnd(12)} ready=${res.ready ? 'yes' : 'NO '} mount=${res.mountMs}ms  canvases=${res.canvases} webgl=${res.webgl}  shot=${path.relative(ROOT, res.shot)}`);
    for (const e of res.pageErrors) console.log(`     page error: ${e}`);
    for (const e of res.consoleErrors) console.log(`     console.error: ${e}`);
    for (const e of res.consoleWarnings.slice(0, 5)) console.log(`     console.warn: ${e}`);
    for (const e of res.failedRequests) console.log(`     request failed: ${e}`);
    if (res.overflow) console.log(`     horizontal overflow: scrollWidth=${res.overflow}px > ${WIDTH}px`);
    if (res.chaos) {
      console.log(`     chaos: ${res.chaos.actions} actions; errors after chaos: ${res.chaos.errors}${res.chaos.tabs ? '' : '  shot=' + path.relative(ROOT, res.chaos.shot)}`);
      for (const t of res.chaos.tabs || []) console.log(`       tab "${t.tab}": errors=${t.errors}  shot=${path.relative(ROOT, t.shot)}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (server) await server.close();
  console.log(failures ? `\n${failures} route(s) with problems.` : '\nAll routes clean.');
  process.exit(failures ? 1 : 0);
}

async function testRoute(browser, base, id) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && (e.stack || e.message || e)).split('\n').slice(0, 4).join(' | ')));
  page.on('console', (m) => {
    const t = m.type();
    const text = m.text();
    if (/Download the React DevTools|\[vite\]|GPU stall|WebGL: too many|Automatic fallback to software WebGL|SwiftShader|GroupMarkerNotSet/i.test(text)) return;
    if (t === 'error') consoleErrors.push(text.slice(0, 400));
    else if (t === 'warning' || t === 'warn') consoleWarnings.push(text.slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('/@vite/') || u.includes('__vite_ping') || r.failure()?.errorText === 'net::ERR_ABORTED') return;
    failedRequests.push(`${u} (${r.failure()?.errorText})`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('favicon')) failedRequests.push(`${r.url()} → HTTP ${r.status()}`);
  });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]);
  const url = `${base}/#/${id === 'home' ? '' : id}`;
  const t0 = Date.now();
  let ready = false;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction((rid) => window.__lie && window.__lie.ready === rid, { timeout: 30000 }, id);
    ready = true;
  } catch (e) {
    pageErrors.push('did not become ready: ' + e.message);
  }
  const mountMs = Date.now() - t0;
  if (flags.click) {
    const label = String(flags.click);
    await page.evaluate((txt) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes(txt));
      if (b) b.click();
      else console.warn('[smoke] no button with text ' + txt);
    }, label);
  }
  await sleep(WAIT);
  const info = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    let webgl = 0;
    for (const c of canvases) {
      try {
        if (c.getContext('webgl2') || c.getContext('webgl')) webgl++;
      } catch {
        /* 2d canvas */
      }
    }
    return {
      canvases: canvases.length,
      webgl,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      appErrors: (window.__lie && window.__lie.errors) || [],
      empty: [...document.querySelectorAll('.view')].filter((v) => v.getBoundingClientRect().height < 50).length,
    };
  });
  for (const e of info.appErrors) if (!pageErrors.some((p) => p.includes(String(e).slice(0, 40)))) pageErrors.push('app: ' + String(e).split('\n')[0]);
  const shot = path.join(OUT, `${id}${flags.theme === 'light' ? '.light' : ''}${WIDTH < 800 ? '.narrow' : ''}${TAG}.png`);
  await page.screenshot({ path: shot, fullPage: !!flags.full });

  let chaos = null;
  if (flags.chaos && ready) chaos = await runChaos(page, id, pageErrors, consoleErrors);

  await page.close();
  return {
    id,
    ready,
    mountMs,
    canvases: info.canvases,
    webgl: info.webgl,
    overflow: info.scrollWidth > info.innerWidth + 1 ? info.scrollWidth : 0,
    pageErrors,
    consoleErrors,
    consoleWarnings,
    failedRequests,
    shot,
    chaos,
  };
}

// Chaos = fuzz every control and drag on every canvas. Modules with page tabs (ui.pageTabs) are fuzzed
// one tab at a time: the tab is opened first, then its own controls are exercised, so buttons inside
// every tab get pressed (clicking the tab strip itself would swap the content away mid-run).
async function runChaos(page, id, pageErrors, consoleErrors) {
  const before = pageErrors.length + consoleErrors.length;
  const tabLabels = await page.evaluate(() => {
    const bar = document.querySelector('.module-root .tabs');
    return bar ? [...bar.querySelectorAll('[role=tab]')].map((b) => b.textContent.trim()) : [];
  });
  const tabs = tabLabels.length ? tabLabels.map((label, i) => ({ i, label })) : [null];
  let actions = 0;
  const perTab = [];
  for (const tab of tabs) {
    const e0 = pageErrors.length + consoleErrors.length;
    if (tab) {
      await page.evaluate((i) => document.querySelector('.module-root .tabs').querySelectorAll('[role=tab]')[i].click(), tab.i);
      await sleep(700);
    }
    actions += await fuzzControls(page);
    actions += await dragCanvases(page);
    await sleep(800);
    const shot = path.join(OUT, `${id}${tab ? '.tab' + (tab.i + 1) : ''}.chaos.png`);
    await page.screenshot({ path: shot });
    perTab.push({ tab: tab ? tab.label : null, errors: pageErrors.length + consoleErrors.length - e0, shot });
  }
  const after = pageErrors.length + consoleErrors.length;
  return { actions, errors: after - before, shot: perTab[perTab.length - 1].shot, tabs: tabLabels.length ? perTab : null };
}

// sliders, toggles, selects, segmented buttons, buttons: every control of the current content, twice
async function fuzzControls(page) {
  let actions = 0;
  for (let round = 0; round < 2; round++) {
    actions += await page.evaluate(async (round) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let n = 0;
      const rand = (() => {
        let s = 12345 + round * 777;
        return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      })();
      const scopeEl = document.querySelector('.module-root') || document.body;
      const pageTabBar = scopeEl.querySelector('.tabs');
      for (const r of scopeEl.querySelectorAll('input[type=range]')) {
        if (r.disabled) continue;
        const min = Number(r.min), max = Number(r.max);
        for (const v of [min, max, min + (max - min) * rand()]) {
          r.value = String(v);
          r.dispatchEvent(new Event('input', { bubbles: true }));
          r.dispatchEvent(new Event('change', { bubbles: true }));
          n++;
          await sleep(15);
        }
      }
      for (const c of scopeEl.querySelectorAll('input[type=checkbox]')) {
        c.click();
        n++;
        await sleep(20);
      }
      for (const s of scopeEl.querySelectorAll('select')) {
        for (const o of [...s.options]) {
          s.value = o.value;
          s.dispatchEvent(new Event('change', { bubbles: true }));
          n++;
          await sleep(40);
        }
      }
      const btns = [...scopeEl.querySelectorAll('button')].filter(
        (b) => !b.disabled && b.offsetParent !== null && !b.dataset.smokeSkip && !(pageTabBar && pageTabBar.contains(b)),
      );
      for (const b of btns) {
        if (!b.isConnected) continue;
        b.click();
        n++;
        await sleep(60);
      }
      return n;
    }, round);
    await sleep(300);
  }
  return actions;
}

// pointer drags across every visible canvas (handles, orbit, pan) + wheel zoom
async function dragCanvases(page) {
  let actions = 0;
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.module-root canvas')]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 40 && r.height > 40 && r.top < window.innerHeight)
      .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
  );
  for (const b of boxes) {
    for (let k = 0; k < 4; k++) {
      const x0 = b.x + b.w * (0.2 + 0.6 * ((k * 37) % 10) / 10);
      const y0 = b.y + b.h * (0.2 + 0.6 * ((k * 53) % 10) / 10);
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let s = 1; s <= 8; s++) await page.mouse.move(x0 + s * 9 * (k % 2 ? 1 : -1), y0 + s * 6);
      await page.mouse.up();
      actions++;
    }
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.wheel({ deltaY: -240 });
    await page.mouse.wheel({ deltaY: 120 });
    actions++;
  }
  return actions;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
