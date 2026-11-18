import { describe, expect, it } from 'vitest';
import { customEngineSchema, defaults, reorderPinned, searchUrl, settingsSchema, type Node } from '../src/lib/model';
import { exportBackup, parseImport, planRestore, type LocalData } from '../src/lib/backup';
const bookmark = (id: string, url = `https://example.com/${id}`): Node => ({ id, title: id, parentId: '1', url, syncing: false });
const tree = (nodes: Node[]): Node[] => [{ id: '0', title: '', syncing: false, children: [{ id: '1', title: 'Bar', parentId: '0', syncing: false, children: nodes }] }];
const engine = { id: 'custom-test', name: '测试引擎', template: 'https://example.com/search?q={query}&again={query}' };
const local = (overrides: Partial<LocalData> = {}): LocalData => ({ settings: settingsSchema.parse({}), recent: [], tags: {}, ...overrides });

describe('custom search engines', () => {
  it('encodes the query at every placeholder and migrates old settings', () => {
    expect(searchUrl('你好 &/?#', engine.id, [engine])).toBe(`https://example.com/search?q=${encodeURIComponent('你好 &/?#')}&again=${encodeURIComponent('你好 &/?#')}`);
    expect(settingsSchema.parse({ theme: 'dark' }).customEngines).toEqual([]);
    expect(settingsSchema.parse({ customEngines: [engine], searchEngine: engine.id }).searchEngine).toBe(engine.id);
    expect(settingsSchema.parse({ searchEngine: engine.id }).searchEngine).toBe('google');
  });
  it.each(['javascript:alert("{query}")', 'https://{query}.example.com', 'https://user:{query}@example.com', 'https://example.com/no-placeholder', 'ftp://example.com/{query}'])('rejects unsafe or non-functional template %s', template => {
    expect(customEngineSchema.safeParse({ ...engine, template }).success).toBe(false);
    expect(searchUrl('x', engine.id, [{ ...engine, template }])).toContain('google.com');
  });
  it('rejects duplicate engine IDs and too many pins', () => {
    expect(settingsSchema.safeParse({ customEngines: [engine, engine] }).success).toBe(false);
    expect(settingsSchema.safeParse({ pinnedIds: ['1','1'] }).success).toBe(false);
    expect(settingsSchema.safeParse({ pinnedIds: Array.from({ length: 25 }, (_, i) => String(i)) }).success).toBe(false);
    expect(settingsSchema.safeParse({ customEngines: Array.from({ length: 21 }, (_, i) => ({ ...engine, id: `custom-${i}` })) }).success).toBe(false);
    expect(customEngineSchema.safeParse({ ...engine, template: 'https://EXAMPLE.COM/search?q={query}' }).success).toBe(true);
    expect(customEngineSchema.safeParse({ ...engine, template: 'https://owntab-query.example/search?q={query}' }).success).toBe(true);
  });
});

describe('local pin ordering', () => {
  it('moves before and after in both directions without changing input', () => {
    const ids = ['1','2','3'];
    expect(reorderPinned(ids, '1','3','after')).toEqual(['2','3','1']);
    expect(reorderPinned(ids, '3','1','before')).toEqual(['3','1','2']);
    expect(reorderPinned(ids, '2','missing','after')).toEqual(ids);
    expect(ids).toEqual(['1','2','3']);
  });
});

