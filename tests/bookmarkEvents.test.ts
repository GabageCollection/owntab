import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PENDING_PARENT_IDS, registerBookmarkEvents } from '../src/lib/bookmarkEvents';

type Listener = (...args: any[]) => void;
function event() {
  const listeners = new Set<Listener>();
  return {
    addListener: vi.fn((listener: Listener) => { listeners.add(listener); }),
    removeListener: vi.fn((listener: Listener) => { listeners.delete(listener); }),
    emit: (...args: any[]) => { for (const listener of listeners) listener(...args); },
    listeners,
  };
}
function createApi() {
  return {
    get: vi.fn().mockResolvedValue([{ id: 'link', parentId: 'parent', url: 'https://example.com' }]),
    onCreated: event(), onRemoved: event(), onChanged: event(), onMoved: event(),
    onChildrenReordered: event(), onImportBegan: event(), onImportEnded: event(),
  };
}
const eventNames = ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportBegan', 'onImportEnded'] as const;
const message = (parentIds: string[], all = false) => ({ scope: 'owntab-changed', parentIds, all });
let api: ReturnType<typeof createApi>;
let send: ReturnType<typeof vi.fn>;
let dispose: () => void;
const tick = () => vi.advanceTimersByTimeAsync(50);

beforeEach(() => {
  vi.useFakeTimers();
  api = createApi();
  send = vi.fn().mockResolvedValue(undefined);
  dispose = registerBookmarkEvents(api as unknown as typeof chrome.bookmarks, send);
});
afterEach(() => { dispose(); vi.useRealTimers(); });

describe('bookmark event batches', () => {
  it('registers all seven listeners synchronously', () => {
    for (const name of eventNames) expect(api[name].listeners.size).toBe(1);
  });

  it('coalesces unique parents into one batch after 50ms from the first event', async () => {
    api.onCreated.emit('a', { parentId: 'p1', url: 'https://example.com' });
    await vi.advanceTimersByTimeAsync(30);
    api.onChildrenReordered.emit('p2', { childIds: [] });
    api.onChildrenReordered.emit('p1', { childIds: [] });
    await vi.advanceTimersByTimeAsync(19);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(message(['p1', 'p2']));
    api.onChildrenReordered.emit('p3');
    await tick();
    expect(send).toHaveBeenLastCalledWith(message(['p3']));
  });

  it('keeps 128 unique parents, ignoring duplicates, then falls back to a full refresh', async () => {
    expect(MAX_PENDING_PARENT_IDS).toBe(128);
    for (let i = 0; i < MAX_PENDING_PARENT_IDS; i++) api.onChildrenReordered.emit(String(i));
    for (let i = 0; i < 1000; i++) api.onChildrenReordered.emit('0');
    await tick();
    expect(send).toHaveBeenLastCalledWith(message(Array.from({ length: 128 }, (_, i) => String(i))));
    send.mockClear();
    for (let i = 0; i < 2000; i++) api.onChildrenReordered.emit(String(i));
    await tick();
    expect(send).toHaveBeenCalledExactlyOnceWith(message([], true));
  });

  it('clears previously collected parents and ignores more IDs once full refresh is required', async () => {
    api.onChildrenReordered.emit('before');
    api.onCreated.emit('folder', { parentId: 'folder-parent' });
    for (let i = 0; i < 2000; i++) api.onChildrenReordered.emit(String(i));
    await tick();
    expect(send).toHaveBeenCalledExactlyOnceWith(message([], true));
    api.onChildrenReordered.emit('after');
    await tick();
    expect(send).toHaveBeenLastCalledWith(message(['after']));
  });

  it.each([
    ['onCreated', ['link', { parentId: 'p', url: 'https://example.com' }], ['p'], false],
    ['onCreated', ['folder', { parentId: 'p' }], [], true],
    ['onCreated', ['rootless-link', { url: 'https://example.com' }], [''], false],
    ['onRemoved', ['link', { parentId: 'p', index: 0 }], [], true],
    ['onMoved', ['link', { parentId: 'new', oldParentId: 'old' }], [], true],
    ['onChildrenReordered', ['p', { childIds: [] }], ['p'], false],
  ] as const)('maps %s to the expected refresh', async (name, args, parents, all) => {
    api[name].emit(...args);
    await tick();
    expect(send).toHaveBeenCalledExactlyOnceWith(message([...parents], all));
  });

  it.each([
    [{ id: 'link', parentId: 'p', url: 'https://example.com' }, ['p'], false],
    [{ id: 'folder', parentId: 'p' }, [], true],
    [undefined, [], true],
  ] as const)('looks up changed nodes before selecting a refresh', async (node, parents, all) => {
    api.get.mockResolvedValueOnce(node ? [node] : []);
    api.onChanged.emit('node', { title: 'New title' });
    await tick();
    expect(api.get).toHaveBeenCalledExactlyOnceWith('node');
    expect(send).toHaveBeenCalledExactlyOnceWith(message([...parents], all));
  });

  it.each(['reject', 'throw'])('falls back to a full refresh when get fails: %s', async kind => {
    if (kind === 'reject') api.get.mockRejectedValueOnce(new Error('Missing bookmark'));
    else api.get.mockImplementationOnce(() => { throw new Error('Missing bookmark'); });
    api.onChanged.emit('missing');
    await tick();
    expect(send).toHaveBeenCalledExactlyOnceWith(message([], true));
  });
});

