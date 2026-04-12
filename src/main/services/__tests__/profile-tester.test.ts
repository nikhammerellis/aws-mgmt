import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockImpl = vi.hoisted(() => vi.fn())

vi.mock('child_process', async () => {
  const { promisify } = await vi.importActual<typeof import('util')>('util')
  const execFile = () => {
    /* unused — promisify custom takes over */
  }
  ;(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = mockImpl
  return { execFile }
})

import { testProfile } from '../profile-tester'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('testProfile', () => {
  it('returns ok with parsed account, arn, and userId on success', async () => {
    mockImpl.mockResolvedValueOnce({
      stdout: JSON.stringify({
        Account: '123456789012',
        Arn: 'arn:aws:iam::123456789012:user/me',
        UserId: 'AIDAEXAMPLE'
      }),
      stderr: ''
    })

    const result = await testProfile('dev')

    expect(result).toEqual({
      ok: true,
      account: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/me',
      userId: 'AIDAEXAMPLE'
    })
  })

  it('rejects invalid profile names before shelling out', async () => {
    const result = await testProfile('has spaces')
    expect(result).toEqual({ ok: false, error: 'Invalid profile name' })
    expect(mockImpl).not.toHaveBeenCalled()
  })

  it('classifies AWS CLI missing as ENOENT with install hint', async () => {
    mockImpl.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await testProfile('dev')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('AWS CLI not found')
      expect(result.hint).toMatch(/AWS CLI v2/)
    }
  })

  it('classifies expired tokens', async () => {
    mockImpl.mockRejectedValueOnce(
      Object.assign(new Error('exit 255'), {
        stderr: 'An error occurred (ExpiredToken) when calling GetCallerIdentity'
      })
    )

    const result = await testProfile('dev')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/expired/i)
      expect(result.hint).toMatch(/login/)
    }
  })

  it('classifies profile-not-found error', async () => {
    mockImpl.mockRejectedValueOnce(
      Object.assign(new Error('exit 255'), {
        stderr: 'The config profile (ghost) could not be found'
      })
    )

    const result = await testProfile('ghost')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Profile not found/)
  })

  it('classifies missing credentials error', async () => {
    mockImpl.mockRejectedValueOnce(
      Object.assign(new Error('exit 255'), {
        stderr: 'Unable to locate credentials. You can configure credentials by running…'
      })
    )

    const result = await testProfile('dev')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/No credentials/)
  })
})
