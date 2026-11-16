# Chrome Web Store listing - owntab 1.2.0

## Short description

原生 Chrome 书签工作台，支持搜索、整理、标签与多视图。无账号、无后端。

## Detailed description

把 Chrome 新标签页变成安静、清晰的书签工作台。owntab 直接读取并管理 Chrome 原生书签，保留浏览器作为唯一书签数据源。

- 浏览书签栏与其他书签，进入文件夹并按需切换网格或列表视图。
- 创建、编辑、移动、排序和删除书签及文件夹，并同步 Chrome 中的更改。
- 使用搜索面板按书签、文件夹和本地标签查找内容；没有匹配时可跳转搜索引擎。
- 固定常用书签，查看最近打开的书签，并用本地标签整理内容。
- 检查重复项和不可访问链接。
- 导入或导出 owntab 设置；书签数据由 Chrome 独立管理，不包含在设置文件中。
- 支持浅色、深色和跟随系统主题。

书签和扩展设置保留在本机 Chrome 配置中。owntab 没有账号、后端、分析或遥测服务。失效链接检查会主动请求目标网站；目标网站会收到正常访问请求并看到你的 IP 地址。

最低要求：Chrome 104。

## Privacy disclosure

### Data collected

owntab does not collect, sell, or share user data. It does not send bookmark contents or settings to an owntab server.

### Local processing

The extension reads and edits Chrome bookmarks when the user browses or manages them. Theme, selected root, density, open behavior, pinned bookmark IDs, recent bookmark IDs, and tags are stored in `chrome.storage.local` on the device. Imported and exported settings do not contain bookmark records.

The optional broken-link checker makes requests directly from the browser to bookmark destinations. Those destination sites receive the request and the user's IP address as they would for normal browsing.

### Permissions

- `bookmarks`: display, create, edit, move, reorder, and delete bookmarks at the user's request.
- `storage`: retain local preferences, pinned IDs, recent IDs, and tags.
- `favicon`: display Chrome's local favicon results for bookmark URLs.

No host permissions are requested.

## Store assets

- Extension icon: `public/icons/icon-128.png` (128x128 PNG)
- Screenshot source: `artifacts/light.png` (1440x900)
- Screenshot source: `artifacts/dark.png` (1440x900)
- Store screenshot exports: `store-assets/`

The promotional tile and marquee artwork are not needed for initial listing submission and can be added later.
