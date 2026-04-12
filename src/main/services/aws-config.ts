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
}

function profileToSection(name: string): string {
  return name === 'default' ? 'default' : `profile ${name}`
}

function sectionToName(section: string): string | null {
  if (section === 'default') return 'default'
  if (section.startsWith('profile ')) return section.slice('profile '.length)
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
      sso_role_name: values.sso_role_name
    })
  }

  return profiles
}

export async function writeAwsConfigProfile(profile: ConfigProfile): Promise<void> {
  await backupFile(getAwsConfigPath())
  const data = await readIniFile(getAwsConfigPath())
  const section = profileToSection(profile.name)

  const values: Record<string, string> = {}
  if (profile.region) values.region = profile.region
  if (profile.output) values.output = profile.output
  if (profile.session_duration) values.session_duration = profile.session_duration
  if (profile.role_arn) values.role_arn = profile.role_arn
  if (profile.source_profile) values.source_profile = profile.source_profile
  if (profile.sso_start_url) values.sso_start_url = profile.sso_start_url
  if (profile.sso_region) values.sso_region = profile.sso_region
  if (profile.sso_account_id) values.sso_account_id = profile.sso_account_id
  if (profile.sso_role_name) values.sso_role_name = profile.sso_role_name

  data[section] = values
  await writeIniFile(getAwsConfigPath(), data)
}

export async function deleteAwsConfigProfile(name: string): Promise<void> {
  await backupFile(getAwsConfigPath())
  const data = await readIniFile(getAwsConfigPath())
  const section = profileToSection(name)
  delete data[section]
  await writeIniFile(getAwsConfigPath(), data)
}
