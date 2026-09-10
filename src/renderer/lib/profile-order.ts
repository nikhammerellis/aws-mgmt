import type { AwsProfile } from '../types'
import type { ExpiryStatus } from '../hooks/useProfileExpiries'

/**
 * Which band a profile falls into. The order of this array is the order the
 * groups render in.
 */
export const PROFILE_TIERS = ['live', 'expired', 'static', 'other'] as const

export type ProfileTier = (typeof PROFILE_TIERS)[number]

export const TIER_LABELS: Record<ProfileTier, string> = {
  live: 'Live sessions',
  expired: 'Expired sessions',
  static: 'Static keys',
  other: 'Not logged in'
}

export const TIER_HINTS: Record<ProfileTier, string> = {
  live: 'Holding unexpired temporary credentials right now',
  expired: 'Logged in before — the session has run out',
  static: 'Long-lived IAM keys. These never expire and never need a login',
  other: 'No credentials on disk for this profile'
}

export interface ProfileGroup {
  tier: ProfileTier
  label: string
  hint: string
  profiles: AwsProfile[]
}

/**
 * Classify a profile. `isLive` and `isStatic` come from the main process's
 * ActiveContext and are authoritative; the expiry map is a renderer-side view
 * of the same credentials file and is what gives us a *timestamp* to sort by.
 *
 * A profile is "expired" only if it has an expiry we can see — that is what
 * distinguishes "logged in this morning, ran out" from "never logged in".
 */
export function tierOf(profile: AwsProfile, expiry: ExpiryStatus | null): ProfileTier {
  if (profile.isLive || (expiry && expiry.remainingMs > 0)) return 'live'
  if (expiry) return 'expired'
  if (profile.isStatic) return 'static'
  return 'other'
}

/**
 * Sort key within a tier. Live sorts by most time remaining first, which for
 * equal session lengths is the most recent login. Expired sorts by the most
 * recent expiry first, so this morning's dead session outranks last month's.
 * Everything else is alphabetical.
 *
 * The active profile is pinned to the top of whichever tier it lands in rather
 * than to the top of the whole list — moving it out of its own band would make
 * the group labels lie about it.
 */
function compareWithin(
  tier: ProfileTier,
  a: AwsProfile,
  b: AwsProfile,
  expiries: Map<string, ExpiryStatus>
): number {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1

  if (tier === 'live') {
    const remA = expiries.get(a.name)?.remainingMs ?? -Infinity
    const remB = expiries.get(b.name)?.remainingMs ?? -Infinity
    if (remA !== remB) return remB - remA
  } else if (tier === 'expired') {
    const endA = expiries.get(a.name)?.expiresAt.getTime() ?? -Infinity
    const endB = expiries.get(b.name)?.expiresAt.getTime() ?? -Infinity
    if (endA !== endB) return endB - endA
  }

  return a.name.localeCompare(b.name)
}

/**
 * Bucket profiles into render-ready groups. Empty tiers are dropped so a user
 * with nothing expired never sees an "Expired sessions" heading.
 */
export function groupProfiles(
  profiles: AwsProfile[],
  expiries: Map<string, ExpiryStatus>
): ProfileGroup[] {
  const buckets = new Map<ProfileTier, AwsProfile[]>(PROFILE_TIERS.map((t) => [t, []]))

  for (const profile of profiles) {
    const tier = tierOf(profile, expiries.get(profile.name) ?? null)
    buckets.get(tier)!.push(profile)
  }

  const groups: ProfileGroup[] = []
  for (const tier of PROFILE_TIERS) {
    const bucket = buckets.get(tier)!
    if (bucket.length === 0) continue
    bucket.sort((a, b) => compareWithin(tier, a, b, expiries))
    groups.push({ tier, label: TIER_LABELS[tier], hint: TIER_HINTS[tier], profiles: bucket })
  }
  return groups
}

/** The grouped order, flattened — the sequence arrow keys must walk. */
export function flattenGroups(groups: ProfileGroup[]): AwsProfile[] {
  return groups.flatMap((g) => g.profiles)
}
