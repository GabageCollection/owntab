import { describe, expect, it, vi } from 'vitest';
import { createLocalDataHandler } from '../src/lib/localData';
import { exportBackup, parseImport, planRestore, restoreExpectation, type LocalData } from '../src/lib/backup';
import { defaults, type Node } from '../src/lib/model';

function setup(pinnedIds: string[] = []) {
  const nodes: Node[] = Array.from({ length: 24 }, (_, index) => ({ id: String(index + 10), title: 'Sample', url: `https://example.com/${index}`, parentId: '1', syncing: false }));
  const tree: Node[] = [{ id: '0', title: '', syncing: false, children: [{ id: '1', title: 'Bar', syncing: false, children: nodes }] }];
  const data: LocalData = { settings: { ...defaults, pinnedIds }, recent: [], tags: {} };
  const get = vi.fn(async () => structuredClone(data));
  const set = vi.fn(async (patch: Partial<LocalData>) => { await Promise.resolve(); Object.assign(data, structuredClone(patch)); });
  const getTree = vi.fn(async () => structuredClone(tree));
  const getBookmark = vi.fn(async (id: string) => nodes.filter(node => node.id === id));
  const isImporting = vi.fn(() => false);
  const handle = createLocalDataHandler({ get, set } as unknown as typeof chrome.storage.local,
    { getTree, get: getBookmark } as unknown as typeof chrome.bookmarks, isImporting);
  return { handle, getTree, get, set, data, tree, nodes, isImporting };
}

describe('serialized local writes', () => {
  it('retains disjoint concurrent settings, pins, tags and recent opens', async () => {
    const { handle, data } = setup();
    const replies = await Promise.all([
      handle({ action: 'pin', id: '10', pinned: true }),
      handle({ action: 'settings', patch: { theme: 'dark' } }),
      handle({ action: 'settings', patch: { view: 'list' } }),
      handle({ action: 'pin', id: '11', pinned: true }),
      handle({ action: 'recent', id: '10' }),
      handle({ action: 'recent', id: '11' }),
      handle({ action: 'tags', id: '10', tags: ['Work'] }),
      handle({ action: 'tags', id: '11', tags: ['Study'] }),
    ]);
    expect(replies.every(reply => reply.ok)).toBe(true);
    expect(data.settings).toEqual({ ...defaults, theme: 'dark', view: 'list', pinnedIds: ['10', '11'] });
    expect(data.recent.map(entry => entry.id)).toEqual(['11', '10']);
    expect(data.tags).toEqual({ 10: ['Work'], 11: ['Study'] });
  });

  it('does not apply a failed write or poison the queue', async () => {
    const { handle, data, set } = setup();
    set.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await handle({ action: 'settings', patch: { theme: 'dark' } })).toEqual({ ok: false, error: 'Storage unavailable' });
    expect((await handle({ action: 'settings', patch: { view: 'list' } })).ok).toBe(true);
    expect(data.settings).toEqual({ ...defaults, view: 'list' });
  });

  it('refuses to write over malformed stored local data', async () => {
    const { handle, get, set } = setup();
    get.mockResolvedValueOnce({ settings: { theme: 'not-a-theme' }, recent: [], tags: {} } as unknown as LocalData);
    expect(await handle({ action: 'settings', patch: { view: 'list' } })).toEqual({ ok: false, error: '本地设置格式无效，请先导出或清理配置' });
    expect(set).not.toHaveBeenCalled();
  });

  it('reclaims the stale slot without reordering surviving pins', async () => {
    const pins = ['99', ...Array.from({ length: 23 }, (_, index) => String(index + 10))];
    const { handle, data } = setup(pins);
    expect((await handle({ action: 'pin', id: '33', pinned: true })).ok).toBe(true);
    expect(data.settings.pinnedIds).toEqual([...pins.slice(1), '33']);
  });

  it('prunes against a valid tree, never on failure or during import', async () => {
    const { handle, getTree, data, set, isImporting } = setup(['99', '10']);
    getTree.mockResolvedValueOnce([]);
    expect((await handle({ action: 'prune' })).ok).toBe(false);
    isImporting.mockReturnValueOnce(true);
    expect((await handle({ action: 'prune' })).ok).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect((await handle({ action: 'prune' })).ok).toBe(true);
    expect(data.settings.pinnedIds).toEqual(['10']);
  });
});

