import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/lib/bookmarks';
import type { Node } from '../src/lib/model';
import type { Request } from '../src/lib/protocol';

const folder = (id: string, parentId: string, children: Node[] = [], extra: Partial<Node> = {}): Node =>
  ({ id, parentId, title: `Folder ${id}`, children, syncing: false, ...extra });
const bookmark: Node = { id: 'link', parentId: 'folder', title: 'Example', url: 'https://example.com', syncing: false };
const nested = folder('nested', 'folder', [folder('deep', 'nested')]);
const sourceFolder = folder('folder', '1', [bookmark, nested]);
const destination = folder('destination', '2');
const managed = folder('managed', '1', [], { unmodifiable: 'managed' });
const tree: Node[] = [{ id: '0', title: '', syncing: false, children: [
  folder('1', '0', [sourceFolder, managed]), folder('2', '0', [destination]),
  folder('custom-root', '0'),
] }];

function createApi() {
  return {
    getTree: vi.fn().mockResolvedValue(tree),
    getChildren: vi.fn().mockResolvedValue([sourceFolder, managed]),
    create: vi.fn().mockResolvedValue({ id: 'created', parentId: 'destination', title: 'Created', syncing: false }),
    update: vi.fn().mockResolvedValue({ ...bookmark, title: 'Updated' }),
    move: vi.fn().mockResolvedValue({ ...bookmark, parentId: 'destination' }),
    remove: vi.fn().mockResolvedValue(undefined),
    removeTree: vi.fn().mockResolvedValue(undefined),
  };
}
let api: ReturnType<typeof createApi>;
// Distributing Omit preserves the distinct fields of each protocol action.
type Action = Request extends infer R ? R extends Request ? Omit<R, 'scope'> : never : never;
const dispatch = (input: Action) =>
  handleRequest({ scope: 'owntab', ...input } as Request, api as unknown as typeof chrome.bookmarks);
const expectNoMutation = () => {
  for (const name of ['create', 'update', 'move', 'remove', 'removeTree'] as const) {
    expect(api[name]).not.toHaveBeenCalled();
  }
};
beforeEach(() => { api = createApi(); });

describe('read requests', () => {
  it('returns the browser tree without mutating it', async () => {
    expect(await dispatch({ action: 'tree' })).toEqual({ ok: true, data: tree });
    expect(api.getTree).toHaveBeenCalledOnce();
    expectNoMutation();
  });

  it('reads children directly from the requested folder', async () => {
    expect(await dispatch({ action: 'children', id: '1' })).toEqual({ ok: true, data: [sourceFolder, managed] });
    expect(api.getChildren).toHaveBeenCalledWith('1');
    expect(api.getTree).not.toHaveBeenCalled();
  });
});

describe('root and managed node protection', () => {
  it.each(['0', '1', '2', 'custom-root', 'managed', 'missing'])('refuses to mutate protected or missing node %s', async id => {
    for (const input of [
      { action: 'remove', id },
      { action: 'update', id, title: 'Renamed' },
      { action: 'move', id, parentId: 'destination' },
    ] as Action[]) {
      expect(await dispatch(input)).toEqual({ ok: false, error: '此书签不存在或不可编辑' });
    }
    expectNoMutation();
  });
});

