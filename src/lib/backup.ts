import { z } from 'zod';
import { defaults, defaultRoot, normalizeTags, recentSchema, rootsOf, settingsSchema, tagsSchema, type Node, type RecentEntry, type Settings, type TagMap } from './model';

const referenceSchema = z.object({ id: z.string().min(1), url: z.string().max(8192), path: z.array(z.string()).max(100) });
const backupSchema = z.object({
  app: z.literal('owntab'), version: z.literal(2),
  settings: settingsSchema, recent: recentSchema, tags: tagsSchema,
  references: z.array(referenceSchema).max(10000),
});
export type Backup = z.infer<typeof backupSchema>;
export interface LocalData { settings: Settings; recent: RecentEntry[]; tags: TagMap }
export type ImportData = { kind: 'backup'; data: Backup } | { kind: 'settings'; settings: Settings };

function bookmarkReferences(tree: Node[]) {
  const references: Backup['references'] = [];
  const walk = (nodes: Node[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) references.push({ id: node.id, url: node.url, path });
      if (node.children) walk(node.children, node.id === '0' ? path : [...path, node.title]);
    }
  };
  walk(tree, []);
  return references;
}

export function exportBackup(local: LocalData, tree: Node[]): string {
  const ids = new Set([...local.settings.pinnedIds, ...local.recent.map(item => item.id), ...Object.keys(local.tags)]);
  const references = bookmarkReferences(tree).filter(node => ids.has(node.id));
  const text = JSON.stringify(backupSchema.parse({ app: 'owntab', version: 2, ...local, references }), null, 2);
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('备份数据超过 2 MB，无法导出为可恢复文件');
  return text;
}

export function parseImport(text: string): ImportData {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('文件不能超过 2 MB');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('备份格式不正确');
  if ('app' in raw || ('version' in raw && raw.version !== 1)) {
    const result = backupSchema.safeParse(raw);
    if (!result.success) throw new Error('备份格式或版本不受支持');
    const refs = result.data.references;
    if (new Set(refs.map(ref => ref.id)).size !== refs.length) throw new Error('备份中的书签引用重复');
    return { kind: 'backup', data: result.data };
  }
  const source = 'settings' in raw ? raw.settings : raw;
  if (!source || typeof source !== 'object' || !Object.keys(source).some(key => key in defaults)) throw new Error('设置文件格式不正确');
  const result = settingsSchema.safeParse(source);
  if (!result.success) throw new Error('设置文件格式不正确');
  return { kind: 'settings', settings: result.data };
}

// Match only existing bookmarks: same ID+URL, unique URL, or unique URL+folder path.
// Ambiguous matches are skipped; native bookmark records are never created/edited.
export function planRestore(input: ImportData, current: LocalData, tree: Node[], mode: 'merge' | 'replace') {
  const nodes = bookmarkReferences(tree);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const byUrl = new Map<string, Backup['references']>();
  const byPath = new Map<string, Backup['references']>();
  for (const node of nodes) {
    const urlGroup = byUrl.get(node.url) ?? [];
    urlGroup.push(node); byUrl.set(node.url, urlGroup);
    const key = JSON.stringify([node.url, node.path]);
    const pathGroup = byPath.get(key) ?? [];
    pathGroup.push(node); byPath.set(key, pathGroup);
  }
  const mapping = new Map<string, string>();
  const imported = input.kind === 'backup' ? input.data : null;
  const sourceSettings = input.kind === 'backup' ? input.data.settings : input.settings;
  const ids = new Set<string>(imported
    ? [...imported.settings.pinnedIds, ...imported.recent.map(item => item.id), ...Object.keys(imported.tags)]
    : sourceSettings.pinnedIds);
  if (imported) {
    const refs = new Map(imported.references.map(ref => [ref.id, ref]));
    for (const id of ids) {
      const ref = refs.get(id);
      if (!ref) continue;
      if (byId.get(id)?.url === ref.url) { mapping.set(id, id); continue; }
      let matches = byUrl.get(ref.url) ?? [];
      if (matches.length > 1) matches = byPath.get(JSON.stringify([ref.url, ref.path])) ?? [];
      if (matches.length === 1) mapping.set(id, matches[0].id);
    }
  } else for (const id of ids) if (byId.has(id)) mapping.set(id, id);
  const pins = [...new Set(sourceSettings.pinnedIds.flatMap(id => mapping.get(id) ?? []))];
  const combinedPins = [...new Set([...(mode === 'merge' ? current.settings.pinnedIds.filter(id => byId.has(id)) : []), ...pins])];
  const settings = settingsSchema.parse({ ...sourceSettings, pinnedIds: combinedPins.slice(0, 24), rootId: defaultRoot(rootsOf(tree), sourceSettings.rootId)?.id ?? defaults.rootId });
  let recent = [...current.recent];
  let tags = { ...current.tags };
  if (imported) {
    tags = mode === 'merge' ? Object.fromEntries(Object.entries(current.tags).filter(([id]) => byId.has(id))) : {};
    for (const [id, values] of Object.entries(imported.tags)) {
      const mapped = mapping.get(id);
      if (mapped) tags[mapped] = normalizeTags([...(tags[mapped] ?? []), ...values]);
    }
    const entries = [...(mode === 'merge' ? current.recent : []), ...imported.recent.flatMap(item => {
      const id = mapping.get(item.id);
      return id ? [{ ...item, id }] : [];
    })].filter(item => byId.has(item.id)).sort((a, b) => b.openedAt - a.openedAt);
    recent = entries.filter((item, i) => entries.findIndex(other => other.id === item.id) === i).slice(0, 50);
  }
  return { settings, recent, tags, matched: mapping.size, skipped: ids.size - mapping.size, truncatedPins: Math.max(0, combinedPins.length - 24) };
}
