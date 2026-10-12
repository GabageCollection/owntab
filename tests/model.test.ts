import { describe, expect, it } from 'vitest';
import {
  defaultRoot, domain, faviconColor, folderChoices, palette, rootLabel,
  rootsOf, titleSchema, urlSchema, type Node,
} from '../src/lib/model';

const folder = (id: string, title: string, children: Node[] = [], extra: Partial<Node> & { folderType?: string } = {}): Node =>
  ({ id, title, children, syncing: false, ...extra });

describe('URL and title validation', () => {
  it.each(['https://example.com', 'http://localhost:3000/path', 'HTTPS://EXAMPLE.COM/path'])('accepts HTTP(S) URL %s', url => {
    expect(urlSchema.parse(`  ${url}  `)).toBe(url);
  });

  it.each([
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd', 'chrome://settings', 'ftp://example.com',
    'mailto:user@example.com', '//example.com', 'example.com', '',
  ])('rejects unsafe or incomplete URL %s', url => {
    expect(urlSchema.safeParse(url).success).toBe(false);
  });

  it('trims a title and preserves meaningful Unicode text', () => {
    expect(titleSchema.parse('  工作资料 🗂️ \n')).toBe('工作资料 🗂️');
  });

  it.each(['', ' ', '\n\t'])('rejects an empty or whitespace-only title %j', title => {
    const result = titleSchema.safeParse(title);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('请输入名称');
  });
});

describe('root selection and labels', () => {
  const other = folder('other-id', 'Localized other', [], { folderType: 'other' });
  const bar = folder('bar-id', 'Localized toolbar', [], { folderType: 'bookmarks-bar' });
  const legacyBar = folder('1', 'Browser-specific title');

  it('extracts only top-level folders from the browser tree', () => {
    const bookmark: Node = { id: 'link', title: 'Example', url: 'https://example.com', syncing: false };
    expect(rootsOf([folder('0', '', [other, bookmark, bar])])).toEqual([other, bar]);
    expect(rootsOf([])).toEqual([]);
    expect(rootsOf([{ id: '0', title: '', syncing: false }])).toEqual([]);
  });

  it('prefers the requested root even when its label resembles another root', () => {
    expect(defaultRoot([other, bar, legacyBar], other.id)).toBe(other);
    expect(defaultRoot([folder('custom', '书签栏'), bar], 'custom')?.id).toBe('custom');
  });

  it('falls back by folder type before legacy ID regardless of localized labels', () => {
    expect(defaultRoot([other, legacyBar, bar], 'missing')).toBe(bar);
    expect(defaultRoot([folder('custom', '书签栏'), bar])).toBe(bar);
    expect(defaultRoot([other, legacyBar], 'missing')).toBe(legacyBar);
    expect(defaultRoot([other], 'missing')).toBe(other);
    expect(defaultRoot([], 'missing')).toBeUndefined();
  });

  it('labels roots by folder type before ID, then falls back to their title', () => {
    expect(rootLabel(bar)).toBe('书签栏');
    expect(rootLabel(other)).toBe('其他书签');
    expect(rootLabel(folder('1', 'Unrelated title', [], { folderType: 'mobile' }))).toBe('移动书签');
    expect(rootLabel(legacyBar)).toBe('书签栏');
    expect(rootLabel(folder('2', 'Localized other'))).toBe('其他书签');
    expect(rootLabel(folder('3', 'Localized mobile'))).toBe('移动书签');
    expect(rootLabel(folder('custom', 'My folders'))).toBe('My folders');
  });
});

describe('folderChoices', () => {
  const leaf = folder('leaf', 'Leaf');
  const nested = folder('nested', 'Nested', [leaf]);
  const excluded = folder('excluded', 'Excluded', [nested]);
  const sibling = folder('sibling', 'Sibling');
  const bookmark: Node = { id: 'bookmark', title: 'Example', url: 'https://example.com', syncing: false };
  const tree = [folder('root', 'Root', [excluded, bookmark, sibling]), folder('other', 'Other')];

  it('lists folders in tree order with their nesting depth, omitting bookmarks', () => {
    expect(folderChoices(tree).map(({ node, depth }) => [node.id, depth])).toEqual([
      ['root', 0], ['excluded', 1], ['nested', 2], ['leaf', 3], ['sibling', 1], ['other', 0],
    ]);
  });

  it('excludes the whole subtree while preserving other folders and their depths', () => {
    expect(folderChoices(tree, 'excluded').map(({ node, depth }) => [node.id, depth])).toEqual([
      ['root', 0], ['sibling', 1], ['other', 0],
    ]);
    expect(folderChoices(tree, 'root').map(({ node }) => node.id)).toEqual(['other']);
  });
});

describe('domain colors', () => {
  it('extracts the hostname independently of protocol, path, port, and credentials', () => {
    expect(domain('https://user:password@Example.com:8443/path?q=1#anchor')).toBe('example.com');
    expect(domain('not a URL')).toBe('');
    expect(domain()).toBe('');
  });

  it.each([
    ['Example.COM/path?q=1', 'example.com'],
    ['example.com:8080/path', 'example.com'],
    ['localhost:3000/path', 'localhost'],
    ['//EXAMPLE.com/path', 'example.com'],
    ['https://例子.测试/path', 'xn--fsqu00a.xn--0zwm56d'],
    ['https://[::1]:8443/path', '[::1]'],
  ])('normalizes a hostname from %s', (value, expected) => {
    expect(domain(value)).toBe(expected);
  });

  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'about:blank', 'file:///etc/passwd', 'file://server/share',
    'javascript://example.com/alert(1)', 'data://example.com/payload',
    'mailto:user@example.com',
    'https://', 'https://exa mple.com', 'example..com/path',
    'alert(1)', 'console.log(1)', 'return document.cookie;',
    'user@example.com/path', 'not a URL', '',
  ])('uses a neutral hostname for unsafe or malformed value %j', value => {
    expect(domain(value)).toBe('');
  });

  it('assigns deterministic palette colors independent of hostname casing', () => {
    const expected = faviconColor('example.com');
    expect(palette).toContainEqual(expected);
    expect(faviconColor('EXAMPLE.COM')).toEqual(expected);
    faviconColor('unrelated.example');
    expect(faviconColor('example.com')).toEqual(expected);
    expect(faviconColor(domain('https://example.com/first'))).toEqual(
      faviconColor(domain('http://example.com/second')),
    );
    expect(palette).toContainEqual(faviconColor(''));
  });
});
