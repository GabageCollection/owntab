import { defineConfig } from 'wxt';
export default defineConfig({
  srcDir: 'src', modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'owntab',
    description: '安静、清晰的 Chrome 原生书签工作台',
    version: '1.3.0',
    minimum_chrome_version: '104',
    permissions: ['bookmarks', 'storage', 'favicon'],
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  },
});
