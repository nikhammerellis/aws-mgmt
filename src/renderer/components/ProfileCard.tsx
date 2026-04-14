import { useEffect, useMemo, useRef, useState } from 'react'
import type { AwsProfile, LaunchLoginPayload, SamlProfile, ShellHint } from '../types'
import type { ExpiryStatus } from '../hooks/useProfileExpiries'
import { formatRemaining } from '../hooks/useProfileExpiries'
import { getLoginAction } from '../lib/login-action'
import { ActiveBadge } from './ActiveBadge'

interface ProfileCardProps {
  profile: AwsProfile
  isSelected: boolean
  isFocused: boolean
  samlSources: SamlProfile[]
  shellHint: ShellHint | null
  expiry: ExpiryStatus | null
  onSelect: () => void
  onSwitch: () => void
  onLaunchTerminal: (name: string) => void
  onLogin: (payload: LaunchLoginPayload) => void
  onCopyFeedback: (message: string) => void
}

function renderExportLine(template: string, name: string): string {
  return template.replace('__PROFILE__', name)
}

function shellLabel(flavor: ShellHint['flavor']): string {
  switch (flavor) {
    case 'pwsh': return 'PowerShell'
    case 'cmd': return 'cmd.exe'
    case 'fish': return 'fish'
    case 'zsh': return 'zsh'
    case 'bash':
    default: return 'bash'
  }
}

export function ProfileCard({
  profile,
  isSelected,
  isFocused,
  samlSources,
  shellHint,
  expiry,
  onSelect,
  onSwitch,
  onLaunchTerminal,
  onLogin,
  onCopyFeedback
}: ProfileCardProps) {
  const loginAction = useMemo(() => getLoginAction(profile, samlSources), [profile, samlSources])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const handleCopyExport = async () => {
    const line = shellHint
      ? renderExportLine(shellHint.exportLineTemplate, profile.name)
      : `export AWS_PROFILE=${profile.name}`
    try {
      await navigator.clipboard.writeText(line)
      onCopyFeedback(`Copied: ${line}`)
    } catch {
      onCopyFeedback('Copy failed — clipboard unavailable')
    }
    setMenuOpen(false)
  }

  const handleLaunch = () => {
    onLaunchTerminal(profile.name)
    setMenuOpen(false)
  }

  const handleLogin = () => {
    if (loginAction.enabled && loginAction.payload) {
      onLogin(loginAction.payload)
    }
    setMenuOpen(false)
  }

  const flavorLabel = shellHint ? shellLabel(shellHint.flavor) : 'bash'

  return (
    <div
      className={`profile-card ${isSelected ? 'selected' : ''} ${profile.isActive ? 'active' : ''}`}
      onClick={onSelect}
      role="option"
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
    >
      <div className="profile-card-header">
        <div className="profile-card-name">
          {profile.isActive && <ActiveBadge />}
          <span title={profile.name}>{profile.name}</span>
        </div>
        <div className="action-split-button" ref={menuRef}>
          {!profile.isActive && (
            <button
              type="button"
              className="switch-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSwitch()
              }}
              title={`Set ${profile.name} as the system default profile`}
            >
              Switch
            </button>
          )}
          <button
            type="button"
            className="action-caret"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${profile.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((open) => !open)
            }}
          >
            ▾
          </button>
          {menuOpen && (
            <ul className="action-menu" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyExport()
                  }}
                  title={`Copy ${flavorLabel} export line to the clipboard`}
                >
                  Copy export <span className="action-menu-hint">({flavorLabel})</span>
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleLaunch()
                  }}
                  title="Open a new terminal with this profile already set"
                >
                  Launch new terminal
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!loginAction.enabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleLogin()
                  }}
                  title={loginAction.hint || loginAction.label}
                >
                  {loginAction.label}
                  {loginAction.hint && (
                    <span className="action-menu-hint">({loginAction.hint})</span>
                  )}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Coming in Phase C — needs an STS probe"
                >
                  Copy temporary STS creds <span className="action-menu-hint">(soon)</span>
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
      <div className="profile-card-meta">
        {profile.region && <span className="meta-tag">{profile.region}</span>}
        {profile.hasCredentials && <span className="meta-tag credentials-tag">Credentials</span>}
        {profile.roleArn && <span className="meta-tag role-tag">Role</span>}
        {samlSources.length > 0 && (
          <span
            className="meta-tag saml-source-tag"
            title={`Populated by saml2aws via: ${samlSources.map((s) => s.name).join(', ')}`}
          >
            ↩ SAML{samlSources.length > 1 ? ` ×${samlSources.length}` : `: ${samlSources[0].name}`}
          </span>
        )}
        {expiry && (
          <span
            className={`meta-tag expiry-tag expiry-${expiry.severity}`}
            title={`${expiry.source === 'sso' ? 'SSO' : 'saml2aws'} credentials ${
              expiry.severity === 'expired' ? 'expired at' : 'expire at'
            } ${expiry.expiresAt.toLocaleString()}`}
          >
            ⏱ {formatRemaining(expiry.remainingMs)}
          </span>
        )}
      </div>
    </div>
  )
}
