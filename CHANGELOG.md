# Changelog

## 1.3.0 - 2026-11-17

- Added custom search-engine templates with shared homepage and palette search.
- Added persistent pinned-bar ordering with pointer drag and keyboard controls.
- Added complete local backup and previewed merge/replace restore, including settings, engines, pins, tags and recent history; safely remap existing bookmark references and retain legacy settings import.
- Added section navigation, Home/End selection, folder-return focus, keyboard help and IME guards.
- Keep native bookmarks unchanged during pin sorting and local-data restore; synchronize local data across open new tabs.

- Start bookmark and settings reads in parallel while loading the new tab UI.
- Load offscreen bookmark favicons and unopened dialogs on demand.
- Render each directory from one bookmark-tree snapshot, avoiding a duplicate API request.
- Preserve bookmark changes and import state during startup, and fetch fresh data on retry.
- Add repeatable page-level startup measurements for warm and stopped background workers.

## 1.2.0 - 2026-11-16

- Added a recent bookmarks view with local usage history.
- Added local tags, tag filtering, and tag-aware search.
- Added drag-and-drop sorting and moving across folders.
- Grouped search results and added a direct search-engine fallback.
- Added validated JSON import and export for owntab settings.
- Improved recent-history persistence, deletion confirmation, search ranking, and URL safety.
- Added the Chrome extension icon and store-ready manifest icon sizes.

## 1.1.0

- Added global bookmark search, pinned bookmarks, grid and list views, and bookmark maintenance tools.

## 1.0.0

- Initial Chrome new tab bookmark workbench with native bookmark browsing, editing, synchronization, themes, and settings.
