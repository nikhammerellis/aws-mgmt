import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readIniFile, writeIniFile } from '../ini-helpers'

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    chmod: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn()
  }
}))

vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('abcdef012345', 'hex'))
}))

import { promises as fs } from 'fs'

const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockAccess = vi.mocked(fs.access)
const mockChmod = vi.mocked(fs.chmod)
const mockRename = vi.mocked(fs.rename)
const mockUnlink = vi.mocked(fs.unlink)

const originalPlatform = process.platform
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

describe('readIniFile', () => {
  it('parses a valid INI file', async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(
      '[default]\nregion = us-east-1\noutput = json\n\n[profile dev]\nregion = us-west-2\n' as never
    )

    const result = await readIniFile('/test/config')

    expect(result).toEqual({
      default: { region: 'us-east-1', output: 'json' },
      'profile dev': { region: 'us-west-2' }
    })
  })

  it('returns empty object when file does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    const result = await readIniFile('/nonexistent')
    expect(result).toEqual({})
  })

  it('returns empty object when read fails', async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockRejectedValue(new Error('Permission denied'))

    const result = await readIniFile('/no-permission')
    expect(result).toEqual({})
  })
})

describe('writeIniFile', () => {
  it('writes to a tempfile and renames over the target', async () => {
    setPlatform('linux')
    mockWriteFile.mockResolvedValue(undefined)
    mockChmod.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)

    await writeIniFile('/home/u/.aws/config', {
      default: { region: 'us-east-1' }
    })

    // Tempfile goes into the same directory as the target
    const tmpPath = mockWriteFile.mock.calls[0][0] as string
    expect(tmpPath).toMatch(/[\/\\]\.config\.\d+\.[0-9a-f]+\.tmp$/)

    // Content matches
    expect(mockWriteFile.mock.calls[0][1]).toContain('region=us-east-1')

    // Default mode 0o644 for non-secret files
    const opts = mockWriteFile.mock.calls[0][2] as { mode: number; flag: string }
    expect(opts.mode).toBe(0o644)
    expect(opts.flag).toBe('wx')

    // Chmod re-applies on POSIX
    expect(mockChmod).toHaveBeenCalledWith(tmpPath, 0o644)

    // Final rename over target
    expect(mockRename).toHaveBeenCalledWith(tmpPath, '/home/u/.aws/config')
  })

  it('honors an explicit mode option (0o600 for secret files)', async () => {
    setPlatform('linux')
    mockWriteFile.mockResolvedValue(undefined)
    mockChmod.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)

    await writeIniFile(
      '/home/u/.aws/credentials',
      { dev: { aws_access_key_id: 'AKIA' } },
      { mode: 0o600 }
    )

    const opts = mockWriteFile.mock.calls[0][2] as { mode: number }
    expect(opts.mode).toBe(0o600)
    expect(mockChmod).toHaveBeenCalledWith(expect.any(String), 0o600)
  })

  it('skips chmod on Windows but still writes + renames', async () => {
    setPlatform('win32')
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)

    await writeIniFile('C:\\Users\\x\\.aws\\config', {})

    expect(mockWriteFile).toHaveBeenCalled()
    expect(mockChmod).not.toHaveBeenCalled()
    expect(mockRename).toHaveBeenCalled()
  })

  it('cleans up the tempfile if the rename fails', async () => {
    setPlatform('linux')
    mockWriteFile.mockResolvedValue(undefined)
    mockChmod.mockResolvedValue(undefined)
    mockRename.mockRejectedValue(new Error('EBUSY'))
    mockUnlink.mockResolvedValue(undefined)

    await expect(writeIniFile('/t/config', {})).rejects.toThrow('EBUSY')
    expect(mockUnlink).toHaveBeenCalled()
  })

  it('propagates write errors', async () => {
    setPlatform('linux')
    mockWriteFile.mockRejectedValue(new Error('Disk full'))
    mockUnlink.mockResolvedValue(undefined)

    await expect(writeIniFile('/test/config', {})).rejects.toThrow('Disk full')
  })
})
