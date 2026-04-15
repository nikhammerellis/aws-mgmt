# AWS Profile Manager

Desktop app for managing local AWS CLI profiles, SAML2AWS configs, and SSO logins. Built with Electron, React 19, and TypeScript.

## What it does

- **Manage AWS profiles** — create, edit, rename, duplicate, and delete profiles in `~/.aws/config` and `~/.aws/credentials` from a GUI instead of hand-editing INI files. Edits preserve any fields the UI doesn't expose (`credential_process`, `mfa_serial`, `external_id`, `role_session_name`, `ca_bundle`, `endpoint_url`, etc.) so hand-tuned configs survive round-trips.
- **Modern SSO support** — recognizes AWS CLI v2's `[sso-session NAME]` blocks. Profiles that reference a shared session via `sso_session = name` are correctly classified as SSO and their expiry resolves through the referenced session's start URL.
- **SAML2AWS config** — manage `~/.saml2aws` profiles with bidirectional links showing which SAML profiles feed which AWS profiles. saml2aws metadata like `x_security_token_expires` and `x_principal_arn` is preserved across UI edits.
- **Switch profiles** — set the system-level `AWS_PROFILE` so new terminals inherit it. Copy shell-specific export lines, or launch a new terminal with a profile pre-set. Launched terminals start with a clean `AWS_*` environment so stale keys or `AWS_PROFILE` values don't silently override the selected profile.
- **Login** — one-click login for SSO and SAML2AWS profiles. Opens a terminal with the right command (`aws sso login` or `saml2aws login`) so you complete the auth flow in a familiar shell. When the credentials file updates post-login, the app runs an STS probe and toasts the resolved ARN/account so you get affirmative confirmation that the login actually worked.
- **Session tracking** — live countdown badges show when SSO/SAML credentials expire. Desktop notification fires 5 minutes before expiry. Expiry updates are pushed from the main process (on file changes and via a 60s tick) — no renderer polling. The file watcher uses `chokidar` with `awaitWriteFinish`, so atomic-rename writes from external tools (saml2aws, `aws sso login`, aws-vault) are caught reliably across macOS, Linux, and Windows.
- **Type-aware wizard** — creating a new profile asks what kind (IAM Keys, SSO, Assume Role, SAML2AWS Target) and shows only the relevant fields. Review step previews the diff before writing.
- **Command palette** — `Ctrl/Cmd+K` opens a fuzzy-search palette over all profiles and actions (switch, login, rename, duplicate, launch terminal, copy export).
- **System tray** — tray icon with a radio-button profile switcher, active profile + region + expiry in the tooltip. Close-to-tray so the app stays resident. Single-instance lock — launching twice focuses the existing window.
- **Safe rename** — renames a profile across both config files, rewrites `source_profile` references in dependent profiles, updates SAML `aws_profile` pointers, re-points the OS-level `AWS_PROFILE`, and clears stale CLI cache. Full impact preview before committing.
- **Test profile** — runs `aws sts get-caller-identity` against any profile and shows the account/ARN inline, with classified error hints (expired token, missing credentials, CLI not found). The probe runs with a sanitized environment so it actually tests the named profile rather than whatever stale keys the launcher inherited.

## Screenshots

*Coming soon.*

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm (comes with Node)

### Install and run

```bash
git clone https://github.com/nikhammerellis/aws-mgmt.git
cd aws-mgmt
npm install
npm run dev
```

### Run tests

```bash
npm test                    # all tests (main + shared + renderer, ~255 tests)
npm run test:main           # main + shared (Node env) only
npm run test:renderer       # renderer (jsdom) only
```

### Build locally

```bash
npm run dist:win            # Windows NSIS installer
npm run dist:mac            # macOS DMG (requires macOS)
npm run dist                # current platform
```

Output goes to `dist/`. See [docs/install-test-build.md](docs/install-test-build.md) for tester install instructions (unsigned build warnings).

## Architecture

Electron three-process model with strict context isolation:

```
Main process (src/main/)     — file I/O, IPC handlers, tray, child processes
Preload (src/preload/)       — contextBridge, typed window.api
Renderer (src/renderer/)     — React app, zero Node.js access
Shared (src/shared/)         — validation helpers used by both main and renderer
```

- **INI parsing**: `ini` package. Reads/writes `~/.aws/config` (with `[profile X]` prefix convention, plus `[sso-session NAME]` blocks for modern SSO), `~/.aws/credentials` (plain `[X]`), and `~/.saml2aws` (plain `[X]`).
- **Profile switching**: `setx` on Windows (persists via `HKCU\Environment`), `launchctl setenv` on macOS. Linux has no cross-shell persistence mechanism — the app is honest about this and toasts a message telling Linux users to add the export to their shell rc.

See [docs/architecture.md](docs/architecture.md) for the full breakdown.

## Data safety

Every write path is designed so a crash, power loss, or adversarial input can't leave your AWS config in a worse state than it started.

