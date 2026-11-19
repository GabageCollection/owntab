# Changelog

## Unreleased

- Add V1.4 batch selection, move, delete, and tag operations with per-item results and retry.
- Add centralized tag rename, merge and removal; add local bookmark notes to search and version 3 backups.
- Extend bookmark maintenance with scoped, cancellable link checks and selected duplicate keepers.
- Keep confirmed folder deletion scopes intact when nested selected items or API failures occur.

## 1.4.0 - 2026-11-20

- Added bulk selection and move, delete, add-tag and remove-tag workflows with clear confirmation and per-item result reporting.
- Added tag counts and centralized rename, merge and delete operations.
- Added local bookmark notes, note-aware search, and version 3 backup and restore support.
- Added scoped link checks with cancellation and failed-item retry, plus duplicate cleanup with an explicit keeper.
- Preserved local-only operation and native bookmark ownership; no Chrome Web Store release.

- Serialize local writes across tabs and update only edited settings or bookmark metadata. Reclaim slots held by deleted pins.
- Require a fresh bookmark snapshot for backup and restore, and ask for confirmation again if the preview no longer matches.
- Refresh global search and pinned links when other folders change. Close the recent or maintenance dialog and focus the selected bookmark when locating it.
- Treat unreadable link checks as unknown, limit and cancel requests, and only flag readable 404/410 responses as broken.
- Improve keyboard selection visibility and theme contrast, remove redundant folder lookups, and run browser and real extension regressions in CI.

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
