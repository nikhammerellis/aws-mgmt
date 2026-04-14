# CLAUDE.md — Project Instructions for Claude Code

## Project overview

AWS Profile Manager — Electron desktop app for managing local AWS CLI profiles (`~/.aws/config`, `~/.aws/credentials`) and SAML2AWS configs (`~/.saml2aws`). React 19 + TypeScript frontend, Electron 33 runtime, electron-vite build system, Vitest test suite.

## Build and run

```bash
npm run dev          # start dev server (auto-reloads)
npm run build        # production build (electron-vite)
npm test             # run all tests (main + shared + renderer, ~250 tests)
npm run test:main    # main + shared (Node env)
npm run test:renderer # renderer (jsdom)
npm run dist:win     # package Windows NSIS installer
```

Note: `npm run dev` uses `scripts/dev.js` which deletes `ELECTRON_RUN_AS_NODE` from the environment. This is required when launching from VS Code or Claude Code terminals (both run inside Electron and set that variable, which breaks Electron's built-in module loading).

## Architecture rules

- **Three-process model plus shared**: main (Node.js), preload (contextBridge), renderer (React), and `src/shared/` for validation helpers used by both sides. The renderer has zero Node.js access — all system interaction goes through `window.api` (defined in `src/preload/index.ts`) via IPC. The preload bridge is typed via `const api: ElectronAPI = { ... }`, so any drift from the contract is a compile error.
- **Type contract**: `src/renderer/types/index.ts` is the single source of truth for all shared types (`AwsProfile`, `NewProfileData`, `SamlProfile`, `RenameImpact`, `ShellHint`, `ProfileExpiry`, `LoginVerification`, `SwitchResult`, etc.) and the `ElectronAPI` interface. Both main and renderer import from there.
- **Validation is shared**: `src/shared/validation.ts` owns `PROFILE_NAME_PATTERN` (`/^[A-Za-z0-9_.@+\-]+$/`), `assertValidProfileName`, `isValidProfileName`, `AWS_OVERRIDE_VARS`, and `stripAwsOverrides`. Both main and renderer import from there — never redefine the regex locally.
- **INI section naming**: `~/.aws/config` uses `[profile X]` prefix (except `[default]`), and top-level `[sso-session NAME]` blocks for modern AWS CLI v2 SSO. `~/.aws/credentials` and `~/.saml2aws` use plain `[X]`. This asymmetry is handled in `src/main/services/aws-config.ts` via `profileToSection()`/`sectionToName()`/`sectionToSsoSessionName()`. Never bypass these helpers.
- **File writes are atomic**: `writeIniFile(path, data, options?)` in `src/main/utils/ini-helpers.ts` writes to a temp file in the same directory then `rename()`s over the target. Pass `{ mode: 0o600 }` for secret files (`~/.aws/credentials`, `~/.saml2aws`). Default is `0o644`.
- **Writes preserve unknown INI keys**: `writeAwsConfigProfile`, `writeAwsCredential`, `writeSamlProfile` each define a `MANAGED_*_KEYS` list of UI-controlled fields. They read the existing section, apply the managed keys (set/clear based on incoming value), and preserve everything else verbatim. Never rebuild a section from scratch — hand-tuned fields like `credential_process`, `mfa_serial`, `x_security_token_expires`, `disable_keychain`, etc. must survive edits.
- **File writes go through services**: `aws-config.ts`, `aws-credentials.ts`, `saml-config.ts` each call `backupFile()` before writing. Never write directly via `writeIniFile` without the backup step.
- **setWriteLock() before writes**: call `setWriteLock()` from `src/main/services/file-watcher.ts` before any file write to suppress the file watcher's change event (500ms debounce window). For multi-file writes (like rename), re-call it before each write.
- **Renderer is sandboxed**: `BrowserWindow.webPreferences` uses `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`. `setWindowOpenHandler` denies `window.open()`; `will-navigate` is preventDefault'd. Do not relax these.

## IPC validation

The renderer is treated as adversarial input. Every write-path IPC handler in `src/main/ipc-handlers.ts` MUST validate its arguments before doing any file work:

- **Profile-name args**: `assertValidProfileName(name)` — throws on bad names.
- **Profile data payloads**: `validateProfileData(data)` — validates name plus checks every field against `INI_INJECTION_RE` (`/[\r\n\[\]=]/`).
- **SAML payloads**: `validateSamlProfile(data)` — same pattern, plus validates `awsProfile` target name if set.
- **Rename targets**: validate BOTH `oldName` and `newName`.
- **Shell-adjacent IPCs** (`launch-terminal`, `launch-login`, `test-profile`, `track-pending-login`): validate the name before any subprocess call.

Failing to validate at this layer is a real vulnerability — the UI-side regex in `ProfileWizard.tsx` is UX, not a security boundary.

## Subprocess environment hygiene

`src/main/services/terminal-launcher.ts` and `src/main/services/profile-tester.ts` both `stripAwsOverrides(process.env)` before spawning subprocesses. This strips `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, `AWS_DEFAULT_REGION`, `AWS_REGION`, `AWS_DEFAULT_PROFILE`, `AWS_ROLE_ARN`, `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, and `AWS_PROFILE` — anything the parent shell might have set that would override profile resolution. Any new subprocess that needs to respect a specific `--profile` flag must do the same.

## Testing conventions

- **Main process tests**: `src/main/services/__tests__/*.test.ts`, `src/main/utils/__tests__/*.test.ts`, and `src/main/__tests__/*.test.ts`. Mock `ini-helpers`, `paths`, and external services. Use `vi.mock()` with factory functions. See `aws-config.test.ts` for the canonical pattern.
- **Shared tests**: `src/shared/__tests__/*.test.ts` run under the main Vitest config (Node env, no jsdom).
- **Renderer tests**: `src/renderer/components/__tests__/*.test.tsx` and `src/renderer/hooks/__tests__/*.test.ts`. `vitest.setup.renderer.ts` provides a mock `window.api` typed against `ElectronAPI` — when adding a new IPC method, add a stub to the setup file or TypeScript will catch the gap in tests.
- **Test matchers**: `@testing-library/jest-dom/vitest` extends Vitest with DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.). The setup file imports this automatically.
- **Label association**: form fields in components use `htmlFor`/`id` pairs for proper label-input association. Tests use `getByLabelText()` for these. Other queries: `getByRole`, `getByText`, `getByPlaceholderText`.
- **Security-sensitive tests**: any change to `assertSafeIniValue`, `assertValidProfileName`, `escapeAppleScriptString`, or `stripAwsOverrides` needs a matching test in the relevant `__tests__/` file, including an injection-payload negative case.

