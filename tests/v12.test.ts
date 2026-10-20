import { describe, expect, it } from 'vitest';
import {
  moveIndex,
  normalizeTags,
  pinnedSchema,
  pruneTags,
  recentNodes,
  recordRecent,
  settingsFromExport,
  settingsSchema,
  settingsToExport,
  toPlain,
  type Node,
  type RecentEntry,
} from '../src/lib/model';

const bookmark = (id: string, title: string, url: string, parentId = '1'): Node => ({ id, parentId, title, url, syncing: false });
const folder = (id: string, title: string, children: Node[] = [], parentId = '1'): Node => ({ id, parentId, title, children, syncing: false });

describe('recent bookmarks', () => {
  it('deduplicates, moves the newest entry first, and caps at 50', () => {
    const entries: RecentEntry[] = Array.from({ length: 50 }, (_, index) => ({ id: String(index), openedAt: index }));
    const next = recordRecent(entries, '10', 999);
    expect(next[0]).toEqual({ id: '10', openedAt: 999 });
    expect(next.filter(entry => entry.id === '10')).toHaveLength(1);
    expect(next).toHaveLength(50);
    expect(next.at(-1)?.id).toBe('49');
  });

  it('resolves only bookmarks that still exist', () => {
    const tree = [folder('0', '', [folder('1', 'Bar', [bookmark('a', 'A', 'https://a.example')])])];
    const entries = [{ id: 'a', openedAt: 1 }, { id: 'missing', openedAt: 2 }];
    expect(recentNodes(tree, entries).map(item => item.node.id)).toEqual(['a']);
  });
});

describe('tags', () => {
  it('normalizes comma-separated tags, removes duplicates, and caps limits', () => {
    expect(normalizeTags(' Work, work，设计,  ,设计 ')).toEqual(['Work', '设计']);
    expect(normalizeTags(Array.from({ length: 12 }, (_, index) => `tag-${index}`))).toHaveLength(8);
    expect(normalizeTags(['a'.repeat(40)])[0]).toHaveLength(24);
  });

  it('prunes tags for deleted or non-bookmark nodes', () => {
    const tree = [folder('1', 'Bar', [bookmark('a', 'A', 'https://a.example'), folder('b', 'Folder')])];
    expect(pruneTags({ a: ['keep'], b: ['drop'], missing: ['drop'] }, tree)).toEqual({ a: ['keep'] });
  });
});

describe('drag ordering', () => {
  const children = [bookmark('a', 'A', 'https://a.example'), bookmark('b', 'B', 'https://b.example'), bookmark('c', 'C', 'https://c.example')];

  it('computes indices after removing the dragged node', () => {
    expect(moveIndex(children, 'a', 'c', 'before')).toBe(1);
    expect(moveIndex(children, 'a', 'c', 'after')).toBe(2);
    expect(moveIndex(children, 'c', 'a', 'before')).toBe(0);
    expect(moveIndex(children, 'b', 'c', 'before')).toBe(1);
  });

  it('returns -1 when the target is missing', () => {
    expect(moveIndex(children, 'a', 'missing', 'before')).toBe(-1);
  });
});

describe('settings import and export', () => {
  it('round-trips a complete settings object', () => {
    const settings = settingsSchema.parse({
      theme: 'dark', rootId: '2', density: 'compact', openInNewTab: true,
      view: 'list', showSearchBar: false, searchEngine: 'baidu', showClock: true, pinnedIds: ['a'],
    });
    expect(settingsFromExport(settingsToExport(settings))).toEqual(settings);
  });

  it('accepts a bare settings object and rejects malformed files', () => {
    expect(settingsFromExport('{"theme":"light"}').theme).toBe('light');
    expect(() => settingsFromExport('{')).toThrow('设置文件不是有效的 JSON');
    expect(() => settingsFromExport('{"view":"masonry"}')).toThrow('设置文件格式不正确');
  });

  it('enforces the pinned bookmark limit', () => {
    expect(pinnedSchema.safeParse(Array.from({ length: 25 }, (_, index) => String(index))).success).toBe(false);
  });
});

describe('toPlain', () => {
  it('converts a reactive proxy into a plain array that Chrome can store', () => {
    // Chrome's storage API serializes proxies as {"0": ...} objects.
    const target = [{ id: 'a', openedAt: 1 }];
    const proxied = new Proxy(target, { get: (t, p, r) => Reflect.get(t, p, r) });
    const plain = toPlain(proxied);
    expect(Array.isArray(plain)).toBe(true);
    expect(plain).toEqual([{ id: 'a', openedAt: 1 }]);
    expect(JSON.stringify(plain)).toBe('[{"id":"a","openedAt":1}]');
  });

  it('keeps plain objects untouched in shape', () => {
    expect(toPlain({ a: ['x'] })).toEqual({ a: ['x'] });
  });
});
