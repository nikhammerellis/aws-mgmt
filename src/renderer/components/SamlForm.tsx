import { useState, useEffect } from 'react'
import type { SamlProfile } from '../types'

interface SamlFormProps {
  profile?: SamlProfile | null
  onSave: (data: SamlProfile, isEdit: boolean) => void
  onCancel: () => void
}

const PROVIDERS = ['GoogleApps', 'Okta', 'ADFS', 'Ping', 'JumpCloud', 'OneLogin']
const MFA_OPTIONS = ['Auto', 'None', 'TOTP', 'Push', 'DuoMfaPrompt']

export function SamlForm({ profile, onSave, onCancel }: SamlFormProps) {
  const isEdit = !!profile

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [provider, setProvider] = useState('GoogleApps')
  const [mfa, setMfa] = useState('Auto')
  const [awsUrn, setAwsUrn] = useState('urn:amazon:webservices')
  const [awsSessionDuration, setAwsSessionDuration] = useState('3600')
  const [awsProfile, setAwsProfile] = useState('')
  const [roleArn, setRoleArn] = useState('')
  const [region, setRegion] = useState('')
  const [skipVerify, setSkipVerify] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setUrl(profile.url || '')
      setUsername(profile.username || '')
      setProvider(profile.provider || 'GoogleApps')
      setMfa(profile.mfa || 'Auto')
      setAwsUrn(profile.awsUrn || 'urn:amazon:webservices')
      setAwsSessionDuration(profile.awsSessionDuration || '3600')
      setAwsProfile(profile.awsProfile || '')
      setRoleArn(profile.roleArn || '')
      setRegion(profile.region || '')
      setSkipVerify(profile.skipVerify || false)
    }
  }, [profile])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSave({
      name: name.trim(),
      url: url || undefined,
      username: username || undefined,
      provider: provider || undefined,
      mfa: mfa || undefined,
      awsUrn: awsUrn || undefined,
      awsSessionDuration: awsSessionDuration || undefined,
      awsProfile: awsProfile || undefined,
      roleArn: roleArn || undefined,
      region: region || undefined,
      skipVerify
    }, isEdit)
  }

  return (
    <div className="profile-form-overlay" onClick={onCancel}>
      <form className="profile-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{isEdit ? `Edit SAML: ${profile!.name}` : 'Add SAML Profile'}</h2>

        <div className="form-section">
          <h3>Identity Provider</h3>
          <div className="form-field">
            <label>Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-saml-profile"
              disabled={isEdit}
              required
              autoFocus={!isEdit}
            />
          </div>
          <div className="form-field">
            <label>IDP URL <span className="optional-marker">(optional)</span></label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://accounts.google.com/o/saml2/idp?idpid=..."
            />
          </div>
          <div className="form-field">
            <label>Username <span className="optional-marker">(optional)</span></label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Provider <span className="optional-marker">(optional)</span></label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>MFA <span className="optional-marker">(optional)</span></label>
              <select value={mfa} onChange={(e) => setMfa(e.target.value)}>
                {MFA_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>AWS Configuration</h3>
          <div className="form-field">
            <label>AWS URN <span className="optional-marker">(optional)</span></label>
            <input
              type="text"
              value={awsUrn}
              onChange={(e) => setAwsUrn(e.target.value)}
              placeholder="urn:amazon:webservices"
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Session Duration <span className="optional-marker">(seconds, optional)</span></label>
              <input
                type="text"
                value={awsSessionDuration}
                onChange={(e) => setAwsSessionDuration(e.target.value)}
                placeholder="3600"
              />
            </div>
            <div className="form-field">
              <label>AWS Profile <span className="optional-marker">(optional)</span></label>
              <input
                type="text"
                value={awsProfile}
                onChange={(e) => setAwsProfile(e.target.value)}
                placeholder="Profile name for credentials"
              />
            </div>
          </div>
          <div className="form-field">
            <label>Role ARN <span className="optional-marker">(optional)</span></label>
            <input
              type="text"
              value={roleArn}
              onChange={(e) => setRoleArn(e.target.value)}
              placeholder="arn:aws:iam::123456789012:role/MyRole"
            />
          </div>
          <div className="form-field">
            <label>Region <span className="optional-marker">(optional)</span></label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-west-2"
            />
          </div>
          <div className="form-field form-checkbox">
            <label>
              <input
                type="checkbox"
                checked={skipVerify}
                onChange={(e) => setSkipVerify(e.target.checked)}
              />
              Skip TLS Verification
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Add Profile'}</button>
        </div>
      </form>
    </div>
  )
}
