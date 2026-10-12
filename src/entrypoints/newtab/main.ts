import { createApp } from 'vue';
import App from '../../App.vue';
import '../../assets/styles.css';
import { defaults, settingsSchema, type Settings } from '../../lib/model';

// Resolve the stored settings and theme before mounting the interface.
async function boot() {
  let initialSettings: Settings = { ...defaults };
  try {
    const stored = await chrome.storage.local.get('settings');
    const parsed = settingsSchema.safeParse(stored.settings ?? {});
    if (parsed.success) initialSettings = parsed.data;
  } catch {
    // Storage failures still allow the bookmark interface to mount.
  }
  const theme = initialSettings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : initialSettings.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  createApp(App, { initialSettings }).mount('#app');
}

void boot();
