import { useEffect, useMemo, useState } from 'react'
import type { AwsProfile, LaunchLoginPayload, ProfileTestResult, SamlProfile } from '../types'
import type { ExpiryStatus } from '../hooks/useProfileExpiries'
import { formatRemaining } from '../hooks/useProfileExpiries'
import { getLoginAction } from '../lib/login-action'
import { SecretField } from './SecretField'

interface ProfileDetailProps {
  profile: AwsProfile | null
  samlSources: SamlProfile[]
  expiry: ExpiryStatus | null
  onEdit: (profile: AwsProfile) => void
  onDelete: (name: string) => void
  onRename: (profile: AwsProfile) => void
  onDuplicate: (profile: AwsProfile) => void
  onLogin: (payload: LaunchLoginPayload) => void
  onNavigateToSaml: (name: string) => void
}

function DetailRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className="detail-row">
      <label>{label}</label>
      <span>{value}</span>
    </div>
  )
}

export function ProfileDetail({
  profile,
  samlSources,
  expiry,
  onEdit,
  onDelete,
  onRename,
  onDuplicate,
  onLogin,
  onNavigateToSaml
}: ProfileDetailProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProfileTestResult | null>(null)
  const loginAction = useMemo(
    () => (profile ? getLoginAction(profile, samlSources) : null),
    [profile, samlSources]
  )

  // Reset test result when the user navigates to a different profile
  useEffect(() => {
    setTestResult(null)
    setTesting(false)
  }, [profile?.name])

  if (!profile) {
    return (
      <div className="profile-detail empty-detail">
        <p>Select a profile to view details</p>
      </div>
    )
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.testProfile(profile.name)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="profile-detail">
      <div className="detail-header">
        <h2>
          {profile.name}
          {profile.isActive && <span className="active-tag">Active</span>}
        </h2>
        <div className="detail-actions">
          {loginAction && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => loginAction.payload && onLogin(loginAction.payload)}
              disabled={!loginAction.enabled}
              title={loginAction.hint || loginAction.label}
            >
              {loginAction.enabled ? 'Login' : 'Login (n/a)'}
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTest}
            disabled={testing}
            title="Run aws sts get-caller-identity --profile"
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(profile)}>Edit</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onDuplicate(profile)}>Duplicate</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onRename(profile)}>Rename</button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(profile.name)}>Delete</button>
        </div>
      </div>

      {expiry && (
        <section className={`detail-section expiry-section expiry-${expiry.severity}`}>
          <h3>Session</h3>
          <div className="detail-row">
            <label>{expiry.source === 'sso' ? 'SSO token' : 'saml2aws credentials'}</label>
            <span>
              {expiry.severity === 'expired'
                ? `expired ${expiry.expiresAt.toLocaleString()}`
                : `${formatRemaining(expiry.remainingMs)} remaining · expires ${expiry.expiresAt.toLocaleString()}`}
            </span>
          </div>
        </section>
      )}

      {testResult && (
        <div
          className={`test-result ${testResult.ok ? 'test-result-ok' : 'test-result-fail'}`}
          role="status"
        >
          {testResult.ok ? (
            <>
              <div className="test-result-headline">✓ Profile is alive</div>
              <DetailRow label="Account" value={testResult.account} />
              <DetailRow label="ARN" value={testResult.arn} />
              <DetailRow label="User ID" value={testResult.userId} />
            </>
          ) : (
            <>
              <div className="test-result-headline">✗ {testResult.error}</div>
              {testResult.hint && <div className="test-result-hint">{testResult.hint}</div>}
            </>
          )}
        </div>
      )}

      <section className="detail-section">
        <h3>Configuration</h3>
        <DetailRow label="Region" value={profile.region} />
        <DetailRow label="Output" value={profile.output} />
        <DetailRow label="Session Duration" value={profile.sessionDuration} />
        <DetailRow label="Role ARN" value={profile.roleArn} />
        <DetailRow label="Source Profile" value={profile.sourceProfile} />
      </section>

      {(profile.ssoStartUrl || profile.ssoRegion) && (
        <section className="detail-section">
          <h3>SSO</h3>
          <DetailRow label="Start URL" value={profile.ssoStartUrl} />
          <DetailRow label="SSO Region" value={profile.ssoRegion} />
          <DetailRow label="Account ID" value={profile.ssoAccountId} />
          <DetailRow label="Role Name" value={profile.ssoRoleName} />
        </section>
      )}

      {samlSources.length > 0 && (
        <section className="detail-section">
          <h3>SAML Sources</h3>
          <p className="detail-hint">
            saml2aws writes its STS credentials to this profile when these SAML profiles log in.
          </p>
          <div className="saml-source-list">
            {samlSources.map((saml) => (
              <button
                key={saml.name}
                type="button"
                className="saml-source-link"
                onClick={() => onNavigateToSaml(saml.name)}
                title={`Open SAML profile "${saml.name}"`}
              >
                <span className="saml-source-arrow">↩</span>
                <span className="saml-source-name">{saml.name}</span>
                {saml.provider && <span className="saml-source-meta">{saml.provider}</span>}
                {saml.username && <span className="saml-source-meta">{saml.username}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {profile.hasCredentials && (
        <section className="detail-section">
          <h3>Credentials</h3>
          <SecretField label="Access Key ID" value={profile.accessKeyId} />
          <SecretField label="Secret Access Key" value={profile.secretAccessKey} />
          {profile.sessionToken && (
            <SecretField label="Session Token" value={profile.sessionToken} />
          )}
        </section>
      )}
    </div>
  )
}
