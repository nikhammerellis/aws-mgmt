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
      exit: vi.fn()
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
  getActiveProfile: vi.fn().mockResolvedValue('default'),
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
      expect(profileItems[0].label).toBe('default')
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
