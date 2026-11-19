import { z } from 'zod';
import { parseImport, planRestore, requireBookmarkTree, restoreExpectation, type BackupSnapshot, type LocalData } from './backup';
import { defaults, flattenBookmarks, messageError, normalizeTags, noteSchema, notesSchema, recordRecent, recentSchema, reorderPinned, settingsFields, settingsSchema, tagsSchema } from './model';
import { batchLimit, type BatchResult } from './batch';

const settingsPatch = z.partialRecord(settingsFields.omit({ pinnedIds: true }).keyof(), z.unknown());
const bookmarkId = z.string().regex(/^\d+$/);
const mode = z.enum(['merge', 'replace']);
const tagName = z.string().trim().min(1, '请输入标签').max(24, '标签最多 24 字符').refine(value => !/[,，\r\n]/.test(value), '单个标签不能包含逗号或换行');
const operations = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), patch: settingsPatch }),
  z.object({ action: z.literal('pin'), id: bookmarkId, pinned: z.boolean() }),
  z.object({ action: z.literal('reorder'), source: bookmarkId, target: bookmarkId, position: z.enum(['before', 'after']) }),
  z.object({ action: z.literal('tags'), id: bookmarkId, tags: z.array(z.string()).max(8) }),
  z.object({ action: z.literal('note'), id: bookmarkId, note: noteSchema }),
  z.object({ action: z.literal('batchTags'), ids: z.array(bookmarkId).min(1).max(batchLimit), mode: z.enum(['add', 'remove']), tag: tagName }),
  z.object({ action: z.literal('manageTag'), source: tagName, mode: z.enum(['rename', 'merge', 'remove']), target: tagName.optional() }),
  z.object({ action: z.literal('recent'), id: bookmarkId }),
  z.object({ action: z.literal('prune') }),
  z.object({ action: z.literal('snapshot') }),
  z.object({ action: z.literal('restore'), text: z.string().max(2 * 1024 * 1024), mode, expected: z.string() }),
]);
export type LocalOperation = z.input<typeof operations>;
export type RestoreResult = { applied: true; rootId: string } | { applied: false; snapshot: BackupSnapshot };
export type LocalResult = null | BackupSnapshot | RestoreResult | BatchResult;
export type LocalReply = { ok: true; data: LocalResult } | { ok: false; error: string };

function picked<T>(result: z.ZodSafeParseResult<T>, fallback: T): T {
  return result.success ? result.data : fallback;
}

export function parseLocalData(stored: Record<string, unknown>): LocalData {
  const recent = stored.recent;
  return {
    settings: picked(settingsSchema.safeParse(stored.settings ?? {}), defaults),
    recent: picked(recentSchema.safeParse(recent && typeof recent === 'object' && !Array.isArray(recent) ? Object.values(recent) : recent), []),
    tags: picked(tagsSchema.safeParse(stored.tags), {}),
    ...(stored.notes === undefined ? {} : { notes: picked(notesSchema.safeParse(stored.notes), {}) }),
  };
}

function parseStoredLocalData(stored: Record<string, unknown>): LocalData {
  if (stored.settings !== undefined && !settingsSchema.safeParse(stored.settings).success) throw new Error('本地设置格式无效，请先导出或清理配置');
  if (stored.tags !== undefined && !tagsSchema.safeParse(stored.tags).success) throw new Error('本地标签格式无效，请先导出或清理配置');
  if (stored.notes !== undefined && !notesSchema.safeParse(stored.notes).success) throw new Error('本地备注格式无效，请先导出或清理配置');
  const recent = stored.recent;
  const normalizedRecent = recent && typeof recent === 'object' && !Array.isArray(recent) ? Object.values(recent) : recent;
  if (recent !== undefined && !recentSchema.safeParse(normalizedRecent).success) throw new Error('本地最近记录格式无效，请先导出或清理配置');
  return parseLocalData(stored);
}

