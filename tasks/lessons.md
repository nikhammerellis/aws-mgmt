# Lessons Learned

## 2026-04-07: ELECTRON_RUN_AS_NODE breaks Electron apps when launched from VS Code terminal

**Problem**: `require("electron")` returned a string (the binary path) instead of Electron's built-in module API. `electron.app` was undefined.

**Root cause**: The environment variable `ELECTRON_RUN_AS_NODE=1` was inherited from VS Code (which runs in Electron). This variable tells Electron to behave as plain Node.js, disabling built-in Electron modules.

**Fix**: Use a Node.js launcher script (`scripts/dev.js`) that does `delete process.env.ELECTRON_RUN_AS_NODE` before spawning `electron-vite`. Setting the variable to empty string (`cross-env ELECTRON_RUN_AS_NODE=`) is NOT enough — Electron checks for the variable's existence, not its value. The `unset` bash approach only works in bash shells.

**Rule**: When developing Electron apps, use a launcher script to fully delete `ELECTRON_RUN_AS_NODE` from the environment. Check for this FIRST if `require("electron")` fails. This affects ALL Electron apps launched from VS Code/Claude Code terminals.

## 2026-09-09: The same ELECTRON_RUN_AS_NODE trap applies to the *installed* app, not just dev

**Problem**: After installing v0.2.8, `Start-Process "AWS Profile Manager.exe"` returned exit 0 and
the app never appeared — no window, no tray icon, no process a moment later.

**Root cause**: Identical to the 2026-04-07 entry, but at a place the existing fix does not cover.
`scripts/dev.js` strips `ELECTRON_RUN_AS_NODE` for `npm run dev`, and CLAUDE.md documents it as a
*dev-server* concern. It is not: any Electron binary launched from a Claude Code or VS Code shell
inherits the variable, including the packaged production exe. It ran as plain Node, found nothing
to do, and exited silently with status 0 — so the launch *looked* successful.

**Fix**: `Remove-Item Env:ELECTRON_RUN_AS_NODE` in the shell before `Start-Process`. Launching from
Explorer, the Start menu or a desktop shortcut is unaffected — only agent/IDE-spawned shells carry it.

**Rule**: Never trust a zero exit code as proof an Electron app started. Confirm the process is
actually alive afterwards (`Get-Process`), and clear `ELECTRON_RUN_AS_NODE` before launching any
Electron binary from this environment — dev build or installed release.
