import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn(),
  writeIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getAwsConfigPath: () => '/home/test/.aws/config',
  getAwsCredentialsPath: () => '/home/test/.aws/credentials',
  getSamlConfigPath: () => '/home/test/.saml2aws'
}))

vi.mock('../profile-switcher', () => ({
  getActiveProfile: vi.fn().mockResolvedValue(null),
  switchProfile: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../file-watcher', () => ({
  setWriteLock: vi.fn()
}))

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
}))

import { promises as fs } from 'fs'
import { readIniFile, writeIniFile } from '../../utils/ini-helpers'
import { getActiveProfile, switchProfile } from '../profile-switcher'
import { setWriteLock } from '../file-watcher'
import { getRenameImpact, renameProfile } from '../profile-rename'

const mockReadIni = vi.mocked(readIniFile)
const mockWriteIni = vi.mocked(writeIniFile)
const mockGetActive = vi.mocked(getActiveProfile)
const mockSwitch = vi.mocked(switchProfile)
const mockSetWriteLock = vi.mocked(setWriteLock)
const mockReaddir = vi.mocked(fs.readdir)
const mockUnlink = vi.mocked(fs.unlink)

interface FilesState {
  config?: Record<string, Record<string, string>>
  credentials?: Record<string, Record<string, string>>
  saml?: Record<string, Record<string, string>>
}

function setFiles(state: FilesState): void {
  mockReadIni.mockImplementation((path: string) => {
    if (path === '/home/test/.aws/config') return Promise.resolve(state.config ?? {})
    if (path === '/home/test/.aws/credentials') return Promise.resolve(state.credentials ?? {})
    if (path === '/home/test/.saml2aws') return Promise.resolve(state.saml ?? {})
    return Promise.resolve({})
  })
}

function lastWrite(path: string): Record<string, Record<string, string>> | undefined {
  for (let i = mockWriteIni.mock.calls.length - 1; i >= 0; i--) {
    const call = mockWriteIni.mock.calls[i]
    if (call[0] === path) return call[1] as Record<string, Record<string, string>>
  }
  return undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetActive.mockResolvedValue(null)
  mockReaddir.mockResolvedValue([] as never)
  mockWriteIni.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
})

