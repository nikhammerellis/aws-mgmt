import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readIniFile, writeIniFile } from '../ini-helpers'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn()
}))

import { readFile, writeFile, access } from 'fs/promises'

const mockAccess = vi.mocked(access)
const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readIniFile', () => {
  it('parses a valid INI file', async () => {
    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(
      '[default]\nregion = us-east-1\noutput = json\n\n[profile dev]\nregion = us-west-2\n'
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
  it('writes INI data to file', async () => {
    mockWriteFile.mockResolvedValue(undefined)

    await writeIniFile('/test/config', {
      default: { region: 'us-east-1' },
      'profile dev': { region: 'us-west-2' }
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/test/config',
      expect.stringContaining('region=us-east-1'),
      'utf-8'
    )
  })

  it('propagates write errors', async () => {
    mockWriteFile.mockRejectedValue(new Error('Disk full'))

    await expect(writeIniFile('/test/config', {})).rejects.toThrow('Disk full')
  })
})
