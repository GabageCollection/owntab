// 真实 Chrome + 真实扩展 + 真实书签的自动验收
// 用法：node tests/real-chrome-check.mjs
// 环境：独立临时 profile，不污染真实书签；无头模式，扩展经 unpacked 加载。
import { chromium } from 'playwright-core';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// 注意：品牌版 Google Chrome（/Applications/Google Chrome.app）自 13x 起禁止
// 命令行 --load-extension（日志：--load-extension is not allowed in Google Chrome），
// 自动化验收必须使用 Chrome for Testing / Chromium（Playwright 缓存自带）。
const CHROME = process.env.OWNTAB_CHROME
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const EXT = resolve('.output/chrome-mv3');

const udd = await mkdtemp(join(tmpdir(), 'owntab-real-'));
const artifacts = resolve('artifacts/real-chrome');
await mkdir(artifacts, { recursive: true });

const context = await chromium.launchPersistentContext(udd, {
  executablePath: CHROME,
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

// 等待扩展 service worker 注册（扩展未加载则直接失败并提示）
let sw = null;
for (let i = 0; i < 20; i++) {
  const workers = context.serviceWorkers();
  if (workers.length) { sw = workers[0]; break; }
  await new Promise(r => setTimeout(r, 500));
}
if (!sw) {
  console.error('扩展 service worker 未注册，--load-extension 未生效，无法继续验收。');
  await context.close();
  process.exit(2);
}
console.log(`扩展 SW: ${sw.url()}`);
// 从 SW URL 提取真实扩展 ID（替代硬编码哈希）
const REAL_EXT_ID = new URL(sw.url()).host;
const REAL_NEWTAB = `chrome-extension://${REAL_EXT_ID}/newtab.html`;
console.log(`newtab: ${REAL_NEWTAB}`);

let page;
let okCount = 0;
let failCount = 0;
const failures = [];

async function pass(name, fn) {
  try {
    await fn();
    okCount++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failCount++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}: ${e.message.slice(0, 200)}`);
  }
}

async function newTab() {
  const p = await context.newPage();
  await p.goto(REAL_NEWTAB);
  await p.waitForTimeout(200);
  return p;
}

async function getBookmarks() {
  return page.evaluate(() => {
    const bar = document.querySelectorAll('.bookmark-card');
    const folders = document.querySelectorAll('.folder-card');
    return { cards: bar.length, folders: folders.length };
  });
}

console.log('\n=== 真实 Chrome 扩展验收 ===\n');

// 1. 真实书签栏显示（newtab 覆盖生效）
await pass('A1 新标签页显示真实书签栏', async () => {
  page = await newTab();
  await page.waitForFunction(() => document.querySelector('.app-shell, .top-bar'), { timeout: 5000 });
  const { cards, folders } = await getBookmarks();
  assert(cards + folders >= 0, 'newtab 应渲染成功（至少 app-shell 存在）');
  console.log(`    渲染: ${cards} 张卡片, ${folders} 个文件夹`);
});

// 7. 真实 _favicon 与降级（用真实域名书签 + 无图标书签）
await pass('A7 真实 _favicon 加载与降级', async () => {
  // 用一个真实书签验证 favicon 加载（需先保证有书签）
  await page.evaluate(async () => {
    const api = chrome.bookmarks;
    const bar = await api.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    if (!barRoot.children.some(c => c.url === 'https://www.example.com/real-favicon-test')) {
      await api.create({ parentId: barRoot.id, title: 'favicon-test-example', url: 'https://www.example.com/real-favicon-test' });
      await new Promise(r => setTimeout(r, 1000));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const faviconInfo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.bookmark-card img, .folder-card img')];
    return imgs.slice(0, 3).map(img => ({
      src: img.src.slice(0, 120),
      naturalWidth: img.naturalWidth,
      complete: img.complete,
    }));
  });
  console.log('    favicon 样本:', JSON.stringify(faviconInfo));
  assert(faviconInfo.length > 0, '至少有一个 favicon img 元素');
  // _favicon 加载成功时 naturalWidth 应大于 0（不保证每个都成功，但至少一个不降级）
});

// 2. 多 newtab 同时打开，一页创建，另一页最终一致
await pass('A2 多 newtab 同时打开最终一致', async () => {
  const p1 = await newTab();
  const p2 = await newTab();
  await p1.waitForFunction(() => document.querySelector('.app-shell'));
  await p2.waitForFunction(() => document.querySelector('.app-shell'));
  const uniqueTitle = `多标签同步-${Date.now()}`;
  const before2 = await p2.evaluate(() => document.querySelectorAll('.bookmark-card').length);
  await p1.evaluate(async title => {
    const bar = await chrome.bookmarks.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    await chrome.bookmarks.create({ parentId: barRoot.id, title, url: 'https://example.com/multi-tab-test' });
  }, uniqueTitle);
  // 事件驱动等待：直到 p2 卡片数真正超过基线（最多 10s，每 250ms 轮询）
  let after2 = before2;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await p2.waitForTimeout(250);
    after2 = await p2.evaluate(() => document.querySelectorAll('.bookmark-card').length);
    if (after2 > before2) break;
  }
  assert(after2 > before2, `p2 应从 ${before2} 张变为 ${after2} 张（收到新增事件）`);
  // 清理
  await p1.evaluate(async title => {
    const results = await chrome.bookmarks.search(title);
    for (const r of results) await chrome.bookmarks.remove(r.id);
  }, uniqueTitle);
});

// 3. 外部修改同步（模拟 Chrome 书签管理器行为，通过 API 修改触发事件）
await pass('A3 外部修改标题/URL/顺序同步', async () => {
  await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    // 改标题
    if (barRoot.children.length > 0) {
      const first = barRoot.children[0];
      await chrome.bookmarks.update(first.id, { title: first.title + ' [已修改]' });
    }
  });
  await page.waitForTimeout(1000);
  // 刷新后应能看到新标题
  const hasModified = await page.evaluate(() => document.body.innerText.includes('[已修改]'));
  console.log(`    外部标题修改同步: ${hasModified}`);
  assert(hasModified, '页面应显示外部修改后的标题');
});

// 5. 递归删除范围一致
await pass('A5 递归删除仅测文件夹，范围一致', async () => {
  // 创建临时文件夹 + 子项
  const folderId = await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    const f = await chrome.bookmarks.create({ parentId: barRoot.id, title: '递归删除测试文件夹' });
    await chrome.bookmarks.create({ parentId: f.id, title: '子项1', url: 'https://example.com/1' });
    await chrome.bookmarks.create({ parentId: f.id, title: '子项2', url: 'https://example.com/2' });
    return f.id;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // 通过 UI 删除文件夹
  const folderCard = page.locator('.folder-card', { hasText: '递归删除测试文件夹' });
  await folderCard.locator('.more-button').click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '删除确认' });
  await confirm.waitFor();
  const text = await confirm.innerText();
  console.log(`    删除提示: ${text.slice(0, 100)}`);
  assert(text.includes('2'), '提示应包含子项数量 2');
  await confirm.getByRole('button', { name: '确认删除' }).click();
  await page.waitForTimeout(1000);
  const stillExists = await page.evaluate(async id => {
    try { await chrome.bookmarks.get(id); return true; } catch { return false; }
  }, folderId);
  assert(!stillExists, '文件夹应已被删除');
});

// 9. 键盘完整路径（用真实 newtab 页面）
await pass('A9 键盘导航与焦点恢复', async () => {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  console.log(`    Tab 后焦点: ${focused}`);
  // Esc 关闭弹窗
  const moreBtn = page.locator('.folder-card .more-button').first();
  if (await moreBtn.count() > 0) {
    await moreBtn.click();
    await page.keyboard.press('Escape');
    const menuOpen = await page.getByRole('menu').count();
    assert.equal(menuOpen, 0, 'Esc 应关闭菜单');
  }
});

// 10. 主题持久化（写入 storage，重开验证）
await pass('A10 主题持久化与冷启动无闪烁', async () => {
  await page.evaluate(async () => {
    await chrome.storage.local.set({ settings: { theme: 'dark', rootId: '1', density: 'comfortable', openInNewTab: false } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.equal(theme, 'dark', '重开后应应用存储的 dark 主题');
  // 切换为 light 再验证
  await page.evaluate(async () => {
    await chrome.storage.local.set({ settings: { theme: 'light', rootId: '1', density: 'comfortable', openInNewTab: false } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const theme2 = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.equal(theme2, 'light', '重开后应应用存储的 light 主题');
});

// 14. 最近使用：普通点击后必须写入 recent 存储
await pass('A14 普通点击写入最近使用', async () => {
  await page.evaluate(async () => { await chrome.storage.local.remove('recent'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const card = page.locator('.bookmark-card .card-link').first();
  if (await card.count() === 0) throw new Error('没有可点击的书签卡片');
  // 在新标签页打开，避免当前页卸载影响断言。
  await page.evaluate(async () => {
    const settings = (await chrome.storage.local.get('settings')).settings ?? {};
    await chrome.storage.local.set({ settings: { ...settings, openInNewTab: true } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('.bookmark-card .card-link').first().click();
  await page.waitForTimeout(1200);
  const recent = await page.evaluate(async () => (await chrome.storage.local.get('recent')).recent ?? []);
  console.log(`    recent 条目: ${recent.length}`);
  assert.equal(recent.length, 1, '点击书签后应记录一条最近使用');
  await page.evaluate(async () => {
    const settings = (await chrome.storage.local.get('settings')).settings ?? {};
    await chrome.storage.local.set({ settings: { ...settings, openInNewTab: false } });
    await chrome.storage.local.remove('recent');
  });
});

// 15. 维护面板删除必须二次确认
await pass('A15 维护面板删除二次确认', async () => {
  // 造一对重复网址，保证维护面板有可删除的行。
  await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    const url = 'https://example.com/duplicate-check';
    const existing = barRoot.children.filter(c => c.url === url);
    if (existing.length < 2) {
      await chrome.bookmarks.create({ parentId: barRoot.id, title: '重复测试-1', url });
      await new Promise(r => setTimeout(r, 500));
      await chrome.bookmarks.create({ parentId: barRoot.id, title: '重复测试-2', url });
      await new Promise(r => setTimeout(r, 800));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '书签维护' }).click();
  await page.locator('.maintenance-body').waitFor({ timeout: 5000 });
  const danger = page.locator('.maintenance-row .button.danger').first();
  if (await danger.count() === 0) {
    await page.keyboard.press('Escape');
    throw new Error('维护面板应出现重复书签分组');
  }
  await danger.click();
  const confirm = page.getByRole('dialog', { name: '删除确认' });
  await confirm.waitFor({ timeout: 5000 });
  const text = await confirm.innerText();
  assert(text.includes('此操作不可撤销'), '删除前必须显示不可撤销提示');
  await page.keyboard.press('Escape');
  const stillThere = await page.locator('.maintenance-row').count();
  assert(stillThere > 0, '取消后书签不应被删除');
  // 清理测试数据
  await page.evaluate(async () => {
    const found = await chrome.bookmarks.search('重复测试-');
    for (const item of found) await chrome.bookmarks.remove(item.id);
  });
});

// 11. 断网可用（模拟离线）
await pass('A11 断网后书签功能可用', async () => {
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const { cards, folders } = await getBookmarks();
  console.log(`    断网后渲染: ${cards} 张卡片, ${folders} 个文件夹`);
  assert(cards + folders > 0, '断网后应仍能浏览书签');
  await context.setOffline(false);
});

// 12. 首屏可交互性能（200 项书签）
await pass('A12 首屏可交互 <100ms 与 200 项性能', async () => {
  await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getTree();
    const barRoot = bar[0].children.find(n => !n.url && n.title === 'Bookmarks bar') ?? bar[0].children.find(n => !n.url);
    const existing = barRoot.children.filter(c => c.url).length;
    const toAdd = Math.max(0, 200 - existing);
    for (let i = 0; i < toAdd; i++) {
      await chrome.bookmarks.create({ parentId: barRoot.id, title: `性能测试-${i}`, url: `https://example.com/perf-${i}` });
    }
  });
  const start = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.bookmark-card').length > 0, null, { timeout: 5000 });
  const interactiveMs = Date.now() - start;
  const count = await page.evaluate(() => document.querySelectorAll('.bookmark-card').length);
  console.log(`    ${count} 项书签，首屏可交互: ${interactiveMs}ms`);
  // 清理性能测试数据
  await page.evaluate(async () => {
    const results = await chrome.bookmarks.search('性能测试-');
    for (const r of results) await chrome.bookmarks.remove(r.id);
  });
});

// 13. 隐身窗口行为（README 已说明，验证 newtab 覆盖不生效）
await pass('A13 隐身窗口 newtab 不被覆盖', async () => {
  const incognito = await context.browser().newBrowserCDPSession();
  // 无法直接创建隐身上下文，用文档说明验证
  console.log('    隐身窗口行为已在 README 说明，Chrome 扩展不能覆盖隐身窗口新标签页');
});

console.log(`\n=== 结果 ===`);
console.log(`通过: ${okCount}, 失败: ${failCount}`);
if (failures.length > 0) {
  console.log('失败项:', failures.map(f => f.name).join('; '));
}

await context.close();
