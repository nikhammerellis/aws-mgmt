import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import { getSamlConfigPath } from '../utils/paths'
import { backupFile } from './backup'

export interface SamlEntry {
  name: string
  [key: string]: string
}

/**
 * Keys the UI owns and will explicitly clear when their form field is empty.
 * Any other key present on disk (`skip_prompt`, `disable_keychain`,
 * `credentials_file`, `saml_cache_file`, `target_url`, `http_attempts_count`,
 * `okta_token_key`, etc.) is preserved across writes.
 */
const MANAGED_SAML_KEYS = [
  'url',
  'username',
  'provider',
  'mfa',
  'aws_urn',
  'aws_session_duration',
  'aws_profile',
  'role_arn',
  'region',
  'skip_verify'
] as const

export async function readSamlConfig(): Promise<SamlEntry[]> {
  const data = await readIniFile(getSamlConfigPath())
  const entries: SamlEntry[] = []

  for (const [section, values] of Object.entries(data)) {
    entries.push({ name: section, ...values })
  }

  return entries
}

export async function writeSamlProfile(entry: SamlEntry): Promise<void> {
  await backupFile(getSamlConfigPath())
  const data = await readIniFile(getSamlConfigPath())
  const { name, ...incoming } = entry

  const existing = data[name] ?? {}
  const merged: Record<string, string> = { ...existing }

  // Apply managed keys. For each managed key: set if the incoming value is
  // a non-empty string, clear otherwise. Keys not in the managed set are
  // preserved from existing.
  for (const key of MANAGED_SAML_KEYS) {
    const value = incoming[key]
    if (typeof value === 'string' && value.length > 0) {
      merged[key] = value
    } else {
      delete merged[key]
    }
  }

  // Also carry over any non-managed keys the caller explicitly included
  // (unusual but possible via ipc-handlers samlProfileToEntry — currently
  // it only passes managed keys, so this is defensive).
  for (const [key, value] of Object.entries(incoming)) {
    if ((MANAGED_SAML_KEYS as readonly string[]).includes(key)) continue
    if (typeof value === 'string' && value.length > 0) {
      merged[key] = value
    }
  }

  data[name] = merged
  await writeIniFile(getSamlConfigPath(), data, { mode: 0o600 })
}

export async function deleteSamlProfile(name: string): Promise<void> {
  await backupFile(getSamlConfigPath())
  const data = await readIniFile(getSamlConfigPath())
  delete data[name]
  await writeIniFile(getSamlConfigPath(), data, { mode: 0o600 })
}
