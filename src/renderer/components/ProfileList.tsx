import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import type { AwsProfile, LaunchLoginPayload, SamlProfile, ShellHint } from '../types'
import type { ExpiryStatus } from '../hooks/useProfileExpiries'
import { ProfileCard } from './ProfileCard'

interface ProfileListProps {
  profiles: AwsProfile[]
  loading: boolean
  selectedName: string | null
  samlSourcesByAws: Map<string, SamlProfile[]>
  shellHint: ShellHint | null
  expiries: Map<string, ExpiryStatus>
  onSelect: (profile: AwsProfile) => void
  onSwitch: (name: string) => void
  onAdd: () => void
  onRename: (profile: AwsProfile) => void
  onDelete: (name: string) => void
  onLaunchTerminal: (name: string) => void
  onLogin: (payload: LaunchLoginPayload) => void
  onCopyFeedback: (message: string) => void
}

export interface ProfileListHandle {
  focusSearch(): void
}

function matchesQuery(profile: AwsProfile, q: string): boolean {
  if (!q) return true
  const haystack = [
    profile.name,
    profile.region,
    profile.roleArn,
    profile.sourceProfile,
    profile.ssoStartUrl,
    profile.ssoAccountId
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export const ProfileList = forwardRef<ProfileListHandle, ProfileListProps>(function ProfileList(
  {
    profiles,
    loading,
    selectedName,
    samlSourcesByAws,
    shellHint,
    expiries,
    onSelect,
    onSwitch,
    onAdd,
    onRename,
    onDelete,
    onLaunchTerminal,
    onLogin,
    onCopyFeedback
  },
  ref
) {
  const [query, setQuery] = useState('')
  const [focusedName, setFocusedName] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => ({
    focusSearch() {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }))

  const trimmed = query.trim().toLowerCase()
  const filtered = useMemo(
    () => profiles.filter((p) => matchesQuery(p, trimmed)),
    [profiles, trimmed]
  )

  const focusedIndex = focusedName
    ? filtered.findIndex((p) => p.name === focusedName)
    : -1

  const moveFocus = (delta: number) => {
    if (filtered.length === 0) return
    if (focusedIndex < 0) {
      // First arrow press lands on the first card regardless of direction
      setFocusedName(filtered[0].name)
      onSelect(filtered[0])
      return
    }
    const next = (focusedIndex + delta + filtered.length) % filtered.length
    setFocusedName(filtered[next].name)
    onSelect(filtered[next])
  }

  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (filtered.length === 0) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const focused = focusedIndex >= 0 ? filtered[focusedIndex] : null

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveFocus(-1)
        break
      case 'Home':
        e.preventDefault()
        setFocusedName(filtered[0].name)
        onSelect(filtered[0])
        break
      case 'End':
        e.preventDefault()
        setFocusedName(filtered[filtered.length - 1].name)
        onSelect(filtered[filtered.length - 1])
        break
      case 'Enter':
        if (focused && !focused.isActive) {
          e.preventDefault()
          onSwitch(focused.name)
        }
        break
      case 'F2':
        if (focused) {
          e.preventDefault()
          onRename(focused)
        }
        break
      case 'Delete':
        if (focused) {
          e.preventDefault()
          onDelete(focused.name)
        }
        break
    }
  }

  if (loading) {
    return (
      <div className="profile-list">
        <div className="loading">Loading profiles...</div>
      </div>
    )
  }

  return (
    <div className="profile-list">
      <div className="profile-list-header">
        <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Add Profile</button>
      </div>
      <div className="profile-search">
        <input
          ref={searchRef}
          type="search"
          className="profile-search-input"
          placeholder="Search by name, region, role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter profiles"
        />
        {query && (
          <button
            type="button"
            className="profile-search-clear"
            onClick={() => {
              setQuery('')
              searchRef.current?.focus()
            }}
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>
      {profiles.length === 0 ? (
        <div className="empty">No AWS profiles found</div>
      ) : filtered.length === 0 ? (
        <div className="empty">No matches for "{query}"</div>
      ) : (
        <div
          className="profile-list-cards"
          role="listbox"
          aria-label="AWS profiles"
          tabIndex={focusedIndex >= 0 ? -1 : 0}
          ref={listRef}
          onKeyDown={handleListKeyDown}
        >
          {filtered.map((profile) => (
            <ProfileCard
              key={profile.name}
              profile={profile}
              isSelected={profile.name === selectedName}
              isFocused={profile.name === focusedName}
              samlSources={samlSourcesByAws.get(profile.name) ?? []}
              shellHint={shellHint}
              expiry={expiries.get(profile.name) ?? null}
              onSelect={() => {
                setFocusedName(profile.name)
                onSelect(profile)
              }}
              onSwitch={() => onSwitch(profile.name)}
              onLaunchTerminal={onLaunchTerminal}
              onLogin={onLogin}
              onCopyFeedback={onCopyFeedback}
            />
          ))}
        </div>
      )}
    </div>
  )
})
