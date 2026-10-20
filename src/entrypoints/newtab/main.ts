import { createApp } from 'vue';
import App from '../../App.vue';
import '../../assets/styles.css';
import { defaults, recentSchema, settingsSchema, tagsSchema, type RecentEntry, type Settings, type TagMap } from '../../lib/model';

/** Older builds stored arrays as {"0": ...} objects; normalize them back. */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value as Record<string, T>);
  return [];
}

// Resolve stored settings, recent bookmarks, and tags in one read before mounting.
async function boot() {
  let initialSettings: Settings = { ...defaults };
  let initialRecent: RecentEntry[] = [];
  let initialTags: TagMap = {};
  try {
    const stored = await chrome.storage.local.get(['settings', 'recent', 'tags']);
    const parsed = settingsSchema.safeParse(stored.settings ?? {});
    if (parsed.success) initialSettings = parsed.data;
    const recent = recentSchema.safeParse(toArray(stored.recent));
    if (recent.success) initialRecent = recent.data;
    const tags = tagsSchema.safeParse(stored.tags ?? {});
    if (tags.success) initialTags = tags.data;
  } catch {
    // Storage failures still allow the bookmark interface to mount.
  }
  const theme = initialSettings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : initialSettings.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  createApp(App, { initialSettings, initialRecent, initialTags }).mount('#app');
}

void boot();
