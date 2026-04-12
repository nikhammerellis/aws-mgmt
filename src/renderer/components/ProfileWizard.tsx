import { useEffect, useMemo, useState } from 'react'
import type { AwsProfile, NewProfileData, ProfileKind } from '../types'
import { AWS_REGIONS, OUTPUT_FORMATS } from '../lib/aws-regions'

type WizardMode = 'add' | 'edit' | 'clone'

interface ProfileWizardProps {
  mode: WizardMode
  profile?: AwsProfile | null
  existingNames: string[]
  onSave: (data: NewProfileData, isEdit: boolean) => Promise<void>
  onCancel: () => void
}

interface KindMeta {
  kind: ProfileKind
  title: string
  description: string
}

const KIND_META: KindMeta[] = [
  {
    kind: 'iam-keys',
    title: 'IAM Keys',
    description: 'Long-lived access key + secret stored in ~/.aws/credentials.'
  },
  {
    kind: 'sso',
    title: 'AWS SSO / IAM Identity Center',
    description: 'Federated login via an SSO start URL. Refreshes via `aws sso login`.'
  },
  {
    kind: 'assume-role',
    title: 'Assume Role',
    description: 'Chains off another profile via role_arn + source_profile.'
  },
  {
    kind: 'saml-target',
    title: 'SAML2AWS Target',
    description: 'Bare profile that saml2aws writes STS credentials into.'
  }
]

function detectKind(profile: AwsProfile | null | undefined): ProfileKind {
  if (!profile) return 'iam-keys'
  if (profile.ssoStartUrl) return 'sso'
  if (profile.roleArn || profile.sourceProfile) return 'assume-role'
  if (profile.accessKeyId) return 'iam-keys'
  return 'saml-target'
}

const NAME_PATTERN = /^[A-Za-z0-9_\-]+$/

interface FormState {
  name: string
  region: string
  output: string
  sessionDuration: string
  roleArn: string
  sourceProfile: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  ssoStartUrl: string
  ssoRegion: string
  ssoAccountId: string
  ssoRoleName: string
}

const EMPTY_FORM: FormState = {
  name: '',
  region: '',
  output: 'json',
  sessionDuration: '',
  roleArn: '',
  sourceProfile: '',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
  ssoStartUrl: '',
  ssoRegion: '',
  ssoAccountId: '',
  ssoRoleName: ''
}

function profileToForm(profile: AwsProfile | null | undefined, suffix: string = ''): FormState {
  if (!profile) return EMPTY_FORM
  return {
    name: profile.name + suffix,
    region: profile.region ?? '',
    output: profile.output ?? 'json',
    sessionDuration: profile.sessionDuration ?? '',
    roleArn: profile.roleArn ?? '',
    sourceProfile: profile.sourceProfile ?? '',
    accessKeyId: profile.accessKeyId ?? '',
    secretAccessKey: profile.secretAccessKey ?? '',
    sessionToken: profile.sessionToken ?? '',
    ssoStartUrl: profile.ssoStartUrl ?? '',
    ssoRegion: profile.ssoRegion ?? '',
    ssoAccountId: profile.ssoAccountId ?? '',
    ssoRoleName: profile.ssoRoleName ?? ''
  }
}

function profileToBaseline(profile: AwsProfile | null | undefined): FormState | null {
  if (!profile) return null
  return profileToForm(profile)
}

function formToPayload(form: FormState): NewProfileData {
  return {
    name: form.name.trim(),
    region: form.region || undefined,
    output: form.output || undefined,
    sessionDuration: form.sessionDuration || undefined,
    roleArn: form.roleArn || undefined,
    sourceProfile: form.sourceProfile || undefined,
    accessKeyId: form.accessKeyId || undefined,
    secretAccessKey: form.secretAccessKey || undefined,
    sessionToken: form.sessionToken || undefined,
    ssoStartUrl: form.ssoStartUrl || undefined,
    ssoRegion: form.ssoRegion || undefined,
    ssoAccountId: form.ssoAccountId || undefined,
    ssoRoleName: form.ssoRoleName || undefined
  }
}

interface DiffEntry {
  field: string
  before: string | null
  after: string | null
}

const FIELD_LABELS: Partial<Record<keyof FormState, string>> = {
  name: 'Profile name',
  region: 'Region',
  output: 'Output',
  sessionDuration: 'Session duration',
  roleArn: 'Role ARN',
  sourceProfile: 'Source profile',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key',
  sessionToken: 'Session Token',
  ssoStartUrl: 'SSO Start URL',
  ssoRegion: 'SSO Region',
  ssoAccountId: 'SSO Account ID',
  ssoRoleName: 'SSO Role Name'
}

