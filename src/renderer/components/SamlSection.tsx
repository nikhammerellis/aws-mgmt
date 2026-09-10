import { useMemo, useState } from 'react'
import { SamlForm } from './SamlForm'
import { ConfirmDialog } from './ConfirmDialog'
import type { AwsProfile, SamlProfile } from '../types'
import { isFanOutProvider, pickIdentityProvider } from '../lib/login-action'
import { effectiveAwsProfileName } from '../App'

interface SamlSectionProps {
  profiles: SamlProfile[]
  loading: boolean
  error: string | null
  selectedName: string | null
  awsProfiles: AwsProfile[]
  onSelect: (name: string | null) => void
  onAdd: (data: SamlProfile) => Promise<void>
  onUpdate: (name: string, data: SamlProfile) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onNavigateToAws: (name: string) => void
}

export function SamlSection({
  profiles,
  loading,
  error,
  selectedName,
  awsProfiles,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onNavigateToAws
}: SamlSectionProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<SamlProfile | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)

  const awsProfileNames = useMemo(
    () => new Set(awsProfiles.map((p) => p.name)),
    [awsProfiles]
  )

  // Which AWS profiles would authenticate through each block. A block pinned
  // to one profile (`aws_profile`, or its own `role_arn`) writes only there —
  // that is the legacy one-slot shape. A block with no role of its own is an
  // assertion source that any profile carrying a role ARN can log in through.
  const provider = useMemo(() => pickIdentityProvider(profiles), [profiles])
  const fanOutTargets = useMemo(
    () => awsProfiles.filter((p) => !!p.samlRoleArn),
    [awsProfiles]
  )

  const handleSave = async (data: SamlProfile, isEdit: boolean) => {
    if (isEdit && editingProfile) {
      await onUpdate(editingProfile.name, data)
    } else {
      await onAdd(data)
    }
    setShowForm(false)
    setEditingProfile(null)
  }

  const handleEdit = (profile: SamlProfile) => {
    setEditingProfile(profile)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (deletingName) {
      await onDelete(deletingName)
      if (selectedName === deletingName) onSelect(null)
      setDeletingName(null)
    }
  }

  if (loading) {
    return <div className="saml-section"><div className="loading">Loading SAML profiles...</div></div>
  }

  return (
    <div className="saml-section">
      <div className="saml-header">
        <div>
          <h2>Identity Providers</h2>
          <p className="saml-subtitle">
            Blocks in <code>~/.saml2aws</code>. Each one is a way to authenticate — the AWS
            account is decided by the profile you log in to, not by this file.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingProfile(null); setShowForm(true) }}>
          + Add Identity Provider
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {profiles.length === 0 ? (
        <div className="empty-state">
          <p>No identity providers found</p>
          <p className="text-muted">
            saml2aws stores these in ~/.saml2aws. Without one, profiles that authenticate by
            SAML have no way to log in.
          </p>
        </div>
      ) : (
        <div className="saml-grid">
          {profiles.map((profile) => {
            const fanOut = isFanOutProvider(profile)
            // `aws_profile` names the section saml2aws writes to when no
            // --profile flag is passed. Under the fan-out model the app always
            // passes one, so this is a default rather than a destination.
            const pinnedAws = effectiveAwsProfileName(profile)
            const pinnedExists = awsProfileNames.has(pinnedAws)
            const isPrimary = provider?.name === profile.name
            const targets = fanOut && isPrimary ? fanOutTargets : []

            return (
              <div
                key={profile.name}
                className={`saml-card ${selectedName === profile.name ? 'selected' : ''}`}
                onClick={() => onSelect(profile.name)}
              >
                <div className="saml-card-header">
                  <span className="saml-card-name" title={profile.name}>{profile.name}</span>
                  <div className="saml-card-actions">
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleEdit(profile) }} title="Edit">
                      Edit
                    </button>
                    <button className="btn-icon btn-icon-danger" onClick={(e) => { e.stopPropagation(); setDeletingName(profile.name) }} title="Delete">
                      Del
                    </button>
                  </div>
                </div>
                <div className="saml-card-meta">
                  {profile.provider && <span className="meta-tag">{profile.provider}</span>}
                  {profile.username && <span className="meta-tag">{profile.username}</span>}
                  <span
                    className={`meta-tag ${fanOut ? 'saml-mode-fanout' : 'saml-mode-pinned'}`}
                    title={
                      fanOut
                        ? 'No role_arn of its own, so it can mint a session in any account whose profile supplies a role. saml2aws caches the assertion, so extra accounts cost no extra browser prompt.'
                        : 'role_arn is set here, so every login through this block assumes that one role. This is the single-slot behaviour.'
                    }
                  >
                    {fanOut ? 'Fan-out' : 'Pinned to one role'}
                  </span>
                  {profile.awsSessionDuration && (
                    <span
                      className="meta-tag"
                      title="Default session length requested when no per-profile duration is set"
                    >
                      {Math.floor(Number(profile.awsSessionDuration) / 3600) || '<1'}h default
                    </span>
                  )}
                </div>

                <div className="saml-card-targets">
                  <div className="saml-targets-label">
                    {fanOut ? 'Default write target' : 'Writes to'}
                  </div>
                  <button
                    type="button"
                    className={`meta-tag link-tag ${pinnedExists ? '' : 'missing'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigateToAws(pinnedAws)
                    }}
                    title={
                      pinnedExists
                        ? `Open AWS profile "${pinnedAws}" — where saml2aws writes when no --profile is given`
                        : `AWS profile "${pinnedAws}" does not exist yet — saml2aws would create it on first login`
                    }
                  >
                    → {pinnedAws}
                    {!profile.awsProfile?.trim() && <span className="link-hint"> (default)</span>}
                    {!pinnedExists && <span className="link-hint"> (missing)</span>}
                  </button>

                  {fanOut && isPrimary && (
                    <>
                      <div className="saml-targets-label">
                        Profiles that can log in through this provider
                        <span className="saml-targets-count">{targets.length}</span>
                      </div>
                      {targets.length === 0 ? (
                        <p className="text-muted saml-targets-empty">
                          None yet. A profile qualifies once it knows which role to assume —
                          either from a previous saml2aws login, or from a role ARN set on the
                          profile itself.
                        </p>
                      ) : (
                        <div className="saml-target-list">
                          {targets.map((target) => (
                            <button
                              key={target.name}
                              type="button"
                              className={`meta-tag link-tag ${target.isLive ? 'target-live' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onNavigateToAws(target.name)
                              }}
                              title={`${target.samlRoleArn}\n\nRole ${
                                target.samlRoleArnSource === 'config'
                                  ? 'set on the profile'
                                  : 'recovered from the last login'
                              }${target.isLive ? '\nSession is live' : ''}`}
                            >
                              {target.isLive && <span className="target-dot" />}
                              {target.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {selectedName === profile.name && (
                  <div className="saml-card-details">
                    {profile.url && <div className="detail-row"><label>URL</label><span>{profile.url}</span></div>}
                    {profile.mfa && <div className="detail-row"><label>MFA</label><span>{profile.mfa}</span></div>}
                    {profile.awsUrn && <div className="detail-row"><label>AWS URN</label><span>{profile.awsUrn}</span></div>}
                    {profile.awsSessionDuration && <div className="detail-row"><label>Session</label><span>{profile.awsSessionDuration}s</span></div>}
                    {profile.roleArn && <div className="detail-row"><label>Role ARN</label><span>{profile.roleArn}</span></div>}
                    {profile.region && <div className="detail-row"><label>Region</label><span>{profile.region}</span></div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <SamlForm
          profile={editingProfile}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingProfile(null) }}
        />
      )}

      {deletingName && (
        <ConfirmDialog
          title="Delete Identity Provider"
          message={`Are you sure you want to delete "${deletingName}"? This will remove it from ~/.saml2aws.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingName(null)}
        />
      )}
    </div>
  )
}
