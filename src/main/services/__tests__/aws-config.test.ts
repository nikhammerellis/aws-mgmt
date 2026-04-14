import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn(),
  writeIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getAwsConfigPath: () => '/home/test/.aws/config'
}))

import { readIniFile, writeIniFile } from '../../utils/ini-helpers'
import {
  readAwsConfig,
  readSsoSessions,
  writeAwsConfigProfile,
  deleteAwsConfigProfile
} from '../aws-config'

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

  it('preserves unknown keys on edit (credential_process, mfa_serial, external_id)', async () => {
    mockReadIni.mockResolvedValue({
      'profile dev': {
        region: 'us-west-2',
        output: 'json',
        credential_process: '/usr/local/bin/aws-vault exec dev --json',
        mfa_serial: 'arn:aws:iam::123:mfa/alice',
        external_id: 'super-secret',
        role_session_name: 'alice-session'
      }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsConfigProfile({
      name: 'dev',
      region: 'eu-west-1', // change region
      output: 'json'
    })

    const section = mockWriteIni.mock.calls[0][1]['profile dev']
    expect(section.region).toBe('eu-west-1')
    expect(section.credential_process).toBe('/usr/local/bin/aws-vault exec dev --json')
    expect(section.mfa_serial).toBe('arn:aws:iam::123:mfa/alice')
    expect(section.external_id).toBe('super-secret')
    expect(section.role_session_name).toBe('alice-session')
  })

  it('clears a managed field when the UI sends an empty value', async () => {
    mockReadIni.mockResolvedValue({
      'profile dev': {
        region: 'us-east-1',
        output: 'json',
        role_arn: 'arn:aws:iam::123:role/Old',
        source_profile: 'default'
      }
    })
    mockWriteIni.mockResolvedValue(undefined)

    // Converting from assume-role to plain profile — role_arn should be cleared
    await writeAwsConfigProfile({
      name: 'dev',
      region: 'us-east-1',
      output: 'json'
      // role_arn, source_profile omitted → should be removed
    })

    const section = mockWriteIni.mock.calls[0][1]['profile dev']
    expect(section.role_arn).toBeUndefined()
    expect(section.source_profile).toBeUndefined()
    expect(section.region).toBe('us-east-1')
  })
})

describe('readSsoSessions', () => {
  it('parses [sso-session NAME] top-level blocks', async () => {
    mockReadIni.mockResolvedValue({
      'default': { region: 'us-east-1' },
      'profile dev': { sso_session: 'corp', sso_account_id: '123' },
      'sso-session corp': {
        sso_start_url: 'https://corp.awsapps.com/start',
        sso_region: 'us-east-1',
        sso_registration_scopes: 'sso:account:access'
      }
    })

    const sessions = await readSsoSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toEqual({
      name: 'corp',
      sso_start_url: 'https://corp.awsapps.com/start',
      sso_region: 'us-east-1',
      sso_registration_scopes: 'sso:account:access'
    })
  })

  it('returns an empty array when there are no sso-session blocks', async () => {
    mockReadIni.mockResolvedValue({ 'default': { region: 'us-east-1' } })
    expect(await readSsoSessions()).toEqual([])
  })
})

describe('readAwsConfig sso_session field', () => {
  it('surfaces sso_session references on profiles', async () => {
    mockReadIni.mockResolvedValue({
      'profile dev': {
        sso_session: 'corp',
        sso_account_id: '123456789012',
        sso_role_name: 'Developer'
      }
    })

    const profiles = await readAwsConfig()
    expect(profiles[0].sso_session).toBe('corp')
    // Inline SSO fields are not set on this profile — they live in the session block
    expect(profiles[0].sso_start_url).toBeUndefined()
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
