# AWS Profile Manager — Architecture

## Overview

Electron desktop app for managing AWS CLI profiles. Reads/writes `~/.aws/config`, `~/.aws/credentials`, and `~/.saml2aws`.

## Stack

- **Runtime**: Electron 33+ (Chromium + Node.js)
- **Frontend**: React 19 + TypeScript
- **Build**: electron-vite 3 (Vite-based build for all three Electron processes)
- **Packaging**: electron-builder (Windows NSIS, Mac DMG)
- **INI Parsing**: `ini` npm package

## Process Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (src/main/)                   │
│  - File I/O (atomic writes, backups)        │
│  - INI parsing + merge-with-existing        │
│  - IPC handler registration + validation    │
│  - Tray, file-watcher, login-verifier       │
│  - Environment variable manipulation        │
├─────────────────────────────────────────────┤
│  Preload (src/preload/)                     │
│  - contextBridge.exposeInMainWorld          │
│  - Typed against ElectronAPI interface      │
│  - Security boundary                        │
├─────────────────────────────────────────────┤
│  Shared (src/shared/)                       │
│  - Validation regexes and helpers           │
│  - AWS env-var lists                        │
│  - Used by BOTH main and renderer           │
├─────────────────────────────────────────────┤
│  Renderer (src/renderer/)                   │
│  - React app                                │
│  - Sandbox: true, zero Node.js access       │
│  - Communicates via window.api only         │
└─────────────────────────────────────────────┘
```

## Security Model

### Renderer isolation

- `sandbox: true` — OS-level process sandbox
- `contextIsolation: true` — renderer and preload run in separate V8 contexts
- `nodeIntegration: false` — no `require` in renderer
- `setWindowOpenHandler(() => ({ action: 'deny' }))` — blocks `window.open()`
- `will-navigate` is `preventDefault`'d — the window can never navigate away from the bundled UI
- Single-instance lock prevents duplicate processes racing on file writes

### Trust boundary at IPC

The renderer is treated as adversarial input. Every write-path IPC handler re-validates its arguments before doing any file work. UI-side validation in `ProfileWizard.tsx` is UX only — a compromised renderer (XSS via a future dep) could send arbitrary payloads.

- `assertValidProfileName(name)` — regex gate on names (`/^[A-Za-z0-9_.@+\-]+$/`)
- `validateProfileData(data)` / `validateSamlProfile(data)` — field-level INI-injection checks (`[\r\n\[\]=]`)
- Shell-adjacent handlers (`launch-terminal`, `launch-login`, `test-profile`) validate before any subprocess call

### Subprocess hygiene

- `child_process.execFile` and `spawn` with `shell: false` everywhere — no `exec` anywhere in the codebase
- `stripAwsOverrides(process.env)` before every subprocess that respects `--profile` — strips `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, `AWS_DEFAULT_REGION`, `AWS_REGION`, `AWS_DEFAULT_PROFILE`, `AWS_ROLE_ARN`, `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_PROFILE`
- macOS `osascript` `do script` payloads pass through `escapeAppleScriptString` — `\\` → `\\\\`, `"` → `\"`. Defense-in-depth against a future regex widening.
- Windows Terminal invocations use PowerShell `-EncodedCommand` (base64 UTF-16LE) to bypass `wt.exe`'s `;` tab-separator parsing.

## Data Safety

### Atomic writes

`writeIniFile(path, data, options?)` in `src/main/utils/ini-helpers.ts`:

1. Stringify the INI data.
2. Open a random-named tempfile in the same directory with the `wx` flag (refuses to open if the path already exists — prevents pre-planted-file races).
3. `fs.writeFile` with the requested mode (`0o644` default, `0o600` for secret files).
4. `fs.chmod` to re-apply the mode (guards against umask stripping bits on some filesystems).
5. `fs.rename` over the target — atomic within a filesystem.
6. Cleanup tempfile on any failure.

A crash, power loss, or disk-full error can't produce a half-written credentials file.

### Symlink safety

`rename()` replaces the directory entry rather than following it, so an attacker pre-planting a symlink at the target path (say `~/.aws/credentials` → `/etc/shadow`) cannot redirect writes. The app does NOT read through the link-check before write, but the rename semantics make the write-through attack impossible.

### Preserve unknown keys

Each write service defines a `MANAGED_*_KEYS` tuple of fields the UI knows about. On write:

1. Read the existing INI file.
2. Start from the existing section's values (or `{}`).
3. For each managed key: set the new value if truthy, else delete.
4. Keys not in the managed list: preserve verbatim.

This means fields like `credential_process`, `mfa_serial`, `external_id`, `role_session_name`, `ca_bundle`, `endpoint_url`, `sso_session`, `sso_registration_scopes`, saml2aws's `x_security_token_expires` / `x_principal_arn`, `disable_keychain`, `target_url`, etc. all survive UI edits.

### Backup rotation

Every write calls `backupFile()` first, snapshotting the affected file to `~/.aws/aws-mgmt-backups/` with a timestamped filename. A rolling window of 20 backups per file is retained; older ones are pruned asynchronously.

### File permissions

Credentials (`~/.aws/credentials`) and SAML (`~/.saml2aws`) write at `0o600` on POSIX. Config (`~/.aws/config`) stays at default `0o644`.

## Profile Switching

When the user selects a profile, the app sets `AWS_PROFILE` at the system level:

- **Windows**: `setx AWS_PROFILE <name>` (writes to `HKCU\Environment` registry)
- **macOS**: `launchctl setenv AWS_PROFILE <name>`
- **Linux**: process-only (no cross-shell persistence mechanism exists). The renderer surfaces this honestly via a toast telling the user to add `export AWS_PROFILE=<name>` to their shell rc.

