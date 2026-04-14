import { watch, type FSWatcher } from 'fs'
import { dirname } from 'path'
import { BrowserWindow } from 'electron'
import { getAwsConfigPath, getAwsCredentialsPath, getSamlConfigPath } from '../utils/paths'
import { getPendingLogins, verifyLogin } from './login-verifier'

let watchers: FSWatcher[] = []
let writeLock = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function setWriteLock(): void {
  writeLock = true
  setTimeout(() => { writeLock = false }, 500)
}

export function startFileWatchers(): void {
  stopFileWatchers()

  const awsDir = dirname(getAwsConfigPath())
  const samlPath = getSamlConfigPath()

  // Watch ~/.aws/ directory for config/credentials changes
  try {
    const awsWatcher = watch(awsDir, (eventType, filename) => {
      if (writeLock) return
      if (filename === 'config' || filename === 'credentials') {
        const credentialsChanged = filename === 'credentials'
        debouncedNotify('profiles-changed', { verifyPendingLogins: credentialsChanged })
        // Credentials changes affect saml2aws expiry; config changes do not,
        // but also broadcasting expiries-changed on config updates is cheap
        // and keeps the UI in sync when a user adds/removes a profile.
        debouncedBroadcast('expiries-changed', 'aws-file')
      }
    })
    watchers.push(awsWatcher)
  } catch {
    // Directory may not exist
  }

  // Watch ~/.saml2aws file
  try {
    const samlWatcher = watch(samlPath, () => {
      if (writeLock) return
      debouncedNotify('saml-changed', { verifyPendingLogins: false })
    })
    watchers.push(samlWatcher)
  } catch {
    // File may not exist
  }
}

/**
 * Explicit main-process signal that expiry values may have changed and the
 * renderer should re-fetch. Called from the tray's 60s refresh so the
 * renderer doesn't need its own polling timer for SSO cache files (which
 * we don't watch directly).
 */
export function broadcastExpiriesChanged(): void {
  debouncedBroadcast('expiries-changed', 'explicit')
}

const expiryBroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function debouncedBroadcast(channel: string, key: string): void {
  const existing = expiryBroadcastTimers.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    expiryBroadcastTimers.delete(key)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel)
    }
  }, 300)
  expiryBroadcastTimers.set(key, timer)
}

export function stopFileWatchers(): void {
  for (const w of watchers) {
    w.close()
  }
  watchers = []
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

async function runPendingVerifications(): Promise<void> {
  const names = getPendingLogins()
  if (names.length === 0) return

  await Promise.all(
    names.map(async (name) => {
      try {
        const result = await verifyLogin(name)
        if (result.ok) {
          broadcast('login-verified', { profileName: name, result })
        } else {
          // Don't toast every transient failure — only tell the renderer
          // once the TTL times out without a success. We stay silent here
          // because the credentials file may be written in multiple steps
          // during a saml2aws/sso login.
        }
      } catch {
        // Swallow — verification is best-effort.
      }
    })
  )
}

function debouncedNotify(
  channel: string,
  options: { verifyPendingLogins: boolean }
): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    broadcast(channel)
    if (options.verifyPendingLogins) {
      void runPendingVerifications()
    }
  }, 300)
}
