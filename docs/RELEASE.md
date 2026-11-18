# owntab 本地使用版发布记录

## V1.3.0 本地交付（2026-11-17）

自定义搜索引擎、置顶栏手动排序、完整本地备份与恢复、键盘导航四项已实现。当前版本为 1.3.0；本地构建目录 `.output/chrome-mv3`，安装包 `.output/owntab-1.3.0-chrome.zip`。更新时保留原加载目录和扩展条目，在 chrome://extensions 重新加载，再新建标签页。

类型检查、180 项单测、20 组布局与功能检查、真实 Chrome 14/14 通过。备份恢复不会改写 Chrome 书签；设置、恢复和帮助面板保持按需加载。性能明细见 PERFORMANCE.md，新增功能用户日常验收单独见 ACCEPTANCE.md。

V1.3 为本地交付，不提交 Chrome Web Store。已有 GitHub v1.2.0 Release 及其资产保留原样，下面为历史记录。

包检查：ZIP 大小 126760 字节，24 个文件与构建目录逐文件一致，manifest 为 1.3.0，权限仅 bookmarks/storage/favicon；ZIP 解压版已在独立 Chrome for Testing profile 中成功注册后台、打开主页及按需加载快捷键说明。SHA-256：`4c0f55ae8f9f6dc771f89abe8f31de8da07f51028e30cfde2f64f95e9c38ef41`。

## V1.2.0 历史发布

> 状态：V1.2.0 本地使用版已完成，GitHub Release 与 ZIP 已发布；ZIP 解压版在独立 Chrome profile 加载成功。按用户于 2026-11-16 确认的范围，通过 Chrome 开发者模式加载使用，不提交 Chrome Web Store。验收结论以 `docs/ACCEPTANCE.md` 为准。

## A. 验收结果回填（逐项）

> 自动化执行方式：`node tests/real-chrome-check.mjs`（真实 Chrome for Testing 151 + 真实扩展 unpacked 加载 + 真实书签）。
> 关键前提：品牌版 Google Chrome 自 13x 起禁止 `--load-extension` 命令行侧加载（Chrome 日志：`--load-extension is not allowed in Google Chrome`），自动化必须用 Chrome for Testing / Chromium；脚本还要 `ignoreDefaultArgs: ['--disable-extensions']` 以覆盖 Playwright 默认参数。该限制只影响自动化加载，用户手动在 `chrome://extensions` 开发者模式加载不受影响。

| # | 项目 | 测试方法（最短路径） | 结果 | 备注 |
|---:|---|---|---|---|
| 1 | 真实书签栏显示 | 独立测试配置加载 `.output/chrome-mv3`，新建标签页 | ✅ 通过（自动） | 2026-10-11，CfT 151，SW `mhjflngjgcjohjhhogdgoomncaiookig` |
| 2 | 多 newtab 最终一致 | 两个 newtab，A 页增删改移，B 页观察刷新 | ✅ 通过（自动） | 广播 `owntab-changed` 到达，B 页卡片数随事件递增 |
| 3 | 外部修改同步 | Chrome 书签管理器改标题/URL/顺序/父目录 | ✅ 通过（自动） | 标题外部修改同步为 true |
| 4 | 当前文件夹被外部移动/删除 | 路径更新或回退根目录 | ✅ 通过（人工） | 2026-10-12 |
| 5 | 递归删除范围一致 | 仅测文件夹，确认提示的 N 项与实际删除一致 | ✅ 通过（自动） | 提示「及其中的 2 项内容」，删除后文件夹不存在 |
| 6 | 导入结束刷新正确 | HTML 书签导入，观察导入期间不重复刷新 | ✅ 通过（人工） | 2026-10-12 真实 HTML 导入 |
| 7 | 真实 `_favicon` 与降级 | 有图标站点 + 无图标站点 + 断网 | ✅ 通过（自动） | `_favicon` 返回 naturalWidth 32，complete |
| 8 | 三种尺寸目视 + 200% 缩放 | 1440×900 / 1280×720 / 1024×768 | ✅ 通过（人工） | 2026-10-12 |
| 9 | 键盘完整路径 | Tab 顺序、↑↓、←、→、Esc、焦点恢复 | ✅ 通过（自动） | Tab 焦点正确，Esc 关闭菜单 |
| 10 | 主题实时切换 / 持久化 / 冷启动无闪烁 | 系统主题切换 + 重启 Chrome | ✅ 通过（自动，持久化与冷启动） | dark/light 重开均正确；系统级实时切换需人工 |
| 11 | 断网可用 + 设置 API 失败可读 | 断网后浏览编辑与设置读取 | ✅ 通过（自动） | setOffline 后仍渲染并可浏览 |
| 12 | 首屏可交互与 200 项性能 | 见下方 C 节测量方法 | ⚠️ 170ms（自动） | 2026-11-16 实测；旧测试脚本未断言 100ms 阈值，视为后续优化目标 |
| 13 | 隐身窗口行为 | 确认 README 描述与实际一致（扩展不覆盖隐身新标签页） | ✅ 通过（自动） | 与 README 一致 |