`switchProfile` returns a `SwitchResult = { persisted, mechanism, note? }` so the renderer can differentiate.

All NEW terminal sessions inherit the variable (on platforms where persistence works). Existing terminals are unaffected.

## INI Format Differences

| File | Section Format | Example |
|------|---------------|---------|
| `~/.aws/config` | `[profile NAME]` (except `[default]`) | `[profile tangerine]` |
| `~/.aws/config` | `[sso-session NAME]` for shared SSO blocks | `[sso-session corp]` |
| `~/.aws/credentials` | `[NAME]` (no prefix) | `[tangerine]` |
| `~/.saml2aws` | `[NAME]` (no prefix) | `[uncharted]` |

Modern AWS CLI v2 uses `[sso-session NAME]` blocks to centralize SSO start URL + region so multiple profiles can share a login. Profiles reference them via `sso_session = NAME`. The app parses these via `readSsoSessions()`, surfaces them as `AwsProfile.ssoSession` / `.ssoSessionStartUrl` / `.ssoSessionRegion`, and resolves them when looking up SSO cache expiry.

## Expiry Tracking

- **SSO**: reads `~/.aws/sso/cache/*.json`, indexes by `startUrl`, picks the entry with the furthest `expiresAt`. Matches each profile's resolved start URL (either inline `sso_start_url` or via a referenced `[sso-session]` block).
- **saml2aws**: reads `x_security_token_expires` from each section of `~/.aws/credentials`.
- **Push-based refresh**: the main process broadcasts `expiries-changed` on credentials-file changes and from the 60s tray tick. The renderer subscribes and re-fetches. No polling timer in the renderer.

## Login Verification

When the user clicks Login for an SSO or SAML target profile, the renderer calls `window.api.trackPendingLogin(name)` right after spawning the login terminal. When the credentials file next updates, `login-verifier.ts` runs `aws sts get-caller-identity --profile <name>` to confirm the creds are actually valid, then broadcasts `login-verified` with the resolved account/ARN. The renderer toasts the result.

Pending-login state is in-memory with a 120s TTL so an abandoned login doesn't sit forever.

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App entry, window creation, single-instance lock, navigation guards |
| `src/main/ipc-handlers.ts` | IPC channel registrations + input validators |
| `src/main/services/aws-config.ts` | Read/write ~/.aws/config, parse [sso-session] blocks, merge-preserve |
| `src/main/services/aws-credentials.ts` | Read/write ~/.aws/credentials with 0o600 mode, merge-preserve |
| `src/main/services/saml-config.ts` | Read/write ~/.saml2aws with 0o600 mode, merge-preserve |
| `src/main/services/profile-switcher.ts` | Platform-specific profile switching, returns SwitchResult |
| `src/main/services/profile-rename.ts` | Cross-file rename with dependent-reference rewrite |
| `src/main/services/profile-tester.ts` | STS probe with stripped env |
| `src/main/services/terminal-launcher.ts` | Terminal spawn with env hygiene + AppleScript escape |
| `src/main/services/login-verifier.ts` | Post-login STS verification with TTL |
| `src/main/services/expiry-tracker.ts` | SSO cache + saml2aws expiry resolution |
| `src/main/services/file-watcher.ts` | fs.watch + writeLock + expiries broadcast |
| `src/main/services/backup.ts` | Rolling backup to ~/.aws/aws-mgmt-backups/ |
| `src/main/utils/ini-helpers.ts` | Atomic INI read/write with mode option |
| `src/main/utils/paths.ts` | AWS file path resolution (respects env var overrides) |
| `src/preload/index.ts` | contextBridge API surface, typed against ElectronAPI |
| `src/shared/validation.ts` | PROFILE_NAME_PATTERN, AWS_OVERRIDE_VARS, helpers |
| `src/renderer/App.tsx` | Root React component |
| `src/renderer/types/index.ts` | Shared types + ElectronAPI contract |
| `src/renderer/hooks/useProfiles.ts` | Profile data fetching |
| `src/renderer/hooks/useProfileExpiries.ts` | Expiry subscription (push-based, no polling) |

## Known Issues

- **ELECTRON_RUN_AS_NODE**: VS Code and Claude Code run inside Electron, so their terminals inherit `ELECTRON_RUN_AS_NODE=1`. This makes Electron behave as plain Node.js, preventing `require("electron")` from resolving the built-in module. The variable must be **fully deleted** from the environment (empty string is not enough). Fix: `scripts/dev.js` launcher uses `delete process.env.ELECTRON_RUN_AS_NODE` before spawning `electron-vite`. Works cross-platform from any terminal.
- **`fs.watch` reliability**: node's native watch is known-flaky on some Linux distros and network filesystems; editor atomic-save patterns can be missed. Not data-destructive — just means the UI's expiry badge might lag until the next 60s push. Swapping to `chokidar` is on the backlog.
- **Profile-rename CLI cache clear** wipes all `~/.aws/cli/cache/*.json` files (since they're keyed by role-ARN+source hash, not profile name). Other profiles sharing an assume-role chain will need to re-login on next use. Tracked as a future scoped-clear enhancement.
- **No auto-updater yet**. Current releases require manual reinstall. Planned before public distribution.
- **Linux profile persistence**: there is no OS-level mechanism to make `AWS_PROFILE` persist across new shells. The app returns `persisted: false` and tells the user to add the export to their shell rc.