const SECRET_KEYS = new Set(['secretAccessKey', 'sessionToken'])

function maskSecret(key: string, value: string | null): string | null {
  if (!value) return value
  if (SECRET_KEYS.has(key)) return '••••••••'
  return value
}

function computeDiff(baseline: FormState | null, next: FormState): DiffEntry[] {
  const entries: DiffEntry[] = []
  const keys = Object.keys(EMPTY_FORM) as Array<keyof FormState>
  for (const key of keys) {
    const after = next[key] || null
    const before = baseline ? baseline[key] || null : null
    if (after === before) continue
    entries.push({
      field: FIELD_LABELS[key] ?? key,
      before: maskSecret(key, before),
      after: maskSecret(key, after)
    })
  }
  return entries
}

interface ValidationResult {
  ok: boolean
  errors: string[]
}

function validate(
  form: FormState,
  kind: ProfileKind,
  mode: WizardMode,
  existingNames: string[],
  originalName: string | null
): ValidationResult {
  const errors: string[] = []
  const trimmedName = form.name.trim()

  if (!trimmedName) errors.push('Profile name is required.')
  else if (!NAME_PATTERN.test(trimmedName)) {
    errors.push('Profile name may contain only letters, digits, underscores, and hyphens.')
  } else if (mode === 'clone' && trimmedName === originalName) {
    errors.push('Clone must use a different name than the original.')
  } else if (mode !== 'edit' && existingNames.includes(trimmedName)) {
    errors.push(`A profile named "${trimmedName}" already exists.`)
  }

  if (!form.region) errors.push('Region is required.')
  if (!form.output) errors.push('Output is required.')

  if (kind === 'iam-keys') {
    if (!form.accessKeyId.trim()) errors.push('Access Key ID is required for IAM Keys profiles.')
    if (!form.secretAccessKey.trim()) errors.push('Secret Access Key is required for IAM Keys profiles.')
  }
  if (kind === 'sso') {
    if (!form.ssoStartUrl.trim()) errors.push('SSO Start URL is required.')
    if (!form.ssoAccountId.trim()) errors.push('SSO Account ID is required.')
    if (!form.ssoRoleName.trim()) errors.push('SSO Role Name is required.')
  }
  if (kind === 'assume-role') {
    if (!form.roleArn.trim()) errors.push('Role ARN is required for assume-role profiles.')
    if (!form.sourceProfile.trim()) errors.push('Source profile is required for assume-role profiles.')
  }

  return { ok: errors.length === 0, errors }
}

