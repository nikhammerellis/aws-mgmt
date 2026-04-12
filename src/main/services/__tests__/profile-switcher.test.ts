import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn()
}))

vi.mock('child_process', () => ({ execFile: vi.fn() }))
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync
}))

import { getActiveProfile, switchProfile, clearActiveProfile } from '../profile-switcher'

describe('profile-switcher', () => {
  const originalEnv = process.env
  const originalPlatform = process.platform

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  describe('getActiveProfile', () => {
    it('returns AWS_PROFILE from process.env', async () => {
      process.env.AWS_PROFILE = 'my-profile'
      expect(await getActiveProfile()).toBe('my-profile')
    })

    it('returns null when no profile is set and not on Windows', async () => {
      delete process.env.AWS_PROFILE
      Object.defineProperty(process, 'platform', { value: 'linux' })

      expect(await getActiveProfile()).toBeNull()
    })

    it('checks Windows registry when env var not set on win32', async () => {
      delete process.env.AWS_PROFILE
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockExecFileAsync.mockResolvedValue({
        stdout: '    AWS_PROFILE    REG_SZ    production\r\n'
      })

      expect(await getActiveProfile()).toBe('production')
    })

    it('returns null when Windows registry key does not exist', async () => {
      delete process.env.AWS_PROFILE
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockExecFileAsync.mockRejectedValue(new Error('not found'))

      expect(await getActiveProfile()).toBeNull()
    })
  })

  describe('switchProfile', () => {
    it('calls setx on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await switchProfile('dev')

      expect(mockExecFileAsync).toHaveBeenCalledWith('setx', ['AWS_PROFILE', 'dev'])
      expect(process.env.AWS_PROFILE).toBe('dev')
    })

    it('calls launchctl on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await switchProfile('staging')

      expect(mockExecFileAsync).toHaveBeenCalledWith('launchctl', ['setenv', 'AWS_PROFILE', 'staging'])
      expect(process.env.AWS_PROFILE).toBe('staging')
    })

    it('only sets process.env on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      await switchProfile('test')

      expect(mockExecFileAsync).not.toHaveBeenCalled()
      expect(process.env.AWS_PROFILE).toBe('test')
    })
  })

  describe('clearActiveProfile', () => {
    it('deletes registry key on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      process.env.AWS_PROFILE = 'old'
      await clearActiveProfile()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'reg', ['delete', 'HKCU\\Environment', '/v', 'AWS_PROFILE', '/f']
      )
      expect(process.env.AWS_PROFILE).toBeUndefined()
    })

    it('calls launchctl unsetenv on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      process.env.AWS_PROFILE = 'old'
      await clearActiveProfile()

      expect(mockExecFileAsync).toHaveBeenCalledWith('launchctl', ['unsetenv', 'AWS_PROFILE'])
      expect(process.env.AWS_PROFILE).toBeUndefined()
    })
  })
})
