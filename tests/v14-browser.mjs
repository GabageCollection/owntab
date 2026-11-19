import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function checkV14(page, readData, artifacts) {
  const cards = page.locator('.bookmark-card');
  await cards.first().waitFor();
  const firstCard = cards.first();
  const firstId = await firstCard.locator('.card-link').getAttribute('data-node-id');
  const firstTitle = await firstCard.locator('.card-title').innerText();

  await firstCard.locator('.more-button').click();
  await page.getByRole('menuitem', { name: '编辑备注', exact: true }).click();
  await page.getByLabel('备注', { exact: true }).fill('v14-note-search-needle');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  assert.equal((await readData()).notes[firstId], 'v14-note-search-needle', 'notes persist in local storage');

  await page.getByRole('button', { name: '搜索书签', exact: true }).click();
  await page.locator('.palette-input').fill('v14-note-search-needle');
  await page.locator('.palette-item-title', { hasText: firstTitle }).waitFor();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '选择书签', exact: true }).click();
  const selections = page.locator('.bookmark-card .bookmark-select');
  const ids = await selections.evaluateAll(inputs => inputs.slice(0, 2).map(input => input.closest('.bookmark-card')?.querySelector('.card-link')?.dataset.nodeId));
  assert.equal(ids.length, 2, 'two bookmarks required for batch test');
  await selections.nth(0).click();
  await selections.nth(1).click();
  await page.getByRole('button', { name: '加标签', exact: true }).click();
  await page.getByLabel('标签', { exact: true }).fill('V14批量标签');
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '成功 2 项，失败 0 项' }).waitFor();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  let local = await readData();
  assert(ids.every(id => local.tags[id]?.includes('V14批量标签')));

  await page.getByRole('button', { name: '管理标签', exact: true }).click();
  await page.getByRole('dialog', { name: '管理标签', exact: true }).waitFor();
  await page.getByRole('button', { name: '重命名 V14批量标签', exact: true }).click();
  await page.getByLabel('新名称', { exact: true }).fill('V14重命名标签');
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  local = await readData();
  assert(ids.every(id => local.tags[id]?.includes('V14重命名标签')));

  await page.getByRole('button', { name: '选择书签', exact: true }).click();
  await selections.nth(0).click();
  await selections.nth(1).click();
  await page.getByRole('button', { name: '加标签', exact: true }).click();
  await page.getByLabel('标签', { exact: true }).fill('V14合并目标');
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '成功 2 项，失败 0 项' }).waitFor();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '管理标签', exact: true }).click();
  await page.getByRole('button', { name: '合并 V14重命名标签', exact: true }).click();
  await page.getByLabel('合并到', { exact: true }).selectOption({ label: 'V14合并目标' });
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  local = await readData();
  assert(ids.every(id => local.tags[id]?.includes('V14合并目标') && !local.tags[id]?.includes('V14重命名标签')));

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本地备份', exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.version, 3);
  assert.equal(backup.notes[firstId], 'v14-note-search-needle');
  assert(backup.references.some(reference => reference.id === firstId), 'note bookmarks have a backup reference');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '书签维护', exact: true }).click();
  await page.getByRole('tab', { name: '链接检查', exact: true }).click();
  const targetId = ids[0];
  await page.evaluate(() => {
    window.__checkFetchCalls = 0;
    window.__checkPass = false;
    window.fetch = (url, { signal }) => new Promise((resolve, reject) => {
      window.__checkFetchCalls++;
      const timer = setTimeout(() => resolve(new Response('', { status: window.__checkPass ? 200 : 404 })), 20);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
  });
  await page.getByLabel('检查范围', { exact: true }).selectOption('selected');
  await page.getByLabel('选择待检查书签', { exact: true }).selectOption(targetId);
  assert((await page.locator('.maintenance-body').innerText()).includes('向 1 个 http/https'), 'selected scope checks only selected bookmarks');
  await page.getByRole('button', { name: '开始检查', exact: true }).click();
  await page.locator('.maintenance-badge[data-status="broken"]').waitFor();
  assert.equal(await page.evaluate(() => window.__checkFetchCalls), 1);
  await page.evaluate(() => { window.__checkPass = true; });
  await page.getByRole('button', { name: /重试未通过项/ }).click();
  await page.locator('.maintenance-badge[data-status="ok"]').waitFor();
  assert.equal(await page.evaluate(() => window.__checkFetchCalls), 2, 'retry checks only the failed bookmark');

  await page.getByLabel('检查范围', { exact: true }).selectOption('all');
  await page.evaluate(() => {
    window.fetch = (url, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response('', { status: 200 })), 1000);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
  });
  await page.getByRole('button', { name: '开始检查', exact: true }).click();
  await page.getByRole('button', { name: '取消检查', exact: true }).waitFor();
  await page.getByRole('button', { name: '取消检查', exact: true }).click();
  await page.getByRole('button', { name: /重试未通过项/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: '取消检查', exact: true }).count(), 0, 'cancel stops the active check');
  await page.getByRole('button', { name: '取消', exact: true }).click();

  if (artifacts) await page.screenshot({ path: `${artifacts}/v14-home.png`, animations: 'disabled' });
}
