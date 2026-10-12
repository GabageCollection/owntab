# owntab

Vue 3 + TypeScript + WXT 构建的 Chrome 新标签页书签工作台。原生 Chrome 书签是唯一数据源，无账号、无后端、无埋点。

## 开发与构建

需要 Node.js 22+ 与 pnpm（本项目使用 pnpm 12）。

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm zip
```

生产构建输出到 `.output/chrome-mv3`。打开 Chrome 的 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，选择该目录，然后新建标签页。更新构建后在扩展页点击重新加载。`pnpm dev` 是 WXT 的开发模式，生产使用 `pnpm build`。

## 功能

- 默认进入书签栏，按 Chrome 节点标识识别根目录，可切换其他书签和移动书签（浏览器提供时）。
- 文件夹浏览、面包屑、favicon 与域名字母降级、四/三/两列响应式布局。
- 新建书签/文件夹、编辑、移动、二次确认删除；禁止移动到自身子树，API 失败保留表单。
- 后台统一校验和执行书签 API。创建、删除、修改、移动、排序和导入事件触发刷新，多标签页最终一致。
- 浅色、深色、跟随系统；默认目录、密度、在新标签打开设置。
- Tab/Shift+Tab 导航，文件夹 → 进入，← 返回，↑↓ 在卡片和菜单中移动，Esc 关闭菜单和弹窗。原生 dialog 提供焦点限制与恢复。

## 权限与隐私

仅申请 `bookmarks`、`storage`、`favicon`，最低 Chrome 104。`bookmarks` 安装提示为读取和更改书签。书签只在本机读取和修改，不上传到 owntab 服务器；浏览器自身的 Chrome Sync 仍由 Chrome 设置管理。仅主题、默认根目录、密度和打开方式写入 `chrome.storage.local`，不复制书签数据库。图标使用 Chrome 本地 `_favicon` 服务，不连接第三方图标服务。

创建和编辑网址仅接受完整 http/https URL。已有的特殊协议书签仍显示；对可能执行代码或不安全的协议禁用直接打开，可通过 Chrome 原生书签管理器操作。

断网仍可浏览和编辑本地书签，打开外部网站需要该网站正常可用。Chrome 扩展不能覆盖隐身窗口的新标签页。

## 验证

自动测试覆盖输入校验、域名降级、根目录回退、数据遍历、图标颜色、书签 API 错误和编辑保护，以及事件消息容量、导入去重、主题初始化和监听清理。浏览器检查使用模拟 Chrome API 验证生产界面；截图输出到被 Git 忽略的 artifacts 目录。实际 Chrome 验收清单与本次验证结果见 `docs/ACCEPTANCE.md`。安装扩展会直接编辑当前 Chrome 配置的真实书签，建议人工验收时使用独立的测试配置。
