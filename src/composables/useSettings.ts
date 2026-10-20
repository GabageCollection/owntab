import { ref } from 'vue';
import { defaults, settingsSchema, toPlain, type Settings } from '../lib/model';

export function useSettings(initialSettings?: Settings) {
  const settings = ref<Settings>(initialSettings ? { ...initialSettings } : { ...defaults });
  const media = matchMedia('(prefers-color-scheme: dark)');
  let ready = initialSettings !== undefined;
  let disposed = false;

  function apply() {
    if (!ready || disposed) return;
    const theme = settings.value.theme === 'auto' ? (media.matches ? 'dark' : 'light') : settings.value.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function update(value: unknown) {
    if (disposed) return;
    const parsed = settingsSchema.safeParse(value ?? {});
    settings.value = parsed.success ? parsed.data : { ...defaults };
    ready = true;
    apply();
  }

  async function load() {
    try {
      const data = await chrome.storage.local.get('settings');
      update(data.settings);
    } catch {
      update(defaults);
    }
  }

  async function save(value: Settings) {
    const parsed = settingsSchema.parse(value);
    // The parsed value may still be a reactive proxy; store a plain object.
    await chrome.storage.local.set({ settings: toPlain(parsed) });
    update(parsed);
  }

  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && changes.settings) update(changes.settings.newValue);
  }

  media.addEventListener('change', apply);
  chrome.storage.onChanged.addListener(changed);

  function dispose() {
    disposed = true;
    media.removeEventListener('change', apply);
    chrome.storage.onChanged.removeListener(changed);
  }

  if (ready) apply();
  return { settings, load, save, dispose };
}
