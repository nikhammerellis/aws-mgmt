import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { readAwsConfig } from './aws-config'
import { getActiveProfile, switchProfile } from './profile-switcher'
import { getProfileExpiries } from './expiry-tracker'

/**
 * CLI flag passed by the auto-launch registration so we know to start
 * minimized to tray. `app.setLoginItemSettings({ openAtLogin: true,
 * args: [HIDDEN_ARG] })` causes Windows/macOS to launch the app with
 * this argv on boot. Manual launches don't pass it, so the window
 * still shows on user-initiated runs.
 */
export const HIDDEN_ARG = '--hidden'

/**
 * Whether the app was launched in hidden mode (auto-start at boot).
 * The launcher / startup-auto-launch passes HIDDEN_ARG via login-item
 * settings; manual launches don't.
 */
export function wasLaunchedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}

/**
 * Linux's desktop-environment-specific autostart story is a tangled mess
 * (KDE vs GNOME vs systemd vs XDG, all different). Electron's
 * setLoginItemSettings is well-supported on Windows and macOS but
 * unreliable on Linux. Hide the menu item there rather than silently
 * appearing to work.
 */
function isAutoStartSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

function formatRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'expired'
  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${totalSeconds}s`
}

let tray: Tray | null = null

function getTrayIconPath(): string {
  // In production, resources are in the app's resources directory
  // In dev, they're in the project root's resources/ folder
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tray-icon.png')
  }
  return join(__dirname, '../../resources/tray-icon.png')
}

export function createTray(getWindow: () => BrowserWindow | null): Tray {
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('AWS Profile Manager')

  // Click tray icon to show/focus window
  tray.on('click', () => {
    const win = getWindow()
    if (win) {
      if (win.isVisible()) {
        win.focus()
      } else {
        win.show()
      }
    }
  })

  // Build initial context menu
  updateTrayMenu(getWindow)

  return tray
}

export async function updateTrayMenu(getWindow: () => BrowserWindow | null): Promise<void> {
  if (!tray) return

  let profileItems: Electron.MenuItemConstructorOptions[] = []
  let activeLabel = 'AWS Profile Manager — no active profile'

  try {
    const [configs, activeProfile, expiries] = await Promise.all([
      readAwsConfig(),
      getActiveProfile(),
      getProfileExpiries().catch(() => [])
    ])

    if (activeProfile) {
      const activeConfig = configs.find((c) => c.name === activeProfile)
      const region = activeConfig?.region ?? 'no region'
      const activeExpiry = expiries.find((e) => e.profileName === activeProfile)
      let expirySuffix = ''
      if (activeExpiry) {
        const remaining = new Date(activeExpiry.expiresAt).getTime() - Date.now()
        expirySuffix = ` · ${formatRemaining(remaining)}`
      }
      activeLabel = `AWS: ${activeProfile} · ${region}${expirySuffix}`
    }

    profileItems = configs.map((p) => ({
      label: p.name,
      type: 'radio' as const,
      checked: p.name === activeProfile,
      click: async () => {
        await switchProfile(p.name)
        await updateTrayMenu(getWindow)
        // Notify renderer to refresh
        const win = getWindow()
        if (win) win.webContents.send('profiles-changed')
      }
    }))
  } catch {
    profileItems = [{ label: 'Failed to load profiles', enabled: false }]
  }

  tray.setToolTip(activeLabel)

  // "Launch at startup" — Windows/macOS only. Reads the current state
  // from the OS-native login-item registration (HKCU\...\Run on Windows,
  // LaunchAgents on macOS). Toggling re-registers with HIDDEN_ARG so the
  // boot-time launch starts in tray instead of popping the window.
  const startupItems: Electron.MenuItemConstructorOptions[] = []
  if (isAutoStartSupported()) {
    const settings = app.getLoginItemSettings()
    startupItems.push({
      label: 'Launch at startup',
      type: 'checkbox' as const,
      checked: settings.openAtLogin,
      click: () => {
        const wasOn = app.getLoginItemSettings().openAtLogin
        app.setLoginItemSettings({
          openAtLogin: !wasOn,
          args: !wasOn ? [HIDDEN_ARG] : []
        })
        // Rebuild so the checkbox reflects the new state. Fire-and-
        // forget — any failure surfaces as a stale checkmark, not a
        // hard error.
        void updateTrayMenu(getWindow)
      }
    })
    startupItems.push({ type: 'separator' as const })
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: activeLabel, enabled: false },
    { type: 'separator' },
    ...profileItems,
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        const win = getWindow()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    ...startupItems,
    {
      label: 'Quit',
      click: () => {
        app.exit(0)
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
