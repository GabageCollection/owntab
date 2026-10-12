import { defineConfig } from 'wxt';
export default defineConfig({
  srcDir: 'src', modules: ['@wxt-dev/module-vue'],
  manifest: { name: 'owntab', description: '安静、清晰的 Chrome 原生书签工作台', version: '1.0.0', minimum_chrome_version: '104', permissions: ['bookmarks', 'storage', 'favicon'] },
});
