import { useState } from 'react'
import { SamlForm } from './SamlForm'
import { ConfirmDialog } from './ConfirmDialog'
import type { SamlProfile } from '../types'
import { effectiveAwsProfileName } from '../App'

interface SamlSectionProps {
  profiles: SamlProfile[]
  loading: boolean
  error: string | null
  selectedName: string | null
  awsProfileNames: Set<string>
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
  awsProfileNames,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onNavigateToAws
}: SamlSectionProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<SamlProfile | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)

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
        <h2>SAML Profiles</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingProfile(null); setShowForm(true) }}>
          + Add SAML Profile
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {profiles.length === 0 ? (
        <div className="empty-state">
          <p>No SAML profiles found</p>
          <p className="text-muted">SAML profiles are stored in ~/.saml2aws</p>
        </div>
      ) : (
        <div className="saml-grid">
          {profiles.map((profile) => {
            const targetAws = effectiveAwsProfileName(profile)
            const targetExists = awsProfileNames.has(targetAws)
            const targetIsImplicit = !profile.awsProfile?.trim()

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
                  <button
                    type="button"
                    className={`meta-tag link-tag ${targetExists ? '' : 'missing'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigateToAws(targetAws)
                    }}
                    title={
                      targetExists
                        ? `Open AWS profile "${targetAws}" — saml2aws will write its STS credentials here on login`
                        : `AWS profile "${targetAws}" does not exist yet — saml2aws would create it on first login`
                    }
                  >
                    → AWS: {targetAws}
                    {targetIsImplicit && <span className="link-hint"> (default)</span>}
                    {!targetExists && <span className="link-hint"> (missing)</span>}
                  </button>
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
          title="Delete SAML Profile"
          message={`Are you sure you want to delete "${deletingName}"? This will remove it from ~/.saml2aws.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingName(null)}
        />
      )}
    </div>
  )
}