## Adding a new IPC channel

1. Write the service function in `src/main/services/`.
2. Register the handler in `src/main/ipc-handlers.ts`. **Validate every untrusted argument** — use `assertValidProfileName`, `validateProfileData`, `validateSamlProfile`, or write a new `assert*` helper for the payload shape.
3. Add the method signature to `ElectronAPI` in `src/renderer/types/index.ts`.
4. Expose in `src/preload/index.ts`. The bridge object is typed `const api: ElectronAPI = { ... }`, so step 4 is enforced by TypeScript once step 3 is done.
5. Add a mock in `vitest.setup.renderer.ts` — TypeScript will complain if you skip this.
6. Call via `window.api.yourMethod()` from hooks or components.

## Adding a new React component

- Place in `src/renderer/components/`.
- Props interface at the top of the file.
- Tests go in `src/renderer/components/__tests__/ComponentName.test.tsx`.
- CSS goes in `src/renderer/styles/global.css` (single stylesheet, no CSS modules).

## Key conventions

- Profile form fields that are required show a red `*` via `<span className="required-marker">*</span>`. Optional fields show `<span className="optional-marker">(optional)</span>`.
- Modals reuse the `.dialog-overlay` / `.dialog` CSS pattern from `ConfirmDialog.tsx`. Larger modals (wizard, rename) use `.profile-form-overlay` / `.profile-form`.
- The `ProfileWizard` replaces the old `ProfileForm`. It detects profile kind (IAM Keys, SSO, Assume Role, SAML Target) automatically in edit/clone mode and shows only relevant fields. A profile with `ssoStartUrl` OR `ssoSession` set counts as SSO.
- `effectiveAwsProfileName(saml)` in `App.tsx` resolves the AWS profile a SAML entry targets (explicit `aws_profile` field, or falls back to the SAML section name).
- The command palette (`Ctrl/Cmd+K`) generates its action list from profiles in `App.tsx` via `useMemo`. To add a new action type, append to the `paletteActions` builder.
- Profile switching returns a `SwitchResult` with a `persisted` flag — Linux returns `persisted: false` with a `note` that `App.tsx` surfaces as a toast. Any new platform-specific switch logic must return this same shape.
- Expiry updates are push-based: main broadcasts `expiries-changed` on credentials-file changes and from the 60s tray tick. `useProfileExpiries` subscribes — never reintroduce a polling timer in the renderer.

## What NOT to do

- Don't use `child_process.exec` — always use `execFile` or `spawn` with `shell: false` to prevent command injection.
- Don't redefine `NAME_PATTERN` / `PROFILE_NAME_PATTERN` in new files — import from `src/shared/validation.ts`.
- Don't write to `~/.aws/` files without calling `backupFile()` first.
- Don't rebuild an INI section from scratch on write — always merge with the existing section so unknown keys survive. Writing `data[section] = { ...newKnownFields }` without first reading `existing` destroys user data.
- Don't skip IPC argument validation — a compromised renderer can send any string, including INI-injection payloads that would plant `credential_process` entries.
- Don't import Node.js modules in the renderer — everything goes through `window.api`.
- Don't add a polling timer in the renderer for data the main process owns — push from main via an event instead.
- Don't hardcode file paths — use the helpers in `src/main/utils/paths.ts` which respect `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` env var overrides.
- Don't skip `setWriteLock()` before file writes — omitting it causes the file watcher to fire a spurious `profiles-changed` event mid-write.
- Don't spawn subprocesses that need profile resolution without calling `stripAwsOverrides(process.env)` first — the parent shell's stale `AWS_*` vars will silently override whatever `--profile` flag you pass.
- Don't relax `sandbox: true`, `contextIsolation: true`, or the navigation guards in `src/main/index.ts` — all three are load-bearing for renderer isolation.