describe('local backup and restore', () => {
  const original = local({ settings: settingsSchema.parse({ pinnedIds: ['a'], customEngines: [engine], searchEngine: engine.id }), recent: [{ id: 'a', openedAt: 100 }], tags: { a: ['工作'] } });
  const source = tree([bookmark('a')]);
  it('round-trips settings, engines, ordered pins, tags and recents with limited references', () => {
    const input = parseImport(exportBackup(original, source));
    const plan = planRestore(input, local(), source, 'replace');
    expect(plan.settings).toEqual(original.settings);
    expect(plan.tags).toEqual(original.tags);
    expect(plan.recent).toEqual(original.recent);
    expect(plan.matched).toBe(1);
    const raw = JSON.parse(exportBackup(original, tree([bookmark('a'), bookmark('unrelated')])));
    expect(raw.references).toHaveLength(1);
    expect(raw.references[0]).not.toHaveProperty('title');
    expect(raw).not.toHaveProperty('tree');
  });
  it('remaps changed IDs by URL and skips collisions and missing bookmarks', () => {
    const input = parseImport(exportBackup(original, source));
    const plan = planRestore(input, local(), tree([bookmark('a','https://unrelated.example'), bookmark('new','https://example.com/a')]), 'replace');
    expect(plan.settings.pinnedIds).toEqual(['new']);
    expect(plan.tags).toEqual({ new: ['工作'] });
    expect(plan.recent[0].id).toBe('new');
    expect(planRestore(input, local(), tree([]), 'replace').skipped).toBe(1);
    expect(planRestore(input, local(), tree([bookmark('b','https://example.com/a'),bookmark('c','https://example.com/a')]), 'replace').skipped).toBe(1);
  });
  it('merges tags and keeps latest recent timestamps while replace drops old local data', () => {
    const input = parseImport(exportBackup(original, source));
    const current = local({ settings: settingsSchema.parse({ pinnedIds: ['b'] }), tags: { a: ['本地'], b: ['其他'] }, recent: [{ id:'a',openedAt:200 },{id:'b',openedAt:50}] });
    const target = tree([bookmark('a'),bookmark('b')]);
    const merge = planRestore(input,current,target,'merge');
    expect(merge.settings.pinnedIds).toEqual(['b','a']);
    expect(merge.tags.a).toEqual(['本地','工作']);
    expect(merge.recent[0]).toEqual({ id:'a',openedAt:200 });
    const replace = planRestore(input,current,target,'replace');
    expect(replace.tags).toEqual({a:['工作']});
    expect(replace.recent).toEqual(original.recent);
  });
  it('accepts legacy settings without erasing tags and recents, rejects unsupported files', () => {
    const legacy = parseImport('{"version":1,"settings":{"theme":"dark"}}');
    const plan = planRestore(legacy, original, source, 'replace');
    expect(plan.tags).toEqual(original.tags);
    expect(plan.recent).toEqual(original.recent);
    expect(plan.settings.theme).toBe('dark');
    for(const text of ['{}','[]','{"version":99,"settings":{}}','{"app":"owntab","version":2}','{']) expect(() => parseImport(text)).toThrow();
    expect(defaults.customEngines).toEqual([]);
  });
  it('disambiguates duplicate URLs using the full folder path', () => {
    const input = parseImport(exportBackup(original, source));
    const target = tree([bookmark('same-path', 'https://example.com/a'), { id: 'folder', title: 'Elsewhere', parentId: '1', syncing: false, children: [{ ...bookmark('nested', 'https://example.com/a'), parentId: 'folder' }] }]);
    expect(planRestore(input,local(),target,'replace').settings.pinnedIds).toEqual(['same-path']);
  });
  it('caps merged pins and recents, normalizes tags and falls back from a missing root', () => {
    const nodes = Array.from({ length: 80 }, (_, i) => bookmark(String(i)));
    const sourceData = local({ settings: settingsSchema.parse({ rootId: 'missing', pinnedIds: nodes.slice(20,44).map(node => node.id) }), tags: { '20': ['Work', 'work', '新标签'] }, recent: nodes.slice(20,70).map((node,i) => ({ id: node.id, openedAt: i+1 })) });
    const current = local({ settings: settingsSchema.parse({ pinnedIds: nodes.slice(0,24).map(node => node.id) }), tags: { stale: ['失效'], '20':['work'] }, recent: nodes.slice(0,50).map((node,i) => ({ id: node.id, openedAt: 100+i })) });
    const plan = planRestore(parseImport(exportBackup(sourceData,tree(nodes))),current,tree(nodes),'merge');
    expect(plan.settings.rootId).toBe('1');
    expect(plan.settings.pinnedIds).toEqual(current.settings.pinnedIds);
    expect(plan.truncatedPins).toBe(20);
    expect(plan.recent).toHaveLength(50);
    expect(plan.recent[0]).toEqual({ id:'49', openedAt:149 });
    expect(plan.tags).toEqual({ '20':['work','新标签'] });
  });
  it('rejects duplicate references and oversized files before restore', () => {
    const raw = JSON.parse(exportBackup(original,source));
    raw.references.push(raw.references[0]);
    expect(() => parseImport(JSON.stringify(raw))).toThrow('重复');
    expect(() => parseImport(' '.repeat(2*1024*1024+1))).toThrow('2 MB');
  });
});
