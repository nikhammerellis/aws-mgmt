import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileExpiry } from '../types'

export interface ExpiryStatus {
  expiresAt: Date
  remainingMs: number
  severity: 'fresh' | 'warning' | 'critical' | 'expired'
  source: ProfileExpiry['source']
}

export function formatRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'expired'
  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${totalSeconds}s`
}

function computeSeverity(remainingMs: number): ExpiryStatus['severity'] {
  if (remainingMs <= 0) return 'expired'
  if (remainingMs < 5 * 60_000) return 'critical'
  if (remainingMs < 30 * 60_000) return 'warning'
  return 'fresh'
}

export function useProfileExpiries() {
  const [map, setMap] = useState<Map<string, ExpiryStatus>>(new Map())
  const [raw, setRaw] = useState<ProfileExpiry[]>([])

  const refresh = useCallback(async () => {
    try {
      const results = await window.api.getProfileExpiries()
      setRaw(results)
    } catch {
      // ignore — transient IPC failure, try again on next tick
    }
  }, [])

  // Recompute statuses every tick so the countdown ticks down even if the
  // underlying cache files haven't changed.
  useEffect(() => {
    const tick = () => {
      const next = new Map<string, ExpiryStatus>()
      const now = Date.now()
      for (const entry of raw) {
        const expiresAt = new Date(entry.expiresAt)
        const remainingMs = expiresAt.getTime() - now
        next.set(entry.profileName, {
          expiresAt,
          remainingMs,
          severity: computeSeverity(remainingMs),
          source: entry.source
        })
      }
      setMap(next)
    }
    tick()
    const handle = setInterval(tick, 1000)
    return () => clearInterval(handle)
  }, [raw])

  // Refresh when either (a) the credentials file changes, or (b) the main
  // process explicitly broadcasts expiries-changed (fires every 60s from
  // the tray refresh tick, which covers SSO cache files that the file
  // watcher doesn't watch directly). No polling in the renderer — the
  // single timer lives in the main process.
  useEffect(() => {
    refresh()
    const unsubProfiles = window.api.onProfilesChanged(refresh)
    const unsubExpiries = window.api.onExpiriesChanged(refresh)
    return () => {
      unsubProfiles()
      unsubExpiries()
    }
  }, [refresh])

  // Desktop notification: warn once when the active profile crosses the 5-min threshold.
  const warnedRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    for (const [name, status] of map) {
      if (status.severity !== 'critical') {
        // Reset the warning state when the token refreshes (remainingMs grows again).
        const last = warnedRef.current.get(name)
        if (last !== undefined && status.remainingMs > 10 * 60_000) {
          warnedRef.current.delete(name)
        }
        continue
      }
      if (warnedRef.current.has(name)) continue
      warnedRef.current.set(name, Date.now())
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('AWS credentials expiring soon', {
          body: `${name} expires in ${formatRemaining(status.remainingMs)}. Re-run your login before it lapses.`
        })
      }
    }
  }, [map])

  return { expiries: map, refresh }
}
