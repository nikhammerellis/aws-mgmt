import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn(),
  writeIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getAwsConfigPath: () => '/home/test/.aws/config'
}))

import { readIniFile, writeIniFile } from '../../utils/ini-helpers'
import { readAwsConfig, writeAwsConfigProfile, deleteAwsConfigProfile } from '../aws-config'

const mockReadIni = vi.mocked(readIniFile)
const mockWriteIni = vi.mocked(writeIniFile)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readAwsConfig', () => {
  it('parses profiles with the [profile X] prefix convention', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1', output: 'json' },
      'profile dev': { region: 'us-west-2', output: 'table' },
      'profile prod': { region: 'eu-west-1', role_arn: 'arn:aws:iam::123:role/Admin' }
    })

    const profiles = await readAwsConfig()

    expect(profiles).toHaveLength(3)
    expect(profiles[0]).toEqual(expect.objectContaining({ name: 'default', region: 'us-east-1' }))
    expect(profiles[1]).toEqual(expect.objectContaining({ name: 'dev', region: 'us-west-2' }))
    expect(profiles[2]).toEqual(expect.objectContaining({ name: 'prod', role_arn: 'arn:aws:iam::123:role/Admin' }))
  })

  it('skips unrecognized sections', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' },
      'random-section': { key: 'value' }
    })

    const profiles = await readAwsConfig()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('default')
  })

  it('returns empty array when no config file exists', async () => {
    mockReadIni.mockResolvedValue({})

    const profiles = await readAwsConfig()
    expect(profiles).toEqual([])
  })

  it('captures all known config fields', async () => {
    mockReadIni.mockResolvedValue({
      'profile full': {
        region: 'us-west-2',
        output: 'json',
        session_duration: '28800',
        role_arn: 'arn:aws:iam::123:role/Dev',
        source_profile: 'default',
        sso_start_url: 'https://sso.example.com',
        sso_region: 'us-east-1',
        sso_account_id: '123456',
        sso_role_name: 'DevRole'
      }
    })

    const profiles = await readAwsConfig()
    expect(profiles[0]).toEqual({
      name: 'full',
      region: 'us-west-2',
      output: 'json',
      session_duration: '28800',
      role_arn: 'arn:aws:iam::123:role/Dev',
      source_profile: 'default',
      sso_start_url: 'https://sso.example.com',
      sso_region: 'us-east-1',
      sso_account_id: '123456',
      sso_role_name: 'DevRole'
    })
  })
})

describe('writeAwsConfigProfile', () => {
  it('writes a new profile with [profile X] section name', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsConfigProfile({
      name: 'dev',
      region: 'us-west-2',
      output: 'json'
    })

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      {
        'default': { region: 'us-east-1' },
        'profile dev': { region: 'us-west-2', output: 'json' }
      }
    )
  })

  it('writes default profile without prefix', async () => {
    mockReadIni.mockResolvedValue({})
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsConfigProfile({ name: 'default', region: 'us-east-1' })

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      { 'default': { region: 'us-east-1' } }
    )
  })

  it('overwrites existing profile', async () => {
    mockReadIni.mockResolvedValue({
      'profile dev': { region: 'us-east-1', output: 'text' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsConfigProfile({ name: 'dev', region: 'eu-west-1', output: 'json' })

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      { 'profile dev': { region: 'eu-west-1', output: 'json' } }
    )
  })

  it('omits undefined fields', async () => {
    mockReadIni.mockResolvedValue({})
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsConfigProfile({ name: 'minimal' })

    const writtenData = mockWriteIni.mock.calls[0][1]
    const section = writtenData['profile minimal']
    expect(Object.keys(section)).toHaveLength(0)
  })
})

describe('deleteAwsConfigProfile', () => {
  it('removes a profile section from config', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' },
      'profile dev': { region: 'us-west-2' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await deleteAwsConfigProfile('dev')

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      { 'default': { region: 'us-east-1' } }
    )
  })

  it('removes default profile', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' },
      'profile dev': { region: 'us-west-2' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await deleteAwsConfigProfile('default')

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      { 'profile dev': { region: 'us-west-2' } }
    )
  })

  it('is a no-op when profile does not exist', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await deleteAwsConfigProfile('nonexistent')

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/config',
      { 'default': { region: 'us-east-1' } }
    )
  })
})
