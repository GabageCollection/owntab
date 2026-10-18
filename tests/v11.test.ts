import { describe, expect, it, vi } from 'vitest';
import { checkLinks, duplicateGroups, engine, normalizeLinkResult, scoreQuery, searchUrl, settingsSchema, type Node } from '../src/lib/model';

const bookmark = (id: string, title: string, url: string, parentId = '1'): Node => ({ id, parentId, title, url, syncing: false });
const folder = (id: string, title: string, children: Node[] = [], parentId = '1'): Node => ({ id, parentId, title, children, syncing: false });

describe('settings schema V1.1 fields', () => {
  it('defaults new fields without breaking stored V1 settings', () => {
    const parsed = settingsSchema.parse({ theme: 'dark', rootId: '2', density: 'compact', openInNewTab: true });
    expect(parsed.view).toBe('grid');
    expect(parsed.showSearchBar).toBe(true);
    expect(parsed.searchEngine).toBe('google');
    expect(parsed.showClock).toBe(false);
    expect(parsed.pinnedIds).toEqual([]);
  });

  it('rejects invalid view values', () => {
    expect(settingsSchema.safeParse({ view: 'masonry' }).success).toBe(false);
  });
});

describe('scoreQuery', () => {
  it('ranks exact, prefix, contains and letter matches in order', () => {
    const query = 'git';
    const exact = scoreQuery('Git', '', '', query)!;
    const prefix = scoreQuery('GitHub Docs', '', '', query)!;
    const contains = scoreQuery('My Git notes', '', '', query)!;
    const none = scoreQuery('example', 'https://example.com', 'example.com', query);
    expect(exact).toBeLessThan(prefix);
    expect(prefix).toBeLessThan(contains);
    expect(none).toBeUndefined();
  });

  it('matches against host and url as well as title', () => {
    expect(scoreQuery('', 'https://github.com/x', 'github.com', 'gith')).toBeDefined();
    expect(scoreQuery('GitHub', 'https://github.com', 'github.com', 'zzz')).toBeUndefined();
  });

  it('returns undefined for empty query', () => {
    expect(scoreQuery('anything', '', '', '   ')).toBeUndefined();
  });
});

describe('searchUrl and engine', () => {
  it('builds encoded search URLs for every engine', () => {
    expect(searchUrl('hello world', 'google')).toBe('https://www.google.com/search?q=hello%20world');
    expect(searchUrl('你好', 'baidu')).toContain('https://www.baidu.com/s?wd=');
    expect(searchUrl('a+b', 'bing')).toBe('https://www.bing.com/search?q=a%2Bb');
    expect(searchUrl('test', 'duckduckgo')).toBe('https://duckduckgo.com/?q=test');
    expect(searchUrl('repo', 'github')).toContain('https://github.com/search?q=repo');
  });

  it('falls back to google for unknown engine ids', () => {
    expect(engine('unknown')).toBe('google');
    expect(searchUrl('x', 'unknown')).toContain('google.com');
  });
});

describe('duplicateGroups', () => {
  it('groups bookmarks with equivalent urls and records folder paths', () => {
    const tree = [folder('0root', '', [
      folder('work', '工作', [bookmark('a', 'A', 'https://example.com/page/'), bookmark('b', 'B', 'https://example.com/page')], '1'),
      folder('misc', '杂项', [bookmark('c', 'C', 'https://example.com/page#section')], '1'),
      folder('unique', '唯一', [bookmark('d', 'D', 'https://other.com')], '1'),
    ], '0')];
    const groups = duplicateGroups(tree);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodes).toHaveLength(3);
    expect(groups[0].nodes.map(n => n.path)).toContain('工作');
  });

  it('ignores non-http urls', () => {
    const tree = [folder('f', 'F', [bookmark('a', 'A', 'javascript:void(0)'), bookmark('b', 'B', 'javascript:void(0)')], '1')];
    expect(duplicateGroups(tree)).toHaveLength(0);
  });
});

describe('link checking', () => {
  it('normalizes fetch results into statuses', () => {
    expect(normalizeLinkResult(200, true)).toBe('ok');
    expect(normalizeLinkResult(404, false)).toBe('broken');
    expect(normalizeLinkResult(0, false)).toBe('unknown');
    expect(normalizeLinkResult(405, false)).toBe('unknown');
    expect(normalizeLinkResult(301, true)).toBe('ok');
  });

  it('reports broken for fetch failures and ok for successes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('dead')) throw new Error('network down');
      return { status: 200, ok: true } as Response;
    });
    const nodes = [bookmark('ok1', 'ok', 'https://live.example.com'), bookmark('bad1', 'bad', 'https://dead.example.com')];
    const results = [];
    for await (const result of checkLinks(nodes, { fetchImpl })) results.push(result);
    expect(results).toHaveLength(2);
    expect(results.find(r => r.node.id === 'ok1')?.status).toBe('ok');
    expect(results.find(r => r.node.id === 'bad1')?.status).toBe('broken');
  });
});
