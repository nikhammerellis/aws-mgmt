import { watch, type FSWatcher } from 'fs'
import { dirname } from 'path'
import { BrowserWindow } from 'electron'
import { getAwsConfigPath, getAwsCredentialsPath, getSamlConfigPath } from '../utils/paths'

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
        debouncedNotify('profiles-changed')
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
      debouncedNotify('saml-changed')
    })
    watchers.push(samlWatcher)
  } catch {
    // File may not exist
  }
}

export function stopFileWatchers(): void {
  for (const w of watchers) {
    w.close()
  }
  watchers = []
}

function debouncedNotify(channel: string): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel)
    }
  }, 300)
}
