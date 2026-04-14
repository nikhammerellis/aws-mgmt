import { testProfile, type ProfileTestResult } from './profile-tester'

/**
 * Tracks "I just kicked off a login for profile X" intents so the file
 * watcher can run an STS probe once the credentials file updates and we
 * can confirm the new creds are actually valid.
 *
 * State is in-memory only — dies with the process, which is fine.
 * A pending entry self-expires after PENDING_TTL_MS so a failed/aborted
 * login doesn't sit in the map forever.
 */

export const PENDING_TTL_MS = 120_000

interface PendingEntry {
  profileName: string
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingEntry>()

export function trackPendingLogin(profileName: string): void {
  // Refresh TTL if already tracked.
  const existing = pending.get(profileName)
  if (existing) clearTimeout(existing.timer)

  const timer = setTimeout(() => {
    pending.delete(profileName)
  }, PENDING_TTL_MS)
  // Don't keep the process alive just for this timer.
  timer.unref?.()

  pending.set(profileName, { profileName, timer })
}

export function getPendingLogins(): string[] {
  return Array.from(pending.keys())
}

export function clearPendingLogin(profileName: string): void {
  const entry = pending.get(profileName)
  if (entry) {
    clearTimeout(entry.timer)
    pending.delete(profileName)
  }
}

/**
 * Probe the profile via STS. On success, clear the pending marker so we
 * don't re-verify on subsequent file-change events. On failure, keep the
 * marker — the login may still be in progress and the creds file might be
 * written in multiple steps.
 */
export async function verifyLogin(profileName: string): Promise<ProfileTestResult> {
  const result = await testProfile(profileName)
  if (result.ok) {
    clearPendingLogin(profileName)
  }
  return result
}

/** Test helper — clears all pending entries and timers. */
export function resetPendingLoginsForTests(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
  }
  pending.clear()
}
