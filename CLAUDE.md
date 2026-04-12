# CLAUDE.md — Project Instructions for Claude Code

## Project overview

AWS Profile Manager — Electron desktop app for managing local AWS CLI profiles (`~/.aws/config`, `~/.aws/credentials`) and SAML2AWS configs (`~/.saml2aws`). React 19 + TypeScript frontend, Electron 33 runtime, electron-vite build system, Vitest test suite.

## Build and run

```bash
npm run dev          # start dev server (auto-reloads)
npm run build        # production build (electron-vite)
npm test             # run all tests (main + renderer, ~200 tests)
npm run test:main    # main process tests only
npm run test:renderer # renderer tests only
npm run dist:win     # package Windows NSIS installer
```

Note: `npm run dev` uses `scripts/dev.js` which deletes `ELECTRON_RUN_AS_NODE` from the environment. This is required when launching from VS Code or Claude Code terminals (both run inside Electron and set that variable, which breaks Electron's built-in module loading).

## Architecture rules

- **Three-process model**: main (Node.js), preload (contextBridge), renderer (React). The renderer has zero Node.js access — all system interaction goes through `window.api` (defined in `src/preload/index.ts`) via IPC.
- **Type contract**: `src/renderer/types/index.ts` is the single source of truth for all shared types (`AwsProfile`, `NewProfileData`, `SamlProfile`, `RenameImpact`, `ShellHint`, `ProfileExpiry`, etc.) and the `ElectronAPI` interface. Both main and renderer import from there.
- **INI section naming**: `~/.aws/config` uses `[profile X]` prefix (except `[default]`). `~/.aws/credentials` and `~/.saml2aws` use plain `[X]`. This asymmetry is handled in `src/main/services/aws-config.ts` via `profileToSection()`/`sectionToName()`. Never bypass these helpers.
- **File writes go through services**: `aws-config.ts`, `aws-credentials.ts`, `saml-config.ts` each call `backupFile()` before writing. Never write directly via `writeIniFile` without the backup step.
- **Profile name validation**: all profile names must match `/^[A-Za-z0-9_\-]+$/`. This regex is used in `profile-rename.ts`, `terminal-launcher.ts`, and `profile-tester.ts`. Validate before any shell-adjacent operation.
- **setWriteLock() before writes**: call `setWriteLock()` from `src/main/services/file-watcher.ts` before any file write to suppress the file watcher's change event (500ms debounce window). For multi-file writes (like rename), re-call it before each write.

## Testing conventions

- **Main process tests**: `src/main/services/__tests__/*.test.ts` and `src/main/utils/__tests__/*.test.ts`. Mock `ini-helpers`, `paths`, and external services. Use `vi.mock()` with factory functions. See `aws-config.test.ts` for the canonical pattern.
- **Renderer tests**: `src/renderer/components/__tests__/*.test.tsx` and `src/renderer/hooks/__tests__/*.test.ts`. `vitest.setup.renderer.ts` provides a mock `window.api` with all IPC methods stubbed. Override individual methods with `window.api.foo = vi.fn().mockResolvedValue(...)` in each test.
- **Test matchers**: `@testing-library/jest-dom/vitest` extends Vitest with DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.). The setup file imports this automatically.
- **Label association**: form fields in components use `htmlFor`/`id` pairs for proper label-input association. Tests use `getByLabelText()` for these. Other queries: `getByRole`, `getByText`, `getByPlaceholderText`.

## Adding a new IPC channel

1. Write the service function in `src/main/services/`.
2. Register the handler in `src/main/ipc-handlers.ts`.
3. Expose in `src/preload/index.ts`.
4. Add the method signature to `ElectronAPI` in `src/renderer/types/index.ts`.
5. Add a mock in `vitest.setup.renderer.ts`.
6. Call via `window.api.yourMethod()` from hooks or components.

## Adding a new React component

- Place in `src/renderer/components/`.
- Props interface at the top of the file.
- Tests go in `src/renderer/components/__tests__/ComponentName.test.tsx`.
- CSS goes in `src/renderer/styles/global.css` (single stylesheet, no CSS modules).

## Key conventions

- Profile form fields that are required show a red `*` via `<span className="required-marker">*</span>`. Optional fields show `<span className="optional-marker">(optional)</span>`.
- Modals reuse the `.dialog-overlay` / `.dialog` CSS pattern from `ConfirmDialog.tsx`. Larger modals (wizard, rename) use `.profile-form-overlay` / `.profile-form`.
- The `ProfileWizard` replaces the old `ProfileForm`. It detects profile kind (IAM Keys, SSO, Assume Role, SAML Target) automatically in edit/clone mode and shows only relevant fields.
- `effectiveAwsProfileName(saml)` in `App.tsx` resolves the AWS profile a SAML entry targets (explicit `aws_profile` field, or falls back to the SAML section name).
- The command palette (`Ctrl/Cmd+K`) generates its action list from profiles in `App.tsx` via `useMemo`. To add a new action type, append to the `paletteActions` builder.

## What NOT to do

- Don't use `child_process.exec` — always use `execFile` or `spawn` with `shell: false` to prevent command injection.
- Don't write to `~/.aws/` files without calling `backupFile()` first.
- Don't import Node.js modules in the renderer — everything goes through `window.api`.
- Don't hardcode file paths — use the helpers in `src/main/utils/paths.ts` which respect `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` env var overrides.
- Don't skip `setWriteLock()` before file writes — omitting it causes the file watcher to fire a spurious `profiles-changed` event mid-write.
