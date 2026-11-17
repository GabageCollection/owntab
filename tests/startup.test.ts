import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startStartup } from '../src/lib/startup';
import type { Changed } from '../src/lib/protocol';

const listeners = new Set<(message: Changed) => void>();
const sendMessage = vi.fn();
const get = vi.fn();
beforeEach(() => {
  listeners.clear();
  sendMessage.mockReset().mockResolvedValue({ ok: true, data: [] });
  get.mockReset().mockResolvedValue({});
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: { addListener: (fn: (message: Changed) => void) => listeners.add(fn), removeListener: (fn: (message: Changed) => void) => listeners.delete(fn) },
    },
    storage: { local: { get } },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('early bookmark prefetch', () => {
  it('invalidates the prefetched snapshot on changes and preserves import state until handoff', () => {
    const { bookmarks } = startStartup();
    const emit = (message: Changed) => listeners.forEach(fn => fn(message));
    expect(bookmarks.invalidated).toBe(false);
    emit({ scope: 'owntab-changed', parentIds: ['1'], all: false });
    expect(bookmarks.invalidated).toBe(true);
    emit({ scope: 'owntab-changed', parentIds: [], all: false, importing: true });
    expect(bookmarks.importing).toBe(true);
    emit({ scope: 'owntab-changed', parentIds: [], all: true, importing: false });
    expect(bookmarks.importing).toBe(false);
    bookmarks.dispose();
    bookmarks.dispose();
    expect(listeners.size).toBe(0);
  });

  it.each(['reject', 'throw'])('settles %s failures before the UI awaits prefetch', async kind => {
    if (kind === 'reject') {
      sendMessage.mockRejectedValue(new Error('后台不可用'));
      get.mockRejectedValue(new Error('存储不可用'));
    } else {
      sendMessage.mockImplementation(() => { throw new Error('后台不可用'); });
      get.mockImplementation(() => { throw new Error('存储不可用'); });
    }
    const startup = startStartup();
    await expect(startup.bookmarks.reply).resolves.toEqual({ ok: false, error: '后台不可用' });
    await expect(startup.stored).resolves.toEqual({});
    startup.bookmarks.dispose();
  });
});
