import { describe, expect, it, vi } from 'vitest';
import { batchStamp, handleBatch, type BatchTarget } from '../src/lib/batch';
import type { Node } from '../src/lib/model';

function setup() {
  const first: Node = { id: '10', parentId: '1', title: 'First', url: 'https://example.com/a', syncing: false };
  const second: Node = { id: '11', parentId: '1', title: 'Second', url: 'https://example.com/a', syncing: false };
  const child: Node = { id: '12', parentId: '13', title: 'Child', url: 'https://example.com/c', syncing: false };
  const folder: Node = { id: '13', parentId: '1', title: 'Folder', children: [child], syncing: false };
  const root: Node = { id: '1', parentId: '0', title: 'Bar', children: [first, second, folder], syncing: false };
  const tree: Node[] = [{ id: '0', title: '', children: [root], syncing: false }];
  const getTree = vi.fn(async () => structuredClone(tree));
  const locate = (id: string, nodes: Node[] = tree): Node | undefined => {
    for (const node of nodes) { if (node.id === id) return node; const found = locate(id, node.children ?? []); if (found) return found; }
  };
  const getSubTree = vi.fn(async (id: string) => { const node = locate(id); return node ? [structuredClone(node)] : []; });
  const get = vi.fn(async (id: string) => { const node = locate(id); return node?.url ? [structuredClone(node)] : []; });
  const move = vi.fn(async () => {}), remove = vi.fn(async () => {}), removeTree = vi.fn(async () => {});
  const api = { getTree, getSubTree, get, move, remove, removeTree } as unknown as Parameters<typeof handleBatch>[1];
  return { first, second, child, folder, root, tree, api, getTree, getSubTree, get, move, remove, removeTree };
}

const selected = (node: Node, recursive = false): BatchTarget => ({ id: node.id, stamp: batchStamp(node, recursive) });

describe('validated batch bookmark operations', () => {
  it('moves selected items and rejects a destination inside selected subtree', async () => {
    const fixture = setup();
    const result = await handleBatch({ action: 'move', targets: [selected(fixture.first)], parentId: '13' }, fixture.api);
    expect(result).toMatchObject({ ok: true, data: { succeeded: ['10'], failed: [] } });
    expect(fixture.move).toHaveBeenCalledWith('10', { parentId: '13' });
    const invalid = await handleBatch({ action: 'move', targets: [selected(fixture.folder)], parentId: '12' }, fixture.api);
    expect(invalid).toMatchObject({ ok: false });
    const nested = await handleBatch({ action: 'move', targets: [selected(fixture.folder)], parentId: '13' }, fixture.api);
    expect(nested).toMatchObject({ ok: false });
  });
  it('confirms stale targets again and never deletes orphans', async () => {
    const fixture = setup();
    const stale = { ...selected(fixture.first), stamp: 'old' };
    expect(await handleBatch({ action: 'remove', targets: [stale] }, fixture.api)).toMatchObject({ ok: true, data: { succeeded: [], failed: [{ id: '10', retryable: false }] } });
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(await handleBatch({ action: 'remove', targets: [selected({ ...fixture.first, id: '99' })] }, fixture.api)).toMatchObject({ ok: true, data: { failed: [{ id: '99' }] } });
  });
  it('rechecks recursive folder contents and protected descendants before removal', async () => {
    const fixture = setup();
    const result = await handleBatch({ action: 'remove', targets: [selected(fixture.folder, true)] }, fixture.api);
    expect(result).toMatchObject({ ok: true, data: { succeeded: ['13'] } });
    expect(fixture.removeTree).toHaveBeenCalledWith('13');
    fixture.child.unmodifiable = 'managed';
    const protectedResult = await handleBatch({ action: 'remove', targets: [selected(fixture.folder, true)] }, fixture.api);
    expect(protectedResult).toMatchObject({ ok: true, data: { failed: [{ id: '13' }] } });
  });
  it('keeps a duplicate keeper and removes only confirmed matches', async () => {
    const fixture = setup();
    const target = { ...selected(fixture.second, true), keepId: fixture.first.id, keepUrl: fixture.first.url };
    expect(await handleBatch({ action: 'remove', targets: [target] }, fixture.api)).toMatchObject({ ok: true, data: { succeeded: ['11'] } });
    fixture.get.mockRejectedValueOnce(new Error('not found'));
    expect(await handleBatch({ action: 'remove', targets: [target] }, fixture.api)).toMatchObject({ ok: true, data: { failed: [{ id: '11' }] } });
  });
  it('deletes a selected folder once and counts covered descendants as part of the success', async () => {
    const fixture = setup();
    const result = await handleBatch({ action: 'remove', targets: [selected(fixture.child, true), selected(fixture.folder, true)] }, fixture.api);
    expect(result).toMatchObject({ ok: true, data: { succeeded: ['13', '12'], failed: [] } });
    expect(fixture.removeTree).toHaveBeenCalledOnce();
    expect(fixture.remove).not.toHaveBeenCalled();
  });
  it('does not delete a selected child after its selected parent folder fails', async () => {
    const fixture = setup();
    fixture.removeTree.mockRejectedValueOnce(new Error('Folder delete failed'));
    const result = await handleBatch({ action: 'remove', targets: [selected(fixture.child, true), selected(fixture.folder, true)] }, fixture.api);
    expect(result).toMatchObject({ ok: true, data: { succeeded: [], failed: [{ id: '13', retryable: true }, { id: '12', retryable: false }] } });
    expect(fixture.removeTree).toHaveBeenCalledOnce();
    expect(fixture.remove).not.toHaveBeenCalled();
  });
  it('requires the duplicate keeper to remain present and unchanged before deletion', async () => {
    const fixture = setup();
    fixture.get.mockResolvedValueOnce([]);
    const target = { ...selected(fixture.second, true), keepId: fixture.first.id, keepUrl: fixture.first.url };
    expect(await handleBatch({ action: 'remove', targets: [target] }, fixture.api)).toMatchObject({ ok: true, data: { succeeded: [], failed: [{ id: '11', retryable: false }] } });
    expect(fixture.remove).not.toHaveBeenCalled();
  });
  it('reports per-item failures and blocks operations during import', async () => {
    const fixture = setup();
    fixture.move.mockRejectedValueOnce(new Error('API write failed'));
    expect(await handleBatch({ action: 'move', targets: [selected(fixture.first), selected(fixture.second)], parentId: '13' }, fixture.api)).toMatchObject({ ok: true, data: { succeeded: ['11'], failed: [{ id: '10', retryable: true }] } });
    expect(await handleBatch({ action: 'remove', targets: [selected(fixture.first)] }, fixture.api, () => true)).toMatchObject({ ok: false, error: '请等书签导入完成后再试' });
  });
});