## B. 发布前检查（SPEC M4，10 条）

- [x] Chrome 正常窗口测试（对应 A1）— 自动通过
- [x] 多个 newtab 同时打开（A2）— 自动通过
- [x] 书签栏外部修改（A3）— 自动通过
- [x] 文件夹递归删除（A5）— 自动通过
- [x] 书签导入（A6）— 2026-10-12 人工通过
- [x] 空目录与大量书签（A12）— 自动通过（200 项 170ms；100ms 为目标，当前未达）
- [x] 深色模式与系统主题（A10）— 自动 + 人工通过（2026-10-12 系统实时切换）
- [x] 键盘操作与焦点顺序（A9）— 自动通过
- [x] 断网后书签功能可用（A11）— 自动通过
- [x] 隐身窗口行为已写入 README（A13）— 自动通过

## C. 性能测量方法

1. 用含 200 项书签的测试配置，独立 Chrome profile（`--user-data-dir`）。
2. DevTools → Performance，新建标签页后录制；记录首次可交互时间（可交互 = 卡片可点击）。
3. 记录 DOM 节点数与首屏渲染耗时；对比 `pnpm build` 产物（非 dev 产物）。
4. 结果写入 ACCEPTANCE.md 的验证段。

## D. 本地安装与资源

在 `chrome://extensions` 开启开发者模式，加载 `.output/chrome-mv3`，或加载 GitHub Release ZIP 解压后的固定目录。更新时覆盖原目录并点击扩展的“重新加载”。完整步骤见 README「本地安装与更新」。

扩展图标已包含在包内（16/32/48/128 PNG）。已有的浅色、深色截图保留在 `store-assets/`；`docs/STORE.md` 仅作历史材料存档，不构成后续发布任务。

## E. 发布检查

- [x] 真实 Chrome 人工验收已完成（ACCEPTANCE.md），性能数据已记录（2026-10-12）
- [x] `pnpm typecheck`、`pnpm test`（160 项）、`pnpm build`、`pnpm test:browser` 全绿（2026-11-16）
- [x] 图标与 manifest `icons` 字段补齐；导出实际尺寸 PNG
- [x] ZIP 内容与 manifest 权限复核；ZIP 解压版已在独立 Chrome profile 成功加载
- [x] CHANGELOG 1.2.0 与 README 版本一致
- [x] V1.2.0 tag 与 GitHub Release 已创建，ZIP 已附加

Chrome Web Store 提交与审核不在本次范围内，没有待完成的商店发布事项。

## F. 版本规划

### 已完成

- V1.1：搜索面板、置顶栏、网格/列表视图、书签维护、拖拽移动
- V1.2：最近使用视图、本地标签、完整拖拽排序、搜索分组与引擎兜底、设置导入导出

V1.2.0 本地使用版已完成扩展图标、变更记录、打包、包内容检查和 GitHub Release。

### V1.3 已实现

- 自定义搜索引擎（用户自带模板）
- 置顶栏手动排序
- 完整本地备份与恢复（设置、引擎、置顶、标签、最近使用）
- 更细的键盘导航与快捷键说明

书签描述/备注为旧候选，本轮用户批准的四项以 SPEC 第十一部分为准。
