import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn(),
  writeIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getSamlConfigPath: () => '/home/test/.saml2aws'
}))

import { readIniFile, writeIniFile } from '../../utils/ini-helpers'
import { readSamlConfig, writeSamlProfile, deleteSamlProfile } from '../saml-config'

const mockReadIni = vi.mocked(readIniFile)
const mockWriteIni = vi.mocked(writeIniFile)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readSamlConfig', () => {
  it('reads SAML profiles from INI sections', async () => {
    mockReadIni.mockResolvedValue({
      'uncharted': {
        url: 'https://accounts.google.com/o/saml2/idp',
        username: 'user@example.com',
        provider: 'GoogleApps',
        mfa: 'Auto',
        aws_urn: 'urn:amazon:webservices',
        aws_session_duration: '3600',
        aws_profile: 'uncharted',
        role_arn: 'arn:aws:iam::123:role/Admin',
        skip_verify: 'false'
      }
    })

    const profiles = await readSamlConfig()

    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('uncharted')
    expect(profiles[0].provider).toBe('GoogleApps')
    expect(profiles[0].url).toBe('https://accounts.google.com/o/saml2/idp')
  })

  it('returns empty array when file missing', async () => {
    mockReadIni.mockResolvedValue({})
    expect(await readSamlConfig()).toEqual([])
  })

  it('handles multiple profiles', async () => {
    mockReadIni.mockResolvedValue({
      'prod': { provider: 'Okta', username: 'admin@corp.com' },
      'staging': { provider: 'ADFS', username: 'dev@corp.com' }
    })

    const profiles = await readSamlConfig()
    expect(profiles).toHaveLength(2)
    expect(profiles.map(p => p.name)).toEqual(['prod', 'staging'])
  })
})

describe('writeSamlProfile', () => {
  it('writes new SAML profile', async () => {
    mockReadIni.mockResolvedValue({})
    mockWriteIni.mockResolvedValue(undefined)

    await writeSamlProfile({
      name: 'test',
      url: 'https://idp.example.com',
      provider: 'Okta',
      username: 'user@test.com'
    })

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.saml2aws',
      {
        'test': {
          url: 'https://idp.example.com',
          provider: 'Okta',
          username: 'user@test.com'
        }
      },
      { mode: 0o600 }
    )
  })

  it('preserves existing profiles when adding new one', async () => {
    mockReadIni.mockResolvedValue({
      'existing': { provider: 'GoogleApps' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeSamlProfile({ name: 'new-profile', provider: 'Okta' })

    const writtenData = mockWriteIni.mock.calls[0][1]
    expect(writtenData['existing']).toBeDefined()
    expect(writtenData['new-profile']).toBeDefined()
  })

  it('preserves unknown keys on edit (e.g. disable_keychain, target_url)', async () => {
    mockReadIni.mockResolvedValue({
      'corp': {
        provider: 'Okta',
        username: 'old@corp.com',
        disable_keychain: 'true',
        target_url: 'https://target.example.com',
        http_attempts_count: '3'
      }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeSamlProfile({
      name: 'corp',
      provider: 'Okta',
      username: 'new@corp.com'
    })

    const written = mockWriteIni.mock.calls[0][1]['corp']
    expect(written.username).toBe('new@corp.com')
    expect(written.disable_keychain).toBe('true')
    expect(written.target_url).toBe('https://target.example.com')
    expect(written.http_attempts_count).toBe('3')
  })
})

describe('deleteSamlProfile', () => {
  it('removes SAML profile', async () => {
    mockReadIni.mockResolvedValue({
      'keep': { provider: 'Okta' },
      'remove': { provider: 'ADFS' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await deleteSamlProfile('remove')

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.saml2aws',
      { 'keep': { provider: 'Okta' } },
      { mode: 0o600 }
    )
  })
})
