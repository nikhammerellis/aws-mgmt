# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.6] — 2026-04-15

### Added

- **"Launch at startup" toggle in the tray menu.** Windows-installed apps via NSIS aren't automatically registered with the Startup Apps list, so the only way to enable boot-time launch was to manually drop a shortcut into `shell:startup`. The tray menu now exposes a checkbox-style "Launch at startup" item that toggles `app.setLoginItemSettings()` — the OS-native mechanism (HKCU\...\Run on Windows, LaunchAgents on macOS). When enabled, the app registers itself with `--hidden` so boot-time launches go straight to the tray without popping the window. Manual launches (desktop shortcut, Start menu) still show the window normally. Linux is intentionally not exposed here — its autostart story is desktop-environment-specific (XDG vs systemd vs KDE/GNOME variants) and Electron's API is unreliable across distros.
- **Manual refresh button in the header.** A small ↻ icon button next to the active profile triggers an immediate re-read of AWS profiles, SAML profiles, and credential expiries. Belt-and-braces escape hatch for any case where the file watcher doesn't catch a change — atomic-rename writes from unusual tools, network filesystems, or external editors with non-standard save patterns. The button spins while a refresh is in flight, disables to prevent rapid double-clicks, and toasts "Refreshed" on completion. Doesn't replace the automatic file-watcher / push-event flow — it's purely additive.

## [0.2.5] — 2026-04-15

### Fixed

- **saml2aws Login now correctly writes credentials for configs that split the IdP block name from the AWS profile target.** Previous versions invoked `saml2aws login -a <section>`, which only specifies the `~/.saml2aws` IdP section. Users with a single `[default]` IdP block routing credentials to multiple AWS profiles (the most common real-world pattern outside the 1:1-section-per-profile case) saw the browser auth succeed but the credential write silently skip or mis-target. The app now passes both `-a <samlSection> --profile <awsProfile>` — disambiguating every layout regardless of whether section names match AWS profile names, and whether `aws_profile` is set inline in the SAML profile. Both fields are already validated at the IPC boundary (NAME_PATTERN-checked before reaching the spawn), so no new attack surface.
- **Conditional `--skip-prompt` based on whether `role_arn` is configured.** saml2aws's `--skip-prompt` disables the interactive role-selection picker. When the IdP grants multiple AWS roles and `role_arn` isn't set in `~/.saml2aws`, the suppressed picker has no fallback — saml2aws hangs waiting for stdin that will never come. The app now appends `--skip-prompt` only when the SAML profile carries a non-empty `role_arn`. First-time logins get the interactive picker (required to resolve which role to use); saml2aws writes the picked role back into `~/.saml2aws` automatically, so subsequent logins pick up `--skip-prompt` for free (faster, no prompt flicker). A new `hasRoleArn` boolean flag on `LaunchLoginPayload` carries this signal — the ARN itself never crosses the IPC boundary or enters the shell command. IPC validation enforces strict `typeof === 'boolean'` on the optional field.

## [0.2.4] — 2026-04-14

### Fixed

- **App failed to launch on packaged builds with `ERR_REQUIRE_ESM`.** v0.2.2 / v0.2.3 shipped with `chokidar ^5.0.0`, which is pure ESM. Our main process bundle is CommonJS and `externalizeDepsPlugin` leaves dependencies as runtime `require()`s, which can't load ESM modules. Pinned `chokidar ^3.6.0` (the last CJS version) — identical API surface for `watch` / `awaitWriteFinish` / `on('all')` / `on('error')` / `close()`, so no code changes needed beyond the dependency version. v3.6.0 is the chokidar version Vite, Webpack, ESLint, and most of the JS ecosystem ships with — well-maintained and battle-tested.

## [0.2.3] — 2026-04-14

### Changed

- README and architecture docs updated to reflect the v0.2.2 file-watcher swap (chokidar in Stack table, chokidar mentioned in Session-tracking bullet, stale `fs.watch` Known-Issue removed from architecture.md, Key-Files table line for `file-watcher.ts` updated).

(Note: this release inherited the chokidar v5 ESM bug from v0.2.2 — fixed in 0.2.4.)

## [0.2.2] — 2026-04-14

### Fixed

- **Credentials-file changes from external tools (saml2aws, aws sso login, aws-vault) now reliably refresh the UI.** Replaced node's `fs.watch` with `chokidar` in `src/main/services/file-watcher.ts`. `fs.watch` was missing rename-based atomic writes on macOS APFS and some Linux filesystems, leaving the expiry badge stale until the next 60s tray-broadcast tick. Chokidar's `awaitWriteFinish` waits for the file to stabilize and fires once, catching the saml2aws/aws-cli atomic-write pattern that triggered the original bug.
- **Active badge tooltip clarifies what "active" means.** The badge now reads "System-default profile (set via setx on Windows / launchctl on macOS). Terminal-local AWS_PROFILE exports are not reflected here." Prevents repeat confusion for users who `export AWS_PROFILE` in a shell and expect the app to pick it up.

### Changed

- `stopFileWatchers()` is now async (chokidar's `close()` returns a Promise). The single caller in `src/main/index.ts`'s quit handler is fire-and-forget — process exit reaps file handles regardless.

### Dependencies

- `chokidar ^5.0.0` added as a runtime dependency.

## [0.2.1] — 2026-04-14

### Added

- **App version visible in three places**: OS-level window title bar, header badge next to the H1, and (already) the installer filename. Pulled live from `package.json` via `app.getVersion()` IPC — no hardcoded strings to drift across releases. The Header sets `document.title` on mount so the title bar stays accurate after the page loads.

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
