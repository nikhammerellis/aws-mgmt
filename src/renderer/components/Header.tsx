import { useEffect, useState } from 'react'
import type { AwsProfile } from '../types'
import { ActiveBadge } from './ActiveBadge'

interface HeaderProps {
  activeProfile: AwsProfile | null
}

export function Header({ activeProfile }: HeaderProps) {
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
            <ActiveBadge />
            <span className="active-label">Active:</span>
            <span className="active-name">{activeProfile.name}</span>
            {activeProfile.region && (
              <span className="active-region">({activeProfile.region})</span>
            )}
          </>
        ) : (
          <span className="no-active">No active profile</span>
        )}
      </div>
    </header>
  )
}
