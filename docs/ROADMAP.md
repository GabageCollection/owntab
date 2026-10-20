# owntab 编码实施路线图

> 版本：v1.0 · 2026-10-08
> 依据：SPEC.md v1.0（2026-10-08 用户审查通过，已启动）
> 定位：开发执行计划，不替代 SPEC.md，所有规格以 SPEC.md 为准

---

## 总览

| 阶段 | 对应里程碑 | 预计 | 产出 |
|---|---|---:|---|
| 第 0 步 | M0 | 0.5 天 | WXT 脚手架 + 书签读取垂直切片 |
| 第 1 步 | M1 前半 | 0.5 天 | 设计系统 token + 主题切换 |
| 第 2 步 | M1 后半 | 0.5 天 | background 书签数据层 + 事件广播 |
| 第 3 步 | M1–M2 | 1.5 天 | P0 组件 + 只读浏览（好看的书签浏览器） |
| 第 4 步 | M3 | 1.5–2 天 | 编辑 CRUD + 弹窗 + 错误状态 |
| 第 5 步 | M4 | 0.5–1 天 | 设置面板 + 键盘导航 + 全面验收 |
| **合计** | | **4–6 天** | 不含商店审核 |

原则：每一步结束都有可演示的产出，不会到最后一天才第一次打开浏览器。

---

## 第 0 步：项目脚手架（M0，约 0.5 天）

### 目标

打通「构建 → 加载 → 读取书签」全链路的最小垂直切片。

### 任务

```bash
pnpm create wxt@latest owntab --template vue
```

1. 初始化 WXT + Vue 3 + TypeScript，安装 `zod`、`vitest`；
2. 配置 `wxt.config.ts`：
   - `manifest.chrome_url_overrides.newtab` 指向入口页面；
   - `permissions: ["bookmarks", "storage", "favicon"]`，一个都不多申请；
3. 最小验证：newtab 页面加载时调 `chrome.bookmarks.getTree()`，把 Bookmarks bar 的直接子项标题打印到页面；
4. unpacked 加载到 Chrome 验证。

### 验收标准

打开新标签页能看到自己书签栏的子项列表（无样式也行）。权限、API、构建链路全部打通，后面全是往里填肉。

---

## 第 1 步：设计系统落地（M1 前半，约 0.5 天）

### 目标

把 SPEC 第四部分直接翻译成代码，**先 token 后组件**，避免后面返工。

### 目录结构

```text
src/
├── assets/styles/
│   ├── tokens.css        # 全部 CSS Variables（色彩/字体/间距/圆角/动效，双主题）
│   ├── reset.css
│   └── global.css        # 字体栈、focus-visible、prefers-reduced-motion
├── composables/
│   └── useTheme.ts       # light/dark/auto + prefers-color-scheme + storage.local 持久化
```

### 关键细节

- 暗色 `--surface: #253347`（SPEC 专门修过对比度的值，不要回退）；
- 主题切换全局 `300ms ease-in-out` 过渡，且**不能产生 layout shift**；
- favicon 占位色板 6 色 + 域名 hash 取色函数，写成纯函数方便 Vitest 单测；
- 字体栈 `system-ui` 优先，中文字体提前于西文字体。

---

## 第 2 步：书签数据层（M1 后半，约 0.5 天）

### 目标

按 SPEC 5.3 节架构，在 background service worker 中封装全部书签操作，先于 UI 完成。

### background 侧 API

```typescript
getRootNodes()                    // 三个根目录（bar / other / mobile），按 Chrome 标识判断，不靠标题
getChildren(parentId)
createBookmark(parentId, { title, url })
createFolder(parentId, { title })
update(id, { title, url })        // URL 只允许 http/https，zod 校验
move(id, { parentId, index? })
removeTree(id)
```

### 架构要点

- **消息协议**：newtab ↔ background 用 `chrome.runtime` message，定义类型安全的请求/响应；
- **事件广播**：监听 `onCreated / onRemoved / onChanged / onMoved / onChildrenReordered / onImportBegan / onImportEnded`，广播给所有 newtab 页面；
- **不做乐观更新**——以浏览器事件为最终结果（SPEC 明确规定）；
- newtab 侧用 Pinia 或简单 composable 维护「当前目录 + 子项列表 + 面包屑路径」；
- 书签数据**不复制**进 `storage.local`。

---

## 第 3 步：P0 组件 + 只读浏览（M1–M2，约 1.5 天）

### 目标