describe('imports', () => {
  it('cancels the old timer and emits exactly one full refresh on end despite a large import', async () => {
    api.onChildrenReordered.emit('before');
    await vi.advanceTimersByTimeAsync(20);
    api.onImportBegan.emit();
    expect(vi.getTimerCount()).toBe(0);
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...message([]), importing: true });
    for (let i = 0; i < 2000; i++) {
      api.onCreated.emit(String(i), { parentId: String(i), url: 'https://example.com' });
      api.onChildrenReordered.emit(String(i));
      api.onChanged.emit(String(i));
      api.onRemoved.emit(String(i), { parentId: String(i) });
      api.onMoved.emit(String(i), { parentId: String(i), oldParentId: 'old' });
    }
    expect(api.get).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    api.onImportEnded.emit();
    expect(send).toHaveBeenLastCalledWith({ ...message([], true), importing: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    api.onChildrenReordered.emit('after');
    await tick();
    expect(send).toHaveBeenLastCalledWith(message(['after']));
  });

  it('also clears a pending timer when import-ended arrives without import-began', async () => {
    api.onChildrenReordered.emit('old');
    api.onImportEnded.emit();
    await tick();
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...message([], true), importing: false });
  });

  it.each(['resolve', 'reject'])('ignores a pre-import lookup that completes after end: %s', async kind => {
    let resolve!: (nodes: unknown[]) => void;
    let reject!: (error: Error) => void;
    api.get.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
    api.onChanged.emit('old');
    api.onImportBegan.emit();
    api.onImportEnded.emit();
    if (kind === 'resolve') resolve([{ parentId: 'old', url: 'https://example.com' }]);
    else reject(new Error('Lookup failed'));
    await tick();
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('cleanup and missing receivers', () => {
  it('removes each registered listener and cancels its timer with an idempotent disposer', async () => {
    api.onChildrenReordered.emit('pending');
    dispose();
    dispose();
    for (const name of eventNames) {
      expect(api[name].removeListener).toHaveBeenCalledExactlyOnceWith(api[name].addListener.mock.calls[0][0]);
      expect(api[name].listeners.size).toBe(0);
    }
    expect(vi.getTimerCount()).toBe(0);
    api.onImportBegan.emit();
    api.onChildrenReordered.emit('later');
    await tick();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('ignores async lookups after disposal: %s', async kind => {
    let resolve!: (nodes: unknown[]) => void;
    let reject!: (error: Error) => void;
    api.get.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
    api.onChanged.emit('pending');
    dispose();
    if (kind === 'resolve') resolve([{ parentId: 'p', url: 'https://example.com' }]);
    else reject(new Error('Lookup failed'));
    await tick();
    expect(send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['reject', 'throw'])('handles sendMessage failure without unhandled errors: %s', async kind => {
    if (kind === 'reject') send.mockRejectedValue(new Error('No receiving end'));
    else send.mockImplementation(() => { throw new Error('No receiving end'); });
    api.onChildrenReordered.emit('p');
    await tick();
    api.onImportBegan.emit();
    api.onImportEnded.emit();
    await tick();
    expect(send).toHaveBeenCalledTimes(3);
  });
});
