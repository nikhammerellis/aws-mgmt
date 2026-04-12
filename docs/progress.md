# AWS Profile Manager — Progress

## Phase 1: Core Viewer + Switcher (MVP) — Complete

- [x] Project scaffolding (Electron + React + Vite via electron-vite)
- [x] TypeScript configuration
- [x] Main process services (ini-helpers, paths, aws-config, aws-credentials, profile-switcher)
- [x] IPC handlers + preload bridge
- [x] React UI (two-panel layout, profile list, detail view, secret fields)
- [x] Dark theme CSS
- [x] ELECTRON_RUN_AS_NODE fix (scripts/dev.js launcher)

## Phase 2: Add / Edit / Remove Profiles — Complete

- [x] Write/delete operations in aws-config.ts and aws-credentials.ts
- [x] file-watcher.ts (fs.watch with debounce + write-lock)
- [x] ProfileForm.tsx (add/edit form)
- [x] ConfirmDialog.tsx (delete confirmation)
- [x] Extended IPC handlers and preload for CRUD + change events

## Phase 3: SAML Config Management — Complete

- [x] saml-config.ts (read/write/delete ~/.saml2aws)
- [x] Tab navigation (AWS Profiles / SAML Config)
- [x] SamlSection.tsx + SamlForm.tsx
- [x] useSamlProfiles.ts hook with CRUD + file watcher

## Phase 4: System Tray + Distribution — Complete

- [x] Tray icon resources (16x16 tray icon, 256x256 app icon)
- [x] System tray with context menu (profile list as radio items, show/quit)
- [x] Close-to-tray behavior (window hides instead of quitting)
- [x] Click tray icon to show/focus window
- [x] Tray menu auto-updates when active profile changes
- [x] electron-builder.yml (Windows NSIS, Mac DMG, Linux AppImage)
- [x] `before-quit` / `isQuitting` pattern for clean quit via tray

## Testing — Complete

- [x] Vitest setup (separate configs for main + renderer)
- [x] 46 main process tests (7 files)
  - paths, ini-helpers, aws-config, aws-credentials, saml-config, profile-switcher, tray
- [x] 20 renderer tests (3 files)
  - useProfiles hook, useSamlProfiles hook, ProfileForm component
- [x] All 66 tests passing
