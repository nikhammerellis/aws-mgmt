export interface AwsProfile {
  name: string
  /**
   * True for the one profile that best answers "which account am I in".
   * Derived from ActiveContext.effective, NOT from AWS_PROFILE alone.
   */
  isActive: boolean
  /** True when this profile holds unexpired temporary credentials right now. */
  isLive: boolean
  /**
   * True for long-lived IAM keys — credentials with no expiry at all. Such a
   * profile can never be `isLive`, so without this the UI would report it as
   * "not logged in" forever and offer a login that does not apply to it.
   */
  isStatic?: boolean
  // From config
  region?: string
  output?: string
  sessionDuration?: string
  roleArn?: string
  sourceProfile?: string
  ssoStartUrl?: string
  ssoRegion?: string
  ssoAccountId?: string
  ssoRoleName?: string
  /** AWS CLI v2 modern SSO: reference to a top-level [sso-session NAME] block. */
  ssoSession?: string
  /** Resolved from the referenced sso-session block (if any), for UX only. */
  ssoSessionStartUrl?: string
  ssoSessionRegion?: string
  /**
   * The IAM role a SAML login should assume for this profile. Either read from
   * `x_saml_role_arn` in ~/.aws/config (an explicit override the user typed) or
   * recovered from the `x_principal_arn` saml2aws wrote after the last login.
   * Absent for profiles that have never authenticated and have no override.
   */
  samlRoleArn?: string
  /** Where `samlRoleArn` came from, so the UI can say so honestly. */
  samlRoleArnSource?: 'config' | 'derived'
  // From credentials
  hasCredentials: boolean
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export type ProfileKind = 'iam-keys' | 'sso' | 'assume-role' | 'saml-target'

export interface NewProfileData {
  name: string
  region?: string
  output?: string
  sessionDuration?: string
  roleArn?: string
  sourceProfile?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  ssoStartUrl?: string
  ssoRegion?: string
  ssoAccountId?: string
  ssoRoleName?: string
  /** Override for the role a SAML login assumes. Written as `x_saml_role_arn`. */
  samlRoleArn?: string
}

export interface ProfileTestSuccess {
  ok: true
  account: string
  arn: string
  userId: string
}

export interface ProfileTestFailure {
  ok: false
  error: string
  hint?: string
}

export type ProfileTestResult = ProfileTestSuccess | ProfileTestFailure

export interface LoginVerification {
  profileName: string
  result: ProfileTestResult
}

/**
 * The honest answer to "which AWS account am I in".
 *
 * Several profiles can hold live credentials at once (one SAML authentication
 * can mint sessions in every client account), so a single string cannot be
 * correct. These fields are deliberately separate because they disagree in
 * normal use, and conflating them is what made the header report "default"
 * while the real session lived on another profile.
 */
export interface ActiveContext {
  /** Profiles holding unexpired temporary credentials, soonest-expiring first. */
  liveProfiles: string[]
  /** Profiles backed by long-lived IAM keys, which never expire and never "log in". */
  staticProfiles: string[]
  /** What this app's own process environment points at. */
  shellProfile: string | null
  /** The persisted OS-level value (HKCU\Environment on Windows, launchctl on macOS). */
  machineDefault: string | null
  /** Profile recorded in ~/.aws/nmd-context.json by the awsgo/awsuse commands. */
  contextProfile: string | null
  /** Single best answer: contextProfile if live, else the sole live profile, else shellProfile. */
  effective: string | null
  /** True when machineDefault names a profile with no live credentials. */
  machineDefaultStale: boolean
}

export interface SwitchResult {
  /** True if the change persists across new shells. False on Linux. */
  persisted: boolean
  /** Platform-specific mechanism used, for surfacing to the user. */
  mechanism: 'setx' | 'launchctl' | 'process-only'
  /** Human-readable reason for a non-persistent switch, if any. */
  note?: string
}

export interface LaunchLoginPayload {
  /**
   * - `sso`          — `aws sso login --profile X`
   * - `saml-target`  — legacy: a ~/.saml2aws section pinned to one AWS profile.
   *                   This is the `awslogin` shape and is left alone.
   * - `saml-role`    — an identity provider fanning out: the IdP block supplies
   *                   the assertion, the AWS profile supplies the role. One
   *                   authentication can mint sessions in many accounts.
   */
  kind: 'sso' | 'saml-target' | 'saml-role'
  profileName: string
  samlSection?: string
  /** `saml-role` only: the IAM role ARN to assume. Validated at the boundary. */
  roleArn?: string
  /** `saml-role` only: region to pass through, so multi-region setups land right. */
  region?: string
  /** `saml-role` only: requested session length in seconds. */
  sessionDuration?: string
  /**
   * True when the SAML profile has `role_arn` set in ~/.saml2aws. Drives
   * whether the launcher appends `--skip-prompt` to the saml2aws command.
   * When role_arn is unset, we MUST keep the interactive role picker so
   * first-time logins don't hang (saml2aws has no fallback resolution for
   * role selection once --skip-prompt suppresses the TTY picker).
   */
  hasRoleArn?: boolean
}

export interface ProfileExpiry {
  profileName: string
  expiresAt: string
  source: 'sso' | 'saml2aws'
  /**
   * Live session identity, parsed from ~/.aws/credentials when a saml2aws
   * login is active. These reflect the *actual* authenticated session, which
   * can differ from the statically-configured profile (e.g. logged into
   * us-east-1 while the config region is us-west-2).
   */
  account?: string
  /** Live session region (the `region` key written at login). */
  region?: string
  /** Assumed-role name parsed from x_principal_arn, e.g. `Admin-Konnect`. */
  role?: string
}

export type ShellFlavor = 'bash' | 'zsh' | 'fish' | 'pwsh' | 'cmd'

export interface ShellHint {
  flavor: ShellFlavor
  exportLineTemplate: string
}

export type RenameValidationError =
  | 'empty'
  | 'same'
  | 'conflict'
  | 'default-disallowed'
  | 'invalid-chars'
  | 'not-found'

export interface RenameImpact {
  oldName: string
  newName: string
  isDefault: boolean
  configExists: boolean
  credentialsExists: boolean
  isActive: boolean
  sourceProfileDependents: string[]
  samlDependents: string[]
  cliCacheFiles: string[]
  conflict: boolean
  validationError: RenameValidationError | null
}

export interface RenameOptions {
  rewriteSourceProfileDependents: boolean
  rewriteSamlDependents: boolean
  clearCliCache: boolean
  allowDefault?: boolean
}

export interface SamlProfile {
  name: string
  url?: string
  username?: string
  provider?: string
  mfa?: string
  awsUrn?: string
  awsSessionDuration?: string
  awsProfile?: string
  roleArn?: string
  region?: string
  skipVerify?: boolean
}

export interface ElectronAPI {
  // AWS Profiles
  getProfiles(): Promise<AwsProfile[]>
  getAppVersion(): Promise<string>
  getActiveProfile(): Promise<string | null>
  getActiveContext(): Promise<ActiveContext>
  switchProfile(name: string): Promise<SwitchResult>
  addProfile(data: NewProfileData): Promise<void>
  updateProfile(name: string, data: NewProfileData): Promise<void>
  deleteProfile(name: string): Promise<void>
  getRenameImpact(oldName: string, newName: string): Promise<RenameImpact>
  renameProfile(oldName: string, newName: string, options: RenameOptions): Promise<void>
  getShellHint(): Promise<ShellHint>
  launchTerminal(name: string): Promise<void>
  launchLogin(payload: LaunchLoginPayload): Promise<void>
  testProfile(name: string): Promise<ProfileTestResult>
  getProfileExpiries(): Promise<ProfileExpiry[]>
  trackPendingLogin(name: string): Promise<void>
  // SAML Profiles
  getSamlProfiles(): Promise<SamlProfile[]>
  addSamlProfile(data: SamlProfile): Promise<void>
  updateSamlProfile(name: string, data: SamlProfile): Promise<void>
  deleteSamlProfile(name: string): Promise<void>
  // File change events
  onProfilesChanged(callback: () => void): () => void
  onSamlChanged(callback: () => void): () => void
  onLoginVerified(callback: (payload: LoginVerification) => void): () => void
  onExpiriesChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
