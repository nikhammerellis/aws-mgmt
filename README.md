# AWS Profile Manager

Desktop app for managing local AWS CLI profiles, SAML2AWS configs, and SSO logins. Built with Electron, React 19, and TypeScript.

## What it does

- **Manage AWS profiles** — create, edit, rename, duplicate, and delete profiles in `~/.aws/config` and `~/.aws/credentials` from a GUI instead of hand-editing INI files.
- **SAML2AWS config** — manage `~/.saml2aws` profiles with bidirectional links showing which SAML profiles feed which AWS profiles.
- **Switch profiles** — set the system-level `AWS_PROFILE` so new terminals inherit it. Copy shell-specific export lines, or launch a new terminal with a profile pre-set.
- **Login** — one-click login for SSO and SAML2AWS profiles. Opens a terminal with the right command (`aws sso login` or `saml2aws login`) so you complete the auth flow in a familiar shell.
- **Session tracking** — live countdown badges show when SSO/SAML credentials expire. Desktop notification fires 5 minutes before expiry.
- **Type-aware wizard** — creating a new profile asks what kind (IAM Keys, SSO, Assume Role, SAML2AWS Target) and shows only the relevant fields. Review step previews the diff before writing.
- **Command palette** — `Ctrl/Cmd+K` opens a fuzzy-search palette over all profiles and actions (switch, login, rename, duplicate, launch terminal, copy export).
- **System tray** — tray icon with a radio-button profile switcher, active profile + region + expiry in the tooltip. Close-to-tray so the app stays resident.
- **Safe rename** — renames a profile across both config files, rewrites `source_profile` references in dependent profiles, updates SAML `aws_profile` pointers, re-points the OS-level `AWS_PROFILE`, and clears stale CLI cache. Full impact preview before committing.
- **Backup before write** — every file write snapshots the affected file to `~/.aws/aws-mgmt-backups/` with a rolling window of 20 backups per file.
- **Test profile** — runs `aws sts get-caller-identity` against any profile and shows the account/ARN inline, with classified error hints (expired token, missing credentials, CLI not found).

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
npm test                    # all tests (main + renderer)
npm run test:main           # main process only
npm run test:renderer       # renderer only
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
```

- **INI parsing**: `ini` package. Reads/writes `~/.aws/config` (with `[profile X]` prefix convention), `~/.aws/credentials` (plain `[X]`), and `~/.saml2aws` (plain `[X]`).
- **Profile switching**: `setx` on Windows, `launchctl setenv` on macOS. New terminals inherit the variable; existing ones are unaffected.
- **Security**: `nodeIntegration: false`, `contextIsolation: true`, `child_process.execFile` (not `exec`) to prevent shell injection. Profile names validated against `[A-Za-z0-9_\-]+` before any shell-adjacent operation.

See [docs/architecture.md](docs/architecture.md) for the full breakdown.

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

## Project structure

```
src/
  main/                     # Electron main process
    services/               # aws-config, credentials, saml, rename, backup, tray, etc.
    utils/                  # ini-helpers, paths
    index.ts                # App entry, window creation
    ipc-handlers.ts         # All IPC channel registrations
  preload/
    index.ts                # contextBridge API surface
  renderer/
    components/             # React components (ProfileCard, ProfileDetail, etc.)
    hooks/                  # useProfiles, useSamlProfiles, useProfileExpiries
    lib/                    # Shared helpers (aws-regions, login-action)
    styles/                 # global.css
    types/                  # Shared TypeScript interfaces
    App.tsx                 # Root component
resources/
  icon.png                  # 1024x1024 app icon
  tray-icon.png             # System tray icon
docs/
  architecture.md           # Detailed architecture notes
  install-test-build.md     # Tester install guide
  progress.md               # Development progress log
```

## License

ISC
