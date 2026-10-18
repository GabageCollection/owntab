import { z } from 'zod';
export type Node = chrome.bookmarks.BookmarkTreeNode;
export const titleSchema = z.string().trim().min(1, '请输入名称');
export const urlSchema = z.string().trim().url('请输入完整网址').refine(v => /^https?:\/\//i.test(v), '仅支持 http 和 https 网址');
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  rootId: z.string().default('1'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  openInNewTab: z.boolean().default(false),
  view: z.enum(['grid', 'list']).default('grid'),
  showSearchBar: z.boolean().default(true),
  searchEngine: z.string().trim().min(1).default('google'),
  showClock: z.boolean().default(false),
  pinnedIds: z.array(z.string()).default([]),
});
export const pinnedSchema = z.array(z.string().min(1)).max(24);
export const ENGINES = { google: 'Google', bing: '必应', baidu: '百度', duckduckgo: 'DuckDuckGo', github: 'GitHub' } as const;
export type EngineId = keyof typeof ENGINES;
export function engine(id: string): EngineId { return id in ENGINES ? id as EngineId : 'google'; }
export function searchUrl(query: string, engineId: string): string {
  const q = encodeURIComponent(query.trim());
  switch (engine(engineId)) {
    case 'bing': return `https://www.bing.com/search?q=${q}`;
    case 'baidu': return `https://www.baidu.com/s?wd=${q}`;
    case 'duckduckgo': return `https://duckduckgo.com/?q=${q}`;
    case 'github': return `https://github.com/search?q=${q}&type=repositories`;
    default: return `https://www.google.com/search?q=${q}`;
  }
}
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
export function folderPath(tree: Node[], id: string): Node[] {
  const path: Node[] = [];
  let node = findNode(tree, id);
  while (node && node.id !== '0') { path.unshift(node); node = node.parentId ? findNode(tree, node.parentId) : undefined; }
  return path;
}
export function flattenBookmarks(tree: Node[], out: Node[] = []): Node[] {
  for (const node of tree) {
    if (node.url) out.push(node);
    if (node.children?.length) flattenBookmarks(node.children, out);
  }
  return out;
}
export function scoreQuery(title: string, url: string, host: string, query: string): number | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const fields = [title.toLowerCase(), host.toLowerCase(), url.toLowerCase()];
  for (const field of fields) {
    if (!field) continue;
    if (field === q) return 0;
    if (field.startsWith(q)) return 1;
    if (field.includes(q)) return 2;
  }
  let cursor = 0;
  for (const field of fields) {
    let index = field.indexOf(q[0]);
    while (index !== -1) {
      if (index >= cursor) return 3 + index;
      index = field.indexOf(q[0], index + 1);
    }
  }
  return undefined;
}
export interface DuplicateGroup { url: string; nodes: { node: Node; path: string }[] }
export function duplicateGroups(tree: Node[], limit = 200): DuplicateGroup[] {
  const byUrl = new Map<string, DuplicateGroup>();
  function walk(branch: Node[], trail: string[]) {
    for (const node of branch) {
      if (node.url && /^https?:/i.test(node.url)) {
        const key = node.url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
        const group = byUrl.get(key) ?? { url: node.url, nodes: [] };
        group.nodes.push({ node, path: trail.join(' / ') || '根目录' });
        byUrl.set(key, group);
      }
      if (node.children?.length) walk(node.children, [...trail, node.title].filter(Boolean));
    }
  }
  walk(tree, []);
  return [...byUrl.values()].filter(group => group.nodes.length > 1).slice(0, limit);
}
export function folderChoices(tree: Node[], excluded?: string, depth = 0): { node: Node; depth: number }[] { return tree.flatMap(n => n.url || n.id === excluded ? [] : [{node:n,depth}, ...folderChoices(n.children ?? [], excluded, depth + 1)]); }
export function messageError(e: unknown): string { return e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : '操作失败，请重试'; }

export type LinkStatus = 'ok' | 'broken' | 'unknown';
export function normalizeLinkResult(status: number, ok: boolean): LinkStatus {
  if (status === 0) return 'unknown';
  if (status === 405 || status === 501) return 'unknown';
  return ok || (status >= 200 && status < 400) ? 'ok' : 'broken';
}
export async function* checkLinks(nodes: Node[], options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): AsyncGenerator<{ node: Node; status: LinkStatus }> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const jobs = nodes.map(async node => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(node.url!, { signal: controller.signal });
      return { node, status: normalizeLinkResult(response.status, response.ok) };
    } catch {
      return { node, status: 'broken' as const };
    } finally {
      clearTimeout(timer);
    }
  });
  for (const job of jobs) yield await job;
}
