export interface AwsProfile {
  name: string
  isActive: boolean
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

export interface LaunchLoginPayload {
  kind: 'sso' | 'saml-target'
  profileName: string
  samlSection?: string
}

export interface ProfileExpiry {
  profileName: string
  expiresAt: string
  source: 'sso' | 'saml2aws'
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
  getActiveProfile(): Promise<string | null>
  switchProfile(name: string): Promise<void>
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
  // SAML Profiles
  getSamlProfiles(): Promise<SamlProfile[]>
  addSamlProfile(data: SamlProfile): Promise<void>
  updateSamlProfile(name: string, data: SamlProfile): Promise<void>
  deleteSamlProfile(name: string): Promise<void>
  // File change events
  onProfilesChanged(callback: () => void): () => void
  onSamlChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
