import { execFile } from 'child_process'
import { promisify } from 'util'

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

export async function switchProfile(name: string): Promise<void> {
  if (process.platform === 'win32') {
    // setx writes to HKCU\Environment — all new terminals inherit it
    await execFileAsync('setx', ['AWS_PROFILE', name])
  } else if (process.platform === 'darwin') {
    // launchctl setenv makes it available to all new processes
    await execFileAsync('launchctl', ['setenv', 'AWS_PROFILE', name])
  } else {
    // Linux fallback — just set process env for now
  }

  // Also update our own process env so the app state is consistent
  process.env.AWS_PROFILE = name
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
