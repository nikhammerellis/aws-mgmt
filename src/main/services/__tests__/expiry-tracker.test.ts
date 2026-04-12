import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn()
  }
}))

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getAwsConfigPath: () => '/home/test/.aws/config',
  getAwsCredentialsPath: () => '/home/test/.aws/credentials',
  getSsoCacheDir: () => '/home/test/.aws/sso/cache'
}))

import { promises as fs } from 'fs'
import { readIniFile } from '../../utils/ini-helpers'
import { getProfileExpiries } from '../expiry-tracker'

const mockReaddir = vi.mocked(fs.readdir)
const mockReadFile = vi.mocked(fs.readFile)
const mockReadIni = vi.mocked(readIniFile)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getProfileExpiries', () => {
  it('matches a legacy SSO profile to its cache entry via startUrl', async () => {
    mockReadIni.mockImplementation((path: string) => {
      if (path === '/home/test/.aws/config') {
        return Promise.resolve({
          'profile sso-dev': {
            sso_start_url: 'https://example.awsapps.com/start',
            sso_region: 'us-east-1'
          }
        })
      }
      if (path === '/home/test/.aws/credentials') return Promise.resolve({})
      return Promise.resolve({})
    })
    mockReaddir.mockResolvedValue(['abc.json'] as never)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        startUrl: 'https://example.awsapps.com/start',
        expiresAt: '2030-01-01T00:00:00Z',
        region: 'us-east-1'
      })
    )

    const result = await getProfileExpiries()

    expect(result).toEqual([
      {
        profileName: 'sso-dev',
        expiresAt: '2030-01-01T00:00:00Z',
        source: 'sso'
      }
    ])
  })

  it('reads saml2aws x_security_token_expires from credentials', async () => {
    mockReadIni.mockImplementation((path: string) => {
      if (path === '/home/test/.aws/config') {
        return Promise.resolve({ 'profile work': { region: 'us-east-1' } })
      }
      if (path === '/home/test/.aws/credentials') {
        return Promise.resolve({
          work: {
            aws_access_key_id: 'AKIA',
            x_security_token_expires: '2030-06-01T00:00:00Z'
          }
        })
      }
      return Promise.resolve({})
    })
    mockReaddir.mockResolvedValue([] as never)

    const result = await getProfileExpiries()

    expect(result).toEqual([
      {
        profileName: 'work',
        expiresAt: '2030-06-01T00:00:00Z',
        source: 'saml2aws'
      }
    ])
  })

  it('surfaces saml2aws profiles that have no config entry', async () => {
    mockReadIni.mockImplementation((path: string) => {
      if (path === '/home/test/.aws/config') return Promise.resolve({})
      if (path === '/home/test/.aws/credentials') {
        return Promise.resolve({
          'credentials-only': {
            aws_access_key_id: 'AKIA',
            x_security_token_expires: '2030-01-01T00:00:00Z'
          }
        })
      }
      return Promise.resolve({})
    })
    mockReaddir.mockResolvedValue([] as never)

    const result = await getProfileExpiries()

    expect(result).toHaveLength(1)
    expect(result[0].profileName).toBe('credentials-only')
    expect(result[0].source).toBe('saml2aws')
  })

  it('returns empty list when SSO cache dir is missing', async () => {
    mockReadIni.mockResolvedValue({})
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await getProfileExpiries()
    expect(result).toEqual([])
  })

  it('ignores unreadable or malformed cache files', async () => {
    mockReadIni.mockImplementation((path: string) => {
      if (path === '/home/test/.aws/config') {
        return Promise.resolve({
          'profile sso-dev': { sso_start_url: 'https://example.awsapps.com/start' }
        })
      }
      return Promise.resolve({})
    })
    mockReaddir.mockResolvedValue(['bad.json', 'good.json'] as never)
    mockReadFile.mockImplementation((path) => {
      if ((path as string).endsWith('bad.json')) return Promise.reject(new Error('permission denied'))
      return Promise.resolve(
        JSON.stringify({
          startUrl: 'https://example.awsapps.com/start',
          expiresAt: '2030-01-01T00:00:00Z'
        })
      )
    })

    const result = await getProfileExpiries()
    expect(result).toHaveLength(1)
    expect(result[0].profileName).toBe('sso-dev')
  })
})
