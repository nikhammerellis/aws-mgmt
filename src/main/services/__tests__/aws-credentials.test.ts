import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/ini-helpers', () => ({
  readIniFile: vi.fn(),
  writeIniFile: vi.fn()
}))

vi.mock('../../utils/paths', () => ({
  getAwsCredentialsPath: () => '/home/test/.aws/credentials'
}))

import { readIniFile, writeIniFile } from '../../utils/ini-helpers'
import { readAwsCredentials, writeAwsCredential, deleteAwsCredential } from '../aws-credentials'

const mockReadIni = vi.mocked(readIniFile)
const mockWriteIni = vi.mocked(writeIniFile)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readAwsCredentials', () => {
  it('parses credential entries (no profile prefix)', async () => {
    mockReadIni.mockResolvedValue({
      'default': {
        aws_access_key_id: 'AKIA_DEFAULT',
        aws_secret_access_key: 'secret_default'
      },
      'dev': {
        aws_access_key_id: 'AKIA_DEV',
        aws_secret_access_key: 'secret_dev',
        aws_session_token: 'token_dev'
      }
    })

    const entries = await readAwsCredentials()

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      name: 'default',
      aws_access_key_id: 'AKIA_DEFAULT',
      aws_secret_access_key: 'secret_default',
      aws_session_token: undefined
    })
    expect(entries[1]).toEqual({
      name: 'dev',
      aws_access_key_id: 'AKIA_DEV',
      aws_secret_access_key: 'secret_dev',
      aws_session_token: 'token_dev'
    })
  })

  it('returns empty array when file missing', async () => {
    mockReadIni.mockResolvedValue({})
    expect(await readAwsCredentials()).toEqual([])
  })
})

describe('writeAwsCredential', () => {
  it('adds new credentials entry with 0o600 mode', async () => {
    mockReadIni.mockResolvedValue({
      'default': { aws_access_key_id: 'AKIA_OLD' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsCredential({
      name: 'dev',
      aws_access_key_id: 'AKIA_NEW',
      aws_secret_access_key: 'secret_new'
    })

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/credentials',
      expect.objectContaining({
        'default': { aws_access_key_id: 'AKIA_OLD' },
        'dev': { aws_access_key_id: 'AKIA_NEW', aws_secret_access_key: 'secret_new' }
      }),
      { mode: 0o600 }
    )
  })

  it('overwrites existing credentials', async () => {
    mockReadIni.mockResolvedValue({
      'dev': { aws_access_key_id: 'AKIA_OLD', aws_secret_access_key: 'old_secret' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsCredential({
      name: 'dev',
      aws_access_key_id: 'AKIA_NEW',
      aws_secret_access_key: 'new_secret'
    })

    const writtenData = mockWriteIni.mock.calls[0][1]
    expect(writtenData['dev'].aws_access_key_id).toBe('AKIA_NEW')
  })

  it('preserves unknown keys (e.g. saml2aws x_security_token_expires)', async () => {
    mockReadIni.mockResolvedValue({
      'dev': {
        aws_access_key_id: 'AKIA_OLD',
        aws_secret_access_key: 'old_secret',
        x_security_token_expires: '2026-04-13T22:00:00Z',
        x_principal_arn: 'arn:aws:sts::123:assumed-role/X/Y'
      }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsCredential({
      name: 'dev',
      aws_access_key_id: 'AKIA_NEW',
      aws_secret_access_key: 'new_secret'
    })

    const writtenData = mockWriteIni.mock.calls[0][1]
    expect(writtenData['dev'].aws_access_key_id).toBe('AKIA_NEW')
    expect(writtenData['dev'].x_security_token_expires).toBe('2026-04-13T22:00:00Z')
    expect(writtenData['dev'].x_principal_arn).toBe('arn:aws:sts::123:assumed-role/X/Y')
  })

  it('clears a managed key when the UI sends an empty value', async () => {
    mockReadIni.mockResolvedValue({
      'dev': {
        aws_access_key_id: 'AKIA_OLD',
        aws_secret_access_key: 'old_secret',
        aws_session_token: 'stale_token'
      }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await writeAwsCredential({
      name: 'dev',
      aws_access_key_id: 'AKIA_NEW',
      aws_secret_access_key: 'new_secret'
      // aws_session_token omitted → should be cleared
    })

    const writtenData = mockWriteIni.mock.calls[0][1]
    expect(writtenData['dev'].aws_session_token).toBeUndefined()
  })
})

describe('deleteAwsCredential', () => {
  it('removes credential entry', async () => {
    mockReadIni.mockResolvedValue({
      'default': { aws_access_key_id: 'AKIA_DEFAULT' },
      'dev': { aws_access_key_id: 'AKIA_DEV' }
    })
    mockWriteIni.mockResolvedValue(undefined)

    await deleteAwsCredential('dev')

    expect(mockWriteIni).toHaveBeenCalledWith(
      '/home/test/.aws/credentials',
      { 'default': { aws_access_key_id: 'AKIA_DEFAULT' } },
      { mode: 0o600 }
    )
  })
})

describe('x_principal_arn — saml2aws login evidence', () => {
  it('surfaces the assumed-role ARN saml2aws wrote', async () => {
    mockReadIni.mockResolvedValue({
      logistics: {
        aws_access_key_id: 'ASIA_X',
        aws_session_token: 'tok',
        x_principal_arn:
          'arn:aws:sts::111111111111:assumed-role/Admin-Logistics/user@example.com',
        x_security_token_expires: '2026-09-09T16:15:15-07:00'
      }
    })

    const [logistics] = await readAwsCredentials()
    expect(logistics.x_principal_arn).toBe(
      'arn:aws:sts::111111111111:assumed-role/Admin-Logistics/user@example.com'
    )
  })

  it('leaves it undefined for a static-key section', async () => {
    mockReadIni.mockResolvedValue({ 'legacy-static': { aws_access_key_id: 'AKIA_X' } })
    const [entry] = await readAwsCredentials()
    expect(entry.x_principal_arn).toBeUndefined()
  })

  it('does not write it back — it is preserved, not managed', async () => {
    mockReadIni.mockResolvedValue({
      logistics: { aws_access_key_id: 'OLD', x_principal_arn: 'arn:aws:sts::1:assumed-role/R/u' }
    })

    await writeAwsCredential({
      name: 'logistics',
      aws_access_key_id: 'NEW',
      x_principal_arn: 'arn:aws:sts::999:assumed-role/Attacker/u'
    })

    const written = mockWriteIni.mock.calls[0][1] as Record<string, Record<string, string>>
    expect(written.logistics.x_principal_arn).toBe('arn:aws:sts::1:assumed-role/R/u')
    expect(written.logistics.aws_access_key_id).toBe('NEW')
  })
})
