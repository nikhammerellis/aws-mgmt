import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { getAwsConfigPath, getAwsCredentialsPath, getSamlConfigPath } from '../utils/paths'
import { getPendingLogins, verifyLogin } from './login-verifier'

/**
 * File watcher for ~/.aws/config, ~/.aws/credentials, and ~/.saml2aws.
 *
 * We use chokidar (not node's `fs.watch`) because every credential tool that
 * cares about durability — saml2aws, aws-cli's own SSO refresh, aws-vault,
 * our own atomic writes — does write-then-rename. node's `fs.watch` on the
 * target path is well-known to drop those rename events on macOS APFS and
 * some Linux filesystems. chokidar normalizes that for us via
 * `awaitWriteFinish`, which holds the event until the file stops being
 * mutated and then fires once.
 */

let watcher: FSWatcher | null = null
let writeLock = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function setWriteLock(): void {
  writeLock = true
  setTimeout(() => { writeLock = false }, 500)
}

export function startFileWatchers(): void {
  // Fire-and-forget; close is async but we don't want to block startup on it.
  void stopFileWatchers()

  const configPath = getAwsConfigPath()
  const credsPath = getAwsCredentialsPath()
  const samlPath = getSamlConfigPath()

  watcher = chokidar.watch([configPath, credsPath, samlPath], {
    ignoreInitial: true,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    persistent: true
  })

  watcher.on('all', (_event, path) => {
    if (writeLock) return
    if (path === configPath || path === credsPath) {
      const credentialsChanged = path === credsPath
      debouncedNotify('profiles-changed', { verifyPendingLogins: credentialsChanged })
      // Both config and credentials changes are cheap to broadcast; keeps
      // the UI in sync when a user adds/removes a profile or refreshes creds.
      debouncedBroadcast('expiries-changed', 'aws-file')
    } else if (path === samlPath) {
      debouncedNotify('saml-changed', { verifyPendingLogins: false })
    }
  })

  // Errors from chokidar are non-fatal — log and keep going so a single
  // bad path (e.g. ~/.saml2aws missing on a fresh machine) doesn't kill
  // the watcher for the other two files.
  watcher.on('error', () => {
    /* swallow — file may not exist yet, will appear when first created */
  })
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

export async function stopFileWatchers(): Promise<void> {
  if (watcher) {
    const w = watcher
    watcher = null
    await w.close()
  }
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
