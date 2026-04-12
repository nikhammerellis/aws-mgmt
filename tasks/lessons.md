# Lessons Learned

## 2026-04-07: ELECTRON_RUN_AS_NODE breaks Electron apps when launched from VS Code terminal

**Problem**: `require("electron")` returned a string (the binary path) instead of Electron's built-in module API. `electron.app` was undefined.

**Root cause**: The environment variable `ELECTRON_RUN_AS_NODE=1` was inherited from VS Code (which runs in Electron). This variable tells Electron to behave as plain Node.js, disabling built-in Electron modules.

**Fix**: Use a Node.js launcher script (`scripts/dev.js`) that does `delete process.env.ELECTRON_RUN_AS_NODE` before spawning `electron-vite`. Setting the variable to empty string (`cross-env ELECTRON_RUN_AS_NODE=`) is NOT enough — Electron checks for the variable's existence, not its value. The `unset` bash approach only works in bash shells.

**Rule**: When developing Electron apps, use a launcher script to fully delete `ELECTRON_RUN_AS_NODE` from the environment. Check for this FIRST if `require("electron")` fails. This affects ALL Electron apps launched from VS Code/Claude Code terminals.
