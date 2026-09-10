interface ActiveBadgeProps {
  /**
   * True when the selected profile actually holds unexpired credentials.
   * The old badge always described the persisted OS-level default, which was
   * misleading whenever the real session lived on a different profile.
   */
  live?: boolean
  /**
   * True for long-lived IAM keys. They are never `live` because they have no
   * expiry at all, so without this they would be rendered as a dead session.
   */
  isStatic?: boolean
}

export function ActiveBadge({ live = false, isStatic = false }: ActiveBadgeProps) {
  const state = live ? 'is-live' : isStatic ? 'is-static' : 'is-stale'
  const title = live
    ? 'This profile holds unexpired credentials right now.'
    : isStatic
      ? 'Long-lived IAM keys. No login required — these do not expire.'
      : 'Selected profile, but it holds no unexpired credentials. Log in before using it.'
  const label = live
    ? 'Live profile'
    : isStatic
      ? 'Selected profile, static IAM keys'
      : 'Selected profile, not logged in'

  return <span className={`active-badge ${state}`} title={title} aria-label={label} />
}
