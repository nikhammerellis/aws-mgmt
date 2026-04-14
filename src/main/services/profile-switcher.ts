import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SwitchResult } from '../../renderer/types'

export type { SwitchResult }

const execFileAsync = promisify(execFile)

export async function getActiveProfile(): Promise<string | null> {
  // Check process env first (covers both platforms)
  if (process.env.AWS_PROFILE) {
    return process.env.AWS_PROFILE
  }

  // On Windows, also check the registry for the persisted value
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('reg', [
        'query',
        'HKCU\\Environment',
        '/v',
        'AWS_PROFILE'
      ])
      // Output format: "    AWS_PROFILE    REG_SZ    value"
      const match = stdout.match(/AWS_PROFILE\s+REG_SZ\s+(.+)/)
      if (match) {
        return match[1].trim()
      }
    } catch {
      // Key doesn't exist — no profile set
    }
  }

  return null
}

export async function switchProfile(name: string): Promise<SwitchResult> {
  let result: SwitchResult

  if (process.platform === 'win32') {
    // setx writes to HKCU\Environment — all new terminals inherit it
    await execFileAsync('setx', ['AWS_PROFILE', name])
    result = { persisted: true, mechanism: 'setx' }
  } else if (process.platform === 'darwin') {
    // launchctl setenv makes it available to all new processes
    await execFileAsync('launchctl', ['setenv', 'AWS_PROFILE', name])
    result = { persisted: true, mechanism: 'launchctl' }
  } else {
    // Linux has no cross-shell equivalent — the per-session env is owned
    // by the user's shell rc files. Updating our own process env is the
    // most we can do; surface that fact to the renderer instead of
    // silently pretending the switch persisted.
    result = {
      persisted: false,
      mechanism: 'process-only',
      note:
        'AWS_PROFILE set for this app only. ' +
        'On Linux, add `export AWS_PROFILE=<name>` to your shell rc to persist across terminals.'
    }
  }

  // Always update our own process env so internal state (tray, active
  // badge) stays consistent with what the user picked.
  process.env.AWS_PROFILE = name

  return result
}

export async function clearActiveProfile(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('reg', [
        'delete',
        'HKCU\\Environment',
        '/v',
        'AWS_PROFILE',
        '/f'
      ])
    } catch {
      // Key might not exist
    }
  } else if (process.platform === 'darwin') {
    try {
      await execFileAsync('launchctl', ['unsetenv', 'AWS_PROFILE'])
    } catch {
      // May not be set
    }
  }

  delete process.env.AWS_PROFILE
}
