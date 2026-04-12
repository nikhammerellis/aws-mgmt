import type { AwsProfile } from '../types'
import { ActiveBadge } from './ActiveBadge'

interface HeaderProps {
  activeProfile: AwsProfile | null
}

export function Header({ activeProfile }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-title">
        <h1>AWS Profile Manager</h1>
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
