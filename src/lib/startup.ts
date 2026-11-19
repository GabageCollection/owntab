import type { Changed, Reply } from './protocol';

export interface InitialBookmarks {
  reply: Promise<Reply>;
  invalidated: boolean;
  importing: boolean;
  dispose: () => void;
}

// No Vue or validation dependencies: start IO while the UI module is loading.
export function startStartup() {
  const bookmarks: InitialBookmarks = {
    reply: Promise.resolve({ ok: true, data: [] }),
    invalidated: false,
    importing: false,
    dispose: () => chrome.runtime.onMessage.removeListener(changed),
  };
  function changed(message: Changed) {
    if (message?.scope !== 'owntab-changed') return;
    bookmarks.invalidated = true;
    bookmarks.importing = !!message.importing;
  }
  chrome.runtime.onMessage.addListener(changed);
  // Handle failures before the UI consumes either prefetch, including sync throws.
  try {
    bookmarks.reply = chrome.runtime.sendMessage({ scope: 'owntab', action: 'tree' })
      .then((reply: Reply) => reply, (error: unknown) => failure(error));
  } catch (error) {
    bookmarks.reply = Promise.resolve(failure(error));
  }
  let stored: Promise<Record<string, unknown>>;
  try {
    stored = chrome.storage.local.get(['settings', 'recent', 'tags', 'notes']).catch(() => ({}));
  } catch {
    stored = Promise.resolve({});
  }
  return { bookmarks, stored };
}

function failure(error: unknown): Reply {
  return { ok: false, error: error instanceof Error ? error.message : '后台暂时不可用，请重试' };
}
