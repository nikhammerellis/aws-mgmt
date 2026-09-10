import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
const mockTrayInstance = {
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn()
}

const mockMenuBuildFromTemplate = vi.fn().mockReturnValue({})

vi.mock('electron', () => {
  function MockTray() { return mockTrayInstance }
  return {
    Tray: MockTray,
    Menu: { buildFromTemplate: (...args: unknown[]) => mockMenuBuildFromTemplate(...args) },
    nativeImage: {
      createFromPath: vi.fn().mockReturnValue({ isEmpty: () => false }),
      createEmpty: vi.fn().mockReturnValue({})
    },
    BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
    app: {
      isPackaged: false,
      exit: vi.fn(),
      getLoginItemSettings: vi.fn().mockReturnValue({ openAtLogin: false }),
      setLoginItemSettings: vi.fn()
    }
  }
})

vi.mock('../aws-config', () => ({
  readAwsConfig: vi.fn().mockResolvedValue([
    { name: 'default', region: 'us-east-1' },
    { name: 'dev', region: 'us-west-2' }
  ])
}))

vi.mock('../profile-switcher', () => ({
  getActiveContext: vi.fn().mockResolvedValue({
    liveProfiles: ['default'],
    staticProfiles: [],
    shellProfile: 'default',
    machineDefault: 'default',
    contextProfile: 'default',
    effective: 'default',
    machineDefaultStale: false
  }),
  switchProfile: vi.fn().mockResolvedValue(undefined)
}))

import { createTray, updateTrayMenu, destroyTray } from '../tray'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tray', () => {
  const mockGetWindow = vi.fn().mockReturnValue(null)

  describe('createTray', () => {
    it('creates a tray with tooltip', () => {
      createTray(mockGetWindow)

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('AWS Profile Manager')
    })

    it('registers a click handler', () => {
      createTray(mockGetWindow)

      expect(mockTrayInstance.on).toHaveBeenCalledWith('click', expect.any(Function))
    })
  })

  describe('updateTrayMenu', () => {
    it('builds context menu with profile list', async () => {
      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      expect(mockMenuBuildFromTemplate).toHaveBeenCalled()
      const template = mockMenuBuildFromTemplate.mock.calls[0][0]

      // Should include profile items
      const profileItems = template.filter((item: { type?: string; label?: string }) =>
        item.type === 'radio'
      )
      expect(profileItems).toHaveLength(2)
      // 'default' is live in the mocked context, so it carries the live dot.
      expect(profileItems[0].label).toBe('● default')
      expect(profileItems[0].checked).toBe(true)
      expect(profileItems[1].label).toBe('dev')
      expect(profileItems[1].checked).toBe(false)
    })

    it('includes Show Window and Quit menu items', async () => {
      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      const template = mockMenuBuildFromTemplate.mock.calls[0][0]
      const labels = template.map((item: { label?: string }) => item.label).filter(Boolean)

      expect(labels).toContain('Show Window')
      expect(labels).toContain('Quit')
    })

    it('updates the tooltip with the active profile and region', async () => {
      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      // The mocked active profile is 'default' with region 'us-east-1'
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('AWS: default · us-east-1')
    })

    it('shows the active label as the first menu item', async () => {
      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      const template = mockMenuBuildFromTemplate.mock.calls[0][0]
      expect(template[0].label).toBe('AWS: default · us-east-1')
      expect(template[0].enabled).toBe(false)
    })

    it('marks live profiles with a dot and leaves dead ones plain', async () => {
      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      const template = mockMenuBuildFromTemplate.mock.calls[0][0]
      const labels = template.map((item: { label?: string }) => item.label).filter(Boolean)

      // 'default' holds live credentials in the mocked context; 'dev' does not.
      expect(labels).toContain('● default')
      expect(labels).toContain('dev')
    })

    it('says "not logged in" when the selected profile has no live session', async () => {
      const { getActiveContext } = await import('../profile-switcher')
      vi.mocked(getActiveContext).mockResolvedValueOnce({
        liveProfiles: [],
        staticProfiles: [],
        shellProfile: 'default',
        machineDefault: 'default',
        contextProfile: null,
        effective: 'default',
        machineDefaultStale: true
      })

      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
        'AWS: default · us-east-1 · not logged in'
      )
    })

    it('reports how many other sessions are live', async () => {
      const { getActiveContext } = await import('../profile-switcher')
      vi.mocked(getActiveContext).mockResolvedValueOnce({
        liveProfiles: ['default', 'dev'],
        staticProfiles: [],
        shellProfile: 'default',
        machineDefault: 'default',
        contextProfile: 'default',
        effective: 'default',
        machineDefaultStale: false
      })

      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
        'AWS: default · us-east-1 (+1 more live)'
      )
    })

    it('counts every live session when the selected profile is not one of them', async () => {
      const { getActiveContext } = await import('../profile-switcher')
      vi.mocked(getActiveContext).mockResolvedValueOnce({
        liveProfiles: ['dev'],
        staticProfiles: [],
        shellProfile: 'default',
        machineDefault: 'default',
        contextProfile: 'default',
        effective: 'default',
        machineDefaultStale: true
      })

      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      // 'default' is not live, so it discounts nothing — one other session is
      // live. Subtracting unconditionally reported "+0" and hid it entirely.
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
        'AWS: default · us-east-1 · not logged in (+1 more live)'
      )
    })

    it('says "static keys" instead of "not logged in" for long-lived IAM keys', async () => {
      const { getActiveContext } = await import('../profile-switcher')
      vi.mocked(getActiveContext).mockResolvedValueOnce({
        liveProfiles: [],
        staticProfiles: ['default'],
        shellProfile: 'default',
        machineDefault: 'default',
        contextProfile: 'default',
        effective: 'default',
        machineDefaultStale: false
      })

      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
        'AWS: default · us-east-1 · static keys'
      )
    })

    it('does not advertise an effective profile with no config section', async () => {
      const { getActiveContext } = await import('../profile-switcher')
      vi.mocked(getActiveContext).mockResolvedValueOnce({
        liveProfiles: ['dev'],
        staticProfiles: [],
        shellProfile: 'deleted-profile',
        machineDefault: 'deleted-profile',
        contextProfile: null,
        effective: 'deleted-profile',
        machineDefaultStale: true
      })

      createTray(mockGetWindow)
      await updateTrayMenu(mockGetWindow)

      // Naming a profile the menu has no row for left the tooltip claiming
      // "AWS: deleted-profile · no region" with nothing checked.
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
        'AWS: 1 live session(s), none selected'
      )
    })
  })

  describe('destroyTray', () => {
    it('destroys the tray', async () => {
      createTray(mockGetWindow)
      // Wait for async updateTrayMenu triggered by createTray
      await new Promise((r) => setTimeout(r, 10))
      destroyTray()

      expect(mockTrayInstance.destroy).toHaveBeenCalledOnce()
    })
  })
})
