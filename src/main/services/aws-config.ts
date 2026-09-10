import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import { getAwsConfigPath } from '../utils/paths'
import { backupFile } from './backup'

export interface ConfigProfile {
  name: string
  region?: string
  output?: string
  session_duration?: string
  role_arn?: string
  source_profile?: string
  sso_start_url?: string
  sso_region?: string
  sso_account_id?: string
  sso_role_name?: string
  /**
   * Reference to a top-level [sso-session NAME] block (AWS CLI v2 modern SSO).
   * When set, sso_start_url / sso_region are looked up from that block rather
   * than being inline on the profile.
   */
  sso_session?: string
  /**
   * App-owned extension key: the IAM role a SAML login should assume for this
   * profile. Not an AWS CLI setting — the CLI ignores unknown keys. Stored
   * here rather than as `role_arn` because a `role_arn` with no
   * `source_profile` makes the CLI fail to resolve the profile entirely.
   */
  x_saml_role_arn?: string
}

export interface SsoSession {
  name: string
  sso_start_url?: string
  sso_region?: string
  sso_registration_scopes?: string
}

/**
 * Keys the UI owns and will explicitly set or clear on save. Any key NOT in
 * this set is preserved as-is across writes — this is how we avoid nuking
 * `credential_process`, `mfa_serial`, `external_id`, `role_session_name`,
 * `ca_bundle`, `endpoint_url`, and other real-world fields the wizard
 * doesn't expose.
 */
const MANAGED_PROFILE_KEYS = [
  'region',
  'output',
  'session_duration',
  'role_arn',
  'source_profile',
  'sso_start_url',
  'sso_region',
  'sso_account_id',
  'sso_role_name',
  'sso_session',
  // Not an AWS CLI key. saml2aws already writes `x_`-prefixed extension keys
  // into ~/.aws/credentials (x_principal_arn, x_security_token_expires), so
  // this follows an established convention in the same file family: the AWS
  // CLI ignores keys it does not know, and the role stays next to the profile
  // it belongs to rather than in a separate app-owned store. Storing it as a
  // plain `role_arn` is NOT an option — that would make the CLI treat the
  // profile as an assume-role profile with no source_profile, which errors.
  'x_saml_role_arn'
] as const

function profileToSection(name: string): string {
  return name === 'default' ? 'default' : `profile ${name}`
}

function sectionToName(section: string): string | null {
  if (section === 'default') return 'default'
  if (section.startsWith('profile ')) return section.slice('profile '.length)
  return null
}

function sectionToSsoSessionName(section: string): string | null {
  if (section.startsWith('sso-session ')) return section.slice('sso-session '.length)
  return null
}

export async function readAwsConfig(): Promise<ConfigProfile[]> {
  const data = await readIniFile(getAwsConfigPath())
  const profiles: ConfigProfile[] = []

  for (const [section, values] of Object.entries(data)) {
    const name = sectionToName(section)
    if (name === null) continue

    profiles.push({
      name,
      region: values.region,
      output: values.output,
      session_duration: values.session_duration,
      role_arn: values.role_arn,
      source_profile: values.source_profile,
      sso_start_url: values.sso_start_url,
      sso_region: values.sso_region,
      sso_account_id: values.sso_account_id,
      sso_role_name: values.sso_role_name,
      sso_session: values.sso_session,
      x_saml_role_arn: values.x_saml_role_arn
    })
  }

  return profiles
}

/**
 * Read top-level `[sso-session NAME]` blocks. AWS CLI v2 uses these to
 * centralize SSO start-url/region so multiple profiles can share a login.
 * Profiles reference them via `sso_session = NAME`.
 */
export async function readSsoSessions(): Promise<SsoSession[]> {
  const data = await readIniFile(getAwsConfigPath())
  const sessions: SsoSession[] = []

  for (const [section, values] of Object.entries(data)) {
    const name = sectionToSsoSessionName(section)
    if (name === null) continue

    sessions.push({
      name,
      sso_start_url: values.sso_start_url,
      sso_region: values.sso_region,
      sso_registration_scopes: values.sso_registration_scopes
    })
  }

  return sessions
}

export async function writeAwsConfigProfile(profile: ConfigProfile): Promise<void> {
  await backupFile(getAwsConfigPath())
  const data = await readIniFile(getAwsConfigPath())
  const section = profileToSection(profile.name)

  // Start from the existing section so unknown keys (credential_process,
  // mfa_serial, external_id, etc.) survive edits.
  const existing = data[section] ?? {}
  const merged: Record<string, string> = { ...existing }

  // Apply UI-managed keys: set when truthy, remove when cleared.
  for (const key of MANAGED_PROFILE_KEYS) {
    const value = profile[key]
    if (value && value.length > 0) {
      merged[key] = value
    } else {
      delete merged[key]
    }
  }

  data[section] = merged
  await writeIniFile(getAwsConfigPath(), data)
}

export async function deleteAwsConfigProfile(name: string): Promise<void> {
  await backupFile(getAwsConfigPath())
  const data = await readIniFile(getAwsConfigPath())
  const section = profileToSection(name)
  delete data[section]
  await writeIniFile(getAwsConfigPath(), data)
}
