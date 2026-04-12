import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    access: vi.fn(),
    copyFile: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn()
  }
}))

vi.mock('os', () => ({
  homedir: () => '/home/test'
}))

import { promises as fs } from 'fs'
import { backupFile, pruneBackups, getBackupDir } from '../backup'

const mockAccess = vi.mocked(fs.access)
const mockMkdir = vi.mocked(fs.mkdir)
const mockCopyFile = vi.mocked(fs.copyFile)
const mockReaddir = vi.mocked(fs.readdir)
const mockUnlink = vi.mocked(fs.unlink)

beforeEach(() => {
  vi.clearAllMocks()
  mockAccess.mockResolvedValue(undefined)
  mockMkdir.mockResolvedValue(undefined)
  mockCopyFile.mockResolvedValue(undefined)
  mockReaddir.mockResolvedValue([] as never)
  mockUnlink.mockResolvedValue(undefined)
})

describe('backupFile', () => {
  it('returns null when the source file does not exist', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await backupFile('/home/test/.aws/config')

    expect(result).toBeNull()
    expect(mockCopyFile).not.toHaveBeenCalled()
  })

  it('creates the backup dir and copies the source into it', async () => {
    await backupFile('/home/test/.aws/config')

    expect(mockMkdir).toHaveBeenCalledWith(getBackupDir(), { recursive: true })
    expect(mockCopyFile).toHaveBeenCalledOnce()
    const [source, dest] = mockCopyFile.mock.calls[0]
    expect(source).toBe('/home/test/.aws/config')
    expect(dest as string).toContain('-config')
  })

  it('embeds an ISO-style timestamp in the backup filename', async () => {
    await backupFile('/home/test/.aws/credentials')

    const [, dest] = mockCopyFile.mock.calls[0]
    // 2026-04-11T15-30-00-000Z-credentials
    expect(dest as string).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
    expect(dest as string).toContain('-credentials')
  })
})

describe('pruneBackups', () => {
  it('deletes the oldest files beyond the keep limit', async () => {
    const entries = [
      '2026-01-01T00-00-00-000Z-config',
      '2026-01-02T00-00-00-000Z-config',
      '2026-01-03T00-00-00-000Z-config',
      '2026-01-04T00-00-00-000Z-config',
      '2026-01-05T00-00-00-000Z-config'
    ] as never
    mockReaddir.mockResolvedValueOnce(entries)

    await pruneBackups('config', 2)

    // Oldest 3 should be unlinked
    expect(mockUnlink).toHaveBeenCalledTimes(3)
    const unlinked = mockUnlink.mock.calls.map((c) => c[0] as string)
    expect(unlinked[0]).toContain('2026-01-01')
    expect(unlinked[1]).toContain('2026-01-02')
    expect(unlinked[2]).toContain('2026-01-03')
  })

  it('is a no-op when backup count is within the limit', async () => {
    mockReaddir.mockResolvedValueOnce([
      '2026-01-01T00-00-00-000Z-config',
      '2026-01-02T00-00-00-000Z-config'
    ] as never)

    await pruneBackups('config', 5)

    expect(mockUnlink).not.toHaveBeenCalled()
  })

  it('only prunes files matching the given base name', async () => {
    mockReaddir.mockResolvedValueOnce([
      '2026-01-01T00-00-00-000Z-config',
      '2026-01-01T00-00-00-000Z-credentials',
      '2026-01-02T00-00-00-000Z-config',
      '2026-01-02T00-00-00-000Z-credentials'
    ] as never)

    await pruneBackups('config', 1)

    expect(mockUnlink).toHaveBeenCalledOnce()
    expect(mockUnlink.mock.calls[0][0] as string).toContain('2026-01-01T00-00-00-000Z-config')
  })

  it('swallows errors during directory listing', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('ENOENT'))

    await expect(pruneBackups('config', 1)).resolves.toBeUndefined()
  })
})
