import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecFileAsync, mockWriteFile, mockRename, mockReadFile, mockUnlink } = vi.hoisted(
  () => ({
    mockExecFileAsync: vi.fn(),
    mockWriteFile: vi.fn(),
    mockRename: vi.fn(),
    mockReadFile: vi.fn(),
    mockUnlink: vi.fn()
  })
)

vi.mock('child_process', () => ({ execFile: vi.fn() }))
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync
}))
// switchProfile now publishes ~/.aws/nmd-context.json. Without these mocks the
// suite would write to the developer's real AWS directory.
vi.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    rename: mockRename,
    unlink: mockUnlink
  }
}))
vi.mock('../file-watcher', () => ({ setWriteLock: vi.fn() }))
vi.mock('../aws-credentials', () => ({ readAwsCredentials: vi.fn().mockResolvedValue([]) }))
vi.mock('../expiry-tracker', () => ({ getProfileExpiries: vi.fn().mockResolvedValue([]) }))
vi.mock('../../utils/paths', () => ({
  getNmdContextPath: () => '/fake/.aws/nmd-context.json'
}))

import { dirname, normalize } from 'path'

import { getActiveProfile, switchProfile, clearActiveProfile } from '../profile-switcher'

describe('profile-switcher', () => {
  const originalEnv = process.env
  const originalPlatform = process.platform

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)
    mockUnlink.mockResolvedValue(undefined)
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
    it('calls setx on Windows and reports persisted=true', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      const result = await switchProfile('dev')

      expect(mockExecFileAsync).toHaveBeenCalledWith('setx', ['AWS_PROFILE', 'dev'])
      expect(process.env.AWS_PROFILE).toBe('dev')
      expect(result.persisted).toBe(true)
      expect(result.mechanism).toBe('setx')
    })

    it('calls launchctl on macOS and reports persisted=true', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      const result = await switchProfile('staging')

      expect(mockExecFileAsync).toHaveBeenCalledWith('launchctl', ['setenv', 'AWS_PROFILE', 'staging'])
      expect(process.env.AWS_PROFILE).toBe('staging')
      expect(result.persisted).toBe(true)
      expect(result.mechanism).toBe('launchctl')
    })

    it('reports persisted=false on Linux with an actionable note', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      const result = await switchProfile('test')

      expect(mockExecFileAsync).not.toHaveBeenCalled()
      expect(process.env.AWS_PROFILE).toBe('test')
      expect(result.persisted).toBe(false)
      expect(result.mechanism).toBe('process-only')
      expect(result.note).toBeDefined()
      expect(result.note).toMatch(/shell rc/)
    })

    // getActiveContext ranks the context file above AWS_PROFILE, so without
    // this write the app's own Switch could never move the app's own badge.
    it('publishes the selection to the context file, written atomically', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      await switchProfile('vision')

      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      const [tmpPath, contents] = mockWriteFile.mock.calls[0]
      // Temp file first, then renamed over the target. Same directory, or the
      // rename crosses a filesystem boundary and stops being atomic.
      expect(tmpPath).not.toBe('/fake/.aws/nmd-context.json')
      expect(dirname(String(tmpPath))).toBe(normalize(dirname('/fake/.aws/nmd-context.json')))
      expect(mockRename).toHaveBeenCalledWith(tmpPath, '/fake/.aws/nmd-context.json')

      const written = JSON.parse(contents as string)
      expect(written.profile).toBe('vision')
      expect(typeof written.updatedAt).toBe('string')
    })

    it('carries the account metadata forward when the profile is unchanged', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          profile: 'logistics',
          client: 'logistics',
          accountId: '111111111111',
          region: 'us-west-2',
          updatedAt: '2020-01-01T00:00:00.000Z'
        })
      )

      await switchProfile('logistics')

      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
      expect(written.accountId).toBe('111111111111')
      expect(written.region).toBe('us-west-2')
      expect(written.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
    })

    it('drops metadata describing a different account when the profile changes', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      mockReadFile.mockResolvedValue(
        JSON.stringify({ profile: 'logistics', accountId: '111111111111', region: 'us-west-2' })
      )

      await switchProfile('media')

      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
      expect(written.profile).toBe('media')
      expect(written.accountId).toBeUndefined()
      expect(written.region).toBeUndefined()
    })

    it('still reports the env switch when the context file cannot be written', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      mockWriteFile.mockRejectedValue(new Error('EACCES'))

      const result = await switchProfile('dev')

      expect(process.env.AWS_PROFILE).toBe('dev')
      expect(result.mechanism).toBe('process-only')
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