实现 SPEC 4.15 节前 7 个 P0 组件，产出「好看的书签浏览器」。

### 组件任务

| 顺序 | 组件 | 实现要点 |
|---|---|---|
| 1 | `TopBar` | 56px 高度、品牌文字、主题切换图标（☾/☀）、设置图标 |
| 2 | `RootTabs` | 书签栏/其他书签/移动书签切换，选中态 `--accent-subtle` 背景 |
| 3 | `Breadcrumb` | `›` 分隔，可点击回跳 |
| 4 | `BookmarkCard` | 72px 固定高、favicon 20px、标题 `line-clamp: 2`、域名、悬停 `translateY(-2px)`、点击当前标签打开、favicon 失败走色板降级 |
| 5 | `FolderCard` | 48px 高、文件夹图标、子项数、点击进入 |
| 6 | `Skeleton` | 与卡片同尺寸 pulse 动画 |
| 7 | `EmptyState` | 空目录 + 「+ 新建书签」按钮 |

### 验收标准

- 0、1、20、200 个书签下布局稳定；
- 三个桌面尺寸（1440×900 / 1280×720 / 1024×768）无重叠无横向溢出；
- 浅色、深色、跟随系统主题切换不闪烁；
- 长标题、长域名不破坏布局。

---

## 第 4 步：编辑能力（M3，约 1.5–2 天）

### 目标

实现全部 CRUD，与 Chrome 原生书签保持一致。

### 组件任务

| 顺序 | 组件 | 实现要点 |
|---|---|---|
| 9 | `ContextMenu` | 卡片 `⋯` 按钮触发：编辑 / 移动 / 删除（删除项 `--danger` 色），悬停时才显示 `⋯` |
| 10 | `EditModal` | 420px 宽、zod 校验（非空标题、http/https URL）、Esc 关闭、Enter 提交、保存失败保留内容显示可读错误 |
| 11 | `DeleteConfirm` | 文件夹删除递归提示「将删除文件夹「X」及其中的 N 项书签，此操作不可撤销」，文件夹名加粗 |
| — | 移动对话框 | 目标文件夹选择器（树形下拉，**禁止移动到自身子树内**），V1 不做拖拽排序 |
| 12 | `Toast` | 底部居中，3s 自动消失，成功 ✓ / 错误 ✕ |
| 8 | `StatusBar` | `24 项 · ✓ 已同步` / `⟳ 同步中` / `✕ 同步失败` |

### 数据流铁律

所有操作走 background：**发消息 → Chrome API → 事件回来 → 刷新目录**，不在 UI 里手动改本地列表。

### 验收标准

- 全部 CRUD 操作与 Chrome 原生书签栏结果一致；
- API 失败时弹窗不关闭、内容不丢失、错误可读；
- 删除均有二次确认，不使用浏览器原生 `confirm()`。

---

## 第 5 步：设置 + 收尾验收（M4，约 0.5–1 天）

### 任务

1. `SettingsPanel`：默认根目录、列表密度、新标签打开开关、主题——全部落 `chrome.storage.local`，即 SPEC 中的 4 个字段：

   ```typescript
   interface SettingsState {
     theme: 'light' | 'dark' | 'auto';
     rootId: string;
     density: 'comfortable' | 'compact';
     openInNewTab: boolean;
   }
   ```

2. 键盘导航：`Tab` 顺序、`→` 进入文件夹、`←` 返回、`Esc` 关闭弹窗、`:focus-visible` 描边；
3. 跑 SPEC 3.5 节 8 条视觉验收 + M4 发布前检查 10 条，重点：
   - **多个 newtab 页面同时打开**；
   - 书签栏外部修改同步；
   - 文件夹递归删除；
   - 导入大量书签（`onImportBegan/Ended` 暂停刷新）；
   - 断网后书签功能仍可用；
4. Vitest 单测覆盖：域名 hash 取色、URL 校验、书签数据转换、根目录回退逻辑；
5. README 写明：隐身窗口限制（Chrome 扩展不能覆盖隐身窗口新标签页）、隐私说明（书签只在本机读取和修改，不上传服务器）。

---

## 避雷清单（实现期禁令）

来自 SPEC 4.14 与第五部分，编码时容易手滑的项目：

