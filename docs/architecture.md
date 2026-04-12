# AWS Profile Manager — Architecture

## Overview

Electron desktop app for managing AWS CLI profiles. Reads/writes `~/.aws/config`, `~/.aws/credentials`, and `~/.saml2aws`.

## Stack

- **Runtime**: Electron 33+ (Chromium + Node.js)
- **Frontend**: React 19 + TypeScript
- **Build**: electron-vite 3 (Vite-based build for all three Electron processes)
- **Packaging**: electron-builder (Windows NSIS, Mac DMG)
- **INI Parsing**: `ini` npm package

## Three-Process Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (src/main/)                   │
│  - File I/O (read/write AWS config files)   │
│  - INI parsing                              │
│  - Environment variable manipulation        │
│  - IPC handler registration                 │
├─────────────────────────────────────────────┤
│  Preload (src/preload/)                     │
│  - contextBridge.exposeInMainWorld          │
│  - Typed window.api object                  │
│  - Security boundary                        │
├─────────────────────────────────────────────┤
│  Renderer (src/renderer/)                   │
│  - React app                                │
│  - Zero Node.js access                      │
│  - Communicates via window.api only         │
└─────────────────────────────────────────────┘
```

## Security

- `nodeIntegration: false` — renderer cannot access Node.js
- `contextIsolation: true` — renderer and preload run in separate contexts
- Credentials masked by default in UI (SecretField component)
- `child_process.execFile` used instead of `exec` to prevent shell injection

## Profile Switching

When the user selects a profile, the app sets `AWS_PROFILE` at the system level:

- **Windows**: `setx AWS_PROFILE <name>` (writes to HKCU\Environment registry)
- **macOS**: `launchctl setenv AWS_PROFILE <name>`

All NEW terminal sessions inherit the variable. Existing terminals are unaffected.

## INI Format Differences

| File | Section Format | Example |
|------|---------------|---------|
| `~/.aws/config` | `[profile name]` (except `[default]`) | `[profile tangerine]` |
| `~/.aws/credentials` | `[name]` (no prefix) | `[tangerine]` |
| `~/.saml2aws` | `[name]` (no prefix) | `[uncharted]` |

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App entry, BrowserWindow creation |
| `src/main/ipc-handlers.ts` | IPC channel registrations |
| `src/main/services/aws-config.ts` | Read ~/.aws/config |
| `src/main/services/aws-credentials.ts` | Read ~/.aws/credentials |
| `src/main/services/profile-switcher.ts` | Platform-specific profile switching |
| `src/main/utils/ini-helpers.ts` | INI file read/write |
| `src/preload/index.ts` | contextBridge API surface |
| `src/renderer/App.tsx` | Root React component |
| `src/renderer/hooks/useProfiles.ts` | Profile data fetching hook |

## Known Issues

- **ELECTRON_RUN_AS_NODE**: VS Code and Claude Code run inside Electron, so their terminals inherit `ELECTRON_RUN_AS_NODE=1`. This makes Electron behave as plain Node.js, preventing `require("electron")` from resolving the built-in module. The variable must be **fully deleted** from the environment (empty string is not enough). Fix: `scripts/dev.js` launcher uses `delete process.env.ELECTRON_RUN_AS_NODE` before spawning `electron-vite`. This is cross-platform and works from any terminal.
