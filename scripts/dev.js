// Launcher that removes ELECTRON_RUN_AS_NODE before spawning electron-vite.
// VS Code and Claude Code set ELECTRON_RUN_AS_NODE=1 (they run in Electron),
// which prevents Electron apps from loading built-in modules.
// The variable must be fully deleted (not just empty) for Electron to work.

delete process.env.ELECTRON_RUN_AS_NODE

const { execFileSync } = require('child_process')
const args = process.argv.slice(2)
const cmd = args[0] || 'dev'

try {
  execFileSync('npx', ['electron-vite', cmd], {
    stdio: 'inherit',
    env: process.env,
    shell: true
  })
} catch (e) {
  process.exit(e.status || 1)
}