| 禁止 | 替代方案 |
|---|---|
| 把书签树缓存进 `storage.local` | 每次从 `chrome.bookmarks` 读，事件驱动刷新 |
| 引入 Naive UI 或其他组件库 | CSS Variables + 14 个自定义组件 |
| 顺手实现拖拽排序 | V1.1 候选，V1 用移动对话框 |
| 浏览器原生 `confirm()` | `DeleteConfirm` 组件 |
| 申请 `tabs` 权限 | 「新标签打开」用 `<a target="_blank">` |
| 玻璃拟态 / 大面积渐变 / 深阴影 / 大圆角 / 长动画 | 严格使用 SPEC token 值 |
| 默认状态显示所有操作按钮 | `⋯` 按钮悬停时才显示 |
| 乐观更新 | 以浏览器事件为最终结果 |
| 根据中英文标题判断根目录 | 按 Chrome 返回的根节点标识 |
| 导出设置时包含书签 | 明确提示用 Chrome 自带书签导出 |

---

## 已知风险与对策

| 风险 | 对策 |
|---|---|
| M3 工作量偏紧（CRUD + 弹窗 + 错误状态集中） | 第 2 步数据层先做扎实，UI 只薄一层；favicon 与事件同步的坑提前暴露 |
| `onImportBegan/Ended` 暂停刷新逻辑易遗漏 | M4 发布前检查中专列导入测试 |
| 多 newtab 同时编辑同一文件夹的冲突 | 以事件为最终结果天然规避；M4 多开页面测试验证 |
| `favicon` 权限要求 Chrome 104+ | manifest 声明 `minimum_chrome_version`，README 注明 |
| 书签栏外部高频修改导致频繁刷新 | 事件触发后只刷新受影响目录，必要时防抖 |

---

## 启动条件

- [x] SPEC.md v1.0 用户审查通过（2026-10-08）；
- [x] 已从第 0 步启动并完成 V1 编码、类型检查、单元测试和模拟 API 浏览器检查；
- [ ] 真实 Chrome 扩展环境的人工验收与发布前检查（见 ACCEPTANCE.md）。

---

## 第 6 步：V1.1 扩展功能集成（当前阶段 · 2026-10-18）

### 目标

直接在代码中落地 V1.1 核心体验扩展（搜索、置顶栏、多视图、维护中心），保持无外部服务依赖与高性能。

### 任务分解

1. **规范落地**：更新 `SPEC.md` 与 `ROADMAP.md` 确定 V1.1 边界。
2. **搜索中心与命令面板**：
   - 顶栏/主区集成快捷搜索栏与 Cmd+K 全局呼出面板；
   - 支持聚合搜索与主流搜索引擎跳转（Google/必应/百度/DuckDuckGo/GitHub）。
3. **常用置顶栏 (PinnedBar)**：
   - 卡片菜单绑定“固定/取消固定”；
   - 根目录下呈现快捷置顶导航。
4. **列表与网格视图切换**：
   - 顶栏操作区提供视图切换按钮；
   - 列表视图保持高信息密度与无布局偏移。
5. **书签健康维护中心 (MaintenancePanel)**：
   - 重复书签分组显示与定位；
   - 死链与重定向本地探测。
6. **验收覆盖**：
   - 完善自动化回归测试（`tests/v11.test.ts`、`tests/browser-check.mjs`）。

---

## 第 7 步：V1.2 扩展功能集成（2026-10-20 完成）

### 目标

补齐 V1.1 缺口并落地最近使用、本地标签、完整拖拽、搜索分组与设置导入导出。

### 已完成

1. **V1.1 缺口修复**：置顶 24 个上限经 `pinnedSchema` 校验；搜索无匹配时引擎兜底；拖拽支持文件夹排序与跨层级移动。
2. **最近使用 (RecentPanel)**：打开书签自动记录（去重、上限 50、失效条目自动清理），顶栏时钟图标入口。
3. **本地标签 (TagModal)**：卡片菜单编辑标签，卡片展示与工具栏筛选，命令面板可检索标签；独立 `tags` 存储 key。
4. **完整拖拽**：书签同级排序 + 拖入文件夹；文件夹同级排序 + 跨层级移动；自身/子树保护。
5. **搜索增强**：结果按「已固定/书签/文件夹」分组，`⌘/Ctrl+Enter` 直达搜索引擎，搜索栏与面板联动。
6. **设置导入导出**：JSON 下载/上传，zod 校验，错误可读且不中断现有设置。
7. **验收覆盖**：`tests/v12.test.ts` 9 项纯函数测试；`tests/browser-check.mjs` 新增标签/最近/分组搜索/设置导入导出冒烟。