describe('getRenameImpact', () => {
  it('returns a populated impact for a profile in both files', async () => {
    setFiles({
      config: { 'profile foo': { region: 'us-east-1' } },
      credentials: { foo: { aws_access_key_id: 'AKIA' } }
    })

    const impact = await getRenameImpact('foo', 'bar')

    expect(impact).toMatchObject({
      oldName: 'foo',
      newName: 'bar',
      isDefault: false,
      configExists: true,
      credentialsExists: true,
      isActive: false,
      conflict: false,
      validationError: null,
      sourceProfileDependents: [],
      samlDependents: []
    })
  })

  it('flags an empty new name', async () => {
    setFiles({ config: { 'profile foo': {} } })
    const impact = await getRenameImpact('foo', '   ')
    expect(impact.validationError).toBe('empty')
  })

  it('flags rename to the same name', async () => {
    setFiles({ config: { 'profile foo': {} } })
    const impact = await getRenameImpact('foo', 'foo')
    expect(impact.validationError).toBe('same')
  })

  it('flags invalid characters', async () => {
    setFiles({ config: { 'profile foo': {} } })
    const impact = await getRenameImpact('foo', 'has spaces')
    expect(impact.validationError).toBe('invalid-chars')
  })

  it('detects conflict when target name already exists in config', async () => {
    setFiles({
      config: { 'profile foo': {}, 'profile bar': {} }
    })
    const impact = await getRenameImpact('foo', 'bar')
    expect(impact.conflict).toBe(true)
    expect(impact.validationError).toBe('conflict')
  })

  it('detects conflict when target exists only in credentials', async () => {
    setFiles({
      config: { 'profile foo': {} },
      credentials: { bar: { aws_access_key_id: 'AKIA' } }
    })
    const impact = await getRenameImpact('foo', 'bar')
    expect(impact.conflict).toBe(true)
  })

  it('flags not-found when neither file has the source profile', async () => {
    setFiles({})
    const impact = await getRenameImpact('ghost', 'phantom')
    expect(impact.validationError).toBe('not-found')
  })

  it('marks isDefault when renaming default', async () => {
    setFiles({ config: { default: { region: 'us-east-1' } } })
    const impact = await getRenameImpact('default', 'primary')
    expect(impact.isDefault).toBe(true)
    expect(impact.configExists).toBe(true)
  })

  it('detects source_profile dependents', async () => {
    setFiles({
      config: {
        'profile foo': { region: 'us-east-1' },
        'profile bar': { source_profile: 'foo', role_arn: 'arn:aws:iam::1:role/X' },
        'profile baz': { source_profile: 'foo', role_arn: 'arn:aws:iam::1:role/Y' },
        'profile other': { source_profile: 'something-else' }
      }
    })

    const impact = await getRenameImpact('foo', 'foo2')
    expect(impact.sourceProfileDependents.sort()).toEqual(['bar', 'baz'])
  })

  it('detects saml aws_profile dependents', async () => {
    setFiles({
      config: { 'profile foo': {} },
      saml: {
        work: { aws_profile: 'foo', url: 'https://idp' },
        home: { aws_profile: 'other' }
      }
    })

    const impact = await getRenameImpact('foo', 'foo2')
    expect(impact.samlDependents).toEqual(['work'])
  })

  it('reports isActive when getActiveProfile matches', async () => {
    mockGetActive.mockResolvedValue('foo')
    setFiles({ config: { 'profile foo': {} } })

    const impact = await getRenameImpact('foo', 'bar')
    expect(impact.isActive).toBe(true)
  })

  it('lists CLI cache files when present', async () => {
    setFiles({ config: { 'profile foo': {} } })
    mockReaddir.mockResolvedValue(['abc.json', 'def.json', 'ignore.txt'] as never)

    const impact = await getRenameImpact('foo', 'bar')
    expect(impact.cliCacheFiles).toHaveLength(2)
    expect(impact.cliCacheFiles[0]).toContain('abc.json')
  })

  it('returns empty cache list when the directory is missing', async () => {
    setFiles({ config: { 'profile foo': {} } })
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const impact = await getRenameImpact('foo', 'bar')
    expect(impact.cliCacheFiles).toEqual([])
  })
})

