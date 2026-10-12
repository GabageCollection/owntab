import type { Changed } from './protocol';

export const MAX_PENDING_PARENT_IDS = 128;
const DEBOUNCE_MS = 50;

type BookmarkEvents = Pick<typeof chrome.bookmarks,
  'get' | 'onCreated' | 'onRemoved' | 'onChanged' | 'onMoved' |
  'onChildrenReordered' | 'onImportBegan' | 'onImportEnded'>;
type Broadcast = (message: Changed) => unknown;

/** Register synchronously; the returned disposer also cancels pending work. */
export function registerBookmarkEvents(bookmarks: BookmarkEvents, sendMessage: Broadcast): () => void {
  let disposed = false;
  let importing = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const parents = new Set<string>();
  let all = false;

  function broadcast(message: Changed) {
    try {
      void Promise.resolve(sendMessage(message)).catch(() => { /* No newtab is open. */ });
    } catch { /* A missing receiver may also fail synchronously. */ }
  }

  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function invalidateAll() {
    all = true;
    parents.clear();
  }

  function flush() {
    cancelTimer();
    if (disposed || importing) return;
    broadcast({ scope: 'owntab-changed', parentIds: [...parents], all });
    parents.clear();
    all = false;
  }

  function changed(ids: string[], whole = false) {
    if (disposed || importing) return;
    if (whole) invalidateAll();
    if (!all) {
      for (const id of ids) {
        if (parents.has(id)) continue;
        if (parents.size === MAX_PENDING_PARENT_IDS) {
          invalidateAll();
          break;
        }
        parents.add(id);
      }
    }
    if (timer === undefined) timer = setTimeout(flush, DEBOUNCE_MS);
  }

  const onCreated: Parameters<typeof bookmarks.onCreated.addListener>[0] =
    (_id, node) => changed([node.parentId ?? ''], !node.url);
  const onRemoved: Parameters<typeof bookmarks.onRemoved.addListener>[0] =
    (_id, info) => changed([info.parentId], true);
  const onChanged: Parameters<typeof bookmarks.onChanged.addListener>[0] = id => {
    if (disposed || importing) return;
    const lookupGeneration = generation;
    const stillCurrent = () => !disposed && generation === lookupGeneration;
    try {
      void bookmarks.get(id).then(([node]) => {
        if (stillCurrent()) changed([node?.parentId ?? ''], !node?.url);
      }).catch(() => {
        if (stillCurrent()) changed([], true);
      });
    } catch {
      if (stillCurrent()) changed([], true);
    }
  };
  const onMoved: Parameters<typeof bookmarks.onMoved.addListener>[0] =
    (_id, info) => changed([info.parentId, info.oldParentId], true);
  const onChildrenReordered: Parameters<typeof bookmarks.onChildrenReordered.addListener>[0] =
    id => changed([id]);
  const onImportBegan = () => {
    if (disposed) return;
    importing = true;
    generation++;
    cancelTimer();
    invalidateAll();
    broadcast({ scope: 'owntab-changed', parentIds: [], all: false, importing: true });
  };
  const onImportEnded = () => {
    if (disposed) return;
    importing = false;
    generation++;
    cancelTimer();
    invalidateAll();
    broadcast({ scope: 'owntab-changed', parentIds: [], all: true, importing: false });
    all = false;
  };

  bookmarks.onCreated.addListener(onCreated);
  bookmarks.onRemoved.addListener(onRemoved);
  bookmarks.onChanged.addListener(onChanged);
  bookmarks.onMoved.addListener(onMoved);
  bookmarks.onChildrenReordered.addListener(onChildrenReordered);
  bookmarks.onImportBegan.addListener(onImportBegan);
  bookmarks.onImportEnded.addListener(onImportEnded);

  return () => {
    if (disposed) return;
    disposed = true;
    cancelTimer();
    parents.clear();
    bookmarks.onCreated.removeListener(onCreated);
    bookmarks.onRemoved.removeListener(onRemoved);
    bookmarks.onChanged.removeListener(onChanged);
    bookmarks.onMoved.removeListener(onMoved);
    bookmarks.onChildrenReordered.removeListener(onChildrenReordered);
    bookmarks.onImportBegan.removeListener(onImportBegan);
    bookmarks.onImportEnded.removeListener(onImportEnded);
  };
}
