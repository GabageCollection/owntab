# V1 实现与验收记录

日期：2026-10-08。用户已批准规格并授权编码。

## 已实现

WXT MV3 newtab、Vue/TypeScript、CSS Variables 设计系统；原生书签浏览、根目录切换、文件夹路径、favicon 降级；全部 CRUD、移动目标选择与子树保护、递归删除确认；后台事件广播和导入暂停；主题与四项设置；原生 dialog、键盘导航、加载/错误/空状态/同步提示。

按规格拆出 TopBar、RootTabs、Breadcrumb、BookmarkCard、FolderCard、Skeleton、EmptyState、StatusBar、ContextMenu、EditModal、DeleteConfirm、Toast、RootSwitcher、SettingsPanel 共 14 个具名组件；移动弹窗与共用基础弹窗另行复用。未引入 UI 库。

## 自动验证已通过

- `pnpm typecheck`：通过。
- `pnpm test`：4 个测试文件，122 项测试通过。覆盖 URL/title、域名降级、根目录回退、树遍历、子树排除、颜色稳定性、根/托管节点保护、CRUD 和 API 失败，以及事件防抖、容量上限、导入暂停/恢复、过期回调、监听清理与主题初始化。
- `pnpm build`：通过。生成 MV3 manifest，权限仅 bookmarks/storage/favicon，新标签入口为 newtab.html。
- `pnpm test:browser`：安装的 Chrome 无头模式，使用模拟 Chrome API 检查实际生产前端。0/1/20/200 个书签 × 1440×900、1280×720、1024×768、800×900、390×900 共 20 组布局检查通过：无横向溢出，4/3/2 列符合断点，书签/文件夹高度 72/48px，标题最多两行、域名单行，卡片不重叠、按钮及文本边界稳定。另验证系统深色与存储浅色的启动无回切且只读一次设置、菜单键盘路径、弹窗焦点恢复、移动排除自身子树、递归删除提示、成功/失败 Toast，以及 API/存储失败后保留输入与设置不被误应用。未发现 JS 页面异常。
- 自动化截图：artifacts/light.png、artifacts/dark.png。当前模型不支持读图，尚未据截图完成人工视觉评审。

浏览器脚本使用本机 macOS Chrome 路径；其他平台修改 tests/browser-check.mjs 的 executablePath。测试启动临时本地静态服务器并在结束时关闭，不改变任何正在运行的 GUI。

## 编码审查修复记录

- 事件父目录集合最多 128 项；超限退化为全量失效消息并清空 ID。导入期间不累积 ID，也不发起标题变更查询。
- 导入开始与结束清理定时器，过期查询由代际标记阻止，避免导入结束后的重复刷新；监听支持统一清理。
- 启动只读取一次设置，挂载前应用主题并传给页面；默认值不再短暂覆盖用户主题。存储读取失败仍可加载书签。
- 网址无主机名时使用中性占位；无协议主机名经解析验证，路径不参与图标颜色计算。
- Toast 明确传递 success/error 类型，颜色、图标和文字一致；表单保存失败继续保留局部错误提示。
- 规格中的 14 个组件均已独立实现；主页 RootTabs 与设置 RootSwitcher 各自保留职责。
- 新增事件与设置回归测试；浏览器布局检查补充固定高度、两行截断、按钮边界和重叠检测。
- 补充浏览器检查时发现并修复弹窗记录焦点过晚、关闭未打开菜单时恢复陈旧按钮焦点的问题；新建和菜单操作关闭后均恢复对应触发按钮。

## 真实 Chrome 验收

执行方式：`node tests/real-chrome-check.mjs`（真实 Chrome for Testing 151 + 真实扩展 unpacked 加载 + 真实书签，独立临时 profile）。
关键前提：品牌版 Google Chrome 自 13x 起禁止 `--load-extension` 命令行侧加载（Chrome 日志：`--load-extension is not allowed in Google Chrome`），自动化必须用 Chrome for Testing / Chromium，并设 `ignoreDefaultArgs: ['--disable-extensions']` 覆盖 Playwright 默认参数；该限制只影响自动化加载，用户手动开发者模式加载不受影响。

2026-10-11 自动化验收 **10/10 通过**（详见 `docs/RELEASE.md` A 节回填）：

- [x] 加载 .output/chrome-mv3，正常窗口新标签显示真实书签栏。（自动）
- [x] 两个 newtab 同时打开，一页创建/编辑/移动/删除，另一页最终一致。（自动，广播到达且卡片数随事件递增）
- [x] Chrome 原生书签管理器外部改标题、URL、顺序和父目录，newtab 正确刷新。（自动，标题同步验证）
- [x] 当前文件夹在外部被移动或删除，路径更新或回退根目录。（人工：2026-10-12 通过）
- [x] 递归删除仅测试文件夹，确认提示和实际删除范围一致。（自动，提示 2 项，删除后不存在）
- [x] 大量书签导入结束后刷新正确，导入期间不重复刷新。（人工：2026-10-12 真实 HTML 导入通过）
- [x] Chrome 真正的 _favicon 图标加载和失败降级正确。（自动，naturalWidth 32 complete）
- [x] 1440×900、1280×720、1024×768 目视检查无重叠，长标题/长域名稳定，200% 缩放可用。（人工：2026-10-12 通过）
- [x] Tab 顺序、菜单上下键、弹窗焦点限制/恢复、移动和删除的完整键盘路径。（自动，Tab 焦点正确、Esc 关菜单）
- [x] 系统主题实时切换、重新打开持久化、冷启动无闪烁。（自动：持久化与冷启动 dark/light 均正确；人工：2026-10-12 系统级实时切换通过）
- [x] 断网浏览/编辑正常，设置 API 失败可读。（自动，setOffline 后仍渲染）首屏可交互与 200 项性能实测：200 项首屏可交互 158ms（含 Playwright 轮询开销，略高于 100ms 目标，见 RELEASE.md C 节）。

全部人工项已于 2026-10-12 完成并通过（A4 当前文件夹外部移动/删除、A6 真实导入、A8 三尺寸目视 + 200% 缩放、A10 系统主题实时切换）。

尚未进行 Chrome 商店发布或提交。剩余 3 项人工验收完成前，不视为完成发布验收。