describe('backup write protection', () => {
  it('rejects export and restore reads without a valid tree or readable storage', async () => {
    const { handle, getTree, get, set, data, tree } = setup(['10']);
    const text = exportBackup(data, tree);
    const expected = restoreExpectation(data, planRestore(parseImport(text), data, tree, 'merge'));
    getTree.mockRejectedValueOnce(new Error('Bookmarks unavailable')).mockResolvedValueOnce([]);
    expect((await handle({ action: 'snapshot' })).ok).toBe(false);
    expect((await handle({ action: 'restore', text, mode: 'merge', expected })).ok).toBe(false);
    get.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect((await handle({ action: 'snapshot' })).ok).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('refreshes stale previews without a write and restores all fields in one confirmed write', async () => {
    const { handle, data, tree, nodes, set } = setup(['10']);
    const text = exportBackup(data, tree);
    const expected = restoreExpectation(data, planRestore(parseImport(text), data, tree, 'merge'));
    nodes.shift();
    expect(await handle({ action: 'restore', text, mode: 'merge', expected })).toMatchObject({ ok: true, data: { applied: false } });
    expect(set).not.toHaveBeenCalled();
    const updated = planRestore(parseImport(text), data, tree, 'merge');
    expect((await handle({ action: 'restore', text, mode: 'merge', expected: restoreExpectation(data, updated) })).ok).toBe(true);
    expect(set).toHaveBeenCalledExactlyOnceWith({ settings: updated.settings, recent: updated.recent, tags: updated.tags, notes: updated.notes });
  });

  it('requires confirmation again before replacing local data changed by another page', async () => {
    const { handle, data, tree, set } = setup(['10']);
    const text = exportBackup(data, tree);
    const expected = restoreExpectation(data, planRestore(parseImport(text), data, tree, 'replace'));
    await handle({ action: 'tags', id: '10', tags: ['New'] });
    expect(await handle({ action: 'restore', text, mode: 'replace', expected })).toMatchObject({ ok: true, data: { applied: false } });
    expect(set).toHaveBeenCalledOnce();
    expect(data.tags).toEqual({ 10: ['New'] });
  });

  it('adds and removes tags in batches with per-bookmark limit reporting', async () => {
    const { handle, data } = setup();
    data.tags['10'] = Array.from({ length: 8 }, (_, index) => `tag-${index}`);
    const added = await handle({ action: 'batchTags', ids: ['10', '11', '12'], mode: 'add', tag: 'new' });
    expect(added).toMatchObject({ ok: true, data: { succeeded: ['11', '12'], failed: [{ id: '10', retryable: false }] } });
    const removed = await handle({ action: 'batchTags', ids: ['11', '12'], mode: 'remove', tag: 'new' });
    expect(removed).toMatchObject({ ok: true, data: { succeeded: ['11', '12'], failed: [] } });
    expect(data.tags['10']).toHaveLength(8);
    expect(data.tags['11']).toBeUndefined();
  });

  it('renames, merges and removes tags without changing native bookmarks', async () => {
    const { handle, data, getTree } = setup();
    data.tags = { 10: ['Work'], 11: ['Work', 'Study'] };
    expect((await handle({ action: 'manageTag', mode: 'rename', source: 'Work', target: 'Home' })).ok).toBe(true);
    expect(data.tags).toEqual({ 10: ['Home'], 11: ['Home', 'Study'] });
    await handle({ action: 'manageTag', mode: 'merge', source: 'Home', target: 'Study' });
    expect(data.tags).toEqual({ 10: ['Study'], 11: ['Study'] });
    await handle({ action: 'manageTag', mode: 'remove', source: 'Study' });
    expect(data.tags).toEqual({});
    expect(getTree).not.toHaveBeenCalled();
  });
  it('merges a tag attached to a bookmark already at its tag limit without dropping tags', async () => {
    const { handle, data } = setup();
    data.tags = { 10: ['source', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], 11: ['target'] };
    const result = await handle({ action: 'manageTag', mode: 'merge', source: 'source', target: 'new' });
    expect(result).toMatchObject({ ok: false, error: '请选择另一个已有标签' });
    expect(data.tags[10]).toEqual(['source', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const merged = await handle({ action: 'manageTag', mode: 'merge', source: 'source', target: 'target' });
    expect(merged.ok).toBe(true);
    expect(data.tags[10]).toEqual(['target', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('saves bounded notes and deletes empty notes from local storage only', async () => {
    const { handle, data, getTree } = setup();
    expect((await handle({ action: 'note', id: '10', note: 'Useful reference' })).ok).toBe(true);
    expect(data.notes).toEqual({ 10: 'Useful reference' });
    expect((await handle({ action: 'note', id: '10', note: 'x'.repeat(501) })).ok).toBe(false);
    await handle({ action: 'note', id: '10', note: '' });
    expect(data.notes).toEqual({});
    expect(getTree).not.toHaveBeenCalled();
  });
  it('prunes orphaned notes along with other bookmark metadata', async () => {
    const { handle, data } = setup();
    data.notes = { 10: 'kept', 99: 'orphan' };
    expect((await handle({ action: 'prune' })).ok).toBe(true);
    expect(data.notes).toEqual({ 10: 'kept' });
  });
});
