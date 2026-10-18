import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.output/chrome-mv3');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) throw Error('Invalid asset path');
    const data = await readFile(path);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] ?? 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let count = 20;
    let settings = { theme: 'light', rootId: '1', density: 'comfortable', openInNewTab: false };
    const listeners = [];
    const longTitle = '这是一个很长的标题用于检查截断和布局边界'.repeat(20);
    const children = () => count === 0 ? [] : [
      { id: '10', parentId: '1', title: '设计资源 ' + longTitle, children: [
        { id: '11', parentId: '10', title: '子文件夹', children: [
          { id: '12', parentId: '11', title: '孙文件夹', children: [] },
          { id: '13', parentId: '11', title: '嵌套书签', url: 'https://example.com/nested' },
        ] },
      ] },
      { id: '14', parentId: '1', title: '其他资源', children: [] },
      ...Array.from({ length: count }, (_, i) => ({
        id: String(20 + i), parentId: '1', title: i === 0 ? longTitle : '常用网站 ' + (i + 1),
        url: i === 0 ? 'https://' + 'very-long-hostname-'.repeat(3) + 'example.com/path' : 'https://example.com/path/' + i,
      })),
    ];
    const tree = () => [{ id: '0', title: '', children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', children: children() },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ] }];
    const find = (nodes, id) => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const nested = find(node.children ?? [], id);
        if (nested) return nested;
      }
    };
    window.__failStorage = false;
    window.__storageGets = 0;
    window.__getSettings = () => ({ ...settings });
    window.__setCount = value => {
      count = value;
      listeners.forEach(fn => fn({ scope: 'owntab-changed', all: true, parentIds: [] }));
    };
    window.__themeChanges = [];
    // Observe the document because an init script may precede creation of <html>.
    // oldValue preserves every intermediate theme even when mutations share a batch.
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'data-theme') {
          if (record.oldValue !== null) window.__themeChanges.push(record.oldValue);
          window.__themeChanges.push(record.target.getAttribute('data-theme'));
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'], attributeOldValue: true });
    window.chrome = {
      runtime: {
        getURL: () => 'http://127.0.0.1/missing-icon',
        onMessage: { addListener: fn => listeners.push(fn), removeListener: fn => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } },
        sendMessage: async req => {
          if (req.action === 'tree') return { ok: true, data: tree() };
          if (req.action === 'children') return { ok: true, data: find(tree(), req.id)?.children ?? [] };
          if (req.action === 'create') return { ok: false, error: '模拟 API 失败，输入应保留' };
          return { ok: true, data: null };
        },
      },
      storage: {
        local: {
          get: async () => { window.__storageGets++; return { settings: { ...settings } }; },
          set: async value => {
            if (window.__failStorage) throw Error('模拟存储失败');
            settings = { ...value.settings };
          },
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/newtab.html`);
  await page.locator('.bookmark-card').first().waitFor();
  const boot = await page.evaluate(() => ({ themes: window.__themeChanges, gets: window.__storageGets, theme: document.documentElement.dataset.theme }));
  assert.equal(boot.theme, 'light', 'saved light must override system dark at boot');
  assert.equal(boot.gets, 1, 'bootstrap and App must share one storage.get');
  const firstLight = boot.themes.indexOf('light');
  assert(firstLight >= 0, 'observer must capture the initial light theme');
  assert(!boot.themes.slice(firstLight + 1).includes('dark'), `dark theme observed after saved light: ${boot.themes}`);

  await mkdir('artifacts', { recursive: true });
  const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 800, height: 900 }, { width: 390, height: 900 }];
  for (const count of [0, 1, 20, 200]) {
    await page.evaluate(n => window.__setCount(n), count);
    await page.waitForFunction(n => document.querySelectorAll('.bookmark-card').length === n && document.querySelectorAll('.folder-card').length === (n ? 2 : 0), count);
    if (!count) await page.getByRole('heading', { name: '留一点空间，给新的发现' }).waitFor();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.mouse.move(0, 0);
      const problems = await page.evaluate(({ width, count }) => {
        const failures = [];
        const tolerance = 0.75;
        const contained = (outer, inner) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
        const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
        if (document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth) failures.push('horizontal overflow');
        const grids = [...document.querySelectorAll('.grid')];
        if (grids.length !== (count ? 2 : 0)) failures.push('unexpected grid count');
        for (const grid of grids) {
          const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          if (columns !== (width >= 900 ? 4 : width >= 600 ? 3 : 2)) failures.push(`grid has ${columns} columns`);
        }
        const cards = [...document.querySelectorAll('.bookmark-card, .folder-card')];
        const rects = cards.map(card => card.getBoundingClientRect());
        cards.forEach((card, i) => {
          const rect = rects[i];
          const bookmark = card.classList.contains('bookmark-card');
          if (Math.abs(rect.height - (bookmark ? 72 : 48)) > tolerance) failures.push(`card ${i} height ${rect.height}`);
          const title = card.querySelector('.card-title');
          const titleStyle = getComputedStyle(title);
          const titleRect = title.getBoundingClientRect();
          if (bookmark && titleRect.height > 2 * parseFloat(titleStyle.lineHeight) + tolerance) failures.push(`card ${i} title exceeds two lines`);
          const more = card.querySelector('.more-button').getBoundingClientRect();
          if (!contained(rect, more)) failures.push(`card ${i} more button outside card`);
          if (overlaps(more, titleRect)) failures.push(`card ${i} more button overlaps title layout`);
          for (const text of card.querySelectorAll('.card-copy, .card-title, .card-domain, .count')) {
            const textRect = text.getBoundingClientRect();
            if (!contained(rect, textRect)) failures.push(`card ${i} ${text.className} outside card`);
            // Long text may have a larger intrinsic content box; the painted text
            // must be clipped by its own box or a contained .card-copy ancestor.
            const style = getComputedStyle(text);
            if ((text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1) && style.overflow !== 'hidden' && getComputedStyle(text.closest('.card-copy')).overflow !== 'hidden') failures.push(`card ${i} text content escapes clipping`);
          }
          const domain = card.querySelector('.card-domain');
          if (domain) {
            const domainStyle = getComputedStyle(domain);
            if (domainStyle.whiteSpace !== 'nowrap' || domain.getBoundingClientRect().height > parseFloat(domainStyle.lineHeight) + tolerance) failures.push(`card ${i} domain wraps`);
          }
          for (let j = i + 1; j < rects.length; j++) if (overlaps(rect, rects[j])) failures.push(`cards ${i}/${j} overlap`);
        });
        return failures;
      }, { width: viewport.width, count });
      assert.deepEqual(problems, [], `${count} bookmarks at ${viewport.width}x${viewport.height}: ${problems.join('; ')}`);
    }
  }

  await page.evaluate(() => window.__setCount(20));
  await page.waitForFunction(() => document.querySelectorAll('.bookmark-card').length === 20);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'artifacts/light.png', fullPage: true });
  const folderMore = page.locator('.folder-card').first().locator('.more-button');
  const focusFailures = [];
  const focused = async locator => {
    const result = await locator.evaluate(element => ({
      focused: element === document.activeElement,
      expected: element.getAttribute('aria-label') ?? element.textContent,
      actual: document.activeElement?.outerHTML.slice(0, 300),
    }));
    if (!result.focused) focusFailures.push(result);
  };
  await folderMore.click();
  assert.equal(await folderMore.getAttribute('aria-expanded'), 'true');
  await focused(page.getByRole('menuitem', { name: '编辑', exact: true }));
  await page.keyboard.press('ArrowDown');
  await focused(page.getByRole('menuitem', { name: '移动', exact: true }));
  await page.keyboard.press('ArrowUp');
  await focused(page.getByRole('menuitem', { name: '编辑', exact: true }));
  await page.keyboard.press('ArrowUp');
  await focused(page.getByRole('menuitem', { name: '删除', exact: true }));
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await folderMore.getAttribute('aria-expanded'), 'false');
  await focused(folderMore);
  await folderMore.click();
  await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
  await page.getByRole('dialog', { name: '编辑文件夹', exact: true }).waitFor();
  assert((await page.locator('dialog input').first().inputValue()).startsWith('设计资源'));
  assert.equal(await page.locator('dialog input[type=url]').count(), 0);
  await page.keyboard.press('Escape');
  await focused(folderMore);
  await folderMore.click();
  await page.getByRole('menuitem', { name: '移动', exact: true }).click();
  await page.getByRole('dialog', { name: '移动到文件夹', exact: true }).waitFor();
  const destinations = await page.locator('dialog select option').evaluateAll(options => options.map(option => option.value));
  for (const id of ['10', '11', '12']) assert(!destinations.includes(id), `move destination includes selected folder/descendant ${id}`);
  for (const id of ['1', '2', '14']) assert(destinations.includes(id), `missing valid move destination ${id}`);
  await page.keyboard.press('Escape');
  await focused(folderMore);
  await folderMore.click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true });
  await confirmation.waitFor();
  assert((await confirmation.innerText()).includes('及其中的 3 项内容（包括子文件夹）'));
  assert((await confirmation.innerText()).includes('此操作不可撤销。'));
  assert.equal(await confirmation.getByRole('button', { name: '确认删除', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await focused(folderMore);

  const create = page.getByRole('button', { name: '新建书签', exact: true });
  await create.click();
  await page.locator('dialog input').first().fill('保留我的输入');
  await page.locator('input[type=url]').fill('https://example.com');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '模拟 API 失败' }).waitFor();
  assert.equal(await page.locator('dialog input').first().inputValue(), '保留我的输入');
  assert.equal(await page.locator('input[type=url]').inputValue(), 'https://example.com');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  await focused(create);

  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.locator('.toast.success').filter({ hasText: '主题：深色' }).waitFor();
  assert((await page.locator('.toast.success').innerText()).includes('✓'));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const settingsButton = page.getByRole('button', { name: '设置', exact: true });
  await settingsButton.click();
  // Keep the established settings selector order: root, theme, density.
  assert.equal(await page.locator('dialog select').nth(0).inputValue(), '1');
  await page.locator('dialog select').nth(1).selectOption('light');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.toast.success').filter({ hasText: '设置已保存' }).waitFor();
  assert((await page.locator('.toast.success').innerText()).includes('✓'));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await focused(settingsButton);
  const beforeFailure = await page.evaluate(() => window.__getSettings());
  await page.evaluate(() => { window.__failStorage = true; });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.locator('.toast.error').filter({ hasText: '模拟存储失败' }).waitFor();
  assert((await page.locator('.toast.error').innerText()).includes('✕'));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.deepEqual(await page.evaluate(() => window.__getSettings()), beforeFailure);
  await settingsButton.click();
  assert.equal(await page.locator('dialog select').nth(1).inputValue(), 'light');
  await page.locator('dialog select').nth(1).selectOption('dark');
  await page.locator('dialog select').nth(2).selectOption('compact');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '模拟存储失败' }).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 1, 'failed settings save must retain dialog');
  assert.equal(await page.locator('dialog select').nth(1).inputValue(), 'dark', 'failed settings save must retain draft');
  assert.equal(await page.locator('dialog select').nth(2).inputValue(), 'compact');
  assert.equal(await page.locator('.app-shell.compact').count(), 0, 'failed save must not apply draft density');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.deepEqual(await page.evaluate(() => window.__getSettings()), beforeFailure);
  await page.keyboard.press('Escape');
  await focused(settingsButton);
  await settingsButton.click();
  assert.equal(await page.locator('dialog select').nth(1).inputValue(), 'light');
  assert.equal(await page.locator('dialog select').nth(2).inputValue(), 'comfortable');
  await page.evaluate(() => { window.__failStorage = false; });
  await page.locator('dialog select').nth(1).selectOption('dark');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.toast.success').filter({ hasText: '设置已保存' }).waitFor();
  await page.screenshot({ path: 'artifacts/dark.png', fullPage: true });
  await page.getByRole('button', { name: '其他书签', exact: true }).click();
  await page.getByRole('heading', { name: '留一点空间，给新的发现' }).waitFor();
  assert.equal(await page.locator('.grid').count(), 0);
  // V1.1 smoke: palette, view toggle, maintenance, pin, drag-into-folder.
  await page.getByRole('button', { name: '书签栏', exact: true }).click();
  await page.waitForSelector('.bookmark-card');
  await page.keyboard.press('/');
  await page.locator('.palette-input').waitFor();
  await page.keyboard.type('常用网站 2');
  await page.waitForSelector('.palette-item');
  assert((await page.locator('.palette-item-title').first().innerText()).includes('常用网站 2'), 'palette filters bookmarks');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.palette-body').count(), 0, 'palette closes on Escape');
  await page.getByRole('button', { name: '切换为列表视图' }).click();
  await page.locator('.grid.list-view').first().waitFor();
  assert.equal((await page.evaluate(() => window.__getSettings())).view, 'list', 'view persisted');
  await page.getByRole('button', { name: '切换为网格视图' }).click();
  await page.waitForSelector('.grid:not(.list-view)');
  await page.getByRole('button', { name: '书签维护' }).click();
  await page.locator('.maintenance-body').waitFor();
  await page.getByRole('tab', { name: '链接检查' }).click();
  assert.equal(await page.getByRole('button', { name: '开始检查' }).count(), 1, 'link check available');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.maintenance-body', { state: 'detached' });
  const card = page.locator('.bookmark-card').first();
  await card.hover();
  await card.getByRole('button', { name: /操作：/ }).click();
  await page.getByRole('menuitem', { name: '固定到顶部' }).click();
  await page.waitForSelector('.pinned-item');
  assert((await page.evaluate(() => window.__getSettings())).pinnedIds.length === 1, 'pin persisted');

  assert.deepEqual(errors, []);
  assert.deepEqual(focusFailures, [], 'menu/dialog focus restoration failures');
  console.log('Browser checks passed: 20 count/viewport combinations; card geometry and clipping; saved-light/system-dark boot with one storage read; folder keyboard menus, edit/move/delete dialogs and focus restoration; success/error toasts; failed API/storage save retention and unchanged settings; empty folder; palette/view-toggle/maintenance/pin smoke. Mock Chrome API used.');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
