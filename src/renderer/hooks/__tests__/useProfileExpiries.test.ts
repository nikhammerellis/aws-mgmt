import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProfileExpiries, formatRemaining } from '../useProfileExpiries'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRemaining', () => {
  it('shows "expired" for non-positive values', () => {
    expect(formatRemaining(0)).toBe('expired')
    expect(formatRemaining(-5)).toBe('expired')
  })

  it('formats seconds', () => {
    expect(formatRemaining(45_000)).toBe('45s')
  })

  it('formats minutes', () => {
    expect(formatRemaining(5 * 60_000)).toBe('5m')
  })

  it('formats hours and minutes', () => {
    expect(formatRemaining(2 * 3600_000 + 30 * 60_000)).toBe('2h 30m')
  })
})

describe('useProfileExpiries', () => {
  it('loads expiries and computes severity from remaining time', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    vi.setSystemTime(now)

    window.api.getProfileExpiries = vi.fn().mockResolvedValue([
      {
        profileName: 'fresh',
        expiresAt: new Date(now.getTime() + 2 * 3600_000).toISOString(), // 2h
        source: 'sso'
      },
      {
        profileName: 'warning',
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), // 10m
        source: 'saml2aws'
      },
      {
        profileName: 'critical',
        expiresAt: new Date(now.getTime() + 90_000).toISOString(), // 90s
        source: 'sso'
      },
      {
        profileName: 'expired',
        expiresAt: new Date(now.getTime() - 60_000).toISOString(),
        source: 'sso'
      }
    ])

    const { result } = renderHook(() => useProfileExpiries())

    await waitFor(() => {
      expect(result.current.expiries.size).toBe(4)
    })

    expect(result.current.expiries.get('fresh')?.severity).toBe('fresh')
    expect(result.current.expiries.get('warning')?.severity).toBe('warning')
    expect(result.current.expiries.get('critical')?.severity).toBe('critical')
    expect(result.current.expiries.get('expired')?.severity).toBe('expired')
  })

  it('returns an empty map when the IPC call fails', async () => {
    window.api.getProfileExpiries = vi.fn().mockRejectedValue(new Error('ipc down'))

    const { result } = renderHook(() => useProfileExpiries())

    // Wait a tick for the initial refresh to settle
    await vi.advanceTimersByTimeAsync(10)

    expect(result.current.expiries.size).toBe(0)
  })
})
