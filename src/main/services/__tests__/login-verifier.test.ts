import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../profile-tester', () => ({
  testProfile: vi.fn()
}))

import { testProfile } from '../profile-tester'
import {
  trackPendingLogin,
  getPendingLogins,
  clearPendingLogin,
  verifyLogin,
  resetPendingLoginsForTests,
  PENDING_TTL_MS
} from '../login-verifier'

const mockTestProfile = vi.mocked(testProfile)

beforeEach(() => {
  vi.useFakeTimers()
  resetPendingLoginsForTests()
  mockTestProfile.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('trackPendingLogin / getPendingLogins', () => {
  it('records a profile as pending', () => {
    trackPendingLogin('dev')
    expect(getPendingLogins()).toEqual(['dev'])
  })

  it('supports multiple pending profiles', () => {
    trackPendingLogin('dev')
    trackPendingLogin('prod')
    expect(getPendingLogins().sort()).toEqual(['dev', 'prod'])
  })

  it('drops a pending profile after the TTL', () => {
    trackPendingLogin('dev')
    expect(getPendingLogins()).toEqual(['dev'])

    vi.advanceTimersByTime(PENDING_TTL_MS + 1)
    expect(getPendingLogins()).toEqual([])
  })

  it('refreshes the TTL when re-tracking', () => {
    trackPendingLogin('dev')
    vi.advanceTimersByTime(PENDING_TTL_MS - 1000)
    trackPendingLogin('dev') // refresh
    vi.advanceTimersByTime(2000)
    // Would have expired at the original TTL, but refreshed so still pending.
    expect(getPendingLogins()).toEqual(['dev'])
  })
})

describe('clearPendingLogin', () => {
  it('removes a pending entry and cancels its TTL', () => {
    trackPendingLogin('dev')
    clearPendingLogin('dev')
    expect(getPendingLogins()).toEqual([])
  })

  it('is a no-op if the profile was not pending', () => {
    expect(() => clearPendingLogin('never-tracked')).not.toThrow()
  })
})

describe('verifyLogin', () => {
  it('clears the pending marker on STS success', async () => {
    trackPendingLogin('dev')
    mockTestProfile.mockResolvedValueOnce({
      ok: true,
      account: '123456789012',
      arn: 'arn:aws:sts::123456789012:assumed-role/Admin/alice',
      userId: 'AROA:alice'
    })

    const result = await verifyLogin('dev')
    expect(result.ok).toBe(true)
    expect(getPendingLogins()).toEqual([])
    expect(mockTestProfile).toHaveBeenCalledWith('dev')
  })

  it('keeps the pending marker on STS failure', async () => {
    trackPendingLogin('dev')
    mockTestProfile.mockResolvedValueOnce({
      ok: false,
      error: 'Credentials expired or invalid'
    })

    const result = await verifyLogin('dev')
    expect(result.ok).toBe(false)
    expect(getPendingLogins()).toEqual(['dev'])
  })
})
