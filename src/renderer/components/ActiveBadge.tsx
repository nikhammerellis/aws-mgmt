export function ActiveBadge() {
  return (
    <span
      className="active-badge"
      title="System-default profile (set via setx on Windows / launchctl on macOS). Terminal-local AWS_PROFILE exports are not reflected here."
      aria-label="Active profile"
    />
  )
}
