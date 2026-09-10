import { useEffect, useState } from 'react'
import type { ActiveContext, AwsProfile } from '../types'
import { ActiveBadge } from './ActiveBadge'

interface HeaderProps {
  activeProfile: AwsProfile | null
  /**
   * The three separate notions of "active". Rendered distinctly on purpose:
   * a single label cannot be truthful when several profiles hold live
   * credentials at once, and collapsing them is what produced the old
   * "Active: default" while the real session was elsewhere.
   */
  activeContext?: ActiveContext | null
  /** Manual refresh — re-reads profiles, SAML profiles, and expiries. */
  onRefresh?: () => void | Promise<void>
  /** True while a refresh is in-flight; disables the button and spins the icon. */
  refreshing?: boolean
}

export function Header({ activeProfile, activeContext, onRefresh, refreshing }: HeaderProps) {
  const [version, setVersion] = useState<string | null>(null)

  // Fetch version once. Also sync document.title — the <title> element in
  // index.html otherwise overrides the BrowserWindow title after page load,
  // hiding the version from the OS-level title bar.
  useEffect(() => {
    let cancelled = false
    window.api
      .getAppVersion()
      .then((v) => {
        if (cancelled) return
        setVersion(v)
        document.title = `AWS Profile Manager ${v}`
      })
      .catch(() => {
        /* non-fatal — leave title as-is */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const liveCount = activeContext?.liveProfiles.length ?? 0
  const isLive = !!activeProfile?.isLive
  const isStatic = !!activeProfile?.isStatic
  const extraLive = activeProfile && isLive ? liveCount - 1 : liveCount

  return (
    <header className="header">
      <div className="header-title">
        <h1>
          AWS Profile Manager
          {version && <span className="app-version">v{version}</span>}
        </h1>
      </div>
      <div className="header-active">
        {activeProfile ? (
          <>
            <ActiveBadge live={isLive} isStatic={isStatic} />
            <span className="active-label">{isLive ? 'Live:' : 'Selected:'}</span>
            <span className="active-name">{activeProfile.name}</span>
            {activeProfile.region && (
              <span className="active-region">({activeProfile.region})</span>
            )}
            {!isLive && isStatic && (
              <span className="active-static" title="Long-lived IAM keys. These do not expire.">
                static keys
              </span>
            )}
            {!isLive && !isStatic && (
              <span className="active-warning" title="This profile holds no unexpired credentials.">
                not logged in
              </span>
            )}
            {extraLive > 0 && (
              <span
                className="active-extra"
                title={`Also authenticated: ${activeContext?.liveProfiles
                  .filter((p) => p !== activeProfile.name)
                  .join(', ')}`}
              >
                +{extraLive} more live
              </span>
            )}
          </>
        ) : (
          <span className="no-active">
            {liveCount > 0 ? `${liveCount} live session(s), none selected` : 'No active profile'}
          </span>
        )}
        {activeContext?.machineDefaultStale && (
          <span
            className="active-stale"
            title={
              `The persisted machine default AWS_PROFILE is "${activeContext.machineDefault}", ` +
              'but that profile has no live credentials. Any tool that relies on the ' +
              'environment rather than an explicit --profile will resolve to it.'
            }
          >
            stale default: {activeContext.machineDefault}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            className={`header-refresh ${refreshing ? 'is-refreshing' : ''}`}
            onClick={() => {
              void onRefresh()
            }}
            disabled={refreshing}
            title="Refresh profiles, SAML config, and expiries"
            aria-label="Refresh"
          >
            <span aria-hidden="true">↻</span>
          </button>
        )}
      </div>
    </header>
  )
}
