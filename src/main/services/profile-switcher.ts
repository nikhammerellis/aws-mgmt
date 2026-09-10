import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { getNmdContextPath } from '../utils/paths'
import { readAwsCredentials } from './aws-credentials'
import { getProfileExpiries } from './expiry-tracker'
import { setWriteLock } from './file-watcher'
import type { ActiveContext, SwitchResult } from '../../renderer/types'

export type { ActiveContext, SwitchResult }

const execFileAsync = promisify(execFile)

/**
 * The configured AWS_PROFILE: this process's env, falling back to the
 * persisted OS-level value.
 *
 * This is NOT the same question as "which account am I in" — it is only what
 * an unqualified `aws` call would resolve. Use getActiveContext() for the
 * user-facing answer. Kept as-is because profile-rename legitimately needs
 * this narrower meaning when deciding whether to re-point the env var.
 */
export async function getActiveProfile(): Promise<string | null> {
  // Check process env first (covers both platforms)
  if (process.env.AWS_PROFILE) {
    return process.env.AWS_PROFILE
  }
  return getMachineDefaultProfile()
}

/**
 * The persisted OS-level AWS_PROFILE, ignoring this process's environment.
 *
 * Kept separate from getActiveProfile so the UI can show "the machine default
 * is X, but nothing is actually authenticated as X" — the exact condition that
 * used to be reported as simply "Active: default".
 */
export async function getMachineDefaultProfile(): Promise<string | null> {
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
  } else if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('launchctl', ['getenv', 'AWS_PROFILE'])
      const value = stdout.trim()
      if (value) return value
    } catch {
      // Not set
    }
  }
  return null
}

interface NmdContextFile {
  profile?: unknown
  [key: string]: unknown
}

async function readNmdContextFile(): Promise<NmdContextFile | null> {
  try {
    const raw = await fs.readFile(getNmdContextPath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as NmdContextFile
    }
  } catch {
    // Absent or malformed — the commands may simply never have run.
  }
  return null
}

/**
 * The profile recorded by the awsgo/awsuse PowerShell commands. Read from a
 * file rather than an env var because an interactive shell's AWS_PROFILE never
 * reaches another process.
 */
export async function getContextFileProfile(): Promise<string | null> {
  const parsed = await readNmdContextFile()
  if (parsed && typeof parsed.profile === 'string' && parsed.profile.length > 0) {
    return parsed.profile
  }
  return null
}

/**
 * Record our own selection in the same file `awsuse` writes, so the context
 * channel is two-way.
 *
 * Without this the app could read the operator's choice but never make one:
 * switchProfile only moved AWS_PROFILE, which getActiveContext ranks last, so
 * clicking Switch left every indicator pointing at whatever was already live.
 *
 * Shape and write strategy deliberately mirror Write-AwsContextFile in
 * AwsProfiles.psm1 — same keys, temp file in the same directory, then rename.
 * Fields we don't own (client, env, accountId, roleArn, region, expiresAt) are
 * carried forward when the profile name is unchanged, and dropped when it
 * isn't, rather than left describing the previous account. `awswho` reads
 * every field through Get-AwsProp, which defaults anything absent.
 */
async function writeContextFileProfile(name: string): Promise<void> {
  const target = getNmdContextPath()
  const previous = await readNmdContextFile()

  const carried = previous && previous.profile === name ? previous : {}
  const next = { ...carried, profile: name, updatedAt: new Date().toISOString() }

  // Suppress the watcher for our own write, exactly as the file-writing
  // services do — otherwise this bounces straight back as a change event.
  setWriteLock()

  const tmp = join(dirname(target), `.nmd-context.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
  try {
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}

/**
 * Resolve every distinct notion of "active" at once, so the UI can report each
 * separately instead of picking one and hoping.
 */
export async function getActiveContext(): Promise<ActiveContext> {
  const now = Date.now()

  const [expiries, credentials, machineDefault, contextProfile] = await Promise.all([
    getProfileExpiries().catch(() => []),
    readAwsCredentials().catch(() => []),
    getMachineDefaultProfile(),
    getContextFileProfile()
  ])

  const liveProfiles = expiries
    .filter((e) => {
      const t = new Date(e.expiresAt).getTime()
      return Number.isFinite(t) && t > now
    })
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
    .map((e) => e.profileName)

  // Profiles whose credentials never expire (long-lived IAM keys). They can
  // never appear in liveProfiles, so without this they would be reported as
  // "not logged in" forever — and told to run a login that does not exist.
  const trackedExpiry = new Set(expiries.map((e) => e.profileName))
  const staticProfiles = credentials
    .filter((c) => !!c.aws_access_key_id && !c.aws_session_token && !trackedExpiry.has(c.name))
    .map((c) => c.name)

  const shellProfile = process.env.AWS_PROFILE || null
  const isLive = (name: string | null): boolean => !!name && liveProfiles.includes(name)
  const isStatic = (name: string | null): boolean => !!name && staticProfiles.includes(name)

  // Preference order matters.
  //
  // The context file wins outright, live or not: it is the last *explicit*
  // selection by either party — `awsgo`/`awsuse` write it, and so does our own
  // switchProfile. Deferring to a live session instead would silently override
  // a deliberate choice, which is exactly the bug where clicking Switch left
  // the badge pinned to whatever happened to be authenticated. When the chosen
  // profile has no session the UI says so rather than redirecting.
  //
  // With no context file at all, a single live session is unambiguous, and
  // failing that the env var is at least what an unqualified `aws` call uses.
  let effective: string | null = null
  if (contextProfile) {
    effective = contextProfile
  } else if (liveProfiles.length === 1) {
    effective = liveProfiles[0]
  } else {
    effective = shellProfile
  }

  return {
    liveProfiles,
    staticProfiles,
    shellProfile,
    machineDefault,
    contextProfile,
    effective,
    // Permanent keys are never "stale" — they work indefinitely.
    machineDefaultStale:
      !!machineDefault && !isLive(machineDefault) && !isStatic(machineDefault)
  }
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

  // Publish the choice on the channel getActiveContext actually reads, so the
  // switch moves the UI and `awswho` reports the same profile the app does.
  // Best-effort: the environment change above has already succeeded, and
  // SwitchResult has no channel to report a secondary failure that the user
  // could act on. A failure here degrades to the pre-existing behaviour.
  try {
    await writeContextFileProfile(name)
  } catch {
    // ~/.aws unwritable — the env var switch still stands.
  }

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
