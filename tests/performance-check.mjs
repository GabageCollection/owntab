// Production extension startup measurement. Always uses an isolated bookmark profile.
// pnpm build && node tests/performance-check.mjs
// OWNTAB_EXT can select an isolated experimental build without changing installed extensions.
// OWNTAB_PERF_MODE=reload|new-tab|cold-worker; samples >= 2; count > 0.
// DOM/frame markers are proxies, not browser TTI or input-latency measurements.
import { chromium } from 'playwright-core';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const extension = resolve(process.env.OWNTAB_EXT ?? '.output/chrome-mv3');
const samples = Number(process.env.OWNTAB_PERF_SAMPLES ?? 12);
const count = Number(process.env.OWNTAB_PERF_COUNT ?? 200);
const mode = process.env.OWNTAB_PERF_MODE ?? 'reload';
assert(Number.isInteger(samples) && samples >= 2, 'at least two samples are required');
assert(Number.isInteger(count) && count > 0, 'bookmark count must be positive');
assert(['reload', 'new-tab', 'cold-worker'].includes(mode));
const output = resolve(process.env.OWNTAB_PERF_OUTPUT ?? 'artifacts/performance/baseline.json');
const profile = await mkdtemp(join(tmpdir(), 'owntab-perf-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.OWNTAB_CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  headless: false,
  viewport: { width: 1440, height: 900 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--no-default-browser-check'],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(async count => {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0].children.find(n => n.id === '1') ?? tree[0].children[0];
    for (const node of root.children ?? []) {
      if (node.url) await chrome.bookmarks.remove(node.id);
      else await chrome.bookmarks.removeTree(node.id);
    }
    for (let i = 0; i < count; i++) {
      await chrome.bookmarks.create({ parentId: root.id, title: `性能样本 ${i + 1}`, url: `https://example.com/perf/${i}` });
    }
    await chrome.storage.local.set({ settings: { theme: 'light', rootId: root.id } });
    // Finish the bookmark event batch before measuring navigation.
    await new Promise(resolve => setTimeout(resolve, 150));
  }, count);
  await context.addInitScript(({ count }) => {
    if (location.protocol !== 'chrome-extension:') return;
    const metrics = window.__owntabPerf = { calls: [], longTasks: [], ready: null, frameReady: null };
    const record = (owner, name, label) => {
      const original = owner[name];
      owner[name] = function (...args) {
        const call = { kind: label, action: args[0]?.action, start: performance.now(), end: null };
        metrics.calls.push(call);
        const promise = Reflect.apply(original, owner, args);
        return promise.then(value => { call.end = performance.now(); return value; }, error => { call.end = performance.now(); throw error; });
      };
    };
    record(chrome.storage.local, 'get', 'storage');
    record(chrome.runtime, 'sendMessage', 'message');
    new PerformanceObserver(list => metrics.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
    const observer = new MutationObserver(() => {
      if (document.querySelectorAll('.bookmark-card').length !== count || document.querySelector('.skeleton')) return;
      const link = document.querySelector('.bookmark-card .card-link');
      if (!link?.getAttribute('href') || document.querySelector('.status-bar[aria-busy="true"]')) return;
      metrics.ready = performance.now();
      metrics.bookmarks = document.querySelectorAll('.bookmark-card').length;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => { metrics.frameReady = performance.now(); }));
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { count });
  const controlPage = await context.newPage();
  const cdp = await context.newCDPSession(controlPage);
  await cdp.send('ServiceWorker.enable');
  let page;
  const observations = [];
  for (let i = 0; i < samples; i++) {
    if (mode !== 'reload' || !page) {
      if (page) await page.close();
      if (mode === 'cold-worker') await cdp.send('ServiceWorker.stopAllWorkers');
      page = await context.newPage();
    }
    const start = performance.now();
    if (i === 0 || mode !== 'reload') await page.goto(`chrome-extension://${extensionId}/newtab.html`, { waitUntil: 'domcontentloaded' });
    else await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Number.isFinite(window.__owntabPerf?.frameReady));
    const wallMs = performance.now() - start;
    const result = await page.evaluate(() => ({
      ...window.__owntabPerf,
      paints: performance.getEntriesByType('paint').map(e => ({ name: e.name, start: e.startTime })),
      navigation: performance.getEntriesByType('navigation').map(e => ({ responseEnd: e.responseEnd, domInteractive: e.domInteractive, domContentLoaded: e.domContentLoadedEventEnd })),
      resources: performance.getEntriesByType('resource').filter(e => /\.(js|css)$/.test(e.name)).map(e => ({ name: e.name.split('/').at(-1), start: e.startTime, end: e.responseEnd, duration: e.duration })),
      domNodes: document.querySelectorAll('*').length,
      images: { total: document.images.length, loaded: [...document.images].filter(i => i.complete).length },
    }));
    assert.equal(result.bookmarks, count);
    assert(result.calls.some(c => c.action === 'tree'), 'instrumentation must observe real bookmark request');
    observations.push({ sample: i + 1, wallMs, ...result });
  }
  const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const pick = q => Number(sorted[Math.ceil(q * sorted.length) - 1].toFixed(1));
    return { min: pick(1 / sorted.length), median: pick(.5), p95: pick(.95), max: pick(1) };
  };
  const summarize = rows => Object.fromEntries(['wallMs', 'ready', 'frameReady'].map(key => [key, stats(rows.map(r => r[key]))]));
  const report = {
    environment: { browser: context.browser().version(), viewport: '1440x900', bookmarks: count, samples, mode, extension },
    // New profile; the worker is warm from seeding unless explicitly stopped.
    summary: summarize(observations),
    firstNavigation: observations[0],
    subsequentSummary: summarize(observations.slice(1)),
    observations,
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.environment, summary: report.summary, subsequentSummary: report.subsequentSummary }, null, 2));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