export function createLocalDataHandler(storage: Pick<typeof chrome.storage.local, 'get' | 'set'>,
  bookmarks: Pick<typeof chrome.bookmarks, 'getTree' | 'get'>, isImporting = () => false) {
  let queued: Promise<unknown> = Promise.resolve();

  async function readTree() {
    if (isImporting()) throw new Error('请等书签导入完成后再试');
    const tree = requireBookmarkTree(await bookmarks.getTree());
    if (isImporting()) throw new Error('请等书签导入完成后再试');
    return tree;
  }

  async function handle(operation: z.output<typeof operations>): Promise<LocalResult> {
    const local = parseStoredLocalData(await storage.get(['settings', 'recent', 'tags', 'notes']));
    if (operation.action === 'snapshot') return { local, tree: await readTree() };
    if (operation.action === 'restore') {
      const snapshot = { local, tree: await readTree() };
      const plan = planRestore(parseImport(operation.text), local, snapshot.tree, operation.mode);
      if (restoreExpectation(local, plan) !== operation.expected) return { applied: false, snapshot };
      await storage.set({ settings: plan.settings, recent: plan.recent, tags: plan.tags, ...(plan.notes ? { notes: plan.notes } : {}) });
      return { applied: true, rootId: plan.settings.rootId };
    }

    const next: Partial<LocalData> = {};
    if (operation.action === 'settings') {
      if (Object.keys(operation.patch).length) next.settings = settingsSchema.parse({ ...local.settings, ...operation.patch });
    } else if (operation.action === 'recent' || operation.action === 'tags' || operation.action === 'note') {
      const [node] = await bookmarks.get(operation.id);
      if (!node?.url) throw new Error('书签不存在');
      if (operation.action === 'recent') next.recent = recordRecent(local.recent, operation.id);
      else if (operation.action === 'note') {
        next.notes = { ...local.notes };
        if (operation.note) next.notes[operation.id] = operation.note;
        else delete next.notes[operation.id];
      }
      else {
        next.tags = { ...local.tags };
        const tags = normalizeTags(operation.tags);
        if (tags.length) next.tags[operation.id] = tags;
        else delete next.tags[operation.id];
      }
    } else if (operation.action === 'batchTags') {
      const nodes = new Map(flattenBookmarks(await readTree()).map(node => [node.id, node]));
      const data: BatchResult = { succeeded: [], failed: [] };
      const tags = { ...local.tags };
      const key = operation.tag.toLowerCase();
      const tag = Object.values(local.tags).flat().find(name => name.toLowerCase() === key) ?? operation.tag;
      for (const id of new Set(operation.ids)) {
        const node = nodes.get(id);
        if (!node || node.unmodifiable) {
          data.failed.push({ id, error: '书签不存在或受保护', retryable: false }); continue;
        }
        const before = tags[id] ?? [];
        const present = before.some(name => name.toLowerCase() === key);
        if (operation.mode === 'add' && !present && before.length >= 8) {
          data.failed.push({ id, error: '已达到 8 个标签上限', retryable: false }); continue;
        }
        const after = operation.mode === 'add' ? (present ? before : [...before, tag]) : before.filter(name => name.toLowerCase() !== key);
        if (after.length) tags[id] = after;
        else delete tags[id];
        data.succeeded.push(id);
      }
      if (data.succeeded.length) await storage.set({ tags });
      return data;
    } else if (operation.action === 'manageTag') {
      const source = operation.source.toLowerCase();
      const target = operation.target;
      const names = Object.values(local.tags).flat();
      if (!names.some(name => name.toLowerCase() === source)) throw new Error('标签已不存在');
      const existing = target && names.find(name => name.toLowerCase() === target.toLowerCase());
      if (operation.mode === 'rename' && (!target || (existing && existing.toLowerCase() !== source))) throw new Error('请输入新的标签名称；已有标签请使用合并');
      if (operation.mode === 'merge' && (!existing || existing.toLowerCase() === source)) throw new Error('请选择另一个已有标签');
      const replacement = operation.mode === 'merge' ? existing : operation.mode === 'rename' ? target : undefined;
      next.tags = Object.fromEntries(Object.entries(local.tags).flatMap(([id, values]) => {
        if (!values.some(name => name.toLowerCase() === source)) return [[id, values]];
        const tags = normalizeTags(values.flatMap(name => name.toLowerCase() === source ? replacement ?? [] : name));
        return tags.length ? [[id, tags]] : [];
      }));
      if (JSON.stringify(next.tags) === JSON.stringify(local.tags)) throw new Error('标签没有变化');
    } else {
      const ids = new Set(flattenBookmarks(await readTree()).map(node => node.id));
      let pinnedIds = local.settings.pinnedIds.filter(id => ids.has(id));
      if (operation.action === 'pin') {
        if (operation.pinned && !ids.has(operation.id)) throw new Error('书签不存在');
        if (operation.pinned && !pinnedIds.includes(operation.id)) {
          if (pinnedIds.length >= 24) throw new Error('最多置顶 24 个书签');
          pinnedIds.push(operation.id);
        } else if (!operation.pinned) pinnedIds = pinnedIds.filter(id => id !== operation.id);
      } else if (operation.action === 'reorder') {
        pinnedIds = reorderPinned(pinnedIds, operation.source, operation.target, operation.position);
      } else {
        const recent = local.recent.filter(entry => ids.has(entry.id));
        const tags = Object.fromEntries(Object.entries(local.tags).filter(([id, values]) => ids.has(id) && values.length));
        const notes = Object.fromEntries(Object.entries(local.notes ?? {}).filter(([id, value]) => ids.has(id) && value));
        if (recent.length !== local.recent.length) next.recent = recent;
        if (Object.keys(tags).length !== Object.keys(local.tags).length) next.tags = tags;
        if (Object.keys(notes).length !== Object.keys(local.notes ?? {}).length) next.notes = notes;
      }
      if (pinnedIds.length !== local.settings.pinnedIds.length || pinnedIds.some((id, index) => id !== local.settings.pinnedIds[index])) {
        next.settings = { ...local.settings, pinnedIds };
      }
    }
    if (Object.keys(next).length) await storage.set(next);
    return null;
  }

  return (value: unknown): Promise<LocalReply> => {
    const job = queued.then(async (): Promise<LocalReply> => {
      try { return { ok: true, data: await handle(operations.parse(value)) }; }
      catch (error) { return { ok: false, error: messageError(error) }; }
    });
    queued = job;
    return job;
  };
}
