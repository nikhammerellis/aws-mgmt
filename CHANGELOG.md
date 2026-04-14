# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-04-13

First release focused on data-safety and security hardening. Coworker-test-ready.

### Added

- **Atomic INI writes** — `writeIniFile` now writes to a random-named tempfile in the same directory, chmods it, then `rename()`s over the target. Crash mid-write can no longer produce a half-written file. Tempfile is opened with `wx` to reject pre-planted files at the tempfile path.
- **`0o600` mode on secret files** — `~/.aws/credentials` and `~/.saml2aws` now write at user-only read/write on POSIX.
- **Preserve unknown INI keys on edit** — `writeAwsConfigProfile`, `writeAwsCredential`, and `writeSamlProfile` now merge with the existing section instead of rebuilding from scratch. Hand-tuned fields (`credential_process`, `mfa_serial`, `external_id`, `role_session_name`, `ca_bundle`, `endpoint_url`, `sso_session`, saml2aws's `x_security_token_expires` / `x_principal_arn`, `disable_keychain`, `target_url`, etc.) now survive UI edits.
- **Modern SSO support** — `[sso-session NAME]` blocks (AWS CLI v2) are now parsed and surfaced via `readSsoSessions()`. Profiles referencing them via `sso_session = NAME` are correctly classified as SSO, and expiry resolves through the referenced session's `sso_start_url`.
- **Login verification** — clicking Login for an SSO or SAML profile now runs `aws sts get-caller-identity` after the credentials file updates, and toasts the resolved ARN/account on success. Gives affirmative confirmation that the login actually worked rather than relying on the mere presence of an expiry value.
- **Subprocess environment hygiene** — terminal launches and STS probes strip `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, `AWS_DEFAULT_REGION`, `AWS_REGION`, `AWS_DEFAULT_PROFILE`, `AWS_ROLE_ARN`, `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, and `AWS_PROFILE` from the spawned env. Stale values from the parent shell can no longer silently override the selected profile.
- **Shared validation module** (`src/shared/validation.ts`) — single source of truth for the profile-name regex, AWS-override-var list, and the env-strip helper. Used by both main and renderer.
- **IPC boundary validation** — every write-path IPC handler (`switch-profile`, `add-profile`, `update-profile`, `delete-profile`, `get-rename-impact`, `rename-profile`, `launch-terminal`, `launch-login`, `test-profile`, `track-pending-login`, SAML equivalents) re-validates its arguments. A compromised renderer can no longer submit INI-injection payloads like `"default]\n[profile pwn\ncredential_process = calc.exe"` to achieve code execution via the AWS CLI.
- **Renderer sandbox** — `sandbox: true` in `BrowserWindow.webPreferences` (was `false`).
- **Navigation lockdown** — `setWindowOpenHandler(() => ({ action: 'deny' }))` and `will-navigate.preventDefault()`. The window can never navigate away from the bundled UI.
- **Single-instance lock** — launching the app a second time focuses the existing window instead of spawning a duplicate. Prevents two copies fighting over file writes and tray icons.
- **AppleScript escape defense-in-depth** — `escapeAppleScriptString` escapes `\` and `"` in any payload passed to macOS `do script`. Defense-in-depth beyond the name regex, so a future regex widening cannot become code execution.
- **Typed preload bridge** — `const api: ElectronAPI = { ... }` replaces the `Record<string, unknown>` casts. Drift between the IPC contract and the preload implementation is now a compile error.
- **`SwitchResult` return from switchProfile** — Windows/macOS return `{ persisted: true }`; Linux returns `{ persisted: false, note: '...' }` which the renderer surfaces as a toast. No more silently pretending a switch persisted on Linux when it didn't.
- **Push-based expiry updates** — main process broadcasts `expiries-changed` on credentials-file changes and from the 60s tray tick. Renderer subscribes; 30-second polling timer removed from the renderer.
- **Loosened profile name regex** — `/^[A-Za-z0-9_.@+\-]+$/` — real-world names like `dev.staging` and `team@prod` now work. Still rejects all INI and shell metacharacters.

### Changed

- `readAwsConfig` now returns `sso_session` as a field on each `ConfigProfile`.
- `AwsProfile` type gains `ssoSession`, `ssoSessionStartUrl`, `ssoSessionRegion`.
- SSO cache resolution now picks the entry with the furthest `expiresAt` rather than last-read (stale cache files no longer shadow fresh ones).
- `update-profile` IPC now always writes credentials (with merge semantics) — converting a profile from IAM-keys to SSO correctly clears the stale access-key pair that would otherwise silently override the new SSO config.
- `ElectronAPI` interface gains `trackPendingLogin`, `onLoginVerified`, `onExpiriesChanged`, and `switchProfile` now returns `SwitchResult`.

### Fixed

- STS probe no longer inherits stale `AWS_*` env vars from the app's launcher.
- `update-profile` no longer leaves stale IAM keys behind when converting profile types.
- Symlink pre-planted at a target path can no longer redirect writes (rename semantics replace the dirent rather than following the link).

### Security

All findings from the multi-agent code review were addressed in priority order:

- **Critical**: IPC input validation, unknown-key preservation, sso-session support, renderer sandbox, subprocess env hygiene.
- **Important**: AppleScript escape, credentials file mode, Linux switch honesty, `update-profile` credential clearing, navigation guards.
- **Polish**: typed preload bridge, push-based expiries.

Remaining work (known and scoped for a future release): CSP `unsafe-inline` tightening, `fs.watch` → `chokidar`, write-lock refcounting, auto-updater + code signing, lazy-load modal components for bundle size.

### Test coverage

249 passing tests (162 main + shared + 87 renderer), up from 197 in the pre-release codebase. New coverage: shared validation, IPC validators, preserve-unknowns, sso-session parsing, env stripping, atomic write, AppleScript escape, Linux switch result, login verifier TTL.

---

## [0.1.0] — Initial build

- Electron 33 + React 19 + TypeScript 5 scaffold via electron-vite
- Read/write `~/.aws/config`, `~/.aws/credentials`, `~/.saml2aws`
- Profile CRUD via type-aware wizard (IAM Keys, SSO, Assume Role, SAML Target)
- Safe rename with dependent-reference rewriting
- Command palette, system tray, close-to-tray
- `Ctrl/Cmd+K` palette, global hotkeys
- Backup-before-write to `~/.aws/aws-mgmt-backups/` with 20-file rotation
- Test-profile via `aws sts get-caller-identity`
- Launch-terminal and launch-login with platform-specific shells (Windows Terminal, macOS Terminal.app, Linux common emulators)
- Windows Terminal env propagation via PowerShell `-EncodedCommand`
- GitHub Actions CI for Windows NSIS and macOS DMG (arm64 + x64) unsigned builds
