import { ipcMain } from 'electron'
import { readAwsConfig, writeAwsConfigProfile, deleteAwsConfigProfile } from './services/aws-config'
import { readAwsCredentials, writeAwsCredential, deleteAwsCredential } from './services/aws-credentials'
import { readSamlConfig, writeSamlProfile, deleteSamlProfile } from './services/saml-config'
import { getActiveProfile, switchProfile } from './services/profile-switcher'
import { setWriteLock } from './services/file-watcher'
import { getRenameImpact, renameProfile } from './services/profile-rename'
import {
  detectShellHint,
  launchTerminalWithProfile,
  launchLoginInTerminal,
  type LaunchLoginPayload
} from './services/terminal-launcher'
import { testProfile } from './services/profile-tester'
import { getProfileExpiries } from './services/expiry-tracker'
import type { AwsProfile, NewProfileData, RenameOptions, SamlProfile } from '../renderer/types'

let onProfilesUpdated: (() => void) | null = null

export function setOnProfilesUpdated(callback: () => void): void {
  onProfilesUpdated = callback
}

export function registerIpcHandlers(): void {
  // --- AWS Profiles ---

  ipcMain.handle('get-profiles', async (): Promise<AwsProfile[]> => {
    const [configProfiles, credentials, activeProfile] = await Promise.all([
      readAwsConfig(),
      readAwsCredentials(),
      getActiveProfile()
    ])

    const credMap = new Map(credentials.map((c) => [c.name, c]))
    const allNames = new Set([
      ...configProfiles.map((p) => p.name),
      ...credentials.map((c) => c.name)
    ])

    const profiles: AwsProfile[] = []

    for (const name of allNames) {
      const config = configProfiles.find((p) => p.name === name)
      const cred = credMap.get(name)

      profiles.push({
        name,
        isActive: name === activeProfile,
        region: config?.region,
        output: config?.output,
        sessionDuration: config?.session_duration,
        roleArn: config?.role_arn,
        sourceProfile: config?.source_profile,
        ssoStartUrl: config?.sso_start_url,
        ssoRegion: config?.sso_region,
        ssoAccountId: config?.sso_account_id,
        ssoRoleName: config?.sso_role_name,
        hasCredentials: !!(cred?.aws_access_key_id),
        accessKeyId: cred?.aws_access_key_id,
        secretAccessKey: cred?.aws_secret_access_key,
        sessionToken: cred?.aws_session_token
      })
    }

    profiles.sort((a, b) => {
      if (a.name === 'default') return -1
      if (b.name === 'default') return 1
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      return a.name.localeCompare(b.name)
    })

    return profiles
  })

  ipcMain.handle('get-active-profile', async (): Promise<string | null> => {
    return getActiveProfile()
  })

  ipcMain.handle('switch-profile', async (_event, name: string): Promise<void> => {
    await switchProfile(name)
    onProfilesUpdated?.()
  })

  ipcMain.handle('add-profile', async (_event, data: NewProfileData): Promise<void> => {
    setWriteLock()
    await writeAwsConfigProfile({
      name: data.name,
      region: data.region,
      output: data.output,
      session_duration: data.sessionDuration,
      role_arn: data.roleArn,
      source_profile: data.sourceProfile,
      sso_start_url: data.ssoStartUrl,
      sso_region: data.ssoRegion,
      sso_account_id: data.ssoAccountId,
      sso_role_name: data.ssoRoleName
    })
    if (data.accessKeyId || data.secretAccessKey) {
      await writeAwsCredential({
        name: data.name,
        aws_access_key_id: data.accessKeyId,
        aws_secret_access_key: data.secretAccessKey,
        aws_session_token: data.sessionToken
      })
    }
  })

  ipcMain.handle('update-profile', async (_event, name: string, data: NewProfileData): Promise<void> => {
    setWriteLock()
    await writeAwsConfigProfile({
      name,
      region: data.region,
      output: data.output,
      session_duration: data.sessionDuration,
      role_arn: data.roleArn,
      source_profile: data.sourceProfile,
      sso_start_url: data.ssoStartUrl,
      sso_region: data.ssoRegion,
      sso_account_id: data.ssoAccountId,
      sso_role_name: data.ssoRoleName
    })
    if (data.accessKeyId || data.secretAccessKey) {
      await writeAwsCredential({
        name,
        aws_access_key_id: data.accessKeyId,
        aws_secret_access_key: data.secretAccessKey,
        aws_session_token: data.sessionToken
      })
    }
  })

  ipcMain.handle('delete-profile', async (_event, name: string): Promise<void> => {
    setWriteLock()
    await deleteAwsConfigProfile(name)
    await deleteAwsCredential(name)
  })

  ipcMain.handle('get-rename-impact', async (_event, oldName: string, newName: string) => {
    return getRenameImpact(oldName, newName)
  })

  ipcMain.handle('rename-profile', async (
    _event,
    oldName: string,
    newName: string,
    options: RenameOptions
  ): Promise<void> => {
    await renameProfile(oldName, newName, options)
    onProfilesUpdated?.()
  })

  ipcMain.handle('get-shell-hint', () => detectShellHint())

  ipcMain.handle('launch-terminal', async (_event, name: string): Promise<void> => {
    await launchTerminalWithProfile(name)
  })

  ipcMain.handle('launch-login', async (_event, payload: LaunchLoginPayload): Promise<void> => {
    await launchLoginInTerminal(payload)
  })

  ipcMain.handle('test-profile', async (_event, name: string) => {
    return testProfile(name)
  })

  ipcMain.handle('get-profile-expiries', () => getProfileExpiries())

  // --- SAML Profiles ---

  ipcMain.handle('get-saml-profiles', async (): Promise<SamlProfile[]> => {
    const entries = await readSamlConfig()
    return entries.map((entry) => ({
      name: entry.name,
      url: entry.url,
      username: entry.username,
      provider: entry.provider,
      mfa: entry.mfa,
      awsUrn: entry.aws_urn,
      awsSessionDuration: entry.aws_session_duration,
      awsProfile: entry.aws_profile,
      roleArn: entry.role_arn,
      region: entry.region,
      skipVerify: entry.skip_verify === 'true'
    }))
  })

  ipcMain.handle('add-saml-profile', async (_event, data: SamlProfile): Promise<void> => {
    setWriteLock()
    await writeSamlProfile(samlProfileToEntry(data))
  })

  ipcMain.handle('update-saml-profile', async (_event, name: string, data: SamlProfile): Promise<void> => {
    setWriteLock()
    // If name changed, delete old first
    if (data.name !== name) {
      await deleteSamlProfile(name)
    }
    await writeSamlProfile(samlProfileToEntry(data))
  })

  ipcMain.handle('delete-saml-profile', async (_event, name: string): Promise<void> => {
    setWriteLock()
    await deleteSamlProfile(name)
  })
}

function samlProfileToEntry(profile: SamlProfile): { name: string; [key: string]: string } {
  const entry: { name: string; [key: string]: string } = { name: profile.name }
  if (profile.url) entry.url = profile.url
  if (profile.username) entry.username = profile.username
  if (profile.provider) entry.provider = profile.provider
  if (profile.mfa) entry.mfa = profile.mfa
  if (profile.awsUrn) entry.aws_urn = profile.awsUrn
  if (profile.awsSessionDuration) entry.aws_session_duration = profile.awsSessionDuration
  if (profile.awsProfile) entry.aws_profile = profile.awsProfile
  if (profile.roleArn) entry.role_arn = profile.roleArn
  if (profile.region) entry.region = profile.region
  if (profile.skipVerify !== undefined) entry.skip_verify = String(profile.skipVerify)
  return entry
}
