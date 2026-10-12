import { z } from 'zod';
export type Node = chrome.bookmarks.BookmarkTreeNode;
export const titleSchema = z.string().trim().min(1, '请输入名称');
export const urlSchema = z.string().trim().url('请输入完整网址').refine(v => /^https?:\/\//i.test(v), '仅支持 http 和 https 网址');
export const settingsSchema = z.object({ theme: z.enum(['light', 'dark', 'auto']).default('auto'), rootId: z.string().default('1'), density: z.enum(['comfortable', 'compact']).default('comfortable'), openInNewTab: z.boolean().default(false) });
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = settingsSchema.parse({});
export function rootsOf(tree: Node[]): Node[] { return (tree[0]?.children ?? []).filter(n => !n.url); }
export function defaultRoot(roots: Node[], requested?: string): Node | undefined { return roots.find(n => n.id === requested) ?? roots.find(n => (n as Node & { folderType?: string }).folderType === 'bookmarks-bar') ?? roots.find(n => n.id === '1') ?? roots[0]; }
export function rootLabel(n: Node): string { const kind = (n as Node & { folderType?: string }).folderType; return ({ 'bookmarks-bar': '书签栏', other: '其他书签', mobile: '移动书签' } as Record<string,string>)[kind ?? ''] ?? ({ '1': '书签栏', '2': '其他书签', '3': '移动书签' } as Record<string,string>)[n.id] ?? n.title; }
export function domain(url = ''): string {
  const value = url.trim();
  if (!value) return '';
  const hostWithPort = /^[^/?#\s:]+:\d+(?:[/?#]|$)/.test(value);
  try {
    const parsed = new URL(value);
    if (['javascript:', 'data:', 'about:', 'file:'].includes(parsed.protocol)) return '';
    if (parsed.hostname) return parsed.hostname;
    if (!hostWithPort) return '';
  } catch {
    // Only plausible schemeless hosts may use the fallback below.
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !hostWithPort) return '';
  if (/\s|\\/.test(value)) return '';
  try {
    const parsed = new URL(`https://${value.replace(/^\/\//, '')}`);
    const host = parsed.hostname;
    if (parsed.username || parsed.password) return '';
    if (host.startsWith('[') && host.endsWith(']')) return host;
    const labels = host.split('.');
    const valid = labels.every(label => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
    return valid && (labels.length > 1 || host === 'localhost') ? host : '';
  } catch {
    return '';
  }
}
export const palette = [['#DBEAFE','#1E40AF'],['#D1FAE5','#065F46'],['#FED7AA','#9A3412'],['#E9D5FF','#6B21A8'],['#FBCFE8','#9D174D'],['#CCFBF1','#115E59']];
export function faviconColor(host: string) { let hash = 0; for (const c of host.toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return palette[hash % palette.length]; }
export function findNode(tree: Node[], id: string): Node | undefined { for (const n of tree) { if (n.id === id) return n; const found = findNode(n.children ?? [], id); if (found) return found; } }
export function descendantCount(n: Node): number { return (n.children ?? []).reduce((sum,c) => sum + 1 + descendantCount(c), 0); }
export function folderChoices(tree: Node[], excluded?: string, depth = 0): { node: Node; depth: number }[] { return tree.flatMap(n => n.url || n.id === excluded ? [] : [{node:n,depth}, ...folderChoices(n.children ?? [], excluded, depth + 1)]); }
export function messageError(e: unknown): string { return e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : '操作失败，请重试'; }