describe('deletion', () => {
  it('uses recursive deletion for a folder containing bookmarks and nested folders', async () => {
    expect(await dispatch({ action: 'remove', id: 'folder' })).toEqual({ ok: true, data: null });
    expect(api.removeTree).toHaveBeenCalledExactlyOnceWith('folder');
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('removes a bookmark without invoking recursive deletion', async () => {
    expect(await dispatch({ action: 'remove', id: 'link' })).toEqual({ ok: true, data: null });
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('link');
    expect(api.removeTree).not.toHaveBeenCalled();
  });
});

describe('create validation', () => {
  it('creates a bookmark with trimmed title and URL and returns the API result', async () => {
    const created = { id: 'new-link', parentId: 'destination', title: 'Example', url: 'https://example.com', syncing: false };
    api.create.mockResolvedValueOnce(created);
    expect(await dispatch({ action: 'create', parentId: 'destination', title: '  Example  ', url: ' https://example.com ' }))
      .toEqual({ ok: true, data: created });
    expect(api.create).toHaveBeenCalledExactlyOnceWith({ parentId: 'destination', title: 'Example', url: 'https://example.com' });
  });

  it('allows creating a folder under a browser root and omits the URL property', async () => {
    const result = await dispatch({ action: 'create', parentId: '1', title: ' New folder ' });
    expect(result.ok).toBe(true);
    expect(api.create).toHaveBeenCalledExactlyOnceWith({ parentId: '1', title: 'New folder' });
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/example', 'chrome://settings', 'ftp://example.com', 'example.com'])
    ('rejects unsafe or incomplete URL %s before calling the API', async url => {
      const result = await dispatch({ action: 'create', parentId: 'destination', title: 'Example', url });
      expect(result.ok).toBe(false);
      expect(api.getTree).not.toHaveBeenCalled();
      expectNoMutation();
    });

  it('rejects whitespace-only names before calling the API', async () => {
    expect(await dispatch({ action: 'create', parentId: 'destination', title: ' \n ' }))
      .toEqual({ ok: false, error: '请输入名称' });
    expect(api.getTree).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each(['0', 'link', 'managed', 'missing'])('rejects an invalid destination %s', async parentId => {
    expect(await dispatch({ action: 'create', parentId, title: 'New' }))
      .toEqual({ ok: false, error: '目标文件夹不存在或不可编辑' });
    expectNoMutation();
  });
});

describe('moves', () => {
  it.each(['folder', 'nested', 'deep'])('refuses to move a folder into itself or descendant %s', async parentId => {
    expect(await dispatch({ action: 'move', id: 'folder', parentId }))
      .toEqual({ ok: false, error: '不能移动到自身或子文件夹中' });
    expectNoMutation();
  });

  it.each(['0', 'link', 'managed', 'missing'])('rejects an invalid move destination %s', async parentId => {
    expect(await dispatch({ action: 'move', id: 'folder', parentId }))
      .toEqual({ ok: false, error: '目标文件夹不存在或不可编辑' });
    expectNoMutation();
  });

  it.each([
    ['link', 'destination'], ['folder', 'destination'], ['link', '2'],
  ])('moves %s to editable folder %s and returns the moved node', async (id, parentId) => {
    const moved: Node = { ...(id === 'link' ? bookmark : sourceFolder), parentId };
    api.move.mockResolvedValueOnce(moved);
    expect(await dispatch({ action: 'move', id, parentId })).toEqual({ ok: true, data: moved });
    expect(api.move).toHaveBeenCalledExactlyOnceWith(id, { parentId });
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.removeTree).not.toHaveBeenCalled();
  });
});

describe('API errors', () => {
  it.each([
    ['getTree', { action: 'tree' }],
    ['getChildren', { action: 'children', id: '1' }],
    ['create', { action: 'create', parentId: 'destination', title: 'New' }],
    ['update', { action: 'update', id: 'link', title: 'Renamed' }],
    ['move', { action: 'move', id: 'link', parentId: 'destination' }],
    ['remove', { action: 'remove', id: 'link' }],
    ['removeTree', { action: 'remove', id: 'folder' }],
  ] as const)('returns the %s rejection as an error reply', async (method, input) => {
    api[method].mockRejectedValueOnce(new Error('Browser bookmark API failed'));
    expect(await dispatch(input)).toEqual({ ok: false, error: 'Browser bookmark API failed' });
  });

  it('returns a useful fallback for non-Error API rejections', async () => {
    api.create.mockRejectedValueOnce(undefined);
    expect(await dispatch({ action: 'create', parentId: 'destination', title: 'New' }))
      .toEqual({ ok: false, error: '操作失败，请重试' });
  });

  it('does not mutate bookmarks when reading the tree fails', async () => {
    api.getTree.mockRejectedValueOnce(new Error('Cannot read bookmarks'));
    expect(await dispatch({ action: 'create', parentId: 'destination', title: 'New' }))
      .toEqual({ ok: false, error: 'Cannot read bookmarks' });
    expectNoMutation();
  });
});
