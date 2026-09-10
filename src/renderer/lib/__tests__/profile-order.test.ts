import { describe, it, expect } from 'vitest'
import { groupProfiles, flattenGroups, tierOf } from '../profile-order'
import type { AwsProfile } from '../../types'
import type { ExpiryStatus } from '../../hooks/useProfileExpiries'

function profile(overrides: Partial<AwsProfile> & { name: string }): AwsProfile {
  return { isActive: false, isLive: false, hasCredentials: false, ...overrides }
}

/** `hoursLeft` may be negative, which is how an expired session is expressed. */
function expiry(hoursLeft: number): ExpiryStatus {
  const remainingMs = hoursLeft * 3600_000
  return {
    expiresAt: new Date(Date.now() + remainingMs),
    remainingMs,
    severity: remainingMs <= 0 ? 'expired' : 'fresh',
    source: 'saml2aws'
  }
}

function expiries(entries: Record<string, number>): Map<string, ExpiryStatus> {
  return new Map(Object.entries(entries).map(([name, hours]) => [name, expiry(hours)]))
}

describe('tierOf', () => {
  it('treats a profile the main process calls live as live', () => {
    expect(tierOf(profile({ name: 'logistics', isLive: true }), null)).toBe('live')
  })

  it('treats an unexpired timer as live even without the isLive flag', () => {
    expect(tierOf(profile({ name: 'logistics' }), expiry(3))).toBe('live')
  })

  it('separates a run-out session from one that never existed', () => {
    expect(tierOf(profile({ name: 'logistics' }), expiry(-2))).toBe('expired')
    expect(tierOf(profile({ name: 'learn-terraform' }), null)).toBe('other')
  })

  it('keeps static keys out of the expired band — they never expire', () => {
    expect(tierOf(profile({ name: 'legacy-static', isStatic: true }), null)).toBe('static')
  })
})

describe('groupProfiles', () => {
  it('puts live sessions above everything else', () => {
    const groups = groupProfiles(
      [
        profile({ name: 'billing-keys', isStatic: true }),
        profile({ name: 'learn-terraform' }),
        profile({ name: 'logistics-prod' }),
        profile({ name: 'vision', isLive: true })
      ],
      expiries({ vision: 7, 'logistics-prod': -9 })
    )

    expect(groups.map((g) => g.tier)).toEqual(['live', 'expired', 'static', 'other'])
    expect(flattenGroups(groups).map((p) => p.name)).toEqual([
      'vision',
      'logistics-prod',
      'billing-keys',
      'learn-terraform'
    ])
  })

  it('orders live sessions freshest first', () => {
    const groups = groupProfiles(
      [
        profile({ name: 'logistics', isLive: true }),
        profile({ name: 'vision', isLive: true }),
        profile({ name: 'media', isLive: true })
      ],
      expiries({ logistics: 1, vision: 7.5, media: 4 })
    )

    expect(groups[0].profiles.map((p) => p.name)).toEqual(['vision', 'media', 'logistics'])
  })

  it('orders expired sessions most-recently-expired first', () => {
    const groups = groupProfiles(
      [
        profile({ name: 'stale-month' }),
        profile({ name: 'stale-hour' }),
        profile({ name: 'stale-day' })
      ],
      expiries({ 'stale-month': -720, 'stale-hour': -1, 'stale-day': -24 })
    )

    expect(groups[0].profiles.map((p) => p.name)).toEqual([
      'stale-hour',
      'stale-day',
      'stale-month'
    ])
  })

  it('pins the active profile to the top of its own band, not the whole list', () => {
    const groups = groupProfiles(
      [
        profile({ name: 'vision', isLive: true }),
        // Selected but expired: it leads the expired band and stays below the
        // live one, so the group label never lies about it.
        profile({ name: 'logistics', isActive: true }),
        profile({ name: 'aaa-expired' })
      ],
      expiries({ vision: 7, logistics: -1, 'aaa-expired': -2 })
    )

    expect(flattenGroups(groups).map((p) => p.name)).toEqual([
      'vision',
      'logistics',
      'aaa-expired'
    ])
  })

  it('drops empty bands so no heading appears over nothing', () => {
    const groups = groupProfiles(
      [profile({ name: 'logistics', isLive: true })],
      expiries({ logistics: 5 })
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe('live')
  })

  it('sorts alphabetically inside the untimed bands', () => {
    const groups = groupProfiles(
      [profile({ name: 'zeta' }), profile({ name: 'alpha' }), profile({ name: 'mid' })],
      new Map()
    )
    expect(groups[0].profiles.map((p) => p.name)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('does not float an empty default section above live sessions', () => {
    // The old main-process sort pinned `default` first unconditionally.
    const groups = groupProfiles(
      [profile({ name: 'default' }), profile({ name: 'logistics', isLive: true })],
      expiries({ logistics: 6 })
    )
    expect(flattenGroups(groups)[0].name).toBe('logistics')
  })
})
