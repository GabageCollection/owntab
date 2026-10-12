import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../src/composables/useSettings';
import { defaults } from '../src/lib/model';

const app = vi.hoisted(() => ({ mount: vi.fn(), createApp: vi.fn() }));
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  createApp: app.createApp,
}));
vi.mock('../src/App.vue', () => ({ default: {} }));

type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
let root: { dataset: { theme: string }; style: { colorScheme: string } };
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let mediaListeners: Set<() => void>;
let storageListeners: Set<StorageListener>;
let get: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;
let removeListener: ReturnType<typeof vi.fn>;
const active: ReturnType<typeof useSettings>[] = [];

function settings(initial?: Parameters<typeof useSettings>[0]) {
  const result = useSettings(initial);
  active.push(result);
  return result;
}
function systemTheme(dark: boolean) {
  media.matches = dark;
  for (const listener of mediaListeners) listener();
}
function stored(value: unknown, area = 'local') {
  for (const listener of storageListeners) listener({ settings: { newValue: value } }, area);
}
function expectTheme(theme: string) {
  expect(root.dataset.theme).toBe(theme);
  expect(root.style.colorScheme).toBe(theme);
}

beforeEach(() => {
  vi.resetModules();
  root = { dataset: { theme: 'dark' }, style: { colorScheme: 'dark' } };
  mediaListeners = new Set();
  storageListeners = new Set();
  media = {
    matches: false,
    addEventListener: vi.fn((_event, listener) => mediaListeners.add(listener)),
    removeEventListener: vi.fn((_event, listener) => mediaListeners.delete(listener)),
  };
  get = vi.fn().mockResolvedValue({ settings: { theme: 'dark' } });
  set = vi.fn().mockResolvedValue(undefined);
  removeListener = vi.fn(listener => storageListeners.delete(listener));
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  vi.stubGlobal('chrome', {
    storage: {
      local: { get, set },
      onChanged: { addListener: vi.fn(listener => storageListeners.add(listener)), removeListener },
    },
  });
  app.mount.mockClear();
  app.createApp.mockReset().mockReturnValue({ mount: app.mount });
});

afterEach(() => {
  for (const instance of active.splice(0)) instance.dispose();
  vi.unstubAllGlobals();
});

describe('settings theme lifecycle', () => {
  it('preserves bootstrap theme before fallback load, including media changes', async () => {
    let resolve!: (value: unknown) => void;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const state = settings();
    expectTheme('dark');
    const loading = state.load();
    systemTheme(true);
    systemTheme(false);
    expectTheme('dark');
    resolve({ settings: { theme: 'dark', density: 'compact' } });
    await loading;
    expectTheme('dark');
    expect(state.settings.value.density).toBe('compact');
    systemTheme(false);
    expectTheme('dark');
  });

  it('uses passed settings without a storage read and follows system changes only for auto', () => {
    const state = settings({ ...defaults, theme: 'light', rootId: 'other' });
    expect(get).not.toHaveBeenCalled();
    expectTheme('light');
    systemTheme(true);
    expectTheme('light');
    stored({ theme: 'auto' });
    expectTheme('dark');
    systemTheme(false);
    expectTheme('light');
    expect(state.settings.value.theme).toBe('auto');
  });

  it('applies saved settings and storage changes while ignoring other storage areas', async () => {
    const state = settings({ ...defaults, theme: 'dark' });
    await state.save({ ...defaults, theme: 'light', openInNewTab: true });
    expect(set).toHaveBeenCalledWith({ settings: { ...defaults, theme: 'light', openInNewTab: true } });
    expectTheme('light');
    stored({ theme: 'dark' }, 'sync');
    expectTheme('light');
    stored({ theme: 'dark', rootId: 'custom' });
    expectTheme('dark');
    expect(state.settings.value.rootId).toBe('custom');
    stored({ theme: 'invalid' });
    expect(state.settings.value).toEqual(defaults);
    expectTheme('light');
    stored(undefined);
    expect(state.settings.value).toEqual(defaults);
  });

  it('falls back to defaults when storage fails, without rejecting load', async () => {
    get.mockRejectedValue(new Error('Storage unavailable'));
    systemTheme(true);
    const state = settings();
    await expect(state.load()).resolves.toBeUndefined();
    expect(state.settings.value).toEqual(defaults);
    expectTheme('dark');
    systemTheme(false);
    expectTheme('light');
  });

  it('does not apply a failed save', async () => {
    const state = settings({ ...defaults, theme: 'dark' });
    set.mockRejectedValue(new Error('Write failed'));
    await expect(state.save({ ...defaults, theme: 'light' })).rejects.toThrow('Write failed');
    expect(state.settings.value.theme).toBe('dark');
    expectTheme('dark');
  });

  it('removes both listeners and ignores an in-flight load after disposal', async () => {
    let resolve!: (value: unknown) => void;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const state = settings();
    const loading = state.load();
    state.dispose();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', media.addEventListener.mock.calls[0][1]);
    expect(removeListener).toHaveBeenCalledOnce();
    expect(mediaListeners.size).toBe(0);
    expect(storageListeners.size).toBe(0);
    systemTheme(false);
    stored({ theme: 'light' });
    resolve({ settings: { theme: 'light' } });
    await loading;
    expectTheme('dark');
  });
});

describe('new tab bootstrap', () => {
  it('reads settings once and applies the theme before passing parsed settings to App', async () => {
    get.mockResolvedValue({ settings: { theme: 'dark', rootId: 'custom' } });
    app.createApp.mockImplementation((_component, props) => {
      expectTheme('dark');
      settings(props.initialSettings);
      return { mount: app.mount };
    });
    await import('../src/entrypoints/newtab/main');
    await vi.waitFor(() => expect(app.mount).toHaveBeenCalledWith('#app'));
    expect(get).toHaveBeenCalledExactlyOnceWith('settings');
    expect(app.createApp.mock.calls[0][1]).toEqual({ initialSettings: { ...defaults, theme: 'dark', rootId: 'custom' } });
    expectTheme('dark');
  });

  it.each(['failure', 'invalid'])('mounts with default settings after storage %s', async kind => {
    systemTheme(true);
    if (kind === 'failure') get.mockRejectedValue(new Error('Storage unavailable'));
    else get.mockResolvedValue({ settings: { theme: 'invalid' } });
    await import('../src/entrypoints/newtab/main');
    await vi.waitFor(() => expect(app.mount).toHaveBeenCalledWith('#app'));
    expect(app.createApp.mock.calls[0][1]).toEqual({ initialSettings: defaults });
    expectTheme('dark');
  });
});