describe('renameProfile', () => {
  const baseOptions = {
    rewriteSourceProfileDependents: true,
    rewriteSamlDependents: true,
    clearCliCache: true
  }

  it('moves the profile section in config and credentials', async () => {
    setFiles({
      config: { 'profile foo': { region: 'us-east-1', output: 'json' } },
      credentials: { foo: { aws_access_key_id: 'AKIA', aws_secret_access_key: 'SECRET' } }
    })

    await renameProfile('foo', 'bar', baseOptions)

    const configWritten = lastWrite('/home/test/.aws/config')
    expect(configWritten).toEqual({
      'profile bar': { region: 'us-east-1', output: 'json' }
    })

    const credsWritten = lastWrite('/home/test/.aws/credentials')
    expect(credsWritten).toEqual({
      bar: { aws_access_key_id: 'AKIA', aws_secret_access_key: 'SECRET' }
    })
  })

  it('preserves non-standard config fields during rename', async () => {
    setFiles({
      config: {
        'profile foo': {
          region: 'us-east-1',
          mfa_serial: 'arn:aws:iam::1:mfa/me',
          cli_pager: ''
        }
      }
    })

    await renameProfile('foo', 'bar', baseOptions)

    const configWritten = lastWrite('/home/test/.aws/config')
    expect(configWritten?.['profile bar']).toEqual({
      region: 'us-east-1',
      mfa_serial: 'arn:aws:iam::1:mfa/me',
      cli_pager: ''
    })
  })

  it('rewrites source_profile dependents when the flag is set', async () => {
    setFiles({
      config: {
        'profile foo': { region: 'us-east-1' },
        'profile bar': { source_profile: 'foo', role_arn: 'arn:aws:iam::1:role/X' }
      }
    })

    await renameProfile('foo', 'foo2', baseOptions)

    const configWritten = lastWrite('/home/test/.aws/config')
    expect(configWritten?.['profile bar']).toEqual({
      source_profile: 'foo2',
      role_arn: 'arn:aws:iam::1:role/X'
    })
    expect(configWritten?.['profile foo2']).toEqual({ region: 'us-east-1' })
    expect(configWritten?.['profile foo']).toBeUndefined()
  })

  it('leaves dependents alone when rewrite flag is cleared', async () => {
    setFiles({
      config: {
        'profile foo': { region: 'us-east-1' },
        'profile bar': { source_profile: 'foo', role_arn: 'arn:aws:iam::1:role/X' }
      }
    })

    await renameProfile('foo', 'foo2', { ...baseOptions, rewriteSourceProfileDependents: false })

    const configWritten = lastWrite('/home/test/.aws/config')
    expect(configWritten?.['profile bar'].source_profile).toBe('foo')
  })

  it('rewrites saml aws_profile references when the flag is set', async () => {
    setFiles({
      config: { 'profile foo': {} },
      saml: { work: { aws_profile: 'foo', url: 'https://idp' } }
    })

    await renameProfile('foo', 'bar', baseOptions)

    const samlWritten = lastWrite('/home/test/.saml2aws')
    expect(samlWritten?.work.aws_profile).toBe('bar')
    expect(samlWritten?.work.url).toBe('https://idp')
  })

  it('skips saml rewrite when the flag is cleared', async () => {
    setFiles({
      config: { 'profile foo': {} },
      saml: { work: { aws_profile: 'foo' } }
    })

    await renameProfile('foo', 'bar', { ...baseOptions, rewriteSamlDependents: false })

    expect(lastWrite('/home/test/.saml2aws')).toBeUndefined()
  })

  it('re-points OS-level AWS_PROFILE when the renamed profile is active', async () => {
    mockGetActive.mockResolvedValue('foo')
    setFiles({ config: { 'profile foo': {} } })

    await renameProfile('foo', 'bar', baseOptions)

    expect(mockSwitch).toHaveBeenCalledWith('bar')
  })

  it('does not call switchProfile when the renamed profile is inactive', async () => {
    mockGetActive.mockResolvedValue('other')
    setFiles({ config: { 'profile foo': {} } })

    await renameProfile('foo', 'bar', baseOptions)

    expect(mockSwitch).not.toHaveBeenCalled()
  })

  it('throws on validation errors before touching any file', async () => {
    setFiles({
      config: { 'profile foo': {}, 'profile bar': {} }
    })

    await expect(renameProfile('foo', 'bar', baseOptions)).rejects.toThrow(/conflict/)
    expect(mockWriteIni).not.toHaveBeenCalled()
  })

  it('blocks renaming default unless allowDefault is set', async () => {
    setFiles({ config: { default: { region: 'us-east-1' } } })

    await expect(renameProfile('default', 'primary', baseOptions)).rejects.toThrow(
      /default-disallowed/
    )

    await renameProfile('default', 'primary', { ...baseOptions, allowDefault: true })
    const configWritten = lastWrite('/home/test/.aws/config')
    expect(configWritten?.['profile primary']).toEqual({ region: 'us-east-1' })
    expect(configWritten?.default).toBeUndefined()
  })

  it('clears CLI cache files when the flag is set', async () => {
    setFiles({ config: { 'profile foo': {} } })
    mockReaddir.mockResolvedValue(['a.json', 'b.json'] as never)

    await renameProfile('foo', 'bar', baseOptions)

    expect(mockUnlink).toHaveBeenCalledTimes(2)
  })

  it('skips CLI cache deletion when the flag is cleared', async () => {
    setFiles({ config: { 'profile foo': {} } })
    mockReaddir.mockResolvedValue(['a.json'] as never)

    await renameProfile('foo', 'bar', { ...baseOptions, clearCliCache: false })

    expect(mockUnlink).not.toHaveBeenCalled()
  })

  it('swallows ENOENT during cache cleanup', async () => {
    setFiles({ config: { 'profile foo': {} } })
    mockReaddir.mockResolvedValue(['a.json'] as never)
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await expect(renameProfile('foo', 'bar', baseOptions)).resolves.toBeUndefined()
  })

  it('calls setWriteLock at least once per affected file', async () => {
    setFiles({
      config: { 'profile foo': {} },
      credentials: { foo: { aws_access_key_id: 'AKIA' } },
      saml: { work: { aws_profile: 'foo' } }
    })

    await renameProfile('foo', 'bar', baseOptions)

    // Once for config, once for credentials, once for saml
    expect(mockSetWriteLock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
