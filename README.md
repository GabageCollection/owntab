# owntab

Vue 3 + TypeScript + WXT 构建的 Chrome 新标签页书签工作台。原生 Chrome 书签是唯一数据源，无账号、无后端、无埋点。

当前本地版本：**1.3.0**。完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 本地安装与更新

本项目供本地自用，通过开发者模式加载，无需 Chrome Web Store 账号。

1. 打开 Chrome 的 `chrome://extensions`，开启“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本仓库的 `.output/chrome-mv3` 目录。
3. 新建标签页，即可使用 owntab。

也可以将本地生成的 `.output/owntab-1.3.0-chrome.zip` 解压到固定目录后加载。Chrome 加载的是解压后的目录，使用期间请保留它。已有 [GitHub Release](https://github.com/GabageCollection/owntab/releases/tag/v1.2.0) 仍为历史 V1.2.0 包。

更新时运行 `pnpm build`，或将新版 ZIP 解压覆盖到原来的加载目录，再到 `chrome://extensions` 点击 owntab 的“重新加载”，并重新打开新标签页。使用同一目录和同一扩展条目更新，保留本地设置；更新前可在设置中导出本地备份。原生书签由 Chrome 独立管理，需用 Chrome 的书签导出功能备份。

## 开发与构建

需要 Node.js 22+ 与 pnpm（本项目使用 pnpm 12）。

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm test:browser
node tests/real-chrome-check.mjs
pnpm test:performance
pnpm build
pnpm zip
```

生产构建输出到 `.output/chrome-mv3`，ZIP 输出到 `.output/owntab-1.3.0-chrome.zip`。`pnpm dev` 是 WXT 的开发模式，日常使用采用 `pnpm build` 的产物。

## 功能

- 默认进入书签栏，按 Chrome 节点标识识别根目录，可切换其他书签和移动书签（浏览器提供时）。
- 文件夹浏览、面包屑、favicon 与域名字母降级、四/三/两列响应式布局。
- 新建书签/文件夹、编辑、移动、二次确认删除；禁止移动到自身子树，API 失败保留表单。
- 后台统一校验和执行书签 API。创建、删除、修改、移动、排序和导入事件触发刷新，多标签页最终一致。
- 浅色、深色、跟随系统；默认目录、密度、在新标签打开设置。
- 命令面板（`/` 或 `⌘/Ctrl+K`）搜索书签、文件夹与标签，结果分组展示，无匹配时可直接跳搜索引擎。
- 最近使用视图记录打开过的书签；置顶栏固定常用书签；网格与列表双视图；拖拽排序与跨文件夹移动。
- 本地标签分组、重复书签与失效链接检测。
- 自定义搜索引擎：设置中维护带 `{query}` 的网址模板，主页与搜索面板共用，支持 ⌘/Ctrl+Enter 直接搜索。
- 置顶栏独立排序：拖拽或 Alt+Shift+←/→，刷新与多页面同步，不改变原生书签顺序。
- 完整本地备份：设置、自定义引擎、置顶顺序、最近使用、标签；导入预览后合并或替换，兼容旧设置文件。只恢复已存在的书签引用，无法匹配的条目跳过。
- F6/Shift+F6 切换区域，↑↓/Home/End 导航，文件夹 → 进入、← 返回并恢复焦点；Esc 关闭，`?` 查看说明。输入法组词不触发快捷键。

## 权限与隐私

仅申请 `bookmarks`、`storage`、`favicon`，最低 Chrome 104。`bookmarks` 安装提示为读取和更改书签。书签只在本机读取和修改，不上传到 owntab 服务器；浏览器自身的 Chrome Sync 仍由 Chrome 设置管理。偏好、自定义引擎、置顶 ID 与顺序、最近使用和标签写入 `chrome.storage.local`，不复制书签数据库。手动导出的本地备份额外包含这些条目引用的网址与文件夹路径，用于跨 ID 匹配；没有完整书签树，不能重建原生书签。图标使用 Chrome 本地 `_favicon` 服务，不连接第三方图标服务。网页搜索会打开所选引擎并传入搜索词；失效链接检测由页面直接发起请求，目标站点会看到你的 IP。

创建和编辑网址仅接受完整 http/https URL。已有的特殊协议书签仍显示；对可能执行代码或不安全的协议禁用直接打开，可通过 Chrome 原生书签管理器操作。

断网仍可浏览和编辑本地书签，打开外部网站需要该网站正常可用。Chrome 扩展不能覆盖隐身窗口的新标签页。

## 验证

自动测试覆盖输入校验、域名降级、根目录回退、数据遍历、图标颜色、书签 API 错误和编辑保护，以及事件消息容量、导入去重、主题初始化和监听清理。浏览器检查使用模拟 Chrome API 验证生产界面；截图输出到被 Git 忽略的 artifacts 目录。实际 Chrome 验收清单与本次验证结果见 `docs/ACCEPTANCE.md`。安装扩展会直接编辑当前 Chrome 配置的真实书签，建议人工验收时使用独立的测试配置。

首屏性能测量与优化记录见 [docs/PERFORMANCE.md](docs/PERFORMANCE.md)。`test:performance` 使用独立临时 Chrome for Testing profile，不修改日常 Chrome 书签；可用 `OWNTAB_CHROME` 指定测试浏览器，`OWNTAB_PERF_MODE=cold-worker` 测量后台停止后的页面启动。