export function ProfileWizard({
  mode,
  profile,
  existingNames,
  onSave,
  onCancel
}: ProfileWizardProps) {
  const [step, setStep] = useState<0 | 1 | 2>(mode === 'add' ? 0 : 1)
  const [kind, setKind] = useState<ProfileKind>(() => detectKind(profile))
  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'edit') return profileToForm(profile)
    if (mode === 'clone') return profileToForm(profile, '-copy')
    return EMPTY_FORM
  })
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Reset on profile change (e.g., user opens dialog for a different profile without unmounting)
  useEffect(() => {
    if (mode === 'edit') setForm(profileToForm(profile))
    else if (mode === 'clone') setForm(profileToForm(profile, '-copy'))
    setKind(detectKind(profile))
    setStep(mode === 'add' ? 0 : 1)
  }, [profile, mode])

  const baseline = useMemo(() => (mode === 'edit' ? profileToBaseline(profile) : null), [
    mode,
    profile
  ])

  const validation = useMemo(
    () => validate(form, kind, mode, existingNames, profile?.name ?? null),
    [form, kind, mode, existingNames, profile?.name]
  )

  const diff = useMemo(() => computeDiff(baseline, form), [baseline, form])

  const isEdit = mode === 'edit'
  const titlePrefix = mode === 'add' ? 'Add' : mode === 'edit' ? 'Edit' : 'Duplicate'
  const kindMeta = KIND_META.find((k) => k.kind === kind) ?? KIND_META[0]

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleNext = () => {
    if (step === 0) setStep(1)
    else if (step === 1 && validation.ok) setStep(2)
  }

  const handleBack = () => {
    if (step === 2) setStep(1)
    else if (step === 1 && mode === 'add') setStep(0)
  }

  const handleConfirm = async () => {
    if (!validation.ok) return
    setBusy(true)
    setSubmitError(null)
    try {
      await onSave(formToPayload(form), isEdit)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-form-overlay" onClick={busy ? undefined : onCancel}>
      <form
        className="profile-form profile-wizard"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (step === 2) handleConfirm()
          else handleNext()
        }}
      >
        <div className="wizard-header">
          <h2>
            {mode === 'add' && step === 0 ? 'Add Profile' : `${titlePrefix}: ${kindMeta.title}`}
          </h2>
          <ol className="wizard-steps" aria-label="Wizard steps">
            {mode === 'add' && (
              <li className={step === 0 ? 'current' : step > 0 ? 'done' : ''}>1. Type</li>
            )}
            <li className={step === 1 ? 'current' : step > 1 ? 'done' : ''}>
              {mode === 'add' ? '2' : '1'}. Details
            </li>
            <li className={step === 2 ? 'current' : ''}>{mode === 'add' ? '3' : '2'}. Review</li>
          </ol>
        </div>

        {mode === 'clone' && (
          <div className="wizard-banner">
            Cloning <strong>{profile?.name}</strong>. All fields are pre-filled — adjust before saving.
          </div>
        )}

        {step === 0 && (
          <KindPicker selected={kind} onSelect={setKind} onAdvance={() => setStep(1)} />
        )}

        {step === 1 && (
          <KindForm
            kind={kind}
            form={form}
            isEdit={isEdit}
            onUpdate={update}
            errors={validation.errors}
          />
        )}

        {step === 2 && <ReviewStep mode={mode} kindLabel={kindMeta.title} diff={diff} />}

        {submitError && (
          <div className="rename-validation" role="alert">
            {submitError}
          </div>
        )}

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <div className="wizard-actions-right">
            {(step === 2 || (step === 1 && mode === 'add')) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={busy}
              >
                Back
              </button>
            )}
            {step < 2 && (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={(step === 1 && !validation.ok) || busy}
              >
                Next
              </button>
            )}
            {step === 2 && (
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

interface KindPickerProps {
  selected: ProfileKind
  onSelect: (k: ProfileKind) => void
  onAdvance: () => void
}

function KindPicker({ selected, onSelect, onAdvance }: KindPickerProps) {
  return (
    <div className="kind-picker">
      <p className="wizard-helper">What kind of profile do you want to create?</p>
      <div className="kind-grid">
        {KIND_META.map((meta) => (
          <button
            key={meta.kind}
            type="button"
            className={`kind-card ${selected === meta.kind ? 'selected' : ''}`}
            onClick={() => onSelect(meta.kind)}
            onDoubleClick={() => {
              onSelect(meta.kind)
              onAdvance()
            }}
          >
            <div className="kind-card-title">{meta.title}</div>
            <div className="kind-card-desc">{meta.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

interface KindFormProps {
  kind: ProfileKind
  form: FormState
  isEdit: boolean
  errors: string[]
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

function KindForm({ kind, form, isEdit, errors, onUpdate }: KindFormProps) {
  return (
    <>
      <div className="form-section">
        <h3>General</h3>
        <div className="form-field">
          <label htmlFor="pw-name">Profile Name <span className="required-marker">*</span></label>
          <input
            id="pw-name"
            type="text"
            value={form.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            placeholder="my-profile"
            disabled={isEdit}
            required
            autoFocus={!isEdit}
          />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="pw-region">Region <span className="required-marker">*</span></label>
            <select
              id="pw-region"
              value={form.region}
              onChange={(e) => onUpdate('region', e.target.value)}
              required
            >
              <option value="">Select region…</option>
              {AWS_REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="pw-output">Output <span className="required-marker">*</span></label>
            <select
              id="pw-output"
              value={form.output}
              onChange={(e) => onUpdate('output', e.target.value)}
              required
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="pw-session-duration">Session Duration <span className="optional-marker">(seconds, optional)</span></label>
          <input
            id="pw-session-duration"
            type="text"
            value={form.sessionDuration}
            onChange={(e) => onUpdate('sessionDuration', e.target.value)}
            placeholder="3600"
          />
        </div>
      </div>

      {kind === 'iam-keys' && (
        <div className="form-section">
          <h3>IAM Keys</h3>
          <div className="form-field">
            <label htmlFor="pw-access-key">Access Key ID <span className="required-marker">*</span></label>
            <input
              id="pw-access-key"
              type="text"
              value={form.accessKeyId}
              onChange={(e) => onUpdate('accessKeyId', e.target.value)}
              placeholder="AKIA…"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-secret-key">Secret Access Key <span className="required-marker">*</span></label>
            <input
              id="pw-secret-key"
              type="password"
              value={form.secretAccessKey}
              onChange={(e) => onUpdate('secretAccessKey', e.target.value)}
              placeholder="Secret key"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-session-token">Session Token <span className="optional-marker">(optional)</span></label>
            <input
              id="pw-session-token"
              type="password"
              value={form.sessionToken}
              onChange={(e) => onUpdate('sessionToken', e.target.value)}
              placeholder="Temporary session token"
            />
          </div>
        </div>
      )}

      {kind === 'sso' && (
        <div className="form-section">
          <h3>AWS SSO</h3>
          <div className="form-field">
            <label htmlFor="pw-sso-start-url">SSO Start URL <span className="required-marker">*</span></label>
            <input
              id="pw-sso-start-url"
              type="url"
              value={form.ssoStartUrl}
              onChange={(e) => onUpdate('ssoStartUrl', e.target.value)}
              placeholder="https://my-org.awsapps.com/start"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-sso-region">SSO Region <span className="optional-marker">(defaults to profile region)</span></label>
            <select
              id="pw-sso-region"
              value={form.ssoRegion}
              onChange={(e) => onUpdate('ssoRegion', e.target.value)}
            >
              <option value="">(use profile region)</option>
              {AWS_REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pw-sso-account">SSO Account ID <span className="required-marker">*</span></label>
              <input
                id="pw-sso-account"
                type="text"
                value={form.ssoAccountId}
                onChange={(e) => onUpdate('ssoAccountId', e.target.value)}
                placeholder="123456789012"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="pw-sso-role">SSO Role Name <span className="required-marker">*</span></label>
              <input
                id="pw-sso-role"
                type="text"
                value={form.ssoRoleName}
                onChange={(e) => onUpdate('ssoRoleName', e.target.value)}
                placeholder="DeveloperAccess"
                required
              />
            </div>
          </div>
        </div>
      )}

      {kind === 'assume-role' && (
        <div className="form-section">
          <h3>Role Assumption</h3>
          <div className="form-field">
            <label htmlFor="pw-role-arn">Role ARN <span className="required-marker">*</span></label>
            <input
              id="pw-role-arn"
              type="text"
              value={form.roleArn}
              onChange={(e) => onUpdate('roleArn', e.target.value)}
              placeholder="arn:aws:iam::123456789012:role/MyRole"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-source-profile">Source Profile <span className="required-marker">*</span></label>
            <input
              id="pw-source-profile"
              type="text"
              value={form.sourceProfile}
              onChange={(e) => onUpdate('sourceProfile', e.target.value)}
              placeholder="default"
              required
            />
          </div>
        </div>
      )}

      {kind === 'saml-target' && (
        <div className="form-section">
          <h3>SAML2AWS Target</h3>
          <p className="wizard-helper">
            No additional fields needed — saml2aws will populate credentials on login.
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rename-validation" role="alert">
          <ul className="wizard-errors">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

interface ReviewStepProps {
  mode: WizardMode
  kindLabel: string
  diff: DiffEntry[]
}

function ReviewStep({ mode, kindLabel, diff }: ReviewStepProps) {
  const verb = mode === 'edit' ? 'updated' : 'created'

  return (
    <div className="form-section wizard-review">
      <h3>Review changes</h3>
      <p className="wizard-helper">
        The following <strong>{kindLabel}</strong> profile will be {verb}:
      </p>
      {diff.length === 0 ? (
        <p className="wizard-helper">(no changes)</p>
      ) : (
        <ul className="diff-list">
          {diff.map((entry) => (
            <li key={entry.field} className="diff-entry">
              <span className="diff-field">{entry.field}</span>
              {entry.before === null ? (
                <span className="diff-added">
                  <span className="diff-marker">+</span>
                  <code>{entry.after}</code>
                </span>
              ) : entry.after === null ? (
                <span className="diff-removed">
                  <span className="diff-marker">−</span>
                  <code>{entry.before}</code>
                </span>
              ) : (
                <span className="diff-changed">
                  <code className="diff-before">{entry.before}</code>
                  <span className="diff-arrow">→</span>
                  <code className="diff-after">{entry.after}</code>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
