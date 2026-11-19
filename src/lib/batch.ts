import { z } from 'zod';
import { duplicateKey, messageError, rootsOf, type Node } from './model';

export const batchLimit = 500;
const id = z.string().min(1);
const target = z.object({ id, stamp: z.string().min(1), keepId: id.optional(), keepUrl: z.string().optional() });
const targets = z.array(target).min(1).max(batchLimit).refine(items => new Set(items.map(item => item.id)).size === items.length, '选择包含重复条目');
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), targets, parentId: id }),
  z.object({ action: z.literal('remove'), targets }),
]);
export type BatchTarget = z.infer<typeof target>;
export type BatchOperation = z.infer<typeof schema>;
export interface BatchResult {
  succeeded: string[];
  failed: { id: string; error: string; retryable: boolean }[];
}
export type BatchReply = { ok: true; data: BatchResult } | { ok: false; error: string };

export function batchStamp(node: Node, recursive = false): string {
  const shape = (entry: Node): unknown => [entry.id, entry.parentId, entry.title, entry.url, entry.unmodifiable, recursive ? (entry.children ?? []).map(shape) : null];
  return JSON.stringify(shape(node));
}

function editableSubtree(node: Node): boolean {
  return !node.unmodifiable && (node.children ?? []).every(editableSubtree);
}

export async function handleBatch(raw: unknown, api: Pick<typeof chrome.bookmarks, 'getTree' | 'getSubTree' | 'get' | 'move' | 'remove' | 'removeTree'>, isImporting = () => false): Promise<BatchReply> {
  try {
    const operation = schema.parse(raw);
    if (isImporting()) throw new Error('请等书签导入完成后再试');
    const tree = await api.getTree();
    const roots = rootsOf(tree);
    if (!roots.length) throw new Error('无法读取完整书签，请重试');
    const rootIds = new Set(['0', ...roots.map(node => node.id)]);
    const byId = new Map<string, Node>();
    const children = [...tree];
    while (children.length) {
      const node = children.pop()!;
      byId.set(node.id, node);
      if (node.children?.length) children.push(...node.children);
    }
    const chosen = new Set(operation.targets.map(item => item.id));
    function hasAncestor(node: Node, ids: Set<string>) {
      for (let parent = node.parentId; parent; parent = byId.get(parent)?.parentId) if (ids.has(parent)) return true;
      return false;
    }
    const destination = operation.action === 'move' ? byId.get(operation.parentId) : undefined;
    if (operation.action === 'move' && (!destination || destination.url || destination.unmodifiable || destination.id === '0' || chosen.has(destination.id) || hasAncestor(destination, chosen))) {
      throw new Error('目标文件夹无效，或位于选中条目之内');
    }
    const data: BatchResult = { succeeded: [], failed: [] };
    const depth = (node: Node) => {
      let value = 0;
      for (let parent = node.parentId; parent; parent = byId.get(parent)?.parentId) value++;
      return value;
    };
    const ordered = [...operation.targets].sort((left, right) => {
      const leftNode = byId.get(left.id), rightNode = byId.get(right.id);
      return (leftNode ? depth(leftNode) : Number.MAX_SAFE_INTEGER) - (rightNode ? depth(rightNode) : Number.MAX_SAFE_INTEGER);
    });
    for (const item of ordered) {
      const node = byId.get(item.id);
      const deleting = operation.action === 'remove';
      const fail = (error: string, retryable = false) => data.failed.push({ id: item.id, error, retryable });
      if (!node || rootIds.has(item.id) || node.unmodifiable || (deleting && !editableSubtree(node))) {
        fail('条目已不存在或受保护'); continue;
      }
      const successfulAncestor = hasAncestor(node, new Set(data.succeeded));
      if (successfulAncestor) {
        data.succeeded.push(item.id);
        continue;
      }
      if (deleting && hasAncestor(node, chosen)) {
        fail('所选上级文件夹未删除，此项未执行，请重新确认'); continue;
      }
      if (batchStamp(node, deleting) !== item.stamp) { fail('条目已变化，请重新确认'); continue; }
      if (item.keepId && (chosen.has(item.keepId) || !deleting || !item.keepUrl || !node.url || duplicateKey(node.url) !== duplicateKey(item.keepUrl))) {
        fail('保留项无效，请重新预览'); continue;
      }
      if (isImporting()) { fail('正在导入书签', true); continue; }
      try {
        if (deleting) {
          if (item.keepId) {
            let keeper: chrome.bookmarks.BookmarkTreeNode | undefined;
            try { [keeper] = await api.get(item.keepId); }
            catch { fail('保留项已不存在，请重新预览'); continue; }
            if (!keeper?.url || !item.keepUrl || duplicateKey(keeper.url) !== duplicateKey(item.keepUrl)) { fail('保留项已变化，请重新预览'); continue; }
          }
          const [live] = await api.getSubTree(item.id);
          if (!live || batchStamp(live, true) !== item.stamp) { fail('删除范围已变化，请重新确认'); continue; }
          if (isImporting()) { fail('正在导入书签', true); continue; }
          if (live.url) await api.remove(item.id);
          else await api.removeTree(item.id);
        } else if (node.parentId !== operation.parentId) {
          await api.move(item.id, { parentId: operation.parentId });
        }
        data.succeeded.push(item.id);
      } catch (error) {
        fail(messageError(error), true);
      }
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: messageError(error) };
  }
}
