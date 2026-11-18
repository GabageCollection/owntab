import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Shared interaction checks run against both mocked APIs and a real unpacked extension.
export async function checkV13(page, readData, artifacts, failWrite) {
  const settingsButton = page.getByRole('button', { name: '设置', exact: true });
  const openSettings = async () => {
    await settingsButton.click();
    await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  };
  const save = async () => {
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.locator('dialog').waitFor({ state: 'detached' });
  };
  const focused = async selector => {
    await page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
  };
  const order = () => page.locator('.pinned-link').evaluateAll(links => links.map(link => link.dataset.pinId));
  const ids = await page.locator('.bookmark-card .card-link').evaluateAll(links => links.slice(0, 3).map(link => link.dataset.nodeId));
  assert.equal(ids.length, 3, 'three bookmarks required for ordering check');
  for (const id of ids) {
    if ((await readData()).settings.pinnedIds?.includes(id)) continue;
    const card = page.locator('.bookmark-card').filter({ has: page.locator(`[data-node-id="${id}"]`) });
    await card.locator('.more-button').click();
    await page.getByRole('menuitem', { name: '固定到顶部', exact: true }).click();
    await page.waitForFunction(id => !!document.querySelector(`.pinned-link[data-pin-id="${id}"]`), id);
  }
  const before = await order();
  const source = before[0], target = before[1];
  await page.locator(`[data-pin-id="${source}"]`).focus();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  const reordered = [target, source, ...before.slice(2)];
  await page.waitForFunction(ids => [...document.querySelectorAll('.pinned-link')].map(link => link.dataset.pinId).join() === ids.join(), reordered);
  await focused(`[data-pin-id="${source}"]`);
  assert.deepEqual((await readData()).settings.pinnedIds, reordered);
  await page.reload();
  await page.locator('.bookmark-card').first().waitFor();
  assert.deepEqual(await order(), reordered, 'pin order survives reload');
  // Real pointer drag, including dragstart bubbling from the anchor.
  const dragged = page.locator(`[data-pin-id="${source}"]`);
  const destination = page.locator(`[data-pin-id="${target}"]`).locator('..');
  await dragged.dragTo(destination, { targetPosition: { x: 3, y: 10 } });
  await page.waitForFunction(id => document.querySelector('.pinned-link')?.dataset.pinId === id, source);
  assert.deepEqual(await order(), before, 'pointer drag updates pin order');
  if (failWrite) {
    await failWrite(true);
    await dragged.focus();
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await page.locator('.toast.error').waitFor();
    assert.deepEqual(await order(), before, 'failed ordering write preserves visible order');
    assert.deepEqual((await readData()).settings.pinnedIds, before);
    await failWrite(false);
  }

  // Drafts must stay isolated when editing nested custom-engine arrays.
  await openSettings();
  await page.getByLabel('引擎名称', { exact: true }).fill('本地测试引擎');
  await page.getByLabel('搜索网址模板', { exact: true }).fill('https://example.com/search');
  await page.getByRole('button', { name: '添加引擎', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '模板须为' }).waitFor();
  const template = 'https://example.com/search?q={query}&again={query}';
  await page.getByLabel('搜索网址模板', { exact: true }).fill(template);
  await page.getByRole('button', { name: '添加引擎', exact: true }).click();
  await page.keyboard.press('Escape');
  await openSettings();
  assert.equal(await page.getByRole('button', { name: '编辑引擎：本地测试引擎', exact: true }).count(), 0);
  await page.getByLabel('引擎名称', { exact: true }).fill('本地测试引擎');
  await page.getByLabel('搜索网址模板', { exact: true }).fill(template);
  await page.getByRole('button', { name: '添加引擎', exact: true }).click();
  const engineId = await page.getByRole('option', { name: '本地测试引擎', exact: true }).getAttribute('value');
  await page.getByLabel('网页搜索引擎', { exact: true }).selectOption(engineId);
  await page.getByLabel('在新标签页打开书签', { exact: true }).check();
  await save();
  assert.equal((await readData()).settings.searchEngine, engineId);
  assert.equal((await readData()).settings.customEngines.length, 1);
  await openSettings();
  await page.getByRole('button', { name: '编辑引擎：本地测试引擎', exact: true }).click();
  await page.getByLabel('引擎名称', { exact: true }).fill('自定义测试');
  await page.getByRole('button', { name: '更新引擎', exact: true }).click();
  await save();
  assert.equal((await readData()).settings.customEngines[0].name, '自定义测试');

  await page.evaluate(() => { window.__opened = []; window.open = url => { window.__opened.push(url); return null; }; });
  const search = page.getByRole('searchbox', { name: '搜索书签或网页', exact: true });
  const query = '中文 &/?#';
  await search.fill(query);
  await search.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  assert.equal(await page.evaluate(() => window.__opened.length), 0, 'IME Enter never opens web search');
  await search.press('Control+Enter');
  const expectedUrl = template.replaceAll('{query}', encodeURIComponent(query));
  assert.deepEqual(await page.evaluate(() => window.__opened), [expectedUrl]);
  await search.press('Control+k');
  await page.locator('.palette-input').fill(query);
  await page.keyboard.press('Control+Enter');
  await page.locator('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.__opened), [expectedUrl, expectedUrl], 'both search surfaces share custom engine');
  await focused('.search-bar input');

  // Section navigation, input shortcuts, folder enter/return and palette boundaries.
  await search.fill('');
  await search.press('/');
  assert.equal(await page.locator('dialog').count(), 0, 'typing slash in input does not open a dialog');
  await search.dispatchEvent('keydown', { key: '?', isComposing: true });
  assert.equal(await page.locator('dialog').count(), 0);
  await search.fill('');
  await search.press('F6');
  await focused('.pinned-link');
  await page.keyboard.press('F6');
  await focused('.root-tabs button');
  await page.keyboard.press('F6');
  await focused('.grid .card-link');
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.activeElement === [...document.querySelectorAll('.grid .card-link')].at(-1));
  await page.keyboard.press('Home');
  const folder = page.locator('.folder-card .card-link').first();
  const folderId = await folder.getAttribute('data-node-id');
  await folder.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(id => !document.querySelector(`[data-node-id="${id}"]`), folderId);
  await focused('.grid .card-link');
  await page.keyboard.press('ArrowLeft');
  await focused(`[data-node-id="${folderId}"]`);
  await page.keyboard.press('Shift+?');
  await page.getByRole('dialog', { name: '键盘快捷键', exact: true }).waitFor();
  await page.screenshot({ path: `${artifacts}/v13-shortcuts.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await focused(`[data-node-id="${folderId}"]`);
  await page.keyboard.press('/');
  await page.locator('.palette-input').fill('example');
  await page.locator('.palette-item').first().waitFor();
  await page.keyboard.press('End');
  assert.equal(await page.locator('.palette-item').last().getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('.palette-item').first().getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Escape');

  // Export the persisted complete state, then preview/cancel/fail/restore it.
  await openSettings();
  const exported = await readData();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本地备份', exact: true }).click();
  const download = await downloading;
  const buffer = await readFile(await download.path());
  const backup = JSON.parse(buffer);
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.settings, exported.settings);
  assert.deepEqual(backup.recent, exported.recent);
  assert.deepEqual(backup.tags, exported.tags);
  assert(backup.references.length > 0);
  await page.getByRole('button', { name: '删除引擎：自定义测试', exact: true }).click();
  await save();
  assert.equal((await readData()).settings.searchEngine, 'google', 'deleted active engine resets to Google');
  const changed = await readData();
  const importFile = async () => {
    await openSettings();
    await page.getByLabel('选择本地备份', { exact: true }).setInputFiles({ name: 'owntab-backup.json', mimeType: 'application/json', buffer });
    await page.getByRole('dialog', { name: '恢复本地数据', exact: true }).waitFor();
  };
  await importFile();
  assert.deepEqual(await readData(), changed, 'preview writes nothing');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await focused('button[aria-label="设置"]');
  assert.deepEqual(await readData(), changed, 'cancel writes nothing');
  await importFile();
  await page.getByLabel('恢复方式', { exact: true }).selectOption('replace');
  await page.screenshot({ path: `${artifacts}/v13-restore.png`, animations: 'disabled' });
  if (failWrite) {
    await failWrite(true);
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '模拟存储失败' }).waitFor();
    assert.deepEqual(await readData(), changed, 'failed restore preserves all local data');
    assert.equal(await page.getByRole('dialog', { name: '恢复本地数据', exact: true }).count(), 1);
    await failWrite(false);
  }
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  await focused('button[aria-label="设置"]');
  assert.deepEqual(await readData(), exported, 'complete backup roundtrip restores all saved state');
  await page.reload();
  await page.locator('.bookmark-card').first().waitFor();
  assert.deepEqual(await readData(), exported, 'restore persists after reload');

  // Narrow settings modal remains usable and stays inside the viewport.
  await page.setViewportSize({ width: 390, height: 700 });
  await openSettings();
  await page.getByRole('button', { name: '编辑引擎：自定义测试', exact: true }).click();
  await page.getByLabel('引擎名称', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/v13-settings-mobile.png`, animations: 'disabled' });
  const geometry = await page.locator('dialog').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    return { left: rect.left, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight, scroll: dialog.scrollWidth, client: dialog.clientWidth };
  });
  assert(geometry.left >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height && geometry.scroll <= geometry.client + 1, `settings modal fits narrow viewport: ${JSON.stringify(geometry)}`);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
}