- **Backup before every write** — every edit snapshots the affected file to `~/.aws/aws-mgmt-backups/` with a rolling window of 20 backups per file. Filename format: `YYYY-MM-DDTHH-MM-SS-000Z-config` so you can roll back to any recent version even without git.
- **Atomic writes** — writes go to a randomly-named tempfile in the same directory, then `rename()` replaces the target. `rename()` is atomic within a filesystem, so a crash mid-write leaves either the old file intact or the new file complete — never a half-written mess. The tempfile is opened with the `wx` flag to reject pre-planted files at the tempfile path.
- **Symlink-safe** — `rename()` replaces the directory entry rather than following it, so an attacker pre-planting a symlink at the target path cannot redirect writes into files you didn't intend.
- **0600 mode on secret files** — `~/.aws/credentials` and `~/.saml2aws` are written with user-only read/write permissions on POSIX.
- **Preserve unknown fields** — the UI is aware of a fixed set of fields (region, output, role_arn, sso_*, keys, etc.). Any other field present in a section — `credential_process`, `mfa_serial`, `external_id`, `role_session_name`, `ca_bundle`, `endpoint_url`, `sso_session`, saml2aws's `x_security_token_expires` / `x_principal_arn`, etc. — is preserved verbatim across UI edits. Your hand-tuned config survives round-trips.
- **Single-instance lock** — launching the app twice focuses the existing window instead of spawning a second copy. Prevents two processes racing on file writes or both owning a tray icon.

## Security

- **Sandboxed renderer** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The renderer gets zero direct Node or OS access; every system interaction goes through a typed `contextBridge` surface.
- **Navigation locked down** — `setWindowOpenHandler` denies all `window.open()` and `will-navigate` is preventDefault'd. This app is fully local — no remote navigation is ever legitimate.
- **IPC input re-validation** — every write-path IPC handler re-validates profile names and field values against INI-injection characters (`\n`, `\r`, `[`, `]`, `=`). The UI-side regex is UX, not a security boundary; a compromised renderer cannot plant `name = "default]\n[profile pwn\ncredential_process = calc.exe"` and achieve code execution via the AWS CLI.
- **Profile name regex**: `/^[A-Za-z0-9_.@+\-]+$/` — permissive enough for real-world names (`dev.staging`, `team@prod`) while rejecting all INI and shell metacharacters. Source of truth: [src/shared/validation.ts](src/shared/validation.ts).
- **Shell-safe subprocess calls** — `child_process.execFile` / `spawn` with `shell: false` everywhere. No `exec` anywhere in the codebase.
- **AppleScript escape hardening** — the macOS terminal-launch path escapes `\` and `"` in any interpolated payload so a future widening of the name regex can't translate into `do script` code execution.
- **PowerShell via `-EncodedCommand`** — Windows Terminal's `;` parsing is bypassed by base64/UTF-16LE-encoding the entire PowerShell script, so profile names with legitimate AWS-valid characters can't accidentally be parsed as tab separators.
- **Clean subprocess env** — `aws sts get-caller-identity` and launched terminals strip `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, `AWS_DEFAULT_REGION`, `AWS_REGION`, `AWS_DEFAULT_PROFILE`, `AWS_ROLE_ARN`, `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, and `AWS_PROFILE` before setting only the profile selector you asked for. Stale env vars from whatever shell launched the app can't override the profile you selected.

## CI / Releases

Pushing a `v*` tag triggers [GitHub Actions](.github/workflows/build.yml) which builds Windows (NSIS x64) and macOS (DMG x64 + arm64) installers and attaches them to a GitHub Release as a prerelease. Builds are currently unsigned — see the install guide for Gatekeeper/SmartScreen workarounds.

```bash
# Cut a test release
npm version patch            # bumps package.json, commits, tags
git push && git push --tags  # triggers CI
```

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Electron 33 |
| Frontend | React 19, TypeScript 5 |
| Build | electron-vite 3 (Vite under the hood) |
| Packaging | electron-builder 26 |
| Testing | Vitest 4, React Testing Library |
| INI parsing | `ini` 5 |
| File watching | `chokidar` 5 |

## Project structure

```
src/
  main/                     # Electron main process
    services/               # aws-config, credentials, saml, rename, backup,
                            # login-verifier, expiry-tracker, tray, etc.
    utils/                  # ini-helpers (atomic write), paths
    index.ts                # App entry, window creation
    ipc-handlers.ts         # IPC registrations + input validators
  preload/
    index.ts                # contextBridge API surface (typed against ElectronAPI)
  shared/
    validation.ts           # PROFILE_NAME_PATTERN, AWS_OVERRIDE_VARS, helpers
  renderer/
    components/             # React components (ProfileCard, ProfileDetail, etc.)
    hooks/                  # useProfiles, useSamlProfiles, useProfileExpiries
    lib/                    # Shared helpers (aws-regions, login-action)
    styles/                 # global.css
    types/                  # Shared TypeScript interfaces + ElectronAPI contract
    App.tsx                 # Root component
resources/
  icon.png                  # 1024x1024 app icon
  tray-icon.png             # System tray icon
docs/
  architecture.md           # Detailed architecture notes
  install-test-build.md     # Tester install guide
  progress.md               # Development progress log
CHANGELOG.md                # Version history
```

## License

ISC
